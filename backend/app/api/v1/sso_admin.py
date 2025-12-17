"""
SSO Administration API

Allows super admins to configure SSO settings through the Admin UI.
"""

import logging
from datetime import datetime
from typing import Optional
import httpx

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.sso_config import SSOConfig
from app.core.encryption import encrypt_field, decrypt_field, EncryptionError

logger = logging.getLogger(__name__)

router = APIRouter()


def encrypt_secret(secret: str) -> str:
    """Encrypt a secret value using centralized encryption."""
    if not secret:
        return ""
    return encrypt_field(secret)


def decrypt_secret(encrypted: str) -> str:
    """Decrypt a secret value using centralized encryption."""
    if not encrypted:
        return ""
    try:
        return decrypt_field(encrypted)
    except EncryptionError:
        return ""


# Request/Response schemas
class SSOConfigUpdate(BaseModel):
    """Schema for updating SSO configuration."""
    enabled: bool = False
    provider: str = Field(default="oidc", pattern="^(oidc|ldap|saml)$")

    # OIDC settings
    issuer_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None  # Plain text, will be encrypted
    redirect_uri: Optional[str] = None
    scopes: str = "openid email profile"

    # User provisioning
    auto_create_users: bool = True
    default_role: str = "viewer"
    admin_groups: Optional[str] = None

    # Session
    session_lifetime: int = 86400


class SSOConfigResponse(BaseModel):
    """Schema for SSO configuration response."""
    id: int
    enabled: bool
    provider: str

    # OIDC settings (secret masked)
    issuer_url: Optional[str]
    client_id: Optional[str]
    has_client_secret: bool
    redirect_uri: Optional[str]
    scopes: str

    # User provisioning
    auto_create_users: bool
    default_role: str
    admin_groups: Optional[str]

    # Session
    session_lifetime: int

    # Metadata
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    created_by: Optional[str]
    updated_by: Optional[str]

    # Test status
    last_test_at: Optional[datetime]
    last_test_success: Optional[bool]
    last_test_error: Optional[str]

    class Config:
        from_attributes = True


class SSOTestResult(BaseModel):
    """Schema for SSO connection test result."""
    success: bool
    message: str
    issuer_info: Optional[dict] = None


# Helper to check super admin
async def require_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require super admin access for SSO configuration."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required for SSO configuration"
        )
    return current_user


# Endpoints
@router.get("/config", response_model=SSOConfigResponse)
async def get_sso_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Get current SSO configuration."""
    result = await db.execute(select(SSOConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config:
        # Return empty config if none exists
        return SSOConfigResponse(
            id=0,
            enabled=False,
            provider="oidc",
            issuer_url=None,
            client_id=None,
            has_client_secret=False,
            redirect_uri=None,
            scopes="openid email profile",
            auto_create_users=True,
            default_role="viewer",
            admin_groups=None,
            session_lifetime=86400,
            created_at=None,
            updated_at=None,
            created_by=None,
            updated_by=None,
            last_test_at=None,
            last_test_success=None,
            last_test_error=None,
        )

    return SSOConfigResponse(
        id=config.id,
        enabled=config.enabled,
        provider=config.provider,
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        has_client_secret=bool(config.client_secret_encrypted),
        redirect_uri=config.redirect_uri,
        scopes=config.scopes,
        auto_create_users=config.auto_create_users,
        default_role=config.default_role,
        admin_groups=config.admin_groups,
        session_lifetime=config.session_lifetime,
        created_at=config.created_at,
        updated_at=config.updated_at,
        created_by=config.created_by,
        updated_by=config.updated_by,
        last_test_at=config.last_test_at,
        last_test_success=config.last_test_success,
        last_test_error=config.last_test_error,
    )


@router.put("/config", response_model=SSOConfigResponse)
async def update_sso_config(
    config_update: SSOConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Update SSO configuration."""
    result = await db.execute(select(SSOConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config:
        # Create new config
        config = SSOConfig(
            created_by=current_user.username,
        )
        db.add(config)

    # Update fields
    config.enabled = config_update.enabled
    config.provider = config_update.provider
    config.issuer_url = config_update.issuer_url
    config.client_id = config_update.client_id
    config.redirect_uri = config_update.redirect_uri
    config.scopes = config_update.scopes
    config.auto_create_users = config_update.auto_create_users
    config.default_role = config_update.default_role
    config.admin_groups = config_update.admin_groups
    config.session_lifetime = config_update.session_lifetime
    config.updated_by = current_user.username
    config.updated_at = datetime.utcnow()

    # Only update secret if provided (not empty)
    if config_update.client_secret:
        config.client_secret_encrypted = encrypt_secret(config_update.client_secret)

    await db.commit()
    await db.refresh(config)

    logger.info(f"SSO configuration updated by {current_user.username}")

    return SSOConfigResponse(
        id=config.id,
        enabled=config.enabled,
        provider=config.provider,
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        has_client_secret=bool(config.client_secret_encrypted),
        redirect_uri=config.redirect_uri,
        scopes=config.scopes,
        auto_create_users=config.auto_create_users,
        default_role=config.default_role,
        admin_groups=config.admin_groups,
        session_lifetime=config.session_lifetime,
        created_at=config.created_at,
        updated_at=config.updated_at,
        created_by=config.created_by,
        updated_by=config.updated_by,
        last_test_at=config.last_test_at,
        last_test_success=config.last_test_success,
        last_test_error=config.last_test_error,
    )


@router.post("/test", response_model=SSOTestResult)
async def test_sso_connection(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """
    Test SSO connection by fetching the OIDC discovery document.
    This verifies the issuer URL is valid and reachable.
    """
    result = await db.execute(select(SSOConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config or not config.issuer_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SSO not configured. Please save configuration first."
        )

    discovery_url = f"{config.issuer_url.rstrip('/')}/.well-known/openid-configuration"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(discovery_url)
            response.raise_for_status()
            issuer_info = response.json()

        # Update test status
        config.last_test_at = datetime.utcnow()
        config.last_test_success = True
        config.last_test_error = None
        await db.commit()

        return SSOTestResult(
            success=True,
            message="Successfully connected to identity provider",
            issuer_info={
                "issuer": issuer_info.get("issuer"),
                "authorization_endpoint": issuer_info.get("authorization_endpoint"),
                "token_endpoint": issuer_info.get("token_endpoint"),
                "userinfo_endpoint": issuer_info.get("userinfo_endpoint"),
            }
        )

    except httpx.TimeoutException:
        error_msg = "Connection timeout - IdP not reachable"
        config.last_test_at = datetime.utcnow()
        config.last_test_success = False
        config.last_test_error = error_msg
        await db.commit()

        return SSOTestResult(
            success=False,
            message=error_msg,
        )

    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP error {e.response.status_code}: {e.response.text[:200]}"
        config.last_test_at = datetime.utcnow()
        config.last_test_success = False
        config.last_test_error = error_msg
        await db.commit()

        return SSOTestResult(
            success=False,
            message=error_msg,
        )

    except Exception as e:
        error_msg = f"Connection failed: {str(e)}"
        config.last_test_at = datetime.utcnow()
        config.last_test_success = False
        config.last_test_error = error_msg
        await db.commit()

        return SSOTestResult(
            success=False,
            message=error_msg,
        )


@router.delete("/config")
async def disable_sso(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Disable SSO (sets enabled=false, keeps config for re-enabling)."""
    result = await db.execute(select(SSOConfig).limit(1))
    config = result.scalar_one_or_none()

    if config:
        config.enabled = False
        config.updated_by = current_user.username
        config.updated_at = datetime.utcnow()
        await db.commit()

    logger.info(f"SSO disabled by {current_user.username}")

    return {"message": "SSO has been disabled"}
