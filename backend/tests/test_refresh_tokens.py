"""
Tests for refresh token functionality.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch


class TestRefreshTokenSecurity:
    """Test refresh token security functions."""

    def test_create_refresh_token_returns_tuple(self):
        """create_refresh_token should return (raw_token, hash)."""
        from app.core.security import create_refresh_token

        raw_token, token_hash = create_refresh_token()

        assert isinstance(raw_token, str)
        assert isinstance(token_hash, str)
        assert len(raw_token) == 43  # Base64 URL-safe encoding of 32 bytes
        assert len(token_hash) == 64  # SHA256 hex digest

    def test_create_refresh_token_unique(self):
        """Each call should produce unique tokens."""
        from app.core.security import create_refresh_token

        tokens = [create_refresh_token() for _ in range(10)]
        raw_tokens = [t[0] for t in tokens]
        hashes = [t[1] for t in tokens]

        assert len(set(raw_tokens)) == 10
        assert len(set(hashes)) == 10

    def test_hash_refresh_token_deterministic(self):
        """hash_refresh_token should produce consistent hash."""
        from app.core.security import hash_refresh_token

        raw = "test_token_value"
        hash1 = hash_refresh_token(raw)
        hash2 = hash_refresh_token(raw)

        assert hash1 == hash2
        assert len(hash1) == 64

    def test_hash_matches_creation(self):
        """hash_refresh_token should produce same hash as create_refresh_token."""
        from app.core.security import create_refresh_token, hash_refresh_token

        raw_token, original_hash = create_refresh_token()
        computed_hash = hash_refresh_token(raw_token)

        assert computed_hash == original_hash

    def test_get_refresh_token_expire_time(self):
        """Should return datetime 7 days in future by default."""
        from app.core.security import get_refresh_token_expire_time

        before = datetime.utcnow()
        expire_time = get_refresh_token_expire_time()
        after = datetime.utcnow()

        # Should be approximately 7 days from now
        expected_min = before + timedelta(days=6, hours=23)
        expected_max = after + timedelta(days=7, hours=1)

        assert expected_min < expire_time < expected_max


class TestRefreshTokenModel:
    """Test the RefreshToken model."""

    def test_is_valid_returns_true_for_valid_token(self):
        """Valid token should return True."""
        from app.models.refresh_token import RefreshToken

        token = RefreshToken(
            token_hash="test_hash",
            user_id=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
            revoked_at=None
        )

        assert token.is_valid() is True

    def test_is_valid_returns_false_for_expired_token(self):
        """Expired token should return False."""
        from app.models.refresh_token import RefreshToken

        token = RefreshToken(
            token_hash="test_hash",
            user_id=1,
            expires_at=datetime.utcnow() - timedelta(hours=1),
            revoked_at=None
        )

        assert token.is_valid() is False

    def test_is_valid_returns_false_for_revoked_token(self):
        """Revoked token should return False."""
        from app.models.refresh_token import RefreshToken

        token = RefreshToken(
            token_hash="test_hash",
            user_id=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
            revoked_at=datetime.utcnow()
        )

        assert token.is_valid() is False

    def test_revoke_sets_revoked_at(self):
        """revoke() should set revoked_at timestamp."""
        from app.models.refresh_token import RefreshToken

        token = RefreshToken(
            token_hash="test_hash",
            user_id=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
            revoked_at=None
        )

        assert token.revoked_at is None

        token.revoke()

        assert token.revoked_at is not None
        assert isinstance(token.revoked_at, datetime)


class TestRefreshTokenSchemas:
    """Test refresh token schemas."""

    def test_login_response_includes_refresh_token(self):
        """LoginResponse should accept refresh_token."""
        from app.schemas.token import LoginResponse

        response = LoginResponse(
            access_token="access_123",
            refresh_token="refresh_456",
            token_type="bearer",
            expires_in=1800,
            refresh_expires_in=604800,
            user={"id": 1, "username": "test"}
        )

        assert response.refresh_token == "refresh_456"
        assert response.refresh_expires_in == 604800

    def test_login_response_refresh_token_optional(self):
        """LoginResponse should work without refresh_token for backwards compat."""
        from app.schemas.token import LoginResponse

        response = LoginResponse(
            access_token="access_123",
            token_type="bearer",
            expires_in=1800,
            user={"id": 1, "username": "test"}
        )

        assert response.refresh_token is None

    def test_token_refresh_request(self):
        """TokenRefreshRequest should require refresh_token."""
        from app.schemas.token import TokenRefreshRequest

        request = TokenRefreshRequest(refresh_token="test_token")

        assert request.refresh_token == "test_token"

    def test_token_refresh_response(self):
        """TokenRefreshResponse should include both tokens."""
        from app.schemas.token import TokenRefreshResponse

        response = TokenRefreshResponse(
            access_token="new_access",
            refresh_token="new_refresh",
            token_type="bearer",
            expires_in=1800,
            refresh_expires_in=604800
        )

        assert response.access_token == "new_access"
        assert response.refresh_token == "new_refresh"


class TestRefreshTokenEndpoint:
    """Test the /token/refresh endpoint."""

    @pytest.fixture
    def mock_refresh_token_record(self):
        """Create a mock refresh token record."""
        token = MagicMock()
        token.token_hash = "mock_hash"
        token.user_id = 1
        token.expires_at = datetime.utcnow() + timedelta(days=7)
        token.revoked_at = None
        token.is_valid = MagicMock(return_value=True)
        token.revoke = MagicMock()
        return token

    @pytest.mark.asyncio
    async def test_refresh_with_valid_token(self, mock_db_session, mock_user, mock_refresh_token_record, mock_request):
        """Valid refresh token should return new tokens."""
        from app.api.v1.auth import token_refresh
        from app.schemas.token import TokenRefreshRequest

        # Mock database queries
        token_result = MagicMock()
        token_result.scalar_one_or_none.return_value = mock_refresh_token_record

        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = mock_user

        mock_db_session.execute = AsyncMock(side_effect=[token_result, user_result])

        mock_response = MagicMock()
        refresh_request = TokenRefreshRequest(refresh_token="valid_refresh_token")

        with patch('app.api.v1.auth._create_and_store_refresh_token') as mock_create:
            mock_create.return_value = ("new_refresh_token", datetime.utcnow() + timedelta(days=7))

            result = await token_refresh(
                refresh_request=refresh_request,
                response=mock_response,
                request=mock_request,
                db=mock_db_session
            )

        assert result.access_token is not None
        assert result.refresh_token == "new_refresh_token"
        mock_refresh_token_record.revoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_refresh_with_invalid_token(self, mock_db_session, mock_request):
        """Invalid refresh token should return 401."""
        from app.api.v1.auth import token_refresh
        from app.schemas.token import TokenRefreshRequest
        from fastapi import HTTPException

        # Mock no token found
        token_result = MagicMock()
        token_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=token_result)

        mock_response = MagicMock()
        refresh_request = TokenRefreshRequest(refresh_token="invalid_token")

        with pytest.raises(HTTPException) as exc_info:
            await token_refresh(
                refresh_request=refresh_request,
                response=mock_response,
                request=mock_request,
                db=mock_db_session
            )

        assert exc_info.value.status_code == 401
        assert "Invalid refresh token" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_refresh_with_expired_token(self, mock_db_session, mock_request):
        """Expired refresh token should return 401."""
        from app.api.v1.auth import token_refresh
        from app.schemas.token import TokenRefreshRequest
        from fastapi import HTTPException

        # Create expired token record
        expired_token = MagicMock()
        expired_token.is_valid = MagicMock(return_value=False)

        token_result = MagicMock()
        token_result.scalar_one_or_none.return_value = expired_token
        mock_db_session.execute = AsyncMock(return_value=token_result)

        mock_response = MagicMock()
        refresh_request = TokenRefreshRequest(refresh_token="expired_token")

        with pytest.raises(HTTPException) as exc_info:
            await token_refresh(
                refresh_request=refresh_request,
                response=mock_response,
                request=mock_request,
                db=mock_db_session
            )

        assert exc_info.value.status_code == 401
        assert "expired or been revoked" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_refresh_with_inactive_user(self, mock_db_session, mock_refresh_token_record, mock_request):
        """Refresh for inactive user should return 401."""
        from app.api.v1.auth import token_refresh
        from app.schemas.token import TokenRefreshRequest
        from fastapi import HTTPException

        # Mock inactive user
        inactive_user = MagicMock()
        inactive_user.is_active = False

        token_result = MagicMock()
        token_result.scalar_one_or_none.return_value = mock_refresh_token_record

        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = inactive_user

        mock_db_session.execute = AsyncMock(side_effect=[token_result, user_result])

        mock_response = MagicMock()
        refresh_request = TokenRefreshRequest(refresh_token="valid_token")

        with pytest.raises(HTTPException) as exc_info:
            await token_refresh(
                refresh_request=refresh_request,
                response=mock_response,
                request=mock_request,
                db=mock_db_session
            )

        assert exc_info.value.status_code == 401
        mock_refresh_token_record.revoke.assert_called_once()


class TestLoginWithRefreshToken:
    """Test login endpoint returns refresh token."""

    @pytest.mark.asyncio
    async def test_login_returns_refresh_token(self, mock_db_session, mock_user, mock_request):
        """Login should return both access and refresh tokens."""
        from app.api.v1.auth import login
        from app.schemas.token import LoginRequest
        from app.core.security import get_password_hash

        # Setup mock user
        mock_user.hashed_password = get_password_hash("correct_password")
        mock_user.full_name = "Test User"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_response = MagicMock()
        login_data = LoginRequest(username="testuser", password="correct_password")

        with patch('app.api.v1.auth._login_key', return_value="test_key"):
            with patch('app.api.v1.auth._assert_not_locked'):
                with patch('app.api.v1.auth._reset_attempts'):
                    with patch('app.api.v1.auth._create_and_store_refresh_token') as mock_create:
                        mock_create.return_value = ("refresh_token_123", datetime.utcnow() + timedelta(days=7))

                        result = await login(
                            login_data=login_data,
                            response=mock_response,
                            request=mock_request,
                            db=mock_db_session
                        )

        assert result.access_token is not None
        assert result.refresh_token == "refresh_token_123"
        assert result.refresh_expires_in is not None


class TestLogoutRevokesTokens:
    """Test logout revokes refresh tokens."""

    @pytest.mark.asyncio
    async def test_logout_revokes_all_refresh_tokens(self, mock_db_session, mock_user, mock_request):
        """Logout should revoke all user's refresh tokens."""
        from app.api.v1.auth import logout

        mock_response = MagicMock()

        with patch('app.api.v1.auth._revoke_all_user_tokens') as mock_revoke:
            mock_revoke.return_value = 3

            result = await logout(
                response=mock_response,
                request=mock_request,
                db=mock_db_session,
                token="test_access_token",
                current_user=mock_user
            )

        mock_revoke.assert_called_once_with(mock_db_session, mock_user.id)
        assert result["message"] == "Successfully logged out"
