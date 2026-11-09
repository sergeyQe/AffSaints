"""Отрезки чистой работы креативщика: открыть, закрыть, посчитать сумму."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, WorkInterval, WorkKind


def open_interval(
    session: AsyncSession, task: Task, user_id: int, kind: WorkKind, now: datetime
) -> None:
    session.add(WorkInterval(task_id=task.id, user_id=user_id, kind=kind.value, started_at=now))


async def close_interval(session: AsyncSession, task: Task, now: datetime) -> WorkInterval | None:
    interval = await session.scalar(
        select(WorkInterval).where(WorkInterval.task_id == task.id, WorkInterval.ended_at.is_(None))
    )
    if interval is not None:
        interval.ended_at = max(now, interval.started_at)
        # Сразу пишем в БД: уникальный индекс «один открытый отрезок» не должен увидеть два
        await session.flush()
    return interval


async def work_seconds(session: AsyncSession, task_id: int, now: datetime) -> int:
    """Чистое время работы: сумма отрезков, открытый считается до текущего момента."""
    total = await session.scalar(
        select(
            func.coalesce(
                func.sum(
                    func.extract(
                        "epoch",
                        func.coalesce(WorkInterval.ended_at, now) - WorkInterval.started_at,
                    )
                ),
                0,
            )
        ).where(WorkInterval.task_id == task_id)
    )
    return int(total or 0)
