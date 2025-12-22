"""
Behavioral Signals Model

Stores behavioral metadata from collaboration platforms (Slack, Teams, etc.)
for employee churn analysis. NO message content is stored - metadata only.

Privacy Compliance:
- Response times are aggregated (not per-message)
- Channel/team counts only (no names)
- Meeting hours (not content or attendees)
- Activity levels (not specific actions)
"""

from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Index, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class EmployeeBehavioralSignals(Base):
    """
    Behavioral metadata signals for employees.

    Collected from Slack, Teams, and other collaboration platforms.
    All data is aggregated/metadata-only - no message content.
    """
    __tablename__ = "employee_behavioral_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Employee reference (matches by email or hr_code)
    # Note: No FK constraint because hr_data_input has composite PK (hr_code, dataset_id)
    hr_code = Column(String, nullable=True, index=True)
    email = Column(String, nullable=False, index=True)

    # Source platform
    source = Column(String, nullable=False)  # 'slack', 'microsoft_teams', etc.
    source_user_id = Column(String, nullable=True)  # Platform-specific user ID

    # Communication patterns (aggregated, not per-message)
    avg_response_time_minutes = Column(Float, nullable=True)  # Average time to respond
    messages_per_day = Column(Float, nullable=True)  # Average daily message count
    channels_active = Column(Integer, nullable=True)  # Number of channels/teams active in
    teams_count = Column(Integer, nullable=True)  # Number of Teams teams (for MS Teams)

    # Activity patterns
    after_hours_activity_ratio = Column(Float, nullable=True)  # % of activity outside 9-5
    weekend_activity_ratio = Column(Float, nullable=True)  # % of activity on weekends
    peak_activity_hour = Column(Integer, nullable=True)  # Most active hour (0-23)

    # Meeting load (from calendar, not content)
    meeting_load_hours_weekly = Column(Float, nullable=True)  # Average weekly meeting hours
    meetings_per_week = Column(Float, nullable=True)  # Average meetings per week
    avg_meeting_duration_minutes = Column(Float, nullable=True)  # Average meeting length

    # Collaboration breadth
    collaboration_score = Column(Float, nullable=True)  # Calculated interaction breadth (0-1)
    unique_collaborators_weekly = Column(Integer, nullable=True)  # Unique people interacted with

    # Presence/status patterns
    presence_status = Column(String, nullable=True)  # Current status (Available, Busy, etc.)
    availability_ratio = Column(Float, nullable=True)  # % time available vs busy

    # Profile indicators
    profile_completeness = Column(Float, nullable=True)  # How complete is their profile (0-1)
    has_custom_status = Column(Integer, default=0)  # 1 if they use custom status

    # Metadata
    captured_at = Column(DateTime(timezone=True), server_default=func.now())
    data_period_start = Column(DateTime(timezone=True), nullable=True)  # Period covered
    data_period_end = Column(DateTime(timezone=True), nullable=True)  # Period covered
    connection_id = Column(String, ForeignKey("connections.connection_id"), nullable=True)

    # Relationships
    # Note: hr_data relationship removed because there's no FK constraint
    connection = relationship("Connection")

    def to_feature_dict(self) -> dict:
        """
        Convert to dictionary suitable for ML feature input.

        Returns only numeric/boolean features that can be used in prediction.
        """
        return {
            "avg_response_time_minutes": self.avg_response_time_minutes or 0,
            "messages_per_day": self.messages_per_day or 0,
            "channels_active": self.channels_active or 0,
            "teams_count": self.teams_count or 0,
            "after_hours_activity_ratio": self.after_hours_activity_ratio or 0,
            "weekend_activity_ratio": self.weekend_activity_ratio or 0,
            "meeting_load_hours_weekly": self.meeting_load_hours_weekly or 0,
            "meetings_per_week": self.meetings_per_week or 0,
            "collaboration_score": self.collaboration_score or 0.5,
            "unique_collaborators_weekly": self.unique_collaborators_weekly or 0,
            "availability_ratio": self.availability_ratio or 0.5,
            "profile_completeness": self.profile_completeness or 0.5,
            "has_custom_status": self.has_custom_status or 0,
        }


# Indexes for efficient querying
Index('idx_behavioral_signals_hr_code', EmployeeBehavioralSignals.hr_code)
Index('idx_behavioral_signals_email', EmployeeBehavioralSignals.email)
Index('idx_behavioral_signals_source', EmployeeBehavioralSignals.source)
Index('idx_behavioral_signals_captured', EmployeeBehavioralSignals.captured_at)
Index(
    'idx_behavioral_signals_unique',
    EmployeeBehavioralSignals.email,
    EmployeeBehavioralSignals.source,
    EmployeeBehavioralSignals.captured_at
)


class BehavioralSignalsSyncLog(Base):
    """
    Log of behavioral signals sync operations.

    Tracks when data was synced and any errors encountered.
    """
    __tablename__ = "behavioral_signals_sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    connection_id = Column(String, ForeignKey("connections.connection_id"), nullable=False)
    source = Column(String, nullable=False)  # 'slack', 'microsoft_teams'

    # Sync metadata
    sync_started_at = Column(DateTime(timezone=True), server_default=func.now())
    sync_completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="in_progress")  # in_progress, completed, failed

    # Statistics
    users_processed = Column(Integer, default=0)
    users_matched = Column(Integer, default=0)  # Successfully matched to employees
    users_unmatched = Column(Integer, default=0)  # Could not match to employees
    records_created = Column(Integer, default=0)
    records_updated = Column(Integer, default=0)

    # Error tracking
    error_count = Column(Integer, default=0)
    error_details = Column(Text, nullable=True)  # JSON array of errors

    # Period synced
    data_period_start = Column(DateTime(timezone=True), nullable=True)
    data_period_end = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    connection = relationship("Connection")


Index('idx_sync_log_connection', BehavioralSignalsSyncLog.connection_id)
Index('idx_sync_log_source', BehavioralSignalsSyncLog.source)
Index('idx_sync_log_started', BehavioralSignalsSyncLog.sync_started_at)
