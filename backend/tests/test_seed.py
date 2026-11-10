import importlib.util
from collections import Counter
from datetime import timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select, text, update

from app.core import clock
from app.core.db import SessionFactory
from app.demo_content import STORIES, demo_image
from app.models.ai import AiUsage
from app.models.task import Task, TaskEvent, WorkInterval
from app.seed import DEMO_PASSWORD, DEMO_USERS, is_empty, seed, wipe


async def _seed() -> None:
    async with SessionFactory() as session:
        await seed(session)


async def _login_head(client: AsyncClient) -> None:
    resp = await client.post("/api/auth/login", json={"login": "head", "password": DEMO_PASSWORD})
    assert resp.status_code == 200


async def test_seed_creates_demo_users_who_can_login(client: AsyncClient) -> None:
    async with SessionFactory() as session:
        assert await is_empty(session)
    await _seed()

    demo = (await client.get("/api/auth/demo-users")).json()
    assert len(demo) == len(DEMO_USERS)
    await _login_head(client)


async def test_seed_covers_every_status_and_scenario() -> None:
    await _seed()
    async with SessionFactory() as session:
        statuses = Counter((await session.scalars(select(Task.status))).all())
        events = Counter((await session.scalars(select(TaskEvent.type))).all())
        intervals = await session.scalar(select(func.count()).select_from(WorkInterval))

    assert sum(statuses.values()) == len(STORIES) == 20
    assert statuses == {
        "done": 8,
        "review": 2,
        "revision": 2,
        "in_progress": 3,
        "new": 3,
        "cancelled": 2,
    }
    # Каждый тип сценария встречается: правки, переназначение, снятие, правка ТЗ, расходы, файлы
    for kind in (
        "revision_requested",
        "resubmitted",
        "reassigned",
        "assigned",
        "reopened",
        "unassigned",
        "updated",
        "cancelled",
        "ai_usage_added",
        "attachment_added",
    ):
        assert events[kind] > 0, kind
    assert intervals and intervals > 20


async def test_seed_makes_analytics_non_empty(client: AsyncClient) -> None:
    await _seed()
    await _login_head(client)
    now = clock.now()

    async def period(days: int, tab: str = "overview") -> dict[str, Any]:
        params = {
            "date_from": (now - timedelta(days=days)).isoformat(),
            "date_to": (now + timedelta(days=1)).isoformat(),
        }
        resp = await client.get(f"/api/analytics/{tab}", params=params)
        result: dict[str, Any] = resp.json()
        return result

    week, quarter = await period(7), await period(92)
    assert week["summary"]["created"] > 0
    assert week["summary"]["completed"] > 0
    assert quarter["summary"]["completed"] == 8
    assert any(w["active_tasks"] > 0 for w in quarter["workload"])

    # Все три вкладки на демо не пустые: время, ожидание, правки в AI-расходах
    time, ai = await period(92, "time"), await period(92, "ai")
    assert time["overdue"]["late"] > 0
    assert time["overdue"]["current"] > 0
    assert time["tiles"]["avg_work_seconds"] > 3600
    assert time["tiles"]["avg_revision_seconds"] > 0
    assert time["tiles"]["avg_review_wait_seconds"] > 0
    assert time["review_wait_by_reviewer"]
    assert time["waiting_now"]["count"] > 0
    assert len(ai["by_service"]) >= 6
    assert ai["revision_share"] and ai["revision_share"] > 0
    assert any(row["revisions"] > 0 for row in ai["by_task"])


async def test_wipe_and_reseed() -> None:
    await _seed()
    async with SessionFactory() as session:
        await wipe(session)
        await session.commit()
        assert await is_empty(session)
    await _seed()
    async with SessionFactory() as session:
        assert not await is_empty(session)


def test_demo_image_is_valid_png() -> None:
    data = demo_image(0)
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert b"IEND" in data[-12:]


def _load_migration(filename: str) -> ModuleType:
    # Каталог alembic/ проекта совпадает по имени с пакетом alembic — грузим файл по пути
    path = Path(__file__).resolve().parent.parent / "alembic" / "versions" / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_ai_usage_round_backfill_matches_live_rounds() -> None:
    # Миграция раскладывает старые расходы по кругам из истории; сид пишет круги «вживую».
    # Обнуляем круги, прогоняем SQL миграции — должно получиться то же самое
    migration = _load_migration("20261110_8c4e1f0a2b37_ai_usage_round.py")
    await _seed()
    async with SessionFactory() as session:
        live = dict((await session.execute(select(AiUsage.id, AiUsage.round))).all())
        assert any(r > 0 for r in live.values()), "в сиде нет расходов на правках"
        await session.execute(update(AiUsage).values(round=0))
        await session.execute(text(migration.BACKFILL_SQL))
        await session.commit()
        restored = dict((await session.execute(select(AiUsage.id, AiUsage.round))).all())
    assert restored == live
