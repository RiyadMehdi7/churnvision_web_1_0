"""
Atlas Scenario Service

Provides what-if scenario analysis by simulating changes to employee features
and calculating the impact on churn probability and ELTV.

This service wraps existing ChurnPredictionService and ELTVService to provide
scenario modeling without requiring new ML models or database changes.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
import logging

from app.services.churn_prediction_service import churn_prediction_service
from app.services.eltv_service import eltv_service
from app.schemas.churn import EmployeeChurnFeatures

logger = logging.getLogger(__name__)


@dataclass
class AtlasScenarioResult:
    """Result of a single scenario simulation"""
    scenario_name: str
    scenario_id: str

    # Baseline metrics (current state)
    baseline_churn_prob: float
    baseline_risk_level: str
    baseline_eltv: float

    # Scenario metrics (after modifications)
    scenario_churn_prob: float
    scenario_risk_level: str
    scenario_eltv: float

    # Delta calculations
    churn_delta: float  # Negative = improvement
    eltv_delta: float   # Positive = improvement

    # ROI metrics
    implied_annual_cost: float  # Cost of the modification
    implied_roi: float          # (ELTV gain - cost) / cost * 100

    # Survival projections
    baseline_survival_probs: Dict[str, float] = field(default_factory=dict)
    scenario_survival_probs: Dict[str, float] = field(default_factory=dict)

    # Modifications applied
    modifications: Dict[str, Any] = field(default_factory=dict)

    # Metadata
    simulated_at: datetime = field(default_factory=datetime.utcnow)


class AtlasScenarioService:
    """
    Service for running what-if scenarios on employee data.

    Uses existing prediction and ELTV services to simulate the impact
    of feature changes without persisting any data.
    """

    # Default modification costs (annual) - based on actual HRDataInput fields
    MODIFICATION_COSTS = {
        # Core fields from HRDataInput
        'employee_cost': lambda old, new: max(0, new - old),  # Salary increase
        'tenure': 0,  # Tenure has no direct cost (simulation only)
        'position': 5000,  # Position change/promotion cost

        # Common additional_data fields (if available in uploaded data)
        'performance_rating_latest': 1500,  # Performance improvement program
        'engagement_score': 2000,  # Engagement initiatives
        'overtime_hours_90d': lambda old, new: 500 if new < old else 0,  # Overtime reduction
        'hike_months_since': 0,  # Just tracking - no direct cost
        'promo_months_since': 0,  # Just tracking
        'promotions_24m': 5000,  # Promotion cost
        'manager_feedback_freq_90d': 500,  # 1:1 meeting program cost
    }

    # Feature impact heuristics (when ML model not available)
    # Based on actual fields from HRDataInput and common additional_data
    FEATURE_IMPACTS = {
        # Core fields
        'employee_cost': -0.0001,  # Higher salary = lower churn (per $ increase)
        'tenure': -0.03,           # Longer tenure = lower churn (per year)

        # Common additional_data fields
        'performance_rating_latest': -0.08,  # Better rating = lower churn (per point, 1-5 scale)
        'engagement_score': -0.005,  # Higher engagement = lower churn (per point, 0-100 scale)
        'overtime_hours_90d': 0.002,  # More overtime = higher churn (per hour)
        'hike_months_since': 0.003,   # Longer since raise = higher churn (per month)
        'promo_months_since': 0.002,  # Longer since promotion = higher churn (per month)
        'promotions_24m': -0.10,      # More promotions = lower churn
        'manager_feedback_freq_90d': -0.05,  # More 1:1s = lower churn
        'absences_90d': 0.02,         # More absences = higher churn
        'after_hours_ratio_90d': 0.15,  # After-hours work = burnout risk
    }

    def __init__(self):
        self.churn_service = churn_prediction_service
        self.eltv_service = eltv_service

    def _calculate_modification_cost(
        self,
        feature: str,
        old_value: Any,
        new_value: Any
    ) -> float:
        """Calculate the annual cost of a feature modification."""
        cost_fn = self.MODIFICATION_COSTS.get(feature, 0)

        if callable(cost_fn):
            return cost_fn(old_value, new_value)
        return cost_fn

    def _estimate_churn_change(
        self,
        base_prob: float,
        modifications: Dict[str, Any],
        base_features: Dict[str, Any]
    ) -> float:
        """
        Estimate churn probability change using heuristics.

        This is used when ML model can't accept arbitrary features
        or as a fallback/approximation.
        """
        adjusted_prob = base_prob

        for feature, new_value in modifications.items():
            if feature not in self.FEATURE_IMPACTS:
                continue

            old_value = base_features.get(feature, 0)
            if old_value is None:
                old_value = 0

            impact = self.FEATURE_IMPACTS[feature]

            # Calculate proportional change based on feature type
            if feature == 'employee_cost' and old_value > 0:
                # Percentage salary increase impact
                pct_change = (new_value - old_value) / old_value
                adjusted_prob += impact * pct_change * 100
            elif feature == 'tenure':
                # Years change
                adjusted_prob += impact * (new_value - old_value)
            elif feature == 'performance_rating_latest':
                # Performance rating (1-5 scale typically)
                adjusted_prob += impact * (new_value - old_value)
            elif feature == 'engagement_score':
                # Engagement score (0-100 scale)
                adjusted_prob += impact * (new_value - old_value)
            elif feature in ('overtime_hours_90d', 'absences_90d', 'hike_months_since', 'promo_months_since'):
                # Numeric features - direct impact per unit
                diff = new_value - old_value
                adjusted_prob += impact * diff
            elif feature == 'promotions_24m':
                # Promotions count - significant impact per promotion
                diff = new_value - old_value
                adjusted_prob += impact * diff
            elif feature == 'manager_feedback_freq_90d':
                # 1:1 frequency - impact per additional meeting
                diff = new_value - old_value
                adjusted_prob += impact * diff
            elif feature == 'after_hours_ratio_90d':
                # After-hours ratio (0-1 scale)
                adjusted_prob += impact * (new_value - old_value)
            else:
                # Default: proportional impact
                diff = new_value - old_value
                adjusted_prob += impact * diff

        # Clamp to valid probability range
        return max(0.01, min(0.99, adjusted_prob))

    def _get_risk_level(self, probability: float) -> str:
        """Determine risk level from probability."""
        if probability >= 0.7:
            return "High"
        elif probability >= 0.4:
            return "Medium"
        else:
            return "Low"

    async def simulate_scenario(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        base_churn_prob: float,
        modifications: Dict[str, Any],
        scenario_name: Optional[str] = None,
        scenario_id: Optional[str] = None
    ) -> AtlasScenarioResult:
        """
        Simulate a what-if scenario for an employee.

        Args:
            employee_id: Employee HR code
            base_features: Current employee features
            base_churn_prob: Current churn probability
            modifications: Dict of feature modifications {feature: new_value}
            scenario_name: Optional name for the scenario
            scenario_id: Optional unique ID for the scenario

        Returns:
            AtlasScenarioResult with baseline vs scenario comparison
        """
        # Generate scenario identifiers
        scenario_id = scenario_id or f"scenario_{datetime.utcnow().timestamp()}"
        scenario_name = scenario_name or f"Scenario: {', '.join(modifications.keys())}"

        # Calculate modification costs
        total_cost = 0
        for feature, new_value in modifications.items():
            old_value = base_features.get(feature, 0)
            total_cost += self._calculate_modification_cost(feature, old_value, new_value)

        # Estimate new churn probability
        # Using heuristics since we may not have all features needed for ML model
        scenario_churn_prob = self._estimate_churn_change(
            base_churn_prob,
            modifications,
            base_features
        )

        # Get salary and tenure for ELTV calculations
        base_salary = base_features.get('employee_cost', 50000)
        base_tenure = base_features.get('tenure', 0)

        # Apply salary modification if present
        scenario_salary = modifications.get('employee_cost', base_salary)
        scenario_tenure = modifications.get('tenure', base_tenure)

        # Estimate position level
        position = base_features.get('position', 'Unknown')
        position_level = self.eltv_service.estimate_position_level(
            position=position,
            salary=base_salary,
            tenure=base_tenure
        )

        # Calculate baseline ELTV
        baseline_eltv_result = self.eltv_service.calculate_eltv(
            annual_salary=base_salary,
            churn_probability=base_churn_prob,
            tenure_years=base_tenure,
            position_level=position_level
        )

        # Calculate scenario ELTV
        scenario_position_level = self.eltv_service.estimate_position_level(
            position=position,
            salary=scenario_salary,
            tenure=scenario_tenure
        )

        scenario_eltv_result = self.eltv_service.calculate_eltv(
            annual_salary=scenario_salary,
            churn_probability=scenario_churn_prob,
            tenure_years=scenario_tenure,
            position_level=scenario_position_level
        )

        # Calculate deltas
        churn_delta = scenario_churn_prob - base_churn_prob
        eltv_delta = scenario_eltv_result.eltv - baseline_eltv_result.eltv

        # Calculate ROI
        if total_cost > 0:
            implied_roi = ((eltv_delta - total_cost) / total_cost) * 100
        else:
            implied_roi = float('inf') if eltv_delta > 0 else 0

        return AtlasScenarioResult(
            scenario_name=scenario_name,
            scenario_id=scenario_id,
            baseline_churn_prob=base_churn_prob,
            baseline_risk_level=self._get_risk_level(base_churn_prob),
            baseline_eltv=baseline_eltv_result.eltv,
            scenario_churn_prob=scenario_churn_prob,
            scenario_risk_level=self._get_risk_level(scenario_churn_prob),
            scenario_eltv=scenario_eltv_result.eltv,
            churn_delta=churn_delta,
            eltv_delta=eltv_delta,
            implied_annual_cost=total_cost,
            implied_roi=min(999.99, max(-999.99, implied_roi)),  # Clamp extreme values
            baseline_survival_probs=baseline_eltv_result.survival_probabilities,
            scenario_survival_probs=scenario_eltv_result.survival_probabilities,
            modifications=modifications,
            simulated_at=datetime.utcnow()
        )

    async def batch_scenarios(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        base_churn_prob: float,
        scenarios: List[Dict[str, Any]]
    ) -> List[AtlasScenarioResult]:
        """
        Run multiple scenarios for comparison.

        Args:
            employee_id: Employee HR code
            base_features: Current employee features
            base_churn_prob: Current churn probability
            scenarios: List of scenario definitions, each with:
                - modifications: Dict of feature modifications
                - name: Optional scenario name
                - id: Optional scenario ID

        Returns:
            List of AtlasScenarioResult for each scenario
        """
        results = []

        for idx, scenario in enumerate(scenarios):
            modifications = scenario.get('modifications', {})
            name = scenario.get('name', f"Scenario {idx + 1}")
            scenario_id = scenario.get('id', f"scenario_{idx}")

            result = await self.simulate_scenario(
                employee_id=employee_id,
                base_features=base_features,
                base_churn_prob=base_churn_prob,
                modifications=modifications,
                scenario_name=name,
                scenario_id=scenario_id
            )
            results.append(result)

        return results

    def get_available_modifications(self, employee_features: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Return list of available feature modifications with metadata.

        Core modifications are always available. Additional modifications
        are shown if the employee has those fields in their data.
        """
        # Core modifications (always available based on HRDataInput)
        core_modifications = [
            {
                "feature": "employee_cost",
                "label": "Salary Adjustment",
                "type": "currency",
                "description": "Annual salary/cost adjustment",
                "impact": "Higher salary typically reduces churn risk",
                "cost_type": "direct",
                "recommended_range": [0.05, 0.20],  # 5-20% increase
                "is_core": True
            },
            {
                "feature": "tenure",
                "label": "Tenure Simulation",
                "type": "number",
                "min": 0,
                "max": 30,
                "step": 0.5,
                "description": "Simulate tenure change (years)",
                "impact": "Longer tenure generally means lower churn",
                "cost_type": "none",
                "is_core": True
            },
        ]

        # Optional modifications (shown if employee has these fields in additional_data)
        optional_modifications = [
            {
                "feature": "performance_rating_latest",
                "label": "Performance Rating",
                "type": "slider",
                "min": 1,
                "max": 5,
                "step": 0.5,
                "description": "Target performance rating (1-5 scale)",
                "impact": "Higher ratings correlate with retention",
                "cost_type": "initiative",
                "estimated_cost": 1500,
                "is_core": False
            },
            {
                "feature": "engagement_score",
                "label": "Engagement Score",
                "type": "slider",
                "min": 0,
                "max": 100,
                "step": 5,
                "description": "Target engagement score (0-100)",
                "impact": "Higher engagement strongly reduces churn",
                "cost_type": "initiative",
                "estimated_cost": 2000,
                "is_core": False
            },
            {
                "feature": "overtime_hours_90d",
                "label": "Overtime Hours (90d)",
                "type": "number",
                "min": 0,
                "max": 200,
                "step": 5,
                "description": "Overtime hours in last 90 days",
                "impact": "Reducing overtime reduces burnout/churn",
                "cost_type": "indirect",
                "estimated_cost": 500,
                "is_core": False
            },
            {
                "feature": "promotions_24m",
                "label": "Promotions (24 months)",
                "type": "number",
                "min": 0,
                "max": 3,
                "step": 1,
                "description": "Number of promotions in 24 months",
                "impact": "Promotions significantly reduce churn",
                "cost_type": "fixed",
                "estimated_cost": 5000,
                "is_core": False
            },
            {
                "feature": "manager_feedback_freq_90d",
                "label": "1:1 Meetings (90d)",
                "type": "number",
                "min": 0,
                "max": 12,
                "step": 1,
                "description": "Manager 1:1 meetings in last 90 days",
                "impact": "More feedback improves retention",
                "cost_type": "per_meeting",
                "estimated_cost": 500,
                "is_core": False
            },
            {
                "feature": "hike_months_since",
                "label": "Months Since Raise",
                "type": "number",
                "min": 0,
                "max": 36,
                "step": 1,
                "description": "Months since last salary increase",
                "impact": "Longer without raise increases risk",
                "cost_type": "none",
                "is_core": False
            },
        ]

        # Filter optional modifications based on available employee data
        available_modifications = core_modifications.copy()

        if employee_features:
            additional_data = employee_features.get('additional_data', {}) or {}
            for mod in optional_modifications:
                if mod["feature"] in additional_data:
                    available_modifications.append(mod)
        else:
            # If no employee selected, show all optional modifications
            # (they'll be grayed out in the UI)
            available_modifications.extend(optional_modifications)

        return available_modifications


# Singleton instance
atlas_scenario_service = AtlasScenarioService()
