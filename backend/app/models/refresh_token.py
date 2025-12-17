"""
Refresh Token model for secure token rotation.
Stores hashed refresh tokens with expiration and revocation tracking.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class RefreshToken(Base):
    """
    Stores refresh tokens for JWT token rotation.

    Security features:
    - Token is hashed (SHA256) before storage - raw token never stored
    - Automatic expiration tracking
    - Revocation support for logout/security events
    - Device tracking for multi-device management
    """
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)

    # SHA256 hash of the refresh token (never store raw token)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)

    # User association
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Lifecycle timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)  # Set when token is revoked

    # Optional device tracking for security auditing
    device_info = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 max length

    # Relationship
    user = relationship("User", backref="refresh_tokens")

    # Composite index for efficient cleanup queries
    __table_args__ = (
        Index('ix_refresh_tokens_user_expires', 'user_id', 'expires_at'),
        Index('ix_refresh_tokens_cleanup', 'expires_at', 'revoked_at'),
    )

    def is_valid(self) -> bool:
        """Check if token is still valid (not expired and not revoked)."""
        now = datetime.utcnow()
        return self.expires_at > now and self.revoked_at is None

    def revoke(self) -> None:
        """Revoke this token."""
        self.revoked_at = datetime.utcnow()
