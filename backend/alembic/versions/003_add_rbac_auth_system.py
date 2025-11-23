"""Add RBAC authentication system

Revision ID: 003
Revises: 002
Create Date: 2025-11-21 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table (new RBAC version)
    op.create_table('users',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=False),
        sa.Column('is_super_admin', sa.Integer(), server_default='0', nullable=False),
        sa.Column('license_key', sa.String(), nullable=True),
        sa.Column('hardware_fingerprint', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('user_id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email')
    )
    op.create_index('idx_users_username', 'users', ['username'])
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_users_license_key', 'users', ['license_key'])

    # Create sessions table
    op.create_table('sessions',
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('session_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE')
    )
    op.create_index('idx_sessions_user_id', 'sessions', ['user_id'])
    op.create_index('idx_sessions_expires_at', 'sessions', ['expires_at'])
    op.create_index('idx_sessions_token_hash', 'sessions', ['token_hash'])

    # Create roles table
    op.create_table('roles',
        sa.Column('role_id', sa.String(), nullable=False),
        sa.Column('role_name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system_role', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('role_id'),
        sa.UniqueConstraint('role_name')
    )

    # Create permissions table
    op.create_table('permissions',
        sa.Column('permission_id', sa.String(), nullable=False),
        sa.Column('permission_name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('resource_type', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('permission_id'),
        sa.UniqueConstraint('permission_name')
    )

    # Create role_permissions table
    op.create_table('role_permissions',
        sa.Column('role_id', sa.String(), nullable=False),
        sa.Column('permission_id', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('role_id', 'permission_id'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.role_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.permission_id'], ondelete='CASCADE')
    )
    op.create_index('idx_role_permissions_role_id', 'role_permissions', ['role_id'])
    op.create_index('idx_role_permissions_permission_id', 'role_permissions', ['permission_id'])

    # Create user_roles table
    op.create_table('user_roles',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('role_id', sa.String(), nullable=False),
        sa.Column('scope_level', sa.String(), nullable=True),
        sa.Column('scope_id', sa.String(), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('granted_by', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('user_id', 'role_id', 'scope_level', 'scope_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.role_id'], ondelete='CASCADE')
    )
    op.create_index('idx_user_roles_user_id', 'user_roles', ['user_id'])
    op.create_index('idx_user_roles_role_id', 'user_roles', ['role_id'])

    # Insert default roles
    op.execute("""
        INSERT INTO roles (role_id, role_name, description, is_system_role) VALUES
        ('super-admin', 'Super Admin', 'Full system access with no restrictions', 1),
        ('admin', 'Admin', 'Organization administrator with full data and model access', 1),
        ('analyst', 'Analyst', 'Data analyst with read access and model execution', 1),
        ('manager', 'Manager', 'Department manager with access to their team data', 1),
        ('hr-director', 'HR Director', 'HR leadership with employee and treatment access', 1),
        ('viewer', 'Viewer', 'Read-only access to dashboards and reports', 1)
    """)

    # Insert default permissions
    op.execute("""
        INSERT INTO permissions (permission_id, permission_name, description, resource_type, action) VALUES
        ('data:read', 'Read Data', 'View employee data and datasets', 'data', 'read'),
        ('data:upload', 'Upload Data', 'Upload new datasets', 'data', 'upload'),
        ('data:delete', 'Delete Data', 'Delete datasets', 'data', 'delete'),
        ('data:export', 'Export Data', 'Export data and reports', 'data', 'export'),
        ('model:read', 'View Models', 'View ML model information', 'model', 'read'),
        ('model:train', 'Train Models', 'Trigger ML model training', 'model', 'train'),
        ('model:configure', 'Configure Models', 'Configure model parameters', 'model', 'configure'),
        ('employee:read', 'View Employees', 'View employee details', 'employee', 'read'),
        ('employee:read:department', 'View Department Employees', 'View employees in own department', 'employee', 'read'),
        ('employee:edit', 'Edit Employees', 'Edit employee data', 'employee', 'edit'),
        ('treatment:read', 'View Treatments', 'View treatment definitions and applications', 'treatment', 'read'),
        ('treatment:apply', 'Apply Treatments', 'Apply retention treatments', 'treatment', 'apply'),
        ('treatment:approve', 'Approve Treatments', 'Approve treatment costs', 'treatment', 'approve'),
        ('chat:use', 'Use Chat', 'Access AI chat assistant', 'chat', 'use'),
        ('system:configure', 'Configure System', 'System configuration access', 'system', 'configure'),
        ('users:manage', 'Manage Users', 'Create and manage user accounts', 'users', 'manage'),
        ('roles:manage', 'Manage Roles', 'Create and manage roles and permissions', 'roles', 'manage')
    """)

    # Insert default role-permission assignments for Super Admin
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT 'super-admin', permission_id FROM permissions
    """)

    # Admin permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('admin', 'data:read'),
        ('admin', 'data:upload'),
        ('admin', 'data:delete'),
        ('admin', 'data:export'),
        ('admin', 'model:read'),
        ('admin', 'model:train'),
        ('admin', 'model:configure'),
        ('admin', 'employee:read'),
        ('admin', 'employee:edit'),
        ('admin', 'treatment:read'),
        ('admin', 'treatment:apply'),
        ('admin', 'treatment:approve'),
        ('admin', 'chat:use'),
        ('admin', 'system:configure')
    """)

    # Analyst permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('analyst', 'data:read'),
        ('analyst', 'data:upload'),
        ('analyst', 'data:export'),
        ('analyst', 'model:read'),
        ('analyst', 'model:train'),
        ('analyst', 'employee:read'),
        ('analyst', 'treatment:read'),
        ('analyst', 'chat:use')
    """)

    # Manager permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('manager', 'data:read'),
        ('manager', 'data:export'),
        ('manager', 'model:read'),
        ('manager', 'employee:read:department'),
        ('manager', 'treatment:read'),
        ('manager', 'treatment:apply'),
        ('manager', 'chat:use')
    """)

    # HR Director permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('hr-director', 'data:read'),
        ('hr-director', 'data:export'),
        ('hr-director', 'model:read'),
        ('hr-director', 'employee:read'),
        ('hr-director', 'employee:edit'),
        ('hr-director', 'treatment:read'),
        ('hr-director', 'treatment:apply'),
        ('hr-director', 'treatment:approve'),
        ('hr-director', 'chat:use')
    """)

    # Viewer permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('viewer', 'data:read'),
        ('viewer', 'data:export'),
        ('viewer', 'model:read'),
        ('viewer', 'employee:read'),
        ('viewer', 'treatment:read')
    """)

    # Update conversations table to reference new users table
    # Note: This assumes conversations table exists from previous migration
    # We'll modify the foreign key to point to the new users table
    # try:
    #     op.drop_constraint('conversations_user_id_fkey', 'conversations', type_='foreignkey')
    # except:
    #     pass  # Constraint might not exist

    # Alter user_id column type if needed
    op.execute('ALTER TABLE conversations ALTER COLUMN user_id TYPE VARCHAR')

    # Add new foreign key constraint
    op.create_foreign_key(
        'conversations_user_id_fkey',
        'conversations', 'users',
        ['user_id'], ['user_id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Drop foreign key from conversations
    op.drop_constraint('conversations_user_id_fkey', 'conversations', type_='foreignkey')

    # Drop user_roles table
    op.drop_index('idx_user_roles_role_id', table_name='user_roles')
    op.drop_index('idx_user_roles_user_id', table_name='user_roles')
    op.drop_table('user_roles')

    # Drop role_permissions table
    op.drop_index('idx_role_permissions_permission_id', table_name='role_permissions')
    op.drop_index('idx_role_permissions_role_id', table_name='role_permissions')
    op.drop_table('role_permissions')

    # Drop permissions table
    op.drop_table('permissions')

    # Drop roles table
    op.drop_table('roles')

    # Drop sessions table
    op.drop_index('idx_sessions_token_hash', table_name='sessions')
    op.drop_index('idx_sessions_expires_at', table_name='sessions')
    op.drop_index('idx_sessions_user_id', table_name='sessions')
    op.drop_table('sessions')

    # Drop users table
    op.drop_index('idx_users_license_key', table_name='users')
    op.drop_index('idx_users_email', table_name='users')
    op.drop_index('idx_users_username', table_name='users')
    op.drop_table('users')
