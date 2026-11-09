"""Жизненный цикл задачи: переходы статусов, история, учёт времени, гонка «Взять»."""

import asyncio
from collections.abc import Callable
from datetime import timedelta

from httpx import AsyncClient

from app.models.user import Role, User
from tests.conftest import FakeClock
from tests.factories import create_user
from tests.helpers import act, create_task, event_types, ok

AsUser = Callable[[User], AsyncClient]


async def test_full_cycle_with_revision_counts_pure_work_time(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    task = await create_task(buyer)
    tid = task["id"]
    assert task["status"] == "new"
    assert task["assignee"] is None

    # Взял → через 2 ч сдал
    fake_clock.advance(minutes=30)
    t = ok(await act(creative, tid, "take"))
    assert t["status"] == "in_progress"
    fake_clock.advance(hours=2)
    first_submit = fake_clock.current
    t = ok(await act(creative, tid, "submit"))
    assert t["status"] == "review"

    # Байер проверял 5 ч — это время не идёт в работу креативщика
    fake_clock.advance(hours=5)
    t = ok(await act(buyer, tid, "request-revision", comment="Крупнее текст"))
    assert t["status"] == "revision"
    assert t["revision_count"] == 1
    assert t["revision_comment"] == "Крупнее текст"

    # Правка 1 ч → сдал исправленное → принято
    fake_clock.advance(hours=1)
    ok(await act(creative, tid, "submit"))
    fake_clock.advance(hours=3)
    t = ok(await act(buyer, tid, "accept"))

    assert t["status"] == "done"
    assert t["work_seconds"] == 3 * 3600
    assert t["first_submitted_at"].startswith(first_submit.isoformat()[:19])
    assert t["completed_at"] is not None
    assert await event_types(buyer, tid) == [
        "created",
        "taken",
        "submitted",
        "revision_requested",
        "resubmitted",
        "accepted",
    ]


async def test_open_interval_counts_until_now(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    fake_clock.advance(minutes=90)

    assert ok(await creative.get(f"/api/tasks/{tid}"))["work_seconds"] == 90 * 60


async def test_events_record_status_transitions_and_actor(as_user: AsUser) -> None:
    buyer_user = await create_user(Role.BUYER, full_name="Анна")
    creative_user = await create_user(Role.CREATIVE, full_name="Иван")
    buyer, creative = as_user(buyer_user), as_user(creative_user)
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    events = ok(await buyer.get(f"/api/tasks/{tid}/events"))

    assert events[1]["type"] == "taken"
    assert events[1]["from_status"] == "new"
    assert events[1]["to_status"] == "in_progress"
    assert events[1]["actor"]["full_name"] == "Иван"


async def test_take_already_taken_task_conflict(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    first = as_user(await create_user(Role.CREATIVE))
    second = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(first, tid, "take"))

    resp = await act(second, tid, "take")

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "task_already_taken"


async def test_concurrent_take_only_one_wins(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creatives = [as_user(await create_user(Role.CREATIVE)) for _ in range(5)]
    tid = (await create_task(buyer))["id"]

    results = await asyncio.gather(*(act(c, tid, "take") for c in creatives))

    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409, 409, 409, 409]
    events = await event_types(buyer, tid)
    assert events.count("taken") == 1


async def test_creative_cannot_take_own_task(as_user: AsUser) -> None:
    both = as_user(await create_user(Role.BUYER, Role.CREATIVE))
    tid = (await create_task(both))["id"]

    resp = await act(both, tid, "take")

    assert resp.status_code == 403
    assert "собственную" in resp.json()["error"]["message"]


async def test_role_and_ownership_checks(as_user: AsUser) -> None:
    author = as_user(await create_user(Role.BUYER))
    other_buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    other_creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(author))["id"]

    # Байер не берёт задачи; креативщик не создаёт
    assert (await act(author, tid, "take")).status_code == 403
    assert (await creative.post("/api/tasks", json={})).status_code in (403, 422)

    ok(await act(creative, tid, "take"))
    # Сдаёт только исполнитель
    assert (await act(other_creative, tid, "submit")).status_code == 403
    ok(await act(creative, tid, "submit"))

    # Принимает только автор или руководитель
    assert (await act(other_buyer, tid, "accept")).status_code == 403
    assert (await act(creative, tid, "accept")).status_code == 403
    ok(await act(author, tid, "accept"))


async def test_creative_cannot_create_task(as_user: AsUser) -> None:
    creative = as_user(await create_user(Role.CREATIVE))
    resp = await creative.post(
        "/api/tasks",
        json={"offer": "X", "geo": "BR", "creative_type": "video", "quantity": 1},
    )
    assert resp.status_code == 403


async def test_wrong_status_returns_409(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]

    resp = await act(buyer, tid, "accept")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "invalid_status"
    assert "Новые" in resp.json()["error"]["message"]

    ok(await act(creative, tid, "take"))
    assert (await act(buyer, tid, "request-revision", comment="x")).status_code == 409


async def test_revision_requires_comment(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    assert (await act(buyer, tid, "request-revision", comment="   ")).status_code == 422
    assert (await act(buyer, tid, "request-revision")).status_code == 422


async def test_head_can_do_everything_buyer_can(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    ok(await act(head, tid, "request-revision", comment="Правки от руководителя"))
    ok(await act(creative, tid, "submit"))
    ok(await act(head, tid, "accept"))

    # И создать свою задачу
    await create_task(head)


async def test_task_not_found(as_user: AsUser) -> None:
    c = as_user(await create_user(Role.HEAD))
    assert (await c.get("/api/tasks/999")).status_code == 404
    assert (await act(c, 999, "take")).status_code == 404
    assert (await c.get("/api/tasks/999/events")).status_code == 404


# ---------- отмена ----------


async def test_cancel_closes_work_interval_and_hides_from_board(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    fake_clock.advance(hours=1)

    t = ok(await act(buyer, tid, "cancel", reason="Оффер остановлен"))
    fake_clock.advance(hours=5)

    assert t["status"] == "cancelled"
    assert t["cancel_reason"] == "Оффер остановлен"
    assert ok(await buyer.get(f"/api/tasks/{tid}"))["work_seconds"] == 3600
    board = ok(await buyer.get("/api/tasks"))
    assert board == []
    archive = ok(await buyer.get("/api/tasks", params={"status": "cancelled"}))
    assert [x["id"] for x in archive] == [tid]


async def test_cancel_rules(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]

    assert (await act(buyer, tid, "cancel")).status_code == 422
    assert (await act(creative, tid, "cancel", reason="x")).status_code == 403

    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))
    ok(await act(buyer, tid, "accept"))
    assert (await act(buyer, tid, "cancel", reason="поздно")).status_code == 409


async def test_cancelled_task_has_no_actions(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    t = ok(await act(buyer, tid, "cancel", reason="не нужно"))
    assert t["actions"] == []
    assert (await act(buyer, tid, "cancel", reason="ещё раз")).status_code == 409


# ---------- переназначение и снятие исполнителя ----------


async def test_reassign_moves_open_interval_to_new_assignee(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    ivan = await create_user(Role.CREATIVE, full_name="Иван")
    maria = await create_user(Role.CREATIVE, full_name="Мария")
    tid = (await create_task(buyer))["id"]
    ok(await act(as_user(ivan), tid, "take"))
    fake_clock.advance(hours=2)

    t = ok(await act(head, tid, "reassign", assignee_id=maria.id))
    assert t["assignee"]["full_name"] == "Мария"
    assert t["status"] == "in_progress"

    # Иван больше не может сдать, Мария — может
    assert (await act(as_user(ivan), tid, "submit")).status_code == 403
    fake_clock.advance(hours=1)
    t = ok(await act(as_user(maria), tid, "submit"))
    assert t["work_seconds"] == 3 * 3600

    events = ok(await head.get(f"/api/tasks/{tid}/events"))
    reassigned = next(e for e in events if e["type"] == "reassigned")
    assert reassigned["payload"]["from"]["full_name"] == "Иван"
    assert reassigned["payload"]["to"]["full_name"] == "Мария"


async def test_reassign_in_review_keeps_status(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    other = await create_user(Role.CREATIVE)
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    t = ok(await act(head, tid, "reassign", assignee_id=other.id))

    assert t["status"] == "review"
    assert t["assignee"]["id"] == other.id


async def test_reassign_validation(as_user: AsUser) -> None:
    buyer_user = await create_user(Role.BUYER, Role.CREATIVE)
    buyer = as_user(buyer_user)
    head = as_user(await create_user(Role.HEAD))
    creative_user = await create_user(Role.CREATIVE)
    pure_buyer = await create_user(Role.BUYER)
    inactive = await create_user(Role.CREATIVE, is_active=False)
    tid = (await create_task(buyer))["id"]

    # В «Новых» переназначать нечего
    assert (await act(head, tid, "reassign", assignee_id=creative_user.id)).status_code == 409

    ok(await act(as_user(creative_user), tid, "take"))
    for target in (pure_buyer.id, inactive.id, buyer_user.id, creative_user.id, 999):
        resp = await act(head, tid, "reassign", assignee_id=target)
        assert resp.status_code == 400, target
        assert resp.json()["error"]["code"] == "invalid_assignee"

    # Не руководитель — нельзя
    other = await create_user(Role.CREATIVE)
    assert (await act(buyer, tid, "reassign", assignee_id=other.id)).status_code == 403


async def test_unassign_returns_task_to_pool(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    first = as_user(await create_user(Role.CREATIVE))
    second = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(first, tid, "take"))
    fake_clock.advance(minutes=40)

    t = ok(await act(head, tid, "unassign"))
    assert t["status"] == "new"
    assert t["assignee"] is None

    fake_clock.advance(hours=3)
    ok(await act(second, tid, "take"))
    fake_clock.advance(minutes=20)
    t = ok(await act(second, tid, "submit"))
    # Время первого исполнителя сохранилось, простой в пуле не считается
    assert t["work_seconds"] == 60 * 60


async def test_unassign_not_allowed_in_review(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    assert (await act(head, tid, "unassign")).status_code == 409


# ---------- доступные действия ----------


async def test_actions_reflect_role_and_status(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]

    assert set(ok(await buyer.get(f"/api/tasks/{tid}"))["actions"]) == {
        "edit",
        "cancel",
        "add_reference",
    }
    assert ok(await creative.get(f"/api/tasks/{tid}"))["actions"] == ["take"]

    ok(await act(creative, tid, "take"))
    assert set(ok(await creative.get(f"/api/tasks/{tid}"))["actions"]) == {
        "submit",
        "add_result",
        "manage_ai_usage",
    }
    assert set(ok(await head.get(f"/api/tasks/{tid}"))["actions"]) == {
        "edit",
        "cancel",
        "reassign",
        "unassign",
        "add_reference",
        "manage_ai_usage",
    }


async def test_deadline_shift_is_tracked(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    deadline = fake_clock.current + timedelta(days=1)
    tid = (await create_task(buyer, deadline=deadline))["id"]

    new_deadline = deadline + timedelta(days=2)
    ok(await buyer.patch(f"/api/tasks/{tid}", json={"deadline": new_deadline.isoformat()}))

    events = ok(await buyer.get(f"/api/tasks/{tid}/events"))
    change = events[-1]["payload"]["changes"][0]
    assert change["field"] == "deadline"
    assert change["old"].startswith(deadline.isoformat()[:19])
    assert change["new"].startswith(new_deadline.isoformat()[:19])
