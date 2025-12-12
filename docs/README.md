# ChurnVision Enterprise Documentation

Welcome to the official documentation for **ChurnVision Enterprise** - an AI-powered employee churn prediction and retention platform designed for on-premise deployment.

## Documentation Index

| Document | Description | Audience |
|----------|-------------|----------|
| [INSTALL](./INSTALL.md) | System requirements, deployment, configuration | IT/DevOps |
| [UPGRADE](./UPGRADE.md) | Version upgrade procedures | IT/DevOps |
| [ADMIN](./ADMIN.md) | User management, RBAC, audit logs, settings | System Admins |
| [SSO_SETUP](./SSO_SETUP.md) | SSO/OIDC configuration guide | System Admins |
| [USER_GUIDE](./USER_GUIDE.md) | Daily operations, predictions, actions | HR Managers/Analysts |
| [API](./API.md) | Complete REST API documentation | Developers |
| [SECURITY](./SECURITY.md) | Security architecture, data protection, compliance | Security/Compliance Teams |
| [TROUBLESHOOT](./TROUBLESHOOT.md) | Common issues and solutions | All Users |

## Quick Start

```bash
# 1. Extract deployment package
tar -xzf churnvision-enterprise-v1.0.tar.gz
cd churnvision-enterprise

# 2. Configure environment
cp .env.production.template .env.production
# Edit .env.production with your settings

# 3. Start services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 4. Access the application
# Frontend: http://your-server:3000
# API Docs: http://your-server:8000/docs (dev mode only)
```

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ChurnVision Enterprise                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   React     │  │   FastAPI   │  │   Ollama    │              │
│  │  Frontend   │──│   Backend   │──│  LLM Engine │              │
│  │   :3000     │  │   :8000     │  │   :11434    │              │
│  └─────────────┘  └──────┬──────┘  └─────────────┘              │
│                          │                                       │
│                   ┌──────┴──────┐                                │
│                   │ PostgreSQL  │                                │
│                   │    :5432    │                                │
│                   └─────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Churn Prediction**: ML-powered risk scoring with explainable AI
- **Intelligent Chat**: Natural language interface for HR insights
- **ELTV Analysis**: Employee Lifetime Value calculation and optimization
- **Retention Actions**: AI-generated intervention recommendations
- **Knowledge Base**: RAG-powered document search and validation
- **Enterprise Security**: RBAC, SSO, audit logging, license management

## Support

- **Email**: support@churnvision.com
- **Documentation Updates**: Check for the latest version at your customer portal
- **Emergency**: Contact your designated support engineer

---

**Version**: 1.0.0
**Last Updated**: December 2025
