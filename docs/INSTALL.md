# ChurnVision Enterprise - Installation Guide

This guide covers the installation of ChurnVision Enterprise for on-premise deployment.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Installation Checklist](#pre-installation-checklist)
3. [Installation Steps](#installation-steps)
4. [Post-Installation Configuration](#post-installation-configuration)
5. [Verification](#verification)
6. [SSO Configuration](#sso-configuration)
7. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32 GB |
| Storage | 100 GB SSD | 500 GB NVMe SSD |
| Network | 1 Gbps | 10 Gbps |

### Software Requirements

| Software | Version | Notes |
|----------|---------|-------|
| Docker | 24.0+ | Docker Engine or Docker Desktop |
| Docker Compose | 2.20+ | Included with Docker Desktop |
| PostgreSQL | 15+ | Provided via Docker |
| Linux | Ubuntu 22.04+ / RHEL 8+ | For production deployments |

### Network Requirements

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Frontend | React dashboard |
| 8000 | Backend API | FastAPI server |
| 5432 | PostgreSQL | Database (internal) |
| 11434 | Ollama | Local LLM engine (internal) |

---

## Pre-Installation Checklist

- [ ] Docker and Docker Compose installed
- [ ] Sufficient disk space (100GB+)
- [ ] License key obtained from ChurnVision
- [ ] Firewall rules configured for ports 3000, 8000
- [ ] SSL certificates ready (for production)
- [ ] Backup encryption key generated
- [ ] SSO credentials ready (if using enterprise IdP)

---

## Installation Steps

### Step 1: Extract the Package

```bash
# Extract the ChurnVision package
tar -xzf churnvision-enterprise-*.tar.gz
cd churnvision-enterprise
```

### Step 2: Configure Environment Variables

```bash
# Copy the production template
cp .env.production.template .env

# Edit with your configuration
nano .env
```

Required environment variables:

```bash
# Database Configuration
POSTGRES_USER=churnvision
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=churnvision

# Security (MUST CHANGE IN PRODUCTION)
JWT_SECRET_KEY=<generate-with: openssl rand -hex 32>
LICENSE_SECRET_KEY=<provided-by-churnvision>
LICENSE_KEY=<your-license-key>

# Environment
ENVIRONMENT=production
DEBUG=false

# URLs
FRONTEND_URL=https://churnvision.yourcompany.com
ALLOWED_ORIGINS=https://churnvision.yourcompany.com
```

### Step 3: Generate Security Keys

```bash
# Generate JWT secret
openssl rand -hex 32

# Generate backup encryption key
openssl rand -base64 32 > /etc/churnvision/backup.key
chmod 600 /etc/churnvision/backup.key
```

### Step 4: Start the Services

```bash
# Pull images and start services
docker compose -f docker-compose.prod.yml up -d

# Check service status
docker compose -f docker-compose.prod.yml ps
```

### Step 5: Run Database Migrations

```bash
# Run Alembic migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### Step 6: Create Initial Admin User

```bash
# Access backend container
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.core.security import get_password_hash
print('Password hash:', get_password_hash('YourSecurePassword123!'))
"

# Or use the API to create the first user after login
```

---

## Post-Installation Configuration

### Configure SSL/TLS (Required for Production)

1. Place your SSL certificates in `/etc/churnvision/ssl/`:
   ```bash
   mkdir -p /etc/churnvision/ssl
   cp your-cert.pem /etc/churnvision/ssl/cert.pem
   cp your-key.pem /etc/churnvision/ssl/key.pem
   ```

2. Uncomment HTTPS section in `infra/nginx.conf`

3. Restart nginx:
   ```bash
   docker compose -f docker-compose.prod.yml restart nginx
   ```

### Configure Backup Schedule

```bash
# Add to crontab for daily backups at 2 AM
crontab -e

# Add this line:
0 2 * * * /path/to/churnvision/db/backup.sh >> /var/log/churnvision/backup.log 2>&1
```

### Configure Monitoring

ChurnVision exposes Prometheus metrics at `/metrics`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'churnvision'
    static_configs:
      - targets: ['churnvision-backend:8000']
    metrics_path: '/metrics'
```

---

## Verification

### Health Check

```bash
# Check backend health
curl http://localhost:8000/health

# Expected response:
{
  "status": "healthy",
  "service": "churnvision-backend",
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": true
  }
}
```

### Verify Services

```bash
# Check all services are running
docker compose -f docker-compose.prod.yml ps

# Check logs for errors
docker compose -f docker-compose.prod.yml logs --tail=100
```

### Test Login

1. Navigate to `https://your-domain:3000`
2. Login with admin credentials
3. Verify dashboard loads correctly

---

## SSO Configuration

ChurnVision supports enterprise SSO via OpenID Connect (OIDC).

### Azure AD / Entra ID

```bash
# .env configuration
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0
SSO_CLIENT_ID=your-app-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_REDIRECT_URI=https://churnvision.yourcompany.com/api/v1/auth/sso/callback
SSO_AUTO_CREATE_USERS=true
SSO_DEFAULT_ROLE=viewer
SSO_ADMIN_GROUPS=ChurnVision-Admins,IT-Admins
```

### Okta

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://your-domain.okta.com
SSO_CLIENT_ID=your-okta-client-id
SSO_CLIENT_SECRET=your-okta-client-secret
```

### Keycloak

```bash
SSO_ENABLED=true
SSO_PROVIDER=oidc
SSO_ISSUER_URL=https://keycloak.yourcompany.com/realms/churnvision
SSO_CLIENT_ID=churnvision-client
SSO_CLIENT_SECRET=your-client-secret
```

### Verify SSO Status

```bash
curl http://localhost:8000/api/v1/auth/sso/status
```

---

## Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check database logs
docker compose -f docker-compose.prod.yml logs db

# Verify connection
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.db.session import check_db_connection
import asyncio
print(asyncio.run(check_db_connection()))
"
```

#### License Validation Failed

```bash
# Check license status
curl http://localhost:8000/api/v1/license/status

# Verify license key format
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.core.license import LicenseValidator
print(LicenseValidator.get_license_info_dict())
"
```

#### Ollama/LLM Not Working

```bash
# Check Ollama status
docker compose -f docker-compose.prod.yml logs ollama

# Pull required model
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:3b
```

### Log Locations

| Log | Location |
|-----|----------|
| Backend | `docker compose logs backend` |
| Frontend | `docker compose logs frontend` |
| Database | `docker compose logs db` |
| Nginx | `/var/log/nginx/` |
| Backups | `/var/log/churnvision/backup.log` |

### Getting Support

- Email: support@churnvision.com
- Documentation: https://docs.churnvision.com
- License Portal: https://license.churnvision.com

---

## Next Steps

- [Upgrade Guide](UPGRADE.md) - How to upgrade ChurnVision
- [Backup & Restore](BACKUP.md) - Backup and disaster recovery
- [Troubleshooting](TROUBLESHOOT.md) - Common issues and solutions
