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
            employee_id=123,  # Use int, not string
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

        # Mock the churn service - use Pydantic model for proper serialization
        from app.schemas.churn import ChurnPredictionResponse
        from datetime import datetime

        mock_response = ChurnPredictionResponse(
            employee_id=123,
            churn_probability=0.65,
            risk_level=ChurnRiskLevel.HIGH,
            contributing_factors=[],
            recommendations=[],
            predicted_at=datetime.utcnow()
        )

        # Mock the dataset service (returns mock dataset)
        mock_dataset = MagicMock()
        mock_dataset.dataset_id = "test-dataset"

        with patch("app.api.v1.churn.get_active_dataset", new_callable=AsyncMock, return_value=mock_dataset):
            with patch("app.api.v1.churn.churn_service") as mock_service:
                mock_service.predict_churn = AsyncMock(return_value=mock_response)

                with patch("app.api.v1.churn.AuditLogger.log_prediction", new_callable=AsyncMock):
                    result = await predict_employee_churn(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert result.employee_id == 123


class TestBatchPredictEndpoint:
    """Test batch prediction endpoint."""

    @pytest.mark.asyncio
    async def test_batch_predict_processes_multiple(self, mock_db_session, mock_user):
        """Batch predict should process multiple employees."""
        from app.api.v1.churn import predict_batch_churn
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
                ChurnPredictionRequest(employee_id=i, features=features)
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
            with patch("app.api.v1.churn.get_active_dataset") as mock_dataset:
                mock_dataset_obj = MagicMock()
                mock_dataset_obj.dataset_id = "test-dataset"
                mock_dataset.return_value = mock_dataset_obj

                result = await predict_batch_churn(
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
        from app.api.v1.churn import churn_service_health

        with patch("app.api.v1.churn.churn_service") as mock_service:
            mock_service.model = MagicMock()
            mock_service.active_version = "v1.0"

            result = await churn_service_health()

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

    def test_salary_level_values(self):
        """Salary level should accept valid values."""
        from app.schemas.churn import EmployeeChurnFeatures

        # Valid salary levels: low, medium, high
        for salary in ["low", "medium", "high"]:
            features = EmployeeChurnFeatures(
                satisfaction_level=0.5,
                last_evaluation=0.7,
                number_project=3,
                average_monthly_hours=160,
                time_spend_company=2,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level=salary
            )
            assert features.salary_level == salary

    def test_risk_level_enum_values(self):
        """ChurnRiskLevel should have correct values."""
        from app.schemas.churn import ChurnRiskLevel

        # Enum values are lowercase in the actual implementation
        assert ChurnRiskLevel.LOW.value == "low"
        assert ChurnRiskLevel.MEDIUM.value == "medium"
        assert ChurnRiskLevel.HIGH.value == "high"


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
