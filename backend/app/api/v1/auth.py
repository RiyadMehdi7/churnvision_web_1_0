from datetime import timedelta, datetime
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.api.deps import get_db, get_current_user, get_current_active_user, oauth2_scheme, get_user_permissions, get_user_role
from app.core.config import settings
from app.core.security import (
    create_access_token,
    verify_password,
    get_password_hash,
    create_refresh_token,
    hash_refresh_token,
    get_refresh_token_expire_time,
)
from app.core.token_blacklist import blacklist_token
from app.core.login_tracker import get_login_tracker
from app.models.user import User
from app.models.auth import Role, UserRole, UserAccount
from app.models.refresh_token import RefreshToken as RefreshTokenModel
from app.schemas.token import Token, LoginRequest, LoginResponse, TokenRefreshRequest, TokenRefreshResponse
from app.schemas.user import User as UserSchema, UserCreate

router = APIRouter()


def _login_key(username: str, request: Request | None) -> str:
    """Generate a unique key for login tracking (username + client IP)."""
    client_ip = request.client.host if request and request.client else "unknown"
    return f"{username.lower()}::{client_ip}"


async def _assert_not_locked(key: str) -> None:
    """Check if account is locked and raise HTTPException if so."""
    tracker = get_login_tracker()
    is_locked, remaining_seconds = await tracker.is_locked(key)
    if is_locked:
        remaining_minutes = (remaining_seconds // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {remaining_minutes} minutes."
        )


async def _register_failed_attempt(key: str) -> None:
    """Record a failed login attempt and lock account if threshold reached."""
    tracker = get_login_tracker()
    attempt_count = await tracker.record_failed_attempt(key)

    if attempt_count >= settings.LOGIN_MAX_ATTEMPTS:
        lockout_seconds = settings.LOGIN_LOCKOUT_MINUTES * 60
        await tracker.set_locked(key, lockout_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to repeated failures. Please wait before retrying."
        )


async def _reset_attempts(key: str) -> None:
    """Reset login attempts on successful authentication."""
    tracker = get_login_tracker()
    await tracker.reset(key)


def _validate_password_policy(password: str) -> None:
    """Enforce password policy configured in settings."""
    if len(password) < settings.MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.MIN_PASSWORD_LENGTH} characters long."
        )
    if settings.REQUIRE_SPECIAL_CHARS and not any(not c.isalnum() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include at least one special character."
        )


async def _create_and_store_refresh_token(
    db: AsyncSession,
    user_id: int,
    request: Optional[Request] = None
) -> tuple[str, datetime]:
    """
    Create a new refresh token and store its hash in the database.

    Args:
        db: Database session
        user_id: User ID to associate with the token
        request: Optional request for device/IP tracking

    Returns:
        Tuple of (raw_token, expires_at)
    """
    raw_token, token_hash = create_refresh_token()
    expires_at = get_refresh_token_expire_time()

    # Get device info and IP if available
    device_info = None
    ip_address = None
    if request:
        ip_address = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not ip_address:
            ip_address = request.headers.get("X-Real-IP")
        if not ip_address and request.client:
            ip_address = request.client.host
        device_info = request.headers.get("User-Agent", "")[:255]

    # Store the hashed token
    refresh_token_record = RefreshTokenModel(
        token_hash=token_hash,
        user_id=user_id,
        expires_at=expires_at,
        device_info=device_info,
        ip_address=ip_address,
    )
    db.add(refresh_token_record)
    await db.commit()

    return raw_token, expires_at


async def _revoke_refresh_token(db: AsyncSession, token_hash: str) -> bool:
    """
    Revoke a refresh token by its hash.

    Returns:
        True if token was found and revoked, False otherwise
    """
    result = await db.execute(
        select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
    )
    token_record = result.scalar_one_or_none()

    if token_record:
        token_record.revoke()
        await db.commit()
        return True
    return False


async def _revoke_all_user_tokens(db: AsyncSession, user_id: int) -> int:
    """
    Revoke all refresh tokens for a user.

    Returns:
        Number of tokens revoked
    """
    result = await db.execute(
        select(RefreshTokenModel).where(
            RefreshTokenModel.user_id == user_id,
            RefreshTokenModel.revoked_at.is_(None)
        )
    )
    tokens = result.scalars().all()

    count = 0
    for token in tokens:
        token.revoke()
        count += 1

    if count > 0:
        await db.commit()

    return count


async def _authenticate_user(
    username: str,
    password: str,
    db: AsyncSession,
    request: Request | None = None
) -> tuple[User, str]:
    """
    Authenticate a user and return the user object and access token.

    This consolidates the shared logic between /login and /login/oauth2 endpoints.

    Args:
        username: Username or email
        password: Plain text password
        db: Database session
        request: Optional request for IP tracking

    Returns:
        Tuple of (authenticated User, access_token string)

    Raises:
        HTTPException: If authentication fails
    """
    key = _login_key(username, request)
    await _assert_not_locked(key)

    # Try to find user by username or email
    result = await db.execute(
        select(User).filter(
            (User.username == username) | (User.email == username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        await _register_failed_attempt(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Update last login time
    user.last_login = datetime.utcnow()
    await db.commit()

    await _reset_attempts(key)

    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )

    return user, access_token


@router.post("/login", response_model=LoginResponse)
async def login(
    login_data: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    OAuth2 compatible token login, get access and refresh tokens for future requests.

    Returns both an access token (short-lived, 30 min) and a refresh token (long-lived, 7 days).
    Use the refresh token to get new access tokens without re-authenticating.
    """
    user, access_token = await _authenticate_user(
        login_data.username, login_data.password, db, request
    )

    # Create refresh token
    raw_refresh_token, refresh_expires_at = await _create_and_store_refresh_token(
        db, user.id, request
    )
    refresh_expires_in = int((refresh_expires_at - datetime.utcnow()).total_seconds())

    # Also set an HTTP-only cookie so the frontend remains authenticated even if headers are dropped
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=refresh_expires_in,
        user={
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "tenant_id": user.tenant_id,
        }
    )


@router.post("/login/oauth2", response_model=Token)
async def login_oauth2(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    OAuth2 compatible token login using form data.
    This endpoint is used by FastAPI's automatic interactive API docs.
    """
    _, access_token = await _authenticate_user(
        form_data.username, form_data.password, db, request
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/register", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Register a new user.
    """
    _validate_password_policy(user_in.password)

    # Check if user already exists
    result = await db.execute(
        select(User).filter(
            (User.email == user_in.email) | (User.username == user_in.username)
        )
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        if existing_user.email == user_in.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        if existing_user.username == user_in.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )

    # Create new user
    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        is_active=user_in.is_active,
        tenant_id=user_in.tenant_id,
        is_superuser=False,  # New users are not superusers by default
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.get("/me", response_model=UserSchema)
async def read_users_me(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get current authenticated user.
    """
    return current_user


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Logout current user.
    Blacklists the current access token and revokes all refresh tokens.
    """
    # Get the token from Authorization header or cookies
    actual_token = token
    if not actual_token:
        actual_token = request.cookies.get("access_token") or request.cookies.get("churnvision_access_token")
        if actual_token and actual_token.lower().startswith("bearer "):
            actual_token = actual_token.split(" ", 1)[1]

    # Blacklist the access token if we have one
    if actual_token:
        # Token expires at ACCESS_TOKEN_EXPIRE_MINUTES from now (worst case)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        blacklist_token(actual_token, expires_at)

    # Revoke all refresh tokens for this user
    await _revoke_all_user_tokens(db, current_user.id)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("churnvision_access_token", path="/")
    return {"message": "Successfully logged out"}


@router.post("/token/refresh", response_model=TokenRefreshResponse)
async def token_refresh(
    refresh_request: TokenRefreshRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Refresh access token using a refresh token.

    This endpoint does NOT require a valid access token - only a valid refresh token.
    Implements token rotation: the old refresh token is revoked and a new one is issued.
    """
    # Hash the provided token to look it up
    token_hash = hash_refresh_token(refresh_request.refresh_token)

    # Find the token in database
    result = await db.execute(
        select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
    )
    token_record = result.scalar_one_or_none()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token is valid
    if not token_record.is_valid():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired or been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get the user
    user_result = await db.execute(
        select(User).where(User.id == token_record.user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user or not user.is_active:
        # Revoke the token if user doesn't exist or is inactive
        token_record.revoke()
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Revoke the old refresh token (token rotation)
    token_record.revoke()

    # Create new access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )

    # Create new refresh token (rotation)
    new_raw_refresh_token, refresh_expires_at = await _create_and_store_refresh_token(
        db, user.id, request
    )
    refresh_expires_in = int((refresh_expires_at - datetime.utcnow()).total_seconds())

    # Set cookie for the new access token
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    return TokenRefreshResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_expires_in=refresh_expires_in,
    )


@router.post("/refresh", response_model=Token, deprecated=True)
async def refresh_token_legacy(
    response: Response,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    DEPRECATED: Use /token/refresh instead.

    Refresh access token (requires valid access token).
    This endpoint is kept for backwards compatibility.
    """
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=current_user.id, expires_delta=access_token_expires
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.get("/me/extended")
async def read_users_me_extended(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get current authenticated user with role and permissions.
    """
    # Get role
    role_id = await get_user_role(db, current_user)
    role_info = None

    if role_id:
        role_result = await db.execute(
            select(Role).where(Role.role_id == role_id)
        )
        role = role_result.scalar_one_or_none()
        if role:
            role_info = {
                "role_id": role.role_id,
                "role_name": role.role_name,
                "description": role.description
            }

    # Get permissions
    permissions = await get_user_permissions(db, current_user)

    # Check if user is super admin in RBAC system
    is_admin = False
    result = await db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == str(current_user.id),
                UserAccount.username == current_user.username
            )
        )
    )
    user_account = result.scalar_one_or_none()
    if user_account:
        is_admin = user_account.is_super_admin == 1 or 'admin:access' in permissions

    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "tenant_id": current_user.tenant_id,
        "role": role_info,
        "permissions": permissions,
        "has_admin_access": is_admin
    }
