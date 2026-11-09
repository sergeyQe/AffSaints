"""Хранилище загруженных файлов — только запись и чтение байтов.

Что допустимо загружать, решает upload_policy; как ответить клиенту при ошибке — сервис вложений.
Интерфейс FileStorage позволяет заменить локальный диск на S3/MinIO, не трогая бизнес-логику.
"""

import os
import re
import secrets
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

from app.core.config import get_settings

_CHUNK = 1024 * 1024
_KEY_PATTERN = re.compile(r"[a-f0-9]{32}")


class StorageError(Exception):
    """Ошибка хранилища — не знает про HTTP; переводится в ответ API уровнем выше."""


class FileTooLarge(StorageError):
    def __init__(self, max_bytes: int) -> None:
        super().__init__(f"Файл больше {max_bytes} байт")
        self.max_bytes = max_bytes


@dataclass(frozen=True)
class StoredFile:
    key: str
    size: int


class FileStorage(Protocol):
    def save(self, stream: BinaryIO, max_bytes: int) -> StoredFile: ...

    def path(self, key: str) -> Path: ...

    def delete(self, key: str) -> None: ...

    def clear(self) -> None: ...


class LocalFileStorage:
    def __init__(self, base_dir: str | Path) -> None:
        self.base = Path(base_dir).resolve()

    def _target(self, key: str) -> Path:
        # Ключ генерируем сами, но всё равно не выпускаем путь за пределы каталога
        if not _KEY_PATTERN.fullmatch(key):
            raise StorageError("Некорректный ключ файла")
        return self.base / key[:2] / key

    def save(self, stream: BinaryIO, max_bytes: int) -> StoredFile:
        key = secrets.token_hex(16)
        target = self._target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".part")

        # Пишем потоком и обрываем, как только превышен лимит
        size = 0
        try:
            with tmp.open("wb") as out:
                while chunk := stream.read(_CHUNK):
                    size += len(chunk)
                    if size > max_bytes:
                        raise FileTooLarge(max_bytes)
                    out.write(chunk)
            os.replace(tmp, target)
        finally:
            tmp.unlink(missing_ok=True)
        return StoredFile(key=key, size=size)

    def path(self, key: str) -> Path:
        return self._target(key)

    def delete(self, key: str) -> None:
        self._target(key).unlink(missing_ok=True)

    def clear(self) -> None:
        # Удаляем только файлы хранилища (каталоги вида ab/<32 hex>), сам каталог не трогаем
        for path in self.base.glob("??/*"):
            if path.is_file() and re.fullmatch(r"[a-f0-9]{32}(\.part)?", path.name):
                path.unlink(missing_ok=True)


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
