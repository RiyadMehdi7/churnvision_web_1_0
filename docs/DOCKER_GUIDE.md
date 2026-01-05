# ChurnVision - Docker Environment Guide

## 📋 Environment Files

### `.env`
- **Purpose**: Your local development configuration
- **Status**: Auto-generated from `.env.example`
- **Security**: ⚠️ **Never commit this file** (already in .gitignore)
- **Usage**: Modify this file for your local development needs

### `.env.example`
- **Purpose**: Template for environment variables
- **Status**: ✅ Committed to git
- **Usage**: Copy this to create `.env` for new developers

## 🐳 Docker Compose Files

### `docker-compose.yml` (Development)
- **Purpose**: Local development environment
- **Ports**:
  - Backend API: `8001` → `http://localhost:8001`
  - Frontend: `3002` → `http://localhost:3002`
  - Prometheus: `9091` → `http://localhost:9091`
  - Grafana: `3003` → `http://localhost:3003`
  - Ollama: `11434` → `http://localhost:11434`
- **Features**:
  - Hot-reload enabled (code changes auto-refresh)
  - Volume mounts for live code editing
  - Development-friendly resource limits
- **Command**: `docker compose up`

### `docker-compose.prod.yml` (Production)
- **Purpose**: Production/staging deployment
- **Ports**:
  - Backend API: `8000` → `http://localhost:8000`
  - Frontend: `3000` → `http://localhost:3000`
  - Grafana: `3001` → `http://localhost:3001`
  - Nginx: `80`, `443` (reverse proxy)
- **Features**:
  - Compiled/built images (no source code mounted)
  - Production resource limits
  - Automatic backups
  - Full monitoring stack
  - License validation
- **Command**: `docker compose -f docker-compose.prod.yml up`

## 🚀 Quick Start

### Development Setup
```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start development environment
docker compose up

# 3. Access services
# - Frontend: http://localhost:3002
# - Backend: http://localhost:8001
# - API Docs: http://localhost:8001/docs
```

### Production Deployment
```bash
# 1. Configure production environment
cp .env.example .env
# Edit .env with production secrets

# 2. Start production stack
docker compose -f docker-compose.prod.yml up -d

# 3. Run migrations
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate

# 4. Access services
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8000
```

## 📊 Services Comparison

| Service | Development | Production |
|---------|-------------|------------|
| **Backend** | Port 8001, live reload | Port 8000, compiled |
| **Frontend** | Port 3002, Bun dev server | Port 3000, Nginx static |
| **Database** | postgres:postgres | ${POSTGRES_USER}:${POSTGRES_PASSWORD} |
| **Redis** | No password | Password required |
| **Ollama** | gemma3:4b | gemma3:4b + GPU support |
| **Monitoring** | Prometheus, Grafana | Full stack + Alertmanager |
| **Backups** | Not enabled | Automated daily backups |
| **Nginx** | Not used | Reverse proxy enabled |

## 🔧 Common Commands

```bash
# Development
docker compose up                    # Start all services
docker compose up -d                 # Start in background
docker compose logs -f backend       # Follow backend logs
docker compose restart backend       # Restart specific service
docker compose down                  # Stop all services

# Production
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml restart backend

# Database migrations
docker compose exec backend alembic upgrade head
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
```

## 🗑️ Removed Files (Cleanup)

These files were removed as duplicates/redundant:
- ❌ `db/.env.example` - Duplicate of main `.env.example`
- ❌ `db/docker-compose.db.yml` - Redundant standalone DB compose
- ❌ Old `.env` file - Replaced with fresh copy from template

All database, backup, and monitoring configurations are now consolidated in the main compose files.
