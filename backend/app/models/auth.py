from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Index, PrimaryKeyConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class UserAccount(Base):
    """Enhanced user account model with RBAC support"""
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Integer, default=1, nullable=False)
    is_super_admin = Column(Integer, default=0, nullable=False)
    license_key = Column(String, nullable=True)
    hardware_fingerprint = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    user_roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")


Index('idx_users_username', UserAccount.username)
Index('idx_users_email', UserAccount.email)
Index('idx_users_license_key', UserAccount.license_key)


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), server_default=func.now())
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # Relationships
    user = relationship("UserAccount", back_populates="sessions")


Index('idx_sessions_user_id', Session.user_id)
Index('idx_sessions_expires_at', Session.expires_at)
Index('idx_sessions_token_hash', Session.token_hash)


class Role(Base):
    __tablename__ = "roles"

    role_id = Column(String, primary_key=True)
    role_name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_system_role = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    user_roles = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    __tablename__ = "permissions"

    permission_id = Column(String, primary_key=True)
    permission_name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    resource_type = Column(String, nullable=False)
    action = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(String, ForeignKey("roles.role_id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(String, ForeignKey("permissions.permission_id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint('role_id', 'permission_id'),
    )

    # Relationships
    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")


Index('idx_role_permissions_role_id', RolePermission.role_id)
Index('idx_role_permissions_permission_id', RolePermission.permission_id)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    role_id = Column(String, ForeignKey("roles.role_id", ondelete="CASCADE"), nullable=False)
    scope_level = Column(String, nullable=True)  # global, manager, director, department
    scope_id = Column(String, nullable=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(String, nullable=True)

    __table_args__ = (
        PrimaryKeyConstraint('user_id', 'role_id', 'scope_level', 'scope_id'),
    )

    # Relationships
    user = relationship("UserAccount", back_populates="user_roles")
    role = relationship("Role", back_populates="user_roles")


Index('idx_user_roles_user_id', UserRole.user_id)
Index('idx_user_roles_role_id', UserRole.role_id)
