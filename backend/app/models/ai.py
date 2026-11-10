from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.user import User


class AiService(Base):
    """Справочник AI-сервисов (ведёт руководитель, решение №13)."""

    __tablename__ = "ai_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # Отключённый сервис нельзя выбрать для новых записей, но старые расходы сохраняются
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# Уникальность без учёта регистра: «Midjourney» и «midjourney» — один сервис
Index("uq_ai_services_name_lower", func.lower(AiService.name), unique=True)


class AiUsage(Base):
    """Расход кредитов AI-сервиса по задаче (решения №14–15)."""

    __tablename__ = "ai_usage"
    __table_args__ = (
        CheckConstraint("credits > 0", name="credits_positive"),
        CheckConstraint("round >= 0", name="round_non_negative"),
        Index("ix_ai_usage_task_id", "task_id"),
        Index("ix_ai_usage_user_id_created_at", "user_id", "created_at"),
        Index("ix_ai_usage_service_id", "service_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    service_id: Mapped[int] = mapped_column(ForeignKey("ai_services.id"))
    # Креативщик, чьи это расходы (для аналитики по исполнителям)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    credits: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Круг правок на момент внесения: 0 — первая версия, 1, 2… — правки
    round: Mapped[int] = mapped_column(default=0, server_default="0")
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    service: Mapped[AiService] = relationship(lazy="joined")
    user: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
