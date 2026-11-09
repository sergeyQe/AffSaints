from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core import clock
from app.core.db import get_session
from app.models.task import Task
from app.models.user import Role, User
from app.schemas.task import (
    CommentIn,
    EventOut,
    ReasonIn,
    ReassignIn,
    TaskCreate,
    TaskDetail,
    TaskFilters,
    TaskOut,
    TaskUpdate,
)
from app.schemas.user import UserBrief
from app.services import tasks as service
from app.services.task_permissions import allowed_actions

router = APIRouter(prefix="/tasks", tags=["tasks"])

Session = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _brief(user: User | None) -> UserBrief | None:
    return None if user is None else UserBrief(id=user.id, full_name=user.full_name)


def to_out(task: Task, user: User) -> TaskOut:
    author = _brief(task.author)
    assert author is not None
    return TaskOut(
        id=task.id,
        offer=task.offer,
        geo=task.geo,
        creative_type=task.creative_type,
        quantity=task.quantity,
        description=task.description,
        priority=task.priority,
        deadline=task.deadline,
        status=task.status_enum,
        author=author,
        assignee=_brief(task.assignee),
        created_at=task.created_at,
        updated_at=task.updated_at,
        taken_at=task.taken_at,
        first_submitted_at=task.first_submitted_at,
        last_submitted_at=task.last_submitted_at,
        completed_at=task.completed_at,
        cancelled_at=task.cancelled_at,
        cancel_reason=task.cancel_reason,
        revision_count=task.revision_count,
        revision_comment=task.revision_comment,
        brief_updated_at=task.brief_updated_at,
        overdue=service.overdue_state(task, clock.now()),
        actions=allowed_actions(task, user),
    )


async def to_detail(session: AsyncSession, task: Task, user: User) -> TaskDetail:
    base = to_out(task, user)
    seconds = await service.work_seconds(session, task.id, clock.now())
    return TaskDetail(**base.model_dump(), work_seconds=seconds)


@router.get("")
async def list_tasks(
    session: Session,
    user: CurrentUser,
    filters: Annotated[TaskFilters, Query()],
) -> list[TaskOut]:
    return [to_out(t, user) for t in await service.list_tasks(session, filters)]


@router.post("", status_code=201)
async def create_task(
    body: TaskCreate,
    session: Session,
    user: Annotated[User, Depends(require_roles(Role.BUYER, Role.HEAD))],
) -> TaskDetail:
    task = await service.create_task(session, body, user)
    task.author = user
    return await to_detail(session, task, user)


@router.get("/{task_id}")
async def get_task(task_id: int, session: Session, user: CurrentUser) -> TaskDetail:
    return await to_detail(session, await service.get_task(session, task_id), user)


@router.patch("/{task_id}")
async def update_task(
    task_id: int, body: TaskUpdate, session: Session, user: CurrentUser
) -> TaskDetail:
    task = await service.update_task(session, task_id, body, user)
    return await to_detail(session, task, user)


@router.get("/{task_id}/events")
async def task_events(task_id: int, session: Session, _: CurrentUser) -> list[EventOut]:
    events = await service.list_events(session, task_id)
    return [
        EventOut(
            id=e.id,
            type=e.type,
            from_status=e.from_status,
            to_status=e.to_status,
            payload=e.payload,
            actor=_brief(e.actor),
            created_at=e.created_at,
        )
        for e in events
    ]


@router.post("/{task_id}/take")
async def take(task_id: int, session: Session, user: CurrentUser) -> TaskDetail:
    return await to_detail(session, await service.take(session, task_id, user), user)


@router.post("/{task_id}/submit")
async def submit(task_id: int, session: Session, user: CurrentUser) -> TaskDetail:
    return await to_detail(session, await service.submit(session, task_id, user), user)


@router.post("/{task_id}/accept")
async def accept(task_id: int, session: Session, user: CurrentUser) -> TaskDetail:
    return await to_detail(session, await service.accept(session, task_id, user), user)


@router.post("/{task_id}/request-revision")
async def request_revision(
    task_id: int, body: CommentIn, session: Session, user: CurrentUser
) -> TaskDetail:
    task = await service.request_revision(session, task_id, user, body.comment)
    return await to_detail(session, task, user)


@router.post("/{task_id}/cancel")
async def cancel(task_id: int, body: ReasonIn, session: Session, user: CurrentUser) -> TaskDetail:
    task = await service.cancel(session, task_id, user, body.reason)
    return await to_detail(session, task, user)


@router.post("/{task_id}/reassign")
async def reassign(
    task_id: int, body: ReassignIn, session: Session, user: CurrentUser
) -> TaskDetail:
    task = await service.reassign(session, task_id, user, body.assignee_id)
    return await to_detail(session, task, user)


@router.post("/{task_id}/unassign")
async def unassign(task_id: int, session: Session, user: CurrentUser) -> TaskDetail:
    return await to_detail(session, await service.unassign(session, task_id, user), user)
