"""
Token blacklist for JWT revocation.

Provides in-memory token blacklisting for logout functionality.
For production deployments, consider using Redis for persistence across restarts.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Set

logger = logging.getLogger(__name__)

# In-memory storage for blacklisted tokens
# Key: token hash, Value: expiration timestamp
_blacklist: Dict[str, datetime] = {}

# Track cleanup to avoid running too frequently
_last_cleanup: datetime = datetime.utcnow()
_cleanup_interval = timedelta(minutes=5)


def _cleanup_expired_tokens() -> None:
    """Remove expired tokens from blacklist to prevent memory growth."""
    global _last_cleanup
    now = datetime.utcnow()

    if now - _last_cleanup < _cleanup_interval:
        return

    expired_tokens = [
        token for token, expiry in _blacklist.items()
        if expiry < now
    ]

    for token in expired_tokens:
        _blacklist.pop(token, None)

    if expired_tokens:
        logger.debug(f"Cleaned up {len(expired_tokens)} expired tokens from blacklist")

    _last_cleanup = now


def blacklist_token(token: str, expires_at: datetime) -> None:
    """
    Add a token to the blacklist.

    Args:
        token: The JWT token to blacklist
        expires_at: When the token expires (blacklist entry auto-removes after this)
    """
    # Only blacklist if token hasn't already expired
    if expires_at > datetime.utcnow():
        _blacklist[token] = expires_at
        logger.debug(f"Token blacklisted until {expires_at.isoformat()}")

    # Periodic cleanup
    _cleanup_expired_tokens()


def is_token_blacklisted(token: str) -> bool:
    """
    Check if a token is blacklisted.

    Args:
        token: The JWT token to check

    Returns:
        True if token is blacklisted and not expired, False otherwise
    """
    if token not in _blacklist:
        return False

    expiry = _blacklist[token]
    now = datetime.utcnow()

    # If expired, remove from blacklist and return False
    if expiry < now:
        _blacklist.pop(token, None)
        return False

    return True


def get_blacklist_size() -> int:
    """Get the current size of the blacklist (for monitoring)."""
    _cleanup_expired_tokens()
    return len(_blacklist)


def clear_blacklist() -> None:
    """Clear all blacklisted tokens (use with caution, mainly for testing)."""
    _blacklist.clear()
    logger.warning("Token blacklist cleared")
