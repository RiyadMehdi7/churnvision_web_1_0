"""
OIDC/OAuth2 Authentication Connector for ChurnVision Enterprise

This module provides SSO integration with any OpenID Connect compliant
identity provider including:
- Azure AD / Entra ID
- Okta
- Google Workspace
- Keycloak
- OneLogin
- Ping Identity

The connector handles:
1. Redirect to IdP for authentication
2. Token exchange after callback
3. User info extraction from ID token
4. JIT (Just-In-Time) user provisioning
5. Role mapping from IdP groups
"""

import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException, Depends, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth, OAuthError

from app.core.sso.config import get_sso_settings, SSOSettings
from app.core.security import create_access_token
from app.core.config import settings as app_settings
from app.api.deps import get_db
from app.models.user import User
from app.models.auth import UserAccount, UserRole, Role

logger = logging.getLogger(__name__)

# Initialize OAuth client
oauth = OAuth()

# Router for SSO endpoints
oidc_router = APIRouter(prefix="/auth/sso", tags=["SSO"])


def configure_oidc_provider(sso_settings: SSOSettings) -> None:
    """
    Configure the OIDC provider based on settings.
    Called at application startup if SSO is enabled.
    """
    if not sso_settings.is_oidc_configured():
        logger.info("OIDC not configured, SSO disabled")
        return

    try:
        # Register OIDC provider dynamically
        # This works with any OIDC-compliant provider
        oauth.register(
            name="enterprise",
            client_id=sso_settings.SSO_CLIENT_ID,
            client_secret=sso_settings.SSO_CLIENT_SECRET,
            server_metadata_url=f"{sso_settings.SSO_ISSUER_URL}/.well-known/openid-configuration",
            client_kwargs={
                "scope": sso_settings.SSO_SCOPES,
            },
        )
        logger.info(f"OIDC provider configured: {sso_settings.SSO_ISSUER_URL}")
    except Exception as e:
        logger.error(f"Failed to configure OIDC provider: {e}")
        raise


@oidc_router.get("/login")
async def sso_login(
    request: Request,
    redirect_uri: Optional[str] = None,
    sso_settings: SSOSettings = Depends(get_sso_settings),
):
    """
    Initiate SSO login flow.
    Redirects user to the enterprise IdP for authentication.

    Query params:
        redirect_uri: Optional URL to redirect after login (stored in session)
    """
    if not sso_settings.is_oidc_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SSO is not configured. Contact your administrator."
        )

    # Store the final redirect destination in session
    if redirect_uri:
        request.session["sso_redirect_uri"] = redirect_uri

    # Use configured redirect URI or default
    callback_uri = sso_settings.SSO_REDIRECT_URI or str(
        request.url_for("sso_callback")
    )

    try:
        return await oauth.enterprise.authorize_redirect(request, callback_uri)
    except Exception as e:
        logger.error(f"SSO login redirect failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to connect to identity provider"
        )


@oidc_router.get("/callback")
async def sso_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    sso_settings: SSOSettings = Depends(get_sso_settings),
):
    """
    Handle OAuth2/OIDC callback from the identity provider.

    This endpoint:
    1. Exchanges the authorization code for tokens
    2. Extracts user info from the ID token
    3. Creates or updates the local user (JIT provisioning)
    4. Issues a ChurnVision JWT token
    5. Redirects to the frontend with the token
    """
    if not sso_settings.is_oidc_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SSO is not configured"
        )

    try:
        # Exchange code for tokens
        token = await oauth.enterprise.authorize_access_token(request)
    except OAuthError as e:
        logger.error(f"OAuth error during token exchange: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {e.description}"
        )

    # Extract user info from ID token or userinfo endpoint
    userinfo = token.get("userinfo")
    if not userinfo:
        # Try to get from ID token claims
        id_token = token.get("id_token")
        if id_token:
            userinfo = oauth.enterprise.parse_id_token(token)

    if not userinfo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not retrieve user information from IdP"
        )

    # Extract user attributes
    email = userinfo.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email claim is required from IdP"
        )

    # Get other user attributes with fallbacks
    full_name = (
        userinfo.get("name")
        or userinfo.get("preferred_username")
        or email.split("@")[0]
    )
    username = userinfo.get("preferred_username") or email.split("@")[0]
    sub = userinfo.get("sub")  # Unique identifier from IdP
    groups = userinfo.get("groups", [])  # IdP groups for role mapping

    # Check if user has admin group membership
    admin_groups = sso_settings.get_admin_groups()
    is_admin = any(g in groups for g in admin_groups) if admin_groups else False

    # Find or create user (JIT provisioning)
    user = await get_or_create_sso_user(
        db=db,
        email=email,
        username=username,
        full_name=full_name,
        sso_provider="oidc",
        sso_subject=sub,
        is_admin=is_admin,
        sso_settings=sso_settings,
    )

    # Create ChurnVision JWT token
    access_token = create_access_token(subject=str(user.id))

    # Get redirect destination
    final_redirect = request.session.pop("sso_redirect_uri", None)
    frontend_url = final_redirect or f"{app_settings.FRONTEND_URL or 'http://localhost:3000'}"

    # Redirect to frontend with token
    # The frontend should handle this and store the token
    redirect_url = f"{frontend_url}/auth/sso/callback?token={access_token}"

    logger.info(f"SSO login successful for user: {email}")
    return RedirectResponse(url=redirect_url)


@oidc_router.get("/status")
async def sso_status(sso_settings: SSOSettings = Depends(get_sso_settings)):
    """
    Check SSO configuration status.
    Used by frontend to determine if SSO login should be shown.
    """
    return {
        "enabled": sso_settings.SSO_ENABLED,
        "provider": sso_settings.SSO_PROVIDER if sso_settings.SSO_ENABLED else None,
        "configured": sso_settings.is_oidc_configured() or sso_settings.is_ldap_configured(),
    }


async def get_or_create_sso_user(
    db: AsyncSession,
    email: str,
    username: str,
    full_name: str,
    sso_provider: str,
    sso_subject: Optional[str],
    is_admin: bool,
    sso_settings: SSOSettings,
) -> User:
    """
    Get existing user or create new one via JIT provisioning.

    Args:
        db: Database session
        email: User email from IdP
        username: Username from IdP
        full_name: Full name from IdP
        sso_provider: SSO provider type (oidc, ldap, saml)
        sso_subject: Unique subject identifier from IdP
        is_admin: Whether user should have admin role
        sso_settings: SSO configuration

    Returns:
        User model instance
    """
    # Try to find existing user by email
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if user:
        # Update last login
        user.last_login_at = datetime.utcnow()
        await db.commit()
        logger.debug(f"Existing SSO user logged in: {email}")
        return user

    # JIT provisioning - create new user
    if not sso_settings.SSO_AUTO_CREATE_USERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not found and auto-provisioning is disabled"
        )

    # Create user in legacy_users table (for authentication)
    new_user = User(
        email=email,
        username=username,
        full_name=full_name,
        hashed_password="",  # SSO users don't have local passwords
        is_active=True,
        is_superuser=is_admin,
        sso_provider=sso_provider,
        sso_subject=sso_subject,
    )
    db.add(new_user)
    await db.flush()  # Get the auto-generated ID

    # Create user in RBAC users table
    user_account = UserAccount(
        user_id=str(new_user.id),
        username=username,
        email=email,
        password_hash="",  # SSO users don't have local passwords
        full_name=full_name,
        is_active=1,
        is_super_admin=1 if is_admin else 0,
    )
    db.add(user_account)

    # Assign default role
    role_id = "admin" if is_admin else sso_settings.SSO_DEFAULT_ROLE
    result = await db.execute(
        select(Role).where(Role.role_id == role_id)
    )
    role = result.scalar_one_or_none()

    if role:
        user_role = UserRole(
            user_id=str(new_user.id),
            role_id=role.role_id,
            scope_level="global",
            scope_id="global",
            granted_by="sso_system",
        )
        db.add(user_role)

    await db.commit()
    await db.refresh(new_user)

    logger.info(f"Created new SSO user via JIT provisioning: {email}")
    return new_user


# Configure OIDC on module load if settings are available
try:
    _sso_settings = get_sso_settings()
    if _sso_settings.is_oidc_configured():
        configure_oidc_provider(_sso_settings)
except Exception as e:
    logger.warning(f"Could not configure OIDC at startup: {e}")
