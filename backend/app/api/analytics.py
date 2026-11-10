from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.db import get_session
from app.models.user import Role
from app.schemas.analytics import AiOut, AnalyticsQuery, OverviewOut, TimeOut
from app.services.analytics import build_overview
from app.services.analytics_ai import build_ai
from app.services.analytics_time import build_time

# Аналитика — только руководителю; у каждой вкладки свой запрос, параметры общие
router = APIRouter(
    prefix="/analytics", tags=["analytics"], dependencies=[Depends(require_roles(Role.HEAD))]
)

Query_ = Annotated[AnalyticsQuery, Query()]
Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/overview")
async def overview(q: Query_, session: Session) -> OverviewOut:
    return await build_overview(session, q)


@router.get("/ai")
async def ai(q: Query_, session: Session) -> AiOut:
    return await build_ai(session, q)


@router.get("/time")
async def time(q: Query_, session: Session) -> TimeOut:
    return await build_time(session, q)
