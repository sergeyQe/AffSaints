"""Единая точка получения текущего времени — тесты подменяют её, чтобы управлять временем."""

from datetime import UTC, datetime


def now() -> datetime:
    return datetime.now(UTC)
