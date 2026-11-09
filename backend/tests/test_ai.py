"""Справочник AI-сервисов и расходы кредитов по задачам."""

import asyncio
from collections.abc import Callable

import pytest
from httpx import AsyncClient

from app.models.user import Role, User
from tests.factories import create_user
from tests.helpers import act, create_task, event_types, ok, submit_work

AsUser = Callable[[User], AsyncClient]


async def add_service(head: AsyncClient, name: str) -> dict:
    return ok(await head.post("/api/ai-services", json={"name": name}), 201)


async def add_usage(client: AsyncClient, task_id: int, service_id: int, credits: object):
    return await client.post(
        f"/api/tasks/{task_id}/ai-usage", json={"service_id": service_id, "credits": credits}
    )


# ---------- справочник ----------


async def test_head_manages_service_catalog(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    creative = as_user(await create_user(Role.CREATIVE))

    mj = await add_service(head, "  Midjourney  ")
    assert mj["name"] == "Midjourney"
    await add_service(head, "ElevenLabs")

    # Дубль без учёта регистра
    resp = await head.post("/api/ai-services", json={"name": "midjourney"})
    assert resp.status_code == 409

    # Креативщик видит список, но не меняет
    assert len(ok(await creative.get("/api/ai-services"))) == 2
    assert (await creative.post("/api/ai-services", json={"name": "X"})).status_code == 403
    assert (
        await creative.patch(f"/api/ai-services/{mj['id']}", json={"is_active": False})
    ).status_code == 403

    # Переименование и отключение
    ok(await head.patch(f"/api/ai-services/{mj['id']}", json={"name": "Midjourney v7"}))
    ok(await head.patch(f"/api/ai-services/{mj['id']}", json={"is_active": False}))
    active = [s["name"] for s in ok(await creative.get("/api/ai-services"))]
    assert active == ["ElevenLabs"]
    all_ = ok(await head.get("/api/ai-services", params={"include_inactive": True}))
    assert {s["name"] for s in all_} == {"ElevenLabs", "Midjourney v7"}


async def test_rename_to_existing_name_conflicts(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    a = await add_service(head, "Runway")
    await add_service(head, "Kling")
    resp = await head.patch(f"/api/ai-services/{a['id']}", json={"name": "KLING"})
    assert resp.status_code == 409


# ---------- расходы ----------


async def test_creative_tracks_usage_with_totals_per_service(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative_user = await create_user(Role.CREATIVE, full_name="Иван")
    creative = as_user(creative_user)
    mj = await add_service(head, "Midjourney")
    el = await add_service(head, "ElevenLabs")
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    item = ok(await add_usage(creative, tid, mj["id"], "12.5"), 201)
    assert item["credits"] == 12.5
    assert item["user"]["full_name"] == "Иван"
    ok(await add_usage(creative, tid, mj["id"], 7.25), 201)
    ok(await submit_work(creative, tid))
    # На проверке расходы ещё можно внести; правки — тоже учитываются
    ok(await add_usage(creative, tid, el["id"], 3), 201)
    ok(await act(buyer, tid, "request-revision", comment="правки"))
    ok(await add_usage(creative, tid, mj["id"], 5), 201)

    usage = ok(await buyer.get(f"/api/tasks/{tid}/ai-usage"))
    assert len(usage["items"]) == 4
    assert [(t["service"]["name"], t["credits"]) for t in usage["totals"]] == [
        ("ElevenLabs", 3.0),
        ("Midjourney", 24.75),
    ]
    assert (await event_types(buyer, tid)).count("ai_usage_added") == 4


@pytest.mark.parametrize("credits", [0, -1, "1.234", "abc", 10**11])
async def test_credits_validation(as_user: AsUser, credits: object) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    assert (await add_usage(creative, tid, mj["id"], credits)).status_code == 422


async def test_inactive_or_unknown_service_rejected(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    ok(await head.patch(f"/api/ai-services/{mj['id']}", json={"is_active": False}))
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))

    for sid in (mj["id"], 999):
        resp = await add_usage(creative, tid, sid, 1)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "ai_service_unavailable"


async def test_usage_permissions_by_status_and_role(as_user: AsUser) -> None:
    head_user = await create_user(Role.HEAD)
    head = as_user(head_user)
    buyer = as_user(await create_user(Role.BUYER))
    creative_user = await create_user(Role.CREATIVE)
    creative = as_user(creative_user)
    other = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    tid = (await create_task(buyer))["id"]

    # В «Новых» исполнителя нет — расходы вносить некому
    assert (await add_usage(creative, tid, mj["id"], 1)).status_code == 409
    ok(await act(creative, tid, "take"))
    assert (await add_usage(other, tid, mj["id"], 1)).status_code == 403
    assert (await add_usage(buyer, tid, mj["id"], 1)).status_code == 403
    item = ok(await add_usage(creative, tid, mj["id"], 1), 201)

    ok(await submit_work(creative, tid))
    ok(await act(buyer, tid, "accept"))

    # После «Готово» креативщик не может, руководитель — может (решение №15)
    assert (await add_usage(creative, tid, mj["id"], 1)).status_code == 409
    upd = f"/api/ai-usage/{item['id']}"
    assert (await creative.patch(upd, json={"credits": 2})).status_code == 409
    by_head = ok(await add_usage(head, tid, mj["id"], 4), 201)
    # Запись руководителя всё равно на исполнителя
    assert by_head["user"]["id"] == creative_user.id
    assert ok(await head.patch(upd, json={"credits": 2}))["credits"] == 2.0


async def test_update_and_remove_usage_tracked_in_history(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    runway = await add_service(head, "Runway")
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    item = ok(await add_usage(creative, tid, mj["id"], 10), 201)

    upd = ok(
        await creative.patch(
            f"/api/ai-usage/{item['id']}", json={"service_id": runway["id"], "credits": 15}
        )
    )
    assert upd["service"]["name"] == "Runway"
    assert upd["credits"] == 15.0
    assert (await creative.delete(f"/api/ai-usage/{item['id']}")).status_code == 204
    assert ok(await buyer.get(f"/api/tasks/{tid}/ai-usage"))["items"] == []

    events = ok(await buyer.get(f"/api/tasks/{tid}/events"))
    updated = next(e for e in events if e["type"] == "ai_usage_updated")
    assert updated["payload"]["changes"] == [
        {"field": "service", "old": "Midjourney", "new": "Runway"},
        {"field": "credits", "old": "10.00", "new": "15"},
    ]
    removed = next(e for e in events if e["type"] == "ai_usage_removed")
    assert removed["payload"]["service"] == "Runway"


async def test_after_reassign_creative_edits_only_own_records(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    ivan = as_user(await create_user(Role.CREATIVE))
    maria_user = await create_user(Role.CREATIVE)
    maria = as_user(maria_user)
    mj = await add_service(head, "Midjourney")
    tid = (await create_task(buyer))["id"]
    ok(await act(ivan, tid, "take"))
    ivan_item = ok(await add_usage(ivan, tid, mj["id"], 10), 201)
    ok(await act(head, tid, "reassign", assignee_id=maria_user.id))

    # Иван больше не исполнитель, Мария не трогает записи Ивана
    assert (await add_usage(ivan, tid, mj["id"], 1)).status_code == 403
    assert (await maria.delete(f"/api/ai-usage/{ivan_item['id']}")).status_code == 403
    maria_item = ok(await add_usage(maria, tid, mj["id"], 3), 201)
    assert maria_item["user"]["id"] == maria_user.id


async def test_cancelled_task_usage_is_kept(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    ok(await add_usage(creative, tid, mj["id"], 8), 201)

    ok(await act(buyer, tid, "cancel", reason="стоп"))

    assert len(ok(await buyer.get(f"/api/tasks/{tid}/ai-usage"))["items"]) == 1


async def test_concurrent_remove_of_same_record(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    creative = as_user(await create_user(Role.CREATIVE))
    mj = await add_service(head, "Midjourney")
    tid = (await create_task(buyer))["id"]
    ok(await act(creative, tid, "take"))
    item = ok(await add_usage(creative, tid, mj["id"], 5), 201)

    results = await asyncio.gather(
        creative.delete(f"/api/ai-usage/{item['id']}"),
        head.delete(f"/api/ai-usage/{item['id']}"),
    )

    assert sorted(r.status_code for r in results) == [204, 404]


async def test_usage_not_found(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    assert (await head.patch("/api/ai-usage/999", json={"credits": 1})).status_code == 404
    assert (await head.delete("/api/ai-usage/999")).status_code == 404
    assert (await head.get("/api/tasks/999/ai-usage")).status_code == 404
