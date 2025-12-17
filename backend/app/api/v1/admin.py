"""
Admin API endpoints for user management, roles, and audit logs.
Only accessible to users with admin:access permission.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime

from app.api.deps import get_db, get_current_user, get_user_permissions_by_id
from app.models.user import User
from app.models.auth import UserAccount, Role, Permission, UserRole
from app.core.audit import AuditLog, AuditLogger
from app.core.security import get_password_hash
from app.schemas.admin import (
    RoleResponse,
    RoleWithPermissions,
    PermissionResponse,
    PermissionsByResource,
    UserAdminCreate,
    UserAdminUpdate,
    UserAdminResponse,
    UserWithRole,
    UserListResponse,
    UserRoleAssign,
    UserRoleResponse,
    PasswordReset,
    AuditLogResponse,
    AuditLogListResponse,
    AdminStats,
)

router = APIRouter()


# ============ Permission Check Helpers ============

async def check_admin_access(db: AsyncSession, current_user: User) -> UserAccount:
    """Check if current user has admin access and return UserAccount"""
    # Get UserAccount from users table
    result = await db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == str(current_user.id),
                UserAccount.username == current_user.username
            )
        )
    )
    user_account = result.scalar_one_or_none()

    if not user_account:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account not found in RBAC system"
        )

    # Check if super admin
    if user_account.is_super_admin == 1:
        return user_account

    # Check permissions (using centralized function from deps.py)
    permissions = await get_user_permissions_by_id(db, user_account.user_id)
    if 'admin:access' not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return user_account


async def log_admin_action(
    db: AsyncSession,
    user: UserAccount,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: str = None
):
    """Log an admin action using centralized AuditLogger."""
    await AuditLogger.log(
        db=db,
        action=action,
        user_id=int(user.user_id) if user.user_id.isdigit() else None,
        username=user.username,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata={"details": details} if details else None
    )


# ============ Stats Endpoint ============

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get admin dashboard statistics"""
    await check_admin_access(db, current_user)

    # Total users
    total_result = await db.execute(select(func.count(UserAccount.user_id)))
    total_users = total_result.scalar() or 0

    # Active users
    active_result = await db.execute(
        select(func.count(UserAccount.user_id)).where(UserAccount.is_active == 1)
    )
    active_users = active_result.scalar() or 0

    # Users by role
    role_result = await db.execute(
        select(Role.role_name, func.count(UserRole.user_id))
        .join(UserRole, UserRole.role_id == Role.role_id)
        .group_by(Role.role_name)
    )
    users_by_role = {row[0]: row[1] for row in role_result.fetchall()}

    return AdminStats(
        total_users=total_users,
        active_users=active_users,
        inactive_users=total_users - active_users,
        users_by_role=users_by_role
    )


# ============ User Management Endpoints ============

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all users with pagination and filtering"""
    await check_admin_access(db, current_user)

    # Base query
    query = select(UserAccount)
    count_query = select(func.count(UserAccount.user_id))

    # Apply filters
    if search:
        search_filter = or_(
            UserAccount.username.ilike(f"%{search}%"),
            UserAccount.email.ilike(f"%{search}%"),
            UserAccount.full_name.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if is_active is not None:
        active_val = 1 if is_active else 0
        query = query.where(UserAccount.is_active == active_val)
        count_query = count_query.where(UserAccount.is_active == active_val)

    if role_id:
        query = query.join(UserRole, UserRole.user_id == UserAccount.user_id).where(UserRole.role_id == role_id)
        count_query = count_query.join(UserRole, UserRole.user_id == UserAccount.user_id).where(UserRole.role_id == role_id)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(UserAccount.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    # Get roles for each user
    user_responses = []
    for user in users:
        role_result = await db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.role_id)
            .where(UserRole.user_id == user.user_id)
        )
        role = role_result.scalar_one_or_none()

        user_responses.append(UserAdminResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active == 1,
            is_super_admin=user.is_super_admin == 1,
            created_at=user.created_at,
            updated_at=user.updated_at,
            last_login_at=user.last_login_at,
            role={"role_id": role.role_id, "role_name": role.role_name, "description": role.description} if role else None
        ))

    total_pages = (total + page_size - 1) // page_size

    return UserListResponse(
        users=user_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/users/{user_id}", response_model=UserWithRole)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user details with role and permissions"""
    await check_admin_access(db, current_user)

    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get role
    role_result = await db.execute(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.role_id)
        .where(UserRole.user_id == user_id)
    )
    role = role_result.scalar_one_or_none()

    # Get permissions
    permissions = await get_user_permissions(db, user_id)

    return UserWithRole(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active == 1,
        is_super_admin=user.is_super_admin == 1,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
        role={"role_id": role.role_id, "role_name": role.role_name, "description": role.description} if role else None,
        permissions=permissions
    )


@router.post("/users", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserAdminCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new user with role assignment"""
    admin_user = await check_admin_access(db, current_user)

    # Check if username exists
    existing = await db.execute(
        select(UserAccount).where(UserAccount.username == user_data.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    # Check if email exists
    if user_data.email:
        existing_email = await db.execute(
            select(UserAccount).where(UserAccount.email == user_data.email)
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already exists")

    # Verify role exists
    role_result = await db.execute(
        select(Role).where(Role.role_id == user_data.role_id)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role_id")

    # Only super_admin can create super_admin users
    if user_data.role_id == 'super_admin' and admin_user.is_super_admin != 1:
        raise HTTPException(status_code=403, detail="Only Super Admin can create Super Admin users")

    # Also check legacy_users for existing username/email
    existing_legacy = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if existing_legacy.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    if user_data.email:
        existing_legacy_email = await db.execute(
            select(User).where(User.email == user_data.email)
        )
        if existing_legacy_email.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already exists")

    password_hash = get_password_hash(user_data.password)

    # Create user in legacy_users table (for authentication/login)
    legacy_user = User(
        email=user_data.email or f"{user_data.username}@placeholder.local",
        username=user_data.username,
        hashed_password=password_hash,
        full_name=user_data.full_name,
        is_active=True,
        is_superuser=user_data.role_id == 'super_admin'
    )
    db.add(legacy_user)
    await db.flush()  # Get the auto-generated ID

    # Use the legacy_user.id as the user_id for RBAC tables
    new_user_id = str(legacy_user.id)

    # Create user in users table (for RBAC system)
    new_user = UserAccount(
        user_id=new_user_id,
        username=user_data.username,
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name,
        is_active=1,
        is_super_admin=1 if user_data.role_id == 'super_admin' else 0
    )
    db.add(new_user)

    # Assign role
    user_role = UserRole(
        user_id=new_user_id,
        role_id=user_data.role_id,
        scope_level="global",
        scope_id="global",
        granted_by=admin_user.user_id
    )
    db.add(user_role)

    await db.commit()
    await db.refresh(new_user)

    # Log action
    await log_admin_action(db, admin_user, "user_created", "user", new_user_id, f"Created user {user_data.username}")

    return UserAdminResponse(
        user_id=new_user.user_id,
        username=new_user.username,
        email=new_user.email,
        full_name=new_user.full_name,
        is_active=True,
        is_super_admin=new_user.is_super_admin == 1,
        created_at=new_user.created_at,
        updated_at=new_user.updated_at,
        last_login_at=new_user.last_login_at,
        role={"role_id": role.role_id, "role_name": role.role_name, "description": role.description}
    )


@router.put("/users/{user_id}", response_model=UserAdminResponse)
async def update_user(
    user_id: str,
    user_data: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user details"""
    admin_user = await check_admin_access(db, current_user)

    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent modifying super admin unless you are super admin
    if user.is_super_admin == 1 and admin_user.is_super_admin != 1:
        raise HTTPException(status_code=403, detail="Cannot modify Super Admin user")

    # Update fields
    if user_data.email is not None:
        # Check if email is taken by another user
        existing = await db.execute(
            select(UserAccount).where(
                and_(UserAccount.email == user_data.email, UserAccount.user_id != user_id)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = user_data.email

    if user_data.full_name is not None:
        user.full_name = user_data.full_name

    if user_data.is_active is not None:
        user.is_active = 1 if user_data.is_active else 0

    # Update role if provided
    role = None
    if user_data.role_id:
        # Only super_admin can assign super_admin role
        if user_data.role_id == 'super_admin' and admin_user.is_super_admin != 1:
            raise HTTPException(status_code=403, detail="Only Super Admin can assign Super Admin role")

        # Verify role exists
        role_result = await db.execute(
            select(Role).where(Role.role_id == user_data.role_id)
        )
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role_id")

        # Remove existing roles and add new one
        await db.execute(
            UserRole.__table__.delete().where(UserRole.user_id == user_id)
        )

        new_user_role = UserRole(
            user_id=user_id,
            role_id=user_data.role_id,
            scope_level="global",
            scope_id="global",
            granted_by=admin_user.user_id
        )
        db.add(new_user_role)

        # Update super admin flag
        user.is_super_admin = 1 if user_data.role_id == 'super_admin' else 0

    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    # Get current role if not updated
    if not role:
        role_result = await db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.role_id)
            .where(UserRole.user_id == user_id)
        )
        role = role_result.scalar_one_or_none()

    # Log action
    await log_admin_action(db, admin_user, "user_updated", "user", user_id, f"Updated user {user.username}")

    return UserAdminResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active == 1,
        is_super_admin=user.is_super_admin == 1,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
        role={"role_id": role.role_id, "role_name": role.role_name, "description": role.description} if role else None
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deactivate a user (soft delete)"""
    admin_user = await check_admin_access(db, current_user)

    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting super admin
    if user.is_super_admin == 1:
        raise HTTPException(status_code=403, detail="Cannot delete Super Admin user")

    # Prevent self-deletion
    if user.username == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Soft delete - deactivate
    user.is_active = 0
    user.updated_at = datetime.utcnow()
    await db.commit()

    # Log action
    await log_admin_action(db, admin_user, "user_deleted", "user", user_id, f"Deactivated user {user.username}")


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
async def reset_user_password(
    user_id: str,
    password_data: PasswordReset,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reset user password (admin action)"""
    admin_user = await check_admin_access(db, current_user)

    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent resetting super admin password unless you are super admin
    if user.is_super_admin == 1 and admin_user.is_super_admin != 1:
        raise HTTPException(status_code=403, detail="Cannot reset Super Admin password")

    user.password_hash = get_password_hash(password_data.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

    # Log action
    await log_admin_action(db, admin_user, "password_reset", "user", user_id, f"Reset password for {user.username}")

    return {"message": "Password reset successfully"}


# ============ Role Endpoints ============

@router.get("/roles", response_model=List[RoleWithPermissions])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all roles with their permissions"""
    await check_admin_access(db, current_user)

    result = await db.execute(select(Role).order_by(Role.role_name))
    roles = result.scalars().all()

    role_responses = []
    for role in roles:
        # Get permissions for role
        perm_result = await db.execute(
            select(Permission.permission_id)
            .join(RolePermission, RolePermission.permission_id == Permission.permission_id)
            .where(RolePermission.role_id == role.role_id)
        )
        permissions = [row[0] for row in perm_result.fetchall()]

        role_responses.append(RoleWithPermissions(
            role_id=role.role_id,
            role_name=role.role_name,
            description=role.description,
            is_system_role=role.is_system_role == 1,
            created_at=role.created_at,
            permissions=permissions
        ))

    return role_responses


@router.get("/roles/{role_id}", response_model=RoleWithPermissions)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get role details with permissions"""
    await check_admin_access(db, current_user)

    result = await db.execute(
        select(Role).where(Role.role_id == role_id)
    )
    role = result.scalar_one_or_none()

    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Get permissions
    perm_result = await db.execute(
        select(Permission.permission_id)
        .join(RolePermission, RolePermission.permission_id == Permission.permission_id)
        .where(RolePermission.role_id == role_id)
    )
    permissions = [row[0] for row in perm_result.fetchall()]

    return RoleWithPermissions(
        role_id=role.role_id,
        role_name=role.role_name,
        description=role.description,
        is_system_role=role.is_system_role == 1,
        created_at=role.created_at,
        permissions=permissions
    )


# ============ Permission Endpoints ============

@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all permissions"""
    await check_admin_access(db, current_user)

    result = await db.execute(
        select(Permission).order_by(Permission.resource_type, Permission.action)
    )
    permissions = result.scalars().all()

    return [PermissionResponse(
        permission_id=p.permission_id,
        permission_name=p.permission_name,
        description=p.description,
        resource_type=p.resource_type,
        action=p.action
    ) for p in permissions]


@router.get("/permissions/by-resource", response_model=List[PermissionsByResource])
async def list_permissions_by_resource(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List permissions grouped by resource type"""
    await check_admin_access(db, current_user)

    result = await db.execute(
        select(Permission).order_by(Permission.resource_type, Permission.action)
    )
    permissions = result.scalars().all()

    # Group by resource type
    grouped = {}
    for p in permissions:
        if p.resource_type not in grouped:
            grouped[p.resource_type] = []
        grouped[p.resource_type].append(PermissionResponse(
            permission_id=p.permission_id,
            permission_name=p.permission_name,
            description=p.description,
            resource_type=p.resource_type,
            action=p.action
        ))

    return [PermissionsByResource(
        resource_type=resource,
        permissions=perms
    ) for resource, perms in grouped.items()]


# ============ Audit Log Endpoints ============

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List audit logs with filtering and pagination"""
    await check_admin_access(db, current_user)

    # Base query
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    # Apply filters
    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)

    if user_id:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)

    if username:
        query = query.where(AuditLog.username.ilike(f"%{username}%"))
        count_query = count_query.where(AuditLog.username.ilike(f"%{username}%"))

    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
        count_query = count_query.where(AuditLog.resource_type == resource_type)

    if start_date:
        query = query.where(AuditLog.timestamp >= start_date)
        count_query = count_query.where(AuditLog.timestamp >= start_date)

    if end_date:
        query = query.where(AuditLog.timestamp <= end_date)
        count_query = count_query.where(AuditLog.timestamp <= end_date)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(page_size)

    result = await db.execute(query)
    logs = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size

    return AuditLogListResponse(
        logs=[AuditLogResponse(
            id=log.id,
            timestamp=log.timestamp,
            user_id=log.user_id,
            username=log.username,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            method=log.method,
            endpoint=log.endpoint,
            ip_address=log.ip_address,
            status_code=log.status_code,
            duration_ms=log.duration_ms,
            error_message=log.error_message
        ) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
