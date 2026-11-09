from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Role(StrEnum):
    BUYER = "buyer"
    CREATIVE = "creative"
    HEAD = "head"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    full_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    # Демо-пользователи доступны для быстрого входа без пароля (только в демо-режиме)
    is_demo: Mapped[bool] = mapped_column(default=False, server_default="false")
    # Увеличивается при смене пароля/деактивации — старые JWT перестают действовать
    token_version: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    role_links: Mapped[list["UserRole"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="UserRole.role"
    )

    @property
    def roles(self) -> set[Role]:
        return {Role(link.role) for link in self.role_links}

    def has_role(self, *roles: Role) -> bool:
        return bool(self.roles.intersection(roles))

    def set_roles(self, roles: list[Role]) -> None:
        # Диф вместо замены списка: иначе ORM может вставить строку с тем же PK до удаления старой
        wanted = {r.value for r in roles}
        self.role_links = [link for link in self.role_links if link.role in wanted]
        existing = {link.role for link in self.role_links}
        self.role_links.extend(UserRole(role=r) for r in sorted(wanted - existing))


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (CheckConstraint("role in ('buyer', 'creative', 'head')", name="role_valid"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16), primary_key=True)
