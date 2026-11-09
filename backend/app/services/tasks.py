"""Команды над задачами: создание, редактирование и переходы статусов.

Каждая команда — одна транзакция: блокировка строки задачи (SELECT ... FOR UPDATE),
проверка прав, смена статуса и времени, событие истории, отрезок работы.
Чтение — в task_queries, журнал — в task_history, отрезки работы — в work_intervals.
"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.errors import AppError
from app.models.attachment import AttachmentKind, TaskAttachment
from app.models.task import Action, EventType, Task, TaskStatus, WorkKind
from app.models.user import Role, User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.task_history import add_event, json_value, user_ref
from app.services.task_permissions import ensure_allowed
from app.services.task_queries import lock_task
from app.services.work_intervals import close_interval, open_interval

# Небольшой допуск на рассинхрон часов клиента при проверке «дедлайн в будущем»
_DEADLINE_TOLERANCE = timedelta(minutes=1)

# Поля ТЗ, изменения которых пишутся в историю
_BRIEF_FIELDS = ("offer", "geo", "creative_type", "quantity", "description", "priority", "deadline")


def _ensure_future_deadline(deadline: datetime | None) -> None:
    if deadline is not None and deadline < clock.now() - _DEADLINE_TOLERANCE:
        raise AppError("deadline_in_past", "Дедлайн не может быть в прошлом")


async def _has_result_for_current_round(session: AsyncSession, task: Task) -> bool:
    found = await session.scalar(
        select(TaskAttachment.id)
        .where(
            TaskAttachment.task_id == task.id,
            TaskAttachment.kind == AttachmentKind.RESULT.value,
            TaskAttachment.round == task.revision_count,
            TaskAttachment.deleted_at.is_(None),
        )
        .limit(1)
    )
    return found is not None


def _set_status(task: Task, status: TaskStatus, now: datetime) -> str:
    previous = task.status
    task.status = status.value
    task.updated_at = now
    return previous


# ---------- создание и редактирование ----------


async def create_task(session: AsyncSession, data: TaskCreate, author: User) -> Task:
    _ensure_future_deadline(data.deadline)
    now = clock.now()
    task = Task(
        offer=data.offer,
        geo=data.geo,
        creative_type=data.creative_type.value,
        quantity=data.quantity,
        description=data.description,
        priority=data.priority.value,
        deadline=data.deadline,
        status=TaskStatus.NEW.value,
        author_id=author.id,
        created_at=now,
        updated_at=now,
    )
    session.add(task)
    await session.flush()
    add_event(session, task, author, EventType.CREATED, to_status=TaskStatus.NEW.value)
    await session.commit()
    return task


async def update_task(session: AsyncSession, task_id: int, data: TaskUpdate, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.EDIT, task, user)

    # Собираем diff только по переданным полям
    changes: list[dict[str, Any]] = []
    for field in _BRIEF_FIELDS:
        if field not in data.model_fields_set:
            continue
        new = getattr(data, field)
        new = new.value if hasattr(new, "value") else new
        old = getattr(task, field)
        if old == new:
            continue
        if field == "deadline":
            _ensure_future_deadline(new)
        changes.append({"field": field, "old": json_value(old), "new": json_value(new)})
        setattr(task, field, new)

    if not changes:
        await session.commit()
        return task

    # Правка ТЗ после взятия в работу — пометка для исполнителя
    now = clock.now()
    task.updated_at = now
    if task.assignee_id is not None:
        task.brief_updated_at = now
    add_event(session, task, user, EventType.UPDATED, changes=changes)
    await session.commit()
    return task


# ---------- переходы статусов ----------


async def _validate_assignee(session: AsyncSession, task: Task, assignee_id: int) -> User:
    """Исполнитель: активный креативщик, не автор и не текущий исполнитель."""
    target = await session.get(User, assignee_id)
    if target is None or not target.is_active or not target.has_role(Role.CREATIVE):
        raise AppError("invalid_assignee", "Исполнителем может быть только активный креативщик")
    if target.id == task.author_id:
        raise AppError("invalid_assignee", "Автор задачи не может быть её исполнителем")
    if target.id == task.assignee_id:
        raise AppError("invalid_assignee", "Этот пользователь уже исполнитель задачи")
    return target


def _start_work(session: AsyncSession, task: Task, assignee: User, now: datetime) -> str:
    """Новая задача уходит в работу к исполнителю: статус, время взятия, отрезок работы."""
    previous = _set_status(task, TaskStatus.IN_PROGRESS, now)
    task.assignee_id = assignee.id
    task.assignee = assignee
    task.taken_at = now
    # Новый исполнитель открывает актуальное ТЗ — старая пометка «ТЗ изменено» не нужна
    task.brief_updated_at = None
    open_interval(session, task, assignee.id, WorkKind.WORK, now)
    return previous


async def take(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.TAKE, task, user)

    now = clock.now()
    previous = _start_work(session, task, user, now)
    add_event(session, task, user, EventType.TAKEN, from_status=previous, to_status=task.status)
    await session.commit()
    return task


async def assign(session: AsyncSession, task_id: int, user: User, assignee_id: int) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.ASSIGN, task, user)
    target = await _validate_assignee(session, task, assignee_id)

    # Руководитель отдаёт новую задачу креативщику: как «Взять», но за выбранного исполнителя
    now = clock.now()
    previous = _start_work(session, task, target, now)
    payload: dict[str, Any] = {"to": user_ref(target)}
    add_event(
        session,
        task,
        user,
        EventType.ASSIGNED,
        from_status=previous,
        to_status=task.status,
        **payload,
    )
    await session.commit()
    return task


async def submit(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.SUBMIT, task, user)

    # Сдать можно только с результатом текущего круга (после правок — с новым)
    if not await _has_result_for_current_round(session, task):
        raise AppError("result_required", "Прикрепите результат работы перед сдачей")

    now = clock.now()
    await close_interval(session, task, now)
    is_resubmit = task.status == TaskStatus.REVISION.value
    previous = _set_status(task, TaskStatus.REVIEW, now)
    if task.first_submitted_at is None:
        task.first_submitted_at = now
        task.deadline_at_first_submit = task.deadline
    task.last_submitted_at = now
    add_event(
        session,
        task,
        user,
        EventType.RESUBMITTED if is_resubmit else EventType.SUBMITTED,
        from_status=previous,
        to_status=task.status,
    )
    await session.commit()
    return task


async def accept(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.ACCEPT, task, user)

    now = clock.now()
    previous = _set_status(task, TaskStatus.DONE, now)
    task.completed_at = now
    add_event(session, task, user, EventType.ACCEPTED, from_status=previous, to_status=task.status)
    await session.commit()
    return task


async def request_revision(session: AsyncSession, task_id: int, user: User, comment: str) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.REQUEST_REVISION, task, user)
    assert task.assignee_id is not None  # гарантирует check-constraint статуса

    # Время на правку идёт с момента отправки на правки (решение №11)
    now = clock.now()
    previous = _set_status(task, TaskStatus.REVISION, now)
    task.revision_count += 1
    task.revision_comment = comment
    open_interval(session, task, task.assignee_id, WorkKind.REVISION, now)
    add_event(
        session,
        task,
        user,
        EventType.REVISION_REQUESTED,
        from_status=previous,
        to_status=task.status,
        comment=comment,
        round=task.revision_count,
    )
    await session.commit()
    return task


async def cancel(session: AsyncSession, task_id: int, user: User, reason: str) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.CANCEL, task, user)

    now = clock.now()
    await close_interval(session, task, now)
    previous = _set_status(task, TaskStatus.CANCELLED, now)
    task.cancelled_at = now
    task.cancel_reason = reason
    add_event(
        session,
        task,
        user,
        EventType.CANCELLED,
        from_status=previous,
        to_status=task.status,
        reason=reason,
    )
    await session.commit()
    return task


async def reassign(session: AsyncSession, task_id: int, user: User, assignee_id: int) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.REASSIGN, task, user)
    target = await _validate_assignee(session, task, assignee_id)

    # Открытый отрезок работы закрывается за прежним исполнителем и продолжается за новым
    now = clock.now()
    previous_assignee = task.assignee
    closed = await close_interval(session, task, now)
    if closed is not None:
        open_interval(session, task, target.id, WorkKind(closed.kind), now)
    task.assignee_id = target.id
    task.assignee = target
    task.updated_at = now
    payload: dict[str, Any] = {"from": user_ref(previous_assignee), "to": user_ref(target)}
    add_event(session, task, user, EventType.REASSIGNED, **payload)
    await session.commit()
    return task


async def unassign(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.UNASSIGN, task, user)

    # Задача возвращается в общий пул; время прежнего исполнителя сохраняется
    now = clock.now()
    previous_assignee = task.assignee
    await close_interval(session, task, now)
    previous = _set_status(task, TaskStatus.NEW, now)
    task.assignee_id = None
    task.assignee = None
    payload: dict[str, Any] = {"from": user_ref(previous_assignee)}
    add_event(
        session,
        task,
        user,
        EventType.UNASSIGNED,
        from_status=previous,
        to_status=task.status,
        **payload,
    )
    await session.commit()
    return task
