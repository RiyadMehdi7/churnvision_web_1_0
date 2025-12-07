from typing import AsyncGenerator, Optional, List, Callable
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.token_blacklist import is_token_blacklisted
from app.models.user import User
from app.models.auth import UserAccount, UserRole, RolePermission, Permission
from app.schemas.token import TokenPayload

# Allow graceful handling when Authorization header is absent so we can fall back to cookies
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    request: Request = None
) -> User:
    """
    Get the current authenticated user from JWT token.

    Args:
        db: Database session
        token: JWT access token
        request: Incoming request (used for cookie fallback)

    Returns:
        Current authenticated user

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # If no Authorization header was provided, fall back to a secure cookie
    if not token and request:
        token = request.cookies.get("access_token") or request.cookies.get("churnvision_access_token")
        # Support "Bearer <token>" value stored in cookie if present
        if token and token.lower().startswith("bearer "):
            token = token.split(" ", 1)[1]

    if not token:
        raise credentials_exception

    # Check if token has been blacklisted (e.g., after logout)
    if is_token_blacklisted(token):
        raise credentials_exception

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: Optional[int] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=user_id)
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).filter(User.id == token_data.sub))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get the current active user.

    Args:
        current_user: Current user from token

    Returns:
        Active user

    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get the current superuser.

    Args:
        current_user: Current user from token

    Returns:
        Superuser

    Raises:
        HTTPException: If user is not a superuser
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User doesn't have enough privileges"
        )
    return current_user


# ============ RBAC Permission Helpers ============

async def get_user_permissions(db: AsyncSession, user: User) -> List[str]:
    """
    Get all permissions for a user based on their assigned roles.

    Args:
        db: Database session
        user: Current user (from legacy User model)

    Returns:
        List of permission IDs the user has
    """
    # First try to find user in RBAC users table
    result = await db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == str(user.id),
                UserAccount.username == user.username
            )
        )
    )
    user_account = result.scalar_one_or_none()

    if not user_account:
        # User not in RBAC system, return empty permissions
        # They can still access the app but won't have RBAC permissions
        return []

    # If super admin, return all permissions
    if user_account.is_super_admin == 1:
        perm_result = await db.execute(select(Permission.permission_id))
        return [row[0] for row in perm_result.fetchall()]

    # Get permissions through user's roles
    result = await db.execute(
        select(Permission.permission_id)
        .join(RolePermission, RolePermission.permission_id == Permission.permission_id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_account.user_id)
    )
    return [row[0] for row in result.fetchall()]


async def get_user_role(db: AsyncSession, user: User) -> Optional[str]:
    """
    Get the primary role for a user.

    Args:
        db: Database session
        user: Current user

    Returns:
        Role ID or None
    """
    result = await db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == str(user.id),
                UserAccount.username == user.username
            )
        )
    )
    user_account = result.scalar_one_or_none()

    if not user_account:
        return None

    role_result = await db.execute(
        select(UserRole.role_id).where(UserRole.user_id == user_account.user_id)
    )
    role = role_result.scalar_one_or_none()
    return role


def require_permission(*permissions: str) -> Callable:
    """
    Dependency factory that requires the user to have at least one of the specified permissions.

    Usage:
        @router.get("/protected")
        async def protected_route(
            current_user: User = Depends(require_permission("data:read", "data:upload"))
        ):
            ...

    Args:
        *permissions: Permission IDs required (user needs at least one)

    Returns:
        Dependency function that validates permissions
    """
    async def permission_checker(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
    ) -> User:
        user_permissions = await get_user_permissions(db, current_user)

        # Check if user has any of the required permissions
        if not any(p in user_permissions for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required: {', '.join(permissions)}"
            )

        return current_user

    return permission_checker


def require_all_permissions(*permissions: str) -> Callable:
    """
    Dependency factory that requires the user to have ALL specified permissions.

    Args:
        *permissions: Permission IDs required (user needs all)

    Returns:
        Dependency function that validates permissions
    """
    async def permission_checker(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
    ) -> User:
        user_permissions = await get_user_permissions(db, current_user)

        # Check if user has all required permissions
        missing = [p for p in permissions if p not in user_permissions]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Missing: {', '.join(missing)}"
            )

        return current_user

    return permission_checker
