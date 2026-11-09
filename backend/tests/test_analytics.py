"""Аналитика: расчёты на заранее известных данных (числа сверены вручную)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient

from app.models.user import Role, User
from tests.conftest import FakeClock
from tests.factories import create_user
from tests.helpers import act, create_task, ok, submit_work

AsUser = Callable[[User], AsyncClient]

PERIOD = {"date_from": "2026-11-01T00:00:00+00:00", "date_to": "2026-12-01T00:00:00+00:00"}


async def analytics(client: AsyncClient, **params: Any) -> dict[str, Any]:
    result: dict[str, Any] = ok(await client.get("/api/analytics", params={**PERIOD, **params}))
    return result


@pytest.fixture
async def scenario(as_user: AsUser, fake_clock: FakeClock) -> dict[str, Any]:
    """5 задач: 2 завершены (вовремя и с опозданием), 1 просрочена в работе, 1 новая, 1 отменена."""
    head_u = await create_user(Role.HEAD, full_name="Олег")
    anna_u = await create_user(Role.BUYER, full_name="Анна")
    boris_u = await create_user(Role.BUYER, full_name="Борис")
    ivan_u = await create_user(Role.CREATIVE, full_name="Иван")
    maria_u = await create_user(Role.CREATIVE, full_name="Мария")
    head, anna, boris = as_user(head_u), as_user(anna_u), as_user(boris_u)
    ivan, maria = as_user(ivan_u), as_user(maria_u)
    mj = ok(await head.post("/api/ai-services", json={"name": "Midjourney"}), 201)["id"]
    rw = ok(await head.post("/api/ai-services", json={"name": "Runway"}), 201)["id"]
    now = fake_clock.current

    t1 = (await create_task(anna, offer="Vavada", quantity=5, deadline=now + timedelta(days=1)))[
        "id"
    ]
    t2 = (await create_task(anna, offer="Pin-Up", quantity=3, deadline=now + timedelta(hours=1)))[
        "id"
    ]
    t3 = (await create_task(boris, offer="Vavada", quantity=2, deadline=now + timedelta(hours=2)))[
        "id"
    ]
    await create_task(boris, offer="Melbet", quantity=10)
    t5 = (await create_task(anna, offer="Cancel me", quantity=1))["id"]

    # T1: Иван — 2 ч работы, правка 30 мин; сдано вовремя
    ok(await act(ivan, t1, "take"))
    ok(await act(maria, t2, "take"))
    ok(await act(ivan, t3, "take"))
    await ivan.post(f"/api/tasks/{t1}/ai-usage", json={"service_id": mj, "credits": 10})
    await ivan.post(f"/api/tasks/{t1}/ai-usage", json={"service_id": rw, "credits": 5})
    await maria.post(f"/api/tasks/{t2}/ai-usage", json={"service_id": mj, "credits": "2.5"})
    fake_clock.advance(hours=2)
    ok(await submit_work(ivan, t1))
    fake_clock.advance(hours=1)
    ok(await act(anna, t1, "request-revision", comment="правки"))
    # T2: Мария сдаёт через 3 ч при дедлайне 1 ч — опоздание
    ok(await submit_work(maria, t2))
    fake_clock.advance(minutes=30)
    ok(await submit_work(ivan, t1))
    ok(await act(anna, t1, "accept"))
    ok(await act(anna, t2, "accept"))
    ok(await act(anna, t5, "cancel", reason="не нужно"))

    # Прошли сутки: дедлайн T3 давно истёк, задача не сдана
    fake_clock.advance(days=1)
    return {
        "head": head,
        "anna_u": anna_u,
        "boris_u": boris_u,
        "ivan_u": ivan_u,
        "maria_u": maria_u,
    }


async def test_summary_and_statuses(scenario: dict[str, Any]) -> None:
    data = await analytics(scenario["head"])

    assert data["summary"] == {
        "created": 5,
        "completed": 2,
        "cancelled": 1,
        "active_now": 1,
        "overdue_now": 1,
        # T1: 2 ч + 30 мин = 9000 с, T2: 3 ч = 10800 с
        "avg_work_seconds": 9900,
        "revisions_per_task": 0.5,
    }
    by_status = {s["status"]: s["count"] for s in data["by_status"]}
    assert by_status == {
        "new": 1,
        "in_progress": 1,
        "review": 0,
        "revision": 0,
        "done": 2,
        "cancelled": 1,
    }


async def test_workload(scenario: dict[str, Any]) -> None:
    rows = {r["user"]["full_name"]: r for r in (await analytics(scenario["head"]))["workload"]}

    assert rows["Иван"] | {"user": None} == {
        "user": None,
        "in_progress": 1,
        "review": 0,
        "revision": 0,
        "active_tasks": 1,
        "active_creatives": 2,
        "completed_in_period": 1,
        "avg_work_seconds": 9000,
    }
    assert rows["Мария"]["active_tasks"] == 0
    assert rows["Мария"]["completed_in_period"] == 1
    assert rows["Мария"]["avg_work_seconds"] == 10800


async def test_overdue(scenario: dict[str, Any]) -> None:
    overdue = (await analytics(scenario["head"]))["overdue"]

    assert overdue["on_time"] == 1
    assert overdue["late"] == 1
    assert overdue["missed"] == 1
    assert overdue["late_rate"] == pytest.approx(0.6667, abs=1e-4)
    assert overdue["current"] == 1
    rows = {r["user"]["full_name"]: r for r in overdue["by_executor"]}
    assert rows["Иван"] == rows["Иван"] | {"on_time": 1, "late": 0, "missed": 1, "current": 1}
    assert rows["Мария"] == rows["Мария"] | {"on_time": 0, "late": 1, "missed": 0, "current": 0}


async def test_ai_credits(scenario: dict[str, Any]) -> None:
    ai = (await analytics(scenario["head"]))["ai_credits"]

    assert [(s["service"], s["credits"]) for s in ai["by_service"]] == [
        ("Midjourney", 12.5),
        ("Runway", 5.0),
    ]
    assert sorted(
        (r["user"]["full_name"], r["service"], r["credits"]) for r in ai["by_executor"]
    ) == [
        ("Иван", "Midjourney", 10.0),
        ("Иван", "Runway", 5.0),
        ("Мария", "Midjourney", 2.5),
    ]


async def test_filters(scenario: dict[str, Any]) -> None:
    head = scenario["head"]

    by_boris = await analytics(head, buyer_id=scenario["boris_u"].id)
    assert by_boris["summary"]["created"] == 2
    assert by_boris["summary"]["completed"] == 0
    assert by_boris["ai_credits"]["by_service"] == []

    by_maria = await analytics(head, creative_id=scenario["maria_u"].id)
    assert [r["user"]["full_name"] for r in by_maria["workload"]] == ["Мария"]
    assert [s["credits"] for s in by_maria["ai_credits"]["by_service"]] == [2.5]
    assert by_maria["overdue"]["late"] == 1
    assert by_maria["overdue"]["missed"] == 0

    by_offer = await analytics(head, offer="vavada")
    assert by_offer["summary"]["created"] == 2


async def test_period_excludes_other_months(scenario: dict[str, Any]) -> None:
    data = ok(
        await scenario["head"].get(
            "/api/analytics",
            params={
                "date_from": "2026-10-01T00:00:00+00:00",
                "date_to": "2026-11-01T00:00:00+00:00",
            },
        )
    )
    assert data["summary"]["created"] == 0
    assert data["summary"]["completed"] == 0
    # Текущие показатели не зависят от периода
    assert data["summary"]["active_now"] == 1
    assert data["summary"]["overdue_now"] == 1
    assert data["overdue"]["current"] == 1
    assert len(data["timeline"]) == 31


async def test_workload_keeps_deactivated_creative_with_active_tasks(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    gone = await create_user(Role.CREATIVE, full_name="Уволенный")
    tid = (await create_task(buyer, quantity=4))["id"]
    ok(await act(as_user(gone), tid, "take"))

    # Креативщика отключили, задача осталась на нём
    ok(await head.patch(f"/api/users/{gone.id}", json={"is_active": False}))

    rows = {r["user"]["full_name"]: r for r in (await analytics(head))["workload"]}
    assert rows["Уволенный"]["active_tasks"] == 1
    assert rows["Уволенный"]["active_creatives"] == 4


async def test_late_is_attributed_to_first_submitter(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    ivan = as_user(await create_user(Role.CREATIVE, full_name="Иван"))
    maria_u = await create_user(Role.CREATIVE, full_name="Мария")
    tid = (await create_task(buyer, deadline=fake_clock.current + timedelta(hours=1)))["id"]
    ok(await act(ivan, tid, "take"))
    fake_clock.advance(hours=2)
    ok(await submit_work(ivan, tid))
    ok(await act(buyer, tid, "request-revision", comment="правки"))
    ok(await act(head, tid, "reassign", assignee_id=maria_u.id))

    rows = {r["user"]["full_name"]: r for r in (await analytics(head))["overdue"]["by_executor"]}
    assert rows["Иван"]["late"] == 1
    assert "Мария" not in rows


async def test_timeline_groups_by_user_timezone(as_user: AsUser, fake_clock: FakeClock) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    # 2026-11-02 20:00 UTC — во Владивостоке (+10) это уже 3 ноября
    fake_clock.current = datetime(2026, 11, 2, 20, 0, tzinfo=UTC)
    await create_task(buyer)

    async def created_on(tz: str) -> dict[str, int]:
        data = await analytics(head, tz=tz)
        return {p["day"]: p["created"] for p in data["timeline"] if p["created"]}

    assert await created_on("UTC") == {"2026-11-02": 1}
    assert await created_on("Asia/Vladivostok") == {"2026-11-03": 1}


async def test_empty_period_has_nulls_not_errors(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    data = await analytics(head)
    assert data["summary"]["avg_work_seconds"] is None
    assert data["overdue"]["late_rate"] is None


@pytest.mark.parametrize("role", [Role.BUYER, Role.CREATIVE])
async def test_only_head_sees_analytics(as_user: AsUser, role: Role) -> None:
    resp = await as_user(await create_user(role)).get("/api/analytics", params=PERIOD)
    assert resp.status_code == 403


@pytest.mark.parametrize(
    "params",
    [
        {**PERIOD, "date_to": PERIOD["date_from"]},
        {**PERIOD, "tz": "Mars/Olympus"},
        {"date_from": "2026-11-01T00:00:00", "date_to": "2026-12-01T00:00:00"},
        {"date_from": "2020-01-01T00:00:00+00:00", "date_to": "2026-01-01T00:00:00+00:00"},
    ],
)
async def test_query_validation(as_user: AsUser, params: dict[str, str]) -> None:
    resp = await as_user(await create_user(Role.HEAD)).get("/api/analytics", params=params)
    assert resp.status_code == 422
