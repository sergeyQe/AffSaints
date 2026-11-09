import asyncio

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import AppError, NotFound, Unauthorized
from app.core.security import create_access_token, login_throttle, verify_password
from app.models.user import User
from app.schemas.user import DemoLoginIn, DemoUserOut, LoginIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.cookie_name,
        value=create_access_token(user.id, user.token_version),
        max_age=settings.jwt_ttl_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/login")
async def login(
    body: LoginIn, response: Response, session: AsyncSession = Depends(get_session)
) -> UserOut:
    key = body.login.lower()
    # Слишком много неудачных попыток — временная блокировка логина
    if login_throttle.is_blocked(key):
        raise AppError(
            "too_many_attempts", "Слишком много попыток входа, попробуйте через 5 минут", 429
        )

    user = await session.scalar(select(User).where(User.login == key))
    # bcrypt — CPU-нагрузка, выносим из event loop
    ok = await asyncio.to_thread(
        verify_password, body.password, user.password_hash if user else None
    )
    if user is None or not ok or not user.is_active:
        login_throttle.register_failure(key)
        raise Unauthorized("invalid_credentials", "Неверный логин или пароль")

    login_throttle.reset(key)
    _set_auth_cookie(response, user)
    return UserOut.of(user)


@router.get("/demo-users")
async def demo_users(session: AsyncSession = Depends(get_session)) -> list[DemoUserOut]:
    # Вне демо-режима список пуст — кнопки быстрого входа не показываются
    if not get_settings().demo_mode:
        return []
    users = await session.scalars(
        select(User).where(User.is_demo, User.is_active).order_by(User.id)
    )
    return [DemoUserOut(id=u.id, full_name=u.full_name, roles=sorted(u.roles)) for u in users]


@router.post("/demo-login")
async def demo_login(
    body: DemoLoginIn, response: Response, session: AsyncSession = Depends(get_session)
) -> UserOut:
    # Вход без пароля — только в демо-режиме и только за демо-пользователей
    user = await session.get(User, body.user_id) if get_settings().demo_mode else None
    if user is None or not user.is_demo or not user.is_active:
        raise NotFound("demo_user_not_found", "Демо-пользователь не найден")
    _set_auth_cookie(response, user)
    return UserOut.of(user)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.cookie_name, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax"
    )


@router.get("/me")
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.of(user)
