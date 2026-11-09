from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    case,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.user import User


class TaskStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    REVISION = "revision"
    DONE = "done"
    CANCELLED = "cancelled"


# Статусы, в которых задача закрыта и не меняется
CLOSED_STATUSES = frozenset({TaskStatus.DONE, TaskStatus.CANCELLED})
# Статусы, в которых креативщик занят задачей (для загрузки)
ACTIVE_STATUSES = frozenset({TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.REVISION})


class Action(StrEnum):
    """Действия над задачей. Доменное понятие: им пользуются правила доступа, API и схемы."""

    EDIT = "edit"
    CANCEL = "cancel"
    TAKE = "take"
    SUBMIT = "submit"
    ACCEPT = "accept"
    REQUEST_REVISION = "request_revision"
    REASSIGN = "reassign"
    UNASSIGN = "unassign"
    ADD_REFERENCE = "add_reference"
    ADD_RESULT = "add_result"
    MANAGE_AI_USAGE = "manage_ai_usage"


# Состояние просрочки: нет / просрочена сейчас / сдана с опозданием
OverdueState = Literal["none", "current", "late"]


class Priority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


PRIORITY_RANK = {Priority.LOW: 0, Priority.NORMAL: 1, Priority.HIGH: 2, Priority.URGENT: 3}


class CreativeType(StrEnum):
    VIDEO = "video"
    STATIC = "static"
    ANIMATION = "animation"
    UGC = "ugc"
    PLAYABLE = "playable"
    OTHER = "other"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("quantity between 1 and 1000", name="quantity_range"),
        CheckConstraint(
            "status in ('new','in_progress','review','revision','done','cancelled')",
            name="status_valid",
        ),
        CheckConstraint("priority in ('low','normal','high','urgent')", name="priority_valid"),
        # Задача в работе всегда с исполнителем, в «Новых» — без
        CheckConstraint(
            "(status = 'new') = (assignee_id is null) or status in ('done','cancelled')",
            name="assignee_matches_status",
        ),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_assignee_id", "assignee_id"),
        Index("ix_tasks_author_id", "author_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    offer: Mapped[str] = mapped_column(String(200))
    geo: Mapped[str] = mapped_column(String(100))
    creative_type: Mapped[str] = mapped_column(String(20))
    quantity: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    priority: Mapped[str] = mapped_column(String(10), default=Priority.NORMAL.value)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    status: Mapped[str] = mapped_column(String(20), default=TaskStatus.NEW.value)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Первая сдача — по ней считается просрочка (решение №12)
    first_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Снимок дедлайна на момент первой сдачи: перенос дедлайна задним числом не стирает опоздание
    deadline_at_first_submit: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    revision_count: Mapped[int] = mapped_column(default=0, server_default="0")
    revision_comment: Mapped[str | None] = mapped_column(Text)
    # ТЗ меняли после того, как задачу взяли в работу — креативщик видит пометку
    brief_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="joined")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")

    @property
    def status_enum(self) -> TaskStatus:
        return TaskStatus(self.status)


# Сортировка в колонке: приоритет (срочные выше) → дедлайн (без дедлайна в конце) → создание
PRIORITY_ORDER = case(
    {p.value: rank for p, rank in PRIORITY_RANK.items()}, value=Task.priority
).desc()
BOARD_ORDER = (PRIORITY_ORDER, Task.deadline.asc().nulls_last(), Task.created_at.asc())


class EventType(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    TAKEN = "taken"
    SUBMITTED = "submitted"
    RESUBMITTED = "resubmitted"
    ACCEPTED = "accepted"
    REVISION_REQUESTED = "revision_requested"
    CANCELLED = "cancelled"
    REASSIGNED = "reassigned"
    UNASSIGNED = "unassigned"
    ATTACHMENT_ADDED = "attachment_added"
    ATTACHMENT_REMOVED = "attachment_removed"
    AI_USAGE_ADDED = "ai_usage_added"
    AI_USAGE_UPDATED = "ai_usage_updated"
    AI_USAGE_REMOVED = "ai_usage_removed"


class TaskEvent(Base):
    """История задачи: каждое действие и каждое изменение поля."""

    __tablename__ = "task_events"
    __table_args__ = (Index("ix_task_events_task_id_created_at", "task_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(32))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str | None] = mapped_column(String(20))
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    actor: Mapped[User | None] = relationship(lazy="joined")


class WorkKind(StrEnum):
    WORK = "work"
    REVISION = "revision"


class WorkInterval(Base):
    """Отрезок чистой работы креативщика: взял → сдал, отправили на правки → сдал исправленное."""

    __tablename__ = "task_work_intervals"
    __table_args__ = (
        # Не больше одного открытого отрезка на задачу
        Index(
            "uq_task_work_intervals_open",
            "task_id",
            unique=True,
            postgresql_where=text("ended_at is null"),
        ),
        Index("ix_task_work_intervals_user_id", "user_id"),
        CheckConstraint("ended_at is null or ended_at >= started_at", name="ended_after_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


__all__ = [
    "ACTIVE_STATUSES",
    "BOARD_ORDER",
    "CLOSED_STATUSES",
    "Action",
    "CreativeType",
    "EventType",
    "OverdueState",
    "Priority",
    "Task",
    "TaskEvent",
    "TaskStatus",
    "WorkInterval",
    "WorkKind",
]
