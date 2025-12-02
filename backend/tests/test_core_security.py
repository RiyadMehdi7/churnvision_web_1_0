"""
Tests for app/core/security.py - Password hashing and JWT token management.
"""
import pytest
from datetime import timedelta
from jose import jwt, JWTError
from unittest.mock import patch


class TestPasswordHashing:
    """Test password hashing and verification."""

    def test_hash_password_returns_string(self):
        """get_password_hash should return a string."""
        from app.core.security import get_password_hash

        result = get_password_hash("testpassword")

        assert isinstance(result, str)
        assert len(result) > 0

    def test_hash_password_produces_bcrypt_hash(self):
        """Hash should be in bcrypt format ($2b$...)."""
        from app.core.security import get_password_hash

        result = get_password_hash("testpassword")

        assert result.startswith("$2b$")

    def test_hash_password_is_unique(self):
        """Same password should produce different hashes (due to salt)."""
        from app.core.security import get_password_hash

        hash1 = get_password_hash("testpassword")
        hash2 = get_password_hash("testpassword")

        assert hash1 != hash2

    def test_verify_password_correct(self):
        """verify_password should return True for correct password."""
        from app.core.security import get_password_hash, verify_password

        password = "correct_password"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """verify_password should return False for incorrect password."""
        from app.core.security import get_password_hash, verify_password

        hashed = get_password_hash("correct_password")

        assert verify_password("wrong_password", hashed) is False

    def test_verify_password_empty(self):
        """verify_password should handle empty passwords correctly."""
        from app.core.security import get_password_hash, verify_password

        hashed = get_password_hash("some_password")

        assert verify_password("", hashed) is False

    def test_verify_password_unicode(self):
        """verify_password should handle unicode passwords."""
        from app.core.security import get_password_hash, verify_password

        password = "пароль123!@#"  # Russian characters
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_password_long(self):
        """verify_password should handle long passwords."""
        from app.core.security import get_password_hash, verify_password

        password = "a" * 100
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True


class TestJWTTokenCreation:
    """Test JWT access token creation."""

    def test_create_access_token_returns_string(self):
        """create_access_token should return a string."""
        from app.core.security import create_access_token

        token = create_access_token(subject="user123")

        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_access_token_is_valid_jwt(self):
        """Token should be a valid JWT that can be decoded."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject="user123")

        # Should not raise
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        assert payload["sub"] == "user123"
        assert "exp" in payload

    def test_create_access_token_with_custom_expiry(self):
        """Token should use custom expiration when provided."""
        from app.core.security import create_access_token
        from app.core.config import settings
        from datetime import datetime

        token = create_access_token(
            subject="user123",
            expires_delta=timedelta(hours=2)
        )

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        # Expiration should be approximately 2 hours from now
        exp_time = datetime.utcfromtimestamp(payload["exp"])
        now = datetime.utcnow()
        diff = exp_time - now

        assert timedelta(hours=1, minutes=50) < diff < timedelta(hours=2, minutes=10)

    def test_create_access_token_default_expiry(self):
        """Token should use default expiration from settings."""
        from app.core.security import create_access_token
        from app.core.config import settings
        from datetime import datetime

        token = create_access_token(subject="user123")

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        exp_time = datetime.utcfromtimestamp(payload["exp"])
        now = datetime.utcnow()
        diff = exp_time - now

        # Should be close to ACCESS_TOKEN_EXPIRE_MINUTES
        expected_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        assert diff < timedelta(minutes=expected_minutes + 1)
        assert diff > timedelta(minutes=expected_minutes - 1)

    def test_create_access_token_integer_subject(self):
        """Subject can be an integer (user ID)."""
        from app.core.security import create_access_token
        from app.core.config import settings

        token = create_access_token(subject=12345)

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        assert payload["sub"] == "12345"

    def test_token_cannot_be_decoded_with_wrong_secret(self):
        """Token should not decode with incorrect secret key."""
        from app.core.security import create_access_token

        token = create_access_token(subject="user123")

        with pytest.raises(JWTError):
            jwt.decode(token, "wrong-secret-key", algorithms=["HS256"])

    def test_expired_token_raises_error(self):
        """Expired token should raise error on decode."""
        from app.core.security import create_access_token
        from app.core.config import settings

        # Create token that's already expired
        token = create_access_token(
            subject="user123",
            expires_delta=timedelta(seconds=-10)
        )

        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


class TestJWTTokenFormat:
    """Test JWT token format and structure."""

    def test_token_has_three_parts(self):
        """JWT token should have header.payload.signature format."""
        from app.core.security import create_access_token

        token = create_access_token(subject="user123")

        parts = token.split(".")
        assert len(parts) == 3

    def test_token_uses_hs256_algorithm(self):
        """Token should use HS256 algorithm."""
        from app.core.security import create_access_token
        import base64
        import json

        token = create_access_token(subject="user123")

        # Decode header (first part)
        header_b64 = token.split(".")[0]
        # Add padding if needed
        header_b64 += "=" * (4 - len(header_b64) % 4)
        header = json.loads(base64.urlsafe_b64decode(header_b64))

        assert header["alg"] == "HS256"
        assert header["typ"] == "JWT"
