#!/bin/sh
# Раз в 6 часов перечитываем конфиг — подхватываем продлённый certbot сертификат без рестарта
(while :; do sleep 21600; nginx -s reload; done) &
