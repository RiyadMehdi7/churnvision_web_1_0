"""add hr_code lookup indexes for employee queries

Revision ID: 016
Revises: 015
Create Date: 2024-12-18

Performance optimization: Add composite indexes on (dataset_id, hr_code) columns
to optimize employee lookup queries that join HR data with churn outputs and reasoning.
These indexes significantly improve the performance of the /employees endpoint
which performs three outer joins.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '016'
down_revision: Union[str, None] = '015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create composite indexes for hr_code based lookups."""

    # HRDataInput: Composite index for dataset + hr_code lookup
    # Used when querying employees for a specific dataset
    op.create_index(
        'idx_hr_data_dataset_hrcode',
        'hr_data_input',
        ['dataset_id', 'hr_code'],
        if_not_exists=True
    )

    # ChurnOutput: Composite index for dataset + hr_code lookup
    # Optimizes the JOIN between hr_data_input and churn_output in /employees endpoint
    op.create_index(
        'idx_churn_output_dataset_hrcode',
        'churn_output',
        ['dataset_id', 'hr_code'],
        if_not_exists=True
    )

    # ChurnReasoning: Simple index on hr_code
    # Optimizes the JOIN for fetching reasoning data per employee
    op.create_index(
        'idx_churn_reasoning_hrcode',
        'churn_reasoning',
        ['hr_code'],
        if_not_exists=True
    )

    # Additional index for batch reasoning queries
    # Optimizes queries that filter by multiple hr_codes at once
    op.create_index(
        'idx_churn_reasoning_hrcode_created',
        'churn_reasoning',
        ['hr_code', 'created_at'],
        if_not_exists=True
    )


def downgrade() -> None:
    """Drop hr_code lookup indexes."""
    op.drop_index('idx_churn_reasoning_hrcode_created', table_name='churn_reasoning', if_exists=True)
    op.drop_index('idx_churn_reasoning_hrcode', table_name='churn_reasoning', if_exists=True)
    op.drop_index('idx_churn_output_dataset_hrcode', table_name='churn_output', if_exists=True)
    op.drop_index('idx_hr_data_dataset_hrcode', table_name='hr_data_input', if_exists=True)
