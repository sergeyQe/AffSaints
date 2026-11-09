from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.user import User


class AttachmentKind(StrEnum):
    REFERENCE = "reference"
    RESULT = "result"


class TaskAttachment(Base):
    """Референс к ТЗ или результат работы: ссылка ИЛИ загруженный файл."""

    __tablename__ = "task_attachments"
    __table_args__ = (
        CheckConstraint("kind in ('reference', 'result')", name="kind_valid"),
        # Ровно одно из двух: ссылка или файл
        CheckConstraint("(url is null) <> (storage_key is null)", name="link_xor_file"),
        Index("ix_task_attachments_task_id", "task_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    # Номер круга сдачи: 0 — первая сдача, N — после N-й отправки на правки
    round: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    url: Mapped[str | None] = mapped_column(Text)
    storage_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(100))
    size: Mapped[int | None] = mapped_column(Integer)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Мягкое удаление: история и аналитика не теряют запись
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="joined")

    @property
    def is_file(self) -> bool:
        return self.storage_key is not None

    @property
    def display_name(self) -> str:
        return self.filename or self.url or ""
