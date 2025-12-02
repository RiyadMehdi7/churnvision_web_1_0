#!/bin/bash
# ChurnVision Enterprise - PostgreSQL Backup Script
# This script creates compressed backups of the PostgreSQL database
#
# Usage: ./backup.sh [backup_dir]
#
# Environment variables:
#   POSTGRES_USER     - Database user (default: from .env or 'churnvision')
#   POSTGRES_PASSWORD - Database password (required)
#   POSTGRES_DB       - Database name (default: 'churnvision')
#   POSTGRES_HOST     - Database host (default: 'localhost')
#   POSTGRES_PORT     - Database port (default: '5432')
#   BACKUP_RETENTION  - Days to keep backups (default: 30)

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${BACKUP_RETENTION:-30}"

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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Backup filename
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "================================================================"
echo "ChurnVision Enterprise - Database Backup"
echo "================================================================"
echo "Timestamp: $(date)"
echo "Database:  ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "Backup:    ${BACKUP_FILE}"
echo "================================================================"

# Perform backup using pg_dump
# Options:
#   -Fc: Custom format (compressed, supports parallel restore)
#   --no-owner: Skip ownership commands (for portability)
#   --no-acl: Skip access control commands
echo "Starting backup..."

export PGPASSWORD="$POSTGRES_PASSWORD"

pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"

unset PGPASSWORD

# Verify backup was created
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup completed successfully!"
    echo "File: ${BACKUP_FILE}"
    echo "Size: ${BACKUP_SIZE}"
else
    echo "ERROR: Backup file was not created"
    exit 1
fi

# Cleanup old backups
echo ""
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
echo "Deleted ${DELETED_COUNT} old backup(s)"

# List current backups
echo ""
echo "Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo "================================================================"
echo "Backup completed at $(date)"
echo "================================================================"
