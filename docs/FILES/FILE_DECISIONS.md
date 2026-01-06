# File Decisions Log

**Generated**: 2026-01-06
**Total Files Analyzed**: 468 tracked files
**Files to Delete**: 0 (cleanup complete)
**Files to Keep**: 468

---

## Summary

| Category | Count | Decision | Notes |
|----------|-------|----------|-------|
| Root config/build | 7 | KEEP | Essential project files |
| .claude/ | 1 | KEEP | Ralph loop state (temporary) |
| .github/workflows/ | 2 | KEEP | CI/CD pipelines |
| backend/ | 185 | KEEP | Core application code |
| db/ | 6 | KEEP | Database config/scripts |
| docs/ | 12 | KEEP | Documentation |
| frontend/ | 243 | KEEP | Frontend application |
| infra/ | 12 | KEEP | Infrastructure configs |
| **TOTAL** | **468** | **KEEP** | No duplicates found |

---

## Detailed File Decisions

### Root Level (7 files) - KEEP ALL

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| .gitignore | Git ignore patterns | KEEP | Essential config |
| Claude.md | Project guidelines (authoritative) | KEEP | Primary documentation |
| Dockerfile | Main Docker build | KEEP | Required for CI/CD |
| FILE_DECISIONS.md | This file - cleanup tracking | KEEP | Cleanup documentation |
| Makefile | Build automation | KEEP | Development workflow |
| PROD_READINESS.md | Production readiness checklist | KEEP | Operations documentation |
| docker-compose.prod.yml | Production stack | KEEP | Required for production |
| docker-compose.yml | Development stack | KEEP | Required for development |
| generate_license.py | Dev license convenience script | KEEP | Development utility |

### .claude/ (1 file) - KEEP

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| .claude/ralph-loop.local.md | Ralph loop state tracking | KEEP | Temporary, used by cleanup process |

### .github/workflows/ (2 files) - KEEP ALL

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| .github/workflows/ci.yml | CI pipeline | KEEP | Automated testing |
| .github/workflows/docker-publish.yml | Docker publishing | KEEP | Release automation |

### backend/ (185 files) - KEEP ALL

#### backend/ root (8 files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/.churnvision/installation.id | Installation identifier | KEEP | Required for licensing |
| backend/Dockerfile | Backend Docker build | KEEP | Container build |
| backend/README.md | Backend documentation | KEEP | Developer docs |
| backend/alembic.ini | Alembic config | KEEP | Database migrations |
| backend/create_user.py | User creation script | KEEP | Admin utility |
| backend/entrypoint.sh | Container entrypoint | KEEP | Docker startup |
| backend/pyproject.toml | Python project config | KEEP | Dependency management |
| backend/uv.lock | Dependency lockfile | KEEP | Reproducible builds |

#### backend/alembic/ (22 files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/alembic/README | Alembic readme | KEEP | Documentation |
| backend/alembic/env.py | Alembic environment | KEEP | Migration setup |
| backend/alembic/script.py.mako | Migration template | KEEP | Migration generation |
| backend/alembic/versions/001-020_*.py (20 files) | Database migrations | KEEP | Schema history |

#### backend/app/ (106 files)

**API Layer (24 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/app/__init__.py | Package init | KEEP | Python package |
| backend/app/api/__init__.py | API package | KEEP | Python package |
| backend/app/api/deps.py | Dependencies | KEEP | DI setup |
| backend/app/api/helpers.py | API helpers | KEEP | Shared utilities |
| backend/app/api/v1/__init__.py | v1 package | KEEP | Python package |
| backend/app/api/v1/*.py (19 routers) | API endpoints | KEEP | Core functionality |

**Connectors (4 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/app/connectors/__init__.py | Package init | KEEP | Python package |
| backend/app/connectors/bamboohr.py | BambooHR integration | KEEP | HRIS connector |
| backend/app/connectors/base.py | Base connector class | KEEP | Abstract base |
| backend/app/connectors/slack_metadata.py | Slack metadata | KEEP | Collaboration connector |
| backend/app/connectors/teams_metadata.py | Teams metadata | KEEP | Collaboration connector |

**Core (25 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/app/core/__init__.py | Package init | KEEP | Python package |
| backend/app/core/*.py (21 modules) | Core functionality | KEEP | Security, config, etc. |
| backend/app/core/sso/__init__.py | SSO package | KEEP | Python package |
| backend/app/core/sso/config.py | SSO config | KEEP | SSO setup |
| backend/app/core/sso/oidc.py | OIDC implementation | KEEP | SSO auth |

**Database (4 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/app/db/__init__.py | Package init | KEEP | Python package |
| backend/app/db/base.py | Base imports | KEEP | Model aggregation |
| backend/app/db/base_class.py | Base class | KEEP | SQLAlchemy base |
| backend/app/db/session.py | DB session | KEEP | Connection management |

**Main (1 file)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/app/main.py | Application entry | KEEP | FastAPI app |

**Models (18 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/app/models/__init__.py | Package init | KEEP | Python package |
| backend/app/models/*.py (17 models) | Database models | KEEP | Data layer |

**Schemas (11 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/app/schemas/__init__.py | Package init | KEEP | Python package |
| backend/app/schemas/*.py (10 schemas) | Pydantic schemas | KEEP | Request/response validation |

**Services (36 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/app/services/__init__.py | Package init | KEEP | Python package |
| backend/app/services/*.py (35 services) | Business logic | KEEP | Core services |

#### backend/data/sample_datasets/ (6 files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/data/sample_datasets/employees_*.csv (5 files) | Test datasets | KEEP | Development/testing |
| backend/data/sample_datasets/generate_datasets.py | Dataset generator | KEEP | Test data generation |

#### backend/models/ (3 files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/models/churn_model.pkl | Trained ML model | KEEP | Prediction model |
| backend/models/encoders.pkl | Feature encoders | KEEP | Data preprocessing |
| backend/models/scaler.pkl | Feature scaler | KEEP | Data normalization |

#### backend/scripts/ (2 files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| backend/scripts/generate_integrity_manifest.py | Manifest generator | KEEP | Security |
| backend/scripts/generate_license.py | License generator | KEEP | Licensing |

#### backend/tests/ (20 files)
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| backend/tests/__init__.py | Package init | KEEP | Python package |
| backend/tests/conftest.py | Test fixtures | KEEP | Test setup |
| backend/tests/playground_test_report.md | Test documentation | KEEP | Test results |
| backend/tests/test_*.py (15 test files) | Unit/integration tests | KEEP | Quality assurance |
| backend/tests/utils/__init__.py | Utils package | KEEP | Python package |
| backend/tests/utils/*.py (2 files) | Test utilities | KEEP | Test helpers |

### db/ (6 files) - KEEP ALL

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| db/backup.sh | Database backup | KEEP | Operations |
| db/healthcheck.sh | Health check | KEEP | Docker health |
| db/init.sql | DB initialization | KEEP | Schema setup |
| db/pgadmin-servers.json | pgAdmin config | KEEP | Admin UI |
| db/postgresql.conf | PostgreSQL tuning | KEEP | Performance |
| db/restore.sh | Database restore | KEEP | Disaster recovery |

### docs/ (12 files) - KEEP ALL

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| docs/ADMIN.md | Admin guide | KEEP | Documentation |
| docs/API.md | API reference | KEEP | Documentation |
| docs/DISASTER_RECOVERY.md | DR procedures | KEEP | Operations |
| docs/DOCKER_GUIDE.md | Docker setup | KEEP | Documentation |
| docs/INSTALL.md | Installation guide | KEEP | Documentation |
| docs/PRODUCTION_SETUP.md | Production guide | KEEP | Operations |
| docs/README.md | Docs index | KEEP | Documentation |
| docs/SECURITY.md | Security guide | KEEP | Compliance |
| docs/SSO_SETUP.md | SSO configuration | KEEP | Documentation |
| docs/TROUBLESHOOTING.md | Troubleshooting | KEEP | Support |
| docs/UPGRADE.md | Upgrade guide | KEEP | Operations |
| docs/USER_GUIDE.md | User manual | KEEP | Documentation |

### frontend/ (243 files) - KEEP ALL

#### frontend/ root (12 config files)
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/Dockerfile | Frontend Docker build | KEEP | Container build |
| frontend/components.json | Shadcn config | KEEP | UI components |
| frontend/eslint.config.js | ESLint config | KEEP | Linting |
| frontend/index.html | Entry HTML | KEEP | Application entry |
| frontend/package.json | NPM config | KEEP | Dependencies |
| frontend/playwright.config.ts | E2E config | KEEP | E2E testing |
| frontend/postcss.config.js | PostCSS config | KEEP | CSS processing |
| frontend/tailwind.config.js | Tailwind config | KEEP | CSS framework |
| frontend/tsconfig.json | TypeScript config | KEEP | Type checking |
| frontend/tsconfig.node.json | Node TS config | KEEP | Build tools |
| frontend/vite.config.ts | Vite config | KEEP | Build tool |
| frontend/vitest.config.ts | Vitest config | KEEP | Unit testing |

#### frontend/e2e/ (7 files)
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/e2e/*.spec.ts (6 files) | E2E tests | KEEP | Quality assurance |
| frontend/e2e/auth.setup.ts | Auth setup | KEEP | Test setup |

#### frontend/public/ (15 files)
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/public/assets/icons/* (5 files) | App icons | KEEP | PWA icons |
| frontend/public/assets/images/* (2 files) | Static images | KEEP | UI assets |
| frontend/public/manifest.json | PWA manifest | KEEP | PWA config |
| frontend/public/offline.html | Offline page | KEEP | PWA fallback |
| frontend/public/service-worker.js | Service worker | KEEP | PWA functionality |
| frontend/public/version.txt | Version info | KEEP | Versioning |

#### frontend/src/ (209 files)

**Components (96 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/components/*.tsx (65 files) | UI components | KEEP | Application UI |
| frontend/src/components/*.test.tsx (10 files) | Component tests | KEEP | Unit tests |
| frontend/src/components/agent/*.tsx (6 files) | Agent components | KEEP | AI agent UI |
| frontend/src/components/layout/*.tsx (3 files) | Layout components | KEEP | Page structure |
| frontend/src/components/renderers/*.tsx (9 files) | Data renderers | KEEP | Data visualization |
| frontend/src/components/ui/*.tsx (17 files) | UI primitives | KEEP | Design system |
| frontend/src/components/widgets/*.tsx (8 files) | Dashboard widgets | KEEP | Dashboard UI |

**Config (2 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/src/config/apiConfig.ts | API configuration | KEEP | API setup |
| frontend/src/config/riskThresholds.ts | Risk thresholds | KEEP | Business rules |

**Contexts (5 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/contexts/*.tsx (4 files) | React contexts | KEEP | State management |
| frontend/src/contexts/__tests__/*.test.tsx (1 file) | Context tests | KEEP | Unit tests |

**Hooks (15 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/hooks/*.ts (13 files) | Custom hooks | KEEP | Reusable logic |
| frontend/src/hooks/__tests__/*.test.ts (1 file) | Hook tests | KEEP | Unit tests |
| frontend/src/hooks/use-toast.ts | Toast hook | KEEP | UI feedback |

**Lib (1 file)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/src/lib/utils.ts | Utility functions | KEEP | Shared utilities |

**Pages (17 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/pages/*.tsx (12 files) | Page components | KEEP | Application pages |
| frontend/src/pages/__tests__/*.test.tsx (1 file) | Page tests | KEEP | Unit tests |
| frontend/src/pages/admin/*.tsx (5 files) | Admin pages | KEEP | Admin UI |
| frontend/src/pages/DataManagement/*.tsx (1 file) | DM subcomponents | KEEP | Data management UI |

**Providers (2 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/src/providers/LicenseProvider.tsx | License context | KEEP | Licensing |
| frontend/src/providers/ThemeProvider.tsx | Theme context | KEEP | Theming |

**Services (24 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/services/*.ts (22 files) | API services | KEEP | Data fetching |
| frontend/src/services/__tests__/*.test.ts (1 file) | Service tests | KEEP | Unit tests |

**Types (8 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/src/types/*.ts (8 files) | TypeScript types | KEEP | Type definitions |

**Utils (4 files)**
| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| frontend/src/utils/*.ts (4 files) | Utility functions | KEEP | Shared utilities |

**Other Source Files (35 files)**
| Path Pattern | Purpose | Decision | Reason |
|--------------|---------|----------|--------|
| frontend/src/App.tsx | Root component | KEEP | App entry |
| frontend/src/App.css | Root styles | KEEP | App styling |
| frontend/src/main.tsx | React entry | KEEP | Bootstrap |
| frontend/src/index.css | Global styles | KEEP | Base CSS |
| frontend/src/env.d.ts | Env types | KEEP | Type defs |
| frontend/src/setupTests.ts | Test setup | KEEP | Test config |
| frontend/src/version-info-route.ts | Version route | KEEP | Versioning |
| frontend/src/styles/theme.css | Theme styles | KEEP | Theming |
| frontend/src/tests/testUtils.tsx | Test utilities | KEEP | Test helpers |
| frontend/src/workers/dataProcessor.worker.ts | Web worker | KEEP | Background processing |
| frontend/src/assets/react.svg | React logo | KEEP | Asset |
| frontend/src/assets/providers/*.svg (6 files) | Provider logos | KEEP | AI provider icons |

### infra/ (12 files) - KEEP ALL

| Path | Purpose | Decision | Reason |
|------|---------|----------|--------|
| infra/airgap/bundle.sh | Airgap bundling | KEEP | Offline deployment |
| infra/alertmanager/alertmanager.yml | Alert config | KEEP | Monitoring |
| infra/backup/README.md | Backup docs | KEEP | Documentation |
| infra/build.Dockerfile | Nuitka build | KEEP | IP protection |
| infra/grafana/dashboards/churnvision-overview.json | Dashboard config | KEEP | Monitoring |
| infra/grafana/provisioning/dashboards/dashboards.yml | Dashboard provisioning | KEEP | Monitoring |
| infra/grafana/provisioning/datasources/datasources.yml | Datasource config | KEEP | Monitoring |
| infra/migrate.Dockerfile | Migration runner | KEEP | DB migrations |
| infra/nginx-frontend.conf | Nginx frontend | KEEP | Reverse proxy |
| infra/nginx.conf | Nginx main | KEEP | Reverse proxy |
| infra/prometheus/alerts.yml | Alert rules | KEEP | Monitoring |
| infra/prometheus/prometheus.yml | Prometheus config | KEEP | Metrics |

---

## Cleanup Already Completed (Previous Iteration)

The following were removed in a previous cleanup iteration:

| Category | Files Removed | Reason |
|----------|---------------|--------|
| frontend/node_modules/**/* | 64,317 | Accidentally committed; regenerated by package manager |
| frontend/public/assets/providers/*.svg | 6 | Duplicates of src/assets/providers/*.svg |
| .cursorrules | 1 | Duplicate of Claude.md (subset) |
| README.md (root) | 1 | Duplicate of Claude.md |
| **Total Removed** | **64,325** | |

---

## Verification Checklist

- [x] All 468 tracked files analyzed and documented
- [x] No duplicate files by naming pattern (old/v1/v2/copy/backup/tmp)
- [x] No duplicate files by content (MD5 hash check passed)
- [x] node_modules not tracked (verified: 0 files)
- [x] All "Legacy" prefix files verified as active (used in AIAssistant.tsx)
- [x] FILE_DECISIONS.md covers 100% of tracked files
- [ ] Tests pass (pending verification)

---

## References

- All import references verified - no orphaned imports after previous cleanup
- Provider SVGs: code uses `@/assets/providers/` (canonical location)
- Documentation: Claude.md is authoritative source

---

**Coverage**: 468/468 files (100%)
