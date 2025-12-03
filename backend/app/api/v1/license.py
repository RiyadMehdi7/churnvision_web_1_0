from datetime import datetime, timedelta
import hashlib
import platform
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.license import LicenseValidator

router = APIRouter()

STATE_DIR = Path(__file__).resolve().parents[3] / ".churnvision"
INSTALLATION_ID_PATH = STATE_DIR / "installation.id"


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


def _load_or_create_installation_id() -> str:
    """Persist a deterministic installation id for this deployment."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        if INSTALLATION_ID_PATH.exists():
            existing = INSTALLATION_ID_PATH.read_text().strip()
            if existing:
                return existing

        seed = f"{uuid.getnode()}-{platform.node()}"
        install_id = hashlib.sha256(seed.encode()).hexdigest()[:32]
        INSTALLATION_ID_PATH.write_text(install_id)
        return install_id
    except Exception:
        # Fall back to a random id if persistence fails
        return str(uuid.uuid4())


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
    return InstallationIdResponse(installation_id=_load_or_create_installation_id())


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
        "installation_id": request.installation_id or _load_or_create_installation_id(),
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
