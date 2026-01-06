"""
Extended tests for app/core/security.py - Security utilities.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
from jose import jwt
import time


class TestCreateAccessToken:
    """Test JWT access token creation."""

    def test_creates_valid_token(self):
        """Should create a decodable JWT token."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject="123")

        # Token should be decodable
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == "123"
        assert "exp" in payload

    def test_token_contains_correct_subject(self):
        """Token should contain the provided subject."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject="user_42")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        assert payload["sub"] == "user_42"

    def test_token_with_custom_expiration(self):
        """Token should respect custom expiration delta."""
        from app.core.security import create_access_token
        from app.core.config import settings

        # Create token with 5 minute expiration
        delta = timedelta(minutes=5)
        token = create_access_token(subject="123", expires_delta=delta)

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp_time = datetime.utcfromtimestamp(payload["exp"])
        now = datetime.utcnow()

        # Expiration should be approximately 5 minutes from now
        time_diff = (exp_time - now).total_seconds()
        assert 290 < time_diff < 310  # Allow some tolerance

    def test_token_uses_default_expiration(self):
        """Token should use default expiration when not specified."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject="123")

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp_time = datetime.utcfromtimestamp(payload["exp"])
        now = datetime.utcnow()

        # Should use ACCESS_TOKEN_EXPIRE_MINUTES from settings
        expected_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        time_diff = (exp_time - now).total_seconds() / 60
        assert expected_minutes - 1 < time_diff < expected_minutes + 1

    def test_token_subject_converted_to_string(self):
        """Non-string subjects should be converted to string."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject=123)  # Integer
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        assert payload["sub"] == "123"
        assert isinstance(payload["sub"], str)


class TestPasswordHashing:
    """Test password hashing and verification."""

    def test_hash_password_returns_string(self):
        """Hashed password should be a string."""
        from app.core.security import get_password_hash

        hashed = get_password_hash("password123")

        assert isinstance(hashed, str)
        assert len(hashed) > 0

    def test_hash_password_is_different_from_input(self):
        """Hashed password should not equal the input."""
        from app.core.security import get_password_hash

        password = "mysecretpassword"
        hashed = get_password_hash(password)

        assert hashed != password

    def test_hash_password_produces_unique_hashes(self):
        """Same password should produce different hashes (due to salt)."""
        from app.core.security import get_password_hash

        password = "samepassword"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)

        assert hash1 != hash2

    def test_verify_correct_password(self):
        """Correct password should verify successfully."""
        from app.core.security import get_password_hash, verify_password

        password = "correctpassword123"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True

    def test_verify_incorrect_password(self):
        """Incorrect password should fail verification."""
        from app.core.security import get_password_hash, verify_password

        password = "correctpassword"
        hashed = get_password_hash(password)

        assert verify_password("wrongpassword", hashed) is False

    def test_verify_empty_password(self):
        """Empty password verification should work correctly."""
        from app.core.security import get_password_hash, verify_password

        password = ""
        hashed = get_password_hash(password)

        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False

    def test_verify_unicode_password(self):
        """Unicode passwords should be handled correctly."""
        from app.core.security import get_password_hash, verify_password

        password = "пароль123日本語"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True
        assert verify_password("different", hashed) is False

    def test_long_password_truncation(self):
        """Passwords longer than 72 bytes should be truncated."""
        from app.core.security import get_password_hash, verify_password

        # Create a password longer than 72 bytes
        long_password = "a" * 100
        hashed = get_password_hash(long_password)

        # Both the full password and truncated version should verify
        assert verify_password(long_password, hashed) is True
        # Due to truncation, passwords with same first 72 bytes verify the same
        truncated_same = "a" * 72
        assert verify_password(truncated_same, hashed) is True


class TestRefreshToken:
    """Test refresh token creation and hashing."""

    def test_create_refresh_token_returns_tuple(self):
        """Create refresh token should return a tuple of (raw, hash)."""
        from app.core.security import create_refresh_token

        result = create_refresh_token()

        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_refresh_token_raw_is_url_safe(self):
        """Raw refresh token should be URL-safe."""
        from app.core.security import create_refresh_token

        raw_token, _ = create_refresh_token()

        # URL-safe means no special characters that need encoding
        import re
        assert re.match(r'^[A-Za-z0-9_-]+$', raw_token)

    def test_refresh_token_hash_is_sha256(self):
        """Token hash should be 64 character SHA256 hex digest."""
        from app.core.security import create_refresh_token

        _, token_hash = create_refresh_token()

        assert len(token_hash) == 64
        # Should be valid hex
        int(token_hash, 16)

    def test_refresh_tokens_are_unique(self):
        """Each call should produce unique tokens."""
        from app.core.security import create_refresh_token

        results = [create_refresh_token() for _ in range(10)]
        raw_tokens = [r[0] for r in results]
        hashes = [r[1] for r in results]

        assert len(set(raw_tokens)) == 10
        assert len(set(hashes)) == 10

    def test_hash_refresh_token_produces_same_hash(self):
        """Hashing the same raw token should produce consistent hash."""
        from app.core.security import create_refresh_token, hash_refresh_token

        raw_token, expected_hash = create_refresh_token()
        computed_hash = hash_refresh_token(raw_token)

        assert computed_hash == expected_hash

    def test_hash_refresh_token_different_inputs(self):
        """Different inputs should produce different hashes."""
        from app.core.security import hash_refresh_token

        hash1 = hash_refresh_token("token1")
        hash2 = hash_refresh_token("token2")

        assert hash1 != hash2


class TestRefreshTokenExpiration:
    """Test refresh token expiration time calculation."""

    def test_get_refresh_token_expire_time_is_future(self):
        """Expiration time should be in the future."""
        from app.core.security import get_refresh_token_expire_time

        expire_time = get_refresh_token_expire_time()
        now = datetime.utcnow()

        assert expire_time > now

    def test_get_refresh_token_expire_time_uses_settings(self):
        """Should use REFRESH_TOKEN_EXPIRE_DAYS from settings."""
        from app.core.security import get_refresh_token_expire_time
        from app.core.config import settings

        expire_time = get_refresh_token_expire_time()
        now = datetime.utcnow()

        expected_days = getattr(settings, 'REFRESH_TOKEN_EXPIRE_DAYS', 7)
        expected_delta = timedelta(days=expected_days)

        # Allow 1 minute tolerance
        time_diff = expire_time - now
        assert expected_delta - timedelta(minutes=1) < time_diff < expected_delta + timedelta(minutes=1)
