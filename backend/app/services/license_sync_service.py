"""
License Synchronization Service for ChurnVision Enterprise.

Background service that:
- Periodically validates license against Admin Panel
- Reports health/telemetry data
- Tracks sync logs for audit
- Manages offline grace period state
"""

import asyncio
import logging
import platform
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from app.core.config import settings
from app.core.version import APP_VERSION
from app.db.session import AsyncSessionLocal

logger = logging.getLogger("churnvision.license_sync")

# Track service start time
_service_start_time = datetime.utcnow()


class TelemetryCollector:
    """Collects telemetry data for reporting to Admin Panel."""

    @staticmethod
    async def collect_health_data() -> Dict[str, Any]:
        """
        Collect health metrics for reporting.

        Returns:
            Dict containing health status and component states
        """
        db_healthy = False
        redis_healthy = False

        # Check database connection
        try:
            async with AsyncSessionLocal() as db:
                from sqlalchemy import text

                await db.execute(text("SELECT 1"))
                db_healthy = True
        except Exception as e:
            logger.warning(f"Database health check failed: {e}")

        # Check Redis/cache connection
        try:
            from app.core.cache import get_cache

            cache = await get_cache()
            await cache.set("_health_check", "ok", ttl=5)
            redis_healthy = True
        except Exception as e:
            logger.warning(f"Cache health check failed: {e}")

        uptime_seconds = int((datetime.utcnow() - _service_start_time).total_seconds())

        return {
            "status": "healthy" if (db_healthy and redis_healthy) else "degraded",
            "database": db_healthy,
            "cache": redis_healthy,
            "uptime_seconds": uptime_seconds,
            "version": APP_VERSION,
            "platform": platform.platform(),
            "python_version": platform.python_version(),
        }

    @staticmethod
    async def collect_telemetry_data() -> Dict[str, Any]:
        """
        Collect usage telemetry for reporting.

        Returns:
            Dict containing usage metrics
        """
        active_users = 0
        predictions_count = 0
        error_count = 0

        try:
            async with AsyncSessionLocal() as db:
                from sqlalchemy import text, func
                from datetime import timedelta

                # Count active users (logged in within last 24 hours)
                try:
                    from app.models.auth import Session
                    from sqlalchemy import select

                    cutoff = datetime.utcnow() - timedelta(hours=24)
                    result = await db.execute(
                        select(func.count(Session.session_id.distinct())).where(
                            Session.last_used_at >= cutoff
                        )
                    )
                    active_users = result.scalar() or 0
                except Exception:
                    pass

                # Count predictions in last 24 hours
                try:
                    from app.models.churn import ChurnOutput
                    from sqlalchemy import select

                    cutoff = datetime.utcnow() - timedelta(hours=24)
                    result = await db.execute(
                        select(func.count(ChurnOutput.id)).where(
                            ChurnOutput.created_at >= cutoff
                        )
                    )
                    predictions_count = result.scalar() or 0
                except Exception:
                    pass

        except Exception as e:
            logger.warning(f"Telemetry collection error: {e}")

        return {
            "active_users_24h": active_users,
            "predictions_24h": predictions_count,
            "error_count_24h": error_count,
            "collection_timestamp": datetime.utcnow().isoformat() + "Z",
        }


class LicenseSyncService:
    """
    Background service for license synchronization with Admin Panel.

    Responsibilities:
    - Periodic license re-validation (default: every 24h)
    - Health status reporting (default: every 1h)
    - Telemetry submission (default: every 1h)
    - Sync log management
    """

    def __init__(self):
        self._running = False
        self._validation_task: Optional[asyncio.Task] = None
        self._telemetry_task: Optional[asyncio.Task] = None
        self._initial_sync_done = False

    async def _log_sync_attempt(
        self,
        sync_type: str,
        status: str,
        response_code: Optional[int] = None,
        response_data: Optional[Dict] = None,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> None:
        """Log a sync attempt to the database."""
        try:
            from app.models.license_sync import LicenseSyncLog

            async with AsyncSessionLocal() as db:
                log = LicenseSyncLog(
                    sync_type=sync_type,
                    status=status,
                    response_code=response_code,
                    response_data=response_data,
                    error_message=error_message,
                    duration_ms=duration_ms,
                    installation_id=None,  # Will be set by the log entry
                    tenant_slug=settings.TENANT_SLUG,
                )
                db.add(log)
                await db.commit()
        except Exception as e:
            logger.error(f"Failed to log sync attempt: {e}")

    async def sync_license_validation(self) -> bool:
        """
        Perform license validation sync with Admin Panel.

        Returns:
            True if validation succeeded
        """
        from app.core.license import LicenseValidator
        from app.services.admin_panel_client import get_admin_panel_client

        logger.info("Starting license validation sync...")
        start_time = time.time()

        try:
            license_key = LicenseValidator.load_license()
            if not license_key:
                await self._log_sync_attempt(
                    sync_type="validation",
                    status="failed",
                    error_message="No license key found",
                )
                logger.warning("License sync skipped: No license key found")
                return False

            client = get_admin_panel_client()
            result = await client.validate_license(license_key)
            duration_ms = int((time.time() - start_time) * 1000)

            if result.valid:
                await self._log_sync_attempt(
                    sync_type="validation",
                    status="success",
                    response_code=result.response_code,
                    response_data={
                        "tier": result.license_tier,
                        "expires_at": result.expires_at.isoformat()
                        if result.expires_at
                        else None,
                        "features": result.features,
                    },
                    duration_ms=duration_ms,
                )
                logger.info(
                    f"License validation sync successful: tier={result.license_tier}"
                )

                # Invalidate middleware cache to pick up new license info
                from app.core.license_middleware import invalidate_license_cache

                invalidate_license_cache()

                return True
            else:
                await self._log_sync_attempt(
                    sync_type="validation",
                    status="failed",
                    response_code=result.response_code,
                    error_message=result.error or result.revocation_reason,
                    duration_ms=duration_ms,
                )
                logger.warning(
                    f"License validation sync failed: {result.error or result.revocation_reason}"
                )
                return False

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            await self._log_sync_attempt(
                sync_type="validation",
                status="error",
                error_message=str(e),
                duration_ms=duration_ms,
            )
            logger.error(f"License validation sync error: {e}", exc_info=True)
            return False

    async def sync_health_report(self) -> bool:
        """Report health status to Admin Panel."""
        from app.services.admin_panel_client import get_admin_panel_client

        start_time = time.time()

        try:
            health_data = await TelemetryCollector.collect_health_data()
            client = get_admin_panel_client()
            success = await client.report_health(health_data)
            duration_ms = int((time.time() - start_time) * 1000)

            await self._log_sync_attempt(
                sync_type="health",
                status="success" if success else "failed",
                response_data=health_data if success else None,
                duration_ms=duration_ms,
            )

            if success:
                logger.debug(f"Health report sent: status={health_data.get('status')}")
            else:
                logger.warning("Health report failed")

            return success

        except Exception as e:
            logger.error(f"Health report sync error: {e}")
            await self._log_sync_attempt(
                sync_type="health",
                status="error",
                error_message=str(e),
            )
            return False

    async def sync_telemetry(self) -> bool:
        """Send telemetry data to Admin Panel."""
        if not settings.TELEMETRY_ENABLED:
            logger.debug("Telemetry disabled by configuration")
            return True

        from app.services.admin_panel_client import get_admin_panel_client

        start_time = time.time()

        try:
            telemetry_data = await TelemetryCollector.collect_telemetry_data()
            client = get_admin_panel_client()
            success = await client.send_telemetry(telemetry_data)
            duration_ms = int((time.time() - start_time) * 1000)

            await self._log_sync_attempt(
                sync_type="telemetry",
                status="success" if success else "failed",
                response_data=telemetry_data if success else None,
                duration_ms=duration_ms,
            )

            if success:
                logger.debug(
                    f"Telemetry sent: users={telemetry_data.get('active_users_24h')}"
                )
            else:
                logger.warning("Telemetry send failed")

            return success

        except Exception as e:
            logger.error(f"Telemetry sync error: {e}")
            await self._log_sync_attempt(
                sync_type="telemetry",
                status="error",
                error_message=str(e),
            )
            return False

    async def _perform_initial_sync(self) -> None:
        """Perform initial sync on service start."""
        logger.info("Performing initial license sync...")

        # Run all syncs
        await self.sync_license_validation()
        await self.sync_health_report()
        await self.sync_telemetry()

        self._initial_sync_done = True
        logger.info("Initial license sync completed")

    def start(self) -> None:
        """Start background sync tasks."""
        if self._running:
            logger.warning("License sync service already running")
            return

        if not settings.ADMIN_API_URL:
            logger.info("Admin Panel not configured - sync service not started")
            return

        self._running = True

        # Validation sync loop
        async def validation_loop():
            # Perform initial sync after a short delay
            await asyncio.sleep(5)
            if not self._initial_sync_done:
                await self._perform_initial_sync()

            # Then run on schedule
            while self._running:
                try:
                    await asyncio.sleep(settings.LICENSE_SYNC_INTERVAL_HOURS * 3600)
                    if self._running:
                        await self.sync_license_validation()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Validation loop error: {e}")

        # Telemetry sync loop
        async def telemetry_loop():
            # Wait for initial sync to complete
            await asyncio.sleep(60)

            while self._running:
                try:
                    if self._running:
                        await self.sync_health_report()
                        await self.sync_telemetry()
                    await asyncio.sleep(settings.TELEMETRY_INTERVAL_MINUTES * 60)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Telemetry loop error: {e}")

        self._validation_task = asyncio.create_task(validation_loop())
        self._telemetry_task = asyncio.create_task(telemetry_loop())

        logger.info(
            f"License sync service started: "
            f"validation every {settings.LICENSE_SYNC_INTERVAL_HOURS}h, "
            f"telemetry every {settings.TELEMETRY_INTERVAL_MINUTES}m"
        )

    async def stop(self) -> None:
        """Stop background sync tasks."""
        self._running = False

        if self._validation_task:
            self._validation_task.cancel()
            try:
                await self._validation_task
            except asyncio.CancelledError:
                pass
            self._validation_task = None

        if self._telemetry_task:
            self._telemetry_task.cancel()
            try:
                await self._telemetry_task
            except asyncio.CancelledError:
                pass
            self._telemetry_task = None

        logger.info("License sync service stopped")

    def is_running(self) -> bool:
        """Check if the sync service is running."""
        return self._running


# Global service instance
_license_sync_service: Optional[LicenseSyncService] = None


def get_license_sync_service() -> LicenseSyncService:
    """Get the global license sync service."""
    global _license_sync_service
    if _license_sync_service is None:
        _license_sync_service = LicenseSyncService()
    return _license_sync_service


async def start_license_sync_service() -> None:
    """Start the global license sync service."""
    service = get_license_sync_service()
    service.start()


async def stop_license_sync_service() -> None:
    """Stop the global license sync service."""
    global _license_sync_service
    if _license_sync_service is not None:
        await _license_sync_service.stop()
