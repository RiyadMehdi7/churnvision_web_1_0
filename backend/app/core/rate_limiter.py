"""
Rate limiting module for ChurnVision Enterprise.
Uses SlowAPI with Redis backend for distributed rate limiting.
"""

import logging
from typing import Callable, Optional

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger("churnvision.rate_limiter")


def get_real_client_ip(request: Request) -> str:
    """
    Get the real client IP, accounting for reverse proxies.
    Checks X-Forwarded-For header first, then falls back to direct IP.
    """
    # Check for forwarded IP (from reverse proxy)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in the chain (original client)
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP header (common in nginx)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct connection IP
    return get_remote_address(request)


def get_user_identifier(request: Request) -> str:
    """
    Get a unique identifier for rate limiting.
    Uses authenticated user ID if available, otherwise client IP.
    """
    # Check for authenticated user
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"

    # Fall back to IP address
    return f"ip:{get_real_client_ip(request)}"


# Redis URL for distributed rate limiting (falls back to in-memory if Redis unavailable)
REDIS_URL = getattr(settings, "REDIS_URL", None)
IS_PRODUCTION = getattr(settings, "ENVIRONMENT", "development").lower() == "production"

# Configure storage backend
storage_uri = None
_using_redis = False

if REDIS_URL:
    try:
        # Verify redis package is available
        import redis
        storage_uri = REDIS_URL
        _using_redis = True
        # Mask password in logs
        logged_url = REDIS_URL.split('@')[-1] if '@' in REDIS_URL else REDIS_URL
        logger.info(f"Rate limiter using Redis backend: {logged_url}")
    except ImportError:
        logger.warning(
            "Redis package not installed. Install with: pip install redis"
        )

if not _using_redis:
    if IS_PRODUCTION:
        logger.warning(
            "PRODUCTION WARNING: Rate limiting is using in-memory storage. "
            "This is NOT suitable for horizontal scaling - rate limits won't sync across instances. "
            "Configure REDIS_URL for distributed rate limiting."
        )
    else:
        logger.info("Rate limiter using in-memory storage (suitable for single-instance deployments)")


# Create the limiter instance
limiter = Limiter(
    key_func=get_user_identifier,
    default_limits=["1000/hour", "100/minute"],  # Default limits for all endpoints
    storage_uri=storage_uri,
    strategy="fixed-window",  # Prevents burst attacks
    headers_enabled=True,  # Add X-RateLimit headers to responses
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom handler for rate limit exceeded errors.
    Returns a JSON response with retry information.
    """
    logger.warning(
        f"Rate limit exceeded for {get_user_identifier(request)} "
        f"on {request.method} {request.url.path}"
    )

    # Get retry-after from the exception
    retry_after = getattr(exc, "retry_after", 60)

    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": f"Too many requests. Please retry after {retry_after} seconds.",
            "retry_after": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(exc.limit) if hasattr(exc, "limit") else "unknown",
        },
    )


# Pre-defined rate limit decorators for common use cases
class RateLimits:
    """Pre-configured rate limits for different endpoint types."""

    # Authentication endpoints - strict limits to prevent brute force
    AUTH_LOGIN = "5/minute"
    AUTH_REGISTER = "3/minute"
    AUTH_PASSWORD_RESET = "3/minute"
    AUTH_REFRESH = "30/minute"

    # API endpoints - standard limits
    API_READ = "100/minute"
    API_WRITE = "30/minute"
    API_SEARCH = "60/minute"

    # AI/ML endpoints - expensive operations
    AI_PREDICTION = "20/minute"
    AI_CHAT = "30/minute"
    AI_TRAINING = "2/hour"

    # Admin endpoints
    ADMIN_READ = "60/minute"
    ADMIN_WRITE = "20/minute"

    # File operations
    FILE_UPLOAD = "10/minute"
    FILE_DOWNLOAD = "30/minute"

    # Bulk operations
    BULK_EXPORT = "5/minute"
    BULK_IMPORT = "3/minute"


def create_rate_limit_dependency(limit: str) -> Callable:
    """
    Create a FastAPI dependency for rate limiting.

    Usage:
        @router.get("/endpoint", dependencies=[Depends(create_rate_limit_dependency("10/minute"))])
        async def my_endpoint():
            ...
    """
    async def rate_limit_dependency(request: Request, response: Response):
        # The actual rate limiting is handled by the middleware
        # This dependency is for documentation and explicit limit declaration
        pass

    return rate_limit_dependency


def exempt_from_rate_limit(request: Request) -> bool:
    """
    Check if a request should be exempt from rate limiting.
    Typically for internal health checks or admin bypass.
    """
    # Health check endpoints
    if request.url.path in ["/health", "/metrics"]:
        return True

    # Internal requests (from same network)
    client_ip = get_real_client_ip(request)
    internal_networks = ["127.0.0.1", "localhost", "10.", "172.", "192.168."]
    if any(client_ip.startswith(net) for net in internal_networks):
        # Still apply rate limits but with higher thresholds
        return False

    return False
