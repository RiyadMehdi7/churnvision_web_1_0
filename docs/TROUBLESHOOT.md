# ChurnVision Enterprise - Troubleshooting Guide

Common issues and their solutions for ChurnVision Enterprise.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Authentication Issues](#authentication-issues)
3. [Database Issues](#database-issues)
4. [Performance Issues](#performance-issues)
5. [LLM/AI Issues](#llmai-issues)
6. [Backup/Restore Issues](#backuprestore-issues)
7. [Log Analysis](#log-analysis)

---

## Installation Issues

### Docker Compose Fails to Start

**Symptom:** `docker compose up` fails with port binding errors

**Solution:**
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :8000

# Kill conflicting processes or change ports in docker-compose.yml
```

### Database Migration Fails

**Symptom:** `alembic upgrade head` fails with schema errors

**Solution:**
```bash
# Check current migration state
docker compose exec backend alembic current

# Check migration history
docker compose exec backend alembic history

# If stuck, try downgrading then upgrading
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic upgrade head
```

### Image Pull Fails (Air-Gap Environment)

**Symptom:** `docker pull` fails with network errors

**Solution:**
Use the air-gap bundle:
```bash
# On connected machine
./infra/airgap/bundle.sh

# Transfer bundle to air-gapped environment
scp churnvision-enterprise-*.tar.gz target-server:

# On air-gapped machine
tar -xzf churnvision-enterprise-*.tar.gz
cd churnvision-enterprise-*
./install.sh
```

---

## Authentication Issues

### Login Fails with "Invalid Credentials"

**Symptom:** Correct password rejected

**Check:**
```bash
# Verify user exists
docker compose exec backend python -c "
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.user import User
import asyncio

async def check():
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == 'admin'))
        user = result.scalar_one_or_none()
        if user:
            print(f'User: {user.username}, Active: {user.is_active}')
        else:
            print('User not found')

asyncio.run(check())
"
```

**Solution:**
```bash
# Reset password via admin API or direct DB update
docker compose exec backend python -c "
from app.core.security import get_password_hash
print(get_password_hash('NewPassword123!'))
"
```

### JWT Token Expired

**Symptom:** API returns 401 after some time

**Solution:**
- Check `ACCESS_TOKEN_EXPIRE_MINUTES` in `.env` (default: 30)
- Frontend should handle token refresh
- For longer sessions, increase the value

### SSO Login Fails

**Symptom:** Redirect loop or "SSO not configured" error

**Check:**
```bash
# Check SSO status
curl http://localhost:8000/api/v1/auth/sso/status

# Verify environment variables
docker compose exec backend python -c "
from app.core.sso.config import get_sso_settings
settings = get_sso_settings()
print(f'SSO Enabled: {settings.SSO_ENABLED}')
print(f'Provider: {settings.SSO_PROVIDER}')
print(f'Configured: {settings.is_oidc_configured()}')
"
```

**Solution:**
Verify `.env` has correct SSO settings:
```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://your-idp.com
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-secret
```

---

## Database Issues

### Connection Refused

**Symptom:** "connection refused" errors

**Check:**
```bash
# Is database running?
docker compose ps db

# Check database logs
docker compose logs db --tail=50

# Test connection
docker compose exec db pg_isready -U postgres
```

**Solution:**
```bash
# Restart database
docker compose restart db

# Wait for it to be ready
sleep 10

# Test connection
docker compose exec backend python -c "
from app.db.session import check_db_connection
import asyncio
print(asyncio.run(check_db_connection()))
"
```

### Database Full

**Symptom:** Writes fail, "no space left on device"

**Solution:**
```bash
# Check disk space
docker system df

# Clean up Docker
docker system prune -a

# Check PostgreSQL size
docker compose exec db psql -U postgres -c "
SELECT pg_size_pretty(pg_database_size('churnvision'));
"

# Vacuum database
docker compose exec db psql -U postgres -d churnvision -c "VACUUM FULL;"
```

### Slow Queries

**Symptom:** API responses take >5 seconds

**Check:**
```bash
# Enable query logging
docker compose exec db psql -U postgres -c "
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
"

# Check slow query log
docker compose logs db | grep duration
```

**Solution:**
```bash
# Analyze tables
docker compose exec db psql -U postgres -d churnvision -c "ANALYZE;"

# Check missing indexes
docker compose exec db psql -U postgres -d churnvision -c "
SELECT schemaname, tablename, indexname FROM pg_indexes WHERE schemaname = 'public';
"
```

---

## Performance Issues

### High Memory Usage

**Symptom:** Container OOM killed

**Check:**
```bash
# Check container stats
docker stats --no-stream

# Check memory limits
docker compose config | grep -A5 deploy
```

**Solution:**
Adjust resource limits in `docker-compose.prod.yml`:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
```

### Slow Frontend

**Symptom:** Dashboard takes long to load

**Check:**
- Browser DevTools → Network tab
- Look for slow API calls

**Solution:**
```bash
# Check backend response times
curl -w "Time: %{time_total}s\n" http://localhost:8000/health

# Check if it's database related
docker compose logs backend | grep "slow query"
```

---

## LLM/AI Issues

### Ollama Not Responding

**Symptom:** AI features fail with timeout

**Check:**
```bash
# Is Ollama running?
docker compose ps ollama

# Test Ollama directly
docker compose exec ollama ollama list

# Check logs
docker compose logs ollama --tail=50
```

**Solution:**
```bash
# Restart Ollama
docker compose restart ollama

# Pull model again
docker compose exec ollama ollama pull qwen2.5:3b
```

### Model Not Found

**Symptom:** "model not found" errors

**Solution:**
```bash
# List available models
docker compose exec ollama ollama list

# Pull required model
docker compose exec ollama ollama pull qwen2.5:3b

# Verify
docker compose exec ollama ollama run qwen2.5:3b "Hello"
```

### Slow AI Responses

**Symptom:** AI chat takes >30 seconds

**Check:**
```bash
# Check GPU availability (if applicable)
docker compose exec ollama nvidia-smi

# Check Ollama resource usage
docker stats ollama --no-stream
```

**Solution:**
- Use smaller model for faster responses
- Add GPU support if available
- Increase Ollama memory allocation

---

## Backup/Restore Issues

### Backup Fails

**Symptom:** `backup.sh` exits with error

**Check:**
```bash
# Check disk space
df -h /var/backups

# Check permissions
ls -la /var/backups/churnvision

# Test database connection
PGPASSWORD=yourpass pg_dump -h localhost -U postgres churnvision > /dev/null
```

**Solution:**
```bash
# Create backup directory
mkdir -p /var/backups/churnvision
chmod 700 /var/backups/churnvision

# Generate encryption key
openssl rand -base64 32 > /etc/churnvision/backup.key
chmod 600 /etc/churnvision/backup.key
```

### Restore Fails

**Symptom:** `restore.sh` fails to decrypt or import

**Check:**
```bash
# List available backups
./db/restore.sh --list

# Verify encryption key exists
ls -la /etc/churnvision/backup.key
```

**Solution:**
```bash
# Restore without encryption (if key lost)
gunzip -c backup.sql.gz | docker compose exec -T db psql -U postgres -d churnvision

# For encrypted backups, you need the original key
```

---

## Log Analysis

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs backend -f --tail=100

# Filter by time
docker compose logs --since 1h

# Filter errors
docker compose logs 2>&1 | grep -i error
```

### Common Error Patterns

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `connection refused` | Service not running | Restart service |
| `401 Unauthorized` | Token expired/invalid | Re-login |
| `403 Forbidden` | Missing permissions | Check user roles |
| `500 Internal Server Error` | Backend bug | Check logs for details |
| `OOM killed` | Memory limit exceeded | Increase limits |
| `disk quota exceeded` | Storage full | Clean up or expand |

### Enabling Debug Logging

```bash
# In .env
DEBUG=true

# Restart backend
docker compose restart backend
```

---

## Getting Support

If issues persist:

1. Collect logs:
   ```bash
   docker compose logs > churnvision-logs.txt 2>&1
   ```

2. Collect system info:
   ```bash
   docker info > docker-info.txt
   docker compose ps > services-status.txt
   ```

3. Contact support with:
   - ChurnVision version
   - Error description
   - Steps to reproduce
   - Log files
   - Environment details (OS, Docker version)

**Support Email:** support@churnvision.com
