from datetime import datetime
from typing import Any

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.models.task import Action, CreativeType, OverdueState, Priority, TaskStatus
from app.schemas.user import UserBrief


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Поле не может быть пустым")
    return v


class TaskCreate(BaseModel):
    offer: str = Field(max_length=200)
    geo: str = Field(max_length=100)
    creative_type: CreativeType
    quantity: int = Field(ge=1, le=1000)
    description: str = Field(default="", max_length=10_000)
    priority: Priority = Priority.NORMAL
    deadline: AwareDatetime | None = None

    _offer = field_validator("offer", "geo")(_strip_required)


class TaskUpdate(BaseModel):
    """Частичное обновление ТЗ. Явный deadline=null снимает дедлайн."""

    offer: str | None = Field(default=None, max_length=200)
    geo: str | None = Field(default=None, max_length=100)
    creative_type: CreativeType | None = None
    quantity: int | None = Field(default=None, ge=1, le=1000)
    description: str | None = Field(default=None, max_length=10_000)
    priority: Priority | None = None
    deadline: AwareDatetime | None = None

    @field_validator(
        "offer", "geo", "creative_type", "quantity", "description", "priority", mode="before"
    )
    @classmethod
    def _no_explicit_null(cls, v: object) -> object:
        # Явный null допустим только для дедлайна; для остальных полей это ошибка клиента
        if v is None:
            raise ValueError("Поле не может быть пустым")
        return v

    @field_validator("offer", "geo")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        return None if v is None else _strip_required(v)


class CommentIn(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)

    _c = field_validator("comment")(_strip_required)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)

    _r = field_validator("reason")(_strip_required)


class ReassignIn(BaseModel):
    assignee_id: int


class MoveIn(BaseModel):
    """Перенос карточки руководителем: исполнитель — если задача уходит из «Новых»,
    комментарий — для правок (необязателен)."""

    status: TaskStatus
    assignee_id: int | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class TaskOut(BaseModel):
    id: int
    offer: str
    geo: str
    creative_type: CreativeType
    quantity: int
    description: str
    priority: Priority
    deadline: datetime | None
    status: TaskStatus
    author: UserBrief
    assignee: UserBrief | None
    created_at: datetime
    updated_at: datetime
    taken_at: datetime | None
    first_submitted_at: datetime | None
    last_submitted_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    revision_count: int
    revision_comment: str | None
    brief_updated_at: datetime | None
    overdue: OverdueState
    actions: list[Action]


class TaskDetail(TaskOut):
    work_seconds: int


class EventOut(BaseModel):
    id: int
    type: str
    from_status: TaskStatus | None
    to_status: TaskStatus | None
    payload: dict[str, Any]
    actor: UserBrief | None
    created_at: datetime


class TaskFilters(BaseModel):
    status: list[TaskStatus] | None = None
    assignee_id: int | None = None
    author_id: int | None = None
    offer: str | None = None
    geo: str | None = None
    priority: Priority | None = None
    overdue: bool | None = None
    # «Готово» на доске — только за последние N дней, чтобы колонка не росла бесконечно
    done_days: int = Field(default=30, ge=1, le=3650)
