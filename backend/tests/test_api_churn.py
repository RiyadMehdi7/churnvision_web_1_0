"""
Tests for app/api/v1/churn.py - Churn prediction endpoints.
"""
import pytest
import json
import io
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


class TestPredictEndpoint:
    """Test churn prediction endpoint."""

    @pytest.mark.asyncio
    async def test_predict_returns_response(self, mock_db_session, mock_user):
        """Predict endpoint should return valid prediction."""
        from app.api.v1.churn import predict_employee_churn
        from app.schemas.churn import ChurnPredictionRequest, EmployeeChurnFeatures, ChurnRiskLevel

        request = ChurnPredictionRequest(
            employee_id="emp-123",
            features=EmployeeChurnFeatures(
                satisfaction_level=0.4,
                last_evaluation=0.5,
                number_project=3,
                average_monthly_hours=180,
                time_spend_company=3,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="low"
            )
        )

        # Mock the churn service
        mock_response = MagicMock()
        mock_response.employee_id = "emp-123"
        mock_response.churn_probability = 0.65
        mock_response.risk_level = ChurnRiskLevel.HIGH
        mock_response.contributing_factors = []
        mock_response.recommendations = []

        with patch("app.api.v1.churn.churn_service") as mock_service:
            mock_service.predict_churn = AsyncMock(return_value=mock_response)

            with patch("app.api.v1.churn.AuditLogger.log_prediction", new_callable=AsyncMock):
                result = await predict_employee_churn(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.employee_id == "emp-123"


class TestBatchPredictEndpoint:
    """Test batch prediction endpoint."""

    @pytest.mark.asyncio
    async def test_batch_predict_processes_multiple(self, mock_db_session, mock_user):
        """Batch predict should process multiple employees."""
        from app.api.v1.churn import batch_predict
        from app.schemas.churn import (
            BatchChurnPredictionRequest,
            ChurnPredictionRequest,
            EmployeeChurnFeatures,
            BatchChurnPredictionResponse,
            ChurnRiskLevel
        )

        features = EmployeeChurnFeatures(
            satisfaction_level=0.4,
            last_evaluation=0.5,
            number_project=3,
            average_monthly_hours=180,
            time_spend_company=3,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="low"
        )

        request = BatchChurnPredictionRequest(
            predictions=[
                ChurnPredictionRequest(employee_id=f"emp-{i}", features=features)
                for i in range(3)
            ]
        )

        mock_response = BatchChurnPredictionResponse(
            predictions=[],
            total_processed=3,
            high_risk_count=1,
            medium_risk_count=1,
            low_risk_count=1
        )

        with patch("app.api.v1.churn.churn_service") as mock_service:
            mock_service.predict_batch = AsyncMock(return_value=mock_response)

            result = await batch_predict(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.total_processed == 3


class TestHealthEndpoint:
    """Test churn service health endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_status(self):
        """Health endpoint should return service status."""
        from app.api.v1.churn import health_check

        with patch("app.api.v1.churn.churn_service") as mock_service:
            mock_service.model = MagicMock()
            mock_service.active_version = "v1.0"

            result = await health_check()

        assert result["status"] == "healthy"
        assert result["model_loaded"] is True


class TestSchemaValidation:
    """Test Pydantic schema validation."""

    def test_employee_features_valid(self):
        """Valid features should pass validation."""
        from app.schemas.churn import EmployeeChurnFeatures

        features = EmployeeChurnFeatures(
            satisfaction_level=0.5,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="medium"
        )

        assert features.satisfaction_level == 0.5
        assert features.department == "sales"

    def test_employee_features_satisfaction_range(self):
        """Satisfaction level must be 0-1."""
        from app.schemas.churn import EmployeeChurnFeatures
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EmployeeChurnFeatures(
                satisfaction_level=1.5,  # Invalid
                last_evaluation=0.7,
                number_project=3,
                average_monthly_hours=160,
                time_spend_company=2,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="medium"
            )

    def test_employee_features_negative_satisfaction(self):
        """Negative satisfaction should fail."""
        from app.schemas.churn import EmployeeChurnFeatures
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EmployeeChurnFeatures(
                satisfaction_level=-0.1,  # Invalid
                last_evaluation=0.7,
                number_project=3,
                average_monthly_hours=160,
                time_spend_company=2,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="medium"
            )

    def test_employee_features_evaluation_range(self):
        """Evaluation must be 0-1."""
        from app.schemas.churn import EmployeeChurnFeatures
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EmployeeChurnFeatures(
                satisfaction_level=0.5,
                last_evaluation=2.0,  # Invalid
                number_project=3,
                average_monthly_hours=160,
                time_spend_company=2,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="medium"
            )

    def test_salary_level_enum(self):
        """Salary level must be valid enum."""
        from app.schemas.churn import EmployeeChurnFeatures
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EmployeeChurnFeatures(
                satisfaction_level=0.5,
                last_evaluation=0.7,
                number_project=3,
                average_monthly_hours=160,
                time_spend_company=2,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="invalid"  # Invalid
            )

    def test_risk_level_enum_values(self):
        """ChurnRiskLevel should have correct values."""
        from app.schemas.churn import ChurnRiskLevel

        assert ChurnRiskLevel.LOW.value == "LOW"
        assert ChurnRiskLevel.MEDIUM.value == "MEDIUM"
        assert ChurnRiskLevel.HIGH.value == "HIGH"
        assert ChurnRiskLevel.CRITICAL.value == "CRITICAL"


class TestModelTrainingRequest:
    """Test model training request schema."""

    def test_valid_training_request(self):
        """Valid training request should pass."""
        from app.schemas.churn import ModelTrainingRequest

        request = ModelTrainingRequest(
            model_type="xgboost",
            use_existing_data=False
        )

        assert request.model_type == "xgboost"

    def test_training_request_with_hyperparameters(self):
        """Training request with hyperparameters should pass."""
        from app.schemas.churn import ModelTrainingRequest

        request = ModelTrainingRequest(
            model_type="random_forest",
            use_existing_data=False,
            hyperparameters={
                "n_estimators": 200,
                "max_depth": 10
            }
        )

        assert request.hyperparameters["n_estimators"] == 200


class TestModelTrainingResponse:
    """Test model training response schema."""

    def test_training_response_structure(self):
        """Training response should have correct structure."""
        from app.schemas.churn import ModelTrainingResponse
        from datetime import datetime

        response = ModelTrainingResponse(
            model_id="xgboost_20240101",
            model_type="xgboost",
            accuracy=0.85,
            precision=0.82,
            recall=0.88,
            f1_score=0.85,
            trained_at=datetime.utcnow(),
            training_samples=1000,
            feature_importance={"satisfaction_level": 0.25}
        )

        assert response.accuracy == 0.85
        assert response.training_samples == 1000


class TestBatchPredictionResponse:
    """Test batch prediction response schema."""

    def test_batch_response_counts(self):
        """Batch response should have risk counts."""
        from app.schemas.churn import BatchChurnPredictionResponse

        response = BatchChurnPredictionResponse(
            predictions=[],
            total_processed=10,
            high_risk_count=3,
            medium_risk_count=4,
            low_risk_count=3
        )

        assert response.total_processed == 10
        assert response.high_risk_count + response.medium_risk_count + response.low_risk_count == 10
