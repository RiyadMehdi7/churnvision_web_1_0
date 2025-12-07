"""Update RBAC roles to simplified structure

Revision ID: 009
Revises: 008
Create Date: 2025-01-21

Simplified roles:
- super_admin: Full access to everything
- admin: Only user/credential management (no data/model access)
- analyst: Everything except admin functionality
- hr: Everything except admin features and data/knowledge management
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clear existing role_permissions
    op.execute("DELETE FROM role_permissions")

    # Clear existing user_roles (will need to reassign)
    op.execute("DELETE FROM user_roles")

    # Clear existing roles
    op.execute("DELETE FROM roles")

    # Clear existing permissions
    op.execute("DELETE FROM permissions")

    # Insert new simplified roles
    op.execute("""
        INSERT INTO roles (role_id, role_name, description, is_system_role) VALUES
        ('super_admin', 'Super Admin', 'Full system access - can see and do everything', 1),
        ('admin', 'Admin', 'User and credential management only - no access to data or models', 1),
        ('analyst', 'Analyst', 'Full access to data, models, and features - no admin functionality', 1),
        ('hr', 'HR', 'Access to employees, treatments, AI chat - no admin or data management', 1)
    """)

    # Insert updated permissions
    op.execute("""
        INSERT INTO permissions (permission_id, permission_name, description, resource_type, action) VALUES
        -- Admin permissions
        ('admin:access', 'Admin Panel Access', 'Access to admin panel', 'admin', 'access'),
        ('users:read', 'View Users', 'View user list and details', 'users', 'read'),
        ('users:create', 'Create Users', 'Create new user accounts', 'users', 'create'),
        ('users:edit', 'Edit Users', 'Edit user accounts and assign roles', 'users', 'edit'),
        ('users:delete', 'Delete Users', 'Deactivate or delete user accounts', 'users', 'delete'),
        ('audit:read', 'View Audit Logs', 'View system audit logs', 'audit', 'read'),

        -- Data/Knowledge Management permissions
        ('data:read', 'Read Data', 'View datasets and data management', 'data', 'read'),
        ('data:upload', 'Upload Data', 'Upload new datasets', 'data', 'upload'),
        ('data:delete', 'Delete Data', 'Delete datasets', 'data', 'delete'),
        ('data:export', 'Export Data', 'Export data and reports', 'data', 'export'),
        ('knowledge:read', 'Read Knowledge Base', 'View knowledge base', 'knowledge', 'read'),
        ('knowledge:manage', 'Manage Knowledge Base', 'Add, edit, delete knowledge base items', 'knowledge', 'manage'),

        -- Model permissions
        ('model:read', 'View Models', 'View ML model information', 'model', 'read'),
        ('model:train', 'Train Models', 'Trigger ML model training', 'model', 'train'),
        ('model:configure', 'Configure Models', 'Configure model parameters', 'model', 'configure'),

        -- Employee permissions
        ('employee:read', 'View Employees', 'View employee details and risk scores', 'employee', 'read'),
        ('employee:edit', 'Edit Employees', 'Edit employee data', 'employee', 'edit'),

        -- Treatment permissions
        ('treatment:read', 'View Treatments', 'View treatment definitions', 'treatment', 'read'),
        ('treatment:apply', 'Apply Treatments', 'Apply retention treatments', 'treatment', 'apply'),
        ('treatment:approve', 'Approve Treatments', 'Approve treatment costs', 'treatment', 'approve'),

        -- Feature permissions
        ('chat:use', 'Use AI Chat', 'Access AI chat assistant', 'chat', 'use'),
        ('playground:use', 'Use Playground', 'Access playground features', 'playground', 'use'),
        ('dashboard:view', 'View Dashboard', 'Access main dashboard', 'dashboard', 'view'),
        ('settings:read', 'View Settings', 'View application settings', 'settings', 'read'),
        ('settings:edit', 'Edit Settings', 'Modify application settings', 'settings', 'edit')
    """)

    # Super Admin - gets ALL permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT 'super_admin', permission_id FROM permissions
    """)

    # Admin - only user/credential management permissions
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('admin', 'admin:access'),
        ('admin', 'users:read'),
        ('admin', 'users:create'),
        ('admin', 'users:edit'),
        ('admin', 'users:delete'),
        ('admin', 'audit:read'),
        ('admin', 'dashboard:view'),
        ('admin', 'settings:read')
    """)

    # Analyst - everything except admin functionality
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('analyst', 'data:read'),
        ('analyst', 'data:upload'),
        ('analyst', 'data:delete'),
        ('analyst', 'data:export'),
        ('analyst', 'knowledge:read'),
        ('analyst', 'knowledge:manage'),
        ('analyst', 'model:read'),
        ('analyst', 'model:train'),
        ('analyst', 'model:configure'),
        ('analyst', 'employee:read'),
        ('analyst', 'employee:edit'),
        ('analyst', 'treatment:read'),
        ('analyst', 'treatment:apply'),
        ('analyst', 'treatment:approve'),
        ('analyst', 'chat:use'),
        ('analyst', 'playground:use'),
        ('analyst', 'dashboard:view'),
        ('analyst', 'settings:read'),
        ('analyst', 'settings:edit')
    """)

    # HR - everything except admin features and data/knowledge management
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id) VALUES
        ('hr', 'model:read'),
        ('hr', 'employee:read'),
        ('hr', 'employee:edit'),
        ('hr', 'treatment:read'),
        ('hr', 'treatment:apply'),
        ('hr', 'treatment:approve'),
        ('hr', 'chat:use'),
        ('hr', 'playground:use'),
        ('hr', 'dashboard:view'),
        ('hr', 'settings:read')
    """)


def downgrade() -> None:
    # Restore original roles and permissions from migration 003
    op.execute("DELETE FROM role_permissions")
    op.execute("DELETE FROM user_roles")
    op.execute("DELETE FROM roles")
    op.execute("DELETE FROM permissions")

    # Re-insert original roles
    op.execute("""
        INSERT INTO roles (role_id, role_name, description, is_system_role) VALUES
        ('super-admin', 'Super Admin', 'Full system access with no restrictions', 1),
        ('admin', 'Admin', 'Organization administrator with full data and model access', 1),
        ('analyst', 'Analyst', 'Data analyst with read access and model execution', 1),
        ('manager', 'Manager', 'Department manager with access to their team data', 1),
        ('hr-director', 'HR Director', 'HR leadership with employee and treatment access', 1),
        ('viewer', 'Viewer', 'Read-only access to dashboards and reports', 1)
    """)

    # Re-insert original permissions
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
