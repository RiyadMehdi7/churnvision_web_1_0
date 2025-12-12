"""add company context fields to knowledge_base_settings

Revision ID: 013
Revises: 012
Create Date: 2024-12-08

Add company context fields (company_name, industry, company_size, company_description)
to KnowledgeBaseSettings for AI personalization.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '013'
down_revision: Union[str, None] = '012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add company context fields to knowledge_base_settings table."""
    op.add_column(
        'knowledge_base_settings',
        sa.Column('company_name', sa.String(200), nullable=True)
    )
    op.add_column(
        'knowledge_base_settings',
        sa.Column('industry', sa.String(100), nullable=True)
    )
    op.add_column(
        'knowledge_base_settings',
        sa.Column('company_size', sa.String(50), nullable=True)
    )
    op.add_column(
        'knowledge_base_settings',
        sa.Column('company_description', sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Remove company context fields from knowledge_base_settings table."""
    op.drop_column('knowledge_base_settings', 'company_description')
    op.drop_column('knowledge_base_settings', 'company_size')
    op.drop_column('knowledge_base_settings', 'industry')
    op.drop_column('knowledge_base_settings', 'company_name')
