"""Реестр моделей: импорт этого пакета регистрирует все таблицы в Base.metadata."""

from app.models.user import Role, User, UserRole

__all__ = ["Role", "User", "UserRole"]
