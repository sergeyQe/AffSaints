"""Журнал задачи: запись событий истории. Одна обязанность — как событие попадает в БД."""

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.task import EventType, Task, TaskEvent
from app.models.user import User


def user_ref(user: User | None) -> dict[str, Any] | None:
    """Снимок пользователя для payload: имя сохраняется на момент события."""
    return None if user is None else {"id": user.id, "full_name": user.full_name}


def json_value(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


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
