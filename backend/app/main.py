import logging
import traceback
from datetime import datetime
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.api.v1 import api_router
from app.db.session import check_db_connection

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("churnvision")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    Helps prevent XSS, clickjacking, and other common attacks.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Enable XSS filter in browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy - don't leak full URL to external sites
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions policy - restrict browser features
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        # Content Security Policy (relaxed for API, stricter for HTML responses)
        if "text/html" in response.headers.get("content-type", ""):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "connect-src 'self'"
            )

        return response


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

# CORS origins configuration (defined early for use in exception handler)
is_dev_env = settings.DEBUG or settings.ENVIRONMENT.lower() == "development"
cors_origins = (
    ["http://localhost:3000", "http://localhost:4001", "http://127.0.0.1:3000", "http://127.0.0.1:4001"]
    if is_dev_env
    else (settings.ALLOWED_ORIGINS or ["http://localhost:3000", "http://localhost:4001"])
)


def get_cors_headers(request: Request) -> dict:
    """Get CORS headers based on request origin."""
    origin = request.headers.get("origin", "")
    if origin in cors_origins:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    return {}


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

    # Get CORS headers for the response
    headers = get_cors_headers(request)

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
            headers=headers,
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
        headers=headers,
    )


# CORS Middleware (env-driven)
# When credentials are needed, we must specify exact origins (not "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

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
