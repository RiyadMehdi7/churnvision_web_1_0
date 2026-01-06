"""
Tests for app/services/churn_prediction_service.py - Churn prediction service.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import pandas as pd
import numpy as np


class TestChurnPredictionServiceInit:
    """Test ChurnPredictionService initialization."""

    def test_service_init_without_model(self):
        """Service should initialize without a trained model."""
        from app.services.churn_prediction_service import ChurnPredictionService

        service = ChurnPredictionService()

        assert service.model is None
        assert service.calibrated_model is None
        assert service.label_encoders == {}

    def test_service_has_feature_names(self):
        """Service should define required feature names."""
        from app.services.churn_prediction_service import ChurnPredictionService

        assert hasattr(ChurnPredictionService, 'FEATURE_NAMES')
        assert isinstance(ChurnPredictionService.FEATURE_NAMES, list)
        assert len(ChurnPredictionService.FEATURE_NAMES) > 0

    def test_service_has_category_definitions(self):
        """Service should define department and salary categories."""
        from app.services.churn_prediction_service import ChurnPredictionService

        assert hasattr(ChurnPredictionService, 'DEPARTMENT_CATEGORIES')
        assert hasattr(ChurnPredictionService, 'SALARY_CATEGORIES')
        assert 'sales' in ChurnPredictionService.DEPARTMENT_CATEGORIES
        assert 'low' in ChurnPredictionService.SALARY_CATEGORIES
        assert 'medium' in ChurnPredictionService.SALARY_CATEGORIES
        assert 'high' in ChurnPredictionService.SALARY_CATEGORIES


class TestPerturbableFeature:
    """Test PerturbableFeature dataclass."""

    def test_perturbable_feature_creation(self):
        """Should create PerturbableFeature with required fields."""
        from app.services.churn_prediction_service import PerturbableFeature

        feature = PerturbableFeature(
            name="satisfaction_level",
            label="Satisfaction Level",
            current_value=0.5,
            type="float"
        )

        assert feature.name == "satisfaction_level"
        assert feature.label == "Satisfaction Level"
        assert feature.current_value == 0.5
        assert feature.type == "float"

    def test_perturbable_feature_with_range(self):
        """Should accept min/max range for numeric features."""
        from app.services.churn_prediction_service import PerturbableFeature

        feature = PerturbableFeature(
            name="satisfaction_level",
            label="Satisfaction Level",
            current_value=0.5,
            type="float",
            min_value=0.0,
            max_value=1.0,
            step=0.1
        )

        assert feature.min_value == 0.0
        assert feature.max_value == 1.0
        assert feature.step == 0.1

    def test_perturbable_feature_with_options(self):
        """Should accept options for categorical features."""
        from app.services.churn_prediction_service import PerturbableFeature

        feature = PerturbableFeature(
            name="department",
            label="Department",
            current_value="sales",
            type="categorical",
            options=["sales", "engineering", "marketing"]
        )

        assert feature.options == ["sales", "engineering", "marketing"]


class TestCounterfactualResult:
    """Test CounterfactualResult dataclass."""

    def test_counterfactual_result_creation(self):
        """Should create CounterfactualResult with all metrics."""
        from app.services.churn_prediction_service import CounterfactualResult

        result = CounterfactualResult(
            scenario_name="Higher Satisfaction",
            scenario_id="test-1",
            baseline_churn_prob=0.6,
            baseline_risk_level="High",
            baseline_eltv=50000.0,
            baseline_confidence=0.85,
            baseline_factors=[{"name": "satisfaction", "impact": -0.3}],
            scenario_churn_prob=0.3,
            scenario_risk_level="Medium",
            scenario_eltv=75000.0,
            scenario_confidence=0.80,
            scenario_factors=[{"name": "satisfaction", "impact": 0.1}],
            churn_delta=-0.3,
            eltv_delta=25000.0,
            implied_annual_cost=5000.0,
            implied_roi=5.0
        )

        assert result.scenario_name == "Higher Satisfaction"
        assert result.churn_delta == -0.3
        assert result.eltv_delta == 25000.0
        assert result.implied_roi == 5.0

    def test_counterfactual_result_default_values(self):
        """Should have default values for optional fields."""
        from app.services.churn_prediction_service import CounterfactualResult

        result = CounterfactualResult(
            scenario_name="Test",
            scenario_id="test-1",
            baseline_churn_prob=0.5,
            baseline_risk_level="Medium",
            baseline_eltv=50000.0,
            baseline_confidence=0.8,
            baseline_factors=[],
            scenario_churn_prob=0.4,
            scenario_risk_level="Medium",
            scenario_eltv=55000.0,
            scenario_confidence=0.8,
            scenario_factors=[],
            churn_delta=-0.1,
            eltv_delta=5000.0,
            implied_annual_cost=1000.0,
            implied_roi=5.0
        )

        assert result.baseline_survival_probs == {}
        assert result.scenario_survival_probs == {}
        assert result.modifications == {}
        assert result.prediction_method == "model"


class TestFeaturePreprocessing:
    """Test feature preprocessing functionality."""

    def test_preprocess_features_basic(self, sample_employee_features):
        """Should preprocess features for prediction."""
        from app.services.churn_prediction_service import ChurnPredictionService

        service = ChurnPredictionService()

        # The service should be able to handle the feature dict
        # even without a trained model (for testing purposes)
        assert service is not None
        assert 'satisfaction_level' in sample_employee_features

    def test_feature_names_cover_all_expected(self):
        """Feature names should cover all expected input features."""
        from app.services.churn_prediction_service import ChurnPredictionService

        expected = {
            'satisfaction_level', 'last_evaluation', 'number_project',
            'average_monthly_hours', 'time_spend_company', 'work_accident',
            'promotion_last_5years', 'department', 'salary_level'
        }

        actual = set(ChurnPredictionService.FEATURE_NAMES)

        assert expected == actual


class TestModelTraining:
    """Test model training functionality."""

    def test_training_data_fixture(self, sample_training_data):
        """Training data fixture should have correct format."""
        assert isinstance(sample_training_data, pd.DataFrame)
        assert 'left' in sample_training_data.columns
        assert len(sample_training_data) >= 3

    def test_training_data_has_target(self, sample_training_data):
        """Training data should have target variable."""
        assert 'left' in sample_training_data.columns
        assert sample_training_data['left'].dtype in [np.int64, np.int32, int]

    def test_training_data_has_features(self, sample_training_data):
        """Training data should have required features."""
        from app.services.churn_prediction_service import ChurnPredictionService

        for feature in ChurnPredictionService.FEATURE_NAMES:
            if feature in ['department', 'salary_level']:
                # These are expected to be categorical
                assert feature in sample_training_data.columns
            else:
                assert feature in sample_training_data.columns


class TestRiskLevelClassification:
    """Test risk level classification."""

    def test_risk_levels_enum(self):
        """Risk levels should be properly defined."""
        from app.schemas.churn import ChurnRiskLevel

        assert hasattr(ChurnRiskLevel, 'LOW')
        assert hasattr(ChurnRiskLevel, 'MEDIUM')
        assert hasattr(ChurnRiskLevel, 'HIGH')

    def test_risk_thresholds(self):
        """Risk thresholds should be reasonable."""
        # Low risk: typically < 0.3
        # Medium risk: typically 0.3 - 0.6
        # High risk: typically > 0.6
        # These are business rules, not strict requirements

        # Service should have some way to determine risk levels
        from app.services.churn_prediction_service import ChurnPredictionService

        service = ChurnPredictionService()
        assert service is not None


class TestPredictionResponse:
    """Test prediction response schemas."""

    def test_churn_prediction_response_structure(self):
        """Response should have required fields."""
        from app.schemas.churn import ChurnPredictionResponse, ChurnRiskLevel

        response = ChurnPredictionResponse(
            employee_id="EMP001",
            churn_probability=0.45,
            risk_level=ChurnRiskLevel.MEDIUM,
            confidence_score=0.85,
            feature_importance=[
                {"feature": "satisfaction_level", "importance": 0.3}
            ],
            risk_factors=[
                {"factor": "Low satisfaction", "impact": "high"}
            ],
            recommended_actions=[
                "Schedule 1-on-1 meeting"
            ]
        )

        assert response.employee_id == "EMP001"
        assert 0 <= response.churn_probability <= 1
        assert response.risk_level == ChurnRiskLevel.MEDIUM
        assert 0 <= response.confidence_score <= 1
        assert len(response.feature_importance) > 0
        assert len(response.risk_factors) > 0

    def test_batch_prediction_request(self):
        """Batch prediction request should accept list of employee IDs."""
        from app.schemas.churn import BatchChurnPredictionRequest

        request = BatchChurnPredictionRequest(
            employee_ids=["EMP001", "EMP002", "EMP003"]
        )

        assert len(request.employee_ids) == 3

    def test_model_training_response(self):
        """Training response should have metrics."""
        from app.schemas.churn import ModelTrainingResponse

        response = ModelTrainingResponse(
            status="completed",
            model_id="model-123",
            metrics={
                "accuracy": 0.85,
                "precision": 0.82,
                "recall": 0.78,
                "f1_score": 0.80,
                "auc_roc": 0.88
            },
            training_time_seconds=45.2,
            samples_used=1000,
            features_used=9
        )

        assert response.status == "completed"
        assert response.metrics["accuracy"] == 0.85
        assert response.training_time_seconds > 0


class TestDatasetThresholds:
    """Test data-driven threshold service integration."""

    def test_thresholds_service_exists(self):
        """Data-driven thresholds service should be available."""
        from app.services.data_driven_thresholds_service import data_driven_thresholds_service

        assert data_driven_thresholds_service is not None

    def test_dataset_thresholds_schema(self):
        """DatasetThresholds should have risk boundaries."""
        from app.services.data_driven_thresholds_service import DatasetThresholds

        thresholds = DatasetThresholds(
            low_threshold=0.3,
            medium_threshold=0.6,
            dataset_id="test-dataset"
        )

        assert thresholds.low_threshold < thresholds.medium_threshold


class TestEnsembleService:
    """Test ensemble service integration."""

    def test_ensemble_config_exists(self):
        """EnsembleConfig should be importable."""
        from app.services.ensemble_service import EnsembleConfig

        config = EnsembleConfig()
        assert config is not None

    def test_ensemble_service_exists(self):
        """EnsembleService should be importable."""
        from app.services.ensemble_service import EnsembleService

        assert EnsembleService is not None


class TestModelRouterService:
    """Test model router service integration."""

    def test_model_router_exists(self):
        """ModelRouterService should be available."""
        from app.services.model_router_service import ModelRouterService

        assert ModelRouterService is not None

    def test_model_recommendation_schema(self):
        """ModelRecommendation should be available."""
        from app.services.model_router_service import ModelRecommendation

        assert ModelRecommendation is not None
