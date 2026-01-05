"""
Admin Panel Client Service for ChurnVision Enterprise.

Handles all communication with the external Admin Panel for:
- License validation
- Tenant configuration fetching
- Health status reporting
- Telemetry data submission

Uses X-API-Key header for authentication.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

import httpx

from app.core.config import settings
from app.core.hardware_fingerprint import HardwareFingerprint
from app.core.installation import get_installation_id

logger = logging.getLogger("churnvision.admin_panel")


@dataclass
class ValidationResult:
    """Result from license validation against Admin Panel."""
    valid: bool
    license_tier: Optional[str] = None
    company_name: Optional[str] = None
    max_employees: Optional[int] = None
    features: Optional[List[str]] = field(default_factory=list)
    expires_at: Optional[datetime] = None
    revoked: bool = False
    revocation_reason: Optional[str] = None
    error: Optional[str] = None
    response_code: Optional[int] = None


@dataclass
class ConfigResult:
    """Result from tenant config fetch."""
    success: bool
    config: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class AdminPanelClient:
    """
    Async HTTP client for Admin Panel API.

    Uses httpx.AsyncClient with:
    - Manual retry logic with exponential backoff
    - Request timeouts
    - X-API-Key authentication
    - Structured error handling
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        tenant_slug: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        self.base_url = (base_url or settings.ADMIN_API_URL or "").rstrip("/")
        self.api_key = api_key or settings.ADMIN_API_KEY
        self.tenant_slug = tenant_slug or settings.TENANT_SLUG
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                headers={
                    "X-API-Key": self.api_key or "",
                    "Content-Type": "application/json",
                    "User-Agent": f"ChurnVision/{settings.PROJECT_NAME}",
                },
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        json: Optional[Dict] = None,
        retryable_errors: tuple = (httpx.TimeoutException, httpx.ConnectError),
    ) -> httpx.Response:
        """
        Execute HTTP request with exponential backoff retry.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            url: Full URL to request
            json: Optional JSON payload
            retryable_errors: Exception types to retry on

        Returns:
            httpx.Response on success

        Raises:
            Last exception if all retries exhausted
        """
        client = await self._get_client()
        last_exception: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                if method.upper() == "GET":
                    response = await client.get(url)
                elif method.upper() == "POST":
                    response = await client.post(url, json=json)
                elif method.upper() == "PUT":
                    response = await client.put(url, json=json)
                elif method.upper() == "DELETE":
                    response = await client.delete(url)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                return response

            except retryable_errors as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    # Exponential backoff: 2^attempt seconds (1, 2, 4, ...)
                    wait_time = min(2 ** attempt, 10)
                    logger.warning(
                        f"Request failed (attempt {attempt + 1}/{self.max_retries}): {e}. "
                        f"Retrying in {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Request failed after {self.max_retries} attempts: {e}")

        if last_exception:
            raise last_exception
        raise RuntimeError("Unexpected retry loop exit")

    async def validate_license(self, license_key: str) -> ValidationResult:
        """
        Validate license key against Admin Panel.

        POST /api/v1/licenses/validate

        Returns ValidationResult with license details or error.
        """
        if not self.base_url or not self.api_key:
            return ValidationResult(
                valid=False,
                error="Admin Panel not configured (missing ADMIN_API_URL or ADMIN_API_KEY)"
            )

        start_time = time.time()

        try:
            payload = {
                "license_key": license_key,
                "installation_id": get_installation_id(),
                "hardware_id": HardwareFingerprint.generate(),
                "tenant_slug": self.tenant_slug,
            }

            response = await self._request_with_retry(
                "POST",
                f"{self.base_url}/licenses/validate",
                json=payload,
            )

            duration_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"License validation took {duration_ms}ms, status={response.status_code}")

            if response.status_code == 200:
                data = response.json()
                expires_at = None
                if data.get("expires_at"):
                    try:
                        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        pass

                return ValidationResult(
                    valid=data.get("valid", False),
                    license_tier=data.get("tier"),
                    company_name=data.get("company_name"),
                    max_employees=data.get("max_employees"),
                    features=data.get("features", []),
                    expires_at=expires_at,
                    revoked=data.get("revoked", False),
                    revocation_reason=data.get("revocation_reason"),
                    response_code=response.status_code,
                )

            elif response.status_code == 401:
                return ValidationResult(
                    valid=False,
                    error="Invalid Admin Panel API key",
                    response_code=401
                )

            elif response.status_code == 403:
                try:
                    data = response.json()
                except Exception:
                    data = {}
                return ValidationResult(
                    valid=False,
                    revoked=data.get("revoked", False),
                    revocation_reason=data.get("reason", "License invalid or revoked"),
                    response_code=403,
                )

            elif response.status_code == 404:
                return ValidationResult(
                    valid=False,
                    error="License not found",
                    response_code=404
                )

            else:
                return ValidationResult(
                    valid=False,
                    error=f"Unexpected response: {response.status_code}",
                    response_code=response.status_code,
                )

        except httpx.TimeoutException:
            logger.warning("License validation timeout - Admin Panel unreachable")
            return ValidationResult(valid=False, error="Validation timeout - Admin Panel unreachable")

        except httpx.ConnectError as e:
            logger.warning(f"License validation connection error: {e}")
            return ValidationResult(valid=False, error=f"Connection failed: {e}")

        except Exception as e:
            logger.error(f"License validation error: {e}", exc_info=True)
            return ValidationResult(valid=False, error=str(e))

    async def fetch_tenant_config(self) -> ConfigResult:
        """
        Fetch tenant configuration from Admin Panel.

        GET /api/v1/tenants/{slug}/configs/dict
        """
        if not self.base_url or not self.tenant_slug:
            return ConfigResult(success=False, error="Tenant slug not configured")

        try:
            response = await self._request_with_retry(
                "GET",
                f"{self.base_url}/tenants/{self.tenant_slug}/configs/dict"
            )

            if response.status_code == 200:
                return ConfigResult(success=True, config=response.json())
            else:
                return ConfigResult(
                    success=False,
                    error=f"Config fetch failed: {response.status_code}"
                )

        except Exception as e:
            logger.error(f"Tenant config fetch error: {e}")
            return ConfigResult(success=False, error=str(e))

    async def report_health(self, health_data: Dict[str, Any]) -> bool:
        """
        Report deployment health status to Admin Panel.

        PUT /api/v1/tenants/{slug}/deployment/health
        """
        if not self.base_url or not self.tenant_slug:
            logger.debug("Health report skipped: Admin Panel not configured")
            return False

        try:
            payload = {
                "installation_id": get_installation_id(),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                **health_data,
            }

            response = await self._request_with_retry(
                "PUT",
                f"{self.base_url}/tenants/{self.tenant_slug}/deployment/health",
                json=payload,
            )

            success = response.status_code in (200, 201, 204)
            if not success:
                logger.warning(f"Health report returned status {response.status_code}")
            return success

        except Exception as e:
            logger.warning(f"Health report failed: {e}")
            return False

    async def send_telemetry(self, telemetry_data: Dict[str, Any]) -> bool:
        """
        Send telemetry data to Admin Panel.

        POST /api/v1/telemetry/ping
        """
        if not self.base_url:
            logger.debug("Telemetry skipped: Admin Panel not configured")
            return False

        if not settings.TELEMETRY_ENABLED:
            logger.debug("Telemetry disabled by configuration")
            return False

        try:
            payload = {
                "installation_id": get_installation_id(),
                "tenant_slug": self.tenant_slug,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                **telemetry_data,
            }

            response = await self._request_with_retry(
                "POST",
                f"{self.base_url}/telemetry/ping",
                json=payload,
            )

            success = response.status_code in (200, 201, 204)
            if not success:
                logger.warning(f"Telemetry ping returned status {response.status_code}")
            return success

        except Exception as e:
            logger.warning(f"Telemetry send failed: {e}")
            return False


# Global singleton instance
_admin_panel_client: Optional[AdminPanelClient] = None


def get_admin_panel_client() -> AdminPanelClient:
    """Get the global Admin Panel client instance."""
    global _admin_panel_client
    if _admin_panel_client is None:
        _admin_panel_client = AdminPanelClient()
    return _admin_panel_client


async def close_admin_panel_client() -> None:
    """Close the global Admin Panel client."""
    global _admin_panel_client
    if _admin_panel_client is not None:
        await _admin_panel_client.close()
        _admin_panel_client = None
