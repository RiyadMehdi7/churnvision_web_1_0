# ChurnVision Enterprise - Production Setup Guide

This guide covers secure deployment of ChurnVision Enterprise on-premise.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 16GB RAM minimum (32GB recommended)
- 100GB disk space
- Valid ChurnVision license key

## Quick Start

```bash
# 1. Create installation directory
sudo mkdir -p /opt/churnvision
cd /opt/churnvision

# 2. Copy deployment files
cp /path/to/docker-compose.prod.yml .
cp /path/to/license.key .

# 3. Generate secrets and create .env file
cat > .env << 'EOF'
# === ENVIRONMENT ===
ENVIRONMENT=production
DEBUG=false

# === SECRETS (GENERATE UNIQUE VALUES!) ===
SECRET_KEY=REPLACE_WITH_GENERATED_VALUE
ENCRYPTION_KEY=REPLACE_WITH_GENERATED_VALUE

# === LICENSE ===
LICENSE_KEY=REPLACE_WITH_YOUR_LICENSE_JWT
LICENSE_SIGNING_ALG=RS256
LICENSE_PUBLIC_KEY=REPLACE_WITH_CHURNVISION_PUBLIC_KEY
INTEGRITY_PUBLIC_KEY=REPLACE_WITH_CHURNVISION_INTEGRITY_PUBLIC_KEY
INTEGRITY_MANIFEST_PATH=/etc/churnvision/integrity.json
INTEGRITY_SIGNATURE_PATH=/etc/churnvision/integrity.sig
INTEGRITY_REQUIRE_SIGNED=true

# === LICENSE STATE (ANTI-ROLLBACK) ===
LICENSE_STATE_PATH=/app/churnvision_data/license_state.json
INSTALLATION_ID_PATH=/app/churnvision_data/installation.id

# === DATABASE ===
POSTGRES_USER=churnvision
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
POSTGRES_DB=churnvision

# === REDIS ===
REDIS_URL=redis://redis:6379/0

# === CORS (your frontend domains) ===
ALLOWED_ORIGINS=https://churnvision.yourcompany.com
EOF

# 4. Generate secrets
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(64))"
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"

# 5. Update .env with generated values, then start
docker compose -f docker-compose.prod.yml up -d
```

## Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing key (64+ chars) |
| `LICENSE_KEY` | Yes | Your license JWT (provided by ChurnVision) |
| `LICENSE_SIGNING_ALG` | Yes | License signature algorithm (RS256 in production) |
| `LICENSE_PUBLIC_KEY` | Yes | License public key for RS256 verification |
| `INTEGRITY_PUBLIC_KEY` | Yes | Public key for integrity manifest signature verification |
| `INTEGRITY_MANIFEST_PATH` | Yes | Path to integrity manifest (default: `/etc/churnvision/integrity.json`) |
| `INTEGRITY_SIGNATURE_PATH` | Yes | Path to integrity signature (default: `/etc/churnvision/integrity.sig`) |
| `INTEGRITY_REQUIRE_SIGNED` | No | Require signed integrity manifest (default: true) |
| `ENCRYPTION_KEY` | Yes | Fernet key for field-level encryption |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend URLs |
| `REDIS_URL` | No | Redis connection URL (default: in-container) |
| `REDIS_TLS_CA_CERT` | No | Path to Redis CA certificate |
| `ARTIFACT_ENCRYPTION_REQUIRED` | No | Require encrypted ML artifacts (default: true in production) |

### File Mounts

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./license.key` | `/etc/churnvision/license.key` | License file (read-only) |
| `./models/` | `/app/models` | ML model artifacts |
| `./logs/` | `/app/logs` | Application logs |
| `./backups/` | `/backups` | Database backups |

## Security Configuration

### 1. Database SSL

Database connections use SSL by default in production. The connection string includes `?ssl=require`.

For custom CA certificates:
```bash
# Mount your PostgreSQL CA certificate
volumes:
  - ./ssl/postgres-ca.crt:/etc/ssl/certs/postgres-ca.crt:ro
environment:
  - DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/churnvision?ssl=require&sslrootcert=/etc/ssl/certs/postgres-ca.crt
```

### 2. Redis TLS

For encrypted Redis connections:

```bash
# In .env
REDIS_URL=rediss://redis:6379/0
REDIS_TLS_CA_CERT=/etc/churnvision/redis-ca.crt

# In docker-compose.prod.yml, add volume:
volumes:
  - ./ssl/redis-ca.crt:/etc/churnvision/redis-ca.crt:ro
```

### 3. CSRF Protection

CSRF protection is **automatically enabled in production**. Your frontend must:

1. Read the `csrf_token` cookie (set on first request)
2. Include it in the `X-CSRF-Token` header for POST/PUT/DELETE requests

```javascript
// Example: Frontend CSRF handling
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('csrf_token='))
  ?.split('=')[1];

fetch('/api/v1/employees', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,  // Required for mutations
  },
  credentials: 'include',
  body: JSON.stringify(data),
});
```

**Note:** Requests with `Authorization: Bearer <token>` headers are exempt from CSRF (they use token auth, not cookies).

### 4. Request Size Limits

| Endpoint Type | Max Size |
|---------------|----------|
| Default | 10 MB |
| File uploads (`/api/v1/churn/upload`, `/api/v1/rag/upload`) | 100 MB |

### 5. Rate Limiting

Rate limits are enforced per-user (authenticated) or per-IP (anonymous):

| Endpoint | Limit |
|----------|-------|
| Login | 5/minute |
| Registration | 3/minute |
| API reads | 100/minute |
| API writes | 30/minute |
| AI predictions | 20/minute |
| File uploads | 10/minute |

### 6. Integrity Manifest (Anti-Tamper)

Production requires a signed integrity manifest. Generate it during build:

```bash
# Build with integrity manifest and signature
INTEGRITY_PRIVATE_KEY=/path/to/integrity-private-key.pem \
make build-secure
```

The secure image embeds:
- `/etc/churnvision/integrity.json`
- `/etc/churnvision/integrity.sig`

Set `INTEGRITY_PUBLIC_KEY` in your `.env.production` to validate at startup.

## HTTPS Setup (Nginx)

Create `infra/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:80;
    }

    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name churnvision.yourcompany.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;

        # API routes
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket support (for real-time features)
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Health check
        location /health {
            proxy_pass http://backend;
        }

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
        }
    }
}
```

Place SSL certificates:
```bash
mkdir -p infra/ssl
cp your-cert.pem infra/ssl/cert.pem
cp your-key.pem infra/ssl/key.pem
chmod 600 infra/ssl/key.pem
```

## Health Checks

Verify deployment:

```bash
# Check all services are running
docker compose -f docker-compose.prod.yml ps

# Check backend health
curl -k https://localhost/health

# Check logs
docker compose -f docker-compose.prod.yml logs backend --tail=50
```

## Backup & Recovery

### Database Backup

```bash
# Manual backup
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U churnvision churnvision > backups/backup-$(date +%Y%m%d).sql

# Automated daily backup (add to crontab)
0 2 * * * cd /opt/churnvision && docker compose exec -T db pg_dump -U churnvision churnvision | gzip > backups/backup-$(date +\%Y\%m\%d).sql.gz
```

### Restore

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U churnvision churnvision < backups/backup-20241201.sql
```

## Monitoring

### Prometheus Metrics

Metrics are exposed at `http://backend:8000/metrics`. Configure Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'churnvision'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: /metrics
```

### Log Aggregation

Logs are JSON-formatted in production. Configure your log aggregator (ELK, Loki, etc.):

```bash
# View structured logs
docker compose -f docker-compose.prod.yml logs backend --tail=100 | jq .
```

## Troubleshooting

### License Validation Failed

```bash
# Check license file exists and is readable
ls -la license.key

# Check license expiry
docker compose exec backend python -c "
from app.core.license import LicenseValidator
info = LicenseValidator.validate_license()
print(f'Expires: {info.expires_at}')
print(f'Days remaining: {info.days_remaining}')
"
```

### Database Connection Issues

```bash
# Test database connectivity
docker compose exec backend python -c "
from app.db.session import check_db_connection
import asyncio
print('DB OK:', asyncio.run(check_db_connection()))
"
```

### CSRF Errors

If frontend gets 403 CSRF errors:
1. Ensure credentials are included: `credentials: 'include'`
2. Check `csrf_token` cookie is being set
3. Verify `X-CSRF-Token` header matches cookie value
4. For API-only access, use Bearer token auth (CSRF exempt)

## Support

- Documentation: https://docs.churnvision.com
- Support Portal: https://support.churnvision.com
- Emergency: support@churnvision.com
