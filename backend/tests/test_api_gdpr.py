"""
Tests for app/api/v1/gdpr.py - GDPR Compliance endpoints.

Tests cover:
- Permission checks (check_gdpr_access)
- Data Export (Right to Access, Art. 15)
- Data Erasure (Right to be Forgotten, Art. 17)
- Data Subject Requests (DSARs)
- Consent Management
- Records of Processing Activities (ROPA)
- Data Breach Reporting
- Erasure Audit Logs
"""
import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_gdpr_user():
    """Create a mock user with GDPR access."""
    user = MagicMock()
    user.user_id = "1"
    user.username = "gdpr_admin"
    user.email = "gdpr@example.com"
    user.full_name = "GDPR Admin"
    user.is_active = 1
    user.is_super_admin = 0
    return user


@pytest.fixture
def mock_super_admin():
    """Create a mock super admin user."""
    user = MagicMock()
    user.user_id = "1"
    user.username = "superadmin"
    user.email = "super@example.com"
    user.is_active = 1
    user.is_super_admin = 1
    return user


@pytest.fixture
def mock_legacy_user():
    """Create a mock legacy user for auth."""
    user = MagicMock()
    user.id = 1
    user.username = "gdpr_admin"
    user.email = "gdpr@example.com"
    user.is_active = True
    return user


@pytest.fixture
def mock_data_subject_request():
    """Create a mock data subject request."""
    dsr = MagicMock()
    dsr.id = 1
    dsr.request_id = "DSR-12345678"
    dsr.data_subject_id = "EMP001"
    dsr.data_subject_name = "John Doe"
    dsr.data_subject_email = "john.doe@example.com"
    dsr.request_type = "access"
    dsr.request_status = "pending"
    dsr.description = "Request for data access"
    dsr.scope = json.dumps(["personal_info", "predictions"])
    dsr.identity_verified = False
    dsr.verification_method = None
    dsr.verified_at = None
    dsr.assigned_to = None
    dsr.due_date = None
    dsr.completed_at = None
    dsr.response_summary = None
    dsr.response_file_path = None
    dsr.rejection_reason = None
    dsr.created_at = datetime.utcnow()
    dsr.updated_at = datetime.utcnow()
    return dsr


@pytest.fixture
def mock_consent_record():
    """Create a mock consent record."""
    record = MagicMock()
    record.id = 1
    record.data_subject_id = "EMP001"
    record.data_subject_name = "John Doe"
    # Use enum values that match schema expectations
    record.consent_type = "data_processing"  # ConsentType.DATA_PROCESSING.value
    record.consent_status = "granted"  # ConsentStatus.GRANTED.value
    record.purpose = "Employee churn prediction"
    record.lawful_basis = "legitimate_interests"  # LawfulBasis.LEGITIMATE_INTERESTS.value
    record.granted_at = datetime.utcnow()
    record.withdrawn_at = None
    record.expires_at = None
    record.recorded_by = "admin"
    record.created_at = datetime.utcnow()
    record.updated_at = datetime.utcnow()
    return record


@pytest.fixture
def mock_processing_record():
    """Create a mock processing activity record."""
    record = MagicMock()
    record.id = 1
    record.activity_name = "Employee Churn Prediction"
    record.activity_description = "ML-based prediction of employee attrition risk"
    record.controller_name = "HR Department"
    record.controller_contact = "hr@company.com"
    record.dpo_contact = "dpo@company.com"
    record.purpose = "Workforce planning and retention"
    record.lawful_basis = "legitimate_interest"
    record.data_categories = json.dumps(["performance", "engagement", "demographics"])
    record.special_categories = False
    record.data_subject_categories = "Employees"
    record.recipients = json.dumps(["HR Team", "Management"])
    record.third_country_transfers = False
    record.transfer_safeguards = None
    record.retention_period = "Duration of employment + 3 years"
    record.retention_criteria = "Employment contract termination"
    record.security_measures = "Encryption, access controls, audit logging"
    record.is_active = True
    record.last_reviewed = datetime.utcnow()
    record.next_review_date = None
    record.created_at = datetime.utcnow()
    record.updated_at = datetime.utcnow()
    return record


@pytest.fixture
def mock_breach_record():
    """Create a mock data breach record."""
    breach = MagicMock()
    breach.id = 1
    breach.breach_id = "BRE-12345678"
    breach.title = "Unauthorized access to employee data"
    breach.description = "External party gained access to employee data"
    breach.detected_at = datetime.utcnow()
    breach.occurred_at = datetime.utcnow()
    breach.data_categories_affected = json.dumps(["personal_info"])
    breach.data_subjects_affected_count = 10
    breach.risk_level = "high"
    breach.cause = "Phishing attack"
    breach.root_cause_analysis = None
    breach.containment_actions = "Disabled compromised account"
    breach.remediation_actions = None
    breach.authority_notified = False
    breach.authority_notification_date = None
    breach.authority_reference = None
    breach.subjects_notified = False
    breach.subjects_notification_date = None
    breach.notification_method = None
    breach.status = "open"
    breach.resolved_at = None
    breach.reported_by = "security_team"
    breach.created_at = datetime.utcnow()
    breach.updated_at = datetime.utcnow()
    return breach


@pytest.fixture
def mock_erasure_log():
    """Create a mock erasure log."""
    log = MagicMock()
    log.id = 1
    log.request_id = "DSR-12345678"
    log.data_subject_id = "EMP001"
    log.data_category = "predictions"
    log.table_name = "churn_predictions"
    log.records_deleted = 15
    log.erasure_type = "hard_delete"
    log.performed_by = "admin"
    log.performed_at = datetime.utcnow()
    log.verification_hash = "abc123def456"
    log.notes = None
    return log


# ============ Test Permission Checks ============

class TestCheckGDPRAccess:
    """Test GDPR access permission checking."""

    @pytest.mark.asyncio
    async def test_super_admin_has_access(self, mock_db_session, mock_legacy_user, mock_super_admin):
        """Super admin should have GDPR access."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_super_admin
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await check_gdpr_access(mock_db_session, mock_legacy_user)

        assert result == mock_super_admin
        assert result.is_super_admin == 1

    @pytest.mark.asyncio
    async def test_user_with_gdpr_access_permission(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """User with gdpr:access permission should have access."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            result = await check_gdpr_access(mock_db_session, mock_legacy_user)

        assert result == mock_gdpr_user

    @pytest.mark.asyncio
    async def test_user_with_gdpr_manage_permission(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """User with gdpr:manage permission should have access."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:manage"}):
            result = await check_gdpr_access(mock_db_session, mock_legacy_user)

        assert result == mock_gdpr_user

    @pytest.mark.asyncio
    async def test_user_with_admin_access_permission(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """User with admin:access permission should have GDPR access."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"admin:access"}):
            result = await check_gdpr_access(mock_db_session, mock_legacy_user)

        assert result == mock_gdpr_user

    @pytest.mark.asyncio
    async def test_user_without_gdpr_permission_denied(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """User without GDPR/admin permission should be denied."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"churn:read"}):
            with pytest.raises(HTTPException) as exc_info:
                await check_gdpr_access(mock_db_session, mock_legacy_user)

            assert exc_info.value.status_code == 403
            assert "GDPR management access required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_user_not_found_denied(self, mock_db_session, mock_legacy_user):
        """User not in RBAC system should be denied."""
        from app.api.v1.gdpr import check_gdpr_access

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await check_gdpr_access(mock_db_session, mock_legacy_user)

        assert exc_info.value.status_code == 403
        assert "User account not found" in exc_info.value.detail


# ============ Test Data Export ============

class TestDataExport:
    """Test data export endpoints (Right to Access)."""

    @pytest.mark.asyncio
    async def test_export_data_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should export data for a valid HR code."""
        from app.api.v1.gdpr import export_data_subject_data
        from app.schemas.gdpr import DataExportRequest

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_export_result = {
            "hr_code": "EMP001",
            "export_date": datetime.utcnow().isoformat(),
            "categories_included": ["personal_info", "predictions"],
            "data": {"personal_info": [{"name": "John Doe"}]},
            "record_counts": {"personal_info": 1, "predictions": 5}
        }

        request = DataExportRequest(
            hr_code="EMP001",
            include_categories=["personal_info", "predictions"],
            format="json"
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.export_data_subject_data = AsyncMock(return_value=mock_export_result)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                    result = await export_data_subject_data(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result.hr_code == "EMP001"
        assert len(result.categories_included) == 2
        assert result.record_counts["predictions"] == 5


class TestDataErasure:
    """Test data erasure endpoints (Right to be Forgotten)."""

    @pytest.mark.asyncio
    async def test_erase_data_dry_run(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Dry run should return preview without deleting."""
        from app.api.v1.gdpr import erase_data_subject_data
        from app.schemas.gdpr import DataErasureRequest

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # results must be List[ErasureResult] per schema
        mock_erasure_result = {
            "hr_code": "EMP001",
            "request_id": None,
            "erasure_date": datetime.utcnow().isoformat(),
            "dry_run": True,
            "results": [
                {"category": "predictions", "table_name": "churn_predictions", "records_deleted": 0, "erasure_type": "preview"}
            ],
            "total_records_deleted": 0,
            "excluded_categories": [],
            "verification_hash": None
        }

        request = DataErasureRequest(
            hr_code="EMP001",
            reason="GDPR erasure request",
            dry_run=True
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.erase_data_subject_data = AsyncMock(return_value=mock_erasure_result)
                result = await erase_data_subject_data(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert result.dry_run is True
        assert result.total_records_deleted == 0
        assert len(result.results) == 1
        assert result.results[0].category == "predictions"

    @pytest.mark.asyncio
    async def test_erase_data_actual_deletion(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Actual erasure should delete data and log action."""
        from app.api.v1.gdpr import erase_data_subject_data
        from app.schemas.gdpr import DataErasureRequest

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        # results must be List[ErasureResult] per schema
        mock_erasure_result = {
            "hr_code": "EMP001",
            "request_id": "DSR-12345678",
            "erasure_date": datetime.utcnow().isoformat(),
            "dry_run": False,
            "results": [
                {"category": "predictions", "table_name": "churn_predictions", "records_deleted": 10, "erasure_type": "deletion"}
            ],
            "total_records_deleted": 10,
            "excluded_categories": [],
            "verification_hash": "sha256:abc123"
        }

        request = DataErasureRequest(
            hr_code="EMP001",
            reason="GDPR erasure request",
            dry_run=False
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.erase_data_subject_data = AsyncMock(return_value=mock_erasure_result)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock) as mock_log:
                    result = await erase_data_subject_data(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result.dry_run is False
        assert result.total_records_deleted == 10
        assert result.verification_hash == "sha256:abc123"
        mock_log.assert_called_once()


# ============ Test Data Subject Requests ============

class TestDataSubjectRequests:
    """Test DSAR management endpoints."""

    @pytest.mark.asyncio
    async def test_list_requests_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_data_subject_request):
        """Should list data subject requests."""
        from app.api.v1.gdpr import list_data_subject_requests

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_requests_result = MagicMock()
        mock_requests_result.scalars.return_value.all.return_value = [mock_data_subject_request]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_requests_result,
        ])

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            result = await list_data_subject_requests(
                status=None,
                limit=50,
                offset=0,
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert len(result) == 1
        assert result[0].request_id == "DSR-12345678"
        assert result[0].request_type == "access"

    @pytest.mark.asyncio
    async def test_get_request_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_data_subject_request):
        """Should get a specific data subject request."""
        from app.api.v1.gdpr import get_data_subject_request

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_dsr_result = MagicMock()
        mock_dsr_result.scalar_one_or_none.return_value = mock_data_subject_request

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_dsr_result,
        ])

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            result = await get_data_subject_request(
                request_id="DSR-12345678",
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert result.request_id == "DSR-12345678"
        assert result.data_subject_name == "John Doe"

    @pytest.mark.asyncio
    async def test_get_request_not_found(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should return 404 for non-existent request."""
        from app.api.v1.gdpr import get_data_subject_request

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_dsr_result = MagicMock()
        mock_dsr_result.scalar_one_or_none.return_value = None

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_dsr_result,
        ])

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await get_data_subject_request(
                    request_id="NONEXISTENT",
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

            assert exc_info.value.status_code == 404
            assert "Request not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_create_request_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_data_subject_request):
        """Should create a new data subject request."""
        from app.api.v1.gdpr import create_data_subject_request
        from app.schemas.gdpr import DataSubjectRequestCreate, DataRequestType

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        request = DataSubjectRequestCreate(
            data_subject_id="EMP001",
            request_type=DataRequestType.ACCESS,
            data_subject_name="John Doe",
            data_subject_email="john@example.com",
            description="Request for data access"
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.create_request = AsyncMock(return_value=mock_data_subject_request)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                    result = await create_data_subject_request(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result.request_id == "DSR-12345678"
        assert result.request_status == "pending"


# ============ Test Consent Management ============

class TestConsentManagement:
    """Test consent management endpoints."""

    @pytest.mark.asyncio
    async def test_get_consent_status(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should get consent status for a data subject."""
        from app.api.v1.gdpr import get_consent_status

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        mock_consent_summary = {
            "data_subject_id": "EMP001",
            "data_subject_name": "John Doe",
            "consents": [],
            "all_required_granted": True,
            "last_updated": datetime.utcnow().isoformat()
        }

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.get_consent_summary = AsyncMock(return_value=mock_consent_summary)
                result = await get_consent_status(
                    data_subject_id="EMP001",
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert result.data_subject_id == "EMP001"
        assert result.all_required_granted is True

    @pytest.mark.asyncio
    async def test_record_consent_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_consent_record):
        """Should record consent for a data subject."""
        from app.api.v1.gdpr import record_consent
        from app.schemas.gdpr import ConsentRecordCreate, ConsentType, LawfulBasis

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        request = ConsentRecordCreate(
            data_subject_id="EMP001",
            consent_type=ConsentType.DATA_PROCESSING,
            purpose="Employee churn prediction",
            lawful_basis=LawfulBasis.LEGITIMATE_INTERESTS,
            data_subject_name="John Doe"
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.record_consent = AsyncMock(return_value=mock_consent_record)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                    result = await record_consent(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result.data_subject_id == "EMP001"
        assert result.consent_status == "granted"

    @pytest.mark.asyncio
    async def test_withdraw_consent_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_consent_record):
        """Should withdraw consent for a data subject."""
        from app.api.v1.gdpr import withdraw_consent

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        mock_consent_record.consent_status = "withdrawn"

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.withdraw_consent = AsyncMock(return_value=mock_consent_record)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                    result = await withdraw_consent(
                        data_subject_id="EMP001",
                        consent_type="data_processing",
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result["message"] == "Consent withdrawn"
        assert result["consent_type"] == "data_processing"

    @pytest.mark.asyncio
    async def test_withdraw_consent_not_found(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should return 404 when consent record not found."""
        from app.api.v1.gdpr import withdraw_consent

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.withdraw_consent = AsyncMock(return_value=None)
                with pytest.raises(HTTPException) as exc_info:
                    await withdraw_consent(
                        data_subject_id="EMP001",
                        consent_type="nonexistent",
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

                assert exc_info.value.status_code == 404


# ============ Test Records of Processing Activities ============

class TestROPA:
    """Test ROPA (Records of Processing Activities) endpoints."""

    @pytest.mark.asyncio
    async def test_list_processing_records(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_processing_record):
        """Should list processing activity records."""
        from app.api.v1.gdpr import list_processing_records

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.get_processing_records = AsyncMock(return_value=[mock_processing_record])
                result = await list_processing_records(
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert len(result) == 1
        assert result[0].activity_name == "Employee Churn Prediction"

    @pytest.mark.asyncio
    async def test_export_ropa(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should export all ROPA records."""
        from app.api.v1.gdpr import export_ropa

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)

        mock_export_data = {
            "export_date": datetime.utcnow().isoformat(),
            "total_activities": 2,
            "processing_activities": [
                {
                    "id": 1,
                    "activity_name": "Activity 1",
                    "activity_description": "Desc 1",
                    "controller_name": "HR",
                    "controller_contact": "hr@example.com",
                    "dpo_contact": "dpo@example.com",
                    "purpose": "Purpose 1",
                    "lawful_basis": "legitimate_interest",
                    "data_categories": [],
                    "special_categories": False,
                    "data_subject_categories": "Employees",
                    "recipients": None,
                    "third_country_transfers": False,
                    "transfer_safeguards": None,
                    "retention_period": "3 years",
                    "retention_criteria": None,
                    "security_measures": None,
                    "is_active": True,
                    "last_reviewed": None,
                    "next_review_date": None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            ]
        }

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.get_gdpr_service") as mock_service:
                mock_service.return_value.export_ropa = AsyncMock(return_value=mock_export_data)
                with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                    result = await export_ropa(
                        db=mock_db_session,
                        current_user=mock_legacy_user
                    )

        assert result.total_activities == 2


# ============ Test Data Breach Management ============

class TestDataBreachManagement:
    """Test data breach reporting and management."""

    @pytest.mark.asyncio
    async def test_list_breaches(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_breach_record):
        """Should list data breach records."""
        from app.api.v1.gdpr import list_breaches

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_breaches_result = MagicMock()
        mock_breaches_result.scalars.return_value.all.return_value = [mock_breach_record]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_breaches_result,
        ])

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            result = await list_breaches(
                status=None,
                limit=50,
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert len(result) == 1
        assert result[0].breach_id == "BRE-12345678"
        assert result[0].risk_level == "high"

    @pytest.mark.asyncio
    async def test_report_breach_success(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should report a new data breach."""
        from app.api.v1.gdpr import report_breach
        from app.schemas.gdpr import DataBreachCreate

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user
        mock_db_session.execute = AsyncMock(return_value=mock_user_result)
        mock_db_session.commit = AsyncMock()
        mock_db_session.add = MagicMock()

        # Mock refresh to simulate DB assigning ID and applying defaults
        async def mock_refresh(obj):
            obj.id = 1
            # Apply SQLAlchemy column defaults that would normally be set by DB
            if not hasattr(obj, 'authority_notified') or obj.authority_notified is None:
                obj.authority_notified = False
            if not hasattr(obj, 'subjects_notified') or obj.subjects_notified is None:
                obj.subjects_notified = False
            if not hasattr(obj, 'created_at') or obj.created_at is None:
                obj.created_at = datetime.utcnow()
            if not hasattr(obj, 'updated_at') or obj.updated_at is None:
                obj.updated_at = datetime.utcnow()

        mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)

        request = DataBreachCreate(
            title="Test Breach",
            description="Test breach description",
            detected_at=datetime.utcnow(),
            risk_level="medium",
            cause="Human error"
        )

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with patch("app.api.v1.gdpr.log_gdpr_action", new_callable=AsyncMock):
                result = await report_breach(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

        assert "BRE-" in result.breach_id
        assert result.status == "open"
        assert result.risk_level == "medium"

    @pytest.mark.asyncio
    async def test_update_breach_not_found(self, mock_db_session, mock_legacy_user, mock_gdpr_user):
        """Should return 404 for non-existent breach."""
        from app.api.v1.gdpr import update_breach
        from app.schemas.gdpr import DataBreachUpdate

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_breach_result = MagicMock()
        mock_breach_result.scalar_one_or_none.return_value = None

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_breach_result,
        ])

        update = DataBreachUpdate(status="resolved")

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            with pytest.raises(HTTPException) as exc_info:
                await update_breach(
                    breach_id="NONEXISTENT",
                    update=update,
                    db=mock_db_session,
                    current_user=mock_legacy_user
                )

            assert exc_info.value.status_code == 404


# ============ Test Erasure Logs ============

class TestErasureLogs:
    """Test erasure audit log endpoints."""

    @pytest.mark.asyncio
    async def test_get_erasure_logs(self, mock_db_session, mock_legacy_user, mock_gdpr_user, mock_erasure_log):
        """Should get erasure audit logs."""
        from app.api.v1.gdpr import get_erasure_logs

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_gdpr_user

        mock_logs_result = MagicMock()
        mock_logs_result.scalars.return_value.all.return_value = [mock_erasure_log]

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_user_result,
            mock_logs_result,
        ])

        with patch("app.api.v1.gdpr.get_user_permissions_by_id", return_value={"gdpr:access"}):
            result = await get_erasure_logs(
                data_subject_id=None,
                limit=100,
                db=mock_db_session,
                current_user=mock_legacy_user
            )

        assert len(result) == 1
        assert result[0]["data_subject_id"] == "EMP001"
        assert result[0]["records_deleted"] == 15
        assert result[0]["erasure_type"] == "hard_delete"


# ============ Test Data Categories Endpoint ============

class TestDataCategories:
    """Test data categories endpoint."""

    @pytest.mark.asyncio
    async def test_get_data_categories(self, mock_legacy_user):
        """Should return list of data categories."""
        from app.api.v1.gdpr import get_data_categories

        with patch("app.api.v1.gdpr.DATA_CATEGORIES", {
            "personal_info": {
                "description": "Personal information",
                "tables": ["hr_data"],
                "contains_pii": True
            },
            "predictions": {
                "description": "ML predictions",
                "tables": ["churn_predictions"],
                "contains_pii": False
            }
        }):
            result = await get_data_categories(current_user=mock_legacy_user)

        assert "categories" in result
        assert len(result["categories"]) == 2
        category_names = [c["name"] for c in result["categories"]]
        assert "personal_info" in category_names
        assert "predictions" in category_names
