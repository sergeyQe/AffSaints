"""Общее для вкладок аналитики: фильтры, период, подсчёты. Все агрегаты — в PostgreSQL.

Привязка к периоду (решение №17): созданные — по дате создания; завершённые и время работы —
по дате принятия; просрочки — по дедлайну; AI-расходы — по дате записи расхода.
Текущие значения (загрузка, просрочки, ожидание проверки) — на этот момент, без периода.
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql import LIKE_ESCAPE, contains_pattern
from app.models.task import ACTIVE_STATUSES, Task, TaskStatus
from app.models.user import User
from app.schemas.analytics import AnalyticsQuery
from app.schemas.user import UserBrief

ACTIVE = [s.value for s in ACTIVE_STATUSES]

# Предел строк в таблицах «по задачам» — одинаковый для всех вкладок
BY_TASK_LIMIT = 500


def task_filters(q: AnalyticsQuery, *, by_assignee: bool = True) -> list[ColumnElement[bool]]:
    """Фильтры по байеру, офферу и (опционально) исполнителю задачи."""
    conds: list[ColumnElement[bool]] = []
    if q.buyer_id is not None:
        conds.append(Task.author_id == q.buyer_id)
    if q.offer:
        conds.append(Task.offer.ilike(contains_pattern(q.offer), escape=LIKE_ESCAPE))
    if by_assignee and q.creative_id is not None:
        conds.append(Task.assignee_id == q.creative_id)
    return conds


def between(col: Any, q: AnalyticsQuery) -> ColumnElement[bool]:
    result: ColumnElement[bool] = and_(col >= q.date_from, col < q.date_to)
    return result


def seconds(expr: Any) -> Any:
    return func.extract("epoch", expr)


def done_in_period(q: AnalyticsQuery) -> ColumnElement[bool]:
    """Задача принята в периоде — по дате принятия (решение №17)."""
    result: ColumnElement[bool] = and_(
        Task.status == TaskStatus.DONE.value, between(Task.completed_at, q)
    )
    return result


def overdue_now(now: datetime) -> ColumnElement[bool]:
    result: ColumnElement[bool] = and_(
        Task.deadline.is_not(None),
        Task.deadline < now,
        Task.first_submitted_at.is_(None),
        Task.status != TaskStatus.CANCELLED.value,
    )
    return result


async def count_tasks(session: AsyncSession, *conds: ColumnElement[bool]) -> int:
    return int(await session.scalar(select(func.count()).select_from(Task).where(*conds)) or 0)


async def user_briefs(session: AsyncSession) -> dict[int, UserBrief]:
    rows = await session.execute(select(User.id, User.full_name))
    return {uid: UserBrief(id=uid, full_name=name) for uid, name in rows}


def truncate[T](rows: Sequence[T], limit: int = BY_TASK_LIMIT) -> tuple[list[T], bool]:
    """Таблица «по задачам» за длинный период может быть большой: первые limit строк и флаг."""
    return list(rows[:limit]), len(rows) > limit


def avg_or_none(values: Sequence[float]) -> int | None:
    return round(sum(values) / len(values)) if values else None
