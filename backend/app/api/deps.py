from collections.abc import Awaitable, Callable

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.models.user import Role, User


async def get_current_user(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    # Токен берём только из httpOnly-куки
    token = request.cookies.get(get_settings().cookie_name)
    decoded = decode_access_token(token) if token else None
    if decoded is None:
        raise Unauthorized("not_authenticated", "Требуется вход в систему")

    # Пользователь должен существовать, быть активным, а токен — актуальной версии
    user_id, version = decoded
    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.token_version != version:
        raise Unauthorized("not_authenticated", "Сессия недействительна, войдите заново")
    return user


def require_roles(*roles: Role) -> Callable[..., Awaitable[User]]:
    """Зависимость: пользователь должен иметь хотя бы одну из ролей."""

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if not user.has_role(*roles):
            raise Forbidden("forbidden", "Недостаточно прав")
        return user

    return dependency
