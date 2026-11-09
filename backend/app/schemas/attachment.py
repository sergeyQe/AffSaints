from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.attachment import AttachmentKind
from app.schemas.user import UserBrief


class LinkIn(BaseModel):
    kind: AttachmentKind
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def _http_url(cls, v: str) -> str:
        # Только http(s): javascript:, data: и прочие схемы в ссылке опасны
        v = v.strip()
        lowered = v.lower()
        if not (lowered.startswith("http://") or lowered.startswith("https://")) or len(v) < 11:
            raise ValueError("Ссылка должна начинаться с http:// или https://")
        if any(ch.isspace() for ch in v):
            raise ValueError("Ссылка не должна содержать пробелов")
        return v


class AttachmentOut(BaseModel):
    id: int
    kind: AttachmentKind
    round: int
    type: Literal["link", "file"]
    url: str | None
    filename: str | None
    content_type: str | None
    size: int | None
    created_by: UserBrief
    created_at: datetime
