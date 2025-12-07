"""
SSO Configuration for ChurnVision Enterprise

All SSO settings are configured via environment variables, allowing
enterprises to integrate with their identity provider without code changes.

Supported providers (via OIDC):
- Azure AD / Entra ID
- Okta
- Google Workspace
- Keycloak
- OneLogin
- Ping Identity
- Any OIDC-compliant IdP
"""

from typing import Literal, Optional
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class SSOSettings(BaseSettings):
    """
    SSO configuration loaded from environment variables.

    Environment variables:
        SSO_ENABLED: Enable/disable SSO authentication
        SSO_PROVIDER: Type of SSO provider (oidc, ldap, saml)
        SSO_ISSUER_URL: OIDC issuer URL (e.g., https://login.microsoftonline.com/{tenant}/v2.0)
        SSO_CLIENT_ID: OAuth2/OIDC client ID
        SSO_CLIENT_SECRET: OAuth2/OIDC client secret
        SSO_REDIRECT_URI: Callback URL after authentication
        SSO_SCOPES: Space-separated OAuth2 scopes
        SSO_AUTO_CREATE_USERS: Automatically create users on first login (JIT provisioning)
        SSO_DEFAULT_ROLE: Default role for auto-created users
        SSO_ADMIN_GROUPS: Comma-separated list of IdP groups that grant admin access
    """

    # General SSO settings
    SSO_ENABLED: bool = Field(default=False, description="Enable SSO authentication")
    SSO_PROVIDER: Literal["oidc", "ldap", "saml", "none"] = Field(
        default="none",
        description="SSO provider type"
    )

    # OIDC settings (works with Azure AD, Okta, Google, Keycloak, etc.)
    SSO_ISSUER_URL: Optional[str] = Field(
        default=None,
        description="OIDC issuer URL (e.g., https://login.microsoftonline.com/{tenant}/v2.0)"
    )
    SSO_CLIENT_ID: Optional[str] = Field(
        default=None,
        description="OAuth2/OIDC client ID"
    )
    SSO_CLIENT_SECRET: Optional[str] = Field(
        default=None,
        description="OAuth2/OIDC client secret"
    )
    SSO_REDIRECT_URI: Optional[str] = Field(
        default=None,
        description="Callback URL (defaults to {FRONTEND_URL}/auth/sso/callback)"
    )
    SSO_SCOPES: str = Field(
        default="openid email profile",
        description="OAuth2 scopes (space-separated)"
    )

    # User provisioning settings
    SSO_AUTO_CREATE_USERS: bool = Field(
        default=True,
        description="Auto-create users on first SSO login (JIT provisioning)"
    )
    SSO_DEFAULT_ROLE: str = Field(
        default="viewer",
        description="Default role for auto-created SSO users"
    )
    SSO_ADMIN_GROUPS: Optional[str] = Field(
        default=None,
        description="Comma-separated IdP groups that grant admin access"
    )

    # LDAP settings (for direct Active Directory integration)
    LDAP_SERVER: Optional[str] = Field(
        default=None,
        description="LDAP server URL (e.g., ldap://ad.company.local:389)"
    )
    LDAP_BASE_DN: Optional[str] = Field(
        default=None,
        description="LDAP base DN (e.g., DC=company,DC=local)"
    )
    LDAP_BIND_DN: Optional[str] = Field(
        default=None,
        description="LDAP bind DN for service account"
    )
    LDAP_BIND_PASSWORD: Optional[str] = Field(
        default=None,
        description="LDAP bind password"
    )
    LDAP_USER_FILTER: str = Field(
        default="(sAMAccountName={username})",
        description="LDAP user search filter"
    )
    LDAP_USE_SSL: bool = Field(
        default=False,
        description="Use LDAPS (SSL/TLS)"
    )

    # Session settings
    SSO_SESSION_LIFETIME: int = Field(
        default=86400,  # 24 hours
        description="SSO session lifetime in seconds"
    )

    @field_validator("SSO_ADMIN_GROUPS", mode="before")
    @classmethod
    def parse_admin_groups(cls, v: Optional[str]) -> Optional[str]:
        """Keep as string, will be parsed when needed."""
        return v

    def get_admin_groups(self) -> list[str]:
        """Parse admin groups from comma-separated string."""
        if not self.SSO_ADMIN_GROUPS:
            return []
        return [g.strip() for g in self.SSO_ADMIN_GROUPS.split(",") if g.strip()]

    def is_oidc_configured(self) -> bool:
        """Check if OIDC is properly configured."""
        return (
            self.SSO_ENABLED
            and self.SSO_PROVIDER == "oidc"
            and self.SSO_ISSUER_URL is not None
            and self.SSO_CLIENT_ID is not None
            and self.SSO_CLIENT_SECRET is not None
        )

    def is_ldap_configured(self) -> bool:
        """Check if LDAP is properly configured."""
        return (
            self.SSO_ENABLED
            and self.SSO_PROVIDER == "ldap"
            and self.LDAP_SERVER is not None
            and self.LDAP_BASE_DN is not None
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_sso_settings() -> SSOSettings:
    """Get cached SSO settings instance."""
    return SSOSettings()
