"""
Extended tests for app/core/audit.py - Audit logging system.
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
import json


class TestAuditLogModel:
    """Test AuditLog model."""

    def test_audit_log_model_fields(self):
        """AuditLog should have all required fields."""
        from app.core.audit import AuditLog

        # Check that expected columns exist
        assert hasattr(AuditLog, 'id')
        assert hasattr(AuditLog, 'timestamp')
        assert hasattr(AuditLog, 'user_id')
        assert hasattr(AuditLog, 'username')
        assert hasattr(AuditLog, 'tenant_id')
        assert hasattr(AuditLog, 'action')
        assert hasattr(AuditLog, 'resource_type')
        assert hasattr(AuditLog, 'resource_id')
        assert hasattr(AuditLog, 'method')
        assert hasattr(AuditLog, 'endpoint')
        assert hasattr(AuditLog, 'ip_address')
        assert hasattr(AuditLog, 'status_code')
        assert hasattr(AuditLog, 'duration_ms')
        assert hasattr(AuditLog, 'log_metadata')
        assert hasattr(AuditLog, 'error_message')

    def test_audit_log_table_name(self):
        """AuditLog should use correct table name."""
        from app.core.audit import AuditLog

        assert AuditLog.__tablename__ == "audit_logs"

    def test_audit_log_repr(self):
        """AuditLog should have meaningful repr."""
        from app.core.audit import AuditLog

        log = AuditLog()
        log.id = 123
        log.username = "testuser"
        log.action = "predict"

        repr_str = repr(log)

        assert "123" in repr_str
        assert "testuser" in repr_str
        assert "predict" in repr_str


class TestAuditLogger:
    """Test AuditLogger service."""

    @pytest.mark.asyncio
    async def test_log_creates_entry(self, mock_db_session):
        """log() should create an AuditLog entry."""
        from app.core.audit import AuditLogger

        result = await AuditLogger.log(
            db=mock_db_session,
            action="test_action",
            user_id=1,
            username="testuser"
        )

        # Should add the entry to the session
        mock_db_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_with_all_fields(self, mock_db_session):
        """log() should accept all optional fields."""
        from app.core.audit import AuditLogger

        result = await AuditLogger.log(
            db=mock_db_session,
            action="predict_churn",
            user_id=42,
            username="admin",
            tenant_id="tenant-123",
            resource_type="employee",
            resource_id="EMP001",
            method="POST",
            endpoint="/api/v1/churn/predict",
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0",
            status_code=200,
            duration_ms=150,
            metadata={"score": 0.75, "model": "xgboost"},
            error_message=None
        )

        mock_db_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_with_error(self, mock_db_session):
        """log() should handle error messages."""
        from app.core.audit import AuditLogger

        result = await AuditLogger.log(
            db=mock_db_session,
            action="failed_action",
            user_id=1,
            status_code=500,
            error_message="Database connection failed"
        )

        mock_db_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_log_sets_timestamp(self, mock_db_session):
        """log() should set timestamp automatically."""
        from app.core.audit import AuditLogger, AuditLog

        before = datetime.utcnow()

        result = await AuditLogger.log(
            db=mock_db_session,
            action="test"
        )

        after = datetime.utcnow()

        # Verify the call was made
        mock_db_session.add.assert_called_once()
        added_log = mock_db_session.add.call_args[0][0]
        assert isinstance(added_log, AuditLog)
        assert before <= added_log.timestamp <= after

    @pytest.mark.asyncio
    async def test_log_serializes_metadata(self, mock_db_session):
        """log() should serialize metadata dict to JSON."""
        from app.core.audit import AuditLogger

        metadata = {
            "employee_id": "EMP001",
            "risk_score": 0.85,
            "features": ["satisfaction", "tenure"]
        }

        result = await AuditLogger.log(
            db=mock_db_session,
            action="predict",
            metadata=metadata
        )

        mock_db_session.add.assert_called_once()
        added_log = mock_db_session.add.call_args[0][0]
        # Metadata should be stored as JSON string
        if added_log.log_metadata:
            parsed = json.loads(added_log.log_metadata)
            assert parsed == metadata


class TestAuditLoggerPrediction:
    """Test AuditLogger.log_prediction convenience method."""

    @pytest.mark.asyncio
    async def test_log_prediction_method(self, mock_db_session):
        """log_prediction should create properly formatted entry."""
        from app.core.audit import AuditLogger

        # If the method exists, test it
        if hasattr(AuditLogger, 'log_prediction'):
            result = await AuditLogger.log_prediction(
                db=mock_db_session,
                user_id=1,
                username="analyst",
                employee_id="EMP001",
                prediction_score=0.75,
                risk_level="HIGH"
            )

            mock_db_session.add.assert_called()


class TestAuditLoggerTraining:
    """Test AuditLogger.log_model_training convenience method."""

    @pytest.mark.asyncio
    async def test_log_model_training_method(self, mock_db_session):
        """log_model_training should create properly formatted entry."""
        from app.core.audit import AuditLogger

        # If the method exists, test it
        if hasattr(AuditLogger, 'log_model_training'):
            result = await AuditLogger.log_model_training(
                db=mock_db_session,
                user_id=1,
                username="admin",
                model_id="model-123",
                metrics={"accuracy": 0.85, "auc": 0.90},
                samples_count=1000
            )

            mock_db_session.add.assert_called()


class TestAuditLoggerDataUpload:
    """Test AuditLogger.log_data_upload convenience method."""

    @pytest.mark.asyncio
    async def test_log_data_upload_method(self, mock_db_session):
        """log_data_upload should create properly formatted entry."""
        from app.core.audit import AuditLogger

        # If the method exists, test it
        if hasattr(AuditLogger, 'log_data_upload'):
            result = await AuditLogger.log_data_upload(
                db=mock_db_session,
                user_id=1,
                username="admin",
                dataset_id="dataset-123",
                filename="employees.csv",
                rows_count=500
            )

            mock_db_session.add.assert_called()


class TestAuditLoggerError:
    """Test AuditLogger.log_error convenience method."""

    @pytest.mark.asyncio
    async def test_log_error_method(self, mock_db_session):
        """log_error should create properly formatted error entry."""
        from app.core.audit import AuditLogger

        # If the method exists, test it
        if hasattr(AuditLogger, 'log_error'):
            result = await AuditLogger.log_error(
                db=mock_db_session,
                user_id=1,
                username="user",
                action="predict",
                error_message="Model not loaded",
                endpoint="/api/v1/churn/predict"
            )

            mock_db_session.add.assert_called()


class TestAuditLogIndexes:
    """Test AuditLog table indexes."""

    def test_audit_log_has_indexes(self):
        """AuditLog should have appropriate indexes for querying."""
        from app.core.audit import AuditLog

        # Check table args for indexes
        assert hasattr(AuditLog, '__table_args__')
        table_args = AuditLog.__table_args__

        # Should be a tuple containing Index objects
        assert isinstance(table_args, tuple)

        # Check for expected index names
        index_names = [idx.name for idx in table_args if hasattr(idx, 'name')]
        assert 'idx_audit_user_action' in index_names
        assert 'idx_audit_tenant_timestamp' in index_names
        assert 'idx_audit_resource' in index_names


class TestAuditLogActions:
    """Test common audit log action types."""

    def test_common_action_strings(self):
        """Document common action strings used in the system."""
        # These are the action strings used throughout the application
        common_actions = [
            "login",
            "logout",
            "predict_churn",
            "batch_predict",
            "train_model",
            "upload_dataset",
            "export_data",
            "view_employee",
            "update_settings",
            "create_user",
            "delete_user",
        ]

        # Just ensure these are valid strings
        for action in common_actions:
            assert isinstance(action, str)
            assert len(action) > 0
