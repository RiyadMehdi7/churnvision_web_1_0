import logging
import traceback
from datetime import datetime
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import settings
from app.api.v1 import api_router
from app.db.session import check_db_connection

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("churnvision")


class ErrorResponse(BaseModel):
    """Standardized error response format."""
    error: str
    detail: str | None = None
    timestamp: str
    path: str | None = None


class HealthResponse(BaseModel):
    """Health check response format."""
    status: str
    service: str
    version: str
    environment: str
    checks: dict[str, bool]


app = FastAPI(
    title="ChurnVision Enterprise API",
    description="API for ChurnVision Enterprise (On-Premise)",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,  # Disable docs in production
    redoc_url="/redoc" if settings.DEBUG else None,
)


# Global exception handler - catches all unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global exception handler that returns consistent error responses.
    In production, sensitive details are hidden to prevent information leakage.
    """
    error_id = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")

    # Log the full exception for debugging
    logger.error(
        f"Unhandled exception [{error_id}]: {exc}\n"
        f"Path: {request.url.path}\n"
        f"Method: {request.method}\n"
        f"Traceback: {traceback.format_exc()}"
    )

    # In production, don't expose internal error details
    if settings.ENVIRONMENT.lower() == "production":
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                error="Internal server error",
                detail=f"An unexpected error occurred. Reference ID: {error_id}",
                timestamp=datetime.utcnow().isoformat(),
                path=request.url.path,
            ).model_dump(),
        )

    # In development, include full error details
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error=exc.__class__.__name__,
            detail=str(exc),
            timestamp=datetime.utcnow().isoformat(),
            path=request.url.path,
        ).model_dump(),
    )


# CORS Middleware (env-driven)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["http://localhost:4001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Comprehensive health check endpoint that verifies all dependencies.
    Returns 503 if any critical dependency is unhealthy.
    """
    db_healthy = await check_db_connection()

    checks = {
        "database": db_healthy,
    }

    all_healthy = all(checks.values())

    response = HealthResponse(
        status="healthy" if all_healthy else "degraded",
        service="churnvision-backend",
        version="1.0.0",
        environment=settings.ENVIRONMENT,
        checks=checks,
    )

    if not all_healthy:
        logger.warning(f"Health check failed: {checks}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=response.model_dump(),
        )

    return response


@app.get("/")
async def root():
    return {"message": "Welcome to ChurnVision Enterprise API"}
