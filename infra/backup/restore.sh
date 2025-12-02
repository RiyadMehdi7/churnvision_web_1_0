#!/bin/bash
# ChurnVision Enterprise - PostgreSQL Restore Script
# This script restores the database from a backup file
#
# Usage: ./restore.sh <backup_file>
#
# WARNING: This will DROP and recreate the database!
#
# Environment variables:
#   POSTGRES_USER     - Database user (default: from .env or 'churnvision')
#   POSTGRES_PASSWORD - Database password (required)
#   POSTGRES_DB       - Database name (default: 'churnvision')
#   POSTGRES_HOST     - Database host (default: 'localhost')
#   POSTGRES_PORT     - Database port (default: '5432')

set -euo pipefail

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 ./backups/churnvision_20240101_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Validate backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Database connection (with defaults)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-churnvision}"
DB_USER="${POSTGRES_USER:-churnvision}"

# Validate required variables
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "ERROR: POSTGRES_PASSWORD environment variable is required"
    exit 1
fi

echo "================================================================"
echo "ChurnVision Enterprise - Database Restore"
echo "================================================================"
echo "Timestamp:   $(date)"
echo "Database:    ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "Backup file: ${BACKUP_FILE}"
echo "================================================================"
echo ""
echo "WARNING: This will DROP and recreate the database '${DB_NAME}'!"
echo "All existing data will be PERMANENTLY LOST!"
echo ""
read -p "Are you sure you want to continue? (type 'YES' to confirm): " CONFIRM

if [ "$CONFIRM" != "YES" ]; then
    echo "Restore cancelled."
    exit 0
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

echo ""
echo "Step 1: Terminating existing connections..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    2>/dev/null || true

echo "Step 2: Dropping existing database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "DROP DATABASE IF EXISTS ${DB_NAME};" \
    2>/dev/null || true

echo "Step 3: Creating fresh database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "CREATE DATABASE ${DB_NAME};"

echo "Step 4: Restoring from backup..."
gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --quiet

unset PGPASSWORD

echo ""
echo "================================================================"
echo "Restore completed successfully at $(date)"
echo "================================================================"
echo ""
echo "IMPORTANT: You may need to run database migrations:"
echo "  cd backend && alembic upgrade head"
echo ""
