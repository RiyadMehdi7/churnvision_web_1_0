.PHONY: help dev build-secure test install clean up down logs

# Default target
help:
	@echo "ChurnVision Enterprise - Development Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make install        - Install all dependencies (backend + frontend)"
	@echo "  make dev            - Start all services in development mode"
	@echo "  make up             - Start all services with Docker Compose"
	@echo "  make down           - Stop all services"
	@echo "  make test           - Run all tests (backend + frontend)"
	@echo "  make build-secure   - Build production image with Nuitka compilation"
	@echo "  make logs           - Show logs from all services"
	@echo "  make clean          - Clean build artifacts and cache"
	@echo ""

# Install dependencies
install:
	@echo "📦 Installing backend dependencies..."
	cd backend && uv pip install -e .
	@echo "📦 Installing frontend dependencies..."
	cd frontend && bun install
	@echo "✅ All dependencies installed"

# Development mode (Docker Compose)
dev:
	@echo "🚀 Starting development environment..."
	docker-compose -f docker-compose.yml up --build

# Start services
up:
	@echo "🚀 Starting services..."
	docker-compose up -d
	@echo "✅ Services started"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:8000"
	@echo "   Docs:     http://localhost:8000/docs"

# Stop services
down:
	@echo "🛑 Stopping services..."
	docker-compose down
	@echo "✅ Services stopped"

# Show logs
logs:
	docker-compose logs -f

# Run tests
test:
	@echo "🧪 Running backend tests..."
	cd backend && uv run pytest tests/ -v
	@echo "🧪 Running frontend tests..."
	cd frontend && bun test
	@echo "✅ All tests passed"

# Build secure production image with Nuitka
build-secure:
	@echo "🔒 Building secure production image with Nuitka..."
	@echo "⚠️  This will compile Python source code to C binaries"
	docker build -f infra/build.Dockerfile -t churnvision/backend:secure .
	@echo "✅ Secure build completed"
	@echo "   Image: churnvision/backend:secure"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "build" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	cd frontend && rm -rf node_modules dist .vite 2>/dev/null || true
	@echo "✅ Clean completed"

# Database migrations
migrate:
	@echo "📊 Running database migrations..."
	cd backend && uv run alembic upgrade head
	@echo "✅ Migrations applied"

# Create new migration
migration:
	@echo "📊 Creating new migration..."
	@read -p "Enter migration message: " msg; \
	cd backend && uv run alembic revision --autogenerate -m "$$msg"
	@echo "✅ Migration created"

# Type check frontend
typecheck:
	@echo "🔍 Type checking frontend..."
	cd frontend && bun run typecheck
	@echo "✅ Type check passed"

# Lint
lint:
	@echo "🔍 Linting code..."
	cd backend && uv run ruff check .
	cd frontend && bun run lint
	@echo "✅ Linting complete"

# Format code
format:
	@echo "✨ Formatting code..."
	cd backend && uv run ruff format .
	cd frontend && bun run format
	@echo "✅ Code formatted"
