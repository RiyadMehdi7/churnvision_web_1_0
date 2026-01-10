"""
Tests for app/api/v1/model_monitoring.py - Model Monitoring endpoints.

Tests cover:
- Drift status checking
- Drift detection
- Drift history
- Model health status
- Model alerts (list, resolve)
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_legacy_user():
    """Create a mock legacy user for auth."""
    user = MagicMock()
    user.id = 1
    user.username = "testuser"
    user.email = "test@example.com"
    user.is_active = True
    return user


@pytest.fixture
def mock_reference_info_set():
    """Create mock reference info when data is set."""
    return {
        "status": "set",
        "sample_size": 1000,
        "n_features": 12,
        "model_version": "v1.2.3",
        "timestamp": datetime.utcnow().isoformat(),
    }


@pytest.fixture
def mock_reference_info_not_set():
    """Create mock reference info when no data is set."""
    return {
        "status": "not_set",
        "sample_size": None,
        "n_features": None,
        "model_version": None,
        "timestamp": None,
    }


@pytest.fixture
def mock_drift_report():
    """Create a mock drift report."""
    report = MagicMock()
    report.timestamp = datetime.utcnow()
    report.model_version = "v1.2.3"
    report.overall_drift_detected = True
    report.overall_severity = MagicMock()
    report.overall_severity.value = "moderate"
    report.overall_drift_score = 0.15
    report.drifted_features = ["satisfaction_level", "average_monthly_hours"]
    report.recommendations = ["Monitor drift closely", "Consider retraining soon"]
    report.reference_sample_size = 1000
    report.current_sample_size = 200

    # Feature results
    feature1 = MagicMock()
    feature1.feature_name = "satisfaction_level"
    feature1.drift_score = 0.18
    feature1.p_value = 0.02
    feature1.drift_detected = True
    feature1.severity = MagicMock()
    feature1.severity.value = "moderate"
    feature1.method = "ks_test"

    feature2 = MagicMock()
    feature2.feature_name = "average_monthly_hours"
    feature2.drift_score = 0.12
    feature2.p_value = 0.08
    feature2.drift_detected = True
    feature2.severity = MagicMock()
    feature2.severity.value = "low"
    feature2.method = "ks_test"

    report.feature_results = [feature1, feature2]
    return report


@pytest.fixture
def mock_drift_record():
    """Create a mock drift monitoring record."""
    record = MagicMock()
    record.id = 1
    record.timestamp = datetime.utcnow()
    record.feature_name = "satisfaction_level"
    record.drift_score = 0.18
    record.p_value = 0.02
    record.drift_type = "ks_test"
    return record


@pytest.fixture
def mock_model_alert():
    """Create a mock model alert."""
    alert = MagicMock()
    alert.id = "alert-001"
    alert.timestamp = datetime.utcnow()
    alert.alert_type = "drift_detected"
    alert.severity = "warning"
    alert.message = "Moderate drift detected in satisfaction_level"
    alert.resolved = 0
    alert.resolved_at = None
    return alert


@pytest.fixture
def mock_performance_record():
    """Create a mock performance monitoring record."""
    record = MagicMock()
    record.id = 1
    record.timestamp = datetime.utcnow()
    record.model_version = "v1.2.3"
    record.auc_roc = 0.85
    record.accuracy = 0.82
    record.precision_score = 0.78
    record.recall = 0.80
    return record


# ============ Test Drift Status ============

class TestGetDriftStatus:
    """Test drift status endpoint."""

    @pytest.mark.asyncio
    async def test_get_drift_status_with_reference_data(
        self, mock_legacy_user, mock_reference_info_set
    ):
        """Should return status when reference data is set."""
        from app.api.v1.model_monitoring import get_drift_status

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set

            result = await get_drift_status(current_user=mock_legacy_user)

        assert result.has_reference_data is True
        assert result.reference_sample_size == 1000
        assert result.reference_feature_count == 12
        assert result.model_version == "v1.2.3"

    @pytest.mark.asyncio
    async def test_get_drift_status_no_reference_data(
        self, mock_legacy_user, mock_reference_info_not_set
    ):
        """Should indicate when no reference data is set."""
        from app.api.v1.model_monitoring import get_drift_status

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_not_set

            result = await get_drift_status(current_user=mock_legacy_user)

        assert result.has_reference_data is False
        assert result.reference_sample_size is None
        assert result.model_version is None


# ============ Test Check Drift ============

class TestCheckDrift:
    """Test drift check endpoint."""

    @pytest.mark.asyncio
    async def test_check_drift_no_reference_data(
        self, mock_db_session, mock_legacy_user, mock_reference_info_not_set
    ):
        """Should return 400 when no reference data is set."""
        from app.api.v1.model_monitoring import check_drift, DriftCheckRequest

        request = DriftCheckRequest(days_back=7)

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_not_set

            with pytest.raises(HTTPException) as exc_info:
                await check_drift(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_legacy_user,
                )

            assert exc_info.value.status_code == 400
            assert "Reference data not set" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_check_drift_insufficient_data(
        self, mock_db_session, mock_legacy_user, mock_reference_info_set
    ):
        """Should return 400 when insufficient current data."""
        from app.api.v1.model_monitoring import check_drift, DriftCheckRequest

        request = DriftCheckRequest(days_back=7)

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set

            with patch("app.api.v1.model_monitoring._get_current_feature_data") as mock_get_data:
                mock_get_data.return_value = None  # No data available

                with pytest.raises(HTTPException) as exc_info:
                    await check_drift(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user,
                    )

                assert exc_info.value.status_code == 400
                assert "Insufficient current data" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_check_drift_success(
        self, mock_db_session, mock_legacy_user, mock_reference_info_set, mock_drift_report
    ):
        """Should successfully check drift and return report."""
        from app.api.v1.model_monitoring import check_drift, DriftCheckRequest
        import numpy as np

        request = DriftCheckRequest(days_back=7)

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set
            mock_service.detect_drift.return_value = mock_drift_report

            with patch("app.api.v1.model_monitoring._get_current_feature_data") as mock_get_data:
                # Return mock data with enough samples
                mock_get_data.return_value = np.random.rand(100, 12)

                with patch("app.api.v1.model_monitoring._store_drift_results") as mock_store:
                    mock_store.return_value = None

                    result = await check_drift(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_legacy_user,
                    )

        assert result.overall_drift_detected is True
        assert result.overall_severity == "moderate"
        assert len(result.drifted_features) == 2
        assert "satisfaction_level" in result.drifted_features
        assert len(result.feature_results) == 2


# ============ Test Drift History ============

class TestGetDriftHistory:
    """Test drift history endpoint."""

    @pytest.mark.asyncio
    async def test_get_drift_history_success(
        self, mock_db_session, mock_legacy_user, mock_drift_record
    ):
        """Should return drift history."""
        from app.api.v1.model_monitoring import get_drift_history

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_drift_record])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_drift_history(
            feature_name=None,
            days=30,
            limit=100,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 1
        assert result[0].feature_name == "satisfaction_level"
        assert result[0].drift_score == 0.18

    @pytest.mark.asyncio
    async def test_get_drift_history_filtered_by_feature(
        self, mock_db_session, mock_legacy_user, mock_drift_record
    ):
        """Should filter history by feature name."""
        from app.api.v1.model_monitoring import get_drift_history

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_drift_record])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_drift_history(
            feature_name="satisfaction_level",
            days=30,
            limit=100,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 1
        # Verify the query was constructed with feature filter
        mock_db_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_drift_history_empty(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return empty list when no history."""
        from app.api.v1.model_monitoring import get_drift_history

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_drift_history(
            feature_name=None,
            days=30,
            limit=100,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 0


# ============ Test Model Health ============

class TestGetModelHealth:
    """Test model health endpoint."""

    @pytest.mark.asyncio
    async def test_get_model_health_healthy(
        self, mock_db_session, mock_legacy_user, mock_reference_info_set
    ):
        """Should return healthy status when all is well."""
        from app.api.v1.model_monitoring import get_model_health

        # Mock no alerts
        mock_alerts_result = MagicMock()
        mock_alerts_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[])
        ))

        # Mock low drift
        mock_drift_record = MagicMock()
        mock_drift_record.drift_score = 0.05  # Low drift
        mock_drift_result = MagicMock()
        mock_drift_result.scalar_one_or_none = MagicMock(return_value=mock_drift_record)

        # Mock performance
        mock_perf_result = MagicMock()
        mock_perf_result.scalar_one_or_none = MagicMock(return_value=None)

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_perf_result,
            mock_alerts_result,
            mock_drift_result,
        ])

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set

            result = await get_model_health(
                db=mock_db_session,
                current_user=mock_legacy_user,
            )

        assert result.status == "healthy"
        assert result.drift_status == "healthy"
        assert result.alerts_count == 0

    @pytest.mark.asyncio
    async def test_get_model_health_warning_drift(
        self, mock_db_session, mock_legacy_user, mock_reference_info_set
    ):
        """Should return warning status for moderate drift."""
        from app.api.v1.model_monitoring import get_model_health

        # Mock few alerts
        mock_alert = MagicMock()
        mock_alerts_result = MagicMock()
        mock_alerts_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_alert])
        ))

        # Mock moderate drift
        mock_drift_record = MagicMock()
        mock_drift_record.drift_score = 0.15  # Moderate drift
        mock_drift_result = MagicMock()
        mock_drift_result.scalar_one_or_none = MagicMock(return_value=mock_drift_record)

        mock_perf_result = MagicMock()
        mock_perf_result.scalar_one_or_none = MagicMock(return_value=None)

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_perf_result,
            mock_alerts_result,
            mock_drift_result,
        ])

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set

            result = await get_model_health(
                db=mock_db_session,
                current_user=mock_legacy_user,
            )

        assert result.status == "warning"
        assert result.drift_status == "warning"
        assert "Monitor closely" in result.recommendations[0]

    @pytest.mark.asyncio
    async def test_get_model_health_critical(
        self, mock_db_session, mock_legacy_user, mock_reference_info_set
    ):
        """Should return critical status for high drift or many alerts."""
        from app.api.v1.model_monitoring import get_model_health

        # Mock many alerts (6+)
        mock_alerts = [MagicMock() for _ in range(6)]
        mock_alerts_result = MagicMock()
        mock_alerts_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=mock_alerts)
        ))

        # Mock critical drift
        mock_drift_record = MagicMock()
        mock_drift_record.drift_score = 0.30  # High drift
        mock_drift_result = MagicMock()
        mock_drift_result.scalar_one_or_none = MagicMock(return_value=mock_drift_record)

        mock_perf_result = MagicMock()
        mock_perf_result.scalar_one_or_none = MagicMock(return_value=None)

        mock_db_session.execute = AsyncMock(side_effect=[
            mock_perf_result,
            mock_alerts_result,
            mock_drift_result,
        ])

        with patch("app.api.v1.model_monitoring.model_drift_service") as mock_service:
            mock_service.get_reference_info.return_value = mock_reference_info_set

            result = await get_model_health(
                db=mock_db_session,
                current_user=mock_legacy_user,
            )

        assert result.status == "critical"
        assert result.drift_status == "critical"
        assert result.alerts_count == 6


# ============ Test Model Alerts ============

class TestGetModelAlerts:
    """Test model alerts list endpoint."""

    @pytest.mark.asyncio
    async def test_get_model_alerts_success(
        self, mock_db_session, mock_legacy_user, mock_model_alert
    ):
        """Should return list of alerts."""
        from app.api.v1.model_monitoring import get_model_alerts

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_model_alert])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_model_alerts(
            resolved=False,
            severity=None,
            limit=50,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 1
        assert result[0]["id"] == "alert-001"
        assert result[0]["alert_type"] == "drift_detected"
        assert result[0]["resolved"] is False

    @pytest.mark.asyncio
    async def test_get_model_alerts_filtered_by_severity(
        self, mock_db_session, mock_legacy_user, mock_model_alert
    ):
        """Should filter alerts by severity."""
        from app.api.v1.model_monitoring import get_model_alerts

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_model_alert])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_model_alerts(
            resolved=False,
            severity="warning",
            limit=50,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 1
        assert result[0]["severity"] == "warning"

    @pytest.mark.asyncio
    async def test_get_model_alerts_include_resolved(
        self, mock_db_session, mock_legacy_user
    ):
        """Should include resolved alerts when requested."""
        from app.api.v1.model_monitoring import get_model_alerts

        resolved_alert = MagicMock()
        resolved_alert.id = "alert-002"
        resolved_alert.timestamp = datetime.utcnow()
        resolved_alert.alert_type = "performance_drop"
        resolved_alert.severity = "info"
        resolved_alert.message = "Performance improved"
        resolved_alert.resolved = 1
        resolved_alert.resolved_at = datetime.utcnow()

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[resolved_alert])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_model_alerts(
            resolved=True,
            severity=None,
            limit=50,
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert len(result) == 1
        assert result[0]["resolved"] is True
        assert result[0]["resolved_at"] is not None


class TestResolveAlert:
    """Test resolve alert endpoint."""

    @pytest.mark.asyncio
    async def test_resolve_alert_success(
        self, mock_db_session, mock_legacy_user, mock_model_alert
    ):
        """Should resolve alert successfully."""
        from app.api.v1.model_monitoring import resolve_alert

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_model_alert)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()

        result = await resolve_alert(
            alert_id="alert-001",
            db=mock_db_session,
            current_user=mock_legacy_user,
        )

        assert result["status"] == "resolved"
        assert result["alert_id"] == "alert-001"
        assert mock_model_alert.resolved == 1
        assert mock_model_alert.resolved_at is not None
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_resolve_alert_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when alert not found."""
        from app.api.v1.model_monitoring import resolve_alert

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await resolve_alert(
                alert_id="nonexistent",
                db=mock_db_session,
                current_user=mock_legacy_user,
            )

        assert exc_info.value.status_code == 404
        assert "Alert not found" in exc_info.value.detail
