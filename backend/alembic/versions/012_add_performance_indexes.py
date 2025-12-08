"""add performance indexes

Revision ID: 012
Revises: 011
Create Date: 2024-12-08

Performance optimization: Add composite indexes for frequently queried columns
to improve query performance on churn predictions, HR data, and reasoning tables.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '012'
down_revision: Union[str, None] = '011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create performance indexes for frequently queried columns."""

    # ChurnOutput indexes - optimizes risk-based filtering and time-series queries
    op.create_index(
        'idx_churn_output_dataset_risk',
        'churn_output',
        ['dataset_id', 'resign_proba'],
        if_not_exists=True
    )
    op.create_index(
        'idx_churn_output_dataset_generated',
        'churn_output',
        ['dataset_id', 'generated_at'],
        if_not_exists=True
    )

    # ChurnReasoning indexes - optimizes employee lookup with stage filtering
    op.create_index(
        'idx_churn_reasoning_hr_stage',
        'churn_reasoning',
        ['hr_code', 'stage'],
        if_not_exists=True
    )
    op.create_index(
        'idx_churn_reasoning_risk_level',
        'churn_reasoning',
        ['churn_risk'],
        if_not_exists=True
    )

    # HRDataInput indexes - optimizes dataset+status filtering (used in chatbot aggregations)
    op.create_index(
        'idx_hr_data_dataset_status',
        'hr_data_input',
        ['dataset_id', 'status'],
        if_not_exists=True
    )
    op.create_index(
        'idx_hr_data_dataset_manager',
        'hr_data_input',
        ['dataset_id', 'manager_id'],
        if_not_exists=True
    )
    op.create_index(
        'idx_hr_data_dataset_structure',
        'hr_data_input',
        ['dataset_id', 'structure_name'],
        if_not_exists=True
    )


def downgrade() -> None:
    """Drop performance indexes."""
    op.drop_index('idx_hr_data_dataset_structure', table_name='hr_data_input', if_exists=True)
    op.drop_index('idx_hr_data_dataset_manager', table_name='hr_data_input', if_exists=True)
    op.drop_index('idx_hr_data_dataset_status', table_name='hr_data_input', if_exists=True)
    op.drop_index('idx_churn_reasoning_risk_level', table_name='churn_reasoning', if_exists=True)
    op.drop_index('idx_churn_reasoning_hr_stage', table_name='churn_reasoning', if_exists=True)
    op.drop_index('idx_churn_output_dataset_generated', table_name='churn_output', if_exists=True)
    op.drop_index('idx_churn_output_dataset_risk', table_name='churn_output', if_exists=True)
