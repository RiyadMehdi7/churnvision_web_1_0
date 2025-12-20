# ChurnVision Enterprise - Security & Compliance Guide

This document details the security architecture, data protection measures, and compliance capabilities of ChurnVision Enterprise.

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Protection](#data-protection)
4. [Network Security](#network-security)
5. [Audit & Logging](#audit--logging)
6. [Compliance](#compliance)
7. [Security Best Practices](#security-best-practices)
8. [Incident Response](#incident-response)

---

## Security Architecture

### Defense in Depth

ChurnVision implements multiple security layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Network Perimeter                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  Reverse Proxy (TLS)                    │ │
│  │  ┌───────────────────────────────────────────────────┐  │ │
│  │  │              Application Layer                     │  │ │
│  │  │  ┌─────────────────────────────────────────────┐  │  │ │
│  │  │  │         Authentication (JWT/RBAC)           │  │  │ │
│  │  │  │  ┌───────────────────────────────────────┐  │  │  │ │
│  │  │  │  │      Business Logic + Validation      │  │  │  │ │
│  │  │  │  │  ┌─────────────────────────────────┐  │  │  │  │ │
│  │  │  │  │  │    Database (Encrypted)         │  │  │  │  │ │
│  │  │  │  │  └─────────────────────────────────┘  │  │  │  │ │
│  │  │  │  └───────────────────────────────────────┘  │  │  │ │
│  │  │  └─────────────────────────────────────────────┘  │  │ │
│  │  └───────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Container Isolation

Each service runs in isolated Docker containers:
- Minimal base images (Alpine where possible)
- Non-root user execution
- Read-only filesystems (where applicable)
- Resource limits enforced
- No privileged containers

### IP Protection

Production builds use Nuitka compilation:
- Python source code compiled to C binaries
- No `.py` files shipped to customers
- Prevents reverse engineering of ML algorithms
- License-protected execution

---

## Authentication & Authorization

### Authentication Methods

| Method | Use Case | Security Level |
|--------|----------|----------------|
| JWT + OAuth2 | Standard API access | High |
| HTTP-only Cookies | Browser sessions | High |
| SSO/OIDC | Enterprise IdP integration | Very High |
| LDAP/SAML | Active Directory integration | Very High |

### JWT Token Security

**Token Structure:**
```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: {
  "sub": "user_id",
  "exp": 1705312200,
  "iat": 1705310400,
  "jti": "unique_token_id"
}
Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
```

**Security Measures:**
- Short-lived access tokens (30 minutes default)
- Refresh tokens with rotation
- Token blacklisting on logout
- Unique token IDs prevent replay attacks

### Password Security

**Storage:**
- Bcrypt hashing with cost factor 12
- No plaintext storage ever
- Salt automatically generated

**Policy Enforcement:**
- Minimum 8 characters
- Special character requirement (configurable)
- Username cannot equal password
- Password history (optional)

**Account Lockout:**
- 5 failed attempts triggers lockout
- 15-minute lockout duration
- Configurable thresholds
- Alerts on repeated failures

### Role-Based Access Control (RBAC)

**Permission Model:**
```
User → Role → Permissions

Example:
  analyst → [
    "employee:read",
    "prediction:read",
    "prediction:write",
    "report:read"
  ]
```

**Built-in Roles:**

| Role | Description | Access Level |
|------|-------------|--------------|
| super_admin | Full system access | All resources |
| admin | Administrative functions | User management, settings |
| analyst | Standard operations | Predictions, employees, reports |
| viewer | Read-only access | View dashboards only |

**Permission Granularity:**
- Resource-based (employee, prediction, report, etc.)
- Action-based (read, write, delete, train)
- Combinable: `resource:action`

---

## Data Protection

### Encryption

**At Rest:**
- Database: PostgreSQL with TDE (Transparent Data Encryption)
- File storage: AES-256 encryption
- Backups: Encrypted before storage
- Sensitive fields: Application-level encryption

**In Transit:**
- TLS 1.3 minimum
- Strong cipher suites only
- Certificate pinning (optional)
- HSTS headers enforced

### Sensitive Data Handling

**Classification:**
| Level | Examples | Protection |
|-------|----------|------------|
| Critical | Passwords, tokens | Hashed/encrypted, never logged |
| High | Salaries, performance | Encrypted, access-logged |
| Medium | Names, departments | Access-controlled |
| Low | Aggregated metrics | Standard protection |

**PII Protection:**
- Automatic PII detection in logs
- Masking in non-production environments
- Right to deletion support (GDPR)
- Data minimization principles

### Database Security

**Access Control:**
- Dedicated database users per service
- Minimal privilege principle
- No direct database access from frontend
- Connection pooling with limits

**Query Security:**
- SQLAlchemy ORM prevents SQL injection
- Parameterized queries only
- Input validation at all layers
- Query logging for audit

---

## Network Security

### Recommended Architecture

```
                    Internet
                        │
                        ▼
              ┌─────────────────┐
              │   WAF/Firewall  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Load Balancer  │
              │   (TLS Term)    │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │Frontend │   │ Backend │   │ Ollama  │
   │  :3000  │   │  :8000  │   │ :11434  │
   └─────────┘   └────┬────┘   └─────────┘
                      │
                      ▼
                ┌─────────┐
                │   DB    │
                │  :5432  │
                └─────────┘
```

### Firewall Rules

**Inbound (from internet):**
| Port | Service | Rule |
|------|---------|------|
| 443 | HTTPS | Allow |
| 80 | HTTP | Redirect to 443 |
| * | All other | Deny |

**Internal (between services):**
| From | To | Port | Rule |
|------|-----|------|------|
| Frontend | Backend | 8000 | Allow |
| Backend | Database | 5432 | Allow |
| Backend | Ollama | 11434 | Allow |
| * | * | * | Deny |

### Security Headers

ChurnVision sets these headers automatically:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### CORS Configuration

```python
# Configured in backend
ALLOWED_ORIGINS = [
    "https://your-domain.com",
    # No wildcards in production
]
```

---

## Audit & Logging

### What Gets Logged

**Authentication Events:**
- Login attempts (success/failure)
- Logout events
- Password changes
- Account lockouts
- Token refresh

**Data Access:**
- Employee record views
- Prediction requests
- Report generation
- Data exports

**Administrative Actions:**
- User creation/modification
- Role assignments
- Permission changes
- Configuration changes

**System Events:**
- Service start/stop
- Error conditions
- Security alerts
- License checks

### Audit Log Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "event_id": "evt_abc123",
  "user_id": 42,
  "username": "john.smith",
  "action": "employee:read",
  "resource": "employee",
  "resource_id": "EMP-001",
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "status": "success",
  "details": {
    "fields_accessed": ["salary", "performance"]
  }
}
```

### Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Audit logs | 90 days (configurable) | Database |
| Application logs | 30 days | File/SIEM |
| Security events | 1 year | SIEM/Archive |
| Access logs | 30 days | File |

### Log Security

- Logs are append-only
- No PII in logs (masked)
- Tamper detection (checksums)
- Secure transport to SIEM
- Access logging on log files

---

## Compliance

### GDPR Compliance (Full Implementation)

ChurnVision provides comprehensive GDPR compliance for on-premise deployments:

| GDPR Article | Requirement | Implementation |
|--------------|-------------|----------------|
| Art. 15 | Right to Access | `GET /api/v1/gdpr/export/{hr_code}` - Export all personal data |
| Art. 16 | Right to Rectification | Manual process via data management |
| Art. 17 | Right to Erasure | `POST /api/v1/gdpr/erase` - Delete/anonymize all data |
| Art. 18 | Right to Restriction | Data subject request tracking |
| Art. 20 | Right to Portability | JSON/CSV export in machine-readable format |
| Art. 21 | Right to Object | Consent withdrawal API |
| Art. 30 | Records of Processing | ROPA management via `/api/v1/gdpr/ropa` |
| Art. 33/34 | Breach Notification | Breach tracking via `/api/v1/gdpr/breaches` |

**Data Subject Requests (DSARs):**
```http
# Create a data subject request
POST /api/v1/gdpr/requests
{
  "data_subject_id": "CV000185",
  "request_type": "access",  # access, erasure, portability, restriction, objection
  "description": "Employee requested copy of all personal data"
}

# Export all data for an employee (Art. 15 & 20)
GET /api/v1/gdpr/export/{hr_code}

# Erase employee data (Art. 17 - Right to be Forgotten)
POST /api/v1/gdpr/erase
{
  "hr_code": "CV000185",
  "dry_run": false,
  "exclude_categories": ["validation"]  # Optional: exclude for legal retention
}

# Delete employee data (alternative DELETE method)
DELETE /api/v1/gdpr/employees/{hr_code}
```

**Consent Management:**
```http
# Record consent (typically for legitimate interests)
POST /api/v1/gdpr/consent
{
  "data_subject_id": "CV000185",
  "consent_type": "data_processing",
  "purpose": "Employment-related churn risk analysis",
  "lawful_basis": "legitimate_interests"
}

# Withdraw consent
POST /api/v1/gdpr/consent/{data_subject_id}/withdraw?consent_type=analytics

# Get consent status
GET /api/v1/gdpr/consent/{data_subject_id}
```

**Records of Processing Activities (ROPA):**
```http
# List all processing activities
GET /api/v1/gdpr/ropa

# Export ROPA for audit
GET /api/v1/gdpr/ropa/export

# Create processing record
POST /api/v1/gdpr/ropa
```

**Data Breach Management:**
```http
# Report a breach (must notify authority within 72 hours if risk to subjects)
POST /api/v1/gdpr/breaches
{
  "title": "Unauthorized access detected",
  "description": "...",
  "detected_at": "2024-12-18T10:00:00Z",
  "risk_level": "medium"
}

# Update breach status
PATCH /api/v1/gdpr/breaches/{breach_id}
```

**Compliance Dashboard:**
```http
# Get overall GDPR compliance status
GET /api/v1/gdpr/status

# Get data categories managed by system
GET /api/v1/gdpr/categories

# Get erasure audit logs
GET /api/v1/gdpr/erasure-logs
```

**On-Premise Considerations:**
- Data never leaves organization infrastructure
- Processing based on legitimate interests (employment relationship)
- Organization acts as data controller
- No third-party data transfers by default
- Local LLM (Ollama) ensures AI queries stay on-premise

### SOC 2 Alignment

ChurnVision architecture aligns with SOC 2 Trust Principles:

| Principle | Controls |
|-----------|----------|
| Security | Encryption, access control, audit logging |
| Availability | Health checks, monitoring, backups |
| Processing Integrity | Input validation, checksums |
| Confidentiality | Encryption, RBAC, data classification |
| Privacy | PII handling, consent, retention policies |

### HIPAA Considerations

For healthcare customers:

| Requirement | Implementation |
|-------------|----------------|
| Access Controls | RBAC + audit logging |
| Encryption | At rest and in transit |
| Audit Trails | Comprehensive logging |
| Automatic Logoff | Session timeout |
| Unique User IDs | Per-user accounts |

**Note:** Full HIPAA compliance requires additional infrastructure controls (dedicated environment, BAA, etc.)

### ISO 27001 Mapping

| Control Area | ChurnVision Feature |
|--------------|---------------------|
| A.9 Access Control | RBAC, authentication |
| A.10 Cryptography | TLS, encryption at rest |
| A.12 Operations | Logging, monitoring |
| A.14 System Security | Input validation, secure coding |
| A.18 Compliance | Audit logs, data export |

---

## Security Best Practices

### Deployment Checklist

**Before Going Live:**

- [ ] Change all default passwords
- [ ] Generate new SECRET_KEY
- [ ] Enable TLS/HTTPS
- [ ] Configure firewall rules
- [ ] Set up monitoring/alerting
- [ ] Enable audit logging
- [ ] Activate license
- [ ] Test backup/restore
- [ ] Document admin access

### Configuration Hardening

**Environment Variables:**
```bash
# Production settings
ENVIRONMENT=production
DEBUG=false

# Strong secrets (generate with: openssl rand -hex 32)
SECRET_KEY=<64-char-hex-string>
LICENSE_SIGNING_ALG=RS256
LICENSE_PUBLIC_KEY=<churnvision-public-key>

# Strict session settings
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Security policies
MIN_PASSWORD_LENGTH=12
REQUIRE_SPECIAL_CHARS=true
LOGIN_MAX_ATTEMPTS=3
LOGIN_LOCKOUT_MINUTES=30
```

### Regular Security Tasks

| Frequency | Task |
|-----------|------|
| Daily | Review security alerts |
| Weekly | Check failed login attempts |
| Monthly | Audit user accounts |
| Quarterly | Review access permissions |
| Annually | Penetration testing |
| As needed | Security patches |

### Vulnerability Management

**Dependency Updates:**
```bash
# Backend
uv pip list --outdated
uv pip install --upgrade <package>

# Frontend
bun outdated
bun update
```

**Security Scanning:**
- Use `safety` for Python dependencies
- Use `npm audit` / `bun audit` for frontend
- Regular container image scanning

---

## Incident Response

### Security Incident Classification

| Severity | Definition | Response Time |
|----------|------------|---------------|
| Critical | Active breach, data exfiltration | Immediate |
| High | Vulnerability actively exploited | < 4 hours |
| Medium | Potential vulnerability found | < 24 hours |
| Low | Security improvement needed | < 1 week |

### Response Procedure

**1. Detection**
- Monitor alerts and logs
- User reports
- Automated scanning

**2. Containment**
```bash
# Emergency: Disable user
curl -X DELETE /api/v1/admin/users/{user_id}

# Emergency: Kill all sessions
docker compose restart backend

# Emergency: Disable API access
# Update firewall rules
```

**3. Investigation**
- Review audit logs
- Check access patterns
- Identify scope of breach

**4. Remediation**
- Patch vulnerability
- Reset credentials
- Update configurations

**5. Recovery**
- Restore from backup if needed
- Verify system integrity
- Resume operations

**6. Post-Incident**
- Document incident
- Update procedures
- Implement improvements

### Emergency Contacts

| Role | Contact |
|------|---------|
| ChurnVision Support | security@churnvision.com |
| Emergency Hotline | +1-XXX-XXX-XXXX |
| Your Security Team | [Internal contact] |

---

## Security Updates

ChurnVision releases security updates as needed:

- **Critical**: Immediate patch release
- **High**: Patch within 1 week
- **Medium**: Included in next minor release
- **Low**: Included in next major release

**Update Process:**
1. Receive security advisory
2. Review impact for your deployment
3. Test update in staging
4. Apply update per installation guide
5. Verify successful update

---

## Appendix: Security Controls Matrix

| Control | Implementation | Verification |
|---------|----------------|--------------|
| Authentication | JWT + bcrypt | Login test |
| Authorization | RBAC | Permission check |
| Encryption (transit) | TLS 1.3 | SSL Labs test |
| Encryption (rest) | AES-256 | Verify config |
| Input validation | Pydantic | Fuzz testing |
| SQL injection | ORM | Security scan |
| XSS | CSP headers | Header check |
| CSRF | Token validation | Penetration test |
| Session management | Secure cookies | Cookie audit |
| Logging | Comprehensive | Log review |
| Monitoring | Health checks | Uptime test |

---

**Version**: 1.0.0
**Last Updated**: December 2025
**Security Contact**: security@churnvision.com
