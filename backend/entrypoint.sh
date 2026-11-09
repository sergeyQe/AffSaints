#!/bin/sh
set -e

# Миграции при каждом старте — идемпотентны
alembic upgrade head

# Демо-данные: только если база пустая (включается APP_SEED_ON_START=1)
if [ "${APP_SEED_ON_START:-0}" = "1" ]; then
    python -m app.cli seed --if-empty
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
