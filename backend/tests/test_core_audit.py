"""
Tests for app/core/audit.py - Audit logging system.
"""
import json
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.exc import SQLAlchemyError


class TestAuditLogModel:
    """Test AuditLog model structure."""

    def test_audit_log_repr(self):
        """AuditLog __repr__ should return readable string."""
        from app.core.audit import AuditLog

        log = AuditLog()
        log.id = 1
        log.username = "testuser"
        log.action = "predict"

        assert "AuditLog 1" in repr(log)
        assert "testuser" in repr(log)
        assert "predict" in repr(log)


class TestAuditLoggerLog:
    """Test AuditLogger.log() method."""

    @pytest.mark.asyncio
    async def test_log_creates_entry(self, mock_db_session):
        """log() should create an AuditLog entry."""
        from app.core.audit import AuditLogger

        result = await AuditLogger.log(
            db=mock_db_session,
            action="test_action",
            user_id=1,
            username="testuser",
        )

        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_with_all_parameters(self, mock_db_session):
        """log() should handle all parameters."""
        from app.core.audit import AuditLogger

        result = await AuditLogger.log(
            db=mock_db_session,
            action="test_action",
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            resource_type="employee",
            resource_id="emp-123",
            method="POST",
            endpoint="/api/v1/predict",
            ip_address="127.0.0.1",
            user_agent="Mozilla/5.0",
            status_code=200,
            duration_ms=150,
            metadata={"score": 0.85, "level": "HIGH"},
            error_message=None
        )

        # Verify add was called with correct data
        mock_db_session.add.assert_called_once()
        added_entry = mock_db_session.add.call_args[0][0]

        assert added_entry.action == "test_action"
        assert added_entry.user_id == 1
        assert added_entry.username == "testuser"
        assert added_entry.tenant_id == "test-tenant"
        assert added_entry.resource_type == "employee"
        assert added_entry.resource_id == "emp-123"
        assert added_entry.method == "POST"
        assert added_entry.endpoint == "/api/v1/predict"
        assert added_entry.ip_address == "127.0.0.1"
        assert added_entry.status_code == 200
        assert added_entry.duration_ms == 150

    @pytest.mark.asyncio
    async def test_log_serializes_metadata_as_json(self, mock_db_session):
        """Metadata should be serialized as JSON string."""
        from app.core.audit import AuditLogger

        metadata = {"risk_score": 0.85, "risk_level": "HIGH"}

        await AuditLogger.log(
            db=mock_db_session,
            action="test_action",
            metadata=metadata
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.log_metadata == json.dumps(metadata)

    @pytest.mark.asyncio
    async def test_log_handles_none_metadata(self, mock_db_session):
        """None metadata should remain None."""
        from app.core.audit import AuditLogger

        await AuditLogger.log(
            db=mock_db_session,
            action="test_action",
            metadata=None
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.log_metadata is None

    @pytest.mark.asyncio
    async def test_log_sets_timestamp(self, mock_db_session):
        """Log entry should have timestamp set."""
        from app.core.audit import AuditLogger

        await AuditLogger.log(
            db=mock_db_session,
            action="test_action"
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.timestamp is not None
        assert isinstance(added_entry.timestamp, datetime)

    @pytest.mark.asyncio
    async def test_log_handles_db_error_gracefully(self, mock_db_session):
        """DB errors should not raise - just rollback."""
        from app.core.audit import AuditLogger

        mock_db_session.commit = AsyncMock(side_effect=SQLAlchemyError("DB Error"))

        # Should not raise
        result = await AuditLogger.log(
            db=mock_db_session,
            action="test_action"
        )

        mock_db_session.rollback.assert_called_once()


class TestAuditLoggerPrediction:
    """Test AuditLogger.log_prediction() method."""

    @pytest.mark.asyncio
    async def test_log_prediction_creates_entry(self, mock_db_session):
        """log_prediction() should create proper audit entry."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_prediction(
            db=mock_db_session,
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            employee_id="emp-123",
            risk_score=0.85,
            risk_level="HIGH",
            duration_ms=100
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.action == "predict_churn"
        assert added_entry.resource_type == "employee"
        assert added_entry.resource_id == "emp-123"
        assert added_entry.status_code == 200

        metadata = json.loads(added_entry.log_metadata)
        assert metadata["risk_score"] == 0.85
        assert metadata["risk_level"] == "HIGH"


class TestAuditLoggerTraining:
    """Test AuditLogger.log_model_training() method."""

    @pytest.mark.asyncio
    async def test_log_model_training_creates_entry(self, mock_db_session):
        """log_model_training() should create proper audit entry."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_model_training(
            db=mock_db_session,
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            model_type="xgboost",
            accuracy=0.92,
            duration_ms=5000,
            samples_count=1000
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.action == "train_model"
        assert added_entry.resource_type == "model"
        assert added_entry.resource_id == "xgboost"

        metadata = json.loads(added_entry.log_metadata)
        assert metadata["model_type"] == "xgboost"
        assert metadata["accuracy"] == 0.92
        assert metadata["samples_count"] == 1000


class TestAuditLoggerDataUpload:
    """Test AuditLogger.log_data_upload() method."""

    @pytest.mark.asyncio
    async def test_log_data_upload_creates_entry(self, mock_db_session):
        """log_data_upload() should create proper audit entry."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_data_upload(
            db=mock_db_session,
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            dataset_type="employee",
            records_count=500,
            duration_ms=2000,
            file_name="employees.csv"
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.action == "upload_data"
        assert added_entry.resource_type == "dataset"
        assert added_entry.resource_id == "employee"

        metadata = json.loads(added_entry.log_metadata)
        assert metadata["dataset_type"] == "employee"
        assert metadata["records_count"] == 500
        assert metadata["file_name"] == "employees.csv"


class TestAuditLoggerLLMQuery:
    """Test AuditLogger.log_llm_query() method."""

    @pytest.mark.asyncio
    async def test_log_llm_query_creates_entry(self, mock_db_session):
        """log_llm_query() should create proper audit entry."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_llm_query(
            db=mock_db_session,
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            query_type="churn_analysis",
            duration_ms=3000,
            tokens_used=1500
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.action == "llm_query"
        assert added_entry.resource_type == "llm"
        assert added_entry.resource_id == "churn_analysis"

        metadata = json.loads(added_entry.log_metadata)
        assert metadata["query_type"] == "churn_analysis"
        assert metadata["tokens_used"] == 1500


class TestAuditLoggerError:
    """Test AuditLogger.log_error() method."""

    @pytest.mark.asyncio
    async def test_log_error_creates_entry(self, mock_db_session):
        """log_error() should create proper error audit entry."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_error(
            db=mock_db_session,
            action="predict",
            user_id=1,
            username="testuser",
            tenant_id="test-tenant",
            error_message="Model not found",
            endpoint="/api/v1/predict",
            status_code=500
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.action == "predict_error"
        assert added_entry.error_message == "Model not found"
        assert added_entry.endpoint == "/api/v1/predict"
        assert added_entry.status_code == 500

    @pytest.mark.asyncio
    async def test_log_error_default_status_code(self, mock_db_session):
        """log_error() should default to 500 status code."""
        from app.core.audit import AuditLogger

        await AuditLogger.log_error(
            db=mock_db_session,
            action="upload",
            user_id=None,
            username=None,
            tenant_id=None,
            error_message="File too large"
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.status_code == 500


class TestAuditLogConvenienceFunction:
    """Test audit_log() convenience function."""

    @pytest.mark.asyncio
    async def test_audit_log_extracts_user_attributes(self, mock_db_session, mock_user):
        """audit_log() should extract user attributes automatically."""
        from app.core.audit import audit_log

        await audit_log(
            db=mock_db_session,
            action="test_action",
            user=mock_user,
            metadata={"test": "data"}
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.user_id == mock_user.id
        assert added_entry.username == mock_user.username
        assert added_entry.tenant_id == mock_user.tenant_id

    @pytest.mark.asyncio
    async def test_audit_log_handles_none_user(self, mock_db_session):
        """audit_log() should handle None user gracefully."""
        from app.core.audit import audit_log

        # Create user without attributes
        user = MagicMock(spec=[])

        await audit_log(
            db=mock_db_session,
            action="test_action",
            user=user
        )

        added_entry = mock_db_session.add.call_args[0][0]
        assert added_entry.user_id is None
        assert added_entry.username is None
        assert added_entry.tenant_id is None
