#!/bin/sh
# Выбор конфига: сертификат уже выпущен — HTTPS, иначе только HTTP (чтобы прошла проверка Let's Encrypt).
# Шаблон кладётся в /etc/nginx/templates — дальше штатный скрипт образа подставит ${DOMAIN}.
set -eu

# Внешний HTTPS-порт: 443 по умолчанию; другой — если 443 на сервере занят (например, VPN)
PORT="${PUBLIC_HTTPS_PORT:-443}"
if [ "$PORT" = "443" ]; then
    SUFFIX=""
    HSTS="31536000"
else
    SUFFIX=":${PORT}"
    # HSTS действует на хост целиком, без учёта порта: браузер отправил бы http://хост
    # на https://хост:443, где работает чужой сервис. На нестандартном порту — сбрасываем HSTS.
    HSTS="0"
fi

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    sed -e "s/__HTTPS_SUFFIX__/${SUFFIX}/g" -e "s/__HSTS_MAX_AGE__/${HSTS}/g"         /etc/nginx/proxy-templates/https.conf.template > /etc/nginx/templates/default.conf.template
    echo "proxy: сертификат для ${DOMAIN} найден — HTTPS на внешнем порту ${PORT}"
else
    cp /etc/nginx/proxy-templates/http.conf.template /etc/nginx/templates/default.conf.template
    echo "proxy: сертификата для ${DOMAIN} нет — только HTTP, выпустите сертификат (deploy/README.md)"
fi
