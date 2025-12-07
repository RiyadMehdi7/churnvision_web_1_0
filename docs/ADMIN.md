# ChurnVision Enterprise - Administrator Guide

This guide covers system administration tasks including user management, role-based access control, audit logging, and system configuration.

## Table of Contents

1. [Admin Console Overview](#admin-console-overview)
2. [User Management](#user-management)
3. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
4. [Audit Logging](#audit-logging)
5. [System Settings](#system-settings)
6. [Backup & Recovery](#backup--recovery)
7. [Monitoring](#monitoring)

---

## Admin Console Overview

Access the Admin Console at: `Settings > Admin Console` (requires admin privileges)

The Admin Console provides:
- User and role management
- Permission configuration
- Audit log viewer
- System statistics

### Admin Dashboard Metrics

| Metric | Description |
|--------|-------------|
| Total Users | Number of registered users |
| Active Sessions | Currently logged-in users |
| Recent Activity | Actions in the last 24 hours |
| Failed Logins | Authentication failures |

---

## User Management

### Creating Users

**Via Admin Console:**
1. Navigate to `Admin Console > Users`
2. Click "Add User"
3. Fill in required fields:
   - Username (unique)
   - Password (must meet policy)
   - Role assignment
4. Click "Create"

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/admin/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john.smith",
    "password": "SecureP@ss123",
    "role_id": "analyst"
  }'
```

### Password Policy

Default password requirements:
- Minimum 8 characters
- At least one special character (!@#$%^&*)
- Cannot be same as username

Configure in `.env`:
```bash
MIN_PASSWORD_LENGTH=8
REQUIRE_SPECIAL_CHARS=true
```

### Password Reset

Admins can reset user passwords:
```bash
curl -X POST http://localhost:8000/api/v1/admin/users/{user_id}/password-reset \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"new_password": "NewSecureP@ss456"}'
```

### Deactivating Users

```bash
curl -X DELETE http://localhost:8000/api/v1/admin/users/{user_id} \
  -H "Authorization: Bearer <admin-token>"
```

### User Lockout

After 5 failed login attempts (configurable), accounts are locked for 15 minutes.

To unlock manually:
```bash
# Via database (admin only)
UPDATE users SET locked_until = NULL WHERE username = 'locked_user';
```

---

## Role-Based Access Control (RBAC)

### Default Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `super_admin` | Full system access | All permissions |
| `admin` | Administrative access | User management, settings |
| `analyst` | Standard user | View predictions, run analysis |
| `viewer` | Read-only access | View dashboards only |

### Permission Structure

Permissions follow the format: `resource:action`

| Resource | Actions |
|----------|---------|
| `admin` | access, manage |
| `user` | read, write, delete |
| `employee` | read, write |
| `prediction` | read, write, train |
| `report` | read, export |
| `settings` | read, write |
| `audit` | read |

### Creating Custom Roles

**Via Admin Console:**
1. Navigate to `Admin Console > Roles`
2. Click "Create Role"
3. Enter role name and description
4. Select permissions from the list
5. Click "Save"

**Via API:**
```bash
# Create role
curl -X POST http://localhost:8000/api/v1/admin/roles \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role_id": "hr_manager",
    "role_name": "HR Manager",
    "description": "Department HR managers with full employee access"
  }'

# Assign permissions to role
curl -X POST http://localhost:8000/api/v1/admin/roles/hr_manager/permissions \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "permission_id": "employee:write"
  }'
```

### Assigning Roles to Users

```bash
curl -X POST http://localhost:8000/api/v1/admin/users/{user_id}/assign-role \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"role_id": "hr_manager"}'
```

### Permission Inheritance

- Users inherit all permissions from their assigned role
- `super_admin` bypasses all permission checks
- Multiple roles can be assigned (permissions are additive)

---

## Audit Logging

### What Gets Logged

All significant actions are recorded:

| Category | Events |
|----------|--------|
| Authentication | Login, logout, failed attempts, password changes |
| User Management | Create, update, delete users |
| Data Access | View employee data, run predictions |
| Configuration | Settings changes, role modifications |
| Model Operations | Training, predictions, exports |

### Viewing Audit Logs

**Via Admin Console:**
1. Navigate to `Admin Console > Audit Logs`
2. Use filters:
   - Date range
   - User
   - Action type
   - Resource

**Via API:**
```bash
# Get recent logs
curl "http://localhost:8000/api/v1/admin/audit-logs?limit=100" \
  -H "Authorization: Bearer <admin-token>"

# Filter by user
curl "http://localhost:8000/api/v1/admin/audit-logs?user_id=123" \
  -H "Authorization: Bearer <admin-token>"

# Filter by action
curl "http://localhost:8000/api/v1/admin/audit-logs?action=login" \
  -H "Authorization: Bearer <admin-token>"

# Filter by date range
curl "http://localhost:8000/api/v1/admin/audit-logs?start_date=2025-01-01&end_date=2025-01-31" \
  -H "Authorization: Bearer <admin-token>"
```

### Audit Log Entry Structure

```json
{
  "id": 12345,
  "timestamp": "2025-01-15T10:30:00Z",
  "user_id": 42,
  "username": "john.smith",
  "action": "prediction:create",
  "resource": "employee",
  "resource_id": "EMP-001",
  "details": {
    "risk_score": 0.75,
    "model_version": "1.2.0"
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0..."
}
```

### Log Retention

Default retention: 90 days (configurable)

```bash
# Configure in .env
AUDIT_LOG_RETENTION_DAYS=90
```

### Exporting Logs

```bash
# Export to CSV (for compliance)
curl "http://localhost:8000/api/v1/admin/audit-logs/export?format=csv" \
  -H "Authorization: Bearer <admin-token>" \
  -o audit_export.csv
```

---

## System Settings

### Risk Thresholds

Configure churn risk level breakpoints:

**Via Settings UI:**
1. Navigate to `Settings > Risk Thresholds`
2. Adjust sliders for:
   - High Risk: >= X%
   - Medium Risk: >= Y%
   - Low Risk: < Y%
3. Click "Save"

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/settings/risk-thresholds \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "high_threshold": 0.7,
    "medium_threshold": 0.4
  }'
```

### Offline Mode

Enable offline mode for air-gapped environments:

```bash
curl -X POST http://localhost:8000/api/v1/settings/offline-mode \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### LLM Provider Configuration

Switch between AI providers:

```bash
# Check available providers
curl http://localhost:8000/api/v1/ai/providers \
  -H "Authorization: Bearer <token>"

# Set provider
curl -X POST http://localhost:8000/api/v1/ai/set-provider \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"provider": "ollama"}'
```

---

## Backup & Recovery

### Database Backup

```bash
# Create backup
docker compose exec db pg_dump -U churnvision churnvision > backup_$(date +%Y%m%d).sql

# Automated daily backup (add to crontab)
0 2 * * * docker compose exec -T db pg_dump -U churnvision churnvision | gzip > /backups/churnvision_$(date +\%Y\%m\%d).sql.gz
```

### Database Restore

```bash
# Stop backend service
docker compose stop backend

# Restore from backup
docker compose exec -T db psql -U churnvision churnvision < backup_20250115.sql

# Restart backend
docker compose start backend
```

### Model Backup

Trained models are stored in `/app/models/`. Include in backup:

```bash
# Backup models
docker cp churnvision-backend:/app/models ./model_backup_$(date +%Y%m%d)
```

### Full System Backup Checklist

- [ ] Database dump (PostgreSQL)
- [ ] Model artifacts (/app/models)
- [ ] RAG documents (/app/churnvision_data/rag)
- [ ] Configuration files (.env.production)
- [ ] License file (/etc/churnvision/license.key)

---

## Monitoring

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Overall system health |
| `GET /metrics` | Prometheus metrics |

### Prometheus Metrics

ChurnVision exposes metrics at `/metrics`:

```
# Request counts
http_requests_total{method="GET", endpoint="/api/v1/employees"}

# Response times
http_request_duration_seconds{method="POST", endpoint="/api/v1/churn/predict"}

# Active connections
db_connections_active
```

### Log Locations

```bash
# Backend logs
docker compose logs backend --tail=100 -f

# Database logs
docker compose logs db --tail=100

# Ollama logs
docker compose logs ollama --tail=100
```

### Alerting Recommendations

Set up alerts for:
- Backend health check failures
- Database connection errors
- High response times (> 5s)
- Failed login attempts (> 10/hour)
- Disk space (< 20% free)
- Memory usage (> 80%)

### Performance Tuning

**Database Connection Pool:**
```bash
# Adjust based on concurrent users
DB_POOL_SIZE=20        # Base connections
DB_MAX_OVERFLOW=40     # Additional during peak
```

**LLM Timeout:**
```bash
# Increase for complex queries
LLM_REQUEST_TIMEOUT=180
```

---

## Maintenance Tasks

### Regular Maintenance Schedule

| Task | Frequency | Command |
|------|-----------|---------|
| Database backup | Daily | `pg_dump` |
| Log rotation | Weekly | Automatic (Docker) |
| Audit log export | Monthly | API export |
| Security patches | As released | `docker pull` |
| License renewal | Before expiry | Contact sales |

### Updating ChurnVision

```bash
# 1. Backup current installation
./backup.sh

# 2. Stop services
docker compose down

# 3. Load new images
docker load -i churnvision-backend-v1.1.tar
docker load -i churnvision-frontend-v1.1.tar

# 4. Run migrations
docker compose up -d db
docker compose exec backend alembic upgrade head

# 5. Start all services
docker compose up -d

# 6. Verify
curl http://localhost:8000/health
```

---

## Emergency Procedures

### System Not Responding

```bash
# 1. Check service status
docker compose ps

# 2. Restart problematic service
docker compose restart backend

# 3. Check logs for errors
docker compose logs backend --tail=200 | grep -i error
```

### Database Corruption

```bash
# 1. Stop all services
docker compose down

# 2. Restore from latest backup
docker compose up -d db
docker compose exec -T db psql -U churnvision churnvision < latest_backup.sql

# 3. Restart services
docker compose up -d
```

### License Expired

1. Contact ChurnVision sales for renewal
2. System enters grace period (7 days)
3. After grace period, predictions are disabled
4. Admin functions remain available

---

**Version**: 1.0.0
**Last Updated**: December 2025
