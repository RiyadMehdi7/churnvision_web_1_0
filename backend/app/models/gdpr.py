"""
GDPR Compliance Models for ChurnVision Enterprise (On-Premise)

Implements data subject rights tracking, consent management,
and data processing records for GDPR compliance.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Index, Enum as SQLEnum
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class ConsentType(str, enum.Enum):
    """Types of consent that can be granted."""
    DATA_PROCESSING = "data_processing"
    ANALYTICS = "analytics"
    AI_PROFILING = "ai_profiling"
    DATA_RETENTION = "data_retention"
    THIRD_PARTY_SHARING = "third_party_sharing"


class ConsentStatus(str, enum.Enum):
    """Status of consent."""
    GRANTED = "granted"
    WITHDRAWN = "withdrawn"
    PENDING = "pending"


class DataRequestType(str, enum.Enum):
    """Types of data subject requests."""
    ACCESS = "access"  # Right to access (Art. 15)
    RECTIFICATION = "rectification"  # Right to rectification (Art. 16)
    ERASURE = "erasure"  # Right to erasure (Art. 17)
    PORTABILITY = "portability"  # Right to data portability (Art. 20)
    RESTRICTION = "restriction"  # Right to restriction of processing (Art. 18)
    OBJECTION = "objection"  # Right to object (Art. 21)


class DataRequestStatus(str, enum.Enum):
    """Status of data subject requests."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LawfulBasis(str, enum.Enum):
    """Lawful basis for processing personal data (Art. 6)."""
    CONSENT = "consent"
    CONTRACT = "contract"
    LEGAL_OBLIGATION = "legal_obligation"
    VITAL_INTERESTS = "vital_interests"
    PUBLIC_TASK = "public_task"
    LEGITIMATE_INTERESTS = "legitimate_interests"


class ConsentRecord(Base):
    """
    Tracks consent given or withdrawn by data subjects.

    For on-premise deployments, consent is typically managed by the
    organization's HR department for employment-related processing.
    """
    __tablename__ = "gdpr_consent_records"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Data subject identifier (employee hr_code)
    data_subject_id = Column(String, nullable=False, index=True)
    data_subject_name = Column(String, nullable=True)

    # Consent details
    consent_type = Column(String, nullable=False)  # ConsentType value
    consent_status = Column(String, nullable=False, default=ConsentStatus.PENDING.value)

    # Consent metadata
    purpose = Column(Text, nullable=False)
    lawful_basis = Column(String, nullable=False, default=LawfulBasis.LEGITIMATE_INTERESTS.value)

    # Timestamps
    granted_at = Column(DateTime(timezone=True), nullable=True)
    withdrawn_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Audit trail
    recorded_by = Column(String, nullable=True)  # User who recorded consent
    ip_address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_consent_subject_type', 'data_subject_id', 'consent_type'),
        Index('idx_consent_status', 'consent_status'),
    )


class DataSubjectRequest(Base):
    """
    Tracks data subject access requests (DSARs) and other GDPR requests.

    Organizations must respond to DSARs within 30 days (extendable to 90 days
    for complex requests).
    """
    __tablename__ = "gdpr_data_subject_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String, unique=True, nullable=False, index=True)

    # Data subject
    data_subject_id = Column(String, nullable=False, index=True)
    data_subject_name = Column(String, nullable=True)
    data_subject_email = Column(String, nullable=True)

    # Request details
    request_type = Column(String, nullable=False)  # DataRequestType value
    request_status = Column(String, nullable=False, default=DataRequestStatus.PENDING.value)

    # Description and scope
    description = Column(Text, nullable=True)
    scope = Column(Text, nullable=True)  # JSON string of what data categories are requested

    # Verification
    identity_verified = Column(Boolean, default=False)
    verification_method = Column(String, nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(String, nullable=True)

    # Processing
    assigned_to = Column(String, nullable=True)  # User handling the request
    due_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Response
    response_summary = Column(Text, nullable=True)
    response_file_path = Column(String, nullable=True)  # Path to exported data
    rejection_reason = Column(Text, nullable=True)

    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_dsr_subject_type', 'data_subject_id', 'request_type'),
        Index('idx_dsr_status', 'request_status'),
        Index('idx_dsr_due_date', 'due_date'),
    )


class DataProcessingRecord(Base):
    """
    Records of Processing Activities (ROPA) as required by Art. 30.

    Documents what personal data is processed, why, and how.
    """
    __tablename__ = "gdpr_processing_records"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Processing activity identification
    activity_name = Column(String, nullable=False)
    activity_description = Column(Text, nullable=False)

    # Controller information (for on-premise, this is the deploying organization)
    controller_name = Column(String, nullable=True)
    controller_contact = Column(String, nullable=True)
    dpo_contact = Column(String, nullable=True)  # Data Protection Officer

    # Processing details
    purpose = Column(Text, nullable=False)
    lawful_basis = Column(String, nullable=False)

    # Data categories
    data_categories = Column(Text, nullable=False)  # JSON array of categories
    special_categories = Column(Boolean, default=False)  # Art. 9 special categories

    # Data subjects
    data_subject_categories = Column(Text, nullable=False)  # e.g., "employees"

    # Recipients
    recipients = Column(Text, nullable=True)  # JSON array of recipient categories
    third_country_transfers = Column(Boolean, default=False)
    transfer_safeguards = Column(Text, nullable=True)

    # Retention
    retention_period = Column(String, nullable=True)
    retention_criteria = Column(Text, nullable=True)

    # Security measures
    security_measures = Column(Text, nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    last_reviewed = Column(DateTime(timezone=True), nullable=True)
    next_review_date = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_processing_activity', 'activity_name'),
        Index('idx_processing_active', 'is_active'),
    )


class DataBreachRecord(Base):
    """
    Records data breaches as required by Art. 33 and 34.

    Breaches must be reported to supervisory authority within 72 hours
    if they pose a risk to data subjects.
    """
    __tablename__ = "gdpr_breach_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    breach_id = Column(String, unique=True, nullable=False, index=True)

    # Breach details
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    # When and how
    detected_at = Column(DateTime(timezone=True), nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=True)

    # Impact assessment
    data_categories_affected = Column(Text, nullable=True)  # JSON
    data_subjects_affected_count = Column(Integer, nullable=True)
    risk_level = Column(String, nullable=True)  # low, medium, high

    # Cause
    cause = Column(Text, nullable=True)
    root_cause_analysis = Column(Text, nullable=True)

    # Response
    containment_actions = Column(Text, nullable=True)
    remediation_actions = Column(Text, nullable=True)

    # Notifications
    authority_notified = Column(Boolean, default=False)
    authority_notification_date = Column(DateTime(timezone=True), nullable=True)
    authority_reference = Column(String, nullable=True)

    subjects_notified = Column(Boolean, default=False)
    subjects_notification_date = Column(DateTime(timezone=True), nullable=True)
    notification_method = Column(String, nullable=True)

    # Status
    status = Column(String, default="open")  # open, investigating, contained, resolved
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Audit
    reported_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_breach_status', 'status'),
        Index('idx_breach_detected', 'detected_at'),
    )


class ErasureLog(Base):
    """
    Audit log for data erasure operations.

    Maintains record of what was deleted and when for compliance verification.
    """
    __tablename__ = "gdpr_erasure_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Reference to data subject request (if applicable)
    request_id = Column(String, nullable=True, index=True)

    # Data subject
    data_subject_id = Column(String, nullable=False, index=True)

    # What was erased
    data_category = Column(String, nullable=False)  # e.g., "hr_data", "predictions", "chat_history"
    table_name = Column(String, nullable=False)
    records_deleted = Column(Integer, nullable=False)

    # How
    erasure_type = Column(String, nullable=False)  # "deletion", "anonymization"

    # Audit
    performed_by = Column(String, nullable=True)
    performed_at = Column(DateTime(timezone=True), server_default=func.now())

    # Verification
    verification_hash = Column(String, nullable=True)  # Hash to verify completeness
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index('idx_erasure_subject', 'data_subject_id'),
        Index('idx_erasure_performed', 'performed_at'),
    )
