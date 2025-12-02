from datetime import timedelta, datetime
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db, get_current_user, get_current_active_user
from app.core.config import settings
from app.core.security import create_access_token, verify_password, get_password_hash
from app.models.user import User
from app.schemas.token import Token, LoginRequest, LoginResponse
from app.schemas.user import User as UserSchema, UserCreate

router = APIRouter()

# In-memory rate limiting buckets (per user + IP)
_FAILED_LOGIN_ATTEMPTS: Dict[str, List[datetime]] = {}
_LOCKED_UNTIL: Dict[str, datetime] = {}


def _login_key(username: str, request: Request | None) -> str:
    client_ip = request.client.host if request and request.client else "unknown"
    return f"{username.lower()}::{client_ip}"


def _prune_attempts(key: str) -> None:
    """Drop attempts outside the configured window."""
    window = timedelta(minutes=settings.LOGIN_ATTEMPT_WINDOW_MINUTES)
    cutoff = datetime.utcnow() - window
    attempts = _FAILED_LOGIN_ATTEMPTS.get(key, [])
    _FAILED_LOGIN_ATTEMPTS[key] = [ts for ts in attempts if ts >= cutoff]


def _assert_not_locked(key: str):
    locked_until = _LOCKED_UNTIL.get(key)
    if locked_until and locked_until > datetime.utcnow():
        remaining = int((locked_until - datetime.utcnow()).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {remaining} minutes."
        )
    # Expired locks are cleared
    if locked_until:
        _LOCKED_UNTIL.pop(key, None)


def _register_failed_attempt(key: str):
    _prune_attempts(key)
    _FAILED_LOGIN_ATTEMPTS.setdefault(key, []).append(datetime.utcnow())
    if len(_FAILED_LOGIN_ATTEMPTS[key]) >= settings.LOGIN_MAX_ATTEMPTS:
        lockout = datetime.utcnow() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        _LOCKED_UNTIL[key] = lockout
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to repeated failures. Please wait before retrying."
        )


def _reset_attempts(key: str):
    _FAILED_LOGIN_ATTEMPTS.pop(key, None)
    _LOCKED_UNTIL.pop(key, None)


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
    _assert_not_locked(key)

    # Try to find user by username or email
    result = await db.execute(
        select(User).filter(
            (User.username == login_data.username) | (User.email == login_data.username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        _register_failed_attempt(key)
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

    _reset_attempts(key)

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
    _assert_not_locked(key)

    # Try to find user by username or email
    result = await db.execute(
        select(User).filter(
            (User.username == form_data.username) | (User.email == form_data.username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        _register_failed_attempt(key)
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

    _reset_attempts(key)

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
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Logout current user.
    Note: With JWT tokens, logout is typically handled client-side by removing the token.
    This endpoint is provided for consistency and can be extended with token blacklisting.
    """
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
