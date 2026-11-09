# Развёртывание на VPS

Схема: `proxy` (nginx, 80/443, Let's Encrypt) → `frontend` (nginx со статикой, проксирует `/api`) → `backend` (FastAPI) → `db` (PostgreSQL). Наружу открыты только 80 и 443.

## Что нужно заранее

- VPS с Ubuntu 22.04+ (1 vCPU, 1–2 ГБ RAM достаточно), Docker и плагин Compose v2.24+.
- Домен или поддомен с A-записью на IP сервера (например, `creative.example.com`).
- Открытые порты 80 и 443.

### Без своего домена

Подойдёт бесплатное имя [sslip.io](https://sslip.io): `109-120-147-30.sslip.io` указывает на `109.120.147.30`, и Let's Encrypt выдаёт на него обычный сертификат. Укажите его в `DOMAIN`.

### Если порт 443 на сервере занят

Например, его использует VPN. Тогда в `deploy/.env.prod` задайте `PUBLIC_HTTPS_PORT=8443`, и сайт будет доступен по `https://<домен>:8443`. Сертификат по-прежнему выпускается через порт 80. HSTS в этом режиме отключается: он действует на хост целиком, и браузер начал бы отправлять адрес без порта на чужой сервис на 443.

## Первый запуск

Все команды — из каталога проекта на сервере (например, `/opt/affsaints`).

1. Клонировать репозиторий:

```bash
git clone https://github.com/sergeyQe/AffSaints.git /opt/affsaints && cd /opt/affsaints
```

2. Создать файл с секретами и заполнить `DOMAIN`, `POSTGRES_PASSWORD`, `APP_JWT_SECRET`:

```bash
cp deploy/.env.prod.example deploy/.env.prod && nano deploy/.env.prod
```

Секреты удобно сгенерировать так: `openssl rand -hex 32`.

3. Поднять стенд (proxy стартует в режиме «только HTTP», пока нет сертификата):

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

4. Выпустить сертификат (подставьте домен и почту):

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot -d creative.example.com --email you@example.com --agree-tos --no-eff-email
```

5. Перезапустить proxy — он найдёт сертификат и включит HTTPS:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod restart proxy
```

Сертификат продлевается автоматически: контейнер `certbot` проверяет его раз в 12 часов, proxy перечитывает конфиг раз в 6 часов.

## Ночной сброс демо-данных

Чтобы проверяющие всегда видели одинаковое демо, данные пересоздаются каждую ночь (04:00 по времени сервера). Добавить в `crontab -e`:

```cron
0 4 * * * cd /opt/affsaints && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec -T backend python -m app.cli seed --reset >> /var/log/affsaints-reset.log 2>&1
```

Разовый сброс вручную — та же команда без cron-расписания.

## Обновление

```bash
cd /opt/affsaints && git pull && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Миграции БД применяются автоматически при старте backend. Демо-данные при обновлении не пересоздаются (сид — только в пустую БД).

## Проверка после развёртывания

- [ ] `https://<домен>/api/health` → `{"status":"ok"}`
- [ ] `http://<домен>` перенаправляет на `https://`
- [ ] Вход по логинам тестовых пользователей (таблица в корневом README) работает под каждой ролью
- [ ] Байер создаёт ТЗ, креативщик берёт и сдаёт с файлом, байер принимает
- [ ] Руководитель видит аналитику за месяц
- [ ] Ручной запуск команды сброса из cron отрабатывает без ошибок

## Безопасность

- Без `APP_JWT_SECRET` и `POSTGRES_PASSWORD` стенд не запустится; backend отказывается стартовать с дефолтным или коротким секретом при `APP_COOKIE_SECURE=true`.
- Порты БД и backend наружу не публикуются. backend доверяет заголовку `X-Forwarded-For` — это безопасно, пока он доступен только из внутренней сети Docker.
- `/api/auth/login` дополнительно ограничен в proxy (10 запросов в минуту с IP) поверх защиты от подбора в самом backend.
- Режим кнопок быстрого входа (`APP_DEMO_MODE=true`) выключен по умолчанию: он публикует список пользователей и пускает за них без пароля. Без него экран входа — обычная форма, а `/api/auth/demo-users` возвращает пустой список.

## Резервная копия БД (по желанию)

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec -T db pg_dump -U affsaints affsaints | gzip > /root/affsaints-$(date +%F).sql.gz
```
