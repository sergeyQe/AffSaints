#!/bin/sh
# Выбор конфига: сертификат уже выпущен — HTTPS, иначе только HTTP (чтобы прошла проверка Let's Encrypt).
# Шаблон кладётся в /etc/nginx/templates — дальше штатный скрипт образа подставит ${DOMAIN}.
set -eu

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    cp /etc/nginx/proxy-templates/https.conf.template /etc/nginx/templates/default.conf.template
    echo "proxy: сертификат для ${DOMAIN} найден — HTTPS"
else
    cp /etc/nginx/proxy-templates/http.conf.template /etc/nginx/templates/default.conf.template
    echo "proxy: сертификата для ${DOMAIN} нет — только HTTP, выпустите сертификат (deploy/README.md)"
fi
