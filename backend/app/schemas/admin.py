from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


# ============ Role Schemas ============

class RoleBase(BaseModel):
    role_id: str
    role_name: str
    description: Optional[str] = None


class RoleResponse(RoleBase):
    is_system_role: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoleWithPermissions(RoleResponse):
    permissions: List[str] = []


# ============ Permission Schemas ============

class PermissionBase(BaseModel):
    permission_id: str
    permission_name: str
    description: Optional[str] = None
    resource_type: str
    action: str


class PermissionResponse(PermissionBase):
    class Config:
        from_attributes = True


class PermissionsByResource(BaseModel):
    resource_type: str
    permissions: List[PermissionResponse]


# ============ User Admin Schemas ============

class UserAdminBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None


class UserAdminCreate(UserAdminBase):
    password: str = Field(..., min_length=8)
    role_id: str = Field(..., description="Role to assign to user")

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain letters, numbers, hyphens, and underscores')
        return v


class UserAdminUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[str] = None


class UserAdminResponse(UserAdminBase):
    user_id: str
    is_active: bool
    is_super_admin: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    role: Optional[RoleBase] = None

    class Config:
        from_attributes = True


class UserWithRole(UserAdminResponse):
    permissions: List[str] = []


class UserListResponse(BaseModel):
    users: List[UserAdminResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============ User Role Assignment ============

class UserRoleAssign(BaseModel):
    role_id: str
    scope_level: Optional[str] = "global"
    scope_id: Optional[str] = None


class UserRoleResponse(BaseModel):
    user_id: str
    role_id: str
    role_name: str
    scope_level: Optional[str] = None
    scope_id: Optional[str] = None
    granted_at: Optional[datetime] = None
    granted_by: Optional[str] = None

    class Config:
        from_attributes = True


# ============ Password Reset ============

class PasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


# ============ Audit Log Schemas ============

class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    method: Optional[str] = None
    endpoint: Optional[str] = None
    ip_address: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: Optional[int] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============ Stats ============

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    users_by_role: dict
