"""
CSRF (Cross-Site Request Forgery) protection middleware.

Implements double-submit cookie pattern for API protection.
Works alongside SameSite cookies for defense-in-depth.
"""

import logging
import secrets
from typing import Optional, Callable

from fastapi import Request, Response, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)

# CSRF token settings
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TOKEN_LENGTH = 32

# Safe HTTP methods that don't require CSRF protection
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

# Paths that are exempt from CSRF protection (e.g., public APIs, webhooks)
CSRF_EXEMPT_PATHS = {
    "/health",
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/metrics",
}

# API paths that use bearer token auth (exempt from CSRF as they don't use cookies)
BEARER_AUTH_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
}


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)


def _is_csrf_exempt(request: Request) -> bool:
    """Check if request path is exempt from CSRF protection."""
    path = request.url.path

    # Check exempt paths
    if path in CSRF_EXEMPT_PATHS:
        return True

    # Check bearer auth paths
    if path in BEARER_AUTH_PATHS:
        return True

    # API calls with Authorization header (Bearer tokens) don't need CSRF
    # as they're not vulnerable to CSRF attacks
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return True

    return False


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection using double-submit cookie pattern.

    How it works:
    1. On GET requests, set a CSRF token in a cookie
    2. On state-changing requests (POST, PUT, DELETE, PATCH):
       - Verify the CSRF header matches the cookie value
       - Reject if mismatch or missing

    This works because:
    - Same-origin scripts can read the cookie and set the header
    - Cross-origin attackers can't read the cookie (same-origin policy)
    - Even if they can forge a request, they can't set the header value
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip CSRF for safe methods
        if request.method in SAFE_METHODS:
            response = await call_next(request)
            # Set CSRF cookie on safe requests (so client can use it)
            self._ensure_csrf_cookie(request, response)
            return response

        # Skip CSRF for exempt paths
        if _is_csrf_exempt(request):
            return await call_next(request)

        # Validate CSRF for state-changing methods in production
        if settings.ENVIRONMENT.lower() == "production":
            if not self._validate_csrf(request):
                logger.warning(
                    f"CSRF validation failed: {request.method} {request.url.path} "
                    f"from {request.client.host if request.client else 'unknown'}"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed"
                )

        response = await call_next(request)
        return response

    def _ensure_csrf_cookie(self, request: Request, response: Response) -> None:
        """Set CSRF cookie if not already present."""
        if CSRF_COOKIE_NAME not in request.cookies:
            token = generate_csrf_token()
            response.set_cookie(
                key=CSRF_COOKIE_NAME,
                value=token,
                httponly=False,  # Must be readable by JavaScript
                secure=settings.COOKIE_SECURE,
                samesite="lax",
                max_age=3600 * 24,  # 24 hours
                path="/",
            )

    def _validate_csrf(self, request: Request) -> bool:
        """Validate CSRF token from header matches cookie."""
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)

        if not cookie_token or not header_token:
            return False

        # Constant-time comparison to prevent timing attacks
        return secrets.compare_digest(cookie_token, header_token)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware to limit request body size.

    Prevents DoS attacks via large payloads and memory exhaustion.
    """

    # Default limits in bytes
    DEFAULT_MAX_SIZE = 10 * 1024 * 1024  # 10 MB default
    UPLOAD_MAX_SIZE = 100 * 1024 * 1024  # 100 MB for file uploads

    # Paths with larger limits (file uploads)
    LARGE_UPLOAD_PATHS = {
        "/api/v1/churn/upload",
        "/api/v1/rag/upload",
        "/api/v1/data/upload",
    }

    def __init__(self, app, max_size: int = DEFAULT_MAX_SIZE):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Determine max size based on path
        max_size = self.max_size
        for path in self.LARGE_UPLOAD_PATHS:
            if request.url.path.startswith(path):
                max_size = self.UPLOAD_MAX_SIZE
                break

        # Check Content-Length header
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > max_size:
                    logger.warning(
                        f"Request too large: {content_length} bytes "
                        f"(max: {max_size}) from {request.client.host if request.client else 'unknown'}"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Request body too large. Maximum size is {max_size // (1024*1024)} MB"
                    )
            except ValueError:
                pass

        return await call_next(request)


def get_csrf_token(request: Request) -> Optional[str]:
    """
    Get the current CSRF token from request cookies.

    Use this in endpoints to provide the token to clients.
    """
    return request.cookies.get(CSRF_COOKIE_NAME)


def set_csrf_cookie(response: Response, token: Optional[str] = None) -> str:
    """
    Set a CSRF cookie on the response.

    Returns the token that was set.
    """
    if token is None:
        token = generate_csrf_token()

    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=3600 * 24,
        path="/",
    )
    return token
