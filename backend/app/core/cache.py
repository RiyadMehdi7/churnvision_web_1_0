"""
Caching layer for ChurnVision Enterprise.
Uses Redis for distributed caching with fallback to in-memory cache.
"""

import asyncio
import functools
import hashlib
import json
import logging
from datetime import timedelta
from typing import Any, Callable, Optional, TypeVar, Union

from app.core.config import settings

logger = logging.getLogger("churnvision.cache")

T = TypeVar("T")


class CacheBackend:
    """Base class for cache backends."""

    async def get(self, key: str) -> Optional[str]:
        raise NotImplementedError

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        raise NotImplementedError

    async def delete(self, key: str) -> bool:
        raise NotImplementedError

    async def exists(self, key: str) -> bool:
        raise NotImplementedError

    async def clear_pattern(self, pattern: str) -> int:
        raise NotImplementedError

    async def close(self) -> None:
        pass


class InMemoryCache(CacheBackend):
    """
    Simple in-memory cache for single-instance deployments.
    Not suitable for production multi-instance deployments.
    """

    def __init__(self, max_size: int = 1000):
        self._cache: dict[str, tuple[str, Optional[float]]] = {}
        self._max_size = max_size
        self._lock = asyncio.Lock()

    async def _cleanup_expired(self) -> None:
        """Remove expired entries."""
        current_time = asyncio.get_event_loop().time()
        expired_keys = [
            key for key, (_, expiry) in self._cache.items()
            if expiry and expiry < current_time
        ]
        for key in expired_keys:
            del self._cache[key]

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            await self._cleanup_expired()
            if key in self._cache:
                value, expiry = self._cache[key]
                current_time = asyncio.get_event_loop().time()
                if expiry is None or expiry > current_time:
                    return value
                del self._cache[key]
            return None

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        async with self._lock:
            # Enforce max size
            if len(self._cache) >= self._max_size:
                await self._cleanup_expired()
                if len(self._cache) >= self._max_size:
                    # Remove oldest entry
                    oldest_key = next(iter(self._cache))
                    del self._cache[oldest_key]

            expiry = None
            if ttl:
                expiry = asyncio.get_event_loop().time() + ttl

            self._cache[key] = (value, expiry)
            return True

    async def delete(self, key: str) -> bool:
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    async def exists(self, key: str) -> bool:
        return await self.get(key) is not None

    async def clear_pattern(self, pattern: str) -> int:
        """Clear keys matching a pattern (simple prefix matching)."""
        async with self._lock:
            # Convert Redis pattern to simple prefix (e.g., "user:*" -> "user:")
            prefix = pattern.rstrip("*")
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)


class RedisCache(CacheBackend):
    """
    Redis-based cache for distributed deployments.
    """

    def __init__(self, url: str):
        self._url = url
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
                socket_timeout=5.0,  # Timeout for individual operations
                socket_connect_timeout=5.0,  # Timeout for connection establishment
            )
            # Test connection
            await self._redis.ping()
            self._connected = True
            logger.info("Redis cache connected")
            return True
        except ImportError:
            logger.warning("redis package not installed, falling back to in-memory cache")
            return False
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}, using in-memory fallback")
            self._connected = False
            return False

    async def get(self, key: str) -> Optional[str]:
        if not await self._ensure_connected():
            return None
        try:
            return await self._redis.get(key)
        except Exception as e:
            logger.error(f"Redis GET error: {e}")
            return None

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        if not await self._ensure_connected():
            return False
        try:
            if ttl:
                await self._redis.setex(key, ttl, value)
            else:
                await self._redis.set(key, value)
            return True
        except Exception as e:
            logger.error(f"Redis SET error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        if not await self._ensure_connected():
            return False
        try:
            result = await self._redis.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis DELETE error: {e}")
            return False

    async def exists(self, key: str) -> bool:
        if not await self._ensure_connected():
            return False
        try:
            return await self._redis.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis EXISTS error: {e}")
            return False

    async def clear_pattern(self, pattern: str) -> int:
        if not await self._ensure_connected():
            return 0
        try:
            keys = await self._redis.keys(pattern)
            if keys:
                return await self._redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Redis clear_pattern error: {e}")
            return 0

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._connected = False


# Global cache instance
_cache: Optional[CacheBackend] = None


async def get_cache() -> CacheBackend:
    """Get the global cache instance."""
    global _cache
    if _cache is None:
        redis_url = getattr(settings, "REDIS_URL", None)
        if redis_url:
            _cache = RedisCache(redis_url)
            # Test connection
            try:
                await _cache._ensure_connected()
            except Exception:
                logger.warning("Redis unavailable, using in-memory cache")
                _cache = InMemoryCache()
        else:
            logger.info("No REDIS_URL configured, using in-memory cache")
            _cache = InMemoryCache()
    return _cache


def cache_key(*args, **kwargs) -> str:
    """Generate a cache key from arguments."""
    key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    return hashlib.md5(key_data.encode()).hexdigest()


def cached(
    ttl: Union[int, timedelta] = 300,
    prefix: str = "",
    key_builder: Optional[Callable[..., str]] = None,
):
    """
    Decorator to cache function results.

    Args:
        ttl: Time to live in seconds (or timedelta)
        prefix: Key prefix for namespacing
        key_builder: Custom function to build cache key

    Usage:
        @cached(ttl=60, prefix="dashboard")
        async def get_dashboard_stats():
            ...
    """
    if isinstance(ttl, timedelta):
        ttl_seconds = int(ttl.total_seconds())
    else:
        ttl_seconds = ttl

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key
            if key_builder:
                key = key_builder(*args, **kwargs)
            else:
                key = cache_key(*args, **kwargs)

            full_key = f"{prefix}:{func.__name__}:{key}" if prefix else f"{func.__name__}:{key}"

            # Try to get from cache
            cache = await get_cache()
            cached_value = await cache.get(full_key)

            if cached_value is not None:
                try:
                    return json.loads(cached_value)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid cached value for {full_key}")

            # Execute function and cache result
            result = await func(*args, **kwargs)

            try:
                await cache.set(full_key, json.dumps(result, default=str), ttl_seconds)
            except Exception as e:
                logger.warning(f"Failed to cache result: {e}")

            return result

        return wrapper
    return decorator


async def invalidate_cache(pattern: str) -> int:
    """
    Invalidate cache entries matching a pattern.

    Usage:
        await invalidate_cache("dashboard:*")  # Clear all dashboard cache
    """
    cache = await get_cache()
    count = await cache.clear_pattern(pattern)
    logger.info(f"Invalidated {count} cache entries matching '{pattern}'")
    return count


# Cache TTL presets
class CacheTTL:
    """Common cache TTL values."""
    SHORT = 60           # 1 minute - frequently changing data
    MEDIUM = 300         # 5 minutes - dashboard stats
    LONG = 3600          # 1 hour - reference data
    VERY_LONG = 86400    # 24 hours - static data
