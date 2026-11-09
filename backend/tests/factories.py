"""Создание тестовых данных напрямую через ORM (без API)."""

from itertools import count

from app.core.db import SessionFactory
from app.core.security import hash_password
from app.models.user import Role, User, UserRole

DEFAULT_PASSWORD = "password123"
_seq = count(1)


async def create_user(
    *roles: Role,
    login: str | None = None,
    full_name: str | None = None,
    password: str = DEFAULT_PASSWORD,
    is_active: bool = True,
    is_demo: bool = False,
) -> User:
    n = next(_seq)
    user = User(
        login=login or f"user{n}",
        full_name=full_name or f"Пользователь {n}",
        password_hash=hash_password(password),
        is_active=is_active,
        is_demo=is_demo,
        role_links=[UserRole(role=r.value) for r in roles],
    )
    async with SessionFactory() as session:
        session.add(user)
        await session.commit()
    return user
