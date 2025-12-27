"""add HRIS connectors and behavioral signals tables

Revision ID: 019
Revises: 018
Create Date: 2025-02-22

Adds:
- New columns to connections table for HRIS/HCM integrations
- employee_behavioral_signals table for Slack/Teams metadata
- behavioral_signals_sync_log table for tracking syncs
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '019'
down_revision: Union[str, None] = '018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # Extend connections table for HRIS connectors
    # =========================================================================

    # HRIS Connector type
    op.add_column('connections', sa.Column('connector_type', sa.String(), nullable=True))

    # OAuth2 credentials
    op.add_column('connections', sa.Column('oauth_client_id', sa.String(), nullable=True))
    op.add_column('connections', sa.Column('oauth_client_secret_encrypted', sa.String(500), nullable=True))
    op.add_column('connections', sa.Column('oauth_access_token_encrypted', sa.String(1000), nullable=True))
    op.add_column('connections', sa.Column('oauth_refresh_token_encrypted', sa.String(500), nullable=True))
    op.add_column('connections', sa.Column('oauth_token_expires_at', sa.DateTime(timezone=True), nullable=True))

    # API key authentication
    op.add_column('connections', sa.Column('api_key_encrypted', sa.String(500), nullable=True))
    op.add_column('connections', sa.Column('api_endpoint', sa.String(), nullable=True))
    op.add_column('connections', sa.Column('tenant_id', sa.String(), nullable=True))

    # Sync configuration
    op.add_column('connections', sa.Column('sync_frequency_minutes', sa.Integer(), server_default='1440'))
    op.add_column('connections', sa.Column('last_sync_status', sa.String(), nullable=True))
    op.add_column('connections', sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('connections', sa.Column('last_sync_records', sa.Integer(), nullable=True))
    op.add_column('connections', sa.Column('last_sync_error', sa.Text(), nullable=True))

    # Connector-specific configuration
    op.add_column('connections', sa.Column('connector_config', sa.JSON(), nullable=True))

    # Add indexes
    op.create_index('idx_connections_connector_type', 'connections', ['connector_type'])
    op.create_index('idx_connections_last_sync_status', 'connections', ['last_sync_status'])

    # =========================================================================
    # Create employee_behavioral_signals table
    # =========================================================================
    op.create_table(
        'employee_behavioral_signals',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),

        # Employee reference (hr_code is stored for soft-linking, no FK since hr_data_input has composite PK)
        sa.Column('hr_code', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=False),

        # Source platform
        sa.Column('source', sa.String(), nullable=False),  # 'slack', 'microsoft_teams'
        sa.Column('source_user_id', sa.String(), nullable=True),

        # Communication patterns (aggregated)
        sa.Column('avg_response_time_minutes', sa.Float(), nullable=True),
        sa.Column('messages_per_day', sa.Float(), nullable=True),
        sa.Column('channels_active', sa.Integer(), nullable=True),
        sa.Column('teams_count', sa.Integer(), nullable=True),

        # Activity patterns
        sa.Column('after_hours_activity_ratio', sa.Float(), nullable=True),
        sa.Column('weekend_activity_ratio', sa.Float(), nullable=True),
        sa.Column('peak_activity_hour', sa.Integer(), nullable=True),

        # Meeting load
        sa.Column('meeting_load_hours_weekly', sa.Float(), nullable=True),
        sa.Column('meetings_per_week', sa.Float(), nullable=True),
        sa.Column('avg_meeting_duration_minutes', sa.Float(), nullable=True),

        # Collaboration metrics
        sa.Column('collaboration_score', sa.Float(), nullable=True),
        sa.Column('unique_collaborators_weekly', sa.Integer(), nullable=True),

        # Presence/status
        sa.Column('presence_status', sa.String(), nullable=True),
        sa.Column('availability_ratio', sa.Float(), nullable=True),

        # Profile indicators
        sa.Column('profile_completeness', sa.Float(), nullable=True),
        sa.Column('has_custom_status', sa.Integer(), server_default='0'),

        # Metadata
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('data_period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('connection_id', sa.String(), sa.ForeignKey('connections.connection_id', ondelete='SET NULL'), nullable=True),
    )

    # Indexes
    op.create_index('idx_behavioral_signals_hr_code', 'employee_behavioral_signals', ['hr_code'])
    op.create_index('idx_behavioral_signals_email', 'employee_behavioral_signals', ['email'])
    op.create_index('idx_behavioral_signals_source', 'employee_behavioral_signals', ['source'])
    op.create_index('idx_behavioral_signals_captured', 'employee_behavioral_signals', ['captured_at'])
    op.create_index(
        'idx_behavioral_signals_unique',
        'employee_behavioral_signals',
        ['email', 'source', 'captured_at']
    )

    # =========================================================================
    # Create behavioral_signals_sync_log table
    # =========================================================================
    op.create_table(
        'behavioral_signals_sync_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('connection_id', sa.String(), sa.ForeignKey('connections.connection_id', ondelete='CASCADE'), nullable=False),
        sa.Column('source', sa.String(), nullable=False),

        # Sync metadata
        sa.Column('sync_started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('sync_completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='in_progress'),

        # Statistics
        sa.Column('users_processed', sa.Integer(), server_default='0'),
        sa.Column('users_matched', sa.Integer(), server_default='0'),
        sa.Column('users_unmatched', sa.Integer(), server_default='0'),
        sa.Column('records_created', sa.Integer(), server_default='0'),
        sa.Column('records_updated', sa.Integer(), server_default='0'),

        # Error tracking
        sa.Column('error_count', sa.Integer(), server_default='0'),
        sa.Column('error_details', sa.Text(), nullable=True),

        # Period synced
        sa.Column('data_period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('data_period_end', sa.DateTime(timezone=True), nullable=True),
    )

    # Indexes
    op.create_index('idx_sync_log_connection', 'behavioral_signals_sync_log', ['connection_id'])
    op.create_index('idx_sync_log_source', 'behavioral_signals_sync_log', ['source'])
    op.create_index('idx_sync_log_started', 'behavioral_signals_sync_log', ['sync_started_at'])
    op.create_index('idx_sync_log_status', 'behavioral_signals_sync_log', ['status'])


def downgrade() -> None:
    # =========================================================================
    # Drop behavioral_signals_sync_log table
    # =========================================================================
    op.drop_index('idx_sync_log_status', table_name='behavioral_signals_sync_log')
    op.drop_index('idx_sync_log_started', table_name='behavioral_signals_sync_log')
    op.drop_index('idx_sync_log_source', table_name='behavioral_signals_sync_log')
    op.drop_index('idx_sync_log_connection', table_name='behavioral_signals_sync_log')
    op.drop_table('behavioral_signals_sync_log')

    # =========================================================================
    # Drop employee_behavioral_signals table
    # =========================================================================
    op.drop_index('idx_behavioral_signals_unique', table_name='employee_behavioral_signals')
    op.drop_index('idx_behavioral_signals_captured', table_name='employee_behavioral_signals')
    op.drop_index('idx_behavioral_signals_source', table_name='employee_behavioral_signals')
    op.drop_index('idx_behavioral_signals_email', table_name='employee_behavioral_signals')
    op.drop_index('idx_behavioral_signals_hr_code', table_name='employee_behavioral_signals')
    op.drop_table('employee_behavioral_signals')

    # =========================================================================
    # Remove HRIS connector columns from connections
    # =========================================================================
    op.drop_index('idx_connections_last_sync_status', table_name='connections')
    op.drop_index('idx_connections_connector_type', table_name='connections')

    op.drop_column('connections', 'connector_config')
    op.drop_column('connections', 'last_sync_error')
    op.drop_column('connections', 'last_sync_records')
    op.drop_column('connections', 'last_sync_at')
    op.drop_column('connections', 'last_sync_status')
    op.drop_column('connections', 'sync_frequency_minutes')
    op.drop_column('connections', 'tenant_id')
    op.drop_column('connections', 'api_endpoint')
    op.drop_column('connections', 'api_key_encrypted')
    op.drop_column('connections', 'oauth_token_expires_at')
    op.drop_column('connections', 'oauth_refresh_token_encrypted')
    op.drop_column('connections', 'oauth_access_token_encrypted')
    op.drop_column('connections', 'oauth_client_secret_encrypted')
    op.drop_column('connections', 'oauth_client_id')
    op.drop_column('connections', 'connector_type')
