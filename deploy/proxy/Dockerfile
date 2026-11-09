FROM nginx:1.27-alpine

# Два варианта конфига: только HTTP (до выпуска сертификата) и HTTPS
COPY http.conf.template https.conf.template /etc/nginx/proxy-templates/
# Скрипты /docker-entrypoint.d выполняются образом nginx перед стартом (по порядку имён)
COPY 05-select-config.sh 40-reload-loop.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-select-config.sh /docker-entrypoint.d/40-reload-loop.sh \
    && rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /etc/nginx/templates /var/www/certbot
