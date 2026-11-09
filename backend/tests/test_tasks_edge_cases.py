"""Граничные случаи этапа 2 — по находкам аудита (А2-1…А2-6) и пробелам в тестах."""

import asyncio
from collections.abc import Callable
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.db import SessionFactory
from app.models.task import WorkInterval
from app.models.user import Role, User
from tests.conftest import FakeClock
from tests.factories import create_user
from tests.helpers import act, create_task, ok

AsUser = Callable[[User], AsyncClient]


async def intervals(task_id: int) -> list[tuple[int, str, bool]]:
    """Отрезки работы задачи: (user_id, kind, открыт ли)."""
    async with SessionFactory() as s:
        rows = await s.scalars(
            select(WorkInterval)
            .where(WorkInterval.task_id == task_id)
            .order_by(WorkInterval.started_at, WorkInterval.id)
        )
        return [(i.user_id, i.kind, i.ended_at is None) for i in rows]


# ---------- А2-1: перенос дедлайна после сдачи не стирает опоздание ----------


@pytest.mark.parametrize("new_deadline_days", [5, None])
async def test_moving_deadline_after_late_submit_keeps_late(
    as_user: AsUser, fake_clock: FakeClock, new_deadline_days: int | None
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer, deadline=fake_clock.current + timedelta(hours=1)))["id"]
    ok(await act(creative, tid, "take"))
    fake_clock.advance(hours=2)
    ok(await act(creative, tid, "submit"))

    new = (
        None
        if new_deadline_days is None
        else (fake_clock.current + timedelta(days=new_deadline_days)).isoformat()
    )
    t = ok(await buyer.patch(f"/api/tasks/{tid}", json={"deadline": new}))

    assert t["overdue"] == "late"


async def test_deadline_added_after_submit_does_not_create_lateness(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    soon = (fake_clock.current + timedelta(minutes=30)).isoformat()
    ok(await buyer.patch(f"/api/tasks/{tid}", json={"deadline": soon}))
    fake_clock.advance(days=1)

    assert ok(await buyer.get(f"/api/tasks/{tid}"))["overdue"] == "none"


async def test_moving_deadline_before_submit_counts(as_user: AsUser, fake_clock: FakeClock) -> None:
    # До первой сдачи перенос дедлайна легален — это и есть «перенести срок»
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer, deadline=fake_clock.current + timedelta(hours=1)))["id"]
    ok(await act(creative, tid, "take"))
    later = (fake_clock.current + timedelta(days=1)).isoformat()
    ok(await buyer.patch(f"/api/tasks/{tid}", json={"deadline": later}))
    fake_clock.advance(hours=3)

    assert ok(await act(creative, tid, "submit"))["overdue"] == "none"


# ---------- А2-2: нельзя проверять собственную работу ----------


async def test_head_creative_cannot_review_own_work(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head_creative = as_user(await create_user(Role.HEAD, Role.CREATIVE))
    other_head = as_user(await create_user(Role.HEAD))
    tid = (await create_task(buyer))["id"]
    ok(await act(head_creative, tid, "take"))
    ok(await act(head_creative, tid, "submit"))

    t = ok(await head_creative.get(f"/api/tasks/{tid}"))
    assert "accept" not in t["actions"]
    assert (await act(head_creative, tid, "accept")).status_code == 403
    assert (await act(head_creative, tid, "request-revision", comment="x")).status_code == 403
    # Другой руководитель и автор — могут
    ok(await act(other_head, tid, "accept"))


# ---------- А2-3: пометка «ТЗ изменено» не переходит к новому исполнителю ----------


async def test_brief_changed_flag_reset_on_take(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    first = as_user(await create_user(Role.CREATIVE))
    second = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(first, tid, "take"))
    assert ok(await buyer.patch(f"/api/tasks/{tid}", json={"quantity": 9}))["brief_updated_at"]

    ok(await act(head, tid, "unassign"))
    t = ok(await act(second, tid, "take"))

    assert t["brief_updated_at"] is None


# ---------- А2-4: корректная ошибка «Взять» в закрытых статусах ----------


async def test_take_on_closed_or_own_task_is_invalid_status(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(buyer, tid, "cancel", reason="стоп"))

    resp = await act(creative, tid, "take")

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "invalid_status"


# ---------- А2-5: явный null только для дедлайна ----------


@pytest.mark.parametrize(
    "field", ["offer", "geo", "creative_type", "quantity", "description", "priority"]
)
async def test_explicit_null_is_rejected(as_user: AsUser, field: str) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    resp = await buyer.patch(f"/api/tasks/{tid}", json={field: None})
    assert resp.status_code == 422
    assert resp.json()["error"]["details"][0]["field"] == field


# ---------- А2-6: архив «Готово» и overdue=false ----------


async def test_explicit_done_status_ignores_done_days(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))
    ok(await act(buyer, tid, "accept"))
    fake_clock.advance(days=100)

    assert ok(await buyer.get("/api/tasks")) == []
    assert len(ok(await buyer.get("/api/tasks", params={"status": "done"}))) == 1


async def test_overdue_false_excludes_current_overdue(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    await create_task(buyer, offer="горит", deadline=fake_clock.current + timedelta(hours=1))
    await create_task(buyer, offer="спокойно")
    fake_clock.advance(hours=2)

    offers = [t["offer"] for t in ok(await buyer.get("/api/tasks", params={"overdue": False}))]
    assert offers == ["спокойно"]


# ---------- пробелы в тестах ----------


@pytest.mark.parametrize("stage", ["review", "revision"])
async def test_cancel_from_review_and_revision(
    as_user: AsUser, fake_clock: FakeClock, stage: str
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    fake_clock.advance(hours=1)
    ok(await act(creative, tid, "submit"))
    if stage == "revision":
        ok(await act(buyer, tid, "request-revision", comment="правки"))
        fake_clock.advance(minutes=30)

    t = ok(await act(buyer, tid, "cancel", reason="не нужно"))
    fake_clock.advance(hours=10)

    assert t["status"] == "cancelled"
    assert not any(is_open for _, _, is_open in await intervals(tid))
    expected = 3600 + (1800 if stage == "revision" else 0)
    assert ok(await buyer.get(f"/api/tasks/{tid}"))["work_seconds"] == expected


async def test_three_revision_rounds(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    creative_user = await create_user(Role.CREATIVE)
    creative = as_user(creative_user)
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    fake_clock.advance(hours=4)
    ok(await act(creative, tid, "submit"))

    for minutes in (60, 30, 15):
        fake_clock.advance(hours=2)  # ожидание проверки — не считается
        ok(await act(buyer, tid, "request-revision", comment=f"круг {minutes}"))
        fake_clock.advance(minutes=minutes)
        ok(await act(creative, tid, "submit"))

    t = ok(await act(buyer, tid, "accept"))
    assert t["revision_count"] == 3
    assert t["revision_comment"] == "круг 15"
    assert t["work_seconds"] == 4 * 3600 + (60 + 30 + 15) * 60
    kinds = [kind for _, kind, _ in await intervals(tid)]
    assert kinds == ["work", "revision", "revision", "revision"]


async def test_reassign_attributes_intervals_to_users(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    ivan = await create_user(Role.CREATIVE)
    maria = await create_user(Role.CREATIVE)
    tid = (await create_task(buyer))["id"]
    ok(await act(as_user(ivan), tid, "take"))
    ok(await act(as_user(ivan), tid, "submit"))
    ok(await act(buyer, tid, "request-revision", comment="правки"))

    # Переназначение в «Правках»: тип открытого отрезка сохраняется
    ok(await act(head, tid, "reassign", assignee_id=maria.id))

    assert await intervals(tid) == [
        (ivan.id, "work", False),
        (ivan.id, "revision", False),
        (maria.id, "revision", True),
    ]


async def test_unassign_from_revision(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))
    ok(await act(buyer, tid, "request-revision", comment="правки"))

    t = ok(await act(head, tid, "unassign"))

    assert t["status"] == "new"
    assert t["assignee"] is None
    assert not any(is_open for _, _, is_open in await intervals(tid))


async def test_concurrent_accept_and_cancel(as_user: AsUser) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await act(creative, tid, "submit"))

    accept, cancel = await asyncio.gather(
        act(buyer, tid, "accept"), act(head, tid, "cancel", reason="стоп")
    )

    # Ровно один переход выигрывает, второй получает 409
    assert sorted([accept.status_code, cancel.status_code]) == [200, 409]
    final = ok(await buyer.get(f"/api/tasks/{tid}"))["status"]
    assert final == ("done" if accept.status_code == 200 else "cancelled")


async def test_every_brief_field_is_tracked(as_user: AsUser, fake_clock: FakeClock) -> None:
    buyer = as_user(await create_user(Role.BUYER))
    tid = (await create_task(buyer))["id"]
    patch = {
        "offer": "Новый оффер",
        "geo": "MX",
        "creative_type": "static",
        "quantity": 9,
        "description": "Другое описание",
        "priority": "urgent",
        "deadline": (fake_clock.current + timedelta(days=2)).isoformat(),
    }

    ok(await buyer.patch(f"/api/tasks/{tid}", json=patch))

    events = ok(await buyer.get(f"/api/tasks/{tid}/events"))
    changed = [c["field"] for c in events[-1]["payload"]["changes"]]
    assert changed == list(patch)
