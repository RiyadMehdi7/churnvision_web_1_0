This is the definitive **Project Blueprint** for ChurnVision Enterprise.

I have designed this repository structure to handle the **Hybrid Requirement**: Python for the heavy ML/AI lifting, and modern React for the UI, all wrapped in a secure Docker environment.

### The Tech Stack Strategy

1.  **Backend (Python + FastAPI):** We use **`uv`** (the new standard, 100x faster than pip) for package management. We use **FastAPI** because it generates OpenAPI docs automatically (crucial for enterprise clients).
2.  **Frontend (React + Vite):** We use **Bun** for the frontend runtime (fast builds). We use **TanStack Query** for state syncing and **Shadcn/UI** for the enterprise-grade look.
3.  **Security (IP Protection):** The build pipeline includes **Nuitka**, which compiles your Python code into C-binary (`.so`/`.pyd`) so clients cannot read your source code.
4.  **AI (Local):** We use **Ollama** containerized for the "Echo" feature.

---

### The File: `.cursorrules` (or `project_guidelines.md`)

Save the following content in the root of your repository as `.cursorrules` (if using Cursor AI) or `README.md`.

```markdown
---
description: Project guidelines for ChurnVision Enterprise (On-Premise)
globs: "**/*"
alwaysApply: true
---

# ChurnVision Enterprise - Engineering Guidelines

This is a secure, containerized monorepo designed for On-Premise deployment.
It uses **FastAPI (Python)** for the backend/ML engine and **React (Vite)** for the dashboard.

## Project Structure

- `backend/` - FastAPI application (Port 8001)
  - `app/api/v1/` - API endpoints (auth, churn, employees, atlas, rag, etc.)
  - `app/core/` - Core services (license, security, config)
  - `app/models/` - SQLAlchemy database models
  - `app/schemas/` - Pydantic request/response models
  - `app/services/` - Business logic layer
- `frontend/` - React + Vite application (Port 3002)
  - `src/components/` - Reusable UI components (Shadcn/UI)
  - `src/features/` - Feature-based modules
  - `src/lib/` - Utilities and API client
- `ml/` - Model training scripts & Jupyter notebooks
- `infra/` - Docker Compose, Prometheus, Grafana configs
- `db/` - PostgreSQL configuration files
- `docs/` - Documentation and specifications

## Package Management

### Backend (Python)
We use **uv** for ultra-fast Python dependency management.
- `uv pip install <package>` instead of `pip install`
- `uv venv` to create virtual environments
- `uv pip compile requirements.in -o requirements.txt` to lock dependencies

### Frontend (TypeScript)
We use **Bun** for the frontend toolchain.
- `bun install` instead of `npm install`
- `bun run dev` to start the dev server
- `bun run build` to bundle for production

## Architecture & Ports

- **Frontend**: `http://localhost:3002` (React + Vite)
- **Backend API**: `http://localhost:8001` (FastAPI)
- **Docs**: `http://localhost:8001/docs` (Swagger UI)
- **Database**: Internal Docker network (PostgreSQL 15)
- **LLM Engine**: `http://localhost:11434` (Ollama)
- **Redis Cache**: Internal Docker network (Redis 7)
- **Prometheus**: `http://localhost:9091` (Metrics)
- **Grafana**: `http://localhost:3003` (Dashboards)
- **Alertmanager**: `http://localhost:9094` (Alerts)

---

## Development Commands

Run these from the root directory:

- `make dev` - Starts Backend, Frontend, and DB in development mode.
- `make build-secure` - Runs the Nuitka compilation process (Compiles Python to C).
- `make test` - Runs Pytest and Vitest.

---

## Backend (FastAPI + ML)

Location: `backend/`

### Tech Stack
- **Framework**: FastAPI
- **ORM**: SQLAlchemy 2.0 (Async)
- **Validation**: Pydantic V2
- **ML Inference**: Scikit-Learn, XGBoost, TabPFN
- **LLM Orchestration**: LangChain (interfacing with local Ollama)
- **RAG System**: ChromaDB + Sentence Transformers
- **Caching**: Redis 7 with LFU eviction
- **Background Tasks**: Celery with Redis broker
- **Monitoring**: Prometheus + Grafana
- **Explainability**: SHAP for model interpretability
- **Survival Analysis**: Lifelines for churn timeline prediction

### API Route Pattern

Routes must use Dependency Injection for DB sessions and Current User.

```python
# backend/app/api/v1/churn.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user
from app.schemas.churn import PredictionRequest, PredictionResponse
from app.services.churn_service import ChurnService

router = APIRouter(prefix="/churn", tags=["churn"])

@router.post("/predict/{employee_id}", response_model=PredictionResponse)
async def predict_churn(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Predicts churn probability for a specific employee.
    Uses ensemble models with SHAP explainability.
    """
    service = ChurnService(db)
    prediction = await service.predict_employee_churn(employee_id)

    # Prediction includes risk_score, risk_level, feature_importance
    return prediction

@router.get("/train/status")
async def get_training_status(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Returns the status of the latest model training job.
    """
    service = ChurnService(db)
    return await service.get_training_status()
```

### Database Models (SQLAlchemy)

Use declarative models with strong typing.

```python
# backend/app/models/employee.py
from app.db.base_class import Base
from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, index=True) # Multi-tenancy
    full_name = Column(String, nullable=False)
    role = Column(String)
    salary = Column(Float) # Encrypted at rest in Production
    is_active = Column(Boolean, default=True)
```

### IP Protection (Nuitka)

**CRITICAL:** We do not ship `.py` files to customers.
The `infra/build.Dockerfile` handles the compilation using Nuitka.

```dockerfile
# Example Nuitka Command (handled in Makefile)
RUN python -m nuitka \
    --module \
    --include-package=app \
    --output-dir=/build \
    app/main.py
```

---

## Frontend (React + Vite)

Location: `frontend/`

### Tech Stack
- **Framework**: React 18+
- **Language**: TypeScript (Strict mode)
- **Build Tool**: Vite 6
- **Runtime**: Bun (development)
- **State Management**: Zustand + TanStack Query (React Query)
- **Routing**: React Router v7
- **UI Library**: Shadcn/UI + Tailwind CSS + Radix UI
- **Charts**: Recharts for visualizations
- **Forms**: React Hook Form + Zod validation
- **Testing**: Vitest + React Testing Library + Playwright (E2E)

### Data Fetching Pattern

Do not use `useEffect` for data fetching. Use `useQuery`.

```tsx
// frontend/src/features/dashboard/RiskHeatmap.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function RiskHeatmap() {
  const { data, isLoading } = useQuery({
    queryKey: ["churn-risks"],
    queryFn: () => api.get("/predictions/heatmap"),
  });

  if (isLoading) return <Skeleton className="h-[400px] w-full" />;

  return (
    <div className="grid grid-cols-3 gap-4">
      {data.departments.map((dept) => (
        <RiskCard 
          key={dept.name} 
          name={dept.name} 
          riskScore={dept.avg_risk} 
        />
      ))}
    </div>
  );
}
```

### The Intelligent Chat Component

The frontend talks to FastAPI's `/intelligent-chat` endpoint, which uses RAG + LangChain + Ollama. Never call the LLM directly from the browser.

```tsx
// frontend/src/features/chat/IntelligentChat.tsx
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ChatMessage {
  message: string;
  session_id: string;
  employee_id?: string;
}

export function IntelligentChat() {
  const mutation = useMutation({
    mutationFn: (payload: ChatMessage) =>
      api.post("/api/v1/intelligent-chat/chat", payload),
  });

  const handleSend = (text: string, employeeId?: string) => {
    mutation.mutate({
      message: text,
      session_id: sessionId,
      employee_id: employeeId,
    });
  };

  return (
    <div className="chat-window">
      {mutation.isPending && <ThinkingIndicator />}
      {mutation.data && (
        <AIMessage
          content={mutation.data.response}
          sources={mutation.data.sources}
        />
      )}
    </div>
  );
}
```

---

## Infrastructure & Security

### The License Key Check
Every API request is validated against a local, signed license key.
The logic resides in `backend/app/core/license.py`.

**Dev Mode:** Uses a dummy key.
**Prod Mode:** Checks the signed JWT key in `/etc/churnvision/license.key`.

### Docker Compose (Production)

The production deployment uses `docker-compose.prod.yml` with a comprehensive stack:

```yaml
services:
  backend:
    image: churnvision/backend:stable
    ports:
      - "8001:8000"
    environment:
      - LICENSE_KEY=${LICENSE_KEY}
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/churnvision
      - OLLAMA_BASE_URL=http://ollama:11434
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    volumes:
      - ./ml/models:/app/models  # Model storage
      - churnvision_data:/app/churnvision_data  # Dataset storage
    depends_on:
      - db
      - ollama
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    image: oven/bun:1
    ports:
      - "3002:4001"
    environment:
      - VITE_API_URL=http://localhost:8001
    depends_on:
      - backend

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=churnvision
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./db/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    deploy:
      resources:
        limits:
          memory: 4G

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_NUM_PARALLEL=2
      - OLLAMA_MAX_LOADED_MODELS=1
      - OLLAMA_KEEP_ALIVE=5m
    deploy:
      resources:
        limits:
          memory: 6G

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lfu

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9091:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3003:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  pg_data:
  ollama_data:
  redis_data:
  prometheus_data:
  grafana_data:
  churnvision_data:
```

## Key Workflow Rules

1.  **No Raw SQL:** Always use SQLAlchemy ORM or Alembic for migrations.
2.  **No Direct LLM Calls:** All AI requests must go through the Backend to be logged in the Audit Trail.
3.  **Type Safety:** Frontend must have 0 TypeScript errors (`bun run typecheck`) before commit.
4.  **Secrets:** Never commit API keys. Use `.env` files (see `.env.example`).
5.  **Compilation:** Before tagging a release, run `make build-secure` to ensure the Nuitka compilation succeeds.
6.  **API Versioning:** All endpoints use `/api/v1/` prefix for versioning.
7.  **Caching:** Use Redis for expensive operations (ML predictions, RAG queries).
8.  **Monitoring:** All endpoints are instrumented with Prometheus metrics automatically.
9.  **Testing:** Run `make test` before committing. Backend uses pytest, frontend uses vitest.
10. **Database Migrations:** Use `make migration` to create new migrations, `make migrate` to apply them.

## Advanced Features

### RAG (Retrieval-Augmented Generation)
- ChromaDB for vector storage
- Sentence Transformers for embeddings
- Supports PDF, DOCX, TXT documents
- Endpoints: `/api/v1/rag/upload`, `/api/v1/rag/query`

### Atlas (Counterfactual Analysis)
- SHAP-based feature importance
- What-if scenario simulation
- Treatment effectiveness prediction
- Endpoints: `/api/v1/atlas/counterfactual`, `/api/v1/atlas/employee-features/{id}`

### Playground (ROI Dashboard)
- Treatment recommendation engine
- Portfolio-level ROI analytics
- Manual simulation with custom parameters
- Endpoints: `/api/v1/playground/roi-dashboard`, `/api/v1/playground/simulate`

### Data Management
- Multi-format upload (CSV, XLSX, JSON)
- Automatic data profiling with quality scores
- Dataset versioning and metadata tracking
- Column mapping with intelligent suggestions
- Endpoints: `/api/v1/data-management/upload`, `/api/v1/data-management/quality-analysis`

## API Endpoints Reference

### Core Endpoints

**Authentication**
- `POST /api/v1/auth/login` - User login (returns JWT token)
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/auth/me` - Get current user info

**Employee Management**
- `GET /api/v1/employees/` - List all employees (with pagination)
- `GET /api/v1/employees/{id}` - Get employee details
- `POST /api/v1/employees/` - Create new employee
- `PUT /api/v1/employees/{id}` - Update employee
- `DELETE /api/v1/employees/{id}` - Delete employee

**Churn Prediction**
- `POST /api/v1/churn/predict/{employee_id}` - Predict churn risk
- `GET /api/v1/churn/train/status` - Check model training status
- `POST /api/v1/churn/train` - Start model training
- `GET /api/v1/churn/alerts` - Get high-risk alerts

**Intelligent Chat (RAG-powered)**
- `POST /api/v1/intelligent-chat/chat` - Send message to AI assistant
- `GET /api/v1/intelligent-chat/history/{session_id}` - Get chat history
- `POST /api/v1/intelligent-chat/analyze-risk` - Analyze employee risk with AI

**Atlas (Counterfactual Analysis)**
- `GET /api/v1/atlas/employee-features/{employee_id}` - Get feature vector
- `POST /api/v1/atlas/counterfactual` - Generate what-if scenarios
- `GET /api/v1/atlas/feature-importance/{employee_id}` - SHAP values

**Playground (ROI Dashboard)**
- `GET /api/v1/playground/roi-dashboard` - Portfolio ROI metrics
- `GET /api/v1/playground/treatments/{employee_id}` - Recommended treatments
- `POST /api/v1/playground/simulate` - Simulate treatment application
- `POST /api/v1/playground/manual-simulate` - Custom scenario simulation
- `GET /api/v1/playground/eltv/{employee_id}` - Employee lifetime value

**Data Management**
- `POST /api/v1/data-management/upload` - Upload dataset (CSV/XLSX/JSON)
- `POST /api/v1/data-management/quality-analysis` - Analyze data quality
- `GET /api/v1/data-management/datasets` - List uploaded datasets
- `POST /api/v1/data-management/map-columns` - Map columns to schema

**RAG (Document Knowledge Base)**
- `POST /api/v1/rag/upload` - Upload document (PDF/DOCX/TXT)
- `POST /api/v1/rag/query` - Query knowledge base
- `GET /api/v1/rag/documents` - List uploaded documents
- `DELETE /api/v1/rag/documents/{id}` - Delete document

**Admin Panel**
- `GET /api/v1/admin/users` - List all users
- `POST /api/v1/admin/users` - Create user
- `PUT /api/v1/admin/users/{id}/role` - Update user role
- `DELETE /api/v1/admin/users/{id}` - Delete user
- `GET /api/v1/admin/audit-logs` - View audit trail

**System Health**
- `GET /health` - Health check endpoint
- `GET /api/v1/license/status` - License validation status
- `GET /metrics` - Prometheus metrics endpoint

## Development Workflow

### Starting the Stack
```bash
# Pull and start all services
make dev

# Or manually with Docker Compose
docker-compose up --build
```

### Running Tests
```bash
# All tests
make test

# Backend only
cd backend && uv run pytest -v

# Frontend only
cd frontend && bun test

# Type checking
make typecheck
```

### Database Operations
```bash
# Create a new migration
make migration

# Apply migrations
make migrate

# Access the database
docker-compose exec db psql -U postgres -d churnvision
```

### Monitoring & Debugging
- **Backend Logs**: `docker-compose logs -f backend`
- **Prometheus**: `http://localhost:9091`
- **Grafana**: `http://localhost:3003` (admin/admin)
- **API Docs**: `http://localhost:8001/docs`

---

This guide reflects the **current state** of the ChurnVision Enterprise platform as of 2026, including all advanced features like RAG, counterfactual analysis, and comprehensive monitoring infrastructure.

## Security Considerations

### License Validation
- Every API request validates against a signed JWT license key
- Dev mode: Uses `dev-license-key` (configured in `.env`)
- Production: Expects signed key in `/etc/churnvision/license.key`
- License contains: expiry date, max users, enabled features

### Data Protection
- Sensitive employee data encrypted at rest using `ENCRYPTION_KEY`
- GDPR compliance endpoints: `/api/v1/gdpr/export`, `/api/v1/gdpr/delete`
- Rate limiting via SlowAPI (configurable per endpoint)
- CORS configured with `ALLOWED_ORIGINS` environment variable

### Authentication & Authorization
- JWT-based authentication with configurable secret
- Role-based access control (Admin, Analyst, Viewer)
- SSO/OIDC support via Authlib
- Password hashing with bcrypt

## Performance Optimization

### Backend
- Redis caching for ML predictions (5-minute TTL)
- Database connection pooling (SQLAlchemy async engine)
- Lazy loading for ML models (only loaded on first request)
- Background task processing with Celery for long-running jobs

### Frontend
- Code splitting with Vite
- React Query for automatic caching and request deduplication
- Virtual scrolling for large employee lists (react-window)
- Lazy loading of routes with React.lazy

### Infrastructure
- PostgreSQL tuned for OLAP workloads (custom `postgresql.conf`)
- Ollama memory management (max 1 model loaded, 5-minute keep-alive)
- Docker resource limits to prevent OOM situations
- Prometheus metrics for performance monitoring
