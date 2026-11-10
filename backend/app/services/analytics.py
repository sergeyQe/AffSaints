"""Аналитика, вкладка «Пользователи и задачи»: сводка, статусы, загрузка, динамика.

Общие фильтры и привязка к периоду — в analytics_common; AI-расходы — в analytics_ai;
время, ожидание и сроки — в analytics_time.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.task import Task, TaskStatus, WorkInterval
from app.models.user import Role, User, UserRole
from app.schemas.analytics import (
    AnalyticsQuery,
    DayPoint,
    OverviewOut,
    StatusCount,
    Summary,
    WorkloadRow,
)
from app.schemas.user import UserBrief
from app.services.analytics_common import (
    ACTIVE,
    between,
    count_tasks,
    done_in_period,
    overdue_now,
    seconds,
    task_filters,
)

# ---------- сводка и статусы ----------


async def _summary(session: AsyncSession, q: AnalyticsQuery, now: datetime) -> Summary:
    f = task_filters(q)
    done = done_in_period(q)
    # Среднее время — на вкладке «Учёт времени»; здесь только количество и правки
    avg_revisions = await session.scalar(select(func.avg(Task.revision_count)).where(done, *f))

    return Summary(
        created=await count_tasks(session, between(Task.created_at, q), *f),
        completed=await count_tasks(session, done, *f),
        cancelled=await count_tasks(
            session,
            Task.status == TaskStatus.CANCELLED.value,
            between(Task.cancelled_at, q),
            *f,
        ),
        active_now=await count_tasks(session, Task.status.in_(ACTIVE), *f),
        overdue_now=await count_tasks(session, overdue_now(now), *f),
        revisions_per_task=None if avg_revisions is None else round(float(avg_revisions), 2),
    )


async def _by_status(session: AsyncSession, q: AnalyticsQuery) -> list[StatusCount]:
    # Задачи, созданные в периоде, — по текущему статусу
    rows = await session.execute(
        select(Task.status, func.count())
        .where(between(Task.created_at, q), *task_filters(q))
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
    f = task_filters(q, by_assignee=False)

    # Текущие активные задачи и креативы по статусам
    active_rows = await session.execute(
        select(Task.assignee_id, Task.status, func.count(), func.sum(Task.quantity))
        .where(Task.status.in_(ACTIVE), Task.assignee_id.is_not(None), *f)
        .group_by(Task.assignee_id, Task.status)
    )
    active: dict[int, dict[str, tuple[int, int]]] = defaultdict(dict)
    for user_id, status, cnt, qty in active_rows:
        if user_id is not None:
            active[user_id][status] = (int(cnt), int(qty or 0))

    # Завершено за период — за исполнителем на момент принятия
    done = done_in_period(q)
    completed = dict(
        (
            await session.execute(
                select(Task.assignee_id, func.count()).where(done, *f).group_by(Task.assignee_id)
            )
        ).all()
    )

    # Среднее чистое время на задачу: отрезки каждого исполнителя по завершённым задачам
    per_task = (
        select(
            WorkInterval.user_id,
            WorkInterval.task_id,
            func.sum(seconds(WorkInterval.ended_at - WorkInterval.started_at)).label("secs"),
        )
        .join(Task, Task.id == WorkInterval.task_id)
        .where(WorkInterval.ended_at.is_not(None), done, *f)
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
        count = {s: stats.get(s, (0, 0))[0] for s in ACTIVE}
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


# ---------- динамика по дням ----------


async def _timeline(session: AsyncSession, q: AnalyticsQuery) -> list[DayPoint]:
    tz = ZoneInfo(q.tz)
    f = task_filters(q)

    async def per_day(col: Any, *conds: ColumnElement[bool]) -> dict[date, int]:
        day = func.date(func.timezone(q.tz, col))
        rows = await session.execute(
            select(day, func.count()).where(between(col, q), *conds, *f).group_by(day)
        )
        return {d: int(c) for d, c in rows}

    created = await per_day(Task.created_at)
    completed = await per_day(Task.completed_at, Task.status == TaskStatus.DONE.value)

    # Все дни периода в часовом поясе пользователя, включая пустые
    first = q.date_from.astimezone(tz).date()
    last = (q.date_to - timedelta(microseconds=1)).astimezone(tz).date()
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    return [DayPoint(day=d, created=created.get(d, 0), completed=completed.get(d, 0)) for d in days]


async def build_overview(session: AsyncSession, q: AnalyticsQuery) -> OverviewOut:
    return OverviewOut(
        date_from=q.date_from,
        date_to=q.date_to,
        summary=await _summary(session, q, clock.now()),
        by_status=await _by_status(session, q),
        workload=await _workload(session, q),
        timeline=await _timeline(session, q),
    )
