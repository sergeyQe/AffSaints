"""Создание, редактирование ТЗ, список доски с фильтрами, просрочки."""

from collections.abc import Callable
from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.models.user import Role, User
from tests.conftest import FakeClock
from tests.factories import create_user
from tests.helpers import BRIEF, act, create_task, event_types, ok, submit_work

AsUser = Callable[[User], AsyncClient]


async def test_create_task_returns_full_card(as_user: AsUser, fake_clock: FakeClock) -> None:
    author = await create_user(Role.BUYER, full_name="Анна")
    deadline = fake_clock.current + timedelta(days=3)

    task = await create_task(as_user(author), deadline=deadline, priority="urgent")

    assert task["offer"] == BRIEF["offer"]
    assert task["quantity"] == 5
    assert task["priority"] == "urgent"
    assert task["status"] == "new"
    assert task["author"] == {"id": author.id, "full_name": "Анна"}
    assert task["overdue"] == "none"
    assert task["work_seconds"] == 0
    assert await event_types(as_user(author), task["id"]) == ["created"]


@pytest.mark.parametrize(
    "patch",
    [
        {"quantity": 0},
        {"quantity": 1001},
        {"offer": "   "},
        {"geo": ""},
        {"creative_type": "podcast"},
        {"priority": "asap"},
        {"deadline": "2026-12-01T10:00:00"},  # без часового пояса
    ],
)
async def test_create_validation(as_user: AsUser, patch: dict) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    resp = await buyer.post("/api/tasks", json={**BRIEF, **patch})
    assert resp.status_code == 422


async def test_deadline_in_past_rejected(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    resp = await buyer.post(
        "/api/tasks",
        json={**BRIEF, "deadline": (fake_clock.current - timedelta(hours=1)).isoformat()},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "deadline_in_past"


async def test_task_without_deadline_is_allowed(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    task = await create_task(buyer)
    assert task["deadline"] is None


# ---------- редактирование ----------


async def test_edit_records_diff_and_marks_brief_changed_after_take(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]

    # До взятия — правка без пометки
    t = ok(await buyer.patch(f"/api/tasks/{tid}", json={"quantity": 7}))
    assert t["quantity"] == 7
    assert t["brief_updated_at"] is None

    ok(await act(creative, tid, "take"))
    t = ok(await buyer.patch(f"/api/tasks/{tid}", json={"geo": "MX", "priority": "high"}))
    assert t["brief_updated_at"] is not None

    events = ok(await buyer.get(f"/api/tasks/{tid}/events"))
    updates = [e for e in events if e["type"] == "updated"]
    assert updates[0]["payload"]["changes"] == [{"field": "quantity", "old": 5, "new": 7}]
    assert updates[1]["payload"]["changes"] == [
        {"field": "geo", "old": "BR", "new": "MX"},
        {"field": "priority", "old": "normal", "new": "high"},
    ]


async def test_noop_edit_does_not_create_event(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    ok(await buyer.patch(f"/api/tasks/{tid}", json={"quantity": 5, "geo": "BR"}))
    assert await event_types(buyer, tid) == ["created"]


async def test_explicit_null_removes_deadline(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer, deadline=fake_clock.current + timedelta(days=1)))["id"]

    # Поле не передано — дедлайн остаётся
    t = ok(await buyer.patch(f"/api/tasks/{tid}", json={"quantity": 2}))
    assert t["deadline"] is not None

    t = ok(await buyer.patch(f"/api/tasks/{tid}", json={"deadline": None}))
    assert t["deadline"] is None


async def test_edit_permissions_and_closed_task(as_user: AsUser) -> None:
    author = as_user(await create_user(Role.BUYER))
    other_buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(author))["id"]

    assert (await other_buyer.patch(f"/api/tasks/{tid}", json={"quantity": 2})).status_code == 403
    assert (await creative.patch(f"/api/tasks/{tid}", json={"quantity": 2})).status_code == 403
    ok(await head.patch(f"/api/tasks/{tid}", json={"quantity": 2}))

    # Редактирование возможно в любом статусе до «Готово» (решение №9)
    ok(await act(creative, tid, "take"))
    ok(await submit_work(creative, tid))
    ok(await author.patch(f"/api/tasks/{tid}", json={"description": "Уточнение"}))
    ok(await act(author, tid, "accept"))
    resp = await author.patch(f"/api/tasks/{tid}", json={"quantity": 3})
    assert resp.status_code == 409


async def test_edit_deadline_to_past_rejected(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    past = (fake_clock.current - timedelta(days=1)).isoformat()
    resp = await buyer.patch(f"/api/tasks/{tid}", json={"deadline": past})
    assert resp.status_code == 400


# ---------- просрочки ----------


async def test_overdue_states(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    soon = fake_clock.current + timedelta(hours=2)
    on_time = (await create_task(buyer, deadline=soon, offer="В срок"))["id"]
    late = (await create_task(buyer, deadline=soon, offer="Поздно"))["id"]
    never = (await create_task(buyer, deadline=soon, offer="Не сдано"))["id"]
    no_deadline = (await create_task(buyer, offer="Без срока"))["id"]

    ok(await act(creative, on_time, "take"))
    ok(await submit_work(creative, on_time))
    ok(await act(creative, late, "take"))
    fake_clock.advance(hours=3)
    ok(await submit_work(creative, late))

    async def overdue(tid: int) -> str:
        return str(ok(await buyer.get(f"/api/tasks/{tid}"))["overdue"])

    assert await overdue(on_time) == "none"
    assert await overdue(late) == "late"
    assert await overdue(never) == "current"
    assert await overdue(no_deadline) == "none"

    # Правки после сдачи в срок на просрочку не влияют
    ok(await act(buyer, on_time, "request-revision", comment="ещё"))
    fake_clock.advance(days=2)
    ok(await submit_work(creative, on_time))
    assert await overdue(on_time) == "none"

    # Фильтр «только текущие просрочки»
    current = ok(await buyer.get("/api/tasks", params={"overdue": True}))
    assert [t["offer"] for t in current] == ["Не сдано"]


# ---------- доска: сортировка и фильтры ----------


async def test_board_sorting_priority_then_deadline(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    now = fake_clock.current
    await create_task(buyer, offer="normal-no-deadline")
    await create_task(buyer, offer="normal-later", deadline=now + timedelta(days=5))
    await create_task(buyer, offer="normal-sooner", deadline=now + timedelta(days=1))
    await create_task(buyer, offer="urgent", priority="urgent")
    await create_task(buyer, offer="low", priority="low", deadline=now + timedelta(hours=1))

    board = ok(await buyer.get("/api/tasks"))

    assert [t["offer"] for t in board] == [
        "urgent",
        "normal-sooner",
        "normal-later",
        "normal-no-deadline",
        "low",
    ]


async def test_board_filters(as_user: AsUser) -> None:
    anna_user = await create_user(Role.BUYER)
    anna = as_user(anna_user)
    boris = as_user(await create_user(Role.BUYER))
    ivan_user = await create_user(Role.CREATIVE)
    await create_task(anna, offer="Vavada Casino", geo="BR")
    t2 = await create_task(boris, offer="Pin-Up 100%", geo="KZ", priority="high")
    await create_task(boris, offer="Betting_Pro", geo="BR")
    ok(await act(as_user(ivan_user), t2["id"], "take"))

    async def offers(**params: object) -> list[str]:
        return [t["offer"] for t in ok(await anna.get("/api/tasks", params=params))]

    assert await offers(offer="vavada") == ["Vavada Casino"]
    assert await offers(geo="br") == ["Vavada Casino", "Betting_Pro"]
    assert await offers(author_id=anna_user.id) == ["Vavada Casino"]
    assert await offers(assignee_id=ivan_user.id) == ["Pin-Up 100%"]
    assert await offers(priority="high") == ["Pin-Up 100%"]
    assert await offers(status="in_progress") == ["Pin-Up 100%"]
    # Спецсимволы LIKE экранируются
    assert await offers(offer="100%") == ["Pin-Up 100%"]
    assert await offers(offer="g_P") == ["Betting_Pro"]
    assert await offers(offer="%") == ["Pin-Up 100%"]


async def test_board_hides_old_done_tasks(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await submit_work(creative, tid))
    ok(await act(buyer, tid, "accept"))

    assert len(ok(await buyer.get("/api/tasks"))) == 1
    fake_clock.advance(days=31)
    assert ok(await buyer.get("/api/tasks")) == []
    assert len(ok(await buyer.get("/api/tasks", params={"done_days": 60}))) == 1


async def test_board_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/tasks")).status_code == 401
