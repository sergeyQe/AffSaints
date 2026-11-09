from fastapi import APIRouter, FastAPI

from app.api import attachments, auth, health, tasks, users
from app.core.config import DEFAULT_JWT_SECRET, get_settings
from app.core.errors import register_error_handlers


def _check_settings() -> None:
    # Прод-окружение (secure-кука) не должно стартовать с дефолтным или коротким секретом
    settings = get_settings()
    if settings.cookie_secure and (
        settings.jwt_secret == DEFAULT_JWT_SECRET or len(settings.jwt_secret) < 32
    ):
        raise RuntimeError("APP_JWT_SECRET не задан или короче 32 символов")


def create_app() -> FastAPI:
    _check_settings()
    app = FastAPI(
        title="Aff Saints — креативный отдел",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
    api.include_router(auth.router)
    api.include_router(users.router)
    api.include_router(tasks.router)
    api.include_router(attachments.router)
    app.include_router(api)
    return app


app = create_app()
