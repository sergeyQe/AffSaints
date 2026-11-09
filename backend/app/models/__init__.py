"""Реестр моделей: импорт этого пакета регистрирует все таблицы в Base.metadata."""

from app.models.attachment import TaskAttachment
from app.models.task import Task, TaskEvent, WorkInterval
from app.models.user import Role, User, UserRole

__all__ = ["Role", "Task", "TaskAttachment", "TaskEvent", "User", "UserRole", "WorkInterval"]
