from httpx import AsyncClient

from app.core.db import SessionFactory
from app.seed import DEMO_PASSWORD, DEMO_USERS, is_empty, seed, wipe


async def test_seed_creates_demo_users_who_can_login(client: AsyncClient) -> None:
    async with SessionFactory() as session:
        assert await is_empty(session)
        await seed(session)
        assert not await is_empty(session)

    demo = (await client.get("/api/auth/demo-users")).json()
    assert len(demo) == len(DEMO_USERS)

    resp = await client.post("/api/auth/login", json={"login": "head", "password": DEMO_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["roles"] == ["head"]


async def test_wipe_and_reseed() -> None:
    async with SessionFactory() as session:
        await seed(session)
        await wipe(session)
        await session.commit()
        assert await is_empty(session)
        await seed(session)
        assert not await is_empty(session)
