"""add license sync and telemetry tables

Revision ID: 020
Revises: 019
Create Date: 2025-02-25

Adds:
- license_sync_logs: Tracks all sync attempts with Admin Panel
- license_state: Caches license state for offline operation
- telemetry_snapshots: Stores telemetry data for reporting
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '020'
down_revision: Union[str, None] = '019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # Create license_sync_logs table
    # =========================================================================
    op.create_table(
        'license_sync_logs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('sync_type', sa.String(50), nullable=False),  # validation, health, telemetry, config
        sa.Column('status', sa.String(20), nullable=False),  # success, failed, timeout, error
        sa.Column('response_code', sa.Integer(), nullable=True),
        sa.Column('response_data', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('installation_id', sa.String(64), nullable=True),
        sa.Column('tenant_slug', sa.String(100), nullable=True),
    )

    # Indexes for license_sync_logs
    op.create_index('idx_license_sync_logs_created_at', 'license_sync_logs', ['created_at'])
    op.create_index('idx_license_sync_logs_sync_type', 'license_sync_logs', ['sync_type'])
    op.create_index('idx_license_sync_logs_status', 'license_sync_logs', ['status'])
    op.create_index('idx_license_sync_logs_type_status', 'license_sync_logs', ['sync_type', 'status'])

    # =========================================================================
    # Create license_state table
    # =========================================================================
    op.create_table(
        'license_state',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('license_id', sa.String(64), nullable=False, unique=True),
        sa.Column('license_tier', sa.String(20), nullable=False),  # starter, pro, enterprise
        sa.Column('company_name', sa.String(255), nullable=True),
        sa.Column('max_employees', sa.Integer(), nullable=True),
        sa.Column('features', sa.JSON(), nullable=True),  # List of enabled feature flags
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),

        # Sync tracking
        sa.Column('last_online_validation', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_validation_status', sa.String(20), nullable=False),  # valid, invalid, expired, revoked

        # Revocation tracking
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revocation_reason', sa.String(255), nullable=True),
        sa.Column('grace_period_ends', sa.DateTime(timezone=True), nullable=True),

        # Status
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Indexes for license_state
    op.create_index('idx_license_state_license_id', 'license_state', ['license_id'], unique=True)
    op.create_index('idx_license_state_is_active', 'license_state', ['is_active'])
    op.create_index('idx_license_state_last_validation', 'license_state', ['last_online_validation'])

    # =========================================================================
    # Create telemetry_snapshots table
    # =========================================================================
    op.create_table(
        'telemetry_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),

        # Health metrics
        sa.Column('database_healthy', sa.Boolean(), nullable=True),
        sa.Column('cache_healthy', sa.Boolean(), nullable=True),
        sa.Column('uptime_seconds', sa.Integer(), nullable=True),

        # Usage metrics
        sa.Column('active_users_count', sa.Integer(), nullable=True),
        sa.Column('predictions_count', sa.Integer(), nullable=True),
        sa.Column('api_requests_count', sa.Integer(), nullable=True),
        sa.Column('error_count', sa.Integer(), nullable=True),

        # Performance metrics
        sa.Column('avg_response_time_ms', sa.Integer(), nullable=True),
        sa.Column('p95_response_time_ms', sa.Integer(), nullable=True),

        # Sync status
        sa.Column('sent_to_admin_panel', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Indexes for telemetry_snapshots
    op.create_index('idx_telemetry_snapshots_timestamp', 'telemetry_snapshots', ['timestamp'])
    op.create_index('idx_telemetry_snapshots_sent', 'telemetry_snapshots', ['sent_to_admin_panel'])


def downgrade() -> None:
    # =========================================================================
    # Drop telemetry_snapshots table
    # =========================================================================
    op.drop_index('idx_telemetry_snapshots_sent', table_name='telemetry_snapshots')
    op.drop_index('idx_telemetry_snapshots_timestamp', table_name='telemetry_snapshots')
    op.drop_table('telemetry_snapshots')

    # =========================================================================
    # Drop license_state table
    # =========================================================================
    op.drop_index('idx_license_state_last_validation', table_name='license_state')
    op.drop_index('idx_license_state_is_active', table_name='license_state')
    op.drop_index('idx_license_state_license_id', table_name='license_state')
    op.drop_table('license_state')

    # =========================================================================
    # Drop license_sync_logs table
    # =========================================================================
    op.drop_index('idx_license_sync_logs_type_status', table_name='license_sync_logs')
    op.drop_index('idx_license_sync_logs_status', table_name='license_sync_logs')
    op.drop_index('idx_license_sync_logs_sync_type', table_name='license_sync_logs')
    op.drop_index('idx_license_sync_logs_created_at', table_name='license_sync_logs')
    op.drop_table('license_sync_logs')
