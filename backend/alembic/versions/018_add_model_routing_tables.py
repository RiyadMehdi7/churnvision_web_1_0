"""add model routing and dataset profile tables

Revision ID: 018
Revises: 017
Create Date: 2025-02-20

Adds tables for:
- dataset_profiles: Comprehensive dataset analysis for model routing
- model_routing_decisions: Records of automatic model selection decisions
- Extends churn_models with ensemble support
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '018'
down_revision: Union[str, None] = '017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create dataset_profiles table
    op.create_table(
        'dataset_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('dataset_id', sa.String(), sa.ForeignKey('datasets.dataset_id', ondelete='CASCADE'), nullable=False, unique=True),

        # Size metrics
        sa.Column('n_samples', sa.Integer(), nullable=False),
        sa.Column('n_features', sa.Integer(), nullable=False),
        sa.Column('n_numeric_features', sa.Integer(), nullable=True),
        sa.Column('n_categorical_features', sa.Integer(), nullable=True),

        # Class distribution
        sa.Column('n_classes', sa.Integer(), nullable=True),
        sa.Column('class_balance_ratio', sa.Numeric(5, 4), nullable=True),
        sa.Column('is_severely_imbalanced', sa.Integer(), server_default='0'),

        # Missing data
        sa.Column('missing_ratio', sa.Numeric(5, 4), nullable=True),
        sa.Column('features_with_missing', sa.Integer(), nullable=True),
        sa.Column('max_missing_per_feature', sa.Numeric(5, 4), nullable=True),

        # Outliers
        sa.Column('has_outliers', sa.Integer(), server_default='0'),
        sa.Column('outlier_ratio', sa.Numeric(5, 4), nullable=True),

        # Categorical analysis
        sa.Column('max_cardinality', sa.Integer(), nullable=True),
        sa.Column('avg_cardinality', sa.Numeric(8, 2), nullable=True),
        sa.Column('high_cardinality_features', sa.Integer(), nullable=True),

        # Correlation analysis
        sa.Column('max_feature_correlation', sa.Numeric(5, 4), nullable=True),
        sa.Column('highly_correlated_pairs', sa.Integer(), nullable=True),
        sa.Column('target_correlation_max', sa.Numeric(5, 4), nullable=True),

        # Analysis results (JSON for flexibility)
        sa.Column('numeric_stats', sa.JSON(), nullable=True),
        sa.Column('categorical_stats', sa.JSON(), nullable=True),
        sa.Column('correlation_stats', sa.JSON(), nullable=True),

        # Suitability scores (0-1)
        sa.Column('overall_quality_score', sa.Numeric(4, 3), nullable=True),
        sa.Column('tabpfn_suitability', sa.Numeric(4, 3), nullable=True),
        sa.Column('tree_model_suitability', sa.Numeric(4, 3), nullable=True),
        sa.Column('linear_model_suitability', sa.Numeric(4, 3), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, onupdate=sa.func.now()),
    )

    op.create_index('idx_dataset_profiles_dataset_id', 'dataset_profiles', ['dataset_id'])
    op.create_index('idx_dataset_profiles_n_samples', 'dataset_profiles', ['n_samples'])
    op.create_index('idx_dataset_profiles_tabpfn_suitability', 'dataset_profiles', ['tabpfn_suitability'])

    # Create model_routing_decisions table
    op.create_table(
        'model_routing_decisions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('dataset_id', sa.String(), sa.ForeignKey('datasets.dataset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('model_version', sa.String(), nullable=True),

        # Primary decision
        sa.Column('selected_model', sa.String(50), nullable=False),  # 'tabpfn', 'xgboost', etc.
        sa.Column('confidence', sa.Numeric(4, 3), nullable=False),

        # Ensemble configuration
        sa.Column('is_ensemble', sa.Integer(), server_default='0'),
        sa.Column('ensemble_models', sa.JSON(), nullable=True),  # ['xgboost', 'random_forest']
        sa.Column('ensemble_weights', sa.JSON(), nullable=True),  # {'xgboost': 0.6, 'random_forest': 0.4}
        sa.Column('ensemble_method', sa.String(50), nullable=True),  # 'weighted_voting', 'stacking'

        # Reasoning and alternatives
        sa.Column('reasoning', sa.JSON(), nullable=True),  # ['Small dataset...', 'Low missing values...']
        sa.Column('alternative_models', sa.JSON(), nullable=True),  # [{'model': 'xgboost', 'score': 0.8}]
        sa.Column('model_scores', sa.JSON(), nullable=True),  # {'tabpfn': 0.9, 'xgboost': 0.75, ...}

        # Timestamps
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('idx_routing_decisions_dataset', 'model_routing_decisions', ['dataset_id'])
    op.create_index('idx_routing_decisions_selected_model', 'model_routing_decisions', ['selected_model'])
    op.create_index('idx_routing_decisions_is_ensemble', 'model_routing_decisions', ['is_ensemble'])

    # Extend churn_models table with ensemble support
    op.add_column('churn_models', sa.Column('routing_decision_id', sa.Integer(), sa.ForeignKey('model_routing_decisions.id', ondelete='SET NULL'), nullable=True))
    op.add_column('churn_models', sa.Column('is_ensemble', sa.Integer(), server_default='0'))
    op.add_column('churn_models', sa.Column('ensemble_artifact_paths', sa.JSON(), nullable=True))

    op.create_index('idx_churn_models_routing_decision', 'churn_models', ['routing_decision_id'])
    op.create_index('idx_churn_models_is_ensemble', 'churn_models', ['is_ensemble'])


def downgrade() -> None:
    # Remove indexes from churn_models
    op.drop_index('idx_churn_models_is_ensemble', table_name='churn_models')
    op.drop_index('idx_churn_models_routing_decision', table_name='churn_models')

    # Remove columns from churn_models
    op.drop_column('churn_models', 'ensemble_artifact_paths')
    op.drop_column('churn_models', 'is_ensemble')
    op.drop_column('churn_models', 'routing_decision_id')

    # Drop model_routing_decisions table
    op.drop_index('idx_routing_decisions_is_ensemble', table_name='model_routing_decisions')
    op.drop_index('idx_routing_decisions_selected_model', table_name='model_routing_decisions')
    op.drop_index('idx_routing_decisions_dataset', table_name='model_routing_decisions')
    op.drop_table('model_routing_decisions')

    # Drop dataset_profiles table
    op.drop_index('idx_dataset_profiles_tabpfn_suitability', table_name='dataset_profiles')
    op.drop_index('idx_dataset_profiles_n_samples', table_name='dataset_profiles')
    op.drop_index('idx_dataset_profiles_dataset_id', table_name='dataset_profiles')
    op.drop_table('dataset_profiles')
