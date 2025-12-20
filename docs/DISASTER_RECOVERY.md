# ChurnVision Enterprise - Disaster Recovery Guide

This document outlines procedures for recovering ChurnVision Enterprise from various failure scenarios.

## Table of Contents
1. [Quick Reference](#quick-reference)
2. [Database Recovery](#database-recovery)
3. [Service Recovery](#service-recovery)
4. [Complete System Recovery](#complete-system-recovery)
5. [Data Validation](#data-validation)
6. [Escalation Contacts](#escalation-contacts)

---

## Quick Reference

| Scenario | Recovery Time | Procedure |
|----------|--------------|-----------|
| Single service crash | < 5 min | Auto-restart (Docker) |
| Database corruption | 15-30 min | Restore from backup |
| Complete host failure | 1-2 hours | Full redeploy + restore |
| Data center outage | 2-4 hours | Failover to DR site |

---

## Database Recovery

### Prerequisites
- Access to backup files in `./backups/` directory
- Database container running or able to start
- `POSTGRES_PASSWORD` from `.env.production`

### Restore from Daily Backup

1. **Stop the backend service** (prevents writes during restore):
   ```bash
   docker compose -f docker-compose.prod.yml stop backend
   ```

2. **List available backups**:
   ```bash
   ls -la ./backups/
   # Look for files like: churnvision_20241217_020000.sql.gz.enc
   ```

3. **Decrypt and restore the backup**:
   ```bash
   # Set your backup encryption key
   export BACKUP_ENCRYPTION_KEY="your-32-char-key-here"

   # Decrypt the backup
   openssl enc -aes-256-cbc -d -pbkdf2 \
     -in ./backups/churnvision_20241217_020000.sql.gz.enc \
     -out ./backups/restore.sql.gz \
     -pass env:BACKUP_ENCRYPTION_KEY

   # Decompress
   gunzip ./backups/restore.sql.gz

   # Restore to database
   docker exec -i churnvision-db psql -U churnvision -d churnvision < ./backups/restore.sql

   # Clean up
   rm ./backups/restore.sql
   ```

4. **Verify restoration**:
   ```bash
   docker exec churnvision-db psql -U churnvision -c "SELECT COUNT(*) FROM employees;"
   docker exec churnvision-db psql -U churnvision -c "SELECT COUNT(*) FROM users;"
   ```

5. **Restart the backend**:
   ```bash
   docker compose -f docker-compose.prod.yml start backend
   ```

### Point-in-Time Recovery (if WAL archiving enabled)

For systems with WAL archiving configured, you can recover to a specific point in time:

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Restore base backup + apply WAL logs to recovery target
# (Requires advanced PostgreSQL configuration)
docker exec churnvision-db pg_restore --target-time="2024-12-17 14:30:00" ...
```

---

## Service Recovery

### Single Service Failure

Docker Compose automatically restarts failed containers (`restart: unless-stopped`).

**Manual restart if needed**:
```bash
# Restart specific service
docker compose -f docker-compose.prod.yml restart backend

# Check service status
docker compose -f docker-compose.prod.yml ps

# View logs for troubleshooting
docker compose -f docker-compose.prod.yml logs -f --tail=100 backend
```

### Backend Won't Start

1. **Check logs for errors**:
   ```bash
   docker compose -f docker-compose.prod.yml logs backend --tail=200
   ```

2. **Common issues**:
   - **Database not ready**: Wait for db container to be healthy
   - **Migration failed**: Check Alembic migration logs
   - **Missing environment variable**: Verify `.env.production`
   - **License invalid**: Check `LICENSE_KEY`, `LICENSE_SIGNING_ALG`, and `LICENSE_PUBLIC_KEY`

3. **Force rebuild if image corrupted**:
   ```bash
   docker compose -f docker-compose.prod.yml build --no-cache backend
   docker compose -f docker-compose.prod.yml up -d backend
   ```

### Database Won't Start

1. **Check disk space**:
   ```bash
   df -h
   ```

2. **Check PostgreSQL logs**:
   ```bash
   docker compose -f docker-compose.prod.yml logs db --tail=200
   ```

3. **If data directory corrupted**, restore from backup (see above).

### Redis Won't Start

1. **Check memory**:
   ```bash
   free -h
   ```

2. **Clear Redis data if needed**:
   ```bash
   docker compose -f docker-compose.prod.yml down redis
   docker volume rm churnvision_redis_data
   docker compose -f docker-compose.prod.yml up -d redis
   ```

   **Note**: This clears rate limiting state and session data. Users may need to re-login.

### Ollama Won't Start

1. **Check GPU availability** (if using GPU):
   ```bash
   nvidia-smi
   ```

2. **Re-pull the model**:
   ```bash
   docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen3:4b
   ```

3. **Reduce memory if OOM**:
   Edit `docker-compose.prod.yml` to reduce Ollama memory limits.

---

## Complete System Recovery

Use this procedure when recovering on a new host or after complete system failure.

### 1. Prepare the New Host

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone/copy the deployment package
scp -r churnvision-enterprise/ newhost:/opt/
cd /opt/churnvision-enterprise
```

### 2. Restore Configuration

```bash
# Copy environment file from backup
cp /backup/.env.production .env.production

# Copy license key
cp /backup/license.key ./license.key

# Copy SSL certificates (if using HTTPS)
cp /backup/infra/ssl/* ./infra/ssl/
```

### 3. Start Infrastructure Services First

```bash
# Start database and redis
docker compose -f docker-compose.prod.yml up -d db redis

# Wait for healthy status
docker compose -f docker-compose.prod.yml ps
```

### 4. Restore Database

Follow the [Database Recovery](#database-recovery) steps above.

### 5. Start Remaining Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 6. Validate Recovery

```bash
# Check all services
docker compose -f docker-compose.prod.yml ps

# Test health endpoint
curl http://localhost:8000/health

# Test frontend
curl http://localhost:3000
```

---

## Data Validation

After any recovery, validate data integrity:

### Database Integrity Check

```bash
docker exec churnvision-db psql -U churnvision -c "
  SELECT
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM employees) as employees,
    (SELECT COUNT(*) FROM churn_outputs) as predictions,
    (SELECT COUNT(*) FROM training_jobs) as training_jobs;
"
```

### Model Files Check

```bash
# Verify ML models exist
ls -la ./models/

# Expected files:
# - churn_model.joblib
# - feature_scaler.joblib
# - label_encoder.joblib
```

### API Functionality Test

```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' | jq -r '.access_token')

# Test API
curl -s http://localhost:8000/api/v1/employees/ \
  -H "Authorization: Bearer $TOKEN" | jq '.total'
```

---

## Escalation Contacts

### Internal Support (First Response)
- **On-call Engineer**: Check PagerDuty/OpsGenie rotation
- **DevOps Team**: devops@yourcompany.com

### ChurnVision Support (Vendor)
- **Support Portal**: https://support.churnvision.com
- **Email**: support@churnvision.com
- **Phone**: +1-XXX-XXX-XXXX (24/7 for Enterprise customers)

### Priority Matrix

| Severity | Description | Response Time |
|----------|-------------|---------------|
| P1 - Critical | System completely down | 15 minutes |
| P2 - High | Major feature unavailable | 1 hour |
| P3 - Medium | Degraded performance | 4 hours |
| P4 - Low | Minor issue | Next business day |

---

## Preventive Measures

### Regular Backup Verification

Test backup restoration monthly:
```bash
# Create test database
docker exec churnvision-db createdb -U churnvision churnvision_test

# Restore latest backup to test database
# (follow restore procedure with -d churnvision_test)

# Verify data
docker exec churnvision-db psql -U churnvision -d churnvision_test \
  -c "SELECT COUNT(*) FROM employees;"

# Clean up
docker exec churnvision-db dropdb -U churnvision churnvision_test
```

### Monitoring Alerts

Ensure these alerts are configured:
- [ ] Disk usage > 80%
- [ ] Database connection failures
- [ ] Service health check failures
- [ ] Backup job failures
- [ ] SSL certificate expiry (30 days warning)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-17 | 1.0 | Initial disaster recovery guide |
