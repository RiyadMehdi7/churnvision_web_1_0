"""
Token blacklist for JWT revocation.

Provides Redis-backed token blacklisting for logout functionality with
automatic fallback to in-memory storage for development environments.

Production deployments should use Redis for persistence across restarts.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# In-memory fallback storage for development
_memory_blacklist: Dict[str, datetime] = {}
_last_cleanup: datetime = datetime.utcnow()
_cleanup_interval = timedelta(minutes=5)
# Thread-safe lock for in-memory blacklist operations
import threading
_blacklist_lock = threading.Lock()

# Redis client (lazy-initialized)
_redis_client: Optional[object] = None
_redis_available: Optional[bool] = None

# Key prefix for Redis
BLACKLIST_KEY_PREFIX = "churnvision:token:blacklist:"


def _get_redis_client():
    """
    Lazily initialize and return Redis client.
    Returns None if Redis is not available.
    """
    global _redis_client, _redis_available

    if _redis_available is False:
        return None

    if _redis_client is not None:
        return _redis_client

    try:
        from app.core.config import settings

        if not settings.REDIS_URL:
            _redis_available = False
            logger.info("Redis URL not configured, using in-memory token blacklist")
            return None

        import redis.asyncio as aioredis

        # Support both redis:// and rediss:// (TLS)
        redis_kwargs = {
            "decode_responses": True,
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
        }

        # Add TLS CA cert if configured (for certificate verification)
        if settings.REDIS_TLS_CA_CERT:
            import ssl
            ssl_context = ssl.create_default_context(cafile=settings.REDIS_TLS_CA_CERT)
            redis_kwargs["ssl"] = ssl_context

        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            **redis_kwargs,
        )
        _redis_available = True
        logger.info("Token blacklist using Redis backend")
        return _redis_client

    except ImportError:
        logger.warning("redis package not installed, using in-memory token blacklist")
        _redis_available = False
        return None
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}, using in-memory fallback")
        _redis_available = False
        return None


def _cleanup_expired_tokens() -> None:
    """Remove expired tokens from in-memory blacklist to prevent memory growth."""
    global _last_cleanup
    now = datetime.utcnow()

    if now - _last_cleanup < _cleanup_interval:
        return

    with _blacklist_lock:
        expired_tokens = [
            token for token, expiry in _memory_blacklist.items()
            if expiry < now
        ]

        for token in expired_tokens:
            _memory_blacklist.pop(token, None)

        if expired_tokens:
            logger.debug(f"Cleaned up {len(expired_tokens)} expired tokens from in-memory blacklist")

        _last_cleanup = now


async def blacklist_token_async(token: str, expires_at: datetime) -> None:
    """
    Add a token to the blacklist (async version).

    Args:
        token: The JWT token to blacklist
        expires_at: When the token expires (blacklist entry auto-removes after this)
    """
    # Only blacklist if token hasn't already expired
    if expires_at <= datetime.utcnow():
        return

    redis_client = _get_redis_client()

    if redis_client:
        try:
            # Calculate TTL in seconds
            ttl = int((expires_at - datetime.utcnow()).total_seconds())
            if ttl > 0:
                key = f"{BLACKLIST_KEY_PREFIX}{token}"
                await redis_client.setex(key, ttl, "1")
                logger.debug(f"Token blacklisted in Redis until {expires_at.isoformat()}")
                return
        except Exception as e:
            logger.warning(f"Redis blacklist failed, falling back to memory: {e}")

    # Fallback to in-memory
    _memory_blacklist[token] = expires_at
    logger.debug(f"Token blacklisted in memory until {expires_at.isoformat()}")
    _cleanup_expired_tokens()


def blacklist_token(token: str, expires_at: datetime) -> None:
    """
    Add a token to the blacklist (sync version for backward compatibility).

    Note: This uses in-memory storage. For Redis, use blacklist_token_async.

    Args:
        token: The JWT token to blacklist
        expires_at: When the token expires (blacklist entry auto-removes after this)
    """
    # Only blacklist if token hasn't already expired
    if expires_at > datetime.utcnow():
        with _blacklist_lock:
            _memory_blacklist[token] = expires_at
        logger.debug(f"Token blacklisted until {expires_at.isoformat()}")

    # Periodic cleanup
    _cleanup_expired_tokens()


async def is_token_blacklisted_async(token: str) -> bool:
    """
    Check if a token is blacklisted (async version).

    Args:
        token: The JWT token to check

    Returns:
        True if token is blacklisted and not expired, False otherwise
    """
    redis_client = _get_redis_client()

    if redis_client:
        try:
            key = f"{BLACKLIST_KEY_PREFIX}{token}"
            result = await redis_client.exists(key)
            return bool(result)
        except Exception as e:
            logger.warning(f"Redis check failed, falling back to memory: {e}")

    # Fallback to in-memory check
    return is_token_blacklisted(token)


def is_token_blacklisted(token: str) -> bool:
    """
    Check if a token is blacklisted (sync version).

    Args:
        token: The JWT token to check

    Returns:
        True if token is blacklisted and not expired, False otherwise
    """
    with _blacklist_lock:
        if token not in _memory_blacklist:
            return False

        expiry = _memory_blacklist[token]
        now = datetime.utcnow()

        # If expired, remove from blacklist and return False
        if expiry < now:
            _memory_blacklist.pop(token, None)
            return False

        return True


async def get_blacklist_size_async() -> int:
    """Get the current size of the blacklist (async, checks Redis first)."""
    redis_client = _get_redis_client()

    if redis_client:
        try:
            # Count keys with our prefix
            cursor = 0
            count = 0
            while True:
                cursor, keys = await redis_client.scan(
                    cursor, match=f"{BLACKLIST_KEY_PREFIX}*", count=100
                )
                count += len(keys)
                if cursor == 0:
                    break
            return count
        except Exception as e:
            logger.warning(f"Redis count failed: {e}")

    # Fallback to memory count
    return get_blacklist_size()


def get_blacklist_size() -> int:
    """Get the current size of the in-memory blacklist (for monitoring)."""
    _cleanup_expired_tokens()
    return len(_memory_blacklist)


async def clear_blacklist_async() -> None:
    """Clear all blacklisted tokens (use with caution, mainly for testing)."""
    redis_client = _get_redis_client()

    if redis_client:
        try:
            # Delete all keys with our prefix
            cursor = 0
            while True:
                cursor, keys = await redis_client.scan(
                    cursor, match=f"{BLACKLIST_KEY_PREFIX}*", count=100
                )
                if keys:
                    await redis_client.delete(*keys)
                if cursor == 0:
                    break
            logger.warning("Token blacklist cleared from Redis")
        except Exception as e:
            logger.warning(f"Redis clear failed: {e}")

    # Also clear memory
    clear_blacklist()


def clear_blacklist() -> None:
    """Clear all blacklisted tokens from memory (use with caution, mainly for testing)."""
    _memory_blacklist.clear()
    logger.warning("Token blacklist cleared from memory")


def get_backend_info() -> dict:
    """Get information about the current blacklist backend (for monitoring)."""
    redis_client = _get_redis_client()
    return {
        "backend": "redis" if redis_client else "memory",
        "redis_available": _redis_available,
        "memory_size": len(_memory_blacklist),
    }
