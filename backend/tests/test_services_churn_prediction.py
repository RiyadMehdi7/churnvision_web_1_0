"""
Tests for app/services/churn_prediction.py - Churn prediction ML service.
"""
import importlib
import pytest
import pandas as pd
import numpy as np
from pathlib import Path
from unittest.mock import patch, MagicMock


class TestChurnPredictionServiceInit:
    """Test ChurnPredictionService initialization."""

    def test_service_creates_model_directory(self, tmp_path, monkeypatch):
        """Service should create models directory if not exists."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path / "new_models"))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert (tmp_path / "new_models").exists()

    def test_service_initializes_default_model_in_dev(self, tmp_path, monkeypatch):
        """In development, service should initialize default model."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert service.model is not None
        assert service.active_version == "dev-default"

    def test_service_loads_existing_model(self, tmp_path, monkeypatch, sample_training_data):
        """Service should load existing model from disk."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        # Train and save a model first
        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="logistic", use_existing_data=False)

        import asyncio
        asyncio.get_event_loop().run_until_complete(
            service.train_model(request, sample_training_data)
        )

        # Create new service instance - should load saved model
        service2 = cp.ChurnPredictionService()

        assert service2.model is not None
        assert service2.model_path.exists()


class TestRiskLevelDetermination:
    """Test risk level determination logic."""

    def test_critical_risk_at_075_and_above(self, tmp_path, monkeypatch):
        """Probability >= 0.75 should be CRITICAL."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert service._determine_risk_level(0.75) == cp.ChurnRiskLevel.CRITICAL
        assert service._determine_risk_level(0.99) == cp.ChurnRiskLevel.CRITICAL

    def test_high_risk_between_050_and_075(self, tmp_path, monkeypatch):
        """Probability between 0.50 and 0.75 should be HIGH."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert service._determine_risk_level(0.50) == cp.ChurnRiskLevel.HIGH
        assert service._determine_risk_level(0.74) == cp.ChurnRiskLevel.HIGH

    def test_medium_risk_between_025_and_050(self, tmp_path, monkeypatch):
        """Probability between 0.25 and 0.50 should be MEDIUM."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert service._determine_risk_level(0.25) == cp.ChurnRiskLevel.MEDIUM
        assert service._determine_risk_level(0.49) == cp.ChurnRiskLevel.MEDIUM

    def test_low_risk_below_025(self, tmp_path, monkeypatch):
        """Probability < 0.25 should be LOW."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        assert service._determine_risk_level(0.10) == cp.ChurnRiskLevel.LOW
        assert service._determine_risk_level(0.24) == cp.ChurnRiskLevel.LOW


class TestContributingFactors:
    """Test contributing factors identification."""

    def test_low_satisfaction_detected(self, tmp_path, monkeypatch):
        """Low satisfaction should be identified as critical factor."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.2,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="medium"
        )

        factors = service._get_contributing_factors(features, 0.7)

        assert any(f["feature"] == "satisfaction_level" for f in factors)
        assert any(f["impact"] == "critical" for f in factors)

    def test_high_workload_detected(self, tmp_path, monkeypatch):
        """High workload (>250 hours) should be identified."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.7,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=280,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="medium"
        )

        factors = service._get_contributing_factors(features, 0.5)

        assert any(f["feature"] == "average_monthly_hours" for f in factors)

    def test_no_promotion_long_tenure_detected(self, tmp_path, monkeypatch):
        """Long tenure without promotion should be identified."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.7,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=6,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="medium"
        )

        factors = service._get_contributing_factors(features, 0.5)

        assert any(f["feature"] == "promotion_last_5years" for f in factors)

    def test_factors_limited_to_five(self, tmp_path, monkeypatch):
        """Contributing factors should be limited to 5."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        # Create features with many potential issues
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.1,
            last_evaluation=0.3,
            number_project=8,
            average_monthly_hours=300,
            time_spend_company=7,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="low"
        )

        factors = service._get_contributing_factors(features, 0.9)

        assert len(factors) <= 5


class TestRecommendations:
    """Test recommendation generation."""

    def test_generates_recommendations_for_low_satisfaction(self, tmp_path, monkeypatch):
        """Should recommend meeting for low satisfaction."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.3,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="medium"
        )

        recommendations = service._get_recommendations(features, [])

        assert any("meeting" in r.lower() or "satisfaction" in r.lower() for r in recommendations)

    def test_recommendations_limited_to_five(self, tmp_path, monkeypatch):
        """Recommendations should be limited to 5."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        features = cp.EmployeeChurnFeatures(
            satisfaction_level=0.1,
            last_evaluation=0.3,
            number_project=1,
            average_monthly_hours=300,
            time_spend_company=7,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="low"
        )

        recommendations = service._get_recommendations(features, [])

        assert len(recommendations) <= 5


class TestHeuristicPrediction:
    """Test heuristic-based prediction fallback."""

    def test_low_satisfaction_increases_score(self, tmp_path, monkeypatch):
        """Low satisfaction should increase churn score."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        low_sat = cp.EmployeeChurnFeatures(
            satisfaction_level=0.1,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=True,
            department="sales",
            salary_level="high"
        )

        high_sat = cp.EmployeeChurnFeatures(
            satisfaction_level=0.9,
            last_evaluation=0.7,
            number_project=3,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=True,
            department="sales",
            salary_level="high"
        )

        assert service._heuristic_prediction(low_sat) > service._heuristic_prediction(high_sat)

    def test_score_capped_at_one(self, tmp_path, monkeypatch):
        """Score should never exceed 1.0."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        worst_case = cp.EmployeeChurnFeatures(
            satisfaction_level=0.0,
            last_evaluation=0.1,
            number_project=8,
            average_monthly_hours=300,
            time_spend_company=10,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="low"
        )

        score = service._heuristic_prediction(worst_case)

        assert score <= 1.0


class TestPredictChurn:
    """Test single employee churn prediction."""

    @pytest.mark.asyncio
    async def test_predict_returns_valid_response(self, tmp_path, monkeypatch):
        """predict_churn should return valid ChurnPredictionResponse."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        request = cp.ChurnPredictionRequest(
            employee_id="emp-123",
            features=cp.EmployeeChurnFeatures(
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

        response = await service.predict_churn(request)

        assert response.employee_id == "emp-123"
        assert 0 <= response.churn_probability <= 1
        assert response.risk_level in cp.ChurnRiskLevel
        assert isinstance(response.contributing_factors, list)
        assert isinstance(response.recommendations, list)
        assert response.predicted_at is not None

    @pytest.mark.asyncio
    async def test_predict_high_risk_employee(self, tmp_path, monkeypatch, sample_high_risk_features):
        """High-risk features should result in higher probability."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        request = cp.ChurnPredictionRequest(
            employee_id="emp-high-risk",
            features=cp.EmployeeChurnFeatures(**sample_high_risk_features)
        )

        response = await service.predict_churn(request)

        # High risk features should produce elevated probability
        assert response.churn_probability > 0.4


class TestBatchPrediction:
    """Test batch churn prediction."""

    @pytest.mark.asyncio
    async def test_batch_predict_processes_all(self, tmp_path, monkeypatch, sample_employee_features):
        """Batch prediction should process all employees."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        requests = [
            cp.ChurnPredictionRequest(
                employee_id=f"emp-{i}",
                features=cp.EmployeeChurnFeatures(**sample_employee_features)
            )
            for i in range(5)
        ]

        batch_request = cp.BatchChurnPredictionRequest(predictions=requests)
        response = await service.predict_batch(batch_request)

        assert response.total_processed == 5
        assert len(response.predictions) == 5

    @pytest.mark.asyncio
    async def test_batch_counts_risk_levels(self, tmp_path, monkeypatch):
        """Batch prediction should count risk levels correctly."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()

        # Create mix of high and low risk
        high_risk = cp.EmployeeChurnFeatures(
            satisfaction_level=0.1,
            last_evaluation=0.3,
            number_project=7,
            average_monthly_hours=280,
            time_spend_company=5,
            work_accident=False,
            promotion_last_5years=False,
            department="sales",
            salary_level="low"
        )

        low_risk = cp.EmployeeChurnFeatures(
            satisfaction_level=0.9,
            last_evaluation=0.85,
            number_project=4,
            average_monthly_hours=160,
            time_spend_company=2,
            work_accident=False,
            promotion_last_5years=True,
            department="IT",
            salary_level="high"
        )

        requests = [
            cp.ChurnPredictionRequest(employee_id="high-1", features=high_risk),
            cp.ChurnPredictionRequest(employee_id="high-2", features=high_risk),
            cp.ChurnPredictionRequest(employee_id="low-1", features=low_risk),
        ]

        batch_request = cp.BatchChurnPredictionRequest(predictions=requests)
        response = await service.predict_batch(batch_request)

        total = response.high_risk_count + response.medium_risk_count + response.low_risk_count
        assert total == 3


class TestModelTraining:
    """Test model training functionality."""

    @pytest.mark.asyncio
    async def test_train_xgboost_model(self, tmp_path, monkeypatch, sample_training_data):
        """Should successfully train XGBoost model."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="xgboost", use_existing_data=False)

        response = await service.train_model(request, sample_training_data)

        assert response.model_type == "xgboost"
        assert 0 <= response.accuracy <= 1
        assert response.training_samples == len(sample_training_data)
        assert service.model_path.exists()

    @pytest.mark.asyncio
    async def test_train_random_forest_model(self, tmp_path, monkeypatch, sample_training_data):
        """Should successfully train Random Forest model."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="random_forest", use_existing_data=False)

        response = await service.train_model(request, sample_training_data)

        assert response.model_type == "random_forest"
        assert response.feature_importance is not None

    @pytest.mark.asyncio
    async def test_train_logistic_model(self, tmp_path, monkeypatch, sample_training_data):
        """Should successfully train Logistic Regression model."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="logistic", use_existing_data=False)

        response = await service.train_model(request, sample_training_data)

        assert response.model_type == "logistic"

    @pytest.mark.asyncio
    async def test_train_saves_artifacts(self, tmp_path, monkeypatch, sample_training_data):
        """Training should save model, scaler, and encoders."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="logistic", use_existing_data=False)

        await service.train_model(request, sample_training_data)

        assert service.model_path.exists()
        assert service.scaler_path.exists()
        assert service.encoders_path.exists()

    @pytest.mark.asyncio
    async def test_train_calculates_metrics(self, tmp_path, monkeypatch, sample_training_data):
        """Training should calculate accuracy, precision, recall, f1."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="xgboost", use_existing_data=False)

        response = await service.train_model(request, sample_training_data)

        assert response.accuracy is not None
        assert response.precision is not None
        assert response.recall is not None
        assert response.f1_score is not None
        assert all(0 <= m <= 1 for m in [response.accuracy, response.precision, response.recall, response.f1_score])


class TestTrainedModelPrediction:
    """Test predictions with a trained model."""

    @pytest.mark.asyncio
    async def test_prediction_after_training(self, tmp_path, monkeypatch, sample_training_data):
        """Prediction should work after training."""
        monkeypatch.setenv("MODELS_DIR", str(tmp_path))
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.services import churn_prediction as cp
        importlib.reload(cp)

        service = cp.ChurnPredictionService()
        request = cp.ModelTrainingRequest(model_type="logistic", use_existing_data=False)
        await service.train_model(request, sample_training_data)

        pred_request = cp.ChurnPredictionRequest(
            employee_id="emp-test",
            features=cp.EmployeeChurnFeatures(
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

        response = await service.predict_churn(pred_request)

        assert 0 <= response.churn_probability <= 1
        assert response.risk_level in cp.ChurnRiskLevel
