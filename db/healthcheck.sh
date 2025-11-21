#!/bin/bash
# ChurnVision Enterprise - Database Health Check Script
# This script performs comprehensive health checks on the PostgreSQL database

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-churnvision}"
DB_USER="${DB_USER:-postgres}"

# Thresholds
MAX_CONNECTIONS_PERCENT=${MAX_CONNECTIONS_PERCENT:-80}
MAX_CACHE_HIT_RATIO=${MAX_CACHE_HIT_RATIO:-95}
MAX_DISK_USAGE_PERCENT=${MAX_DISK_USAGE_PERCENT:-85}
MAX_LONG_RUNNING_QUERIES=${MAX_LONG_RUNNING_QUERIES:-5}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Health status
OVERALL_STATUS="HEALTHY"
ISSUES_FOUND=0

# Logging functions
log() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    OVERALL_STATUS="UNHEALTHY"
    ((ISSUES_FOUND++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    if [ "$OVERALL_STATUS" != "UNHEALTHY" ]; then
        OVERALL_STATUS="WARNING"
    fi
    ((ISSUES_FOUND++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

header() {
    echo
    echo "=================================================================="
    echo "$1"
    echo "=================================================================="
}

# Execute SQL query
execute_query() {
    local query="$1"
    PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "$query" 2>/dev/null
}

# Check database connectivity
check_connectivity() {
    header "Database Connectivity"

    if PGPASSWORD="$PGPASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
        log "Database connection successful"

        local version=$(execute_query "SELECT version();")
        info "PostgreSQL version: $(echo "$version" | cut -d',' -f1)"

        return 0
    else
        error "Cannot connect to database at $DB_HOST:$DB_PORT"
        return 1
    fi
}

# Check database size and growth
check_database_size() {
    header "Database Size"

    local db_size=$(execute_query "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")
    local db_size_bytes=$(execute_query "SELECT pg_database_size('$DB_NAME');")

    info "Database size: $db_size"

    # Check largest tables
    info "Top 5 largest tables:"
    execute_query "
        SELECT
            schemaname || '.' || tablename AS table_name,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 5;
    " | while IFS='|' read -r table size; do
        echo "   - $table: $size"
    done
}

# Check connection usage
check_connections() {
    header "Connection Statistics"

    local max_connections=$(execute_query "SHOW max_connections;")
    local current_connections=$(execute_query "SELECT count(*) FROM pg_stat_activity WHERE datname='$DB_NAME';")
    local connection_percent=$((current_connections * 100 / max_connections))

    info "Current connections: $current_connections / $max_connections ($connection_percent%)"

    if [ "$connection_percent" -ge "$MAX_CONNECTIONS_PERCENT" ]; then
        warn "Connection usage is high: $connection_percent% (threshold: $MAX_CONNECTIONS_PERCENT%)"
    else
        log "Connection usage is healthy"
    fi

    # Show active connections by state
    info "Connections by state:"
    execute_query "
        SELECT state, count(*)
        FROM pg_stat_activity
        WHERE datname='$DB_NAME'
        GROUP BY state;
    " | while IFS='|' read -r state count; do
        echo "   - $state: $count"
    done
}

# Check cache hit ratio
check_cache_performance() {
    header "Cache Performance"

    local cache_hit_ratio=$(execute_query "
        SELECT round(
            100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0),
            2
        )
        FROM pg_statio_user_tables;
    ")

    info "Cache hit ratio: ${cache_hit_ratio}%"

    if (( $(echo "$cache_hit_ratio < $MAX_CACHE_HIT_RATIO" | bc -l) )); then
        warn "Cache hit ratio is low: ${cache_hit_ratio}% (threshold: ${MAX_CACHE_HIT_RATIO}%)"
    else
        log "Cache performance is good"
    fi
}

# Check for long-running queries
check_long_running_queries() {
    header "Long-Running Queries"

    local long_queries=$(execute_query "
        SELECT count(*)
        FROM pg_stat_activity
        WHERE state = 'active'
        AND datname='$DB_NAME'
        AND now() - query_start > interval '5 minutes';
    ")

    info "Long-running queries (>5 min): $long_queries"

    if [ "$long_queries" -gt "$MAX_LONG_RUNNING_QUERIES" ]; then
        warn "Too many long-running queries: $long_queries (threshold: $MAX_LONG_RUNNING_QUERIES)"

        info "Details of long-running queries:"
        execute_query "
            SELECT
                pid,
                now() - query_start AS duration,
                left(query, 60) AS query
            FROM pg_stat_activity
            WHERE state = 'active'
            AND datname='$DB_NAME'
            AND now() - query_start > interval '5 minutes'
            ORDER BY duration DESC
            LIMIT 5;
        " | while IFS='|' read -r pid duration query; do
            echo "   - PID $pid ($duration): $query..."
        done
    else
        log "No concerning long-running queries"
    fi
}

# Check for blocking queries
check_blocking_queries() {
    header "Blocking Queries"

    local blocking_queries=$(execute_query "
        SELECT count(*)
        FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
        AND datname='$DB_NAME';
    ")

    info "Queries waiting on locks: $blocking_queries"

    if [ "$blocking_queries" -gt 0 ]; then
        warn "Found $blocking_queries queries blocked by locks"
    else
        log "No blocking queries detected"
    fi
}

# Check table bloat
check_table_bloat() {
    header "Table Bloat Analysis"

    info "Tables with potential bloat:"
    local bloated_tables=$(execute_query "
        SELECT
            schemaname || '.' || tablename AS table_name,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
            n_dead_tup AS dead_tuples
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 10000
        ORDER BY n_dead_tup DESC
        LIMIT 5;
    ")

    if [ -z "$bloated_tables" ]; then
        log "No significant table bloat detected"
    else
        echo "$bloated_tables" | while IFS='|' read -r table size dead_tup; do
            echo "   - $table: $size (dead tuples: $dead_tup)"
        done
        warn "Some tables may need VACUUM ANALYZE"
    fi
}

# Check index usage
check_index_usage() {
    header "Index Usage"

    info "Unused indexes (never scanned):"
    local unused_indexes=$(execute_query "
        SELECT
            schemaname || '.' || tablename || '.' || indexname AS index_name,
            pg_size_pretty(pg_relation_size(indexrelid)) AS size
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
        AND indexrelname NOT LIKE 'pg_toast%'
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 5;
    ")

    if [ -z "$unused_indexes" ]; then
        log "All indexes are being used"
    else
        echo "$unused_indexes" | while IFS='|' read -r index size; do
            echo "   - $index: $size"
        done
        info "Consider dropping unused indexes to save space"
    fi
}

# Check replication lag (if applicable)
check_replication() {
    header "Replication Status"

    local is_replica=$(execute_query "SELECT pg_is_in_recovery();")

    if [ "$is_replica" = "t" ]; then
        local lag=$(execute_query "
            SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int;
        ")

        info "This is a replica with lag: ${lag}s"

        if [ "$lag" -gt 60 ]; then
            warn "Replication lag is high: ${lag}s"
        else
            log "Replication lag is acceptable"
        fi
    else
        info "This is a primary database (not a replica)"
    fi
}

# Check for missing primary keys
check_missing_primary_keys() {
    header "Schema Validation"

    local tables_without_pk=$(execute_query "
        SELECT count(*)
        FROM information_schema.tables t
        LEFT JOIN information_schema.table_constraints tc
            ON t.table_name = tc.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND tc.constraint_name IS NULL;
    ")

    if [ "$tables_without_pk" -gt 0 ]; then
        warn "Found $tables_without_pk tables without primary keys"
    else
        log "All tables have primary keys"
    fi
}

# Check audit log partitions
check_audit_partitions() {
    header "Audit Log Partitions"

    local partition_count=$(execute_query "
        SELECT count(*)
        FROM pg_tables
        WHERE tablename LIKE 'audit_log_%';
    " || echo "0")

    info "Audit log partitions: $partition_count"

    if [ "$partition_count" -lt 2 ]; then
        warn "Low number of audit log partitions - consider creating more"
    else
        log "Audit log partitioning is active"
    fi
}

# Check table statistics freshness
check_statistics() {
    header "Table Statistics"

    info "Tables with outdated statistics (>7 days):"
    local outdated_stats=$(execute_query "
        SELECT
            schemaname || '.' || tablename AS table_name,
            last_analyze,
            last_autoanalyze
        FROM pg_stat_user_tables
        WHERE (last_analyze IS NULL OR last_analyze < now() - interval '7 days')
        AND (last_autoanalyze IS NULL OR last_autoanalyze < now() - interval '7 days')
        AND n_live_tup > 1000
        LIMIT 5;
    ")

    if [ -z "$outdated_stats" ]; then
        log "All table statistics are up to date"
    else
        echo "$outdated_stats" | while IFS='|' read -r table last_analyze last_autoanalyze; do
            echo "   - $table"
        done
        warn "Some tables may need ANALYZE"
    fi
}

# Generate summary
generate_summary() {
    header "Health Check Summary"

    echo
    if [ "$OVERALL_STATUS" = "HEALTHY" ]; then
        echo -e "${GREEN}Overall Status: HEALTHY ✓${NC}"
    elif [ "$OVERALL_STATUS" = "WARNING" ]; then
        echo -e "${YELLOW}Overall Status: WARNING ⚠${NC}"
    else
        echo -e "${RED}Overall Status: UNHEALTHY ✗${NC}"
    fi

    echo "Issues found: $ISSUES_FOUND"
    echo "Timestamp: $(date)"
    echo
}

# Main execution
main() {
    echo "=================================================================="
    echo "ChurnVision Enterprise - Database Health Check"
    echo "=================================================================="
    echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    echo "Timestamp: $(date)"
    echo

    # Run all checks
    check_connectivity || exit 1
    check_database_size
    check_connections
    check_cache_performance
    check_long_running_queries
    check_blocking_queries
    check_table_bloat
    check_index_usage
    check_replication
    check_missing_primary_keys
    check_audit_partitions
    check_statistics

    # Generate summary
    generate_summary

    # Exit with appropriate code
    if [ "$OVERALL_STATUS" = "UNHEALTHY" ]; then
        exit 1
    elif [ "$OVERALL_STATUS" = "WARNING" ]; then
        exit 0
    else
        exit 0
    fi
}

# Run main function
main "$@"
