"""Справочник AI-сервисов и учёт расходов кредитов по задачам."""

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.models.ai import AiService, AiUsage
from app.models.task import Action, EventType, Task
from app.models.user import Role, User
from app.schemas.ai import AiServiceCreate, AiServiceUpdate, AiUsageCreate, AiUsageUpdate
from app.services import task_queries
from app.services.task_history import add_event
from app.services.task_permissions import ensure_allowed

# ---------- справочник ----------


async def list_services(session: AsyncSession, include_inactive: bool) -> list[AiService]:
    query = select(AiService).order_by(func.lower(AiService.name))
    if not include_inactive:
        query = query.where(AiService.is_active)
    return list(await session.scalars(query))


async def _name_taken(session: AsyncSession, name: str, exclude_id: int | None = None) -> bool:
    query = select(AiService.id).where(func.lower(AiService.name) == name.lower())
    if exclude_id is not None:
        query = query.where(AiService.id != exclude_id)
    return await session.scalar(query) is not None


async def create_service(session: AsyncSession, data: AiServiceCreate) -> AiService:
    if await _name_taken(session, data.name):
        raise Conflict("ai_service_exists", "Такой сервис уже есть в справочнике")
    service = AiService(name=data.name, created_at=clock.now())
    session.add(service)
    try:
        await session.commit()
    except IntegrityError as exc:  # гонка двух одинаковых добавлений
        raise Conflict("ai_service_exists", "Такой сервис уже есть в справочнике") from exc
    return service


async def update_service(
    session: AsyncSession, service_id: int, data: AiServiceUpdate
) -> AiService:
    service = await session.get(AiService, service_id)
    if service is None:
        raise NotFound("ai_service_not_found", "Сервис не найден")
    if data.name is not None and data.name != service.name:
        if await _name_taken(session, data.name, exclude_id=service.id):
            raise Conflict("ai_service_exists", "Такой сервис уже есть в справочнике")
        service.name = data.name
    if data.is_active is not None:
        service.is_active = data.is_active
    await session.commit()
    return service


async def _active_service(session: AsyncSession, service_id: int) -> AiService:
    service = await session.get(AiService, service_id)
    if service is None or not service.is_active:
        raise AppError("ai_service_unavailable", "Выберите активный сервис из справочника")
    return service


# ---------- расходы ----------


async def list_usage(session: AsyncSession, task_id: int) -> list[AiUsage]:
    await task_queries.get_task(session, task_id)
    result = await session.scalars(
        select(AiUsage).where(AiUsage.task_id == task_id).order_by(AiUsage.created_at, AiUsage.id)
    )
    return list(result)


def totals_by_service(items: list[AiUsage]) -> list[tuple[AiService, Decimal]]:
    sums: dict[int, Decimal] = {}
    services: dict[int, AiService] = {}
    for item in items:
        sums[item.service_id] = sums.get(item.service_id, Decimal(0)) + item.credits
        services[item.service_id] = item.service
    return sorted(
        ((services[sid], total) for sid, total in sums.items()),
        key=lambda pair: pair[0].name.lower(),
    )


def _usage_payload(usage: AiUsage) -> dict[str, Any]:
    return {
        "usage_id": usage.id,
        "service": usage.service.name,
        "credits": str(usage.credits),
        "user": usage.user.full_name,
    }


async def add_usage(
    session: AsyncSession, task_id: int, actor: User, data: AiUsageCreate
) -> AiUsage:
    task = await task_queries.lock_task(session, task_id)
    ensure_allowed(Action.MANAGE_AI_USAGE, task, actor)
    service = await _active_service(session, data.service_id)
    assert task.assignee is not None  # гарантирует правило MANAGE_AI_USAGE

    # Расход всегда записывается на исполнителя задачи и на текущий круг правок
    now = clock.now()
    usage = AiUsage(
        task_id=task.id,
        service_id=service.id,
        user_id=task.assignee.id,
        credits=data.credits,
        round=task.revision_count,
        created_by_id=actor.id,
        created_at=now,
        updated_at=now,
    )
    session.add(usage)
    await session.flush()
    usage.service = service
    usage.user = task.assignee
    add_event(session, task, actor, EventType.AI_USAGE_ADDED, **_usage_payload(usage))
    await session.commit()
    return usage


async def _lock_usage(session: AsyncSession, usage_id: int, actor: User) -> tuple[AiUsage, Task]:
    usage = await session.get(AiUsage, usage_id)
    if usage is None:
        raise NotFound("ai_usage_not_found", "Запись о расходе не найдена")
    task = await task_queries.lock_task(session, usage.task_id)
    # Пока ждали блокировку, запись могли удалить или изменить — перечитываем
    refreshed = await session.get(AiUsage, usage_id, populate_existing=True)
    if refreshed is None:
        raise NotFound("ai_usage_not_found", "Запись о расходе не найдена")
    usage = refreshed
    ensure_allowed(Action.MANAGE_AI_USAGE, task, actor)
    # Креативщик правит только свои записи (после переназначения чужие ему недоступны)
    if usage.user_id != actor.id and not actor.has_role(Role.HEAD):
        raise Forbidden("forbidden", "Можно менять только свои записи о расходах")
    return usage, task


async def update_usage(
    session: AsyncSession, usage_id: int, actor: User, data: AiUsageUpdate
) -> AiUsage:
    usage, task = await _lock_usage(session, usage_id, actor)

    # Собираем изменения для истории
    changes: list[dict[str, object]] = []
    if data.service_id is not None and data.service_id != usage.service_id:
        service = await _active_service(session, data.service_id)
        changes.append({"field": "service", "old": usage.service.name, "new": service.name})
        usage.service_id = service.id
        usage.service = service
    if data.credits is not None and data.credits != usage.credits:
        changes.append({"field": "credits", "old": str(usage.credits), "new": str(data.credits)})
        usage.credits = data.credits

    if changes:
        usage.updated_at = clock.now()
        add_event(
            session,
            task,
            actor,
            EventType.AI_USAGE_UPDATED,
            usage_id=usage.id,
            changes=changes,
        )
    await session.commit()
    return usage


async def remove_usage(session: AsyncSession, usage_id: int, actor: User) -> None:
    usage, task = await _lock_usage(session, usage_id, actor)
    add_event(session, task, actor, EventType.AI_USAGE_REMOVED, **_usage_payload(usage))
    await session.delete(usage)
    await session.commit()
