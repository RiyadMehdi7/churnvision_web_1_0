import json
import logging
from typing import AsyncGenerator, Optional, List, Callable
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.token_blacklist import is_token_blacklisted
from app.core.cache import get_cache, CacheTTL
from app.models.user import User
from app.models.auth import UserAccount, UserRole, RolePermission, Permission
from app.schemas.token import TokenPayload

logger = logging.getLogger("churnvision.deps")

# Permission cache TTL (5 minutes)
PERMISSIONS_CACHE_TTL = CacheTTL.MEDIUM

# Allow graceful handling when Authorization header is absent so we can fall back to cookies
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_db_session():
    """
    Context manager version of get_db for use in WebSocket handlers.

    Usage:
        async with get_db_session() as db:
            # use db session
    """
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    request: Optional[Request] = None
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
    if not token and request is not None:
        token = request.cookies.get("access_token") or request.cookies.get("churnvision_access_token")
        # Support "Bearer <token>" value stored in cookie if present
        if token and token.lower().startswith("bearer "):
            parts = token.split(" ", 1)
            # Ensure we have a value after "bearer "
            token = parts[1] if len(parts) > 1 and parts[1].strip() else None

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

    Note: get_current_user already validates that the user is active,
    so this dependency is effectively a pass-through. Kept for backwards
    compatibility and explicit intent in route definitions.

    Args:
        current_user: Current user from token (already validated as active)

    Returns:
        Active user
    """
    # Note: is_active check already performed by get_current_user
    # This function exists for semantic clarity in route definitions
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


async def get_cached_user_permissions(db: AsyncSession, user: User) -> List[str]:
    """
    Get user permissions with Redis caching.

    This function wraps get_user_permissions with a cache layer to reduce
    database queries on permission-protected endpoints.

    Cache key: permissions:user:{user_id}
    TTL: 5 minutes (PERMISSIONS_CACHE_TTL)

    Args:
        db: Database session
        user: Current user

    Returns:
        List of permission IDs the user has
    """
    cache_key = f"permissions:user:{user.id}"

    # Try cache first
    try:
        cache = await get_cache()
        cached = await cache.get(cache_key)
        if cached:
            permissions = json.loads(cached)
            logger.debug(f"Permission cache hit for user {user.id}")
            return permissions
    except Exception as e:
        logger.warning(f"Permission cache read error: {e}")

    # Fall back to database query
    permissions = await get_user_permissions(db, user)

    # Cache the result
    try:
        cache = await get_cache()
        await cache.set(cache_key, json.dumps(permissions), PERMISSIONS_CACHE_TTL)
        logger.debug(f"Cached permissions for user {user.id}")
    except Exception as e:
        logger.warning(f"Permission cache write error: {e}")

    return permissions


async def invalidate_user_permissions_cache(user_id: int) -> bool:
    """
    Invalidate cached permissions for a user.

    Call this when:
    - User roles are changed
    - Role permissions are modified
    - User is deleted

    Args:
        user_id: The user's ID

    Returns:
        True if cache was invalidated, False otherwise
    """
    cache_key = f"permissions:user:{user_id}"
    try:
        cache = await get_cache()
        result = await cache.delete(cache_key)
        if result:
            logger.info(f"Invalidated permission cache for user {user_id}")
        return result
    except Exception as e:
        logger.warning(f"Failed to invalidate permission cache: {e}")
        return False


async def invalidate_all_permissions_cache() -> int:
    """
    Invalidate all cached permissions.

    Call this when:
    - Global permission changes occur
    - Role definitions are modified

    Returns:
        Number of cache entries invalidated
    """
    try:
        cache = await get_cache()
        count = await cache.clear_pattern("permissions:user:*")
        logger.info(f"Invalidated {count} permission cache entries")
        return count
    except Exception as e:
        logger.warning(f"Failed to invalidate all permission caches: {e}")
        return 0


async def get_user_permissions_by_id(db: AsyncSession, user_id: str) -> List[str]:
    """
    Get all permissions for a user by user_id string.

    This is a simpler version that takes user_id directly,
    useful when UserAccount is already known.

    Args:
        db: Database session
        user_id: User ID string from RBAC users table

    Returns:
        List of permission IDs the user has
    """
    result = await db.execute(
        select(Permission.permission_id)
        .join(RolePermission, RolePermission.permission_id == Permission.permission_id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
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
        # Use cached permissions to reduce DB queries
        user_permissions = await get_cached_user_permissions(db, current_user)

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
        # Use cached permissions to reduce DB queries
        user_permissions = await get_cached_user_permissions(db, current_user)

        # Check if user has all required permissions
        missing = [p for p in permissions if p not in user_permissions]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Missing: {', '.join(missing)}"
            )

        return current_user

    return permission_checker
