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

- `backend/` - FastAPI application (Port 8000)
- `frontend/` - React + Vite application (Port 3000)
- `ml/` - Model training scripts & Jupyter notebooks
- `infra/` - Docker Compose & Nuitka build scripts
- `db/` - PostgreSQL initialization & migrations

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

- **Frontend**: `http://localhost:3000` (React)
- **Backend API**: `http://localhost:8000` (FastAPI)
- **Docs**: `http://localhost:8000/docs` (Swagger UI)
- **Database**: `localhost:5432` (PostgreSQL)
- **LLM Engine**: `localhost:11434` (Ollama)

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
- **ML Inference**: Scikit-Learn / XGBoost
- **LLM Orchestration**: LangChain (interfacing with local Ollama)

### API Route Pattern

Routes must use Dependency Injection for DB sessions and Current User.

```python
# backend/app/api/routes/prediction.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user
from app.schemas.prediction import PredictionRequest, PredictionResponse
from app.core.model import load_model

router = APIRouter()
model = load_model()

@router.post("/predict", response_model=PredictionResponse)
async def predict_churn(
    input_data: PredictionRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Predicts churn probability for a specific employee snapshot.
    """
    score = model.predict_proba([input_data.features])[0][1]
    
    # Save prediction to Audit Log
    await audit_log(db, user=current_user, action="predict", score=score)
    
    return PredictionResponse(
        risk_score=score,
        risk_level="HIGH" if score > 0.7 else "LOW"
    )
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
- **Language**: TypeScript (Strict)
- **State/Fetch**: TanStack Query (React Query)
- **Routing**: TanStack Router
- **UI Library**: Shadcn/UI + Tailwind CSS
- **Charts**: Recharts (for the Risk Heatmap)

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

### The "Echo" AI Chat Component

The frontend talks to FastAPI, which then talks to Ollama. Never call the LLM directly from the browser.

```tsx
// frontend/src/features/echo/EchoChat.tsx
import { useMutation } from "@tanstack/react-query";

export function EchoChat() {
  const mutation = useMutation({
    mutationFn: (question: string) => 
      api.post("/echo/ask", { question }),
  });

  const handleSend = (text) => {
    mutation.mutate(text);
  };

  return (
    <div className="chat-window">
      {mutation.isPending && <ThinkingIndicator />}
      {mutation.data && <AIMessage content={mutation.data.answer} />}
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

The client receives a `docker-compose.yml` that looks like this:

```yaml
services:
  backend:
    image: churnvision/backend:stable
    environment:
      - LICENSE_KEY=${LICENSE_KEY}
      - DATABASE_URL=postgresql://user:pass@db:5432/churnvision
    volumes:
      - ./models:/app/models:ro # Read-only models
  
  db:
    image: postgres:15-alpine
    volumes:
      - pg_data:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
```

## Key Workflow Rules

1.  **No Raw SQL:** Always use SQLAlchemy ORM or Alembic for migrations.
2.  **No Direct LLM Calls:** All AI requests must go through the Backend to be logged in the Audit Trail.
3.  **Type Safety:** Frontend must have 0 TypeScript errors (`bun run typecheck`) before commit.
4.  **Secrets:** Never commit API keys. Use `.env` files.
5.  **Compilation:** Before tagging a release, run `make build-secure` to ensure the Nuitka compilation succeeds.

```

---

### How to start with this?

1.  **Initialize the Repo:**
    ```bash
    mkdir churnvision-platform
    cd churnvision-platform
    git init
    touch .cursorrules # Paste the content above here
    ```

2.  **Create the Scaffolding:**
    ```bash
    mkdir -p backend/app/api/routes
    mkdir -p backend/app/core
    mkdir -p frontend/src/components
    mkdir -p infra
    ```

3.  **The First Code to Write:**
    Write `backend/app/main.py` with a simple "Health Check" endpoint using FastAPI. Then set up the Dockerfile.

This guide is strict enough to keep code quality high, but flexible enough to let you move fast. It specifically addresses the **security** (Nuitka/License) and **architecture** (FastAPI/React) needs of your pivot.

## Active Technologies
- Binary file /Users/riyadmehdiyev/churnvision_web_1_0/specs/001-intuitive-data-management/plan.md matches + Binary file /Users/riyadmehdiyev/churnvision_web_1_0/specs/001-intuitive-data-management/plan.md matches (001-intuitive-data-management)
- Binary file /Users/riyadmehdiyev/churnvision_web_1_0/specs/001-intuitive-data-management/plan.md matches (001-intuitive-data-management)

## Recent Changes
- 001-intuitive-data-management: Added Binary file /Users/riyadmehdiyev/churnvision_web_1_0/specs/001-intuitive-data-management/plan.md matches + Binary file /Users/riyadmehdiyev/churnvision_web_1_0/specs/001-intuitive-data-management/plan.md matches
