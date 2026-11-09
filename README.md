# Креативный отдел — тестовое задание для Aff Saints

Веб-сервис для постановки, отслеживания и контроля задач между медиабайерами и креативщиками.

> README дополняется по мере реализации. Полное описание — на финальном этапе.

## Быстрый старт

```bash
cp .env.example .env
docker compose up --build
```

Откройте http://localhost:8180.

## Разработка

Backend (Python 3.12+):

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Linux/macOS: .venv/bin/python
docker compose up -d db                             # из корня репозитория
.venv/Scripts/python -m pytest
```

Frontend (Node 24):

```bash
cd frontend
npm ci
npm run dev      # http://localhost:5173, /api проксируется на localhost:8100
npm test
```
