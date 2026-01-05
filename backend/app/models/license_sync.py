"""
License Synchronization Models for Admin Panel Integration.

Tracks license validation sync attempts and caches license state
for offline operation with grace periods.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON, Index
from sqlalchemy.sql import func
from app.db.base_class import Base


class LicenseSyncLog(Base):
    """
    Records all license validation sync attempts with Admin Panel.

    Used for:
    - Audit trail of all sync operations
    - Debugging connectivity issues
    - Monitoring sync health
    """
    __tablename__ = "license_sync_logs"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    sync_type = Column(String(50), nullable=False, index=True)  # validation, health, telemetry, config
    status = Column(String(20), nullable=False, index=True)  # success, failed, timeout, error
    response_code = Column(Integer, nullable=True)
    response_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    installation_id = Column(String(64), nullable=True)
    tenant_slug = Column(String(100), nullable=True)


Index('idx_license_sync_logs_created_at', LicenseSyncLog.created_at)
Index('idx_license_sync_logs_type_status', LicenseSyncLog.sync_type, LicenseSyncLog.status)


class LicenseState(Base):
    """
    Cached license state for offline operation.

    Stores the last successfully validated license information
    to allow offline operation during grace periods when
    Admin Panel is unreachable.
    """
    __tablename__ = "license_state"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, autoincrement=True)
    license_id = Column(String(64), nullable=False, unique=True, index=True)
    license_tier = Column(String(20), nullable=False)  # starter, pro, enterprise
    company_name = Column(String(255), nullable=True)
    max_employees = Column(Integer, nullable=True)
    features = Column(JSON, nullable=True)  # List of enabled feature flags
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Sync tracking
    last_online_validation = Column(DateTime(timezone=True), nullable=False, index=True)
    last_validation_status = Column(String(20), nullable=False)  # valid, invalid, expired, revoked

    # Revocation tracking
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revocation_reason = Column(String(255), nullable=True)
    grace_period_ends = Column(DateTime(timezone=True), nullable=True)

    # Status
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


Index('idx_license_state_is_active', LicenseState.is_active)
Index('idx_license_state_last_validation', LicenseState.last_online_validation)


class TelemetrySnapshot(Base):
    """
    Stores telemetry snapshots for reporting to Admin Panel.

    Captures point-in-time metrics that are periodically
    sent to the Admin Panel for usage tracking.
    """
    __tablename__ = "telemetry_snapshots"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Health metrics
    database_healthy = Column(Boolean, nullable=True)
    cache_healthy = Column(Boolean, nullable=True)
    uptime_seconds = Column(Integer, nullable=True)

    # Usage metrics
    active_users_count = Column(Integer, nullable=True)
    predictions_count = Column(Integer, nullable=True)
    api_requests_count = Column(Integer, nullable=True)
    error_count = Column(Integer, nullable=True)

    # Performance metrics
    avg_response_time_ms = Column(Integer, nullable=True)
    p95_response_time_ms = Column(Integer, nullable=True)

    # Sync status
    sent_to_admin_panel = Column(Boolean, default=False, nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)


Index('idx_telemetry_snapshots_timestamp', TelemetrySnapshot.timestamp)
Index('idx_telemetry_snapshots_sent', TelemetrySnapshot.sent_to_admin_panel)
