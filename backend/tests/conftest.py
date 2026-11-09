"""Общие фикстуры: отдельная тестовая БД, миграции раз за сессию, очистка таблиц перед тестом."""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

# Тестовая БД и каталог загрузок задаются до импорта приложения
TEST_DB_URL = os.environ.setdefault(
    "APP_TEST_DATABASE_URL",
    "postgresql+asyncpg://affsaints:affsaints@localhost:5440/affsaints_test",
)
os.environ["APP_DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault("APP_UPLOAD_DIR", str(Path(__file__).parent / ".uploads"))

import asyncpg  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


async def _ensure_database() -> None:
    # Создаём тестовую БД, если её ещё нет
    dsn = TEST_DB_URL.replace("+asyncpg", "")
    base_dsn, db_name = dsn.rsplit("/", 1)
    conn = await asyncpg.connect(f"{base_dsn}/postgres")
    try:
        exists = await conn.fetchval("select 1 from pg_database where datname = $1", db_name)
        if not exists:
            await conn.execute(f'create database "{db_name}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def _migrated_db() -> AsyncIterator[None]:
    await _ensure_database()
    # Схема поднимается настоящими миграциями — заодно проверяем их
    await asyncio.to_thread(
        subprocess.run,
        [sys.executable, "-m", "alembic", "-x", f"url={TEST_DB_URL}", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
    )
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables() -> None:
    # Каждый тест стартует с пустых таблиц
    tables = [t.name for t in reversed(Base.metadata.sorted_tables)]
    if tables:
        async with engine.begin() as conn:
            await conn.execute(text(f"truncate {', '.join(tables)} restart identity cascade"))


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
