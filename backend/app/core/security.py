import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

_ALGORITHM = "HS256"

# Хэш-заглушка: при несуществующем логине всё равно тратим время на bcrypt,
# чтобы по времени ответа нельзя было перебирать логины
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        bcrypt.checkpw(password.encode(), _DUMMY_HASH.encode())
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: int, token_version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> tuple[int, int] | None:
    """Возвращает (user_id, token_version) или None, если токен недействителен."""
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[_ALGORITHM],
            options={"require": ["sub", "exp", "ver"]},
        )
        return int(payload["sub"]), int(payload["ver"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


class LoginThrottle:
    """Ограничение неудачных попыток входа на логин (в памяти, сервис в одной реплике)."""

    # Потолок числа отслеживаемых логинов: перебор случайных логинов не раздувает память
    MAX_KEYS = 10_000

    def __init__(self, max_failures: int = 10, window_seconds: int = 300) -> None:
        self.max_failures = max_failures
        self.window = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _evict_stale(self, now: float) -> None:
        # Убираем ключи, у которых все попытки вышли из окна
        stale = [k for k, v in self._failures.items() if not v or now - v[-1] > self.window]
        for k in stale:
            del self._failures[k]
        # Если и после чистки слишком много — сбрасываем самые старые (+1 место под новый ключ)
        overflow = len(self._failures) - self.MAX_KEYS + 1
        if overflow > 0:
            oldest = sorted(self._failures, key=lambda k: self._failures[k][-1])[:overflow]
            for k in oldest:
                del self._failures[k]

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._failures[key]
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()
        return attempts

    def is_blocked(self, key: str) -> bool:
        if key not in self._failures:
            return False
        return len(self._prune(key, time.monotonic())) >= self.max_failures

    def register_failure(self, key: str) -> None:
        now = time.monotonic()
        if key not in self._failures and len(self._failures) >= self.MAX_KEYS:
            self._evict_stale(now)
        self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


login_throttle = LoginThrottle()
