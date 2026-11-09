"""Демо-данные: тестовые пользователи, AI-сервисы, задачи во всех статусах с историей и расходами."""

from dataclasses import dataclass

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import Base
from app.core.security import hash_password
from app.demo_content import seed_content
from app.models.user import Role, User, UserRole

DEMO_PASSWORD = "demo12345"


@dataclass(frozen=True)
class DemoUser:
    login: str
    full_name: str
    roles: tuple[Role, ...]


DEMO_USERS: tuple[DemoUser, ...] = (
    DemoUser("head", "Олег Смирнов", (Role.HEAD,)),
    DemoUser("anna", "Анна Козлова", (Role.BUYER,)),
    DemoUser("dmitry", "Дмитрий Орлов", (Role.BUYER,)),
    DemoUser("ivan", "Иван Петров", (Role.CREATIVE,)),
    DemoUser("maria", "Мария Соколова", (Role.CREATIVE,)),
    DemoUser("sergey", "Сергей Волков", (Role.CREATIVE,)),
    DemoUser("kate", "Екатерина Лебедева", (Role.BUYER, Role.CREATIVE)),
)


async def is_empty(session: AsyncSession) -> bool:
    return (await session.scalar(select(func.count()).select_from(User))) == 0


async def wipe(session: AsyncSession) -> None:
    # Полная очистка всех таблиц приложения (для ночного сброса демо)
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    await session.execute(text(f"truncate {tables} restart identity cascade"))


async def seed(session: AsyncSession) -> dict[str, User]:
    """Создаёт демо-данные в пустой БД. Возвращает пользователей по логину."""
    password_hash = hash_password(DEMO_PASSWORD)
    users = {
        u.login: User(
            login=u.login,
            full_name=u.full_name,
            password_hash=password_hash,
            is_demo=True,
            role_links=[UserRole(role=r.value) for r in u.roles],
        )
        for u in DEMO_USERS
    }
    session.add_all(users.values())
    await session.commit()

    # Задачи, расходы и история — через бизнес-сервисы, как в реальной работе
    await seed_content(session, users)
    return users
