"""Чтение задач: поиск, блокировка для изменения, список доски, история, просрочка."""

from datetime import datetime, timedelta

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.errors import NotFound
from app.core.sql import LIKE_ESCAPE, contains_pattern
from app.models.task import BOARD_ORDER, OverdueState, Task, TaskEvent, TaskStatus
from app.schemas.task import TaskFilters


def overdue_state(task: Task, now: datetime) -> OverdueState:
    """Просрочка по первой сдаче (решение №12). Без дедлайна и для отменённых — нет."""
    if task.status == TaskStatus.CANCELLED:
        return "none"
    # Уже сдана: сравниваем с дедлайном, действовавшим в момент первой сдачи
    if task.first_submitted_at is not None:
        deadline = task.deadline_at_first_submit
        return "late" if deadline is not None and task.first_submitted_at > deadline else "none"
    if task.deadline is None:
        return "none"
    return "current" if now > task.deadline else "none"


async def get_task(session: AsyncSession, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise NotFound("task_not_found", "Задача не найдена")
    return task


async def lock_task(session: AsyncSession, task_id: int) -> Task:
    # FOR UPDATE OF tasks: параллельные изменения одной задачи выполняются строго по очереди
    task = await session.scalar(
        select(Task)
        .where(Task.id == task_id)
        .with_for_update(of=Task)
        .execution_options(populate_existing=True)
    )
    if task is None:
        raise NotFound("task_not_found", "Задача не найдена")
    return task


def board_query(filters: TaskFilters, now: datetime) -> Select[Task]:
    query = select(Task)

    # Статусы: явный фильтр — как есть (архив «Готово»/«Отменена»);
    # иначе доска — всё, кроме отменённых, а «Готово» только свежие
    if filters.status:
        query = query.where(Task.status.in_([s.value for s in filters.status]))
    else:
        done_since = now - timedelta(days=filters.done_days)
        query = query.where(
            Task.status != TaskStatus.CANCELLED.value,
            or_(Task.status != TaskStatus.DONE.value, Task.completed_at >= done_since),
        )

    # Простые фильтры
    if filters.assignee_id is not None:
        query = query.where(Task.assignee_id == filters.assignee_id)
    if filters.author_id is not None:
        query = query.where(Task.author_id == filters.author_id)
    if filters.offer:
        query = query.where(Task.offer.ilike(contains_pattern(filters.offer), escape=LIKE_ESCAPE))
    if filters.geo:
        query = query.where(Task.geo.ilike(contains_pattern(filters.geo), escape=LIKE_ESCAPE))
    if filters.priority is not None:
        query = query.where(Task.priority == filters.priority.value)

    # Текущие просрочки: дедлайн прошёл, а первой сдачи ещё не было
    is_overdue_now = and_(
        Task.deadline.is_not(None),
        Task.deadline < now,
        Task.first_submitted_at.is_(None),
        Task.status != TaskStatus.CANCELLED.value,
    )
    if filters.overdue is True:
        query = query.where(is_overdue_now)
    elif filters.overdue is False:
        query = query.where(~is_overdue_now)
    return query.order_by(*BOARD_ORDER)


async def list_tasks(session: AsyncSession, filters: TaskFilters) -> list[Task]:
    return list(await session.scalars(board_query(filters, clock.now())))


async def list_events(session: AsyncSession, task_id: int) -> list[TaskEvent]:
    await get_task(session, task_id)
    result = await session.scalars(
        select(TaskEvent)
        .where(TaskEvent.task_id == task_id)
        .order_by(TaskEvent.created_at, TaskEvent.id)
    )
    return list(result)
