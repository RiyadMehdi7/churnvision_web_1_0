"""add refresh tokens table

Revision ID: 014
Revises: 013
Create Date: 2024-12-17

Add refresh_tokens table for secure JWT token rotation.
Stores hashed tokens with expiration tracking and device info.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '014'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create refresh_tokens table."""
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('token_hash', sa.String(64), unique=True, nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('legacy_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('device_info', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )

    # Create composite indexes for efficient queries
    op.create_index(
        'ix_refresh_tokens_user_expires',
        'refresh_tokens',
        ['user_id', 'expires_at']
    )
    op.create_index(
        'ix_refresh_tokens_cleanup',
        'refresh_tokens',
        ['expires_at', 'revoked_at']
    )


def downgrade() -> None:
    """Drop refresh_tokens table."""
    op.drop_index('ix_refresh_tokens_cleanup', table_name='refresh_tokens')
    op.drop_index('ix_refresh_tokens_user_expires', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
