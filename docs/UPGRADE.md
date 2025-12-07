# ChurnVision Enterprise - Upgrade Guide

This guide covers upgrading ChurnVision Enterprise to a new version.

## Table of Contents

1. [Before You Upgrade](#before-you-upgrade)
2. [Upgrade Process](#upgrade-process)
3. [Version-Specific Notes](#version-specific-notes)
4. [Rollback Procedure](#rollback-procedure)
5. [Post-Upgrade Verification](#post-upgrade-verification)

---

## Before You Upgrade

### Pre-Upgrade Checklist

- [ ] Review release notes for the target version
- [ ] Create a full database backup
- [ ] Note current version number
- [ ] Schedule maintenance window
- [ ] Notify users of planned downtime
- [ ] Verify backup restoration works
- [ ] Review breaking changes

### Create Backup

```bash
# Run full backup before upgrade
./db/backup.sh

# Verify backup was created
ls -la /var/backups/churnvision/

# Test restore in a separate environment (recommended)
```

### Document Current State

```bash
# Record current version
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.core.config import settings
print(f'Environment: {settings.ENVIRONMENT}')
"

# Record current migration state
docker compose -f docker-compose.prod.yml exec backend alembic current

# Export current configuration
cp .env .env.backup.$(date +%Y%m%d)
```

---

## Upgrade Process

### Standard Upgrade (Minor/Patch Versions)

```bash
# Step 1: Stop services
docker compose -f docker-compose.prod.yml down

# Step 2: Backup current installation
cp -r . ../churnvision-backup-$(date +%Y%m%d)

# Step 3: Pull new images
docker compose -f docker-compose.prod.yml pull

# Step 4: Start services
docker compose -f docker-compose.prod.yml up -d

# Step 5: Run database migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Step 6: Verify health
curl http://localhost:8000/health
```

### Major Version Upgrade

For major version upgrades (e.g., 1.x to 2.x), additional steps may be required:

```bash
# Step 1: Full backup
./db/backup.sh

# Step 2: Stop all services
docker compose -f docker-compose.prod.yml down

# Step 3: Extract new version
tar -xzf churnvision-enterprise-2.x.x.tar.gz
cd churnvision-enterprise-2.x.x

# Step 4: Migrate configuration
# Compare old .env with new .env.production.template
diff ../.env.backup .env.production.template

# Step 5: Update .env with new settings
cp ../.env.backup .env
# Add any new required settings from template

# Step 6: Pull new images
docker compose -f docker-compose.prod.yml pull

# Step 7: Start database first
docker compose -f docker-compose.prod.yml up -d db
sleep 10  # Wait for database to be ready

# Step 8: Run migrations
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

# Step 9: Start remaining services
docker compose -f docker-compose.prod.yml up -d

# Step 10: Verify
curl http://localhost:8000/health
```

### Zero-Downtime Upgrade (Blue-Green)

For environments requiring zero downtime:

```bash
# Assumes you have a load balancer

# Step 1: Deploy new version to "green" environment
export COMPOSE_PROJECT_NAME=churnvision-green
docker compose -f docker-compose.prod.yml up -d

# Step 2: Run migrations (should be backward compatible)
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Step 3: Verify green environment
curl http://localhost:8001/health  # Green runs on different port

# Step 4: Switch load balancer to green

# Step 5: Drain and stop blue environment
export COMPOSE_PROJECT_NAME=churnvision-blue
docker compose -f docker-compose.prod.yml down
```

---

## Version-Specific Notes

### Upgrading to 1.1.0

**New Features:**
- Prometheus metrics endpoint (`/metrics`)
- SSO/OIDC integration
- Admin UI improvements

**Required Steps:**
```bash
# Add new environment variables
echo "SSO_ENABLED=false" >> .env

# Install new dependencies (handled by Docker)
docker compose -f docker-compose.prod.yml pull

# Run migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

**Breaking Changes:**
- None

### Upgrading to 1.0.x from 0.x

**Required Steps:**
```bash
# Database schema changes
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# Clear frontend cache
docker compose -f docker-compose.prod.yml exec frontend rm -rf /app/.next/cache
```

---

## Rollback Procedure

If the upgrade fails, follow these steps to rollback:

### Quick Rollback (Same Day)

```bash
# Step 1: Stop services
docker compose -f docker-compose.prod.yml down

# Step 2: Restore previous version
cd ..
rm -rf churnvision-enterprise
mv churnvision-backup-YYYYMMDD churnvision-enterprise
cd churnvision-enterprise

# Step 3: Restore previous Docker images
docker compose -f docker-compose.prod.yml up -d

# Step 4: Rollback database migration (if needed)
docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1
```

### Full Rollback (From Backup)

```bash
# Step 1: Stop services
docker compose -f docker-compose.prod.yml down

# Step 2: Restore database from backup
./db/restore.sh /var/backups/churnvision/churnvision_backup_YYYYMMDD.sql.gz.enc

# Step 3: Restore previous version files
cd ..
rm -rf churnvision-enterprise
mv churnvision-backup-YYYYMMDD churnvision-enterprise
cd churnvision-enterprise

# Step 4: Start services
docker compose -f docker-compose.prod.yml up -d
```

---

## Post-Upgrade Verification

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# License status
curl http://localhost:8000/api/v1/license/status

# Database connectivity
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.db.session import check_db_connection
import asyncio
print('DB Connected:', asyncio.run(check_db_connection()))
"
```

### Functional Tests

1. **Login Test**
   - Navigate to frontend
   - Login with admin credentials
   - Verify dashboard loads

2. **Core Features Test**
   - View employee list
   - Run a prediction
   - Check AI assistant

3. **Admin Features Test**
   - Access admin panel (`/admin`)
   - Verify user management works
   - Check audit logs

### Performance Check

```bash
# Check response times
curl -w "@curl-format.txt" http://localhost:8000/health

# Check container resource usage
docker stats --no-stream
```

### Log Review

```bash
# Check for errors in logs
docker compose -f docker-compose.prod.yml logs --since 10m | grep -i error

# Check migration logs
docker compose -f docker-compose.prod.yml logs backend | grep -i alembic
```

---

## Upgrade Automation

For automated upgrades in CI/CD pipelines:

```bash
#!/bin/bash
# upgrade.sh

set -euo pipefail

VERSION=${1:-latest}
BACKUP_DIR="/var/backups/churnvision"

echo "=== ChurnVision Upgrade to ${VERSION} ==="

# Pre-flight checks
echo "Running pre-flight checks..."
curl -sf http://localhost:8000/health || exit 1

# Backup
echo "Creating backup..."
./db/backup.sh

# Upgrade
echo "Pulling new images..."
docker compose -f docker-compose.prod.yml pull

echo "Stopping services..."
docker compose -f docker-compose.prod.yml down

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "Running migrations..."
sleep 10  # Wait for services
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

# Verify
echo "Verifying upgrade..."
sleep 5
curl -sf http://localhost:8000/health || {
    echo "Upgrade failed! Rolling back..."
    # Rollback logic here
    exit 1
}

echo "=== Upgrade Complete ==="
```

---

## Getting Help

If you encounter issues during upgrade:

1. Check the [Troubleshooting Guide](TROUBLESHOOT.md)
2. Review logs: `docker compose logs`
3. Contact support: support@churnvision.com

Include in support requests:
- Current version
- Target version
- Error messages
- Logs from the upgrade process
