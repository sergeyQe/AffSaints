from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserBrief

Credits = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


def _clean_name(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("Название не может быть пустым")
    return v


class AiServiceOut(BaseModel):
    id: int
    name: str
    is_active: bool


class AiServiceCreate(BaseModel):
    name: str = Field(max_length=100)

    _n = field_validator("name")(_clean_name)


class AiServiceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return None if v is None else _clean_name(v)


class AiUsageCreate(BaseModel):
    service_id: int
    credits: Credits


class AiUsageUpdate(BaseModel):
    service_id: int | None = None
    credits: Credits | None = None


class AiUsageOut(BaseModel):
    id: int
    task_id: int
    service: AiServiceOut
    user: UserBrief
    # Число в JSON (Decimal по умолчанию сериализуется строкой)
    credits: float
    created_at: datetime
    updated_at: datetime


class AiServiceTotal(BaseModel):
    service: AiServiceOut
    credits: float


class TaskAiUsage(BaseModel):
    items: list[AiUsageOut]
    # Итоги по каждому сервису отдельно; общей суммы нет (решение №14)
    totals: list[AiServiceTotal]
