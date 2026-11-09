FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Сначала зависимости — слой кэшируется, пока не меняется pyproject.toml
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install . && rm -rf app build *.egg-info

COPY . .
RUN pip install --no-deps . \
    && useradd --uid 1000 --create-home appuser \
    && mkdir -p /data/uploads && chown -R appuser /data /app

USER appuser
ENV APP_UPLOAD_DIR=/data/uploads

EXPOSE 8000
CMD ["sh", "./entrypoint.sh"]
