import logging
import traceback
from datetime import datetime
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.v1 import api_router
from app.db.session import check_db_connection
from app.core.logging_config import setup_logging, RequestLoggingMiddleware
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler
from app.core.shutdown import lifespan_manager, RequestTrackingMiddleware, get_shutdown_manager
from app.core.data_retention import get_retention_service
from app.core.csrf import CSRFMiddleware, RequestSizeLimitMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

# Configure structured logging (JSON in production, colored in development)
setup_logging()
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
    lifespan=lifespan_manager,  # Graceful startup/shutdown
)

# Add rate limiter to app state
app.state.limiter = limiter

# Register rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS origins configuration (defined early for use in exception handler)
# Always allow explicit env-configured origins; fall back to dev defaults only if none were provided.
_default_dev_origins = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:4001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:4001",
]
cors_origins = settings.ALLOWED_ORIGINS or _default_dev_origins


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

# CSRF Protection Middleware (validates tokens on state-changing requests)
app.add_middleware(CSRFMiddleware)

# Request Size Limit Middleware (prevents large payload DoS)
app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)  # 10 MB default

# Request tracking middleware for graceful shutdown
app.add_middleware(RequestTrackingMiddleware)

# Request logging middleware with timing and request IDs
app.add_middleware(RequestLoggingMiddleware)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Prometheus metrics instrumentation
# Exposes /metrics endpoint for Prometheus scraping
instrumentator = Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    should_respect_env_var=True,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/health", "/metrics"],
    inprogress_name="churnvision_inprogress_requests",
    inprogress_labels=True,
)
instrumentator.instrument(app).expose(app, include_in_schema=False)


import time

# Health check cache to reduce overhead from frequent probes (e.g., Kubernetes)
_health_cache: dict[str, dict] = {
    "redis": {"healthy": None, "timestamp": 0},
    "ollama": {"healthy": None, "timestamp": 0},
}
_HEALTH_CACHE_TTL = 15  # seconds


async def check_redis_connection() -> bool:
    """Check Redis connectivity with caching to reduce probe overhead."""
    now = time.time()
    cached = _health_cache["redis"]

    # Return cached result if still valid
    if cached["healthy"] is not None and (now - cached["timestamp"]) < _HEALTH_CACHE_TTL:
        return cached["healthy"]

    try:
        from app.core.cache import get_cache
        cache = await get_cache()
        await cache.set("health_check", "ok", ttl=10)
        _health_cache["redis"] = {"healthy": True, "timestamp": now}
        return True
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        _health_cache["redis"] = {"healthy": False, "timestamp": now}
        return False


async def check_ollama_connection() -> bool:
    """Check Ollama LLM service with caching (optional, graceful degradation)."""
    now = time.time()
    cached = _health_cache["ollama"]

    # Return cached result if still valid
    if cached["healthy"] is not None and (now - cached["timestamp"]) < _HEALTH_CACHE_TTL:
        return cached["healthy"]

    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            healthy = resp.status_code == 200
    except Exception as e:
        logger.debug(f"Ollama health check failed (AI features degraded): {e}")
        healthy = False

    _health_cache["ollama"] = {"healthy": healthy, "timestamp": now}
    return healthy


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Comprehensive health check endpoint that verifies all dependencies.
    Returns 503 if critical dependencies (database, redis) are unhealthy.
    Ollama is optional - AI features degrade gracefully if unavailable.
    """
    db_healthy = await check_db_connection()
    redis_healthy = await check_redis_connection()
    ollama_healthy = await check_ollama_connection()

    checks = {
        "database": db_healthy,
        "redis": redis_healthy,
        "ollama": ollama_healthy,
    }

    # Database and Redis are critical; Ollama is optional
    critical_healthy = db_healthy and redis_healthy
    all_healthy = all(checks.values())

    response = HealthResponse(
        status="healthy" if all_healthy else ("degraded" if critical_healthy else "unhealthy"),
        service="churnvision-backend",
        version="1.0.0",
        environment=settings.ENVIRONMENT,
        checks=checks,
    )

    if not critical_healthy:
        logger.warning(f"Health check failed (critical): {checks}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=response.model_dump(),
        )

    if not all_healthy:
        logger.info(f"Health check degraded (non-critical): {checks}")

    return response


@app.get("/")
async def root():
    return {"message": "Welcome to ChurnVision Enterprise API"}


@app.on_event("startup")
async def startup_event():
    """Initialize background services on startup."""
    from app.core.license import LicenseValidator
    from app.core.integrity import verify_startup_integrity

    # Verify binary integrity (detects tampering)
    try:
        verify_startup_integrity()
        logger.info("Integrity check passed")
    except Exception as e:
        logger.error(f"Integrity check failed: {e}")
        if settings.ENVIRONMENT.lower() == "production":
            raise SystemExit("Application integrity compromised")

    # Validate license at startup
    try:
        license_info = LicenseValidator.validate_license()
        logger.info(
            f"License validated: {license_info.company_name} "
            f"({license_info.license_type}), expires: {license_info.expires_at.date()}"
        )
    except Exception as e:
        logger.error(f"License validation failed: {e}")
        if settings.ENVIRONMENT.lower() == "production":
            raise SystemExit("Invalid or missing license")

    # Start data retention cleanup service (runs daily in production, 6h in dev)
    retention_service = get_retention_service()
    interval = 24 if settings.ENVIRONMENT.lower() == "production" else 6
    retention_service.start_scheduled_cleanup(interval_hours=interval)
    logger.info(f"Data retention service started (interval: {interval}h)")


@app.get("/admin/retention/run", tags=["admin"])
async def run_data_retention():
    """
    Manually trigger data retention cleanup.
    Requires admin authentication (handled by router).
    """
    from app.api.deps import get_current_admin_user

    retention_service = get_retention_service()
    results = await retention_service.run_all_cleanups()
    return results


@app.get("/admin/retention/report", tags=["admin"])
async def get_retention_report():
    """Get data retention compliance report."""
    retention_service = get_retention_service()
    return await retention_service.generate_retention_report()
