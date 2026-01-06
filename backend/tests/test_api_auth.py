"""
Tests for app/api/v1/auth.py - Authentication endpoints.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


class TestPasswordPolicy:
    """Test password policy enforcement."""

    def test_rejects_short_password(self, monkeypatch):
        """Password shorter than minimum should be rejected."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("MIN_PASSWORD_LENGTH", "8")

        from app.api.v1 import auth
        import importlib
        importlib.reload(auth)

        with pytest.raises(HTTPException) as exc_info:
            auth._validate_password_policy("short")

        assert exc_info.value.status_code == 400
        assert "at least" in exc_info.value.detail.lower()

    def test_accepts_valid_password(self, monkeypatch):
        """Valid password should be accepted."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("MIN_PASSWORD_LENGTH", "8")
        monkeypatch.setenv("REQUIRE_SPECIAL_CHARS", "true")

        from app.api.v1 import auth
        import importlib
        importlib.reload(auth)

        # Should not raise
        auth._validate_password_policy("password123!")

    def test_rejects_password_without_special_char(self, monkeypatch):
        """Password without special char should be rejected when required."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("MIN_PASSWORD_LENGTH", "8")
        monkeypatch.setenv("REQUIRE_SPECIAL_CHARS", "true")

        from app.api.v1 import auth
        import importlib
        importlib.reload(auth)

        with pytest.raises(HTTPException) as exc_info:
            auth._validate_password_policy("password123")

        assert exc_info.value.status_code == 400
        assert "special character" in exc_info.value.detail.lower()


class TestRateLimiting:
    """Test login rate limiting and lockout."""

    def test_login_key_includes_username_and_ip(self):
        """Login key should combine username and IP."""
        from app.api.v1.auth import _login_key

        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.1"

        key = _login_key("testuser", mock_request)

        assert "testuser" in key
        assert "192.168.1.1" in key

    def test_login_key_handles_none_request(self):
        """Login key should handle None request."""
        from app.api.v1.auth import _login_key

        key = _login_key("testuser", None)

        assert "testuser" in key
        assert "unknown" in key

    @pytest.mark.asyncio
    async def test_assert_not_locked_raises_when_locked(self):
        """Should raise 429 when account is locked."""
        from app.api.v1.auth import _assert_not_locked
        from app.core.login_tracker import InMemoryLoginTracker

        # Create a tracker with a locked account
        tracker = InMemoryLoginTracker()
        key = "locked_user::127.0.0.1"
        await tracker.set_locked(key, 600)  # Lock for 10 minutes

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            with pytest.raises(HTTPException) as exc_info:
                await _assert_not_locked(key)

            assert exc_info.value.status_code == 429
            assert "Too many" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_assert_not_locked_allows_unlocked(self):
        """Should not raise when account is not locked."""
        from app.api.v1.auth import _assert_not_locked
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "unlocked_user::127.0.0.1"

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            # Should not raise
            await _assert_not_locked(key)

    @pytest.mark.asyncio
    async def test_register_failed_locks_after_max_attempts(self):
        """Account should lock after max failed attempts."""
        from app.api.v1.auth import _register_failed_attempt
        from app.core.login_tracker import InMemoryLoginTracker
        from app.core import config

        tracker = InMemoryLoginTracker()
        key = "failing_user::127.0.0.1"

        # Patch settings directly instead of env vars (settings already loaded)
        with patch.object(config.settings, 'LOGIN_MAX_ATTEMPTS', 3):
            with patch.object(config.settings, 'LOGIN_LOCKOUT_MINUTES', 15):
                with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
                    # Register failures up to limit
                    await _register_failed_attempt(key)
                    await _register_failed_attempt(key)

                    # Third attempt should trigger lockout
                    with pytest.raises(HTTPException) as exc_info:
                        await _register_failed_attempt(key)

                    assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_reset_attempts_clears_state(self):
        """Reset should clear all attempt tracking."""
        from app.api.v1.auth import _reset_attempts
        from app.core.login_tracker import InMemoryLoginTracker

        tracker = InMemoryLoginTracker()
        key = "reset_user::127.0.0.1"

        # Add some state
        await tracker.record_failed_attempt(key)
        await tracker.set_locked(key, 600)

        with patch('app.api.v1.auth.get_login_tracker', return_value=tracker):
            await _reset_attempts(key)

            # Verify state is cleared
            is_locked, _ = await tracker.is_locked(key)
            assert is_locked is False
            # After reset, next attempt should be count 1
            count = await tracker.record_failed_attempt(key)
            assert count == 1


class TestLoginEndpoint:
    """Test login endpoint behavior."""

    @pytest.mark.asyncio
    async def test_login_success(self, mock_db_session, mock_user, mock_request):
        """Successful login should return token and set cookie."""
        from app.api.v1.auth import login
        from app.schemas.token import LoginRequest
        from app.core.security import get_password_hash
        from unittest.mock import patch, AsyncMock

        # Setup mock user with correct password
        mock_user.hashed_password = get_password_hash("correct_password")
        mock_user.full_name = "Test User"

        # Mock database query
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # Mock response
        mock_response = MagicMock()

        login_data = LoginRequest(username="testuser", password="correct_password")

        with patch("app.api.v1.auth._login_key", return_value="test_key"):
            with patch("app.api.v1.auth._assert_not_locked"):
                with patch("app.api.v1.auth._reset_attempts"):
                    result = await login(
                        login_data=login_data,
                        response=mock_response,
                        request=mock_request,
                        db=mock_db_session
                    )

        assert result.access_token is not None
        assert result.token_type == "bearer"
        mock_response.set_cookie.assert_called_once()

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, mock_db_session, mock_request):
        """Invalid credentials should return 401."""
        from app.api.v1.auth import login
        from app.schemas.token import LoginRequest
        from unittest.mock import patch, AsyncMock

        # Mock database query returning None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_response = MagicMock()
        login_data = LoginRequest(username="nonexistent", password="password")

        with patch("app.api.v1.auth._login_key", return_value="test_key"):
            with patch("app.api.v1.auth._assert_not_locked"):
                with patch("app.api.v1.auth._register_failed_attempt"):
                    with pytest.raises(HTTPException) as exc_info:
                        await login(
                            login_data=login_data,
                            response=mock_response,
                            request=mock_request,
                            db=mock_db_session
                        )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_login_inactive_user(self, mock_db_session, mock_inactive_user, mock_request):
        """Inactive user should return 403."""
        from app.api.v1.auth import login
        from app.schemas.token import LoginRequest
        from app.core.security import get_password_hash
        from unittest.mock import patch, AsyncMock

        mock_inactive_user.hashed_password = get_password_hash("password")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_inactive_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_response = MagicMock()
        login_data = LoginRequest(username="inactive", password="password")

        with patch("app.api.v1.auth._login_key", return_value="test_key"):
            with patch("app.api.v1.auth._assert_not_locked"):
                with pytest.raises(HTTPException) as exc_info:
                    await login(
                        login_data=login_data,
                        response=mock_response,
                        request=mock_request,
                        db=mock_db_session
                    )

        assert exc_info.value.status_code == 403
        assert "Inactive" in exc_info.value.detail


class TestRegisterEndpoint:
    """Test user registration endpoint."""

    @pytest.mark.asyncio
    async def test_register_success(self, mock_db_session):
        """Successful registration should create user."""
        from app.api.v1.auth import register
        from app.schemas.user import UserCreate
        from unittest.mock import patch, AsyncMock

        # Mock no existing user
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        user_data = UserCreate(
            email="newuser@example.com",
            username="newuser",
            password="SecurePass123!",
            full_name="New User"
        )

        with patch("app.api.v1.auth._validate_password_policy"):
            result = await register(user_in=user_data, db=mock_db_session)

        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, mock_db_session, mock_user):
        """Duplicate email should return 400."""
        from app.api.v1.auth import register
        from app.schemas.user import UserCreate
        from unittest.mock import patch, AsyncMock

        # Mock existing user with same email
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        user_data = UserCreate(
            email="test@example.com",  # Same as mock_user
            username="differentuser",
            password="SecurePass123!",
            full_name="New User"
        )

        with patch("app.api.v1.auth._validate_password_policy"):
            with pytest.raises(HTTPException) as exc_info:
                await register(user_in=user_data, db=mock_db_session)

        assert exc_info.value.status_code == 400


class TestLogoutEndpoint:
    """Test logout endpoint."""

    @pytest.mark.asyncio
    async def test_logout_clears_cookie(self, mock_user, mock_db_session):
        """Logout should clear the access_token cookie."""
        from app.api.v1.auth import logout

        mock_response = MagicMock()
        mock_request = MagicMock()
        mock_request.cookies = {}

        # Mock the blacklist and token revocation functions
        with patch("app.api.v1.auth.blacklist_token_async", new_callable=AsyncMock):
            with patch("app.api.v1.auth._revoke_all_user_tokens", new_callable=AsyncMock):
                result = await logout(
                    response=mock_response,
                    request=mock_request,
                    db=mock_db_session,
                    token="dummy-token",
                    current_user=mock_user
                )

        mock_response.delete_cookie.assert_called()
        assert result["message"] == "Successfully logged out"


class TestMeEndpoint:
    """Test current user retrieval endpoint."""

    @pytest.mark.asyncio
    async def test_me_returns_current_user(self, mock_user):
        """Me endpoint should return current user data."""
        from app.api.v1.auth import read_users_me

        result = await read_users_me(current_user=mock_user)

        assert result.id == mock_user.id
        assert result.email == mock_user.email
        assert result.username == mock_user.username


class TestDependencies:
    """Test authentication dependencies."""

    @pytest.mark.asyncio
    async def test_get_current_user_valid_token(self, mock_db_session, mock_user, valid_jwt_token):
        """Valid token should return user."""
        from app.api.deps import get_current_user
        from unittest.mock import AsyncMock, MagicMock

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock()
        mock_request.cookies = {}

        user = await get_current_user(
            db=mock_db_session,
            token=valid_jwt_token,
            request=mock_request
        )

        assert user == mock_user

    @pytest.mark.asyncio
    async def test_get_current_user_no_token(self, mock_db_session):
        """No token should raise 401."""
        from app.api.deps import get_current_user

        mock_request = MagicMock()
        mock_request.cookies = {}

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                db=mock_db_session,
                token=None,
                request=mock_request
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_from_cookie(self, mock_db_session, mock_user, valid_jwt_token):
        """Token from cookie should work."""
        from app.api.deps import get_current_user
        from unittest.mock import AsyncMock, MagicMock

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock()
        mock_request.cookies = {"access_token": valid_jwt_token}

        user = await get_current_user(
            db=mock_db_session,
            token=None,  # No header token
            request=mock_request
        )

        assert user == mock_user

    @pytest.mark.asyncio
    async def test_get_current_superuser_non_super(self, mock_user):
        """Non-superuser should raise 403."""
        from app.api.deps import get_current_superuser

        mock_user.is_superuser = False

        with pytest.raises(HTTPException) as exc_info:
            await get_current_superuser(current_user=mock_user)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_get_current_superuser_success(self, mock_superuser):
        """Superuser should be returned."""
        from app.api.deps import get_current_superuser

        user = await get_current_superuser(current_user=mock_superuser)

        assert user == mock_superuser
        assert user.is_superuser is True
