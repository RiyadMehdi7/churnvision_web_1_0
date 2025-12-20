#!/bin/bash
# ChurnVision Enterprise - Database Backup Script
# This script creates encrypted backups of the PostgreSQL database

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_PATH:-/backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-${BACKUP_RETENTION_DAYS:-30}}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-${BACKUP_ENCRYPTION_KEY_FILE:-/etc/churnvision/backup.key}}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

# Database connection parameters
DB_HOST="${DB_HOST:-${PGHOST:-db}}"
DB_PORT="${DB_PORT:-${PGPORT:-5432}}"
DB_NAME="${DB_NAME:-${PGDATABASE:-churnvision}}"
DB_USER="${DB_USER:-${PGUSER:-postgres}}"

# Timestamp for backup file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/churnvision_backup_${TIMESTAMP}.sql"
BACKUP_FILE_COMPRESSED="${BACKUP_FILE}.gz"
BACKUP_FILE_ENCRYPTED="${BACKUP_FILE_COMPRESSED}.enc"
FINAL_BACKUP_FILE="$BACKUP_FILE_COMPRESSED"
ENCRYPTION_USED=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    local missing_deps=()

    for cmd in pg_dump gzip openssl; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
}

# Create backup directory if it doesn't exist
prepare_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        chmod 700 "$BACKUP_DIR"
    fi
}

# Perform the database backup
perform_backup() {
    log "Starting database backup..."
    log "Database: $DB_NAME on $DB_HOST:$DB_PORT"

    # Create the backup with pg_dump
    if ! PGPASSWORD="$PGPASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --format=plain \
        --encoding=UTF8 \
        --no-owner \
        --no-privileges \
        --file="$BACKUP_FILE" 2>&1 | grep -v "^pg_dump:"; then
        error "Database backup failed"
        return 1
    fi

    log "Backup created: $BACKUP_FILE"

    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup size: $BACKUP_SIZE"
}

# Compress the backup
compress_backup() {
    log "Compressing backup..."

    if ! gzip -9 "$BACKUP_FILE"; then
        error "Compression failed"
        return 1
    fi

    COMPRESSED_SIZE=$(du -h "$BACKUP_FILE_COMPRESSED" | cut -f1)
    log "Compressed backup: $BACKUP_FILE_COMPRESSED (${COMPRESSED_SIZE})"
}

# Encrypt the backup
encrypt_backup() {
    if [ -f "$ENCRYPTION_KEY_FILE" ]; then
        log "Encrypting backup with key file..."

        if ! openssl enc -aes-256-cbc \
            -salt \
            -pbkdf2 \
            -in "$BACKUP_FILE_COMPRESSED" \
            -out "$BACKUP_FILE_ENCRYPTED" \
            -pass file:"$ENCRYPTION_KEY_FILE"; then
            error "Encryption failed"
            return 1
        fi

        # Remove unencrypted compressed file
        rm -f "$BACKUP_FILE_COMPRESSED"

        ENCRYPTED_SIZE=$(du -h "$BACKUP_FILE_ENCRYPTED" | cut -f1)
        log "Encrypted backup: $BACKUP_FILE_ENCRYPTED (${ENCRYPTED_SIZE})"
        FINAL_BACKUP_FILE="$BACKUP_FILE_ENCRYPTED"
        ENCRYPTION_USED=true
        return 0
    fi

    if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
        log "Encrypting backup with BACKUP_ENCRYPTION_KEY env..."

        if ! openssl enc -aes-256-cbc \
            -salt \
            -pbkdf2 \
            -in "$BACKUP_FILE_COMPRESSED" \
            -out "$BACKUP_FILE_ENCRYPTED" \
            -pass env:BACKUP_ENCRYPTION_KEY; then
            error "Encryption failed"
            return 1
        fi

        # Remove unencrypted compressed file
        rm -f "$BACKUP_FILE_COMPRESSED"

        ENCRYPTED_SIZE=$(du -h "$BACKUP_FILE_ENCRYPTED" | cut -f1)
        log "Encrypted backup: $BACKUP_FILE_ENCRYPTED (${ENCRYPTED_SIZE})"
        FINAL_BACKUP_FILE="$BACKUP_FILE_ENCRYPTED"
        ENCRYPTION_USED=true
        return 0
    fi

    warn "Encryption key not found at $ENCRYPTION_KEY_FILE and BACKUP_ENCRYPTION_KEY is empty"
    warn "Skipping encryption (NOT RECOMMENDED FOR PRODUCTION)"
}

# Create backup metadata
create_metadata() {
    local metadata_file="${FINAL_BACKUP_FILE}.meta"

    cat > "$metadata_file" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "database": "$DB_NAME",
  "host": "$DB_HOST",
  "port": $DB_PORT,
  "backup_file": "$(basename "$FINAL_BACKUP_FILE")",
  "size_bytes": $(stat -f%z "$FINAL_BACKUP_FILE" 2>/dev/null || stat -c%s "$FINAL_BACKUP_FILE"),
  "checksum": "$(sha256sum "$FINAL_BACKUP_FILE" | cut -d' ' -f1)",
  "encrypted": $($ENCRYPTION_USED && echo "true" || echo "false"),
  "pg_version": "$(PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT version();' | head -n1)"
}
EOF

    log "Metadata created: $metadata_file"
}

# Clean up old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted_count=0
    while IFS= read -r -d '' old_backup; do
        log "Deleting old backup: $(basename "$old_backup")"
        rm -f "$old_backup" "${old_backup}.meta"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" \( -name "churnvision_backup_*.enc" -o -name "churnvision_backup_*.gz" \) -type f -mtime +"$RETENTION_DAYS" -print0)

    if [ $deleted_count -eq 0 ]; then
        log "No old backups to clean up"
    else
        log "Deleted $deleted_count old backup(s)"
    fi
}

# Verify backup integrity
verify_backup() {
    log "Verifying backup integrity..."

    if [ -f "$FINAL_BACKUP_FILE" ]; then
        local checksum=$(sha256sum "$FINAL_BACKUP_FILE" | cut -d' ' -f1)
        log "Backup checksum: $checksum"
        return 0
    else
        error "Backup file not found for verification"
        return 1
    fi
}

# Main execution
main() {
    log "==================================================================="
    log "ChurnVision Enterprise - Database Backup"
    log "==================================================================="

    # Check dependencies
    check_dependencies

    # Prepare backup directory
    prepare_backup_dir

    # Perform backup
    if ! perform_backup; then
        error "Backup process failed"
        exit 1
    fi

    # Compress backup
    if ! compress_backup; then
        error "Compression failed"
        exit 1
    fi

    # Encrypt backup
    if ! encrypt_backup; then
        error "Encryption failed"
        exit 1
    fi

    # Create metadata
    create_metadata

    # Verify backup
    if ! verify_backup; then
        warn "Backup verification failed"
    fi

    # Clean up old backups
    cleanup_old_backups

    log "==================================================================="
    log "Backup completed successfully!"
    log "Backup file: $FINAL_BACKUP_FILE"
    log "==================================================================="
}

# Run main function
main "$@"
