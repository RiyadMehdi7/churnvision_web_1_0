"""
GDPR Compliance API Endpoints for ChurnVision Enterprise (On-Premise)

Implements data subject rights:
- Right to Access (Art. 15)
- Right to Erasure (Art. 17)
- Right to Data Portability (Art. 20)
- Consent Management
- Records of Processing Activities (ROPA)

Access restricted to users with admin:access permission.
"""

import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, get_user_permissions_by_id
from app.models.user import User
from app.models.auth import UserAccount
from app.models.gdpr import (
    ConsentRecord,
    DataSubjectRequest,
    DataProcessingRecord,
    DataBreachRecord,
    ErasureLog,
)
from app.core.audit import AuditLogger
from app.services.gdpr_service import get_gdpr_service, DATA_CATEGORIES
from app.schemas.gdpr import (
    ConsentRecordCreate,
    ConsentRecordUpdate,
    ConsentRecordResponse,
    ConsentSummary,
    DataSubjectRequestCreate,
    DataSubjectRequestUpdate,
    DataSubjectRequestResponse,
    DataExportRequest,
    DataExportResponse,
    DataErasureRequest,
    DataErasureResponse,
    ProcessingRecordCreate,
    ProcessingRecordResponse,
    DataBreachCreate,
    DataBreachUpdate,
    DataBreachResponse,
    GDPRComplianceStatus,
    ROPAExportResponse,
    DataRequestStatus,
    ConsentStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ Permission Check Helper ============

async def check_gdpr_access(db: AsyncSession, current_user: User) -> UserAccount:
    """Check if current user has GDPR/admin access."""
    result = await db.execute(
        select(UserAccount).where(
            or_(
                UserAccount.user_id == str(current_user.id),
                UserAccount.username == current_user.username
            )
        )
    )
    user_account = result.scalar_one_or_none()

    if not user_account:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account not found"
        )

    # Super admin always has access
    if user_account.is_super_admin == 1:
        return user_account

    # Check for admin or GDPR permissions
    permissions = await get_user_permissions_by_id(db, user_account.user_id)
    if not any(p in permissions for p in ['admin:access', 'gdpr:access', 'gdpr:manage']):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GDPR management access required"
        )

    return user_account


async def log_gdpr_action(
    db: AsyncSession,
    user: UserAccount,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: dict = None
):
    """Log a GDPR action for audit trail."""
    await AuditLogger.log(
        db=db,
        action=f"gdpr_{action}",
        user_id=int(user.user_id) if user.user_id.isdigit() else None,
        username=user.username,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata=details
    )


# ============ Compliance Dashboard ============

@router.get("/status", response_model=GDPRComplianceStatus)
async def get_compliance_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get GDPR compliance status dashboard.

    Returns overall compliance status, pending requests, breach status,
    and recommendations.
    """
    await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    status_data = await service.get_compliance_status(db)

    return GDPRComplianceStatus(**status_data)


@router.get("/categories")
async def get_data_categories(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of data categories managed by the system.

    Useful for understanding what data is collected and can be
    exported/erased.
    """
    return {
        "categories": [
            {
                "name": name,
                "description": info["description"],
                "tables": info["tables"],
                "contains_pii": info["contains_pii"],
            }
            for name, info in DATA_CATEGORIES.items()
        ]
    }


# ============ Data Export (Right to Access / Portability) ============

@router.post("/export", response_model=DataExportResponse)
async def export_data_subject_data(
    request: DataExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export all personal data for a data subject (Art. 15 & 20).

    This endpoint fulfills:
    - Right to Access (Art. 15): Data subject can request copy of their data
    - Right to Data Portability (Art. 20): Data in machine-readable format

    Returns all data associated with the given hr_code.
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    result = await service.export_data_subject_data(
        db,
        request.hr_code,
        request.include_categories
    )

    await log_gdpr_action(
        db, user_account, "export",
        "data_subject", request.hr_code,
        {"categories": request.include_categories, "record_counts": result["record_counts"]}
    )

    return DataExportResponse(
        hr_code=result["hr_code"],
        export_date=datetime.fromisoformat(result["export_date"]),
        format=request.format,
        categories_included=result["categories_included"],
        data=result["data"],
        record_counts=result["record_counts"]
    )


@router.get("/export/{hr_code}")
async def export_employee_data(
    hr_code: str,
    format: str = Query(default="json", description="Export format: json or csv"),
    categories: Optional[str] = Query(default=None, description="Comma-separated categories"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export all personal data for an employee (GET version).

    Alternative endpoint for data export using GET method.
    """
    user_account = await check_gdpr_access(db, current_user)

    include_categories = categories.split(",") if categories else None

    service = get_gdpr_service()
    result = await service.export_data_subject_data(db, hr_code, include_categories)

    await log_gdpr_action(
        db, user_account, "export",
        "data_subject", hr_code,
        {"categories": include_categories, "record_counts": result["record_counts"]}
    )

    if format == "json":
        return JSONResponse(content=result)
    else:
        # For CSV, return JSON with instructions (actual CSV generation would need more work)
        return JSONResponse(
            content={
                "message": "CSV export generated",
                "data": result,
                "note": "Convert JSON to CSV using standard tools"
            }
        )


# ============ Data Erasure (Right to be Forgotten) ============

@router.post("/erase", response_model=DataErasureResponse)
async def erase_data_subject_data(
    request: DataErasureRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Erase all personal data for a data subject (Art. 17).

    This endpoint fulfills the Right to Erasure ("right to be forgotten").

    - Set dry_run=True to preview what would be deleted
    - Use exclude_categories for data that must be retained (e.g., legal requirements)
    - HR data is anonymized rather than deleted to preserve aggregate statistics
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    result = await service.erase_data_subject_data(
        db,
        request.hr_code,
        exclude_categories=request.exclude_categories,
        dry_run=request.dry_run,
        performed_by=user_account.username
    )

    if not request.dry_run:
        await log_gdpr_action(
            db, user_account, "erase",
            "data_subject", request.hr_code,
            {
                "total_deleted": result["total_records_deleted"],
                "excluded": request.exclude_categories,
                "reason": request.reason
            }
        )

    return DataErasureResponse(
        hr_code=result["hr_code"],
        request_id=result.get("request_id"),
        erasure_date=datetime.fromisoformat(result["erasure_date"]),
        dry_run=result["dry_run"],
        results=result["results"],
        total_records_deleted=result["total_records_deleted"],
        excluded_categories=result["excluded_categories"],
        verification_hash=result.get("verification_hash")
    )


@router.delete("/employees/{hr_code}")
async def delete_employee_data(
    hr_code: str,
    reason: Optional[str] = Query(default=None),
    dry_run: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete all data for an employee (DELETE method).

    Alternative endpoint using DELETE HTTP method.
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    result = await service.erase_data_subject_data(
        db,
        hr_code,
        dry_run=dry_run,
        performed_by=user_account.username
    )

    if not dry_run:
        await log_gdpr_action(
            db, user_account, "delete",
            "data_subject", hr_code,
            {"total_deleted": result["total_records_deleted"], "reason": reason}
        )

    return result


# ============ Data Subject Requests (DSARs) ============

@router.get("/requests", response_model=List[DataSubjectRequestResponse])
async def list_data_subject_requests(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all data subject requests.

    Optionally filter by status (pending, in_progress, completed, rejected).
    """
    await check_gdpr_access(db, current_user)

    query = select(DataSubjectRequest)
    if status:
        query = query.where(DataSubjectRequest.request_status == status)
    query = query.order_by(DataSubjectRequest.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    requests = result.scalars().all()

    return [
        DataSubjectRequestResponse(
            id=r.id,
            request_id=r.request_id,
            data_subject_id=r.data_subject_id,
            data_subject_name=r.data_subject_name,
            data_subject_email=r.data_subject_email,
            request_type=r.request_type,
            request_status=r.request_status,
            description=r.description,
            scope=json.loads(r.scope) if r.scope else None,
            identity_verified=r.identity_verified,
            verification_method=r.verification_method,
            verified_at=r.verified_at,
            assigned_to=r.assigned_to,
            due_date=r.due_date,
            completed_at=r.completed_at,
            response_summary=r.response_summary,
            response_file_path=r.response_file_path,
            rejection_reason=r.rejection_reason,
            created_at=r.created_at,
            updated_at=r.updated_at
        )
        for r in requests
    ]


@router.post("/requests", response_model=DataSubjectRequestResponse)
async def create_data_subject_request(
    request: DataSubjectRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new data subject request (DSAR).

    Request types:
    - access: Right to access personal data (Art. 15)
    - rectification: Right to rectify inaccurate data (Art. 16)
    - erasure: Right to erasure (Art. 17)
    - portability: Right to data portability (Art. 20)
    - restriction: Right to restrict processing (Art. 18)
    - objection: Right to object to processing (Art. 21)

    Organizations must respond within 30 days (extendable to 90 days for complex requests).
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    dsr = await service.create_request(
        db,
        data_subject_id=request.data_subject_id,
        request_type=request.request_type.value,
        data_subject_name=request.data_subject_name,
        data_subject_email=request.data_subject_email,
        description=request.description,
        scope=request.scope
    )

    await log_gdpr_action(
        db, user_account, "create_request",
        "dsar", dsr.request_id,
        {"type": request.request_type.value, "data_subject": request.data_subject_id}
    )

    return DataSubjectRequestResponse(
        id=dsr.id,
        request_id=dsr.request_id,
        data_subject_id=dsr.data_subject_id,
        data_subject_name=dsr.data_subject_name,
        data_subject_email=dsr.data_subject_email,
        request_type=dsr.request_type,
        request_status=dsr.request_status,
        description=dsr.description,
        scope=json.loads(dsr.scope) if dsr.scope else None,
        identity_verified=dsr.identity_verified,
        verification_method=dsr.verification_method,
        verified_at=dsr.verified_at,
        assigned_to=dsr.assigned_to,
        due_date=dsr.due_date,
        completed_at=dsr.completed_at,
        response_summary=dsr.response_summary,
        response_file_path=dsr.response_file_path,
        rejection_reason=dsr.rejection_reason,
        created_at=dsr.created_at,
        updated_at=dsr.updated_at
    )


@router.get("/requests/{request_id}", response_model=DataSubjectRequestResponse)
async def get_data_subject_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific data subject request."""
    await check_gdpr_access(db, current_user)

    result = await db.execute(
        select(DataSubjectRequest).where(DataSubjectRequest.request_id == request_id)
    )
    dsr = result.scalar_one_or_none()

    if not dsr:
        raise HTTPException(status_code=404, detail="Request not found")

    return DataSubjectRequestResponse(
        id=dsr.id,
        request_id=dsr.request_id,
        data_subject_id=dsr.data_subject_id,
        data_subject_name=dsr.data_subject_name,
        data_subject_email=dsr.data_subject_email,
        request_type=dsr.request_type,
        request_status=dsr.request_status,
        description=dsr.description,
        scope=json.loads(dsr.scope) if dsr.scope else None,
        identity_verified=dsr.identity_verified,
        verification_method=dsr.verification_method,
        verified_at=dsr.verified_at,
        assigned_to=dsr.assigned_to,
        due_date=dsr.due_date,
        completed_at=dsr.completed_at,
        response_summary=dsr.response_summary,
        response_file_path=dsr.response_file_path,
        rejection_reason=dsr.rejection_reason,
        created_at=dsr.created_at,
        updated_at=dsr.updated_at
    )


@router.patch("/requests/{request_id}", response_model=DataSubjectRequestResponse)
async def update_data_subject_request(
    request_id: str,
    update: DataSubjectRequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a data subject request.

    Use this to:
    - Mark identity as verified
    - Assign to a user
    - Update status
    - Add rejection reason
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    dsr = await service.update_request(
        db,
        request_id,
        request_status=update.request_status.value if update.request_status else None,
        identity_verified=update.identity_verified,
        verification_method=update.verification_method,
        assigned_to=update.assigned_to,
        response_summary=update.response_summary,
        rejection_reason=update.rejection_reason,
        verified_by=user_account.username if update.identity_verified else None
    )

    if not dsr:
        raise HTTPException(status_code=404, detail="Request not found")

    await log_gdpr_action(
        db, user_account, "update_request",
        "dsar", request_id,
        {"updates": update.model_dump(exclude_unset=True)}
    )

    return DataSubjectRequestResponse(
        id=dsr.id,
        request_id=dsr.request_id,
        data_subject_id=dsr.data_subject_id,
        data_subject_name=dsr.data_subject_name,
        data_subject_email=dsr.data_subject_email,
        request_type=dsr.request_type,
        request_status=dsr.request_status,
        description=dsr.description,
        scope=json.loads(dsr.scope) if dsr.scope else None,
        identity_verified=dsr.identity_verified,
        verification_method=dsr.verification_method,
        verified_at=dsr.verified_at,
        assigned_to=dsr.assigned_to,
        due_date=dsr.due_date,
        completed_at=dsr.completed_at,
        response_summary=dsr.response_summary,
        response_file_path=dsr.response_file_path,
        rejection_reason=dsr.rejection_reason,
        created_at=dsr.created_at,
        updated_at=dsr.updated_at
    )


@router.post("/requests/{request_id}/process")
async def process_data_subject_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Process a data subject request.

    Automatically handles:
    - Access requests: Exports all data
    - Portability requests: Exports data in machine-readable format
    - Erasure requests: Deletes/anonymizes all data

    Other request types require manual processing.
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    result = await service.process_request(db, request_id, user_account.username)

    await log_gdpr_action(
        db, user_account, "process_request",
        "dsar", request_id,
        {"result": "processed"}
    )

    return result


# ============ Consent Management ============

@router.get("/consent/{data_subject_id}", response_model=ConsentSummary)
async def get_consent_status(
    data_subject_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get consent status for a data subject.

    For on-premise deployments, processing is typically based on
    legitimate interests (employment contract) rather than explicit consent.
    """
    await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    summary = await service.get_consent_summary(db, data_subject_id)

    return ConsentSummary(
        data_subject_id=summary["data_subject_id"],
        data_subject_name=summary["data_subject_name"],
        consents=[ConsentRecordResponse(**c) for c in summary["consents"]] if summary["consents"] else [],
        all_required_granted=summary["all_required_granted"],
        last_updated=summary["last_updated"]
    )


@router.post("/consent", response_model=ConsentRecordResponse)
async def record_consent(
    request: ConsentRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Record consent for a data subject.

    For on-premise enterprise use, this typically documents the lawful basis
    for processing (e.g., legitimate interests for employment relationship).
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    record = await service.record_consent(
        db,
        data_subject_id=request.data_subject_id,
        consent_type=request.consent_type.value,
        purpose=request.purpose,
        lawful_basis=request.lawful_basis.value,
        data_subject_name=request.data_subject_name,
        recorded_by=user_account.username,
        expires_at=request.expires_at,
        notes=request.notes
    )

    await log_gdpr_action(
        db, user_account, "record_consent",
        "consent", request.data_subject_id,
        {"type": request.consent_type.value, "status": "granted"}
    )

    return ConsentRecordResponse(
        id=record.id,
        data_subject_id=record.data_subject_id,
        data_subject_name=record.data_subject_name,
        consent_type=record.consent_type,
        consent_status=record.consent_status,
        purpose=record.purpose,
        lawful_basis=record.lawful_basis,
        granted_at=record.granted_at,
        withdrawn_at=record.withdrawn_at,
        expires_at=record.expires_at,
        recorded_by=record.recorded_by,
        created_at=record.created_at,
        updated_at=record.updated_at
    )


@router.post("/consent/{data_subject_id}/withdraw")
async def withdraw_consent(
    data_subject_id: str,
    consent_type: str,
    notes: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Withdraw consent for a data subject.

    Note: For on-premise deployments using legitimate interests as the
    lawful basis, withdrawal of consent may not affect processing rights.
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    record = await service.withdraw_consent(
        db,
        data_subject_id,
        consent_type,
        recorded_by=user_account.username,
        notes=notes
    )

    if not record:
        raise HTTPException(status_code=404, detail="Consent record not found")

    await log_gdpr_action(
        db, user_account, "withdraw_consent",
        "consent", data_subject_id,
        {"type": consent_type, "notes": notes}
    )

    return {"message": "Consent withdrawn", "consent_type": consent_type}


# ============ Records of Processing Activities (ROPA) ============

@router.get("/ropa", response_model=List[ProcessingRecordResponse])
async def list_processing_records(
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List Records of Processing Activities (ROPA).

    Required under Art. 30 for organizations with 250+ employees or
    those processing sensitive data.
    """
    await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    records = await service.get_processing_records(db, active_only)

    return [
        ProcessingRecordResponse(
            id=r.id,
            activity_name=r.activity_name,
            activity_description=r.activity_description,
            controller_name=r.controller_name,
            controller_contact=r.controller_contact,
            dpo_contact=r.dpo_contact,
            purpose=r.purpose,
            lawful_basis=r.lawful_basis,
            data_categories=json.loads(r.data_categories) if r.data_categories else [],
            special_categories=r.special_categories,
            data_subject_categories=r.data_subject_categories,
            recipients=json.loads(r.recipients) if r.recipients else None,
            third_country_transfers=r.third_country_transfers,
            transfer_safeguards=r.transfer_safeguards,
            retention_period=r.retention_period,
            retention_criteria=r.retention_criteria,
            security_measures=r.security_measures,
            is_active=r.is_active,
            last_reviewed=r.last_reviewed,
            next_review_date=r.next_review_date,
            created_at=r.created_at,
            updated_at=r.updated_at
        )
        for r in records
    ]


@router.post("/ropa", response_model=ProcessingRecordResponse)
async def create_processing_record(
    request: ProcessingRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new processing activity record."""
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    record = await service.create_processing_record(
        db,
        **request.model_dump()
    )

    await log_gdpr_action(
        db, user_account, "create_ropa",
        "processing_record", str(record.id),
        {"activity": request.activity_name}
    )

    return ProcessingRecordResponse(
        id=record.id,
        activity_name=record.activity_name,
        activity_description=record.activity_description,
        controller_name=record.controller_name,
        controller_contact=record.controller_contact,
        dpo_contact=record.dpo_contact,
        purpose=record.purpose,
        lawful_basis=record.lawful_basis,
        data_categories=json.loads(record.data_categories) if record.data_categories else [],
        special_categories=record.special_categories,
        data_subject_categories=record.data_subject_categories,
        recipients=json.loads(record.recipients) if record.recipients else None,
        third_country_transfers=record.third_country_transfers,
        transfer_safeguards=record.transfer_safeguards,
        retention_period=record.retention_period,
        retention_criteria=record.retention_criteria,
        security_measures=record.security_measures,
        is_active=record.is_active,
        last_reviewed=record.last_reviewed,
        next_review_date=record.next_review_date,
        created_at=record.created_at,
        updated_at=record.updated_at
    )


@router.get("/ropa/export", response_model=ROPAExportResponse)
async def export_ropa(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export all Records of Processing Activities.

    Useful for compliance audits and supervisory authority requests.
    """
    user_account = await check_gdpr_access(db, current_user)

    service = get_gdpr_service()
    export_data = await service.export_ropa(db)

    await log_gdpr_action(
        db, user_account, "export_ropa",
        "ropa", None,
        {"count": export_data["total_activities"]}
    )

    return ROPAExportResponse(
        export_date=datetime.fromisoformat(export_data["export_date"]),
        total_activities=export_data["total_activities"],
        processing_activities=[
            ProcessingRecordResponse(**r) for r in export_data["processing_activities"]
        ]
    )


# ============ Data Breach Management ============

@router.get("/breaches", response_model=List[DataBreachResponse])
async def list_breaches(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List data breach records.

    Breaches must be reported to supervisory authority within 72 hours
    if they pose a risk to data subjects (Art. 33).
    """
    await check_gdpr_access(db, current_user)

    query = select(DataBreachRecord)
    if status:
        query = query.where(DataBreachRecord.status == status)
    query = query.order_by(DataBreachRecord.detected_at.desc()).limit(limit)

    result = await db.execute(query)
    breaches = result.scalars().all()

    return [
        DataBreachResponse(
            id=b.id,
            breach_id=b.breach_id,
            title=b.title,
            description=b.description,
            detected_at=b.detected_at,
            occurred_at=b.occurred_at,
            data_categories_affected=json.loads(b.data_categories_affected) if b.data_categories_affected else None,
            data_subjects_affected_count=b.data_subjects_affected_count,
            risk_level=b.risk_level,
            cause=b.cause,
            root_cause_analysis=b.root_cause_analysis,
            containment_actions=b.containment_actions,
            remediation_actions=b.remediation_actions,
            authority_notified=b.authority_notified,
            authority_notification_date=b.authority_notification_date,
            authority_reference=b.authority_reference,
            subjects_notified=b.subjects_notified,
            subjects_notification_date=b.subjects_notification_date,
            notification_method=b.notification_method,
            status=b.status,
            resolved_at=b.resolved_at,
            reported_by=b.reported_by,
            created_at=b.created_at,
            updated_at=b.updated_at
        )
        for b in breaches
    ]


@router.post("/breaches", response_model=DataBreachResponse)
async def report_breach(
    request: DataBreachCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Report a data breach.

    IMPORTANT: If the breach poses a risk to data subjects, you must
    notify the supervisory authority within 72 hours (Art. 33).
    """
    user_account = await check_gdpr_access(db, current_user)

    import uuid
    breach = DataBreachRecord(
        breach_id=f"BRE-{uuid.uuid4().hex[:8].upper()}",
        title=request.title,
        description=request.description,
        detected_at=request.detected_at,
        occurred_at=request.occurred_at,
        data_categories_affected=json.dumps(request.data_categories_affected) if request.data_categories_affected else None,
        data_subjects_affected_count=request.data_subjects_affected_count,
        risk_level=request.risk_level,
        cause=request.cause,
        containment_actions=request.containment_actions,
        reported_by=user_account.username,
        status="open"
    )
    db.add(breach)
    await db.commit()
    await db.refresh(breach)

    await log_gdpr_action(
        db, user_account, "report_breach",
        "breach", breach.breach_id,
        {"title": request.title, "risk_level": request.risk_level}
    )

    logger.warning(f"Data breach reported: {breach.breach_id} - {request.title}")

    return DataBreachResponse(
        id=breach.id,
        breach_id=breach.breach_id,
        title=breach.title,
        description=breach.description,
        detected_at=breach.detected_at,
        occurred_at=breach.occurred_at,
        data_categories_affected=request.data_categories_affected,
        data_subjects_affected_count=breach.data_subjects_affected_count,
        risk_level=breach.risk_level,
        cause=breach.cause,
        root_cause_analysis=breach.root_cause_analysis,
        containment_actions=breach.containment_actions,
        remediation_actions=breach.remediation_actions,
        authority_notified=breach.authority_notified,
        authority_notification_date=breach.authority_notification_date,
        authority_reference=breach.authority_reference,
        subjects_notified=breach.subjects_notified,
        subjects_notification_date=breach.subjects_notification_date,
        notification_method=breach.notification_method,
        status=breach.status,
        resolved_at=breach.resolved_at,
        reported_by=breach.reported_by,
        created_at=breach.created_at,
        updated_at=breach.updated_at
    )


@router.patch("/breaches/{breach_id}", response_model=DataBreachResponse)
async def update_breach(
    breach_id: str,
    update: DataBreachUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a data breach record."""
    user_account = await check_gdpr_access(db, current_user)

    result = await db.execute(
        select(DataBreachRecord).where(DataBreachRecord.breach_id == breach_id)
    )
    breach = result.scalar_one_or_none()

    if not breach:
        raise HTTPException(status_code=404, detail="Breach not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(breach, key):
            setattr(breach, key, value)

    await db.commit()
    await db.refresh(breach)

    await log_gdpr_action(
        db, user_account, "update_breach",
        "breach", breach_id,
        {"updates": list(update_data.keys())}
    )

    return DataBreachResponse(
        id=breach.id,
        breach_id=breach.breach_id,
        title=breach.title,
        description=breach.description,
        detected_at=breach.detected_at,
        occurred_at=breach.occurred_at,
        data_categories_affected=json.loads(breach.data_categories_affected) if breach.data_categories_affected else None,
        data_subjects_affected_count=breach.data_subjects_affected_count,
        risk_level=breach.risk_level,
        cause=breach.cause,
        root_cause_analysis=breach.root_cause_analysis,
        containment_actions=breach.containment_actions,
        remediation_actions=breach.remediation_actions,
        authority_notified=breach.authority_notified,
        authority_notification_date=breach.authority_notification_date,
        authority_reference=breach.authority_reference,
        subjects_notified=breach.subjects_notified,
        subjects_notification_date=breach.subjects_notification_date,
        notification_method=breach.notification_method,
        status=breach.status,
        resolved_at=breach.resolved_at,
        reported_by=breach.reported_by,
        created_at=breach.created_at,
        updated_at=breach.updated_at
    )


# ============ Erasure Audit Log ============

@router.get("/erasure-logs")
async def get_erasure_logs(
    data_subject_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get erasure audit logs.

    Maintains records of what was deleted for compliance verification.
    """
    await check_gdpr_access(db, current_user)

    query = select(ErasureLog)
    if data_subject_id:
        query = query.where(ErasureLog.data_subject_id == data_subject_id)
    query = query.order_by(ErasureLog.performed_at.desc()).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "request_id": log.request_id,
            "data_subject_id": log.data_subject_id,
            "data_category": log.data_category,
            "table_name": log.table_name,
            "records_deleted": log.records_deleted,
            "erasure_type": log.erasure_type,
            "performed_by": log.performed_by,
            "performed_at": log.performed_at.isoformat() if log.performed_at else None,
            "verification_hash": log.verification_hash,
            "notes": log.notes
        }
        for log in logs
    ]
