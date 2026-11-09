from collections.abc import Callable

import pytest
from httpx import AsyncClient

from app.models.user import Role, User
from tests.factories import create_user

NEW_USER = {
    "login": "Ivan.P",
    "full_name": "  Иван Петров ",
    "password": "secret-pass",
    "roles": ["creative", "buyer", "creative"],
}


async def test_head_creates_user_with_multiple_roles(
    as_user: Callable[[User], AsyncClient], client: AsyncClient
) -> None:
    head = await create_user(Role.HEAD)

    resp = await as_user(head).post("/api/users", json=NEW_USER)

    assert resp.status_code == 201
    body = resp.json()
    assert body["login"] == "ivan.p"
    assert body["full_name"] == "Иван Петров"
    assert body["roles"] == ["buyer", "creative"]

    # Новый пользователь может войти
    login = await client.post(
        "/api/auth/login", json={"login": "ivan.p", "password": "secret-pass"}
    )
    assert login.status_code == 200


@pytest.mark.parametrize("role", [Role.BUYER, Role.CREATIVE])
async def test_only_head_manages_users(as_user: Callable[[User], AsyncClient], role: Role) -> None:
    user = await create_user(role)
    other = await create_user(Role.CREATIVE)
    c = as_user(user)

    assert (await c.post("/api/users", json=NEW_USER)).status_code == 403
    assert (await c.patch(f"/api/users/{other.id}", json={"full_name": "X"})).status_code == 403


async def test_multi_role_user_gets_union_of_rights(
    as_user: Callable[[User], AsyncClient],
) -> None:
    user = await create_user(Role.CREATIVE, Role.HEAD)
    resp = await as_user(user).post("/api/users", json=NEW_USER)
    assert resp.status_code == 201


async def test_duplicate_login_conflict(as_user: Callable[[User], AsyncClient]) -> None:
    head = await create_user(Role.HEAD)
    await create_user(Role.BUYER, login="ivan.p")

    resp = await as_user(head).post("/api/users", json=NEW_USER)

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "login_taken"


@pytest.mark.parametrize(
    "patch",
    [
        {"roles": []},
        {"roles": ["admin"]},
        {"password": "short"},
        {"full_name": ""},
    ],
)
async def test_update_validation(as_user: Callable[[User], AsyncClient], patch: dict) -> None:
    head = await create_user(Role.HEAD)
    target = await create_user(Role.BUYER)

    resp = await as_user(head).patch(f"/api/users/{target.id}", json=patch)

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_update_roles_replaces_set(as_user: Callable[[User], AsyncClient]) -> None:
    head = await create_user(Role.HEAD)
    target = await create_user(Role.BUYER, Role.CREATIVE)

    resp = await as_user(head).patch(
        f"/api/users/{target.id}", json={"roles": ["creative", "head"]}
    )

    assert resp.status_code == 200
    assert resp.json()["roles"] == ["creative", "head"]


async def test_head_cannot_lock_self_out(as_user: Callable[[User], AsyncClient]) -> None:
    head = await create_user(Role.HEAD)
    c = as_user(head)

    r1 = await c.patch(f"/api/users/{head.id}", json={"is_active": False})
    r2 = await c.patch(f"/api/users/{head.id}", json={"roles": ["buyer"]})

    assert r1.status_code == r2.status_code == 400
    assert r1.json()["error"]["code"] == "self_lockout"


async def test_list_users_filters_by_role_and_hides_inactive(
    as_user: Callable[[User], AsyncClient],
) -> None:
    buyer = await create_user(Role.BUYER, full_name="Анна")
    await create_user(Role.CREATIVE, full_name="Борис")
    await create_user(Role.CREATIVE, Role.BUYER, full_name="Вера")
    await create_user(Role.CREATIVE, full_name="Глеб", is_active=False)
    c = as_user(buyer)

    creatives = (await c.get("/api/users", params={"role": "creative"})).json()
    assert [u["full_name"] for u in creatives] == ["Борис", "Вера"]

    everyone = (await c.get("/api/users", params={"include_inactive": True})).json()
    assert len(everyone) == 4


async def test_update_unknown_user_404(as_user: Callable[[User], AsyncClient]) -> None:
    head = await create_user(Role.HEAD)
    resp = await as_user(head).patch("/api/users/999", json={"full_name": "X"})
    assert resp.status_code == 404
