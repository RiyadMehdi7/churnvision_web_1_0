from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime, timedelta
import uuid
import hashlib

from app.api.deps import get_db
from pydantic import BaseModel

router = APIRouter()

# Pydantic models for request/response
class LicenseActivationRequest(BaseModel):
    license_key: str
    installation_id: str

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

# In-memory store for demo (in production, use database)
# Format: { installation_id: { license_key, status, tier, expires_at } }
LICENSE_STORE = {}

@router.get("/installation-id", response_model=InstallationIdResponse)
async def get_installation_id():
    """
    Get or generate a unique installation ID for this instance.
    In production, this should be stored in a persistent location.
    """
    # For now, generate a UUID-based installation ID
    # In a real app, you'd store this in database or config file
    installation_id = str(uuid.uuid4())

    return InstallationIdResponse(installation_id=installation_id)

@router.post("/activate", response_model=LicenseActivationResponse)
async def activate_license(
    request: LicenseActivationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Activate a license key for the given installation ID.
    This is a simplified implementation - in production, you'd validate against
    a license server or database.
    """
    license_key = request.license_key.strip()
    installation_id = request.installation_id.strip()

    if not license_key or not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="License key and installation ID are required"
        )

    # Simple validation: check if license key follows expected format
    # Example: XXXX-XXXX-XXXX-XXXX (4 groups of 4 characters)
    parts = license_key.split('-')
    if len(parts) != 4 or any(len(p) != 4 for p in parts):
        return LicenseActivationResponse(
            success=False,
            message="Invalid license key format. Expected format: XXXX-XXXX-XXXX-XXXX"
        )

    # Determine tier based on license key pattern (simplified logic)
    # In production, validate against your license database
    key_hash = hashlib.md5(license_key.encode()).hexdigest()

    # Simple tier detection (you'd replace this with actual validation)
    if key_hash[0] in ['0', '1', '2']:
        tier = 'enterprise'
    elif key_hash[0] in ['3', '4', '5', '6']:
        tier = 'pro'
    else:
        tier = 'starter'

    # Set expiration (1 year from now for this demo)
    expires_at = datetime.utcnow() + timedelta(days=365)

    # Store license information
    LICENSE_STORE[installation_id] = {
        'license_key': license_key,
        'status': 'ACTIVE',
        'tier': tier,
        'expires_at': expires_at.isoformat(),
        'activated_at': datetime.utcnow().isoformat()
    }

    license_data = {
        'tier': tier,
        'status': 'ACTIVE',
        'expires_at': expires_at.isoformat(),
        'installation_id': installation_id
    }

    return LicenseActivationResponse(
        success=True,
        message=f"License activated successfully ({tier} tier)",
        license_data=license_data
    )

@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status(
    installation_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the current license status for the installation.
    """
    if not installation_id or installation_id not in LICENSE_STORE:
        # No license found - return unlicensed status
        return LicenseStatusResponse(
            status="UNLICENSED",
            tier="starter",
            is_licensed=False
        )

    license_info = LICENSE_STORE[installation_id]

    # Check expiration
    expires_at = datetime.fromisoformat(license_info['expires_at'])
    now = datetime.utcnow()

    if now > expires_at:
        status_str = "EXPIRED"
        is_licensed = False
        grace_period_ends = None
    elif now > expires_at - timedelta(days=7):
        # Grace period (7 days before expiration)
        status_str = "GRACE_PERIOD"
        is_licensed = True
        grace_period_ends = expires_at.isoformat()
    else:
        status_str = license_info['status']
        is_licensed = True
        grace_period_ends = None

    return LicenseStatusResponse(
        status=status_str,
        tier=license_info['tier'],
        expires_at=license_info['expires_at'],
        grace_period_ends=grace_period_ends,
        is_licensed=is_licensed
    )

@router.post("/refresh")
async def refresh_license_status(
    installation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh license status (useful for checking with remote license server).
    For now, just returns current status.
    """
    status_response = await get_license_status(installation_id, db)
    return status_response
