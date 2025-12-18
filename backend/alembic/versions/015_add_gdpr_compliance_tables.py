"""add GDPR compliance tables

Revision ID: 015
Revises: 014
Create Date: 2024-12-18

Add tables for GDPR compliance:
- gdpr_consent_records: Track consent status for data subjects
- gdpr_data_subject_requests: Track DSARs (access, erasure, portability requests)
- gdpr_processing_records: Records of Processing Activities (ROPA) - Art. 30
- gdpr_breach_records: Data breach tracking - Art. 33/34
- gdpr_erasure_logs: Audit trail for data erasure operations
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '015'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create GDPR compliance tables."""

    # Consent Records Table
    op.create_table(
        'gdpr_consent_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('data_subject_id', sa.String(), nullable=False, index=True),
        sa.Column('data_subject_name', sa.String(), nullable=True),
        sa.Column('consent_type', sa.String(), nullable=False),
        sa.Column('consent_status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('purpose', sa.Text(), nullable=False),
        sa.Column('lawful_basis', sa.String(), nullable=False, server_default='legitimate_interests'),
        sa.Column('granted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('withdrawn_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recorded_by', sa.String(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_consent_subject_type', 'gdpr_consent_records', ['data_subject_id', 'consent_type'])
    op.create_index('idx_consent_status', 'gdpr_consent_records', ['consent_status'])

    # Data Subject Requests Table (DSARs)
    op.create_table(
        'gdpr_data_subject_requests',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('data_subject_id', sa.String(), nullable=False, index=True),
        sa.Column('data_subject_name', sa.String(), nullable=True),
        sa.Column('data_subject_email', sa.String(), nullable=True),
        sa.Column('request_type', sa.String(), nullable=False),
        sa.Column('request_status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('scope', sa.Text(), nullable=True),
        sa.Column('identity_verified', sa.Boolean(), default=False),
        sa.Column('verification_method', sa.String(), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by', sa.String(), nullable=True),
        sa.Column('assigned_to', sa.String(), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_summary', sa.Text(), nullable=True),
        sa.Column('response_file_path', sa.String(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_dsr_subject_type', 'gdpr_data_subject_requests', ['data_subject_id', 'request_type'])
    op.create_index('idx_dsr_status', 'gdpr_data_subject_requests', ['request_status'])
    op.create_index('idx_dsr_due_date', 'gdpr_data_subject_requests', ['due_date'])

    # Processing Records Table (ROPA - Records of Processing Activities)
    op.create_table(
        'gdpr_processing_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('activity_name', sa.String(), nullable=False),
        sa.Column('activity_description', sa.Text(), nullable=False),
        sa.Column('controller_name', sa.String(), nullable=True),
        sa.Column('controller_contact', sa.String(), nullable=True),
        sa.Column('dpo_contact', sa.String(), nullable=True),
        sa.Column('purpose', sa.Text(), nullable=False),
        sa.Column('lawful_basis', sa.String(), nullable=False),
        sa.Column('data_categories', sa.Text(), nullable=False),
        sa.Column('special_categories', sa.Boolean(), default=False),
        sa.Column('data_subject_categories', sa.Text(), nullable=False),
        sa.Column('recipients', sa.Text(), nullable=True),
        sa.Column('third_country_transfers', sa.Boolean(), default=False),
        sa.Column('transfer_safeguards', sa.Text(), nullable=True),
        sa.Column('retention_period', sa.String(), nullable=True),
        sa.Column('retention_criteria', sa.Text(), nullable=True),
        sa.Column('security_measures', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('last_reviewed', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_review_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_processing_activity', 'gdpr_processing_records', ['activity_name'])
    op.create_index('idx_processing_active', 'gdpr_processing_records', ['is_active'])

    # Data Breach Records Table
    op.create_table(
        'gdpr_breach_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('breach_id', sa.String(), unique=True, nullable=False, index=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_categories_affected', sa.Text(), nullable=True),
        sa.Column('data_subjects_affected_count', sa.Integer(), nullable=True),
        sa.Column('risk_level', sa.String(), nullable=True),
        sa.Column('cause', sa.Text(), nullable=True),
        sa.Column('root_cause_analysis', sa.Text(), nullable=True),
        sa.Column('containment_actions', sa.Text(), nullable=True),
        sa.Column('remediation_actions', sa.Text(), nullable=True),
        sa.Column('authority_notified', sa.Boolean(), default=False),
        sa.Column('authority_notification_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('authority_reference', sa.String(), nullable=True),
        sa.Column('subjects_notified', sa.Boolean(), default=False),
        sa.Column('subjects_notification_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notification_method', sa.String(), nullable=True),
        sa.Column('status', sa.String(), default='open'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reported_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_breach_status', 'gdpr_breach_records', ['status'])
    op.create_index('idx_breach_detected', 'gdpr_breach_records', ['detected_at'])

    # Erasure Logs Table (Audit trail for data deletion)
    op.create_table(
        'gdpr_erasure_logs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.String(), nullable=True, index=True),
        sa.Column('data_subject_id', sa.String(), nullable=False, index=True),
        sa.Column('data_category', sa.String(), nullable=False),
        sa.Column('table_name', sa.String(), nullable=False),
        sa.Column('records_deleted', sa.Integer(), nullable=False),
        sa.Column('erasure_type', sa.String(), nullable=False),
        sa.Column('performed_by', sa.String(), nullable=True),
        sa.Column('performed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('verification_hash', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('idx_erasure_subject', 'gdpr_erasure_logs', ['data_subject_id'])
    op.create_index('idx_erasure_performed', 'gdpr_erasure_logs', ['performed_at'])

    # Insert default processing records for ChurnVision
    op.execute("""
        INSERT INTO gdpr_processing_records (
            activity_name, activity_description, purpose, lawful_basis,
            data_categories, data_subject_categories, retention_period,
            security_measures, is_active
        ) VALUES
        (
            'Employee Churn Prediction',
            'ML-based analysis of employee data to predict turnover risk and enable proactive retention interventions.',
            'Identify employees at risk of leaving to enable timely retention actions and workforce planning.',
            'legitimate_interests',
            '["hr_data", "employment_history", "performance_metrics", "engagement_data"]',
            'employees',
            '365 days for predictions, 90 days for anonymized departed employees',
            'Encryption at rest and in transit, role-based access control, audit logging',
            true
        ),
        (
            'AI-Assisted HR Analysis',
            'LLM-powered chatbot for HR analytics queries and employee insights.',
            'Provide HR managers with intelligent analysis tools for workforce management.',
            'legitimate_interests',
            '["hr_data", "chat_history", "analysis_results"]',
            'employees',
            '30 days for chat history',
            'Local LLM processing (Ollama), no external data transfer, access logging',
            true
        ),
        (
            'Treatment Effectiveness Tracking',
            'Monitor and validate the effectiveness of retention interventions.',
            'Measure ROI of retention programs and improve future interventions.',
            'legitimate_interests',
            '["treatment_data", "outcome_data", "validation_metrics"]',
            'employees',
            '365 days',
            'Aggregated reporting, individual data anonymization after retention period',
            true
        )
    """)


def downgrade() -> None:
    """Drop GDPR compliance tables."""
    op.drop_index('idx_erasure_performed', table_name='gdpr_erasure_logs')
    op.drop_index('idx_erasure_subject', table_name='gdpr_erasure_logs')
    op.drop_table('gdpr_erasure_logs')

    op.drop_index('idx_breach_detected', table_name='gdpr_breach_records')
    op.drop_index('idx_breach_status', table_name='gdpr_breach_records')
    op.drop_table('gdpr_breach_records')

    op.drop_index('idx_processing_active', table_name='gdpr_processing_records')
    op.drop_index('idx_processing_activity', table_name='gdpr_processing_records')
    op.drop_table('gdpr_processing_records')

    op.drop_index('idx_dsr_due_date', table_name='gdpr_data_subject_requests')
    op.drop_index('idx_dsr_status', table_name='gdpr_data_subject_requests')
    op.drop_index('idx_dsr_subject_type', table_name='gdpr_data_subject_requests')
    op.drop_table('gdpr_data_subject_requests')

    op.drop_index('idx_consent_status', table_name='gdpr_consent_records')
    op.drop_index('idx_consent_subject_type', table_name='gdpr_consent_records')
    op.drop_table('gdpr_consent_records')
