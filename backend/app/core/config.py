from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Читаются из переменных окружения (префикс APP_) и .env."""

    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://affsaints:affsaints@localhost:5440/affsaints"

    jwt_secret: str = "dev-secret-change-me-in-production-0123456789"
    jwt_ttl_minutes: int = 60 * 12
    cookie_name: str = "access_token"
    cookie_secure: bool = False

    upload_dir: str = "./data/uploads"
    max_upload_bytes: int = 20 * 1024 * 1024

    # Демо-режим: экран входа показывает кнопки тестовых пользователей
    demo_mode: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
