# ChurnVision Enterprise - On-Premise Deployment Guide

This guide is for IT administrators deploying ChurnVision Enterprise on customer infrastructure.

## System Requirements

### Minimum Hardware
| Component | Requirement |
|-----------|-------------|
| CPU | 4 cores (8 recommended) |
| RAM | 16 GB (32 GB recommended) |
| Storage | 100 GB SSD |
| GPU | Optional (improves LLM performance) |

### Software Prerequisites
- Docker 24.0+ with Docker Compose v2
- Network access to Docker Hub (for initial pull)
- Port availability: 80, 443, 3000, 8000, 5432, 11434

---

## Quick Start (5 minutes)

### 1. Extract the Deployment Package
```bash
tar -xzf churnvision-enterprise-v1.0.tar.gz
cd churnvision-enterprise
```

### 2. Configure Environment
```bash
cp .env.production.template .env.production

# Edit with your values
nano .env.production
```

**Required changes:**
```bash
# Generate secure passwords:
openssl rand -base64 32  # For POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(32))"  # For JWT_SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # For ENCRYPTION_KEY
```

### 3. Add License Key
Place your license file:
```bash
cp /path/to/license.key ./license.key
```

### 4. Start Services
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 5. Verify Installation
```bash
# Check all services are running
docker compose -f docker-compose.prod.yml ps

# Check health endpoint
curl http://localhost:8000/health
```

**Access Points:**
- Dashboard: http://localhost:3000
- API: http://localhost:8000
- API Docs (dev only): http://localhost:8000/docs

---

## Detailed Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | Database password (min 32 chars) |
| `JWT_SECRET_KEY` | Yes | Authentication secret (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | Field encryption key for PII (Fernet key) |
| `LICENSE_KEY` | Yes | Your ChurnVision license key |
| `LICENSE_SECRET_KEY` | Yes | License validation secret |
| `ALLOWED_ORIGINS` | Yes | Your domain(s) for CORS |
| `OLLAMA_MODEL` | No | LLM model (default: qwen3:4b) |

### Directory Structure
```
churnvision-enterprise/
├── docker-compose.prod.yml    # Production compose file
├── .env.production            # Your configuration
├── license.key                # Your license file
├── models/                    # ML model artifacts (mounted)
├── logs/                      # Application logs (mounted)
├── backups/                   # Database backups (mounted)
└── infra/
    ├── nginx.conf             # Reverse proxy config
    └── ssl/                   # SSL certificates (optional)
```

---

## SSL/HTTPS Setup

### Option A: Let's Encrypt (Recommended)
```bash
# Install certbot
apt install certbot

# Generate certificate
certbot certonly --standalone -d your-domain.com

# Copy to infra/ssl/
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem infra/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem infra/ssl/
```

### Option B: Corporate Certificate
Place your certificates in `infra/ssl/`:
- `fullchain.pem` - Certificate chain
- `privkey.pem` - Private key

Update `infra/nginx.conf` to enable SSL.

---

## Database Management

### Initial Setup
The database is automatically initialized on first start.

### Backup (Recommended: Daily)
```bash
# Manual backup
docker exec churnvision-db pg_dump -U churnvision churnvision > backups/backup_$(date +%Y%m%d).sql

# Automated (add to crontab)
0 2 * * * docker exec churnvision-db pg_dump -U churnvision churnvision > /path/to/backups/backup_$(date +\%Y\%m\%d).sql
```

### Restore
```bash
docker exec -i churnvision-db psql -U churnvision churnvision < backups/backup_20241201.sql
```

---

## Operations

### View Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
```

### Restart Services
```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific
docker compose -f docker-compose.prod.yml restart backend
```

### Stop Services
```bash
docker compose -f docker-compose.prod.yml down
```

### Update to New Version
```bash
# Pull new images
docker compose -f docker-compose.prod.yml pull

# Restart with new version
docker compose -f docker-compose.prod.yml up -d
```

---

## Health Checks

### Service Status
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output:
```
NAME                    STATUS                    PORTS
churnvision-backend     Up (healthy)              0.0.0.0:8000->8000/tcp
churnvision-frontend    Up                        0.0.0.0:3000->80/tcp
churnvision-db          Up (healthy)              0.0.0.0:5432->5432/tcp
churnvision-redis       Up (healthy)              6379/tcp
churnvision-ollama      Up                        0.0.0.0:11434->11434/tcp
```

### API Health
```bash
curl http://localhost:8000/health
# Expected: {"status": "healthy", "database": "connected"}
```

---

## Troubleshooting

### Service Won't Start
```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Common issues:
# - Missing environment variables
# - Invalid license key
# - Database connection failed
```

### Database Connection Error
```bash
# Check database is running
docker compose -f docker-compose.prod.yml ps db

# Check database logs
docker compose -f docker-compose.prod.yml logs db

# Test connection
docker exec -it churnvision-db psql -U churnvision -c "SELECT 1"
```

### License Validation Failed
- Verify `license.key` file exists and is readable
- Check `LICENSE_SECRET_KEY` matches your account
- Contact support@churnvision.com

### High Memory Usage
The LLM service (Ollama) requires significant memory. Adjust limits in `docker-compose.prod.yml`:
```yaml
ollama:
  deploy:
    resources:
      limits:
        memory: 4G  # Reduce if needed
```

---

## Security Recommendations

1. **Change all default passwords** before first start
2. **Enable HTTPS** in production
3. **Restrict port access** via firewall:
   - Only expose ports 80/443 externally
   - Keep 5432, 8000, 11434 internal
4. **Regular backups** - minimum daily
5. **Monitor logs** for suspicious activity

---

## Support

- Documentation: https://docs.churnvision.com
- Email: support@churnvision.com
- License Issues: licensing@churnvision.com

---

## Resource Limits

Default resource allocations (adjustable in `docker-compose.prod.yml`):

| Service | CPU Limit | Memory Limit |
|---------|-----------|--------------|
| Backend | 2 cores | 4 GB |
| Frontend | 1 core | 512 MB |
| Database | 2 cores | 2 GB |
| Redis | 0.5 cores | 512 MB |
| Ollama | 4 cores | 8 GB |

Adjust based on your hardware and usage patterns.
