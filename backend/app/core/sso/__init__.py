"""
SSO/OIDC Authentication Module for ChurnVision Enterprise

Supports:
- OpenID Connect (OIDC) - Azure AD, Okta, Google Workspace, Keycloak, etc.
- LDAP/Active Directory (future)
- SAML 2.0 (future)

Configuration is done via environment variables to allow enterprises
to plug in their own identity provider without code changes.
"""

from app.core.sso.config import SSOSettings, get_sso_settings
from app.core.sso.oidc import oidc_router, oauth

__all__ = ["SSOSettings", "get_sso_settings", "oidc_router", "oauth"]
