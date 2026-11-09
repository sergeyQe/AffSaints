import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.db import get_session
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import hash_password
from app.models.user import Role, User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

require_head = require_roles(Role.HEAD)


@router.get("")
async def list_users(
    role: Role | None = None,
    include_inactive: bool = False,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    # Список нужен всем ролям: фильтры доски, выбор исполнителя, аналитика
    query = select(User).order_by(User.full_name)
    if not include_inactive:
        query = query.where(User.is_active)
    if role is not None:
        query = query.where(User.role_links.any(UserRole.role == role.value))
    return [UserOut.of(u) for u in await session.scalars(query)]


@router.post("", status_code=201)
async def create_user(
    body: UserCreate,
    _: User = Depends(require_head),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    password_hash = await asyncio.to_thread(hash_password, body.password)
    user = User(
        login=body.login,
        full_name=body.full_name,
        password_hash=password_hash,
        role_links=[UserRole(role=r.value) for r in body.roles],
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        raise Conflict("login_taken", "Пользователь с таким логином уже есть") from exc
    return UserOut.of(user)


@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current: User = Depends(require_head),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFound("user_not_found", "Пользователь не найден")

    # Руководитель не может заблокировать сам себя или снять с себя роль руководителя
    if user.id == current.id:
        if body.is_active is False:
            raise AppError("self_lockout", "Нельзя деактивировать собственную учётную запись")
        if body.roles is not None and Role.HEAD not in body.roles:
            raise AppError("self_lockout", "Нельзя снять с себя роль руководителя")

    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.roles is not None:
        user.set_roles(body.roles)

    # Смена пароля или деактивация — инвалидируем выданные токены
    if body.password is not None:
        user.password_hash = await asyncio.to_thread(hash_password, body.password)
        user.token_version += 1
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        if not body.is_active:
            user.token_version += 1

    await session.commit()
    return UserOut.of(user)
