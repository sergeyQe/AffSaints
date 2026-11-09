from fastapi import APIRouter, FastAPI

from app.api import health
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(
        title="Aff Saints — креативный отдел",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    register_error_handlers(app)

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
    app.include_router(api)
    return app


app = create_app()
