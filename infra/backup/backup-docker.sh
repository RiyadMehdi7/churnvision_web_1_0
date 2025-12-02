#!/bin/bash
# ChurnVision Enterprise - Docker Container Backup Script
# This script creates backups from the PostgreSQL container
#
# Usage: ./backup-docker.sh [backup_dir]
#
# This script is designed to run from the host machine and backup
# the database running in the Docker container.

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${BACKUP_RETENTION:-30}"
CONTAINER_NAME="${DB_CONTAINER_NAME:-churnvision-db}"

# Database settings (must match docker-compose.prod.yml)
DB_NAME="${POSTGRES_DB:-churnvision}"
DB_USER="${POSTGRES_USER:-churnvision}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "================================================================"
echo "ChurnVision Enterprise - Docker Database Backup"
echo "================================================================"
echo "Timestamp: $(date)"
echo "Container: ${CONTAINER_NAME}"
echo "Database:  ${DB_NAME}"
echo "Backup:    ${BACKUP_FILE}"
echo "================================================================"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Container '${CONTAINER_NAME}' is not running"
    echo "Available containers:"
    docker ps --format '{{.Names}}'
    exit 1
fi

echo "Starting backup..."

# Execute pg_dump inside the container and pipe to gzip on host
docker exec "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl \
    | gzip > "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup completed successfully!"
    echo "File: ${BACKUP_FILE}"
    echo "Size: ${BACKUP_SIZE}"
else
    echo "ERROR: Backup file is empty or was not created"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Cleanup old backups
echo ""
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo ""
echo "================================================================"
echo "Backup completed at $(date)"
echo "================================================================"
