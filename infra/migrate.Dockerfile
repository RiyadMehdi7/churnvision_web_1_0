# Lightweight migration image for production DB upgrades
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

COPY backend/ /app/backend/
COPY pyproject.toml /app/

WORKDIR /app/backend

RUN uv pip install --system -e .

CMD ["alembic", "upgrade", "head"]
