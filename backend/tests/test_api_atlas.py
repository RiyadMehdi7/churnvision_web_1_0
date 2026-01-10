"""
Tests for app/api/v1/atlas.py - Counterfactual Analysis endpoints.

Tests cover:
- Employee ML features retrieval
- Single counterfactual simulation
- Batch counterfactual scenarios
- Counterfactual presets
"""
import pytest
from datetime import datetime
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
def mock_employee():
    """Create a mock employee record."""
    employee = MagicMock()
    employee.hr_code = "EMP001"
    employee.full_name = "John Doe"
    employee.employee_cost = 75000.0
    employee.tenure = 3.5
    employee.structure_name = "Engineering"
    employee.position = "Software Engineer"
    return employee


@pytest.fixture
def mock_ml_features():
    """Create mock ML features dictionary."""
    return {
        "satisfaction_level": 0.6,
        "last_evaluation": 0.75,
        "number_project": 4,
        "average_monthly_hours": 200,
        "time_spend_company": 3,
        "work_accident": False,
        "promotion_last_5years": False,
        "department": "technical",
        "salary_level": "medium"
    }


@pytest.fixture
def mock_perturbable_feature():
    """Create a mock perturbable feature."""
    feature = MagicMock()
    feature.name = "satisfaction_level"
    feature.label = "Satisfaction Level"
    feature.current_value = 0.6
    feature.type = "float"
    feature.min_value = 0.0
    feature.max_value = 1.0
    feature.step = 0.05
    feature.options = None
    feature.description = "Employee satisfaction score (0-1)"
    feature.impact_direction = "lower_reduces_churn"
    return feature


@pytest.fixture
def mock_counterfactual_result():
    """Create a mock counterfactual simulation result."""
    result = MagicMock()
    result.scenario_name = "Improve Satisfaction"
    result.scenario_id = "scenario_001"
    result.baseline_churn_prob = 0.65
    result.baseline_risk_level = "high"
    result.baseline_eltv = 150000.0
    result.baseline_confidence = 0.85
    result.baseline_factors = [{"feature": "satisfaction_level", "impact": -0.2}]
    result.scenario_churn_prob = 0.35
    result.scenario_risk_level = "medium"
    result.scenario_eltv = 250000.0
    result.scenario_confidence = 0.88
    result.scenario_factors = [{"feature": "satisfaction_level", "impact": 0.1}]
    result.churn_delta = -0.30
    result.eltv_delta = 100000.0
    result.implied_annual_cost = 5000.0
    result.implied_roi = 20.0
    result.baseline_survival_probs = {"3m": 0.95, "6m": 0.85, "12m": 0.75}
    result.scenario_survival_probs = {"3m": 0.98, "6m": 0.92, "12m": 0.88}
    result.modifications = {"satisfaction_level": 0.9}
    result.simulated_at = datetime.utcnow()
    result.prediction_method = "model"
    return result


# ============ Test Get Employee ML Features ============

class TestGetEmployeeMlFeatures:
    """Test employee ML features endpoint."""

    @pytest.mark.asyncio
    async def test_get_employee_ml_features_success(
        self, mock_db_session, mock_legacy_user, mock_employee,
        mock_ml_features, mock_perturbable_feature
    ):
        """Should return ML features for an employee."""
        from app.api.v1.atlas import get_employee_ml_features

        with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
            mock_service.get_employee_ml_features = AsyncMock(return_value=mock_ml_features)
            mock_service.get_perturbable_features = MagicMock(return_value=[mock_perturbable_feature])

            with patch("app.api.v1.atlas.get_latest_employee_by_hr_code", new_callable=AsyncMock) as mock_get_emp:
                mock_get_emp.return_value = mock_employee

                result = await get_employee_ml_features(
                    employee_id="EMP001",
                    dataset_id=None,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.employee_id == "EMP001"
        assert result.employee_name == "John Doe"
        assert result.features["satisfaction_level"] == 0.6
        assert len(result.perturbable_features) == 1
        assert result.annual_salary == 75000.0

    @pytest.mark.asyncio
    async def test_get_employee_ml_features_not_found(
        self, mock_db_session, mock_legacy_user, mock_ml_features
    ):
        """Should return 404 when employee not found."""
        from app.api.v1.atlas import get_employee_ml_features

        with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
            mock_service.get_employee_ml_features = AsyncMock(return_value=mock_ml_features)
            mock_service.get_perturbable_features = MagicMock(return_value=[])

            with patch("app.api.v1.atlas.get_latest_employee_by_hr_code", new_callable=AsyncMock) as mock_get_emp:
                mock_get_emp.return_value = None

                with pytest.raises(HTTPException) as exc_info:
                    await get_employee_ml_features(
                        employee_id="NONEXISTENT",
                        dataset_id=None,
                        current_user=mock_legacy_user,
                        db=mock_db_session
                    )

                assert exc_info.value.status_code == 404
                assert "Employee not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_employee_ml_features_uses_default_salary(
        self, mock_db_session, mock_legacy_user, mock_employee, mock_ml_features
    ):
        """Should use default salary when employee_cost is None."""
        from app.api.v1.atlas import get_employee_ml_features

        mock_employee.employee_cost = None

        with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
            mock_service.get_employee_ml_features = AsyncMock(return_value=mock_ml_features)
            mock_service.get_perturbable_features = MagicMock(return_value=[])

            with patch("app.api.v1.atlas.get_latest_employee_by_hr_code", new_callable=AsyncMock) as mock_get_emp:
                mock_get_emp.return_value = mock_employee

                result = await get_employee_ml_features(
                    employee_id="EMP001",
                    dataset_id=None,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.annual_salary == 70000.0  # Default value


# ============ Test Run Counterfactual ============

class TestRunCounterfactual:
    """Test single counterfactual simulation endpoint."""

    @pytest.mark.asyncio
    async def test_run_counterfactual_success(
        self, mock_db_session, mock_legacy_user, mock_counterfactual_result
    ):
        """Should run counterfactual simulation successfully."""
        from app.api.v1.atlas import run_counterfactual
        from app.schemas.atlas import CounterfactualRequest

        request = CounterfactualRequest(
            employee_id="EMP001",
            base_features={
                "satisfaction_level": 0.6,
                "last_evaluation": 0.75,
                "number_project": 4,
                "average_monthly_hours": 200,
                "time_spend_company": 3,
                "work_accident": False,
                "promotion_last_5years": False,
                "department": "technical",
                "salary_level": "medium"
            },
            modifications={"satisfaction_level": 0.9},
            scenario_name="Improve Satisfaction"
        )

        with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
            mock_service.simulate_counterfactual = AsyncMock(return_value=mock_counterfactual_result)

            result = await run_counterfactual(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert result.scenario_name == "Improve Satisfaction"
        assert result.baseline_churn_prob == 0.65
        assert result.scenario_churn_prob == 0.35
        assert result.churn_delta == -0.30
        assert result.implied_roi == 20.0

    @pytest.mark.asyncio
    async def test_run_counterfactual_simulation_error(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 500 when simulation fails."""
        from app.api.v1.atlas import run_counterfactual
        from app.schemas.atlas import CounterfactualRequest

        request = CounterfactualRequest(
            employee_id="EMP001",
            base_features={"satisfaction_level": 0.6},
            modifications={"satisfaction_level": 0.9},
            scenario_name="Test Scenario"
        )

        with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
            mock_service.simulate_counterfactual = AsyncMock(
                side_effect=Exception("Model not loaded")
            )

            with pytest.raises(HTTPException) as exc_info:
                await run_counterfactual(
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 500
            assert "Counterfactual simulation failed" in exc_info.value.detail


# ============ Test Batch Counterfactual ============

class TestRunCounterfactualBatch:
    """Test batch counterfactual scenarios endpoint."""

    @pytest.mark.asyncio
    async def test_run_batch_counterfactual_success(
        self, mock_db_session, mock_legacy_user, mock_employee, mock_counterfactual_result
    ):
        """Should run multiple counterfactual scenarios."""
        from app.api.v1.atlas import run_counterfactual_batch
        from app.schemas.atlas import CounterfactualBatchRequest

        # Create multiple scenario results
        result1 = MagicMock()
        result1.scenario_name = "Scenario 1"
        result1.scenario_id = "s1"
        result1.baseline_churn_prob = 0.65
        result1.baseline_risk_level = "high"
        result1.baseline_eltv = 150000.0
        result1.baseline_confidence = 0.85
        result1.baseline_factors = []
        result1.scenario_churn_prob = 0.45
        result1.scenario_risk_level = "medium"
        result1.scenario_eltv = 200000.0
        result1.scenario_confidence = 0.88
        result1.scenario_factors = []
        result1.churn_delta = -0.20
        result1.eltv_delta = 50000.0
        result1.implied_annual_cost = 5000.0
        result1.implied_roi = 10.0
        result1.baseline_survival_probs = {}
        result1.scenario_survival_probs = {}
        result1.modifications = {"satisfaction_level": 0.8}
        result1.simulated_at = datetime.utcnow()
        result1.prediction_method = "model"

        result2 = MagicMock()
        result2.scenario_name = "Scenario 2"
        result2.scenario_id = "s2"
        result2.baseline_churn_prob = 0.65
        result2.baseline_risk_level = "high"
        result2.baseline_eltv = 150000.0
        result2.baseline_confidence = 0.85
        result2.baseline_factors = []
        result2.scenario_churn_prob = 0.35
        result2.scenario_risk_level = "low"
        result2.scenario_eltv = 250000.0
        result2.scenario_confidence = 0.90
        result2.scenario_factors = []
        result2.churn_delta = -0.30
        result2.eltv_delta = 100000.0
        result2.implied_annual_cost = 8000.0
        result2.implied_roi = 12.5
        result2.baseline_survival_probs = {}
        result2.scenario_survival_probs = {}
        result2.modifications = {"promotion_last_5years": True}
        result2.simulated_at = datetime.utcnow()
        result2.prediction_method = "model"

        request = CounterfactualBatchRequest(
            employee_id="EMP001",
            base_features={"satisfaction_level": 0.6, "department": "technical"},
            scenarios=[
                {"name": "Scenario 1", "modifications": {"satisfaction_level": 0.8}},
                {"name": "Scenario 2", "modifications": {"promotion_last_5years": True}},
            ]
        )

        with patch("app.api.v1.atlas.get_latest_employee_by_hr_code", new_callable=AsyncMock) as mock_get_emp:
            mock_get_emp.return_value = mock_employee

            with patch("app.api.v1.atlas.churn_prediction_service") as mock_service:
                mock_service.batch_counterfactuals = AsyncMock(return_value=[result1, result2])

                result = await run_counterfactual_batch(
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.employee_id == "EMP001"
        assert result.employee_name == "John Doe"
        assert len(result.scenarios) == 2
        assert result.best_scenario == "s2"  # Higher ROI
        assert result.comparison_summary["total_scenarios"] == 2

    @pytest.mark.asyncio
    async def test_run_batch_counterfactual_employee_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return error when employee not found."""
        from app.api.v1.atlas import run_counterfactual_batch
        from app.schemas.atlas import CounterfactualBatchRequest

        request = CounterfactualBatchRequest(
            employee_id="NONEXISTENT",
            base_features={"satisfaction_level": 0.6},
            scenarios=[{"name": "Test", "modifications": {"satisfaction_level": 0.8}}]
        )

        with patch("app.api.v1.atlas.get_latest_employee_by_hr_code", new_callable=AsyncMock) as mock_get_emp:
            mock_get_emp.return_value = None

            with pytest.raises(HTTPException) as exc_info:
                await run_counterfactual_batch(
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            # Endpoint catches the 404 and wraps it in 500 generic handler
            # The error message still indicates employee not found
            assert "not found" in exc_info.value.detail.lower()


# ============ Test Counterfactual Presets ============

class TestGetCounterfactualPresets:
    """Test counterfactual presets endpoint."""

    @pytest.mark.asyncio
    async def test_get_presets_returns_list(self, mock_legacy_user):
        """Should return list of preset scenarios."""
        from app.api.v1.atlas import get_counterfactual_presets

        result = await get_counterfactual_presets(current_user=mock_legacy_user)

        assert "presets" in result
        assert len(result["presets"]) > 0

        # Check first preset structure
        first_preset = result["presets"][0]
        assert "id" in first_preset
        assert "name" in first_preset
        assert "description" in first_preset
        assert "modifications" in first_preset
        assert "impact" in first_preset

    @pytest.mark.asyncio
    async def test_get_presets_includes_known_scenarios(self, mock_legacy_user):
        """Should include common scenario presets."""
        from app.api.v1.atlas import get_counterfactual_presets

        result = await get_counterfactual_presets(current_user=mock_legacy_user)

        preset_ids = [p["id"] for p in result["presets"]]

        assert "satisfaction_boost" in preset_ids
        assert "workload_reduction" in preset_ids
        assert "promotion" in preset_ids
        assert "salary_increase" in preset_ids

    @pytest.mark.asyncio
    async def test_get_presets_comprehensive_package(self, mock_legacy_user):
        """Should include comprehensive package with multiple modifications."""
        from app.api.v1.atlas import get_counterfactual_presets

        result = await get_counterfactual_presets(current_user=mock_legacy_user)

        comprehensive = next(
            (p for p in result["presets"] if p["id"] == "comprehensive"), None
        )

        assert comprehensive is not None
        assert len(comprehensive["modifications"]) > 1
        assert "satisfaction_level" in comprehensive["modifications"]
        assert "promotion_last_5years" in comprehensive["modifications"]
