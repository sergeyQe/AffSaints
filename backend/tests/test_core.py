from collections.abc import Callable

from httpx import AsyncClient

from app.core.security import LoginThrottle
from app.core.validation_messages import translate
from app.models.user import Role, User
from tests.factories import create_user


def test_translate_known_type_with_context() -> None:
    err = {"type": "string_too_short", "msg": "...", "ctx": {"min_length": 8}}
    assert translate(err) == "Минимум символов: 8"


def test_translate_strips_value_error_prefix() -> None:
    err = {"type": "value_error", "msg": "Value error, Нужна хотя бы одна роль"}
    assert translate(err) == "Нужна хотя бы одна роль"


def test_translate_unknown_type_falls_back_to_original() -> None:
    assert translate({"type": "weird", "msg": "original"}) == "original"


async def test_validation_errors_are_russian(as_user: Callable[[User], AsyncClient]) -> None:
    head = await create_user(Role.HEAD)
    resp = await as_user(head).post(
        "/api/users", json={"login": "ok_login", "full_name": "X", "password": "1", "roles": []}
    )
    details = {d["field"]: d["message"] for d in resp.json()["error"]["details"]}
    assert details == {"password": "Минимум символов: 8", "roles": "Нужна хотя бы одна роль"}


def test_throttle_memory_is_bounded() -> None:
    throttle = LoginThrottle(max_failures=3, window_seconds=300)
    throttle.MAX_KEYS = 100
    for i in range(1_000):
        throttle.register_failure(f"random-{i}")
    assert len(throttle._failures) <= 100


def test_throttle_check_does_not_create_entries() -> None:
    throttle = LoginThrottle()
    assert not throttle.is_blocked("someone")
    assert throttle._failures == {}
