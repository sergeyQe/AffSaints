"""Политика загрузки файлов: какие типы допустимы. Не зависит от того, где файлы хранятся.

Тип определяется по сигнатуре содержимого, а не по расширению или заголовку клиента.
"""

from typing import BinaryIO

import filetype

from app.core.errors import AppError

# Изображения, видео, PDF. SVG и HTML запрещены — в них можно спрятать скрипт
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

_SNIFF_BYTES = 8192


def detect_content_type(stream: BinaryIO) -> str:
    """Читает начало файла, возвращает MIME-тип и перематывает поток в начало."""
    head = stream.read(_SNIFF_BYTES)
    stream.seek(0)
    if not head:
        raise AppError("empty_file", "Файл пустой")
    kind = filetype.guess(head)
    content_type: str | None = kind.mime if kind else None
    if content_type is None or content_type not in ALLOWED_TYPES:
        raise AppError(
            "file_type_not_allowed",
            "Допустимы только изображения (JPG, PNG, GIF, WebP), видео (MP4, WebM, MOV) и PDF",
            415,
        )
    return content_type
