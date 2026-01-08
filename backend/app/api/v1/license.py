from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.license import LicenseValidator
from app.core.installation import get_installation_id as load_installation_id
from app.core.config import settings, ADMIN_API_URL
from app.api.deps import get_db, get_current_user
from app.models.user import User

router = APIRouter()

class LicenseActivationRequest(BaseModel):
    license_key: str
    installation_id: Optional[str] = None


class LicenseActivationResponse(BaseModel):
    success: bool
    message: str
    license_data: Optional[dict] = None


class LicenseStatusResponse(BaseModel):
    status: str  # ACTIVE, EXPIRED, REVOKED, UNLICENSED, etc.
    tier: str  # starter, pro, enterprise
    expires_at: Optional[str] = None
    grace_period_ends: Optional[str] = None
    is_licensed: bool


class InstallationIdResponse(BaseModel):
    installation_id: str


class SyncLogEntry(BaseModel):
    """A single sync log entry."""
    id: int
    sync_type: str
    status: str
    response_code: Optional[int] = None
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str


class SyncStatusResponse(BaseModel):
    """Response for /license/sync-status endpoint."""
    validation_mode: str
    admin_panel_configured: bool
    sync_service_running: bool
    last_successful_validation: Optional[str] = None
    last_sync_attempt: Optional[str] = None
    offline_since: Optional[str] = None
    offline_grace_ends: Optional[str] = None
    revoked_at: Optional[str] = None
    revocation_grace_ends: Optional[str] = None
    is_offline_grace_active: bool
    is_revocation_grace_active: bool
    cached_tier: Optional[str] = None
    recent_sync_logs: List[SyncLogEntry] = []


class ForceSyncResponse(BaseModel):
    """Response for /license/force-sync endpoint."""
    success: bool
    validation_result: Optional[str] = None
    health_reported: bool
    telemetry_sent: bool
    error: Optional[str] = None


def _status_from_license_info(license_info) -> LicenseStatusResponse:
    now = datetime.utcnow()
    expires_at = license_info.expires_at

    grace_period_ends = None
    if now > expires_at:
        status_str = "EXPIRED"
        is_licensed = False
    elif expires_at - now <= timedelta(days=7):
        status_str = "GRACE_PERIOD"
        is_licensed = True
        grace_period_ends = expires_at.isoformat()
    else:
        status_str = "ACTIVE"
        is_licensed = True

    return LicenseStatusResponse(
        status=status_str,
        tier=license_info.license_type or "starter",
        expires_at=expires_at.isoformat(),
        grace_period_ends=grace_period_ends,
        is_licensed=is_licensed
    )


@router.get("/installation-id", response_model=InstallationIdResponse)
async def get_installation_id():
    """
    Retrieve or persist a stable installation identifier used for licensing.
    """
    return InstallationIdResponse(installation_id=load_installation_id())


@router.post("/activate", response_model=LicenseActivationResponse)
async def activate_license(request: LicenseActivationRequest):
    """
    Validate and persist a license key to the local license store.
    """
    license_key = request.license_key.strip()
    if not license_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="License key is required"
        )

    try:
        license_info = LicenseValidator.decode_license(license_key)
        LicenseValidator.save_license(license_key)
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to activate license: {exc}"
        )

    license_data = {
        "tier": license_info.license_type,
        "status": "ACTIVE",
        "expires_at": license_info.expires_at.isoformat(),
        "installation_id": request.installation_id or load_installation_id(),
        "company_name": license_info.company_name,
        "features": license_info.features,
    }

    return LicenseActivationResponse(
        success=True,
        message="License activated successfully",
        license_data=license_data
    )


@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status(installation_id: Optional[str] = None):
    """
    Get the current license status for the installation.
    """
    try:
        # validate_license includes dev-mode fallback to enterprise
        license_info = LicenseValidator.validate_license()
        return _status_from_license_info(license_info)
    except HTTPException as exc:
        detail = str(exc.detail).lower()
        status_label = "EXPIRED" if "expired" in detail else "INVALID"
        return LicenseStatusResponse(
            status=status_label,
            tier="starter",
            is_licensed=False
        )


@router.post("/refresh")
async def refresh_license_status():
    """
    Refresh license status (useful for checking with remote license server).
    """
    return await get_license_status()


@router.get("/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current license sync status including offline state, grace periods,
    and recent sync logs. Requires authentication.
    """
    from app.services.compliance.license_sync_service import get_license_sync_service

    # Get sync service status
    sync_service = get_license_sync_service()
    is_running = sync_service.is_running()

    # Get hybrid validation status from LicenseValidator
    hybrid_status = LicenseValidator.get_hybrid_status()

    # Fetch recent sync logs from database
    recent_logs: List[SyncLogEntry] = []
    try:
        from app.models.license_sync import LicenseSyncLog

        result = await db.execute(
            select(LicenseSyncLog)
            .order_by(desc(LicenseSyncLog.created_at))
            .limit(20)
        )
        logs = result.scalars().all()

        recent_logs = [
            SyncLogEntry(
                id=log.id,
                sync_type=log.sync_type,
                status=log.status,
                response_code=log.response_code,
                error_message=log.error_message,
                duration_ms=log.duration_ms,
                created_at=log.created_at.isoformat() if log.created_at else "",
            )
            for log in logs
        ]
    except Exception:
        # Table may not exist yet if migration hasn't run
        pass

    # Find last successful validation from logs
    last_successful = None
    last_attempt = None
    for log in recent_logs:
        if last_attempt is None:
            last_attempt = log.created_at
        if log.sync_type == "validation" and log.status == "success" and last_successful is None:
            last_successful = log.created_at
        if last_successful and last_attempt:
            break

    # Calculate grace period status
    now = datetime.utcnow()
    offline_grace_ends = None
    is_offline_grace_active = False

    if hybrid_status.get("offline_since"):
        offline_since_dt = datetime.fromisoformat(hybrid_status["offline_since"].replace("Z", ""))
        grace_ends_dt = offline_since_dt + timedelta(days=settings.LICENSE_OFFLINE_GRACE_DAYS)
        offline_grace_ends = grace_ends_dt.isoformat()
        is_offline_grace_active = now < grace_ends_dt

    is_revocation_grace_active = False
    revocation_grace_ends = hybrid_status.get("revocation_grace_ends")
    if revocation_grace_ends:
        grace_ends_dt = datetime.fromisoformat(revocation_grace_ends.replace("Z", ""))
        is_revocation_grace_active = now < grace_ends_dt

    return SyncStatusResponse(
        validation_mode=settings.LICENSE_VALIDATION_MODE,
        admin_panel_configured=bool(ADMIN_API_URL),
        sync_service_running=is_running,
        last_successful_validation=last_successful,
        last_sync_attempt=last_attempt,
        offline_since=hybrid_status.get("offline_since"),
        offline_grace_ends=offline_grace_ends,
        revoked_at=hybrid_status.get("revoked_at"),
        revocation_grace_ends=revocation_grace_ends,
        is_offline_grace_active=is_offline_grace_active,
        is_revocation_grace_active=is_revocation_grace_active,
        cached_tier=hybrid_status.get("cached_tier"),
        recent_sync_logs=recent_logs,
    )


@router.post("/force-sync", response_model=ForceSyncResponse)
async def force_sync(
    current_user: User = Depends(get_current_user),
):
    """
    Force an immediate license sync with the Admin Panel.
    Triggers validation, health reporting, and telemetry.
    Requires authentication.
    """
    from app.services.compliance.license_sync_service import get_license_sync_service
    from app.core.license_middleware import invalidate_license_cache

    if not ADMIN_API_URL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin Panel not configured. Cannot perform sync.",
        )

    sync_service = get_license_sync_service()

    validation_result = None
    validation_success = False
    health_reported = False
    telemetry_sent = False
    error_message = None

    try:
        # Run license validation
        validation_success = await sync_service.sync_license_validation()
        validation_result = "success" if validation_success else "failed"

        # Run health report
        health_reported = await sync_service.sync_health_report()

        # Run telemetry
        telemetry_sent = await sync_service.sync_telemetry()

        # Invalidate middleware cache to pick up new state
        invalidate_license_cache()

    except Exception as e:
        error_message = str(e)

    return ForceSyncResponse(
        success=validation_success,
        validation_result=validation_result,
        health_reported=health_reported,
        telemetry_sent=telemetry_sent,
        error=error_message,
    )
