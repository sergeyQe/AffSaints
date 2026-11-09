"""Бизнес-логика задач: создание, редактирование, переходы статусов, история и учёт времени.

Каждый переход — одна транзакция: блокировка строки задачи (SELECT ... FOR UPDATE),
проверка прав, смена статуса и timestamp, событие истории, отрезок работы.
"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.errors import AppError, NotFound
from app.models.attachment import AttachmentKind, TaskAttachment
from app.models.task import (
    BOARD_ORDER,
    EventType,
    Task,
    TaskEvent,
    TaskStatus,
    WorkInterval,
    WorkKind,
)
from app.models.user import Role, User
from app.schemas.task import (
    OverdueState,
    TaskCreate,
    TaskFilters,
    TaskUpdate,
)
from app.services.task_permissions import Action, ensure_allowed

# Небольшой допуск на рассинхрон часов клиента при проверке «дедлайн в будущем»
_DEADLINE_TOLERANCE = timedelta(minutes=1)

# Поля ТЗ, изменения которых пишутся в историю
_BRIEF_FIELDS = ("offer", "geo", "creative_type", "quantity", "description", "priority", "deadline")


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


def _user_ref(user: User | None) -> dict[str, Any] | None:
    return None if user is None else {"id": user.id, "full_name": user.full_name}


def _json_value(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _ensure_future_deadline(deadline: datetime | None) -> None:
    if deadline is not None and deadline < clock.now() - _DEADLINE_TOLERANCE:
        raise AppError("deadline_in_past", "Дедлайн не может быть в прошлом")


def add_event(
    session: AsyncSession,
    task: Task,
    actor: User | None,
    event_type: EventType,
    *,
    from_status: str | None = None,
    to_status: str | None = None,
    **payload: Any,
) -> None:
    session.add(
        TaskEvent(
            task_id=task.id,
            actor_id=actor.id if actor else None,
            type=event_type.value,
            from_status=from_status,
            to_status=to_status,
            payload=payload,
            created_at=clock.now(),
        )
    )


async def _open_interval(
    session: AsyncSession, task: Task, user_id: int, kind: WorkKind, now: datetime
) -> None:
    session.add(WorkInterval(task_id=task.id, user_id=user_id, kind=kind.value, started_at=now))


async def _close_interval(session: AsyncSession, task: Task, now: datetime) -> WorkInterval | None:
    interval = await session.scalar(
        select(WorkInterval).where(WorkInterval.task_id == task.id, WorkInterval.ended_at.is_(None))
    )
    if interval is not None:
        interval.ended_at = max(now, interval.started_at)
        # Сразу пишем в БД: уникальный индекс «один открытый отрезок» не должен увидеть два
        await session.flush()
    return interval


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


# ---------- чтение ----------


async def get_task(session: AsyncSession, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise NotFound("task_not_found", "Задача не найдена")
    return task


async def lock_task(session: AsyncSession, task_id: int) -> Task:
    # FOR UPDATE OF tasks: параллельные переходы одной задачи выполняются строго по очереди
    task = await session.scalar(
        select(Task)
        .where(Task.id == task_id)
        .with_for_update(of=Task)
        .execution_options(populate_existing=True)
    )
    if task is None:
        raise NotFound("task_not_found", "Задача не найдена")
    return task


def _filtered_query(filters: TaskFilters, now: datetime) -> Select[Task]:
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
        query = query.where(Task.offer.ilike(f"%{_escape_like(filters.offer)}%", escape="\\"))
    if filters.geo:
        query = query.where(Task.geo.ilike(f"%{_escape_like(filters.geo)}%", escape="\\"))
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


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_tasks(session: AsyncSession, filters: TaskFilters) -> list[Task]:
    return list(await session.scalars(_filtered_query(filters, clock.now())))


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


async def list_events(session: AsyncSession, task_id: int) -> list[TaskEvent]:
    await get_task(session, task_id)
    result = await session.scalars(
        select(TaskEvent)
        .where(TaskEvent.task_id == task_id)
        .order_by(TaskEvent.created_at, TaskEvent.id)
    )
    return list(result)


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
        changes.append({"field": field, "old": _json_value(old), "new": _json_value(new)})
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


async def take(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.TAKE, task, user)

    now = clock.now()
    previous = _set_status(task, TaskStatus.IN_PROGRESS, now)
    task.assignee_id = user.id
    task.assignee = user
    task.taken_at = now
    # Новый исполнитель открывает актуальное ТЗ — старая пометка «ТЗ изменено» не нужна
    task.brief_updated_at = None
    await _open_interval(session, task, user.id, WorkKind.WORK, now)
    add_event(session, task, user, EventType.TAKEN, from_status=previous, to_status=task.status)
    await session.commit()
    return task


async def submit(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.SUBMIT, task, user)

    # Сдать можно только с результатом текущего круга (после правок — с новым)
    if not await _has_result_for_current_round(session, task):
        raise AppError("result_required", "Прикрепите результат работы перед сдачей")

    now = clock.now()
    await _close_interval(session, task, now)
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
    await _open_interval(session, task, task.assignee_id, WorkKind.REVISION, now)
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
    await _close_interval(session, task, now)
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

    # Новый исполнитель: активный креативщик, не автор и не текущий исполнитель
    target = await session.get(User, assignee_id)
    if target is None or not target.is_active or not target.has_role(Role.CREATIVE):
        raise AppError("invalid_assignee", "Исполнителем может быть только активный креативщик")
    if target.id == task.author_id:
        raise AppError("invalid_assignee", "Автор задачи не может быть её исполнителем")
    if target.id == task.assignee_id:
        raise AppError("invalid_assignee", "Этот пользователь уже исполнитель задачи")

    # Открытый отрезок работы закрывается за прежним исполнителем и продолжается за новым
    now = clock.now()
    previous_assignee = task.assignee
    closed = await _close_interval(session, task, now)
    if closed is not None:
        await _open_interval(session, task, target.id, WorkKind(closed.kind), now)
    task.assignee_id = target.id
    task.assignee = target
    task.updated_at = now
    payload: dict[str, Any] = {"from": _user_ref(previous_assignee), "to": _user_ref(target)}
    add_event(session, task, user, EventType.REASSIGNED, **payload)
    await session.commit()
    return task


async def unassign(session: AsyncSession, task_id: int, user: User) -> Task:
    task = await lock_task(session, task_id)
    ensure_allowed(Action.UNASSIGN, task, user)

    # Задача возвращается в общий пул; время прежнего исполнителя сохраняется
    now = clock.now()
    previous_assignee = task.assignee
    await _close_interval(session, task, now)
    previous = _set_status(task, TaskStatus.NEW, now)
    task.assignee_id = None
    task.assignee = None
    payload: dict[str, Any] = {"from": _user_ref(previous_assignee)}
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
