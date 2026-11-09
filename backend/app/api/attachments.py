from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_session
from app.core.errors import NotFound
from app.models.attachment import AttachmentKind, TaskAttachment
from app.models.user import User
from app.schemas.attachment import AttachmentOut, LinkIn
from app.schemas.user import UserBrief
from app.services import attachments as service
from app.services.storage import FileStorage, get_storage

router = APIRouter(tags=["attachments"])

Session = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Storage = Annotated[FileStorage, Depends(get_storage)]

# Типы, которые браузер может безопасно показать сам; остальное — только скачивание
_INLINE_PREFIXES = ("image/", "video/", "application/pdf")


def to_out(a: TaskAttachment) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        kind=AttachmentKind(a.kind),
        round=a.round,
        type="file" if a.is_file else "link",
        url=a.url,
        filename=a.filename,
        content_type=a.content_type,
        size=a.size,
        created_by=UserBrief(id=a.created_by.id, full_name=a.created_by.full_name),
        created_at=a.created_at,
    )


@router.get("/tasks/{task_id}/attachments")
async def list_attachments(task_id: int, session: Session, _: CurrentUser) -> list[AttachmentOut]:
    return [to_out(a) for a in await service.list_attachments(session, task_id)]


@router.post("/tasks/{task_id}/attachments/link", status_code=201)
async def add_link(
    task_id: int, body: LinkIn, session: Session, user: CurrentUser
) -> AttachmentOut:
    return to_out(await service.add_link(session, task_id, user, body.kind, body.url))


@router.post("/tasks/{task_id}/attachments/file", status_code=201)
async def add_file(
    task_id: int,
    session: Session,
    user: CurrentUser,
    storage: Storage,
    kind: Annotated[AttachmentKind, Form()],
    file: Annotated[UploadFile, File()],
) -> AttachmentOut:
    attachment = await service.add_file(
        session, storage, task_id, user, kind, file.file, file.filename
    )
    return to_out(attachment)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def remove_attachment(attachment_id: int, session: Session, user: CurrentUser) -> None:
    await service.remove(session, attachment_id, user)


@router.get("/attachments/{attachment_id}/file")
async def download(
    attachment_id: int, session: Session, _: CurrentUser, storage: Storage
) -> FileResponse:
    attachment = await service.get_attachment(session, attachment_id)
    if attachment.storage_key is None:
        raise NotFound("attachment_not_file", "Это вложение — ссылка, а не файл")
    path = storage.path(attachment.storage_key)
    if not path.exists():
        raise NotFound("file_missing", "Файл не найден в хранилище")

    content_type = attachment.content_type or "application/octet-stream"
    disposition = "inline" if content_type.startswith(_INLINE_PREFIXES) else "attachment"
    filename = attachment.filename or "file"
    return FileResponse(
        path,
        media_type=content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            # Даже если в файл что-то подмешано, браузер не выполнит скрипты
            "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )
