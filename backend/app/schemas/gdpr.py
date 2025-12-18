"""
GDPR API Schemas for ChurnVision Enterprise (On-Premise)

Defines request/response models for GDPR compliance endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============ Enums ============

class ConsentType(str, Enum):
    DATA_PROCESSING = "data_processing"
    ANALYTICS = "analytics"
    AI_PROFILING = "ai_profiling"
    DATA_RETENTION = "data_retention"
    THIRD_PARTY_SHARING = "third_party_sharing"


class ConsentStatus(str, Enum):
    GRANTED = "granted"
    WITHDRAWN = "withdrawn"
    PENDING = "pending"


class DataRequestType(str, Enum):
    ACCESS = "access"
    RECTIFICATION = "rectification"
    ERASURE = "erasure"
    PORTABILITY = "portability"
    RESTRICTION = "restriction"
    OBJECTION = "objection"


class DataRequestStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LawfulBasis(str, Enum):
    CONSENT = "consent"
    CONTRACT = "contract"
    LEGAL_OBLIGATION = "legal_obligation"
    VITAL_INTERESTS = "vital_interests"
    PUBLIC_TASK = "public_task"
    LEGITIMATE_INTERESTS = "legitimate_interests"


# ============ Consent Schemas ============

class ConsentRecordBase(BaseModel):
    data_subject_id: str = Field(..., description="HR code of the data subject (employee)")
    consent_type: ConsentType
    purpose: str = Field(..., description="Purpose of data processing")
    lawful_basis: LawfulBasis = LawfulBasis.LEGITIMATE_INTERESTS


class ConsentRecordCreate(ConsentRecordBase):
    data_subject_name: Optional[str] = None
    notes: Optional[str] = None
    expires_at: Optional[datetime] = None


class ConsentRecordUpdate(BaseModel):
    consent_status: ConsentStatus
    notes: Optional[str] = None


class ConsentRecordResponse(ConsentRecordBase):
    id: int
    data_subject_name: Optional[str] = None
    consent_status: ConsentStatus
    granted_at: Optional[datetime] = None
    withdrawn_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    recorded_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConsentSummary(BaseModel):
    """Summary of consent status for a data subject."""
    data_subject_id: str
    data_subject_name: Optional[str] = None
    consents: List[ConsentRecordResponse]
    all_required_granted: bool
    last_updated: Optional[datetime] = None


# ============ Data Subject Request Schemas ============

class DataSubjectRequestCreate(BaseModel):
    data_subject_id: str = Field(..., description="HR code of the data subject")
    data_subject_name: Optional[str] = None
    data_subject_email: Optional[str] = None
    request_type: DataRequestType
    description: Optional[str] = None
    scope: Optional[List[str]] = Field(
        default=None,
        description="Categories of data requested (e.g., ['hr_data', 'predictions', 'chat_history'])"
    )


class DataSubjectRequestUpdate(BaseModel):
    request_status: Optional[DataRequestStatus] = None
    identity_verified: Optional[bool] = None
    verification_method: Optional[str] = None
    assigned_to: Optional[str] = None
    response_summary: Optional[str] = None
    rejection_reason: Optional[str] = None


class DataSubjectRequestResponse(BaseModel):
    id: int
    request_id: str
    data_subject_id: str
    data_subject_name: Optional[str] = None
    data_subject_email: Optional[str] = None
    request_type: DataRequestType
    request_status: DataRequestStatus
    description: Optional[str] = None
    scope: Optional[List[str]] = None
    identity_verified: bool
    verification_method: Optional[str] = None
    verified_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    response_summary: Optional[str] = None
    response_file_path: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ Data Export Schemas ============

class DataExportRequest(BaseModel):
    """Request to export all data for a data subject."""
    hr_code: str = Field(..., description="HR code of the employee")
    format: str = Field(default="json", description="Export format: json or csv")
    include_categories: Optional[List[str]] = Field(
        default=None,
        description="Specific categories to include. If None, exports all."
    )


class DataExportResponse(BaseModel):
    """Response containing exported data."""
    hr_code: str
    export_date: datetime
    format: str
    categories_included: List[str]
    data: Dict[str, Any]
    record_counts: Dict[str, int]


class DataExportFileResponse(BaseModel):
    """Response with file path for large exports."""
    hr_code: str
    export_date: datetime
    file_path: str
    file_size_bytes: int
    expires_at: datetime


# ============ Data Erasure Schemas ============

class DataErasureRequest(BaseModel):
    """Request to erase all data for a data subject."""
    hr_code: str = Field(..., description="HR code of the employee")
    reason: Optional[str] = Field(default=None, description="Reason for erasure")
    exclude_categories: Optional[List[str]] = Field(
        default=None,
        description="Categories to exclude from erasure (e.g., for legal retention)"
    )
    dry_run: bool = Field(
        default=False,
        description="If True, shows what would be deleted without actually deleting"
    )


class ErasureResult(BaseModel):
    """Result of erasure for a single data category."""
    category: str
    table_name: str
    records_deleted: int
    erasure_type: str  # "deletion" or "anonymization"


class DataErasureResponse(BaseModel):
    """Response containing erasure results."""
    hr_code: str
    request_id: Optional[str] = None
    erasure_date: datetime
    dry_run: bool
    results: List[ErasureResult]
    total_records_deleted: int
    excluded_categories: List[str]
    verification_hash: Optional[str] = None


# ============ Processing Records (ROPA) Schemas ============

class ProcessingRecordCreate(BaseModel):
    activity_name: str
    activity_description: str
    purpose: str
    lawful_basis: LawfulBasis
    data_categories: List[str]
    data_subject_categories: str = "employees"
    special_categories: bool = False
    recipients: Optional[List[str]] = None
    third_country_transfers: bool = False
    transfer_safeguards: Optional[str] = None
    retention_period: Optional[str] = None
    retention_criteria: Optional[str] = None
    security_measures: Optional[str] = None
    controller_name: Optional[str] = None
    controller_contact: Optional[str] = None
    dpo_contact: Optional[str] = None


class ProcessingRecordResponse(BaseModel):
    id: int
    activity_name: str
    activity_description: str
    controller_name: Optional[str] = None
    controller_contact: Optional[str] = None
    dpo_contact: Optional[str] = None
    purpose: str
    lawful_basis: str
    data_categories: List[str]
    special_categories: bool
    data_subject_categories: str
    recipients: Optional[List[str]] = None
    third_country_transfers: bool
    transfer_safeguards: Optional[str] = None
    retention_period: Optional[str] = None
    retention_criteria: Optional[str] = None
    security_measures: Optional[str] = None
    is_active: bool
    last_reviewed: Optional[datetime] = None
    next_review_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ Data Breach Schemas ============

class DataBreachCreate(BaseModel):
    title: str
    description: str
    detected_at: datetime
    occurred_at: Optional[datetime] = None
    data_categories_affected: Optional[List[str]] = None
    data_subjects_affected_count: Optional[int] = None
    risk_level: Optional[str] = Field(default="medium", description="low, medium, or high")
    cause: Optional[str] = None
    containment_actions: Optional[str] = None


class DataBreachUpdate(BaseModel):
    status: Optional[str] = None
    root_cause_analysis: Optional[str] = None
    remediation_actions: Optional[str] = None
    authority_notified: Optional[bool] = None
    authority_notification_date: Optional[datetime] = None
    authority_reference: Optional[str] = None
    subjects_notified: Optional[bool] = None
    subjects_notification_date: Optional[datetime] = None
    notification_method: Optional[str] = None
    resolved_at: Optional[datetime] = None


class DataBreachResponse(BaseModel):
    id: int
    breach_id: str
    title: str
    description: str
    detected_at: datetime
    occurred_at: Optional[datetime] = None
    data_categories_affected: Optional[List[str]] = None
    data_subjects_affected_count: Optional[int] = None
    risk_level: Optional[str] = None
    cause: Optional[str] = None
    root_cause_analysis: Optional[str] = None
    containment_actions: Optional[str] = None
    remediation_actions: Optional[str] = None
    authority_notified: bool
    authority_notification_date: Optional[datetime] = None
    authority_reference: Optional[str] = None
    subjects_notified: bool
    subjects_notification_date: Optional[datetime] = None
    notification_method: Optional[str] = None
    status: str
    resolved_at: Optional[datetime] = None
    reported_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ Compliance Dashboard Schemas ============

class GDPRComplianceStatus(BaseModel):
    """Overall GDPR compliance status for the dashboard."""
    overall_status: str  # "compliant", "review_needed", "action_required"

    # Consent status
    total_data_subjects: int
    subjects_with_valid_consent: int
    consent_coverage_percent: float

    # Data subject requests
    pending_requests: int
    overdue_requests: int
    completed_requests_30_days: int

    # Data retention
    retention_policy_active: bool
    last_retention_cleanup: Optional[datetime] = None
    records_pending_cleanup: int

    # Breach status
    open_breaches: int
    breaches_last_90_days: int

    # Processing records
    active_processing_activities: int
    activities_needing_review: int

    # Recommendations
    recommendations: List[str]

    generated_at: datetime


class ROPAExportResponse(BaseModel):
    """Records of Processing Activities export."""
    organization_name: Optional[str] = None
    dpo_contact: Optional[str] = None
    export_date: datetime
    processing_activities: List[ProcessingRecordResponse]
    total_activities: int
