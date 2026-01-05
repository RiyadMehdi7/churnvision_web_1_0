"""
License Validation Middleware for ChurnVision Enterprise.

Provides per-request license validation at the ASGI level for:
- Early rejection of unlicensed requests
- Consistent enforcement across all endpoints
- Minimal overhead for valid licenses via caching
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Set, Dict, Any

from app.core.config import settings

logger = logging.getLogger("churnvision.license_middleware")


# Paths exempt from license checking
EXEMPT_PATHS: Set[str] = {
    "/",
    "/health",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
}

# Path prefixes exempt from license checking
EXEMPT_PREFIXES: tuple = (
    "/api/v1/auth/",
    "/api/v1/license/",
    "/api/v1/sso/",
    "/static/",
)


class LicenseValidationMiddleware:
    """
    ASGI middleware that validates license on every request.

    Features:
    - Caches validation result for performance (configurable TTL)
    - Exempts public/auth paths
    - Returns 403 Forbidden for invalid licenses
    - Adds license tier to request state for downstream handlers
    - Supports local, external, and hybrid validation modes
    """

    def __init__(self, app, cache_ttl_seconds: int = 60):
        self.app = app
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cached_license: Optional[Dict[str, Any]] = None
        self._cache_expires_at: Optional[datetime] = None
        self._validation_in_progress: bool = False

    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from license validation."""
        # Exact match
        if path in EXEMPT_PATHS:
            return True

        # Prefix match
        if path.startswith(EXEMPT_PREFIXES):
            return True

        return False

    async def _get_cached_license(self) -> Optional[Dict[str, Any]]:
        """Get cached license if still valid."""
        if self._cached_license and self._cache_expires_at:
            if datetime.utcnow() < self._cache_expires_at:
                return self._cached_license
        return None

    async def _validate_and_cache(self) -> Dict[str, Any]:
        """Validate license and cache result."""
        # Prevent concurrent validations
        if self._validation_in_progress:
            # Return cached result if available, otherwise return a temporary valid
            if self._cached_license:
                return self._cached_license
            return {"valid": True, "tier": "pending", "features": []}

        self._validation_in_progress = True

        try:
            from app.core.license import LicenseValidator

            mode = settings.LICENSE_VALIDATION_MODE.lower()

            # Use hybrid validation if configured
            if mode in ("external", "hybrid"):
                try:
                    license_info = await LicenseValidator.validate_license_hybrid()
                except Exception as e:
                    logger.error(f"Hybrid license validation error: {e}")
                    return {
                        "valid": False,
                        "error": str(e),
                    }
            else:
                # Local mode - use sync validation
                try:
                    license_info = LicenseValidator.validate_license()
                except Exception as e:
                    logger.error(f"Local license validation error: {e}")
                    return {
                        "valid": False,
                        "error": str(e),
                    }

            result = {
                "valid": True,
                "tier": license_info.license_type,
                "company": license_info.company_name,
                "features": license_info.features,
                "expires_at": license_info.expires_at.isoformat() if license_info.expires_at else None,
            }

            self._cached_license = result
            self._cache_expires_at = datetime.utcnow() + timedelta(
                seconds=self.cache_ttl_seconds
            )

            return result

        finally:
            self._validation_in_progress = False

    async def __call__(self, scope, receive, send):
        """ASGI middleware entry point."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "/")

        # Skip validation for exempt paths
        if self._is_exempt_path(path):
            await self.app(scope, receive, send)
            return

        # Get or validate license
        license_data = await self._get_cached_license()
        if license_data is None:
            license_data = await self._validate_and_cache()

        # Reject if invalid
        if not license_data.get("valid"):
            await self._send_forbidden_response(
                send,
                license_data.get("error", "Invalid license")
            )
            return

        # Add license info to scope for downstream handlers
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["license_tier"] = license_data.get("tier", "starter")
        scope["state"]["license_features"] = license_data.get("features", [])
        scope["state"]["license_company"] = license_data.get("company", "")

        # Continue to next middleware/handler
        await self.app(scope, receive, send)

    async def _send_forbidden_response(self, send, error_message: str) -> None:
        """Send 403 Forbidden response for invalid license."""
        response_body = json.dumps({
            "error": "License validation failed",
            "detail": error_message,
            "code": "LICENSE_INVALID",
        }).encode("utf-8")

        await send({
            "type": "http.response.start",
            "status": 403,
            "headers": [
                [b"content-type", b"application/json"],
                [b"x-license-error", b"true"],
            ],
        })
        await send({
            "type": "http.response.body",
            "body": response_body,
        })

    def invalidate_cache(self) -> None:
        """Invalidate the cached license (call after license changes)."""
        self._cached_license = None
        self._cache_expires_at = None
        logger.debug("License middleware cache invalidated")


# Global middleware instance for cache invalidation
_license_middleware_instance: Optional[LicenseValidationMiddleware] = None


def get_license_middleware() -> Optional[LicenseValidationMiddleware]:
    """Get the global license middleware instance."""
    return _license_middleware_instance


def set_license_middleware(middleware: LicenseValidationMiddleware) -> None:
    """Set the global license middleware instance."""
    global _license_middleware_instance
    _license_middleware_instance = middleware


def invalidate_license_cache() -> None:
    """Invalidate the license cache (call after license activation/changes)."""
    if _license_middleware_instance:
        _license_middleware_instance.invalidate_cache()
