from datetime import timedelta, datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db, get_current_user, get_current_active_user, oauth2_scheme, get_user_permissions, get_user_role
from app.core.config import settings
from app.core.security import create_access_token, verify_password, get_password_hash
from app.core.token_blacklist import blacklist_token
from app.core.login_tracker import get_login_tracker
from app.models.user import User
from app.models.auth import Role, UserRole, UserAccount
from app.schemas.token import Token, LoginRequest, LoginResponse
from app.schemas.user import User as UserSchema, UserCreate
from sqlalchemy import or_

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


@router.post("/login", response_model=LoginResponse)
async def login(
    login_data: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    key = _login_key(login_data.username, request)
    await _assert_not_locked(key)

    # Try to find user by username or email
    result = await db.execute(
        select(User).filter(
            (User.username == login_data.username) | (User.email == login_data.username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
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
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
    key = _login_key(form_data.username, request)
    await _assert_not_locked(key)

    # Try to find user by username or email
    result = await db.execute(
        select(User).filter(
            (User.username == form_data.username) | (User.email == form_data.username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
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
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Logout current user.
    Blacklists the current token to prevent reuse until expiration.
    """
    # Get the token from Authorization header or cookies
    actual_token = token
    if not actual_token:
        actual_token = request.cookies.get("access_token") or request.cookies.get("churnvision_access_token")
        if actual_token and actual_token.lower().startswith("bearer "):
            actual_token = actual_token.split(" ", 1)[1]

    # Blacklist the token if we have one
    if actual_token:
        # Token expires at ACCESS_TOKEN_EXPIRE_MINUTES from now (worst case)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        blacklist_token(actual_token, expires_at)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("churnvision_access_token", path="/")
    return {"message": "Successfully logged out"}


@router.post("/refresh", response_model=Token)
async def refresh_token(
    response: Response,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Refresh access token.
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
