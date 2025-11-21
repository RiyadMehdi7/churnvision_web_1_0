#!/bin/bash
# ChurnVision Enterprise - Database Restore Script
# This script restores encrypted PostgreSQL backups

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/churnvision}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/etc/churnvision/backup.key}"

# Database connection parameters
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-churnvision}"
DB_USER="${DB_USER:-postgres}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS] BACKUP_FILE

Restore a ChurnVision database backup.

OPTIONS:
    -h, --help              Show this help message
    -l, --list              List available backups
    -n, --no-confirm        Skip confirmation prompt
    -c, --create-db         Create database if it doesn't exist
    --drop-existing         Drop existing database before restore (DANGEROUS)

EXAMPLES:
    # List available backups
    $0 --list

    # Restore latest backup
    $0 \$(ls -t $BACKUP_DIR/churnvision_backup_*.enc | head -1)

    # Restore specific backup without confirmation
    $0 --no-confirm $BACKUP_DIR/churnvision_backup_20231121_120000.sql.gz.enc

EOF
}

# Check if required tools are installed
check_dependencies() {
    local missing_deps=()

    for cmd in psql gunzip openssl; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        exit 1
    fi
}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    echo

    if [ ! -d "$BACKUP_DIR" ]; then
        error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    local backups=($(ls -t "$BACKUP_DIR"/churnvision_backup_*.enc 2>/dev/null || true))

    if [ ${#backups[@]} -eq 0 ]; then
        warn "No backups found"
        exit 0
    fi

    printf "%-5s %-35s %-12s %-20s %s\n" "#" "Backup File" "Size" "Date" "Checksum"
    echo "--------------------------------------------------------------------------------"

    local i=1
    for backup in "${backups[@]}"; do
        local basename=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || stat -c "%y" "$backup" | cut -d'.' -f1)
        local checksum=$(sha256sum "$backup" 2>/dev/null | cut -d' ' -f1 | cut -c1-12)

        printf "%-5s %-35s %-12s %-20s %s\n" "$i" "$basename" "$size" "$date" "$checksum..."
        ((i++))
    done

    echo
}

# Verify backup file exists and is readable
verify_backup_file() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        exit 1
    fi

    if [ ! -r "$backup_file" ]; then
        error "Backup file is not readable: $backup_file"
        exit 1
    fi

    log "Backup file verified: $(basename "$backup_file")"
}

# Check if database exists
database_exists() {
    PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"
}

# Create database if requested
create_database() {
    log "Creating database: $DB_NAME"

    if ! PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1; then
        error "Failed to create database"
        return 1
    fi

    log "Database created successfully"
}

# Drop existing database
drop_database() {
    warn "Dropping existing database: $DB_NAME"

    if ! PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>&1; then
        error "Failed to drop database"
        return 1
    fi

    log "Database dropped successfully"
}

# Decrypt backup
decrypt_backup() {
    local encrypted_file="$1"
    local decrypted_file="${encrypted_file%.enc}"

    if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
        error "Encryption key not found at $ENCRYPTION_KEY_FILE"
        exit 1
    fi

    log "Decrypting backup..."

    if ! openssl enc -aes-256-cbc -d \
        -pbkdf2 \
        -in "$encrypted_file" \
        -out "$decrypted_file" \
        -pass file:"$ENCRYPTION_KEY_FILE"; then
        error "Decryption failed"
        exit 1
    fi

    log "Backup decrypted successfully"
    echo "$decrypted_file"
}

# Decompress backup
decompress_backup() {
    local compressed_file="$1"
    local decompressed_file="${compressed_file%.gz}"

    log "Decompressing backup..."

    if ! gunzip -c "$compressed_file" > "$decompressed_file"; then
        error "Decompression failed"
        exit 1
    fi

    log "Backup decompressed successfully"
    echo "$decompressed_file"
}

# Restore database
restore_database() {
    local sql_file="$1"

    log "Restoring database from: $(basename "$sql_file")"

    if ! PGPASSWORD="$PGPASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$sql_file" \
        --single-transaction \
        --set ON_ERROR_STOP=on \
        2>&1 | grep -v "^psql:"; then
        error "Database restore failed"
        return 1
    fi

    log "Database restored successfully"
}

# Verify restored database
verify_restore() {
    log "Verifying restored database..."

    local table_count=$(PGPASSWORD="$PGPASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

    info "Tables in database: $table_count"

    if [ "$table_count" -eq 0 ]; then
        warn "No tables found in restored database"
        return 1
    fi

    log "Database verification passed"
}

# Cleanup temporary files
cleanup_temp_files() {
    local temp_dir="$1"

    if [ -d "$temp_dir" ]; then
        log "Cleaning up temporary files..."
        rm -rf "$temp_dir"
    fi
}

# Main execution
main() {
    local BACKUP_FILE=""
    local NO_CONFIRM=false
    local CREATE_DB=false
    local DROP_EXISTING=false
    local LIST_BACKUPS=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -l|--list)
                LIST_BACKUPS=true
                shift
                ;;
            -n|--no-confirm)
                NO_CONFIRM=true
                shift
                ;;
            -c|--create-db)
                CREATE_DB=true
                shift
                ;;
            --drop-existing)
                DROP_EXISTING=true
                shift
                ;;
            *)
                BACKUP_FILE="$1"
                shift
                ;;
        esac
    done

    log "==================================================================="
    log "ChurnVision Enterprise - Database Restore"
    log "==================================================================="

    # Check dependencies
    check_dependencies

    # Handle list backups
    if [ "$LIST_BACKUPS" = true ]; then
        list_backups
        exit 0
    fi

    # Validate backup file argument
    if [ -z "$BACKUP_FILE" ]; then
        error "No backup file specified"
        usage
        exit 1
    fi

    # Verify backup file
    verify_backup_file "$BACKUP_FILE"

    # Confirmation prompt
    if [ "$NO_CONFIRM" = false ]; then
        warn "This will restore the database: $DB_NAME"
        warn "Backup file: $(basename "$BACKUP_FILE")"
        warn "Host: $DB_HOST:$DB_PORT"
        echo
        read -p "Are you sure you want to continue? (yes/no): " -r
        echo

        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log "Restore cancelled by user"
            exit 0
        fi
    fi

    # Create temporary directory for restore
    TEMP_DIR=$(mktemp -d)
    trap "cleanup_temp_files '$TEMP_DIR'" EXIT

    # Drop existing database if requested
    if [ "$DROP_EXISTING" = true ]; then
        drop_database
        CREATE_DB=true
    fi

    # Check if database exists
    if ! database_exists; then
        if [ "$CREATE_DB" = true ]; then
            create_database
        else
            error "Database does not exist. Use --create-db to create it."
            exit 1
        fi
    fi

    # Decrypt backup
    DECRYPTED_FILE=$(decrypt_backup "$BACKUP_FILE")
    mv "$DECRYPTED_FILE" "$TEMP_DIR/"
    DECRYPTED_FILE="$TEMP_DIR/$(basename "$DECRYPTED_FILE")"

    # Decompress backup
    SQL_FILE=$(decompress_backup "$DECRYPTED_FILE")

    # Restore database
    if ! restore_database "$SQL_FILE"; then
        error "Restore failed"
        exit 1
    fi

    # Verify restore
    verify_restore

    log "==================================================================="
    log "Database restore completed successfully!"
    log "Database: $DB_NAME on $DB_HOST:$DB_PORT"
    log "==================================================================="
}

# Run main function
main "$@"
