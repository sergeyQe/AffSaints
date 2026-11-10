"""Аналитика, вкладка «Учёт времени»: работа и правки, ожидание в пуле и на проверке, сроки.

Время работы и правок — по отрезкам task_work_intervals (вид work / revision), за тем, кто работал.
Ожидание в статусах восстанавливается из истории: каждая смена статуса пишет событие с to_status,
отрезок статуса длится до следующей смены (LEAD по событиям задачи).
Ожидание проверки засчитывается тому, кто фактически принял работу — автору перехода в «Готово».
Период — по дате принятия задачи; сроки — по дедлайну (решение №17).
"""

from collections import defaultdict
from datetime import datetime
from typing import Literal

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.task import Task, TaskEvent, TaskStatus, WorkInterval, WorkKind
from app.schemas.analytics import (
    AnalyticsQuery,
    CreativeTime,
    OverdueRow,
    OverdueStats,
    ReviewWaitRow,
    TaskTime,
    TimeOut,
    TimeTiles,
    WaitingNow,
)
from app.schemas.user import UserBrief
from app.services.analytics_common import (
    avg_or_none,
    between,
    done_in_period,
    overdue_now,
    seconds,
    task_filters,
    truncate,
    user_briefs,
)
from app.services.task_queries import is_late, is_late_sql

_REVIEW = TaskStatus.REVIEW.value
_NEW = TaskStatus.NEW.value


def _deadline_state(
    submitted_at: datetime | None, deadline: datetime | None
) -> Literal["on_time", "late", "none"]:
    if submitted_at is None or deadline is None:
        return "none"
    # Правило опоздания — общее с карточкой задачи
    return "late" if is_late(submitted_at, deadline) else "on_time"


# id задач передаются подзапросом, а не списком: за длинный период их могут быть десятки тысяч
TaskIds = Select[int]


async def _status_waits(session: AsyncSession, task_ids: TaskIds) -> dict[int, dict[str, int]]:
    """Сколько секунд задача провела в «На проверке» и в «Новых» (все отрезки, включая возвраты)."""
    # Отрезок статуса: от смены статуса до следующей смены той же задачи
    order = (TaskEvent.created_at, TaskEvent.id)
    segments = (
        select(
            TaskEvent.task_id,
            TaskEvent.to_status,
            TaskEvent.created_at.label("started"),
            func.lead(TaskEvent.created_at)
            .over(partition_by=TaskEvent.task_id, order_by=order)
            .label("ended"),
        )
        .where(TaskEvent.to_status.is_not(None), TaskEvent.task_id.in_(task_ids))
        .subquery()
    )
    # Сумма закрытых отрезков «На проверке» и «Новые» по каждой задаче
    rows = await session.execute(
        select(
            segments.c.task_id,
            segments.c.to_status,
            func.sum(seconds(segments.c.ended - segments.c.started)),
        )
        .where(segments.c.ended.is_not(None), segments.c.to_status.in_([_REVIEW, _NEW]))
        .group_by(segments.c.task_id, segments.c.to_status)
    )
    waits: dict[int, dict[str, int]] = defaultdict(dict)
    for task_id, status, secs in rows:
        waits[task_id][status] = round(float(secs or 0))
    return waits


async def _acceptors(session: AsyncSession, task_ids: TaskIds) -> dict[int, int | None]:
    """Кто фактически принял работу: автор последнего перехода в «Готово» (кнопка или перенос)."""
    rows = await session.execute(
        select(TaskEvent.task_id, TaskEvent.actor_id)
        .where(TaskEvent.task_id.in_(task_ids), TaskEvent.to_status == TaskStatus.DONE.value)
        .ext(distinct_on(TaskEvent.task_id))
        .order_by(TaskEvent.task_id, TaskEvent.created_at.desc(), TaskEvent.id.desc())
    )
    return dict(rows.all())


async def _work(session: AsyncSession, task_ids: TaskIds) -> list[tuple[int, int, str, int]]:
    """Закрытые отрезки работы: задача × исполнитель × вид (работа / правки) → секунды."""
    rows = await session.execute(
        select(
            WorkInterval.task_id,
            WorkInterval.user_id,
            WorkInterval.kind,
            func.sum(seconds(WorkInterval.ended_at - WorkInterval.started_at)),
        )
        .where(WorkInterval.task_id.in_(task_ids), WorkInterval.ended_at.is_not(None))
        .group_by(WorkInterval.task_id, WorkInterval.user_id, WorkInterval.kind)
    )
    return [(tid, uid, kind, round(float(secs or 0))) for tid, uid, kind, secs in rows]


async def _waiting_now(session: AsyncSession, q: AnalyticsQuery, now: datetime) -> WaitingNow:
    # Сейчас на проверке: с какого момента ждёт каждая (последний переход в «На проверке»)
    rows = (
        await session.execute(
            select(Task.id, func.max(TaskEvent.created_at))
            .join(TaskEvent, TaskEvent.task_id == Task.id)
            .where(Task.status == _REVIEW, TaskEvent.to_status == _REVIEW, *task_filters(q))
            .group_by(Task.id)
        )
    ).all()
    if not rows:
        return WaitingNow(count=0, oldest_task_id=None, oldest_seconds=None)
    oldest_id, since = min(rows, key=lambda r: r[1])
    return WaitingNow(
        count=len(rows),
        oldest_task_id=oldest_id,
        oldest_seconds=max(0, round((now - since).total_seconds())),
    )


async def _overdue(
    session: AsyncSession, q: AnalyticsQuery, now: datetime, users: dict[int, UserBrief]
) -> OverdueStats:
    f = task_filters(q, by_assignee=False)

    # Сданные — за исполнителем на момент первой сдачи (его могли сменить позже;
    # сдачу переносом руководителя тоже засчитываем исполнителю), несданные — за текущим
    submitted = Task.first_submitted_at.is_not(None)
    kind = case(
        (is_late_sql(), "late"),
        (submitted, "on_time"),
        else_="missed",
    )
    executor = case((submitted, Task.first_submitted_by_id), else_=Task.assignee_id)
    # Дедлайн в периоде: у сданных — дедлайн на момент первой сдачи, у несданных — текущий и уже прошёл
    in_period = or_(
        and_(submitted, between(Task.deadline_at_first_submit, q)),
        and_(~submitted, between(Task.deadline, q), Task.deadline < now),
    )
    classified = (
        select(kind.label("kind"), executor.label("user_id"))
        .select_from(Task)
        .where(Task.status != TaskStatus.CANCELLED.value, in_period, *f)
        .subquery()
    )
    query = select(classified.c.user_id, classified.c.kind, func.count()).group_by(
        classified.c.user_id, classified.c.kind
    )
    if q.creative_id is not None:
        query = query.where(classified.c.user_id == q.creative_id)

    per_user: dict[int | None, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    totals: dict[str, int] = defaultdict(int)
    for user_id, k, cnt in await session.execute(query):
        per_user[user_id][k] += int(cnt)
        totals[k] += int(cnt)

    # Текущие просрочки — за текущим исполнителем (None — задачу ещё не взяли)
    current_query = (
        select(Task.assignee_id, func.count())
        .where(overdue_now(now), *f)
        .group_by(Task.assignee_id)
    )
    if q.creative_id is not None:
        current_query = current_query.where(Task.assignee_id == q.creative_id)
    current = dict((await session.execute(current_query)).all())

    rows = [
        OverdueRow(
            user=users.get(uid) if uid is not None else None,
            on_time=per_user[uid]["on_time"],
            late=per_user[uid]["late"],
            missed=per_user[uid]["missed"],
            current=int(current.get(uid, 0)),
        )
        for uid in set(per_user) | set(current)
    ]
    # Сначала исполнители по имени, строка «не взята» (user=None) — в конце
    rows.sort(key=lambda r: (r.user is None, r.user.full_name if r.user else ""))

    resolved = totals["on_time"] + totals["late"] + totals["missed"]
    return OverdueStats(
        on_time=totals["on_time"],
        late=totals["late"],
        missed=totals["missed"],
        late_rate=None
        if resolved == 0
        else round((totals["late"] + totals["missed"]) / resolved, 4),
        current=sum(int(v) for v in current.values()),
        by_executor=rows,
    )


async def build_time(session: AsyncSession, q: AnalyticsQuery) -> TimeOut:
    now = clock.now()
    users = await user_briefs(session)

    # Задачи, принятые в периоде. Фильтр креативщика — не только по исполнителю: его время
    # в задачах, переназначенных потом другому, иначе пропало бы из «По креативщикам»
    conds = [done_in_period(q), *task_filters(q, by_assignee=False)]
    if q.creative_id is not None:
        worked = select(WorkInterval.task_id).where(WorkInterval.user_id == q.creative_id)
        conds.append(or_(Task.assignee_id == q.creative_id, Task.id.in_(worked)))
    in_period = tuple(conds)

    # Свежие сверху; только нужные колонки, без связей
    tasks = (
        await session.execute(
            select(
                Task.id,
                Task.offer,
                Task.geo,
                Task.assignee_id,
                Task.completed_at,
                Task.revision_count,
                Task.first_submitted_at,
                Task.deadline_at_first_submit,
            )
            .where(*in_period)
            .order_by(Task.completed_at.desc())
        )
    ).all()
    ids = select(Task.id).where(*in_period)
    waits = await _status_waits(session, ids)
    acceptors = await _acceptors(session, ids)
    work_rows = await _work(session, ids)

    # Работа и правки: по задаче и по тому, кто работал
    task_secs: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    user_secs: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    user_tasks: dict[int, set[int]] = defaultdict(set)
    for task_id, user_id, kind, secs in work_rows:
        task_secs[task_id][kind] += secs
        user_secs[user_id][kind] += secs
        user_tasks[user_id].add(task_id)

    work, revision = WorkKind.WORK.value, WorkKind.REVISION.value
    by_task = [
        TaskTime(
            task_id=t.id,
            offer=t.offer,
            geo=t.geo,
            user=users.get(t.assignee_id) if t.assignee_id is not None else None,
            completed_at=t.completed_at,
            work_seconds=task_secs[t.id][work],
            revision_seconds=task_secs[t.id][revision],
            revision_count=t.revision_count,
            review_wait_seconds=waits.get(t.id, {}).get(_REVIEW, 0),
            pool_wait_seconds=waits.get(t.id, {}).get(_NEW, 0),
            deadline=_deadline_state(t.first_submitted_at, t.deadline_at_first_submit),
        )
        for t in tasks
        # completed_at всегда есть (задача принята в периоде) — проверка только сужает тип
        if t.completed_at is not None
    ]

    # Плитки: средние по принятым задачам; ожидание проверки — по тем, что на ней были
    reviewed = [r.review_wait_seconds for r in by_task if _REVIEW in waits.get(r.task_id, {})]
    tiles = TimeTiles(
        completed=len(by_task),
        avg_work_seconds=avg_or_none([r.work_seconds for r in by_task]),
        avg_revision_seconds=avg_or_none([r.revision_seconds for r in by_task]),
        avg_review_wait_seconds=avg_or_none([float(s) for s in reviewed]),
        avg_pool_wait_seconds=avg_or_none([r.pool_wait_seconds for r in by_task]),
    )

    # По креативщикам: время — за тем, кто работал; принято и правки — за исполнителем задачи
    completed_by: dict[int, list[int]] = defaultdict(list)
    for t in tasks:
        if t.assignee_id is not None:
            completed_by[t.assignee_id].append(t.revision_count)
    creative_ids = set(user_secs) | set(completed_by)
    if q.creative_id is not None:
        creative_ids &= {q.creative_id}
    by_creative = sorted(
        (
            CreativeTime(
                user=users[uid],
                completed=len(completed_by.get(uid, [])),
                work_seconds=user_secs[uid][work],
                revision_seconds=user_secs[uid][revision],
                avg_task_seconds=(
                    round((user_secs[uid][work] + user_secs[uid][revision]) / len(user_tasks[uid]))
                    if user_tasks.get(uid)
                    else None
                ),
                revisions_per_task=(
                    round(sum(completed_by[uid]) / len(completed_by[uid]), 2)
                    if completed_by.get(uid)
                    else None
                ),
            )
            for uid in creative_ids
            if uid in users
        ),
        key=lambda r: r.user.full_name,
    )

    # Ожидание проверки — за тем, кто фактически принял работу
    per_reviewer: dict[int | None, list[int]] = defaultdict(list)
    for r in by_task:
        if _REVIEW in waits.get(r.task_id, {}):
            per_reviewer[acceptors.get(r.task_id)].append(r.review_wait_seconds)
    review_wait = sorted(
        (
            ReviewWaitRow(
                user=users.get(uid) if uid is not None else None,
                tasks=len(values),
                avg_seconds=round(sum(values) / len(values)),
                max_seconds=max(values),
            )
            for uid, values in per_reviewer.items()
        ),
        key=lambda r: (r.user is None, r.user.full_name if r.user else ""),
    )

    # В таблице — последние принятые, не больше лимита; средние выше — по всем
    shown, truncated = truncate(by_task)
    return TimeOut(
        date_from=q.date_from,
        date_to=q.date_to,
        tiles=tiles,
        by_creative=by_creative,
        by_task=shown,
        by_task_truncated=truncated,
        review_wait_by_reviewer=review_wait,
        waiting_now=await _waiting_now(session, q, now),
        overdue=await _overdue(session, q, now, users),
    )
