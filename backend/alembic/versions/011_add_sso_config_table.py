"""Add SSO configuration table

Revision ID: 011
Revises: 010
Create Date: 2025-01-21

Stores SSO configuration in database for Admin UI management.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sso_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, default=False),
        sa.Column('provider', sa.String(50), nullable=False, default='oidc'),

        # OIDC settings
        sa.Column('issuer_url', sa.String(500), nullable=True),
        sa.Column('client_id', sa.String(255), nullable=True),
        sa.Column('client_secret_encrypted', sa.Text(), nullable=True),
        sa.Column('redirect_uri', sa.String(500), nullable=True),
        sa.Column('scopes', sa.String(255), nullable=False, default='openid email profile'),

        # User provisioning
        sa.Column('auto_create_users', sa.Boolean(), nullable=False, default=True),
        sa.Column('default_role', sa.String(50), nullable=False, default='viewer'),
        sa.Column('admin_groups', sa.Text(), nullable=True),

        # Session settings
        sa.Column('session_lifetime', sa.Integer(), nullable=False, default=86400),

        # Metadata
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(255), nullable=True),
        sa.Column('updated_by', sa.String(255), nullable=True),

        # Connection test status
        sa.Column('last_test_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_test_success', sa.Boolean(), nullable=True),
        sa.Column('last_test_error', sa.Text(), nullable=True),

        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sso_config_id', 'sso_config', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_sso_config_id', table_name='sso_config')
    op.drop_table('sso_config')
