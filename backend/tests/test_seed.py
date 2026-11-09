from collections import Counter
from datetime import timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select

from app.core import clock
from app.core.db import SessionFactory
from app.demo_content import STORIES, demo_image
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

    async def period(days: int) -> dict[str, Any]:
        params = {
            "date_from": (now - timedelta(days=days)).isoformat(),
            "date_to": (now + timedelta(days=1)).isoformat(),
        }
        result: dict[str, Any] = (await client.get("/api/analytics", params=params)).json()
        return result

    week, quarter = await period(7), await period(92)
    assert week["summary"]["created"] > 0
    assert week["summary"]["completed"] > 0
    assert quarter["summary"]["completed"] == 8
    assert quarter["overdue"]["late"] > 0
    assert quarter["overdue"]["current"] > 0
    assert quarter["summary"]["avg_work_seconds"] > 3600
    assert len(quarter["ai_credits"]["by_service"]) >= 6
    assert any(w["active_tasks"] > 0 for w in quarter["workload"])


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
