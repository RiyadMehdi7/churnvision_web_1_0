#!/bin/bash
set -e

echo "=== ChurnVision Backend Starting ==="

# Wait for database to be ready (with timeout)
MAX_RETRIES=30
RETRY_COUNT=0

echo "Waiting for database to be ready..."
while ! python -c "
from app.core.config import settings
from sqlalchemy import create_engine
sync_url = settings.DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
engine = create_engine(sync_url)
engine.connect()
" 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: Database not available after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "Database not ready, retrying in 2 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "Database is ready!"

# Run database migrations
echo "Running database migrations..."
cd /app
alembic upgrade head

if [ $? -eq 0 ]; then
    echo "Migrations completed successfully!"
else
    echo "ERROR: Migration failed!"
    exit 1
fi

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
