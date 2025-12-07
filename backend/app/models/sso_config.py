"""
SSO Configuration Model

Stores SSO/OIDC configuration in the database instead of environment variables.
This allows IT admins to configure SSO through the Admin UI without SSH access.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.db.base_class import Base


class SSOConfig(Base):
    """
    SSO Configuration stored in database.

    Only one active configuration is allowed at a time.
    Secrets are stored encrypted (handled at application level).
    """
    __tablename__ = "sso_config"

    id = Column(Integer, primary_key=True, index=True)

    # General settings
    enabled = Column(Boolean, default=False, nullable=False)
    provider = Column(String(50), default="oidc", nullable=False)  # oidc, ldap, saml

    # OIDC settings
    issuer_url = Column(String(500), nullable=True)
    client_id = Column(String(255), nullable=True)
    client_secret_encrypted = Column(Text, nullable=True)  # Encrypted with Fernet
    redirect_uri = Column(String(500), nullable=True)
    scopes = Column(String(255), default="openid email profile", nullable=False)

    # User provisioning
    auto_create_users = Column(Boolean, default=True, nullable=False)
    default_role = Column(String(50), default="viewer", nullable=False)
    admin_groups = Column(Text, nullable=True)  # Comma-separated group names

    # Session settings
    session_lifetime = Column(Integer, default=86400, nullable=False)  # seconds

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)

    # Connection test status
    last_test_at = Column(DateTime(timezone=True), nullable=True)
    last_test_success = Column(Boolean, nullable=True)
    last_test_error = Column(Text, nullable=True)

    def __repr__(self):
        return f"<SSOConfig provider={self.provider} enabled={self.enabled}>"
