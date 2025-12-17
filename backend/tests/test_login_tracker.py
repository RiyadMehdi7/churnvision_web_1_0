"""
Tests for app/core/login_tracker.py - Redis-backed login attempt tracking.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio


class TestInMemoryLoginTracker:
    """Test the in-memory fallback login tracker."""

    @pytest.mark.asyncio
    async def test_record_failed_attempt_increments_count(self):
        """Failed attempt should increment the counter."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "test_user::127.0.0.1"

        count1 = await tracker.record_failed_attempt(key)
        count2 = await tracker.record_failed_attempt(key)
        count3 = await tracker.record_failed_attempt(key)

        assert count1 == 1
        assert count2 == 2
        assert count3 == 3

    @pytest.mark.asyncio
    async def test_reset_clears_attempts(self):
        """Reset should clear all attempt tracking for a key."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "reset_test::127.0.0.1"

        await tracker.record_failed_attempt(key)
        await tracker.record_failed_attempt(key)
        await tracker.reset(key)

        # After reset, next attempt should be count 1
        count = await tracker.record_failed_attempt(key)
        assert count == 1

    @pytest.mark.asyncio
    async def test_is_locked_returns_false_when_not_locked(self):
        """Should return False when account is not locked."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "not_locked::127.0.0.1"

        is_locked, remaining = await tracker.is_locked(key)

        assert is_locked is False
        assert remaining == 0

    @pytest.mark.asyncio
    async def test_set_locked_and_check(self):
        """Should correctly set and check locked status."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "locked_user::127.0.0.1"

        await tracker.set_locked(key, 60)  # Lock for 60 seconds

        is_locked, remaining = await tracker.is_locked(key)

        assert is_locked is True
        assert remaining > 0
        assert remaining <= 60

    @pytest.mark.asyncio
    async def test_expired_lock_is_cleared(self):
        """Expired lock should return not locked."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "expired_lock::127.0.0.1"

        # Set a very short lock
        await tracker.set_locked(key, 0)

        # Wait a tiny bit
        await asyncio.sleep(0.1)

        is_locked, remaining = await tracker.is_locked(key)

        assert is_locked is False

    @pytest.mark.asyncio
    async def test_prune_old_attempts(self):
        """Old attempts outside window should be pruned."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker(attempt_window_minutes=1)
        key = "prune_test::127.0.0.1"

        # Manually add old timestamps
        old_time = datetime.utcnow() - timedelta(minutes=5)
        tracker._attempts[key] = [old_time, old_time]

        # Record a new attempt (should prune old ones first)
        count = await tracker.record_failed_attempt(key)

        # Should only count the new attempt
        assert count == 1


class TestRedisLoginTracker:
    """Test the Redis-backed login tracker."""

    @pytest.fixture
    def mock_redis(self):
        """Create a mock Redis client."""
        redis = AsyncMock()
        redis.incr = AsyncMock(return_value=1)
        redis.expire = AsyncMock()
        redis.get = AsyncMock(return_value=None)
        redis.set = AsyncMock()
        redis.delete = AsyncMock()
        redis.ttl = AsyncMock(return_value=-2)
        return redis

    @pytest.mark.asyncio
    async def test_record_failed_attempt_uses_redis(self, mock_redis):
        """Should use Redis incr for counting attempts."""
        from app.core.login_tracker import RedisLoginTracker

        tracker = RedisLoginTracker(mock_redis)
        key = "redis_test::127.0.0.1"

        count = await tracker.record_failed_attempt(key)

        assert count == 1
        mock_redis.incr.assert_called()
        mock_redis.expire.assert_called()

    @pytest.mark.asyncio
    async def test_is_locked_checks_redis(self, mock_redis):
        """Should check Redis for lock status."""
        from app.core.login_tracker import RedisLoginTracker

        tracker = RedisLoginTracker(mock_redis)
        key = "check_lock::127.0.0.1"

        mock_redis.get.return_value = None

        is_locked, remaining = await tracker.is_locked(key)

        assert is_locked is False
        mock_redis.get.assert_called()

    @pytest.mark.asyncio
    async def test_is_locked_when_redis_has_lock(self, mock_redis):
        """Should return True when Redis has lock key."""
        from app.core.login_tracker import RedisLoginTracker

        tracker = RedisLoginTracker(mock_redis)
        key = "locked::127.0.0.1"

        mock_redis.get.return_value = b"1"
        mock_redis.ttl.return_value = 300

        is_locked, remaining = await tracker.is_locked(key)

        assert is_locked is True
        assert remaining == 300

    @pytest.mark.asyncio
    async def test_set_locked_stores_in_redis(self, mock_redis):
        """Should store lock in Redis with expiry."""
        from app.core.login_tracker import RedisLoginTracker

        tracker = RedisLoginTracker(mock_redis)
        key = "set_lock::127.0.0.1"

        await tracker.set_locked(key, 900)

        mock_redis.set.assert_called()

    @pytest.mark.asyncio
    async def test_reset_deletes_from_redis(self, mock_redis):
        """Should delete both attempt and lock keys."""
        from app.core.login_tracker import RedisLoginTracker

        tracker = RedisLoginTracker(mock_redis)
        key = "reset::127.0.0.1"

        await tracker.reset(key)

        assert mock_redis.delete.call_count == 2


class TestHybridLoginTracker:
    """Test the hybrid tracker that uses Redis with in-memory fallback."""

    @pytest.mark.asyncio
    async def test_uses_redis_when_available(self):
        """Should use Redis tracker when Redis is available."""
        from app.core.login_tracker import HybridLoginTracker

        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=2)
        mock_redis.expire = AsyncMock()

        tracker = HybridLoginTracker(redis_client=mock_redis)

        count = await tracker.record_failed_attempt("test::1.2.3.4")

        assert count == 2
        mock_redis.incr.assert_called()

    @pytest.mark.asyncio
    async def test_falls_back_to_memory_on_redis_error(self):
        """Should fall back to in-memory when Redis fails."""
        from app.core.login_tracker import HybridLoginTracker

        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(side_effect=Exception("Redis connection failed"))
        mock_redis.expire = AsyncMock()

        tracker = HybridLoginTracker(redis_client=mock_redis)

        # Should not raise, should fall back to memory
        count = await tracker.record_failed_attempt("fallback::1.2.3.4")

        assert count == 1  # First attempt in memory

    @pytest.mark.asyncio
    async def test_uses_memory_when_no_redis(self):
        """Should use in-memory tracker when Redis is None."""
        from app.core.login_tracker import HybridLoginTracker

        tracker = HybridLoginTracker(redis_client=None)

        count = await tracker.record_failed_attempt("memory::1.2.3.4")

        assert count == 1


class TestGetLoginTracker:
    """Test the get_login_tracker factory function."""

    def test_returns_tracker_instance(self):
        """Should return a login tracker instance."""
        from app.core.login_tracker import get_login_tracker

        tracker = get_login_tracker()

        assert tracker is not None
        assert hasattr(tracker, 'record_failed_attempt')
        assert hasattr(tracker, 'is_locked')
        assert hasattr(tracker, 'reset')

    def test_returns_same_instance(self):
        """Should return singleton instance."""
        from app.core.login_tracker import get_login_tracker

        tracker1 = get_login_tracker()
        tracker2 = get_login_tracker()

        assert tracker1 is tracker2


class TestIntegrationWithAuth:
    """Integration tests with auth module."""

    @pytest.mark.asyncio
    async def test_assert_not_locked_uses_tracker(self, monkeypatch):
        """_assert_not_locked should use the login tracker."""
        from app.api.v1 import auth
        from app.core.login_tracker import InMemoryLoginTracker

        # Create a tracker with a locked account
        tracker = InMemoryLoginTracker()
        await tracker.set_locked("locked::127.0.0.1", 300)

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            from fastapi import HTTPException

            with pytest.raises(HTTPException) as exc_info:
                await auth._assert_not_locked("locked::127.0.0.1")

            assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_register_failed_uses_tracker(self, monkeypatch):
        """_register_failed_attempt should use the login tracker."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            from app.api.v1 import auth

            # Should not raise for first attempt
            await auth._register_failed_attempt("test::127.0.0.1")

            # Check tracker recorded the attempt
            count = await tracker.record_failed_attempt("test::127.0.0.1")
            assert count == 2  # This is the second attempt

    @pytest.mark.asyncio
    async def test_reset_uses_tracker(self):
        """_reset_attempts should use the login tracker."""
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        await tracker.record_failed_attempt("reset::127.0.0.1")

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            from app.api.v1 import auth

            await auth._reset_attempts("reset::127.0.0.1")

            # After reset, should start from 1
            count = await tracker.record_failed_attempt("reset::127.0.0.1")
            assert count == 1
