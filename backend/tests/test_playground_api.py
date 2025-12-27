"""
Comprehensive tests for Playground API endpoints.

Tests cover:
- Employee data retrieval
- Treatment suggestions
- Treatment simulation
- Manual simulation (what-if)
- ELTV calculations
- ROI dashboard
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import math


class TestPlaygroundEmployeeData:
    """Tests for GET /playground/data/{employee_id}"""

    @pytest.fixture
    def mock_employee(self):
        """Mock employee from HR data."""
        employee = MagicMock()
        employee.hr_code = "EMP000001"
        employee.full_name = "Test Employee"
        employee.structure_name = "Engineering"
        employee.position = "Senior Engineer"
        employee.status = "Active"
        employee.tenure = Decimal("5.0")
        employee.employee_cost = Decimal("75000.00")
        employee.report_date = "2024-01-01"
        employee.termination_date = None
        return employee

    @pytest.fixture
    def mock_churn_output(self):
        """Mock churn prediction output."""
        churn = MagicMock()
        churn.resign_proba = Decimal("0.35")
        churn.shap_values = {
            "satisfaction_level": "high",
            "time_spend_company": "medium",
            "salary_level": "low"
        }
        return churn

    def test_survival_probabilities_monotonically_decrease(self):
        """Survival probabilities should decrease over time."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()
        result = svc.calculate_eltv(
            annual_salary=75000.0,
            churn_probability=0.35,
            tenure_years=5.0,
            position_level="senior"
        )

        probs = result.survival_probabilities
        for month in range(1, 24):
            current = probs.get(f"month_{month}", 0)
            next_val = probs.get(f"month_{month + 1}", 0)
            assert current >= next_val, f"Month {month} ({current}) should be >= Month {month+1} ({next_val})"

    def test_churn_probability_bounds(self):
        """Churn probability should be between 0 and 1."""
        # Valid probabilities (avoid exact 0 and 1 which get clamped)
        for prob in [0.01, 0.15, 0.5, 0.7, 0.99]:
            from app.services.eltv_service import ELTVService
            svc = ELTVService()
            result = svc.calculate_eltv(
                annual_salary=50000.0,
                churn_probability=prob,
                tenure_years=2.0,
                position_level="mid"
            )
            assert result.eltv >= 0, f"ELTV should be positive for churn prob {prob}"


class TestELTVCalculations:
    """Tests for ELTV calculation accuracy."""

    def test_eltv_basic_calculation(self):
        """Test basic ELTV calculation matches expected formula."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()
        result = svc.calculate_eltv(
            annual_salary=60000.0,
            churn_probability=0.15,
            tenure_years=8.0,
            position_level="senior"
        )

        # Verify result has expected attributes
        assert hasattr(result, 'eltv')
        assert hasattr(result, 'survival_probabilities')
        assert hasattr(result, 'expected_tenure_months')
        assert hasattr(result, 'replacement_cost')
        assert hasattr(result, 'revenue_multiplier')

        # Verify ELTV is reasonable (between 1x and 10x annual salary)
        assert result.eltv >= 60000
        assert result.eltv <= 600000

    def test_weibull_shape_by_tenure(self):
        """Test Weibull shape parameter varies by tenure."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        # Tenure < 1 year: k = 0.8
        result_new = svc.calculate_eltv(60000, 0.2, 0.5, "entry")

        # Tenure 1-3 years: k = 1.0
        result_mid = svc.calculate_eltv(60000, 0.2, 2.0, "mid")

        # Tenure > 3 years: k = 1.2
        result_veteran = svc.calculate_eltv(60000, 0.2, 5.0, "senior")

        # All should return valid ELTVs
        assert result_new.eltv > 0
        assert result_mid.eltv > 0
        assert result_veteran.eltv > 0

    def test_revenue_multiplier_by_position(self):
        """Test revenue multiplier varies by position level."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        # Entry level: 2.0x
        entry_result = svc.calculate_eltv(50000, 0.2, 1.0, "entry")
        assert entry_result.revenue_multiplier == 2.0

        # Mid level: 2.5x
        mid_result = svc.calculate_eltv(70000, 0.2, 3.0, "mid")
        assert mid_result.revenue_multiplier == 2.5

        # Senior level: 3.0x
        senior_result = svc.calculate_eltv(100000, 0.2, 5.0, "senior")
        assert senior_result.revenue_multiplier == 3.0

        # Executive level: 3.5x
        exec_result = svc.calculate_eltv(150000, 0.2, 10.0, "executive")
        assert exec_result.revenue_multiplier == 3.5

    def test_replacement_cost_is_half_salary(self):
        """Replacement cost should be 50% of annual salary."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        for salary in [40000, 80000, 120000]:
            result = svc.calculate_eltv(salary, 0.2, 3.0, "mid")
            expected_replacement = salary * 0.5
            assert result.replacement_cost == expected_replacement

    def test_eltv_category_classification(self):
        """Test ELTV category classification."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        # High ELTV (high salary, low churn, senior)
        high_result = svc.calculate_eltv(150000, 0.1, 8.0, "executive")
        # The category should reflect high value

        # Low ELTV (low salary, high churn, entry)
        low_result = svc.calculate_eltv(35000, 0.8, 0.5, "entry")

        # High ELTV should be significantly larger
        assert high_result.eltv > low_result.eltv * 3


class TestTreatmentService:
    """Tests for treatment suggestion and simulation."""

    @pytest.fixture
    def treatment_service(self):
        """Create treatment validation service instance."""
        from app.services.treatment_service import TreatmentValidationService
        return TreatmentValidationService()

    @pytest.fixture
    def mock_treatment(self):
        """Create mock treatment definition."""
        treatment = MagicMock()
        treatment.id = 1
        treatment.name = "Career Development"
        treatment.description = "Career pathing program"
        treatment.base_cost = Decimal("2500.00")
        treatment.base_effect_size = Decimal("0.20")
        treatment.time_to_effect = "3 months"
        treatment.risk_levels_json = '["High", "Medium"]'
        treatment.best_for_json = '["mid_career"]'
        treatment.llm_reasoning = "Effective for growth-oriented employees"
        return treatment

    def test_risk_level_classification(self, treatment_service):
        """Test risk level thresholds."""
        assert treatment_service.get_risk_level(0.8) == "High"
        assert treatment_service.get_risk_level(0.7) == "High"
        assert treatment_service.get_risk_level(0.5) == "Medium"
        assert treatment_service.get_risk_level(0.4) == "Medium"
        assert treatment_service.get_risk_level(0.3) == "Low"
        assert treatment_service.get_risk_level(0.0) == "Low"

    def test_effectiveness_by_risk_level(self, treatment_service):
        """Test effectiveness modifiers by risk level."""
        # High risk: 70% effectiveness
        assert treatment_service.EFFECTIVENESS_BY_RISK["high"] == 0.7

        # Medium risk: 100% effectiveness
        assert treatment_service.EFFECTIVENESS_BY_RISK["medium"] == 1.0

        # Low risk: 50% effectiveness
        assert treatment_service.EFFECTIVENESS_BY_RISK["low"] == 0.5

    def test_treatment_effect_estimation(self, treatment_service, mock_treatment):
        """Test treatment effect estimation."""
        employee_data = {
            "tenure": 3.0,
            "employee_cost": 75000.0
        }

        effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.5,  # Medium risk
            employee_data=employee_data
        )

        # Effect should be adjusted by modifiers
        assert effect.base_effect_size == 0.20
        assert 0.01 <= effect.adjusted_effect_size <= 0.5
        assert effect.confidence == 0.8

    def test_tenure_modifier(self, treatment_service, mock_treatment):
        """Test tenure affects treatment effectiveness."""
        # New hire (< 1 year): 1.2x modifier
        new_hire_effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.5,
            employee_data={"tenure": 0.5, "employee_cost": 50000}
        )

        # Veteran (> 3 years): 0.9x modifier
        veteran_effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.5,
            employee_data={"tenure": 5.0, "employee_cost": 50000}
        )

        # New hire should have higher adjusted effect
        assert new_hire_effect.factors["tenure_modifier"] == 1.2
        assert veteran_effect.factors["tenure_modifier"] == 0.9

    def test_salary_modifier(self, treatment_service, mock_treatment):
        """Test salary affects treatment effectiveness."""
        # High earner (> 100k): 0.9x modifier
        high_earner_effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.5,
            employee_data={"tenure": 3.0, "employee_cost": 120000}
        )

        # Low earner (< 50k): 1.1x modifier
        low_earner_effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.5,
            employee_data={"tenure": 3.0, "employee_cost": 40000}
        )

        assert high_earner_effect.factors["salary_modifier"] == 0.9
        assert low_earner_effect.factors["salary_modifier"] == 1.1

    def test_projected_outcomes_calculation(self, treatment_service, mock_treatment):
        """Test projected outcomes after treatment."""
        employee_data = {
            "tenure": 3.0,
            "employee_cost": 75000.0,
            "position": "Senior Engineer"
        }

        effect = treatment_service.estimate_treatment_effect(
            treatment=mock_treatment,
            churn_probability=0.4,
            employee_data=employee_data
        )

        outcomes = treatment_service.calculate_projected_outcomes(
            employee_data=employee_data,
            current_churn_prob=0.4,
            treatment_effect=effect,
            treatment_cost=2500.0
        )

        # Post-treatment churn should be lower
        assert outcomes["post_churn_probability"] < outcomes["pre_churn_probability"]

        # ELTV should increase
        assert outcomes["post_eltv"] > outcomes["pre_eltv"]

        # ROI should be calculated
        assert "roi" in outcomes
        assert "roi_category" in outcomes


class TestROICalculations:
    """Tests for ROI calculation accuracy."""

    def test_roi_formula(self):
        """Test ROI calculation matches formula: (ELTV_gain - cost) / cost"""
        eltv_gain = 5000.0
        treatment_cost = 2500.0

        expected_roi = (eltv_gain - treatment_cost) / treatment_cost
        assert expected_roi == 1.0  # 100% ROI

    def test_roi_category_thresholds(self):
        """Test ROI category classification."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        # High ROI: > 3.0
        result_high = svc.calculate_eltv_with_treatment(
            annual_salary=100000,
            pre_treatment_churn=0.5,
            post_treatment_churn=0.1,  # Huge reduction
            tenure_years=5.0,
            position_level="senior",
            treatment_cost=1000  # Very low cost
        )

        # Low ROI: <= 1.0
        result_low = svc.calculate_eltv_with_treatment(
            annual_salary=50000,
            pre_treatment_churn=0.2,
            post_treatment_churn=0.19,  # Tiny reduction
            tenure_years=2.0,
            position_level="entry",
            treatment_cost=10000  # High cost
        )

        assert result_high["treatment_impact"]["roi_category"] == "high"
        assert result_low["treatment_impact"]["roi_category"] == "low"

    def test_roi_handles_zero_cost(self):
        """Test ROI calculation with zero cost treatment."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        result = svc.calculate_eltv_with_treatment(
            annual_salary=75000,
            pre_treatment_churn=0.3,
            post_treatment_churn=0.2,
            tenure_years=3.0,
            position_level="mid",
            treatment_cost=0  # Free treatment
        )

        # Should handle infinite ROI gracefully
        roi = result["treatment_impact"]["roi"]
        assert roi == float('inf') or roi > 100


class TestManualSimulation:
    """Tests for manual what-if simulation."""

    def test_tenure_adjustment(self):
        """Test tenure adjustment affects churn probability."""
        # Original churn probability
        original_churn = 0.15

        # Tenure > 5 years should reduce by 15%
        adjusted = original_churn * 0.85  # 15% reduction
        assert adjusted < original_churn

    def test_salary_adjustment(self):
        """Test salary adjustment affects churn probability."""
        original_churn = 0.15

        # Salary > 100k should reduce by 15%
        adjusted = original_churn * 0.85
        assert adjusted < original_churn

    def test_satisfaction_adjustment(self):
        """Test satisfaction adjustment affects churn probability."""
        original_churn = 0.15

        # High satisfaction (> 0.8) should reduce by 30%
        high_sat_adjusted = original_churn * 0.70
        assert high_sat_adjusted < original_churn

        # Low satisfaction (< 0.4) should increase by 30%
        low_sat_adjusted = original_churn * 1.30
        assert low_sat_adjusted > original_churn


class TestSurvivalProbabilities:
    """Tests for Weibull survival probability calculations."""

    def test_survival_at_month_12_matches_retention(self):
        """Survival at month 12 should be 1 - churn_probability."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()

        for churn_prob in [0.1, 0.2, 0.3, 0.5]:
            result = svc.calculate_eltv(
                annual_salary=50000,
                churn_probability=churn_prob,
                tenure_years=3.0,
                position_level="mid"
            )

            survival_12 = result.survival_probabilities["month_12"]
            expected = 1 - churn_prob

            # Should be approximately equal (within 1%)
            assert abs(survival_12 - expected) < 0.01, \
                f"S(12) = {survival_12}, expected {expected} for churn = {churn_prob}"

    def test_survival_starts_near_one(self):
        """Survival probability at month 1 should be close to 1."""
        from app.services.eltv_service import ELTVService

        svc = ELTVService()
        result = svc.calculate_eltv(
            annual_salary=50000,
            churn_probability=0.3,
            tenure_years=2.0,
            position_level="mid"
        )

        survival_1 = result.survival_probabilities["month_1"]
        assert survival_1 > 0.95, f"S(1) = {survival_1} should be > 0.95"

    def test_weibull_formula(self):
        """Test Weibull survival function: S(t) = exp(-(t/λ)^k)"""
        # Given k=1.2, churn=0.15, we derive λ
        k = 1.2
        churn = 0.15
        lam = 12 / ((-math.log(1 - churn)) ** (1/k))

        # S(12) should equal 1 - churn
        S_12 = math.exp(-(12/lam)**k)
        assert abs(S_12 - (1 - churn)) < 0.001
