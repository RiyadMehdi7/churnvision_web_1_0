"""add app settings table

Revision ID: 017
Revises: 016
Create Date: 2025-02-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '017'
down_revision: Union[str, None] = '016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('strict_offline_mode', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('risk_thresholds_override_high', sa.Float(), nullable=True),
        sa.Column('risk_thresholds_override_medium', sa.Float(), nullable=True),
        sa.Column('ai_provider', sa.String(length=50), nullable=False, server_default='local'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_app_settings_id', 'app_settings', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_app_settings_id', table_name='app_settings')
    op.drop_table('app_settings')
