"""Аналитика руководителя. Все агрегаты считаются в PostgreSQL.

Привязка к периоду (решение №17): созданные — по дате создания; завершённые и время работы —
по дате принятия; просрочки — по дедлайну; AI-расходы — по дате записи расхода.
Текущая загрузка и текущие просрочки — на этот момент, без периода.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.ai import AiService, AiUsage
from app.models.task import (
    ACTIVE_STATUSES,
    EventType,
    Task,
    TaskEvent,
    TaskStatus,
    WorkInterval,
)
from app.models.user import Role, User, UserRole
from app.schemas.analytics import (
    AiCredits,
    AnalyticsOut,
    AnalyticsQuery,
    DayPoint,
    ExecutorCredits,
    OverdueRow,
    OverdueStats,
    ServiceCredits,
    StatusCount,
    Summary,
    WorkloadRow,
)
from app.schemas.user import UserBrief

_ACTIVE = [s.value for s in ACTIVE_STATUSES]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _task_filters(q: AnalyticsQuery, *, by_assignee: bool = True) -> list[ColumnElement[bool]]:
    """Фильтры по байеру, офферу и (опционально) исполнителю задачи."""
    conds: list[ColumnElement[bool]] = []
    if q.buyer_id is not None:
        conds.append(Task.author_id == q.buyer_id)
    if q.offer:
        conds.append(Task.offer.ilike(f"%{_escape_like(q.offer)}%", escape="\\"))
    if by_assignee and q.creative_id is not None:
        conds.append(Task.assignee_id == q.creative_id)
    return conds


def _between(col: Any, q: AnalyticsQuery) -> ColumnElement[bool]:
    result: ColumnElement[bool] = and_(col >= q.date_from, col < q.date_to)
    return result


def _seconds(expr: Any) -> Any:
    return func.extract("epoch", expr)


def _overdue_now(now: datetime) -> ColumnElement[bool]:
    result: ColumnElement[bool] = and_(
        Task.deadline.is_not(None),
        Task.deadline < now,
        Task.first_submitted_at.is_(None),
        Task.status != TaskStatus.CANCELLED.value,
    )
    return result


async def _count(session: AsyncSession, *conds: ColumnElement[bool]) -> int:
    return int(await session.scalar(select(func.count()).select_from(Task).where(*conds)) or 0)


# ---------- сводка и статусы ----------


async def _summary(session: AsyncSession, q: AnalyticsQuery, now: datetime) -> Summary:
    f = _task_filters(q)
    done_in_period = and_(Task.status == TaskStatus.DONE.value, _between(Task.completed_at, q))

    # Чистое время работы по каждой завершённой задаче — сумма её отрезков
    work = (
        select(
            WorkInterval.task_id,
            func.sum(_seconds(WorkInterval.ended_at - WorkInterval.started_at)).label("secs"),
        )
        .where(WorkInterval.ended_at.is_not(None))
        .group_by(WorkInterval.task_id)
        .subquery()
    )
    avg_work = await session.scalar(
        select(func.avg(func.coalesce(work.c.secs, 0)))
        .select_from(Task)
        .outerjoin(work, work.c.task_id == Task.id)
        .where(done_in_period, *f)
    )
    avg_revisions = await session.scalar(
        select(func.avg(Task.revision_count)).where(done_in_period, *f)
    )

    return Summary(
        created=await _count(session, _between(Task.created_at, q), *f),
        completed=await _count(session, done_in_period, *f),
        cancelled=await _count(
            session,
            Task.status == TaskStatus.CANCELLED.value,
            _between(Task.cancelled_at, q),
            *f,
        ),
        active_now=await _count(session, Task.status.in_(_ACTIVE), *f),
        overdue_now=await _count(session, _overdue_now(now), *f),
        avg_work_seconds=None if avg_work is None else round(float(avg_work)),
        revisions_per_task=None if avg_revisions is None else round(float(avg_revisions), 2),
    )


async def _by_status(session: AsyncSession, q: AnalyticsQuery) -> list[StatusCount]:
    # Задачи, созданные в периоде, — по текущему статусу
    rows = await session.execute(
        select(Task.status, func.count())
        .where(_between(Task.created_at, q), *_task_filters(q))
        .group_by(Task.status)
    )
    counts = dict(rows.all())
    return [StatusCount(status=s, count=counts.get(s.value, 0)) for s in TaskStatus]


# ---------- загрузка ----------


async def _creatives(session: AsyncSession, q: AnalyticsQuery, with_work: set[int]) -> list[User]:
    # Активные креативщики + все, у кого есть работа (даже если их отключили или сняли роль),
    # иначе «зависшие» на таком исполнителе задачи пропали бы из загрузки
    query = (
        select(User)
        .where(
            or_(
                and_(User.is_active, User.role_links.any(UserRole.role == Role.CREATIVE.value)),
                User.id.in_(with_work),
            )
        )
        .order_by(User.full_name)
    )
    if q.creative_id is not None:
        query = query.where(User.id == q.creative_id)
    return list(await session.scalars(query))


async def _workload(session: AsyncSession, q: AnalyticsQuery) -> list[WorkloadRow]:
    f = _task_filters(q, by_assignee=False)

    # Текущие активные задачи и креативы по статусам
    active_rows = await session.execute(
        select(Task.assignee_id, Task.status, func.count(), func.sum(Task.quantity))
        .where(Task.status.in_(_ACTIVE), Task.assignee_id.is_not(None), *f)
        .group_by(Task.assignee_id, Task.status)
    )
    active: dict[int, dict[str, tuple[int, int]]] = defaultdict(dict)
    for user_id, status, cnt, qty in active_rows:
        if user_id is not None:
            active[user_id][status] = (int(cnt), int(qty or 0))

    # Завершено за период — за исполнителем на момент принятия
    done_in_period = and_(Task.status == TaskStatus.DONE.value, _between(Task.completed_at, q))
    completed = dict(
        (
            await session.execute(
                select(Task.assignee_id, func.count())
                .where(done_in_period, *f)
                .group_by(Task.assignee_id)
            )
        ).all()
    )

    # Среднее чистое время на задачу: отрезки каждого исполнителя по завершённым задачам
    per_task = (
        select(
            WorkInterval.user_id,
            WorkInterval.task_id,
            func.sum(_seconds(WorkInterval.ended_at - WorkInterval.started_at)).label("secs"),
        )
        .join(Task, Task.id == WorkInterval.task_id)
        .where(WorkInterval.ended_at.is_not(None), done_in_period, *f)
        .group_by(WorkInterval.user_id, WorkInterval.task_id)
        .subquery()
    )
    avg_work = dict(
        (
            await session.execute(
                select(per_task.c.user_id, func.avg(per_task.c.secs)).group_by(per_task.c.user_id)
            )
        ).all()
    )

    rows = []
    with_work = {uid for uid in (*active, *completed, *avg_work) if uid is not None}
    for user in await _creatives(session, q, with_work):
        stats = active.get(user.id, {})
        count = {s: stats.get(s, (0, 0))[0] for s in _ACTIVE}
        rows.append(
            WorkloadRow(
                user=UserBrief(id=user.id, full_name=user.full_name),
                in_progress=count[TaskStatus.IN_PROGRESS.value],
                review=count[TaskStatus.REVIEW.value],
                revision=count[TaskStatus.REVISION.value],
                active_tasks=sum(count.values()),
                active_creatives=sum(v[1] for v in stats.values()),
                completed_in_period=int(completed.get(user.id, 0)),
                avg_work_seconds=(
                    None if user.id not in avg_work else round(float(avg_work[user.id]))
                ),
            )
        )
    return rows


# ---------- просрочки ----------


async def _overdue(
    session: AsyncSession, q: AnalyticsQuery, now: datetime, users: dict[int, UserBrief]
) -> OverdueStats:
    f = _task_filters(q, by_assignee=False)

    # Кто сдал первым — по истории (исполнителя могли сменить после сдачи)
    first_submitter = (
        select(TaskEvent.task_id, TaskEvent.actor_id)
        .where(TaskEvent.type == EventType.SUBMITTED.value)
        .ext(distinct_on(TaskEvent.task_id))
        .order_by(TaskEvent.task_id, TaskEvent.created_at, TaskEvent.id)
        .subquery()
    )
    submitted = Task.first_submitted_at.is_not(None)
    kind = case(
        (and_(submitted, Task.first_submitted_at > Task.deadline_at_first_submit), "late"),
        (submitted, "on_time"),
        else_="missed",
    )
    executor = case((submitted, first_submitter.c.actor_id), else_=Task.assignee_id)
    # Дедлайн в периоде: у сданных — дедлайн на момент первой сдачи, у несданных — текущий и уже прошёл
    in_period = or_(
        and_(submitted, _between(Task.deadline_at_first_submit, q)),
        and_(~submitted, _between(Task.deadline, q), Task.deadline < now),
    )
    classified = (
        select(kind.label("kind"), executor.label("user_id"))
        .select_from(Task)
        .outerjoin(first_submitter, first_submitter.c.task_id == Task.id)
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
        .where(_overdue_now(now), *f)
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


# ---------- AI-расходы ----------


async def _ai_credits(
    session: AsyncSession, q: AnalyticsQuery, users: dict[int, UserBrief]
) -> AiCredits:
    conds = [_between(AiUsage.created_at, q), *_task_filters(q, by_assignee=False)]
    if q.creative_id is not None:
        conds.append(AiUsage.user_id == q.creative_id)
    base = (
        select()
        .select_from(AiUsage)
        .join(Task, Task.id == AiUsage.task_id)
        .join(AiService, AiService.id == AiUsage.service_id)
    )

    by_service = await session.execute(
        base.add_columns(AiService.id, AiService.name, func.sum(AiUsage.credits))
        .where(*conds)
        .group_by(AiService.id, AiService.name)
        .order_by(func.sum(AiUsage.credits).desc())
    )
    by_executor = await session.execute(
        base.add_columns(AiUsage.user_id, AiService.id, AiService.name, func.sum(AiUsage.credits))
        .where(*conds)
        .group_by(AiUsage.user_id, AiService.id, AiService.name)
        .order_by(AiUsage.user_id, func.sum(AiUsage.credits).desc())
    )

    def num(v: Decimal | None) -> float:
        return float(v or 0)

    return AiCredits(
        by_service=[
            ServiceCredits(service_id=sid, service=name, credits=num(total))
            for sid, name, total in by_service
        ],
        by_executor=[
            ExecutorCredits(user=users[uid], service_id=sid, service=name, credits=num(total))
            for uid, sid, name, total in by_executor
            if uid in users
        ],
    )


# ---------- динамика по дням ----------


async def _timeline(session: AsyncSession, q: AnalyticsQuery) -> list[DayPoint]:
    tz = ZoneInfo(q.tz)
    f = _task_filters(q)

    async def per_day(col: Any, *conds: ColumnElement[bool]) -> dict[date, int]:
        day = func.date(func.timezone(q.tz, col))
        rows = await session.execute(
            select(day, func.count()).where(_between(col, q), *conds, *f).group_by(day)
        )
        return {d: int(c) for d, c in rows}

    created = await per_day(Task.created_at)
    completed = await per_day(Task.completed_at, Task.status == TaskStatus.DONE.value)

    # Все дни периода в часовом поясе пользователя, включая пустые
    first = q.date_from.astimezone(tz).date()
    last = (q.date_to - timedelta(microseconds=1)).astimezone(tz).date()
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    return [DayPoint(day=d, created=created.get(d, 0), completed=completed.get(d, 0)) for d in days]


async def _user_briefs(session: AsyncSession) -> dict[int, UserBrief]:
    rows = await session.execute(select(User.id, User.full_name))
    return {uid: UserBrief(id=uid, full_name=name) for uid, name in rows}


async def build(session: AsyncSession, q: AnalyticsQuery) -> AnalyticsOut:
    now = clock.now()
    users = await _user_briefs(session)
    return AnalyticsOut(
        date_from=q.date_from,
        date_to=q.date_to,
        summary=await _summary(session, q, now),
        by_status=await _by_status(session, q),
        workload=await _workload(session, q),
        overdue=await _overdue(session, q, now, users),
        ai_credits=await _ai_credits(session, q, users),
        timeline=await _timeline(session, q),
    )
