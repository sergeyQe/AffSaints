from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.db import get_session
from app.models.ai import AiService, AiUsage
from app.models.user import Role, User
from app.schemas.ai import (
    AiServiceCreate,
    AiServiceOut,
    AiServiceTotal,
    AiServiceUpdate,
    AiUsageCreate,
    AiUsageOut,
    AiUsageUpdate,
    TaskAiUsage,
)
from app.schemas.user import UserBrief
from app.services import ai as service

router = APIRouter(tags=["ai"])

Session = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Head = Annotated[User, Depends(require_roles(Role.HEAD))]


def service_out(s: AiService) -> AiServiceOut:
    return AiServiceOut(id=s.id, name=s.name, is_active=s.is_active)


def usage_out(u: AiUsage) -> AiUsageOut:
    return AiUsageOut(
        id=u.id,
        task_id=u.task_id,
        service=service_out(u.service),
        user=UserBrief(id=u.user.id, full_name=u.user.full_name),
        credits=float(u.credits),
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


# ---------- справочник ----------


@router.get("/ai-services")
async def list_services(
    session: Session, _: CurrentUser, include_inactive: bool = False
) -> list[AiServiceOut]:
    return [service_out(s) for s in await service.list_services(session, include_inactive)]


@router.post("/ai-services", status_code=201)
async def create_service(body: AiServiceCreate, session: Session, _: Head) -> AiServiceOut:
    return service_out(await service.create_service(session, body))


@router.patch("/ai-services/{service_id}")
async def update_service(
    service_id: int, body: AiServiceUpdate, session: Session, _: Head
) -> AiServiceOut:
    return service_out(await service.update_service(session, service_id, body))


# ---------- расходы по задаче ----------


@router.get("/tasks/{task_id}/ai-usage")
async def task_usage(task_id: int, session: Session, _: CurrentUser) -> TaskAiUsage:
    items = await service.list_usage(session, task_id)
    return TaskAiUsage(
        items=[usage_out(u) for u in items],
        totals=[
            AiServiceTotal(service=service_out(s), credits=float(total))
            for s, total in service.totals_by_service(items)
        ],
    )


@router.post("/tasks/{task_id}/ai-usage", status_code=201)
async def add_usage(
    task_id: int, body: AiUsageCreate, session: Session, user: CurrentUser
) -> AiUsageOut:
    return usage_out(await service.add_usage(session, task_id, user, body))


@router.patch("/ai-usage/{usage_id}")
async def update_usage(
    usage_id: int, body: AiUsageUpdate, session: Session, user: CurrentUser
) -> AiUsageOut:
    return usage_out(await service.update_usage(session, usage_id, user, body))


@router.delete("/ai-usage/{usage_id}", status_code=204)
async def remove_usage(usage_id: int, session: Session, user: CurrentUser) -> None:
    await service.remove_usage(session, usage_id, user)
