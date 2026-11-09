"""Вложения задачи: референсы (к ТЗ) и результаты (при сдаче)."""

import asyncio
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.core.config import get_settings
from app.core.errors import Conflict, NotFound
from app.models.attachment import AttachmentKind, TaskAttachment
from app.models.task import EventType, Task
from app.models.user import User
from app.services import tasks as task_service
from app.services.storage import FileStorage, safe_filename
from app.services.task_permissions import Action, ensure_allowed

_KIND_ACTION = {
    AttachmentKind.REFERENCE: Action.ADD_REFERENCE,
    AttachmentKind.RESULT: Action.ADD_RESULT,
}


def _current_round(task: Task, kind: AttachmentKind) -> int:
    # Результат относится к текущему кругу сдачи; референсы — к ТЗ (круг 0)
    return task.revision_count if kind is AttachmentKind.RESULT else 0


async def list_attachments(session: AsyncSession, task_id: int) -> list[TaskAttachment]:
    await task_service.get_task(session, task_id)
    result = await session.scalars(
        select(TaskAttachment)
        .where(TaskAttachment.task_id == task_id, TaskAttachment.deleted_at.is_(None))
        .order_by(TaskAttachment.kind, TaskAttachment.round, TaskAttachment.created_at)
    )
    return list(result)


async def _add(
    session: AsyncSession, task: Task, user: User, attachment: TaskAttachment
) -> TaskAttachment:
    session.add(attachment)
    await session.flush()
    task_service.add_event(
        session,
        task,
        user,
        EventType.ATTACHMENT_ADDED,
        attachment_id=attachment.id,
        kind=attachment.kind,
        name=attachment.display_name,
        round=attachment.round,
    )
    await session.commit()
    attachment.created_by = user
    return attachment


async def add_link(
    session: AsyncSession, task_id: int, user: User, kind: AttachmentKind, url: str
) -> TaskAttachment:
    task = await task_service.lock_task(session, task_id)
    ensure_allowed(_KIND_ACTION[kind], task, user)
    attachment = TaskAttachment(
        task_id=task.id,
        kind=kind.value,
        round=_current_round(task, kind),
        url=url,
        created_by_id=user.id,
        created_at=clock.now(),
    )
    return await _add(session, task, user, attachment)


async def add_file(
    session: AsyncSession,
    storage: FileStorage,
    task_id: int,
    user: User,
    kind: AttachmentKind,
    stream: BinaryIO,
    filename: str | None,
) -> TaskAttachment:
    # Права проверяем до записи файла на диск
    task = await task_service.get_task(session, task_id)
    ensure_allowed(_KIND_ACTION[kind], task, user)

    # Запись файла — блокирующий ввод-вывод, выносим из event loop
    stored = await asyncio.to_thread(storage.save, stream, get_settings().max_upload_bytes)
    try:
        # Повторная проверка под блокировкой: статус мог смениться, пока файл грузился
        task = await task_service.lock_task(session, task_id)
        ensure_allowed(_KIND_ACTION[kind], task, user)
        attachment = TaskAttachment(
            task_id=task.id,
            kind=kind.value,
            round=_current_round(task, kind),
            storage_key=stored.key,
            filename=safe_filename(filename),
            content_type=stored.content_type,
            size=stored.size,
            created_by_id=user.id,
            created_at=clock.now(),
        )
        return await _add(session, task, user, attachment)
    except BaseException:
        # Запись в БД не удалась — файл-сирота не нужен
        await asyncio.to_thread(storage.delete, stored.key)
        raise


async def get_attachment(session: AsyncSession, attachment_id: int) -> TaskAttachment:
    attachment = await session.get(TaskAttachment, attachment_id)
    if attachment is None or attachment.deleted_at is not None:
        raise NotFound("attachment_not_found", "Вложение не найдено")
    return attachment


async def remove(session: AsyncSession, attachment_id: int, user: User) -> None:
    attachment = await get_attachment(session, attachment_id)
    task = await task_service.lock_task(session, attachment.task_id)
    kind = AttachmentKind(attachment.kind)
    ensure_allowed(_KIND_ACTION[kind], task, user)

    # Уже сданный на проверку результат (прошлый круг) удалять нельзя — это версия, которую видел байер
    if kind is AttachmentKind.RESULT and attachment.round != task.revision_count:
        raise Conflict(
            "result_already_submitted", "Нельзя удалить результат, уже сданный на проверку"
        )

    # Мягкое удаление: файл остаётся на диске, запись — в истории
    attachment.deleted_at = clock.now()
    attachment.deleted_by_id = user.id
    task_service.add_event(
        session,
        task,
        user,
        EventType.ATTACHMENT_REMOVED,
        attachment_id=attachment.id,
        kind=attachment.kind,
        name=attachment.display_name,
    )
    await session.commit()
