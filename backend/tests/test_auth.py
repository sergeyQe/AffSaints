from collections.abc import Callable

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.models.user import Role, User
from tests.factories import DEFAULT_PASSWORD, create_user


async def test_login_sets_httponly_cookie_and_me_works(client: AsyncClient) -> None:
    await create_user(Role.BUYER, login="anna")

    resp = await client.post(
        "/api/auth/login", json={"login": "Anna", "password": DEFAULT_PASSWORD}
    )

    assert resp.status_code == 200
    assert resp.json()["roles"] == ["buyer"]
    set_cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["login"] == "anna"


@pytest.mark.parametrize(
    ("login", "password"),
    [("anna", "wrong-password"), ("nobody", DEFAULT_PASSWORD)],
)
async def test_login_rejects_bad_credentials_with_same_error(
    client: AsyncClient, login: str, password: str
) -> None:
    await create_user(Role.BUYER, login="anna")

    resp = await client.post("/api/auth/login", json={"login": login, "password": password})

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_inactive_user_cannot_login(client: AsyncClient) -> None:
    await create_user(Role.BUYER, login="anna", is_active=False)
    resp = await client.post(
        "/api/auth/login", json={"login": "anna", "password": DEFAULT_PASSWORD}
    )
    assert resp.status_code == 401


async def test_login_is_throttled_after_many_failures(client: AsyncClient) -> None:
    await create_user(Role.BUYER, login="anna")
    for _ in range(10):
        await client.post("/api/auth/login", json={"login": "anna", "password": "bad"})

    # Даже верный пароль блокируется, пока не истечёт окно
    resp = await client.post(
        "/api/auth/login", json={"login": "anna", "password": DEFAULT_PASSWORD}
    )
    assert resp.status_code == 429


async def test_me_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "not_authenticated"


async def test_garbage_token_is_rejected(client: AsyncClient) -> None:
    client.cookies.set(get_settings().cookie_name, "not-a-jwt")
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_logout_clears_cookie(client: AsyncClient) -> None:
    await create_user(Role.BUYER, login="anna")
    await client.post("/api/auth/login", json={"login": "anna", "password": DEFAULT_PASSWORD})

    resp = await client.post("/api/auth/logout")

    assert resp.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_deactivated_user_token_stops_working(
    as_user: Callable[[User], AsyncClient],
) -> None:
    head = await create_user(Role.HEAD)
    buyer = await create_user(Role.BUYER)
    buyer_client = as_user(buyer)
    assert (await buyer_client.get("/api/auth/me")).status_code == 200

    await as_user(head).patch(f"/api/users/{buyer.id}", json={"is_active": False})

    assert (await buyer_client.get("/api/auth/me")).status_code == 401


async def test_password_change_invalidates_old_token(
    as_user: Callable[[User], AsyncClient],
) -> None:
    head = await create_user(Role.HEAD)
    buyer = await create_user(Role.BUYER)
    buyer_client = as_user(buyer)

    await as_user(head).patch(f"/api/users/{buyer.id}", json={"password": "new-password-1"})

    assert (await buyer_client.get("/api/auth/me")).status_code == 401


async def test_demo_users_and_demo_login(client: AsyncClient) -> None:
    demo = await create_user(Role.CREATIVE, full_name="Иван", is_demo=True)
    await create_user(Role.HEAD, full_name="Обычный")

    users = (await client.get("/api/auth/demo-users")).json()
    assert [u["full_name"] for u in users] == ["Иван"]

    resp = await client.post("/api/auth/demo-login", json={"user_id": demo.id})
    assert resp.status_code == 200
    assert (await client.get("/api/auth/me")).json()["id"] == demo.id


async def test_demo_login_refuses_non_demo_user(client: AsyncClient) -> None:
    regular = await create_user(Role.HEAD)
    resp = await client.post("/api/auth/demo-login", json={"user_id": regular.id})
    assert resp.status_code == 404


async def test_demo_login_disabled_outside_demo_mode(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo = await create_user(Role.CREATIVE, is_demo=True)
    monkeypatch.setattr(get_settings(), "demo_mode", False)

    assert (await client.get("/api/auth/demo-users")).json() == []
    resp = await client.post("/api/auth/demo-login", json={"user_id": demo.id})
    assert resp.status_code == 404


def test_app_refuses_default_secret_in_secure_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.main import create_app

    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    with pytest.raises(RuntimeError):
        create_app()
