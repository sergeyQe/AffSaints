"""Хелперы для тестов задач: создание и прогон по статусам через API."""

from datetime import datetime
from typing import Any

from httpx import AsyncClient, Response

BRIEF: dict[str, Any] = {
    "offer": "Казино Vavada",
    "geo": "BR",
    "creative_type": "video",
    "quantity": 5,
    "description": "Видео 15 сек, вертикаль",
    "priority": "normal",
}


def ok(resp: Response, status: int = 200) -> Any:
    assert resp.status_code == status, resp.text
    return resp.json()


async def create_task(
    client: AsyncClient, deadline: datetime | None = None, **overrides: Any
) -> dict[str, Any]:
    body = {**BRIEF, **overrides}
    if deadline is not None:
        body["deadline"] = deadline.isoformat()
    return ok(await client.post("/api/tasks", json=body), 201)


async def act(client: AsyncClient, task_id: int, action: str, **body: Any) -> Response:
    return await client.post(f"/api/tasks/{task_id}/{action}", json=body or None)


async def event_types(client: AsyncClient, task_id: int) -> list[str]:
    events = ok(await client.get(f"/api/tasks/{task_id}/events"))
    return [e["type"] for e in events]
