from datetime import datetime, timedelta
from typing import Any, Optional, Tuple
import hashlib
import secrets
import bcrypt
from jose import jwt
from app.core.config import settings


def create_access_token(subject: str | Any, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        subject: The subject of the token (usually user ID)
        expires_delta: Optional expiration time delta

    Returns:
        Encoded JWT token
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def _prepare_password(password: str) -> bytes:
    """
    Prepare password for bcrypt by encoding and truncating to 72 bytes.

    Args:
        password: Plain text password

    Returns:
        Password bytes truncated to 72 bytes (bcrypt limit)
    """
    return password.encode('utf-8')[:72]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a hashed password.

    Args:
        plain_password: The plain text password
        hashed_password: The hashed password from database

    Returns:
        True if password matches, False otherwise
    """
    return bcrypt.checkpw(
        _prepare_password(plain_password),
        hashed_password.encode('utf-8')
    )


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(_prepare_password(password), salt)
    return hashed.decode('utf-8')


def create_refresh_token() -> Tuple[str, str]:
    """
    Create a secure refresh token.

    Returns:
        Tuple of (raw_token, token_hash):
        - raw_token: The token to send to the client (43 chars, URL-safe)
        - token_hash: SHA256 hash to store in the database (64 chars)
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash


def hash_refresh_token(raw_token: str) -> str:
    """
    Hash a raw refresh token for database lookup.

    Args:
        raw_token: The raw token received from the client

    Returns:
        SHA256 hash of the token
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()


def get_refresh_token_expire_time() -> datetime:
    """
    Get the expiration time for a refresh token.

    Returns:
        Datetime when the refresh token expires
    """
    days = getattr(settings, 'REFRESH_TOKEN_EXPIRE_DAYS', 7)
    return datetime.utcnow() + timedelta(days=days)
