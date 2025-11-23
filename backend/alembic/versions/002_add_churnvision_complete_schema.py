"""Add ChurnVision complete schema

Revision ID: 002
Revises: 001_add_chatbot_tables
Create Date: 2025-11-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create legacy_users table
    op.create_table('legacy_users',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('email', sa.String(), unique=True, index=True, nullable=False),
        sa.Column('username', sa.String(), unique=True, index=True, nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_superuser', sa.Boolean(), default=False, nullable=False),
        sa.Column('tenant_id', sa.String(), index=True, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.text('now()'), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create datasets table
    op.create_table('datasets',
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('upload_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('row_count', sa.Integer(), nullable=True),
        sa.Column('file_type', sa.String(), nullable=True),
        sa.Column('size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_active', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_snapshot', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('snapshot_group', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('dataset_id')
    )
    op.create_index('idx_datasets_upload_date', 'datasets', ['upload_date'])
    op.create_index('idx_datasets_is_active', 'datasets', ['is_active'])

    # Create connections table
    op.create_table('connections',
        sa.Column('connection_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('host', sa.String(), nullable=False),
        sa.Column('port', sa.Integer(), nullable=True),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('database_name', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=True),
        sa.PrimaryKeyConstraint('connection_id')
    )
    op.create_index('idx_connections_name', 'connections', ['name'])
    op.create_index('idx_connections_type', 'connections', ['type'])

    # Create scoped_projects table
    op.create_table('scoped_projects',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('scope_level', sa.String(), nullable=False),
        sa.Column('scope_id', sa.String(), nullable=False),
        sa.Column('project_dir', sa.String(), nullable=False),
        sa.Column('project_name', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('active', sa.Integer(), server_default='1', nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scoped_projects_scope', 'scoped_projects', ['scope_level', 'scope_id'], unique=True)

    # Create import_profiles table
    op.create_table('import_profiles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('connection_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('dataset_name', sa.String(), nullable=False),
        sa.Column('query', sa.Text(), nullable=True),
        sa.Column('table_name', sa.String(), nullable=True),
        sa.Column('row_limit', sa.Integer(), server_default='100000', nullable=True),
        sa.Column('mappings_json', sa.Text(), nullable=False),
        sa.Column('schedule_interval_minutes', sa.Integer(), server_default='0', nullable=True),
        sa.Column('is_enabled', sa.Integer(), server_default='0', nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['connection_id'], ['connections.connection_id'], )
    )
    op.create_index('idx_import_profiles_enabled', 'import_profiles', ['is_enabled'])

    # Create hr_data_input table
    op.create_table('hr_data_input',
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('structure_name', sa.String(), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('manager_id', sa.String(), nullable=False),
        sa.Column('tenure', sa.Numeric(), nullable=False),
        sa.Column('employee_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('report_date', sa.Date(), nullable=False),
        sa.Column('termination_date', sa.Date(), nullable=True),
        sa.Column('additional_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint('hr_code'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], ondelete='CASCADE')
    )
    op.create_index('idx_hr_data_manager_id', 'hr_data_input', ['manager_id'])
    op.create_index('idx_hr_data_report_date', 'hr_data_input', ['report_date'])
    op.create_index('idx_hr_data_status', 'hr_data_input', ['status'])
    op.create_index('idx_hr_data_structure', 'hr_data_input', ['structure_name'])
    op.create_index('idx_hr_data_hr_code', 'hr_data_input', ['hr_code'])
    op.create_index('idx_hr_data_employee_cost', 'hr_data_input', ['employee_cost'])
    op.create_index('idx_hr_data_status_hr_code', 'hr_data_input', ['status', 'hr_code'])
    op.create_index('idx_hr_data_active_cost', 'hr_data_input', ['status', 'employee_cost'])

    # Create employee_snapshots table
    op.create_table('employee_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('structure_name', sa.String(), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('manager_id', sa.String(), nullable=False),
        sa.Column('tenure', sa.Numeric(), nullable=False),
        sa.Column('employee_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('report_date', sa.Date(), nullable=False),
        sa.Column('termination_date', sa.Date(), nullable=True),
        sa.Column('additional_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], ondelete='CASCADE')
    )
    op.create_index('idx_snapshots_dataset', 'employee_snapshots', ['dataset_id'])
    op.create_index('idx_snapshots_hr_code', 'employee_snapshots', ['hr_code'])
    op.create_index('idx_snapshots_manager', 'employee_snapshots', ['manager_id'])
    op.create_index('idx_snapshots_report_date', 'employee_snapshots', ['report_date'])

    # Create interview_data table
    op.create_table('interview_data',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('interview_date', sa.Date(), nullable=False),
        sa.Column('interview_type', sa.String(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=False),
        sa.Column('sentiment_score', sa.Numeric(), nullable=True),
        sa.Column('processed_insights', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['hr_code'], ['hr_data_input.hr_code'], ondelete='CASCADE')
    )
    op.create_index('idx_interview_data_hr_code', 'interview_data', ['hr_code'])
    op.create_index('idx_interview_data_interview_date', 'interview_data', ['interview_date'])
    op.create_index('idx_interview_data_interview_type', 'interview_data', ['interview_type'])

    # Create eltv_input table
    op.create_table('eltv_input',
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('employee_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('resign_proba', sa.Numeric(5, 3), nullable=False),
        sa.Column('periods', sa.Integer(), server_default='36', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('hr_code'),
        sa.ForeignKeyConstraint(['hr_code'], ['hr_data_input.hr_code'], ondelete='CASCADE')
    )

    # Create eltv_output table
    op.create_table('eltv_output',
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('eltv_pre_treatment', sa.Numeric(10, 2), nullable=False),
        sa.Column('eltv_post_treatment', sa.Numeric(10, 2), nullable=False),
        sa.Column('treatment_effect', sa.Numeric(10, 2), nullable=True),
        sa.Column('survival_probabilities', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('hr_code'),
        sa.ForeignKeyConstraint(['hr_code'], ['eltv_input.hr_code'], ondelete='CASCADE')
    )
    op.create_index('idx_eltv_output_treatment_effect', 'eltv_output', ['treatment_effect'])

    # Create churn_output table
    op.create_table('churn_output',
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('resign_proba', sa.Numeric(5, 3), nullable=False),
        sa.Column('shap_values', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('confidence_score', sa.Numeric(), server_default='70.0', nullable=True),
        sa.Column('uncertainty_range', sa.String(), nullable=True),
        sa.Column('counterfactuals', sa.Text(), nullable=True),
        sa.Column('prediction_date', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('hr_code', 'dataset_id'),
        sa.ForeignKeyConstraint(['hr_code'], ['hr_data_input.hr_code'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], ondelete='CASCADE')
    )
    op.create_index('idx_churn_output_resign_proba', 'churn_output', ['resign_proba'])

    # Create churn_models table
    op.create_table('churn_models',
        sa.Column('model_id', sa.Integer(), nullable=False),
        sa.Column('model_name', sa.String(), nullable=False),
        sa.Column('parameters', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('training_data_info', sa.Text(), nullable=True),
        sa.Column('performance_metrics', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='0', nullable=True),
        sa.Column('pipeline_generated', sa.Integer(), server_default='1', nullable=True),
        sa.PrimaryKeyConstraint('model_id')
    )

    # Create business_rules table
    op.create_table('business_rules',
        sa.Column('rule_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('rule_name', sa.String(), nullable=False),
        sa.Column('rule_description', sa.Text(), nullable=True),
        sa.Column('rule_condition', sa.Text(), nullable=False),
        sa.Column('adjustment_logic', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), server_default='1', nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=True),
        sa.Column('is_custom', sa.Integer(), server_default='0', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('rule_id')
    )
    op.create_index('idx_business_rules_active', 'business_rules', ['is_active'])
    op.create_index('idx_business_rules_priority', 'business_rules', ['priority'])

    # Create behavioral_stages table
    op.create_table('behavioral_stages',
        sa.Column('stage_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('stage_name', sa.String(), nullable=False),
        sa.Column('stage_description', sa.Text(), nullable=True),
        sa.Column('min_tenure', sa.Numeric(), server_default='0', nullable=True),
        sa.Column('max_tenure', sa.Numeric(), nullable=True),
        sa.Column('stage_indicators', sa.Text(), nullable=True),
        sa.Column('base_risk_score', sa.Numeric(), server_default='0.0', nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('stage_id'),
        sa.UniqueConstraint('stage_name')
    )
    op.create_index('idx_behavioral_stages_active', 'behavioral_stages', ['is_active'])

    # Create churn_reasoning table
    op.create_table('churn_reasoning',
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('churn_risk', sa.Numeric(), nullable=False),
        sa.Column('stage', sa.String(), nullable=False),
        sa.Column('stage_score', sa.Numeric(), server_default='0.0', nullable=True),
        sa.Column('ml_score', sa.Numeric(), server_default='0.0', nullable=True),
        sa.Column('heuristic_score', sa.Numeric(), server_default='0.0', nullable=True),
        sa.Column('ml_contributors', sa.Text(), nullable=True),
        sa.Column('heuristic_alerts', sa.Text(), nullable=True),
        sa.Column('reasoning', sa.Text(), nullable=True),
        sa.Column('recommendations', sa.Text(), nullable=True),
        sa.Column('confidence_level', sa.Numeric(), server_default='0.7', nullable=True),
        sa.Column('calculation_breakdown', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('hr_code'),
        sa.ForeignKeyConstraint(['hr_code'], ['hr_data_input.hr_code'], ondelete='CASCADE')
    )
    op.create_index('idx_churn_reasoning_hr_code', 'churn_reasoning', ['hr_code'])
    op.create_index('idx_churn_reasoning_updated_at', 'churn_reasoning', ['updated_at'])
    op.create_index('idx_churn_reasoning_churn_risk', 'churn_reasoning', ['churn_risk'])
    op.create_index('idx_churn_reasoning_stage', 'churn_reasoning', ['stage'])
    op.create_index('idx_churn_reasoning_hr_code_updated', 'churn_reasoning', ['hr_code', 'updated_at'])

    # Create training_jobs table
    op.create_table('training_jobs',
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('job_id'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], ondelete='CASCADE')
    )
    op.create_index('idx_training_jobs_dataset_id', 'training_jobs', ['dataset_id'])

    # Create model_feature_importances table
    op.create_table('model_feature_importances',
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('feature_name', sa.String(), nullable=False),
        sa.Column('importance', sa.Numeric(), nullable=False),
        sa.PrimaryKeyConstraint('model_version', 'feature_name')
    )
    op.create_index('idx_feature_importance_model', 'model_feature_importances', ['model_version'])

    # Create treatment_definitions table
    op.create_table('treatment_definitions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('base_cost', sa.Numeric(), nullable=False),
        sa.Column('base_effect_size', sa.Numeric(), nullable=True),
        sa.Column('targeted_variables_json', sa.Text(), nullable=True),
        sa.Column('best_for_json', sa.Text(), nullable=True),
        sa.Column('time_to_effect', sa.String(), nullable=True),
        sa.Column('risk_levels_json', sa.Text(), nullable=True),
        sa.Column('impact_factors_json', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=True),
        sa.Column('is_custom', sa.Integer(), server_default='0', nullable=True),
        sa.Column('llm_prompt', sa.Text(), nullable=True),
        sa.Column('llm_reasoning', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_treatment_definitions_active', 'treatment_definitions', ['is_active'])
    op.create_index('idx_treatment_definitions_custom', 'treatment_definitions', ['is_custom'])

    # Create treatment_applications table
    op.create_table('treatment_applications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.String(), nullable=True),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('treatment_id', sa.Integer(), nullable=False),
        sa.Column('treatment_name', sa.String(), nullable=False),
        sa.Column('treatment_type', sa.String(), server_default='standard', nullable=True),
        sa.Column('applied_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('cost', sa.Numeric(10, 2), nullable=False),
        sa.Column('predicted_churn_reduction', sa.Numeric(), server_default='0', nullable=True),
        sa.Column('predicted_cost', sa.Numeric(10, 2), server_default='0', nullable=True),
        sa.Column('predicted_roi', sa.Numeric(), server_default='0', nullable=True),
        sa.Column('actual_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('pre_churn_probability', sa.Numeric(5, 3), nullable=False),
        sa.Column('post_churn_probability', sa.Numeric(5, 3), nullable=False),
        sa.Column('pre_eltv', sa.Numeric(10, 2), nullable=False),
        sa.Column('post_eltv', sa.Numeric(10, 2), nullable=False),
        sa.Column('roi', sa.Numeric(5, 2), nullable=False),
        sa.Column('status', sa.String(), server_default='applied', nullable=True),
        sa.Column('success_indicator', sa.String(), server_default='pending', nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('applied_by', sa.String(), server_default='system', nullable=True),
        sa.Column('follow_up_date', sa.Date(), nullable=True),
        sa.Column('ab_group', sa.String(), server_default='treatment', nullable=True),
        sa.Column('is_simulation', sa.Boolean(), server_default='false', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['hr_code'], ['hr_data_input.hr_code'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['treatment_id'], ['treatment_definitions.id'], ondelete='CASCADE')
    )
    op.create_index('idx_treatment_applications_hr_code', 'treatment_applications', ['hr_code'])
    op.create_index('idx_treatment_applications_treatment_id', 'treatment_applications', ['treatment_id'])
    op.create_index('idx_treatment_applications_applied_date', 'treatment_applications', ['applied_date'])
    op.create_index('idx_treatment_applications_success', 'treatment_applications', ['success_indicator'])
    op.create_index('idx_treatment_applications_simulation', 'treatment_applications', ['is_simulation'])

    # Create treatment_recommendations table
    op.create_table('treatment_recommendations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('recommendation_date', sa.Date(), nullable=False),
        sa.Column('churn_probability', sa.Numeric(5, 3), nullable=False),
        sa.Column('risk_level', sa.String(), nullable=False),
        sa.Column('recommended_treatments', sa.Text(), nullable=False),
        sa.Column('reasoning', sa.Text(), nullable=True),
        sa.Column('priority_score', sa.Numeric(3, 2), nullable=False),
        sa.Column('estimated_impact', sa.Numeric(5, 3), nullable=True),
        sa.Column('estimated_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('estimated_roi', sa.Numeric(8, 3), nullable=True),
        sa.Column('recommendation_status', sa.String(), server_default='pending', nullable=True),
        sa.Column('applied_treatment_id', sa.Integer(), nullable=True),
        sa.Column('rejection_reason', sa.String(), nullable=True),
        sa.Column('expires_date', sa.Date(), nullable=True),
        sa.Column('model_version', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create retention_validation table
    op.create_table('retention_validation',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('baseline_churn_prob', sa.Numeric(5, 3), nullable=False),
        sa.Column('treatment_applied', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('treatment_application_id', sa.Integer(), nullable=True),
        sa.Column('validation_date', sa.Date(), nullable=False),
        sa.Column('check_period', sa.Integer(), nullable=False),
        sa.Column('still_employed', sa.Boolean(), nullable=False),
        sa.Column('actual_churn_date', sa.Date(), nullable=True),
        sa.Column('churn_reason', sa.String(), nullable=True),
        sa.Column('new_churn_prob', sa.Numeric(5, 3), nullable=True),
        sa.Column('effectiveness_score', sa.Numeric(5, 3), nullable=True),
        sa.Column('confidence_interval_low', sa.Numeric(5, 3), nullable=True),
        sa.Column('confidence_interval_high', sa.Numeric(5, 3), nullable=True),
        sa.Column('validation_source', sa.String(), server_default='hr_sync', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_retention_val_employee_period', 'retention_validation', ['employee_id', 'check_period'])

    # Create ab_test_groups table
    op.create_table('ab_test_groups',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('test_name', sa.String(), nullable=False),
        sa.Column('test_description', sa.Text(), nullable=True),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('hr_code', sa.String(), nullable=False),
        sa.Column('group_assignment', sa.String(), nullable=False),
        sa.Column('baseline_churn_prob', sa.Numeric(5, 3), nullable=False),
        sa.Column('risk_category', sa.String(), nullable=False),
        sa.Column('department', sa.String(), nullable=True),
        sa.Column('position', sa.String(), nullable=True),
        sa.Column('tenure_months', sa.Numeric(5, 1), nullable=True),
        sa.Column('assignment_date', sa.Date(), nullable=False),
        sa.Column('test_duration_days', sa.Integer(), server_default='180', nullable=True),
        sa.Column('test_status', sa.String(), server_default='active', nullable=True),
        sa.Column('exclusion_reason', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_ab_groups_test_assignment', 'ab_test_groups', ['test_name', 'group_assignment'])

    # Create treatment_effectiveness table
    op.create_table('treatment_effectiveness',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('treatment_type', sa.String(), nullable=False),
        sa.Column('treatment_name', sa.String(), nullable=False),
        sa.Column('evaluation_period_start', sa.Date(), nullable=False),
        sa.Column('evaluation_period_end', sa.Date(), nullable=False),
        sa.Column('total_applications', sa.Integer(), nullable=False),
        sa.Column('successful_retentions', sa.Integer(), nullable=False),
        sa.Column('control_group_retentions', sa.Integer(), nullable=True),
        sa.Column('effectiveness_rate', sa.Numeric(5, 3), nullable=False),
        sa.Column('average_cost', sa.Numeric(10, 2), nullable=False),
        sa.Column('total_cost', sa.Numeric(12, 2), nullable=False),
        sa.Column('estimated_value_saved', sa.Numeric(12, 2), nullable=False),
        sa.Column('roi_ratio', sa.Numeric(8, 3), nullable=False),
        sa.Column('confidence_level', sa.Numeric(3, 2), server_default='0.95', nullable=True),
        sa.Column('statistical_significance', sa.Boolean(), server_default='false', nullable=True),
        sa.Column('sample_size', sa.Integer(), nullable=False),
        sa.Column('min_recommended_sample', sa.Integer(), server_default='30', nullable=True),
        sa.Column('risk_category_breakdown', sa.Text(), nullable=True),
        sa.Column('department_breakdown', sa.Text(), nullable=True),
        sa.Column('tenure_breakdown', sa.Text(), nullable=True),
        sa.Column('recommendations', sa.Text(), nullable=True),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create hr_sync_log table
    op.create_table('hr_sync_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('sync_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('connection_id', sa.String(), nullable=False),
        sa.Column('sync_type', sa.String(), nullable=False),
        sa.Column('records_processed', sa.Integer(), nullable=False),
        sa.Column('records_updated', sa.Integer(), nullable=False),
        sa.Column('records_new', sa.Integer(), nullable=False),
        sa.Column('records_errors', sa.Integer(), nullable=False),
        sa.Column('sync_duration_seconds', sa.Integer(), nullable=False),
        sa.Column('error_details', sa.Text(), nullable=True),
        sa.Column('success_rate', sa.Numeric(5, 3), nullable=False),
        sa.Column('sync_status', sa.String(), nullable=False),
        sa.Column('triggered_by', sa.String(), server_default='scheduled', nullable=True),
        sa.Column('next_sync_scheduled', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create model_performance table
    op.create_table('model_performance',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('evaluation_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('prediction_period', sa.Integer(), nullable=False),
        sa.Column('total_predictions', sa.Integer(), nullable=False),
        sa.Column('correct_predictions', sa.Integer(), nullable=False),
        sa.Column('false_positives', sa.Integer(), nullable=False),
        sa.Column('false_negatives', sa.Integer(), nullable=False),
        sa.Column('accuracy', sa.Numeric(5, 3), nullable=False),
        sa.Column('precision_score', sa.Numeric(5, 3), nullable=False),
        sa.Column('recall_score', sa.Numeric(5, 3), nullable=False),
        sa.Column('f1_score', sa.Numeric(5, 3), nullable=False),
        sa.Column('roc_auc', sa.Numeric(5, 3), nullable=False),
        sa.Column('calibration_score', sa.Numeric(5, 3), nullable=True),
        sa.Column('drift_score', sa.Numeric(5, 3), nullable=True),
        sa.Column('recommendations', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_model_perf_date_version', 'model_performance', ['evaluation_date', 'model_version'])

    # Create model_performance_monitoring table
    op.create_table('model_performance_monitoring',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('model_version', sa.String(), nullable=False),
        sa.Column('metric_name', sa.String(), nullable=False),
        sa.Column('metric_value', sa.Numeric(), nullable=False),
        sa.Column('sample_size', sa.Integer(), nullable=False),
        sa.Column('confidence_interval_low', sa.Numeric(), nullable=True),
        sa.Column('confidence_interval_high', sa.Numeric(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_model_performance_version', 'model_performance_monitoring', ['model_version'])

    # Create data_drift_monitoring table
    op.create_table('data_drift_monitoring',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('feature_name', sa.String(), nullable=False),
        sa.Column('drift_score', sa.Numeric(), nullable=False),
        sa.Column('p_value', sa.Numeric(), nullable=True),
        sa.Column('drift_type', sa.String(), nullable=False),
        sa.Column('reference_period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reference_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_data_drift_feature', 'data_drift_monitoring', ['feature_name'])

    # Create model_alerts table
    op.create_table('model_alerts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('details', sa.Text(), nullable=False),
        sa.Column('resolved', sa.Integer(), server_default='0', nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_model_alerts_type', 'model_alerts', ['alert_type', 'resolved'])

    # Create rag_documents table
    op.create_table('rag_documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('source_path', sa.String(), nullable=True),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create rag_chunks table
    op.create_table('rag_chunks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['rag_documents.id'], ondelete='CASCADE')
    )

    # Create chat_messages table - ALREADY CREATED IN 001
    # op.create_table('chat_messages',
    #     sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    #     sa.Column('session_id', sa.String(), nullable=False),
    #     sa.Column('employee_id', sa.String(), nullable=True),
    #     sa.Column('message', sa.Text(), nullable=False),
    #     sa.Column('role', sa.String(), nullable=False),
    #     sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    #     sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    #     sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
    #     sa.PrimaryKeyConstraint('id')
    # )
    # op.create_index('idx_chat_messages_session_id', 'chat_messages', ['session_id'])
    # op.create_index('idx_chat_messages_timestamp', 'chat_messages', ['timestamp'])

    # Update conversations table to use user_id as String (for compatibility with new auth system)
    # This will be handled in the next migration if conversations table already exists


def downgrade() -> None:
    # Drop all tables in reverse order
    op.drop_index('idx_chat_messages_timestamp', table_name='chat_messages')
    op.drop_index('idx_chat_messages_session_id', table_name='chat_messages')
    op.drop_table('chat_messages')

    op.drop_table('rag_chunks')
    op.drop_table('rag_documents')

    op.drop_index('idx_model_alerts_type', table_name='model_alerts')
    op.drop_table('model_alerts')

    op.drop_index('idx_data_drift_feature', table_name='data_drift_monitoring')
    op.drop_table('data_drift_monitoring')

    op.drop_index('idx_model_performance_version', table_name='model_performance_monitoring')
    op.drop_table('model_performance_monitoring')

    op.drop_index('idx_model_perf_date_version', table_name='model_performance')
    op.drop_table('model_performance')

    op.drop_table('hr_sync_log')
    op.drop_table('treatment_effectiveness')

    op.drop_index('idx_ab_groups_test_assignment', table_name='ab_test_groups')
    op.drop_table('ab_test_groups')

    op.drop_index('idx_retention_val_employee_period', table_name='retention_validation')
    op.drop_table('retention_validation')

    op.drop_table('treatment_recommendations')

    op.drop_index('idx_treatment_applications_simulation', table_name='treatment_applications')
    op.drop_index('idx_treatment_applications_success', table_name='treatment_applications')
    op.drop_index('idx_treatment_applications_applied_date', table_name='treatment_applications')
    op.drop_index('idx_treatment_applications_treatment_id', table_name='treatment_applications')
    op.drop_index('idx_treatment_applications_hr_code', table_name='treatment_applications')
    op.drop_table('treatment_applications')

    op.drop_index('idx_treatment_definitions_custom', table_name='treatment_definitions')
    op.drop_index('idx_treatment_definitions_active', table_name='treatment_definitions')
    op.drop_table('treatment_definitions')

    op.drop_index('idx_feature_importance_model', table_name='model_feature_importances')
    op.drop_table('model_feature_importances')

    op.drop_index('idx_training_jobs_dataset_id', table_name='training_jobs')
    op.drop_table('training_jobs')

    op.drop_index('idx_churn_reasoning_hr_code_updated', table_name='churn_reasoning')
    op.drop_index('idx_churn_reasoning_stage', table_name='churn_reasoning')
    op.drop_index('idx_churn_reasoning_churn_risk', table_name='churn_reasoning')
    op.drop_index('idx_churn_reasoning_updated_at', table_name='churn_reasoning')
    op.drop_index('idx_churn_reasoning_hr_code', table_name='churn_reasoning')
    op.drop_table('churn_reasoning')

    op.drop_index('idx_behavioral_stages_active', table_name='behavioral_stages')
    op.drop_table('behavioral_stages')

    op.drop_index('idx_business_rules_priority', table_name='business_rules')
    op.drop_index('idx_business_rules_active', table_name='business_rules')
    op.drop_table('business_rules')

    op.drop_table('churn_models')

    op.drop_index('idx_churn_output_resign_proba', table_name='churn_output')
    op.drop_table('churn_output')

    op.drop_index('idx_eltv_output_treatment_effect', table_name='eltv_output')
    op.drop_table('eltv_output')

    op.drop_table('eltv_input')

    op.drop_index('idx_interview_data_interview_type', table_name='interview_data')
    op.drop_index('idx_interview_data_interview_date', table_name='interview_data')
    op.drop_index('idx_interview_data_hr_code', table_name='interview_data')
    op.drop_table('interview_data')

    op.drop_index('idx_snapshots_report_date', table_name='employee_snapshots')
    op.drop_index('idx_snapshots_manager', table_name='employee_snapshots')
    op.drop_index('idx_snapshots_hr_code', table_name='employee_snapshots')
    op.drop_index('idx_snapshots_dataset', table_name='employee_snapshots')
    op.drop_table('employee_snapshots')

    op.drop_index('idx_hr_data_active_cost', table_name='hr_data_input')
    op.drop_index('idx_hr_data_status_hr_code', table_name='hr_data_input')
    op.drop_index('idx_hr_data_employee_cost', table_name='hr_data_input')
    op.drop_index('idx_hr_data_hr_code', table_name='hr_data_input')
    op.drop_index('idx_hr_data_structure', table_name='hr_data_input')
    op.drop_index('idx_hr_data_status', table_name='hr_data_input')
    op.drop_index('idx_hr_data_report_date', table_name='hr_data_input')
    op.drop_index('idx_hr_data_manager_id', table_name='hr_data_input')
    op.drop_table('hr_data_input')

    op.drop_index('idx_import_profiles_enabled', table_name='import_profiles')
    op.drop_table('import_profiles')

    op.drop_index('idx_scoped_projects_scope', table_name='scoped_projects')
    op.drop_table('scoped_projects')

    op.drop_index('idx_connections_type', table_name='connections')
    op.drop_index('idx_connections_name', table_name='connections')
    op.drop_table('connections')

    op.drop_index('idx_datasets_is_active', table_name='datasets')
    op.drop_index('idx_datasets_upload_date', table_name='datasets')
    op.drop_index('idx_datasets_upload_date', table_name='datasets')
    op.drop_table('datasets')
    
    op.drop_index('ix_legacy_users_username', table_name='legacy_users')
    op.drop_index('ix_legacy_users_tenant_id', table_name='legacy_users')
    op.drop_index('ix_legacy_users_id', table_name='legacy_users')
    op.drop_index('ix_legacy_users_email', table_name='legacy_users')
    op.drop_table('legacy_users')
