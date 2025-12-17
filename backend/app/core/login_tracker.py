"""
Login attempt tracking for brute-force protection.
Uses Redis for distributed deployments with fallback to in-memory for single-instance.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("churnvision.login_tracker")


class LoginTrackerBackend:
    """Base class for login tracking backends."""

    async def record_failed_attempt(self, key: str) -> int:
        """Record a failed attempt and return the current count."""
        raise NotImplementedError

    async def is_locked(self, key: str) -> tuple[bool, int]:
        """Check if account is locked. Returns (is_locked, remaining_seconds)."""
        raise NotImplementedError

    async def set_locked(self, key: str, duration_seconds: int) -> None:
        """Set account as locked for duration."""
        raise NotImplementedError

    async def reset(self, key: str) -> None:
        """Reset attempts and lock status on successful login."""
        raise NotImplementedError


class InMemoryLoginTracker(LoginTrackerBackend):
    """
    In-memory login tracker for single-instance deployments.
    Not suitable for horizontal scaling.
    """

    def __init__(self):
        self._attempts: dict[str, list[datetime]] = {}
        self._locked_until: dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def _prune_attempts(self, key: str) -> None:
        """Remove attempts outside the window."""
        window = timedelta(minutes=settings.LOGIN_ATTEMPT_WINDOW_MINUTES)
        cutoff = datetime.utcnow() - window
        if key in self._attempts:
            self._attempts[key] = [ts for ts in self._attempts[key] if ts >= cutoff]

    async def record_failed_attempt(self, key: str) -> int:
        async with self._lock:
            await self._prune_attempts(key)
            if key not in self._attempts:
                self._attempts[key] = []
            self._attempts[key].append(datetime.utcnow())
            return len(self._attempts[key])

    async def is_locked(self, key: str) -> tuple[bool, int]:
        async with self._lock:
            locked_until = self._locked_until.get(key)
            if locked_until and locked_until > datetime.utcnow():
                remaining = int((locked_until - datetime.utcnow()).total_seconds())
                return True, remaining
            # Clear expired lock
            if locked_until:
                self._locked_until.pop(key, None)
            return False, 0

    async def set_locked(self, key: str, duration_seconds: int) -> None:
        async with self._lock:
            self._locked_until[key] = datetime.utcnow() + timedelta(seconds=duration_seconds)

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._attempts.pop(key, None)
            self._locked_until.pop(key, None)


class RedisLoginTracker(LoginTrackerBackend):
    """
    Redis-backed login tracker for horizontal scaling.
    Uses Redis INCR with TTL for attempt counting and separate lock keys.
    """

    def __init__(self, redis_url: str):
        self._url = redis_url
        self._redis = None
        self._connected = False

    async def _ensure_connected(self) -> bool:
        """Ensure Redis connection is established."""
        if self._connected and self._redis:
            return True

        try:
            import redis.asyncio as redis
            self._redis = redis.from_url(
                self._url,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()
            self._connected = True
            logger.info("Redis login tracker connected")
            return True
        except ImportError:
            logger.warning("redis package not installed")
            return False
        except Exception as e:
            logger.warning(f"Failed to connect to Redis for login tracking: {e}")
            self._connected = False
            return False

    def _attempts_key(self, key: str) -> str:
        return f"login:attempts:{key}"

    def _lock_key(self, key: str) -> str:
        return f"login:locked:{key}"

    async def record_failed_attempt(self, key: str) -> int:
        if not await self._ensure_connected():
            raise RuntimeError("Redis not available")

        attempts_key = self._attempts_key(key)
        window_seconds = settings.LOGIN_ATTEMPT_WINDOW_MINUTES * 60

        try:
            # Increment counter and set TTL
            pipe = self._redis.pipeline()
            pipe.incr(attempts_key)
            pipe.expire(attempts_key, window_seconds)
            results = await pipe.execute()
            return results[0]  # INCR result is the new count
        except Exception as e:
            logger.error(f"Redis error recording failed attempt: {e}")
            raise

    async def is_locked(self, key: str) -> tuple[bool, int]:
        if not await self._ensure_connected():
            raise RuntimeError("Redis not available")

        lock_key = self._lock_key(key)

        try:
            ttl = await self._redis.ttl(lock_key)
            if ttl > 0:
                return True, ttl
            return False, 0
        except Exception as e:
            logger.error(f"Redis error checking lock status: {e}")
            raise

    async def set_locked(self, key: str, duration_seconds: int) -> None:
        if not await self._ensure_connected():
            raise RuntimeError("Redis not available")

        lock_key = self._lock_key(key)

        try:
            await self._redis.setex(lock_key, duration_seconds, "locked")
            logger.warning(f"Account locked: {key} for {duration_seconds}s")
        except Exception as e:
            logger.error(f"Redis error setting lock: {e}")
            raise

    async def reset(self, key: str) -> None:
        if not await self._ensure_connected():
            raise RuntimeError("Redis not available")

        attempts_key = self._attempts_key(key)
        lock_key = self._lock_key(key)

        try:
            await self._redis.delete(attempts_key, lock_key)
        except Exception as e:
            logger.error(f"Redis error resetting login tracker: {e}")
            raise


class HybridLoginTracker:
    """
    Login tracker that uses Redis when available, falls back to in-memory.
    Logs a warning when falling back to ensure operators are aware.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self._redis_url = redis_url or settings.REDIS_URL
        self._redis_tracker: Optional[RedisLoginTracker] = None
        self._memory_tracker = InMemoryLoginTracker()
        self._use_redis = bool(self._redis_url)
        self._fallback_warned = False

    async def _get_tracker(self) -> LoginTrackerBackend:
        """Get the appropriate tracker, trying Redis first."""
        if not self._use_redis:
            return self._memory_tracker

        if self._redis_tracker is None:
            self._redis_tracker = RedisLoginTracker(self._redis_url)

        # Try to use Redis
        try:
            if await self._redis_tracker._ensure_connected():
                return self._redis_tracker
        except Exception:
            pass

        # Fallback to in-memory
        if not self._fallback_warned:
            logger.warning(
                "Redis unavailable for login tracking. Using in-memory fallback. "
                "This is NOT suitable for horizontal scaling - failed login attempts "
                "won't sync across instances."
            )
            self._fallback_warned = True

        return self._memory_tracker

    async def record_failed_attempt(self, key: str) -> int:
        tracker = await self._get_tracker()
        try:
            return await tracker.record_failed_attempt(key)
        except Exception as e:
            logger.error(f"Error recording failed attempt: {e}")
            # Try in-memory fallback
            if tracker != self._memory_tracker:
                return await self._memory_tracker.record_failed_attempt(key)
            raise

    async def is_locked(self, key: str) -> tuple[bool, int]:
        tracker = await self._get_tracker()
        try:
            return await tracker.is_locked(key)
        except Exception as e:
            logger.error(f"Error checking lock status: {e}")
            if tracker != self._memory_tracker:
                return await self._memory_tracker.is_locked(key)
            raise

    async def set_locked(self, key: str, duration_seconds: int) -> None:
        tracker = await self._get_tracker()
        try:
            await tracker.set_locked(key, duration_seconds)
        except Exception as e:
            logger.error(f"Error setting lock: {e}")
            if tracker != self._memory_tracker:
                await self._memory_tracker.set_locked(key, duration_seconds)
            else:
                raise

    async def reset(self, key: str) -> None:
        tracker = await self._get_tracker()
        try:
            await tracker.reset(key)
        except Exception as e:
            logger.error(f"Error resetting tracker: {e}")
            if tracker != self._memory_tracker:
                await self._memory_tracker.reset(key)
            else:
                raise


# Global instance
_login_tracker: Optional[HybridLoginTracker] = None


def get_login_tracker() -> HybridLoginTracker:
    """Get the global login tracker instance."""
    global _login_tracker
    if _login_tracker is None:
        _login_tracker = HybridLoginTracker()
    return _login_tracker
