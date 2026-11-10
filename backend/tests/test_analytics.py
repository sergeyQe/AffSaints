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


async def analytics(client: AsyncClient, tab: str = "overview", **params: Any) -> dict[str, Any]:
    """Вкладка аналитики: overview — пользователи и задачи, ai — AI-расходы, time — время."""
    resp = await client.get(f"/api/analytics/{tab}", params={**PERIOD, **params})
    result: dict[str, Any] = ok(resp)
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
    overdue = (await analytics(scenario["head"], "time"))["overdue"]

    assert overdue["on_time"] == 1
    assert overdue["late"] == 1
    assert overdue["missed"] == 1
    assert overdue["late_rate"] == pytest.approx(0.6667, abs=1e-4)
    assert overdue["current"] == 1
    rows = {r["user"]["full_name"]: r for r in overdue["by_executor"]}
    assert rows["Иван"] == rows["Иван"] | {"on_time": 1, "late": 0, "missed": 1, "current": 1}
    assert rows["Мария"] == rows["Мария"] | {"on_time": 0, "late": 1, "missed": 0, "current": 0}


async def test_ai_credits(scenario: dict[str, Any]) -> None:
    ai = await analytics(scenario["head"], "ai")

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
    assert (await analytics(head, "ai", buyer_id=scenario["boris_u"].id))["by_service"] == []

    by_maria = await analytics(head, creative_id=scenario["maria_u"].id)
    assert [r["user"]["full_name"] for r in by_maria["workload"]] == ["Мария"]
    maria_ai = await analytics(head, "ai", creative_id=scenario["maria_u"].id)
    assert [s["credits"] for s in maria_ai["by_service"]] == [2.5]
    maria_overdue = (await analytics(head, "time", creative_id=scenario["maria_u"].id))["overdue"]
    assert maria_overdue["late"] == 1
    assert maria_overdue["missed"] == 0

    by_offer = await analytics(head, offer="vavada")
    assert by_offer["summary"]["created"] == 2


async def test_period_excludes_other_months(scenario: dict[str, Any]) -> None:
    october = {"date_from": "2026-10-01T00:00:00+00:00", "date_to": "2026-11-01T00:00:00+00:00"}
    data = await analytics(scenario["head"], **october)
    time = await analytics(scenario["head"], "time", **october)
    assert data["summary"]["created"] == 0
    assert data["summary"]["completed"] == 0
    # Текущие показатели не зависят от периода
    assert data["summary"]["active_now"] == 1
    assert data["summary"]["overdue_now"] == 1
    assert time["overdue"]["current"] == 1
    assert time["tiles"]["completed"] == 0
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

    overdue = (await analytics(head, "time"))["overdue"]
    rows = {r["user"]["full_name"]: r for r in overdue["by_executor"]}
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
    assert (await analytics(head))["summary"]["revisions_per_task"] is None
    time = await analytics(head, "time")
    assert time["tiles"] == {
        "completed": 0,
        "avg_work_seconds": None,
        "avg_revision_seconds": None,
        "avg_review_wait_seconds": None,
        "avg_pool_wait_seconds": None,
    }
    assert time["overdue"]["late_rate"] is None
    assert time["waiting_now"] == {"count": 0, "oldest_task_id": None, "oldest_seconds": None}
    ai = await analytics(head, "ai")
    assert ai["records"] == 0
    assert ai["revision_share"] is None


@pytest.mark.parametrize("tab", ["overview", "ai", "time"])
@pytest.mark.parametrize("role", [Role.BUYER, Role.CREATIVE])
async def test_only_head_sees_analytics(as_user: AsUser, role: Role, tab: str) -> None:
    resp = await as_user(await create_user(role)).get(f"/api/analytics/{tab}", params=PERIOD)
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
    head = as_user(await create_user(Role.HEAD))
    for tab in ("overview", "ai", "time"):
        assert (await head.get(f"/api/analytics/{tab}", params=params)).status_code == 422


async def test_head_move_is_attributed_to_assignee(as_user: AsUser, fake_clock: FakeClock) -> None:
    head = as_user(await create_user(Role.HEAD, full_name="Олег"))
    buyer = as_user(await create_user(Role.BUYER))
    ivan_u = await create_user(Role.CREATIVE, full_name="Иван")
    tid = (await create_task(buyer, deadline=fake_clock.current + timedelta(hours=1)))["id"]
    ok(await act(head, tid, "move", status="in_progress", assignee_id=ivan_u.id))
    fake_clock.advance(hours=2)
    ok(await act(head, tid, "move", status="done"))

    # Сдача с опозданием, завершение и время — за исполнителем, не за руководителем
    data = await analytics(head)
    time = await analytics(head, "time")
    overdue = {r["user"]["full_name"]: r for r in time["overdue"]["by_executor"] if r["user"]}
    assert overdue["Иван"]["late"] == 1
    assert "Олег" not in overdue
    creatives = {r["user"]["full_name"]: r for r in time["by_creative"]}
    assert creatives["Иван"]["work_seconds"] == 2 * 60 * 60
    assert "Олег" not in creatives
    workload = {r["user"]["full_name"]: r for r in data["workload"]}
    assert workload["Иван"]["completed_in_period"] == 1
    assert workload["Иван"]["avg_work_seconds"] == 2 * 60 * 60


async def test_ai_tab_splits_first_version_and_revisions(as_user: AsUser) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    ivan = as_user(await create_user(Role.CREATIVE, full_name="Иван"))
    mj = ok(await head.post("/api/ai-services", json={"name": "Midjourney"}), 201)["id"]
    rw = ok(await head.post("/api/ai-services", json={"name": "Runway"}), 201)["id"]
    tid = (await create_task(buyer, offer="1win", geo="KZ"))["id"]
    ok(await act(ivan, tid, "take"))

    async def spend(service: int, credits: int) -> None:
        body = {"service_id": service, "credits": credits}
        ok(await ivan.post(f"/api/tasks/{tid}/ai-usage", json=body), 201)

    # Первая версия: MJ 20, Runway 10; правки №1: MJ 10; правки №2: MJ 5
    await spend(mj, 20)
    await spend(rw, 10)
    ok(await submit_work(ivan, tid))
    ok(await act(buyer, tid, "request-revision", comment="правки"))
    await spend(mj, 10)
    ok(await submit_work(ivan, tid))
    ok(await act(buyer, tid, "request-revision", comment="ещё"))
    await spend(mj, 5)

    ai = await analytics(head, "ai")
    assert ai["records"] == 4
    # Общая доля по всем сервисам: 15 из 45
    assert ai["revision_share"] == pytest.approx(0.3333, abs=1e-4)
    services = {s["service"]: s for s in ai["by_service"]}
    assert services["Midjourney"] | {"service_id": 0} == {
        "service_id": 0,
        "service": "Midjourney",
        "credits": 35.0,
        "first_version": 20.0,
        "revisions": 15.0,
        "revision_share": pytest.approx(0.4286, abs=1e-4),
    }
    assert services["Runway"]["revision_share"] == 0.0
    executors = {(r["user"]["full_name"], r["service"]): r for r in ai["by_executor"]}
    assert executors[("Иван", "Midjourney")]["revisions"] == 15.0
    by_task = {(r["task_id"], r["service"]): r for r in ai["by_task"]}
    row = by_task[(tid, "Midjourney")]
    assert (row["offer"], row["geo"], row["user"]["full_name"]) == ("1win", "KZ", "Иван")
    assert (row["first_version"], row["revisions"], row["credits"]) == (20.0, 15.0, 35.0)
    assert row["rounds"] == [{"round": 1, "credits": 10.0}, {"round": 2, "credits": 5.0}]
    # Самые затратные сверху
    assert [r["service"] for r in ai["by_task"]] == ["Midjourney", "Runway"]
    assert ai["by_task_truncated"] is False


async def test_time_tab(scenario: dict[str, Any]) -> None:
    time = await analytics(scenario["head"], "time")

    # T1 (Иван): работа 2 ч, ожидание проверки 1 ч, правки 30 мин, принята сразу после сдачи.
    # T2 (Мария): работа 3 ч, ожидание проверки 30 мин. Обе взяты сразу после создания
    assert time["tiles"] == {
        "completed": 2,
        "avg_work_seconds": (7200 + 10800) // 2,
        "avg_revision_seconds": (1800 + 0) // 2,
        "avg_review_wait_seconds": (3600 + 1800) // 2,
        "avg_pool_wait_seconds": 0,
    }
    creatives = {r["user"]["full_name"]: r for r in time["by_creative"]}
    assert creatives["Иван"] | {"user": None} == {
        "user": None,
        "completed": 1,
        "work_seconds": 7200,
        "revision_seconds": 1800,
        "avg_task_seconds": 9000,
        "revisions_per_task": 1.0,
    }
    assert creatives["Мария"]["work_seconds"] == 10800
    assert creatives["Мария"]["revisions_per_task"] == 0.0
    tasks = {r["offer"]: r for r in time["by_task"]}
    assert tasks["Vavada"] | {"task_id": 0, "completed_at": None, "user": None} == {
        "task_id": 0,
        "offer": "Vavada",
        "geo": "BR",
        "user": None,
        "completed_at": None,
        "work_seconds": 7200,
        "revision_seconds": 1800,
        "revision_count": 1,
        "review_wait_seconds": 3600,
        "pool_wait_seconds": 0,
        "deadline": "on_time",
    }
    assert tasks["Pin-Up"]["deadline"] == "late"
    assert tasks["Pin-Up"]["review_wait_seconds"] == 1800
    # Обе приняла Анна — ей и засчитано ожидание проверки
    reviewers = [
        (r["user"]["full_name"], r["tasks"], r["avg_seconds"], r["max_seconds"])
        for r in time["review_wait_by_reviewer"]
    ]
    assert reviewers == [("Анна", 2, 2700, 3600)]
    assert time["waiting_now"]["count"] == 0


async def test_review_wait_goes_to_acceptor_and_pool_wait(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    head = as_user(await create_user(Role.HEAD, full_name="Олег"))
    buyer = as_user(await create_user(Role.BUYER, full_name="Анна"))
    ivan_u = await create_user(Role.CREATIVE, full_name="Иван")
    ivan = as_user(ivan_u)
    first = (await create_task(buyer, offer="A"))["id"]
    second = (await create_task(buyer, offer="B"))["id"]
    waiting = (await create_task(buyer, offer="C"))["id"]

    # A: час в пуле, возврат в пул и ещё 30 мин в пуле, проверка 2 ч — принял руководитель
    fake_clock.advance(hours=1)
    ok(await act(ivan, first, "take"))
    ok(await act(head, first, "unassign"))
    fake_clock.advance(minutes=30)
    ok(await act(ivan, first, "take"))
    ok(await submit_work(ivan, first))
    fake_clock.advance(hours=2)
    ok(await act(head, first, "accept"))
    # B: руководитель переносом сразу в «Готово» — на проверке не была
    ok(await act(head, second, "move", status="done", assignee_id=ivan_u.id))
    # C: сдана и ждёт проверки 45 минут
    ok(await act(ivan, waiting, "take"))
    ok(await submit_work(ivan, waiting))
    fake_clock.advance(minutes=45)

    time = await analytics(head, "time")
    tasks = {r["offer"]: r for r in time["by_task"]}
    assert tasks["A"]["pool_wait_seconds"] == 90 * 60
    assert tasks["A"]["review_wait_seconds"] == 2 * 60 * 60
    assert tasks["B"]["review_wait_seconds"] == 0
    # Ожидание проверки — тому, кто принял (руководитель), а не автору задачи
    reviewers = [(r["user"]["full_name"], r["tasks"]) for r in time["review_wait_by_reviewer"]]
    assert reviewers == [("Олег", 1)]
    # Среднее ожидание проверки — только по задачам, что на ней были
    assert time["tiles"]["avg_review_wait_seconds"] == 2 * 60 * 60
    assert time["waiting_now"] == {
        "count": 1,
        "oldest_task_id": waiting,
        "oldest_seconds": 45 * 60,
    }


async def test_time_tab_respects_filters(scenario: dict[str, Any]) -> None:
    head = scenario["head"]

    # Байер Борис: его задачи не приняты — пусто
    by_boris = await analytics(head, "time", buyer_id=scenario["boris_u"].id)
    assert by_boris["tiles"]["completed"] == 0
    assert by_boris["by_task"] == []
    assert by_boris["review_wait_by_reviewer"] == []

    # Креативщица Мария: только её задача и только она в таблице креативщиков
    by_maria = await analytics(head, "time", creative_id=scenario["maria_u"].id)
    assert [r["offer"] for r in by_maria["by_task"]] == ["Pin-Up"]
    assert [r["user"]["full_name"] for r in by_maria["by_creative"]] == ["Мария"]
    assert by_maria["tiles"]["avg_work_seconds"] == 10800

    # Оффер: одна из двух задач Vavada принята
    by_offer = await analytics(head, "time", offer="vavada")
    assert [r["offer"] for r in by_offer["by_task"]] == ["Vavada"]


async def test_time_tab_creative_filter_keeps_work_on_reassigned_tasks(
    as_user: AsUser, fake_clock: FakeClock
) -> None:
    head = as_user(await create_user(Role.HEAD))
    buyer = as_user(await create_user(Role.BUYER))
    maria_u = await create_user(Role.CREATIVE, full_name="Мария")
    ivan_u = await create_user(Role.CREATIVE, full_name="Иван")
    maria, ivan = as_user(maria_u), as_user(ivan_u)
    tid = (await create_task(buyer, offer="Переданная"))["id"]

    # Мария работала 3 ч, задачу передали Ивану, он закончил за 1 ч
    ok(await act(maria, tid, "take"))
    fake_clock.advance(hours=3)
    ok(await act(head, tid, "reassign", assignee_id=ivan_u.id))
    fake_clock.advance(hours=1)
    ok(await submit_work(ivan, tid))
    ok(await act(buyer, tid, "accept"))

    def maria_row(data: dict[str, Any]) -> dict[str, Any]:
        return next(r for r in data["by_creative"] if r["user"]["full_name"] == "Мария")

    # Её 3 ч одинаковы с фильтром и без; задача видна в её выборке
    unfiltered = maria_row(await analytics(head, "time"))
    filtered_data = await analytics(head, "time", creative_id=maria_u.id)
    assert maria_row(filtered_data) == unfiltered
    assert unfiltered["work_seconds"] == 3 * 60 * 60
    assert [r["offer"] for r in filtered_data["by_task"]] == ["Переданная"]
    assert [r["user"]["full_name"] for r in filtered_data["by_creative"]] == ["Мария"]
