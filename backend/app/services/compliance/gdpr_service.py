"""
GDPR Compliance Service for ChurnVision Enterprise (On-Premise)

Implements data subject rights:
- Right to Access (Art. 15) - Export all personal data
- Right to Erasure (Art. 17) - Delete/anonymize personal data
- Right to Portability (Art. 20) - Export in machine-readable format
- Consent Management
- Records of Processing Activities (ROPA)
"""

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gdpr import (
    ConsentRecord,
    DataSubjectRequest,
    DataProcessingRecord,
    DataBreachRecord,
    ErasureLog,
)
from app.models.hr_data import HRDataInput, InterviewData, EmployeeSnapshot
from app.models.churn import ChurnOutput, ChurnReasoning, ELTVInput, ELTVOutput
from app.models.treatment import (
    TreatmentApplication,
    TreatmentRecommendation,
    RetentionValidation,
    ABTestGroup,
)
from app.models.chatbot import ChatMessage, Conversation, Message
from app.schemas.gdpr import (
    ConsentStatus,
    DataRequestType,
    DataRequestStatus,
    LawfulBasis,
    ErasureResult,
)

logger = logging.getLogger("churnvision.gdpr")


# Data categories and their associated tables
DATA_CATEGORIES = {
    "hr_data": {
        "description": "Basic HR information (name, position, tenure, etc.)",
        "tables": ["hr_data_input"],
        "contains_pii": True,
    },
    "predictions": {
        "description": "Churn predictions and risk assessments",
        "tables": ["churn_output", "churn_reasoning", "eltv_input", "eltv_output"],
        "contains_pii": False,
    },
    "treatments": {
        "description": "Treatment applications and recommendations",
        "tables": ["treatment_applications", "treatment_recommendations"],
        "contains_pii": False,
    },
    "interviews": {
        "description": "Interview data and notes",
        "tables": ["interview_data"],
        "contains_pii": True,
    },
    "chat_history": {
        "description": "AI chat conversations about the employee",
        "tables": ["chat_messages"],
        "contains_pii": True,
    },
    "validation": {
        "description": "Retention validation and A/B test data",
        "tables": ["retention_validation", "ab_test_groups"],
        "contains_pii": False,
    },
    "snapshots": {
        "description": "Historical employee snapshots",
        "tables": ["employee_snapshots"],
        "contains_pii": True,
    },
}


class GDPRService:
    """
    Service for GDPR compliance operations.

    For on-premise deployments:
    - Data never leaves the organization's infrastructure
    - Consent is typically based on employment contract (legitimate interests)
    - Organization acts as data controller
    """

    # ==================== DATA EXPORT ====================

    async def export_data_subject_data(
        self,
        db: AsyncSession,
        hr_code: str,
        include_categories: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Export all personal data for a data subject (Right to Access/Portability).

        Args:
            db: Database session
            hr_code: Employee HR code
            include_categories: Specific categories to include, or None for all

        Returns:
            Dictionary containing all data organized by category
        """
        categories = include_categories or list(DATA_CATEGORIES.keys())
        export_data: Dict[str, Any] = {}
        record_counts: Dict[str, int] = {}

        for category in categories:
            if category not in DATA_CATEGORIES:
                continue

            category_data = await self._export_category(db, hr_code, category)
            export_data[category] = category_data
            record_counts[category] = len(category_data) if isinstance(category_data, list) else (1 if category_data else 0)

        return {
            "hr_code": hr_code,
            "export_date": datetime.utcnow().isoformat(),
            "categories_included": categories,
            "data": export_data,
            "record_counts": record_counts,
        }

    async def _export_category(
        self, db: AsyncSession, hr_code: str, category: str
    ) -> Any:
        """Export data for a specific category."""

        if category == "hr_data":
            result = await db.execute(
                select(HRDataInput).where(HRDataInput.hr_code == hr_code)
            )
            rows = result.scalars().all()
            return [self._model_to_dict(row) for row in rows]

        elif category == "predictions":
            data = {}
            # Churn outputs
            result = await db.execute(
                select(ChurnOutput).where(ChurnOutput.hr_code == hr_code)
            )
            data["churn_predictions"] = [self._model_to_dict(r) for r in result.scalars().all()]

            # Churn reasoning
            result = await db.execute(
                select(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code)
            )
            row = result.scalar_one_or_none()
            data["churn_reasoning"] = self._model_to_dict(row) if row else None

            # ELTV
            result = await db.execute(
                select(ELTVInput).where(ELTVInput.hr_code == hr_code)
            )
            row = result.scalar_one_or_none()
            data["eltv_input"] = self._model_to_dict(row) if row else None

            result = await db.execute(
                select(ELTVOutput).where(ELTVOutput.hr_code == hr_code)
            )
            row = result.scalar_one_or_none()
            data["eltv_output"] = self._model_to_dict(row) if row else None

            return data

        elif category == "treatments":
            data = {}
            result = await db.execute(
                select(TreatmentApplication).where(TreatmentApplication.hr_code == hr_code)
            )
            data["applications"] = [self._model_to_dict(r) for r in result.scalars().all()]

            result = await db.execute(
                select(TreatmentRecommendation).where(TreatmentRecommendation.hr_code == hr_code)
            )
            data["recommendations"] = [self._model_to_dict(r) for r in result.scalars().all()]

            return data

        elif category == "interviews":
            result = await db.execute(
                select(InterviewData).where(InterviewData.hr_code == hr_code)
            )
            return [self._model_to_dict(r) for r in result.scalars().all()]

        elif category == "chat_history":
            result = await db.execute(
                select(ChatMessage).where(ChatMessage.employee_id == hr_code)
            )
            return [self._model_to_dict(r) for r in result.scalars().all()]

        elif category == "validation":
            data = {}
            result = await db.execute(
                select(RetentionValidation).where(RetentionValidation.hr_code == hr_code)
            )
            data["retention_validation"] = [self._model_to_dict(r) for r in result.scalars().all()]

            result = await db.execute(
                select(ABTestGroup).where(ABTestGroup.hr_code == hr_code)
            )
            data["ab_test_groups"] = [self._model_to_dict(r) for r in result.scalars().all()]

            return data

        elif category == "snapshots":
            result = await db.execute(
                select(EmployeeSnapshot).where(EmployeeSnapshot.hr_code == hr_code)
            )
            return [self._model_to_dict(r) for r in result.scalars().all()]

        return []

    def _model_to_dict(self, model: Any) -> Optional[Dict[str, Any]]:
        """Convert SQLAlchemy model to dictionary."""
        if model is None:
            return None

        result = {}
        for column in model.__table__.columns:
            value = getattr(model, column.name)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif hasattr(value, "__dict__"):
                value = str(value)
            result[column.name] = value
        return result

    # ==================== DATA ERASURE ====================

    async def erase_data_subject_data(
        self,
        db: AsyncSession,
        hr_code: str,
        request_id: Optional[str] = None,
        exclude_categories: Optional[List[str]] = None,
        dry_run: bool = False,
        performed_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Erase all personal data for a data subject (Right to Erasure).

        Args:
            db: Database session
            hr_code: Employee HR code
            request_id: Associated data subject request ID
            exclude_categories: Categories to exclude (e.g., for legal retention)
            dry_run: If True, shows what would be deleted without actually deleting
            performed_by: Username of person performing erasure

        Returns:
            Dictionary with erasure results
        """
        categories_to_erase = [
            cat for cat in DATA_CATEGORIES.keys()
            if not exclude_categories or cat not in exclude_categories
        ]

        results: List[ErasureResult] = []
        total_deleted = 0

        for category in categories_to_erase:
            category_results = await self._erase_category(
                db, hr_code, category, dry_run, request_id, performed_by
            )
            results.extend(category_results)
            total_deleted += sum(r.records_deleted for r in category_results)

        if not dry_run:
            await db.commit()

        # Generate verification hash
        verification_hash = hashlib.sha256(
            f"{hr_code}:{datetime.utcnow().isoformat()}:{total_deleted}".encode()
        ).hexdigest()[:16]

        return {
            "hr_code": hr_code,
            "request_id": request_id,
            "erasure_date": datetime.utcnow().isoformat(),
            "dry_run": dry_run,
            "results": [
                {
                    "category": r.category,
                    "table_name": r.table_name,
                    "records_deleted": r.records_deleted,
                    "erasure_type": r.erasure_type,
                }
                for r in results
            ],
            "total_records_deleted": total_deleted,
            "excluded_categories": exclude_categories or [],
            "verification_hash": verification_hash,
        }

    async def _erase_category(
        self,
        db: AsyncSession,
        hr_code: str,
        category: str,
        dry_run: bool,
        request_id: Optional[str],
        performed_by: Optional[str],
    ) -> List[ErasureResult]:
        """Erase data for a specific category."""
        results = []

        if category == "hr_data":
            # Anonymize instead of delete to preserve aggregate statistics
            result = await db.execute(
                select(func.count()).select_from(HRDataInput).where(HRDataInput.hr_code == hr_code)
            )
            count = result.scalar() or 0

            if count > 0 and not dry_run:
                await db.execute(
                    update(HRDataInput)
                    .where(HRDataInput.hr_code == hr_code)
                    .values(
                        full_name=f"ERASED_{hr_code[:8]}",
                        additional_data=None,
                    )
                )
                await self._log_erasure(
                    db, hr_code, "hr_data", "hr_data_input", count,
                    "anonymization", request_id, performed_by
                )

            results.append(ErasureResult(
                category="hr_data",
                table_name="hr_data_input",
                records_deleted=count,
                erasure_type="anonymization"
            ))

        elif category == "predictions":
            # Delete churn outputs
            result = await db.execute(
                select(func.count()).select_from(ChurnOutput).where(ChurnOutput.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ChurnOutput).where(ChurnOutput.hr_code == hr_code))
                await self._log_erasure(
                    db, hr_code, "predictions", "churn_output", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="predictions", table_name="churn_output",
                records_deleted=count, erasure_type="deletion"
            ))

            # Delete churn reasoning
            result = await db.execute(
                select(func.count()).select_from(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code))
                await self._log_erasure(
                    db, hr_code, "predictions", "churn_reasoning", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="predictions", table_name="churn_reasoning",
                records_deleted=count, erasure_type="deletion"
            ))

            # Delete ELTV data
            result = await db.execute(
                select(func.count()).select_from(ELTVOutput).where(ELTVOutput.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ELTVOutput).where(ELTVOutput.hr_code == hr_code))
            results.append(ErasureResult(
                category="predictions", table_name="eltv_output",
                records_deleted=count, erasure_type="deletion"
            ))

            result = await db.execute(
                select(func.count()).select_from(ELTVInput).where(ELTVInput.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ELTVInput).where(ELTVInput.hr_code == hr_code))
            results.append(ErasureResult(
                category="predictions", table_name="eltv_input",
                records_deleted=count, erasure_type="deletion"
            ))

        elif category == "treatments":
            result = await db.execute(
                select(func.count()).select_from(TreatmentApplication).where(TreatmentApplication.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(TreatmentApplication).where(TreatmentApplication.hr_code == hr_code))
                await self._log_erasure(
                    db, hr_code, "treatments", "treatment_applications", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="treatments", table_name="treatment_applications",
                records_deleted=count, erasure_type="deletion"
            ))

            result = await db.execute(
                select(func.count()).select_from(TreatmentRecommendation).where(TreatmentRecommendation.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(TreatmentRecommendation).where(TreatmentRecommendation.hr_code == hr_code))
            results.append(ErasureResult(
                category="treatments", table_name="treatment_recommendations",
                records_deleted=count, erasure_type="deletion"
            ))

        elif category == "interviews":
            result = await db.execute(
                select(func.count()).select_from(InterviewData).where(InterviewData.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(InterviewData).where(InterviewData.hr_code == hr_code))
                await self._log_erasure(
                    db, hr_code, "interviews", "interview_data", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="interviews", table_name="interview_data",
                records_deleted=count, erasure_type="deletion"
            ))

        elif category == "chat_history":
            result = await db.execute(
                select(func.count()).select_from(ChatMessage).where(ChatMessage.employee_id == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ChatMessage).where(ChatMessage.employee_id == hr_code))
                await self._log_erasure(
                    db, hr_code, "chat_history", "chat_messages", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="chat_history", table_name="chat_messages",
                records_deleted=count, erasure_type="deletion"
            ))

        elif category == "validation":
            result = await db.execute(
                select(func.count()).select_from(RetentionValidation).where(RetentionValidation.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(RetentionValidation).where(RetentionValidation.hr_code == hr_code))
            results.append(ErasureResult(
                category="validation", table_name="retention_validation",
                records_deleted=count, erasure_type="deletion"
            ))

            result = await db.execute(
                select(func.count()).select_from(ABTestGroup).where(ABTestGroup.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(ABTestGroup).where(ABTestGroup.hr_code == hr_code))
            results.append(ErasureResult(
                category="validation", table_name="ab_test_groups",
                records_deleted=count, erasure_type="deletion"
            ))

        elif category == "snapshots":
            result = await db.execute(
                select(func.count()).select_from(EmployeeSnapshot).where(EmployeeSnapshot.hr_code == hr_code)
            )
            count = result.scalar() or 0
            if count > 0 and not dry_run:
                await db.execute(delete(EmployeeSnapshot).where(EmployeeSnapshot.hr_code == hr_code))
                await self._log_erasure(
                    db, hr_code, "snapshots", "employee_snapshots", count,
                    "deletion", request_id, performed_by
                )
            results.append(ErasureResult(
                category="snapshots", table_name="employee_snapshots",
                records_deleted=count, erasure_type="deletion"
            ))

        return results

    async def _log_erasure(
        self,
        db: AsyncSession,
        data_subject_id: str,
        category: str,
        table_name: str,
        records_deleted: int,
        erasure_type: str,
        request_id: Optional[str],
        performed_by: Optional[str],
    ) -> None:
        """Log erasure operation for audit trail."""
        log_entry = ErasureLog(
            request_id=request_id,
            data_subject_id=data_subject_id,
            data_category=category,
            table_name=table_name,
            records_deleted=records_deleted,
            erasure_type=erasure_type,
            performed_by=performed_by,
            verification_hash=hashlib.sha256(
                f"{data_subject_id}:{table_name}:{records_deleted}".encode()
            ).hexdigest()[:16],
        )
        db.add(log_entry)

    # ==================== CONSENT MANAGEMENT ====================

    async def record_consent(
        self,
        db: AsyncSession,
        data_subject_id: str,
        consent_type: str,
        purpose: str,
        lawful_basis: str = LawfulBasis.LEGITIMATE_INTERESTS.value,
        data_subject_name: Optional[str] = None,
        recorded_by: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        notes: Optional[str] = None,
    ) -> ConsentRecord:
        """
        Record consent for a data subject.

        For on-premise enterprise deployments, consent is typically based on
        employment contract (legitimate interests) rather than explicit consent.
        """
        # Check for existing consent of same type
        existing = await db.execute(
            select(ConsentRecord).where(
                ConsentRecord.data_subject_id == data_subject_id,
                ConsentRecord.consent_type == consent_type,
            )
        )
        record = existing.scalar_one_or_none()

        if record:
            # Update existing
            record.consent_status = ConsentStatus.GRANTED.value
            record.granted_at = datetime.utcnow()
            record.withdrawn_at = None
            record.recorded_by = recorded_by
            record.expires_at = expires_at
            record.notes = notes
        else:
            # Create new
            record = ConsentRecord(
                data_subject_id=data_subject_id,
                data_subject_name=data_subject_name,
                consent_type=consent_type,
                consent_status=ConsentStatus.GRANTED.value,
                purpose=purpose,
                lawful_basis=lawful_basis,
                granted_at=datetime.utcnow(),
                recorded_by=recorded_by,
                expires_at=expires_at,
                notes=notes,
            )
            db.add(record)

        await db.commit()
        await db.refresh(record)
        return record

    async def withdraw_consent(
        self,
        db: AsyncSession,
        data_subject_id: str,
        consent_type: str,
        recorded_by: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[ConsentRecord]:
        """Withdraw consent for a data subject."""
        result = await db.execute(
            select(ConsentRecord).where(
                ConsentRecord.data_subject_id == data_subject_id,
                ConsentRecord.consent_type == consent_type,
            )
        )
        record = result.scalar_one_or_none()

        if record:
            record.consent_status = ConsentStatus.WITHDRAWN.value
            record.withdrawn_at = datetime.utcnow()
            record.recorded_by = recorded_by
            if notes:
                record.notes = (record.notes or "") + f"\nWithdrawal: {notes}"
            await db.commit()
            await db.refresh(record)

        return record

    async def get_consent_summary(
        self, db: AsyncSession, data_subject_id: str
    ) -> Dict[str, Any]:
        """Get consent summary for a data subject."""
        result = await db.execute(
            select(ConsentRecord).where(
                ConsentRecord.data_subject_id == data_subject_id
            )
        )
        consents = result.scalars().all()

        # For on-premise, legitimate interests typically covers all processing
        required_types = ["data_processing"]  # Minimal for on-premise

        granted_types = [
            c.consent_type for c in consents
            if c.consent_status == ConsentStatus.GRANTED.value
        ]

        return {
            "data_subject_id": data_subject_id,
            "data_subject_name": consents[0].data_subject_name if consents else None,
            "consents": [self._model_to_dict(c) for c in consents],
            "all_required_granted": all(rt in granted_types for rt in required_types),
            "last_updated": max((c.updated_at for c in consents), default=None),
        }

    # ==================== DATA SUBJECT REQUESTS ====================

    async def create_request(
        self,
        db: AsyncSession,
        data_subject_id: str,
        request_type: str,
        data_subject_name: Optional[str] = None,
        data_subject_email: Optional[str] = None,
        description: Optional[str] = None,
        scope: Optional[List[str]] = None,
    ) -> DataSubjectRequest:
        """Create a new data subject request."""
        request_id = f"DSR-{uuid.uuid4().hex[:8].upper()}"
        due_date = datetime.utcnow() + timedelta(days=30)  # GDPR 30-day deadline

        request = DataSubjectRequest(
            request_id=request_id,
            data_subject_id=data_subject_id,
            data_subject_name=data_subject_name,
            data_subject_email=data_subject_email,
            request_type=request_type,
            request_status=DataRequestStatus.PENDING.value,
            description=description,
            scope=json.dumps(scope) if scope else None,
            due_date=due_date,
        )
        db.add(request)
        await db.commit()
        await db.refresh(request)

        logger.info(f"Created data subject request {request_id} for {data_subject_id}")
        return request

    async def update_request(
        self,
        db: AsyncSession,
        request_id: str,
        **updates,
    ) -> Optional[DataSubjectRequest]:
        """Update a data subject request."""
        result = await db.execute(
            select(DataSubjectRequest).where(DataSubjectRequest.request_id == request_id)
        )
        request = result.scalar_one_or_none()

        if request:
            for key, value in updates.items():
                if hasattr(request, key) and value is not None:
                    setattr(request, key, value)

            if updates.get("identity_verified"):
                request.verified_at = datetime.utcnow()

            if updates.get("request_status") == DataRequestStatus.COMPLETED.value:
                request.completed_at = datetime.utcnow()

            await db.commit()
            await db.refresh(request)

        return request

    async def process_request(
        self,
        db: AsyncSession,
        request_id: str,
        performed_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Process a data subject request based on its type.

        Returns the result of processing (e.g., exported data, erasure summary).
        """
        result = await db.execute(
            select(DataSubjectRequest).where(DataSubjectRequest.request_id == request_id)
        )
        request = result.scalar_one_or_none()

        if not request:
            return {"error": "Request not found"}

        # Update status to in progress
        request.request_status = DataRequestStatus.IN_PROGRESS.value
        request.assigned_to = performed_by
        await db.commit()

        hr_code = request.data_subject_id
        scope = json.loads(request.scope) if request.scope else None

        try:
            if request.request_type in [DataRequestType.ACCESS.value, DataRequestType.PORTABILITY.value]:
                # Export data
                export_result = await self.export_data_subject_data(db, hr_code, scope)
                request.request_status = DataRequestStatus.COMPLETED.value
                request.completed_at = datetime.utcnow()
                request.response_summary = f"Exported {export_result['record_counts']} records"
                await db.commit()
                return export_result

            elif request.request_type == DataRequestType.ERASURE.value:
                # Erase data
                erasure_result = await self.erase_data_subject_data(
                    db, hr_code, request_id, scope, False, performed_by
                )
                request.request_status = DataRequestStatus.COMPLETED.value
                request.completed_at = datetime.utcnow()
                request.response_summary = f"Erased {erasure_result['total_records_deleted']} records"
                await db.commit()
                return erasure_result

            else:
                request.request_status = DataRequestStatus.PENDING.value
                request.response_summary = f"Request type {request.request_type} requires manual processing"
                await db.commit()
                return {"message": "Request requires manual processing", "request_id": request_id}

        except Exception as e:
            logger.error(f"Error processing request {request_id}: {e}")
            request.request_status = DataRequestStatus.PENDING.value
            await db.commit()
            raise

    async def get_pending_requests(
        self, db: AsyncSession, include_overdue: bool = True
    ) -> List[DataSubjectRequest]:
        """Get all pending data subject requests."""
        query = select(DataSubjectRequest).where(
            DataSubjectRequest.request_status.in_([
                DataRequestStatus.PENDING.value,
                DataRequestStatus.IN_PROGRESS.value,
            ])
        )

        if include_overdue:
            query = query.order_by(DataSubjectRequest.due_date)

        result = await db.execute(query)
        return result.scalars().all()

    # ==================== COMPLIANCE DASHBOARD ====================

    async def get_compliance_status(self, db: AsyncSession) -> Dict[str, Any]:
        """Generate GDPR compliance status for dashboard."""
        now = datetime.utcnow()

        # Count data subjects (unique hr_codes)
        result = await db.execute(
            select(func.count(func.distinct(HRDataInput.hr_code)))
        )
        total_subjects = result.scalar() or 0

        # Count subjects with valid consent
        result = await db.execute(
            select(func.count(func.distinct(ConsentRecord.data_subject_id))).where(
                ConsentRecord.consent_status == ConsentStatus.GRANTED.value
            )
        )
        subjects_with_consent = result.scalar() or 0

        # Pending requests
        result = await db.execute(
            select(func.count()).select_from(DataSubjectRequest).where(
                DataSubjectRequest.request_status == DataRequestStatus.PENDING.value
            )
        )
        pending_requests = result.scalar() or 0

        # Overdue requests
        result = await db.execute(
            select(func.count()).select_from(DataSubjectRequest).where(
                DataSubjectRequest.request_status.in_([
                    DataRequestStatus.PENDING.value,
                    DataRequestStatus.IN_PROGRESS.value,
                ]),
                DataSubjectRequest.due_date < now,
            )
        )
        overdue_requests = result.scalar() or 0

        # Completed requests in last 30 days
        thirty_days_ago = now - timedelta(days=30)
        result = await db.execute(
            select(func.count()).select_from(DataSubjectRequest).where(
                DataSubjectRequest.request_status == DataRequestStatus.COMPLETED.value,
                DataSubjectRequest.completed_at >= thirty_days_ago,
            )
        )
        completed_30_days = result.scalar() or 0

        # Open breaches
        result = await db.execute(
            select(func.count()).select_from(DataBreachRecord).where(
                DataBreachRecord.status != "resolved"
            )
        )
        open_breaches = result.scalar() or 0

        # Breaches in last 90 days
        ninety_days_ago = now - timedelta(days=90)
        result = await db.execute(
            select(func.count()).select_from(DataBreachRecord).where(
                DataBreachRecord.detected_at >= ninety_days_ago
            )
        )
        breaches_90_days = result.scalar() or 0

        # Processing activities
        result = await db.execute(
            select(func.count()).select_from(DataProcessingRecord).where(
                DataProcessingRecord.is_active == True
            )
        )
        active_activities = result.scalar() or 0

        result = await db.execute(
            select(func.count()).select_from(DataProcessingRecord).where(
                DataProcessingRecord.is_active == True,
                DataProcessingRecord.next_review_date < now,
            )
        )
        activities_need_review = result.scalar() or 0

        # Determine overall status
        recommendations = []
        if overdue_requests > 0:
            recommendations.append(f"Process {overdue_requests} overdue data subject request(s) immediately")
        if open_breaches > 0:
            recommendations.append(f"Resolve {open_breaches} open data breach(es)")
        if activities_need_review > 0:
            recommendations.append(f"Review {activities_need_review} processing activit(ies)")

        # For on-premise, consent isn't always required (legitimate interests)
        consent_coverage = (subjects_with_consent / total_subjects * 100) if total_subjects > 0 else 100

        overall_status = "compliant"
        if overdue_requests > 0 or open_breaches > 0:
            overall_status = "action_required"
        elif pending_requests > 5 or activities_need_review > 0:
            overall_status = "review_needed"

        return {
            "overall_status": overall_status,
            "total_data_subjects": total_subjects,
            "subjects_with_valid_consent": subjects_with_consent,
            "consent_coverage_percent": round(consent_coverage, 1),
            "pending_requests": pending_requests,
            "overdue_requests": overdue_requests,
            "completed_requests_30_days": completed_30_days,
            "retention_policy_active": True,  # Always on with DataRetentionService
            "last_retention_cleanup": None,  # Would come from retention service
            "records_pending_cleanup": 0,
            "open_breaches": open_breaches,
            "breaches_last_90_days": breaches_90_days,
            "active_processing_activities": active_activities,
            "activities_needing_review": activities_need_review,
            "recommendations": recommendations,
            "generated_at": now.isoformat(),
        }

    # ==================== RECORDS OF PROCESSING (ROPA) ====================

    async def create_processing_record(
        self, db: AsyncSession, **data
    ) -> DataProcessingRecord:
        """Create a new processing activity record."""
        # Convert lists to JSON strings
        if "data_categories" in data and isinstance(data["data_categories"], list):
            data["data_categories"] = json.dumps(data["data_categories"])
        if "recipients" in data and isinstance(data["recipients"], list):
            data["recipients"] = json.dumps(data["recipients"])

        record = DataProcessingRecord(**data)
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    async def get_processing_records(
        self, db: AsyncSession, active_only: bool = True
    ) -> List[DataProcessingRecord]:
        """Get all processing activity records."""
        query = select(DataProcessingRecord)
        if active_only:
            query = query.where(DataProcessingRecord.is_active == True)
        query = query.order_by(DataProcessingRecord.activity_name)

        result = await db.execute(query)
        return result.scalars().all()

    async def export_ropa(self, db: AsyncSession) -> Dict[str, Any]:
        """Export Records of Processing Activities."""
        records = await self.get_processing_records(db, active_only=True)

        return {
            "export_date": datetime.utcnow().isoformat(),
            "total_activities": len(records),
            "processing_activities": [
                {
                    **self._model_to_dict(r),
                    "data_categories": json.loads(r.data_categories) if r.data_categories else [],
                    "recipients": json.loads(r.recipients) if r.recipients else [],
                }
                for r in records
            ],
        }


# Global service instance
_gdpr_service: Optional[GDPRService] = None


def get_gdpr_service() -> GDPRService:
    """Get the global GDPR service instance."""
    global _gdpr_service
    if _gdpr_service is None:
        _gdpr_service = GDPRService()
    return _gdpr_service
