from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.db import get_session
from app.models.user import Role, User
from app.schemas.analytics import AnalyticsOut, AnalyticsQuery
from app.services import analytics as service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def analytics(
    q: Annotated[AnalyticsQuery, Query()],
    session: Annotated[AsyncSession, Depends(get_session)],
    _: Annotated[User, Depends(require_roles(Role.HEAD))],
) -> AnalyticsOut:
    return await service.build(session, q)
