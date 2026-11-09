"""Хранилище загруженных файлов.

Интерфейс FileStorage позволяет заменить локальный диск на S3/MinIO, не трогая бизнес-логику.
Тип файла определяется по содержимому (сигнатуре), а не по расширению или заголовку клиента.
"""

import os
import re
import secrets
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

import filetype

from app.core.config import get_settings
from app.core.errors import AppError

# Разрешённые типы: изображения, видео, PDF. SVG и HTML запрещены — в них можно спрятать скрипт
ALLOWED_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "application/pdf",
    }
)

_CHUNK = 1024 * 1024
_SNIFF_BYTES = 8192


@dataclass(frozen=True)
class StoredFile:
    key: str
    size: int
    content_type: str


class FileStorage(Protocol):
    def save(self, stream: BinaryIO, max_bytes: int) -> StoredFile: ...

    def path(self, key: str) -> Path: ...

    def delete(self, key: str) -> None: ...


class LocalFileStorage:
    def __init__(self, base_dir: str | Path) -> None:
        self.base = Path(base_dir).resolve()

    def _target(self, key: str) -> Path:
        # Ключ генерируем сами, но всё равно не выпускаем путь за пределы каталога
        if not re.fullmatch(r"[a-f0-9]{32}", key):
            raise AppError("invalid_storage_key", "Некорректный ключ файла", 400)
        return self.base / key[:2] / key

    def save(self, stream: BinaryIO, max_bytes: int) -> StoredFile:
        head = stream.read(_SNIFF_BYTES)
        if not head:
            raise AppError("empty_file", "Файл пустой")

        # Тип — по сигнатуре содержимого
        kind = filetype.guess(head)
        content_type = kind.mime if kind else None
        if content_type not in ALLOWED_TYPES:
            raise AppError(
                "file_type_not_allowed",
                "Допустимы только изображения (JPG, PNG, GIF, WebP), видео (MP4, WebM, MOV) и PDF",
                415,
            )

        key = secrets.token_hex(16)
        target = self._target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".part")

        # Пишем потоком и обрываем, как только превышен лимит
        size = 0
        try:
            with tmp.open("wb") as out:
                chunk = head
                while chunk:
                    size += len(chunk)
                    if size > max_bytes:
                        limit_mb = max_bytes // (1024 * 1024)
                        raise AppError(
                            "file_too_large", f"Файл больше {limit_mb} МБ — приложите ссылку", 413
                        )
                    out.write(chunk)
                    chunk = stream.read(_CHUNK)
            os.replace(tmp, target)
        finally:
            tmp.unlink(missing_ok=True)
        return StoredFile(key=key, size=size, content_type=content_type)

    def path(self, key: str) -> Path:
        return self._target(key)

    def delete(self, key: str) -> None:
        self._target(key).unlink(missing_ok=True)


def get_storage() -> FileStorage:
    return LocalFileStorage(get_settings().upload_dir)


def safe_filename(name: str | None, fallback: str = "file") -> str:
    """Имя файла для показа: без пути, управляющих символов и с ограничением длины."""
    name = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(
        ch for ch in unicodedata.normalize("NFC", name) if unicodedata.category(ch)[0] != "C"
    )
    name = name.strip(" .")
    if not name:
        return fallback
    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 200 - len(ext) - 1] + "." + ext) if dot and len(ext) <= 10 else name[:200]
    return name
