"""
Counterfactual Atlas Service

True counterfactual analysis using ML model perturbation.
Instead of heuristic-based estimates, this service directly calls the
ChurnPredictionService with modified features to get real model predictions.
"""

from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.churn_prediction_service import churn_prediction_service
from app.services.eltv_service import eltv_service
from app.schemas.churn import EmployeeChurnFeatures, ChurnPredictionRequest
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput

logger = logging.getLogger(__name__)


# Valid departments for the ML model
VALID_DEPARTMENTS = [
    'sales', 'technical', 'support', 'IT', 'product_mng',
    'marketing', 'RandD', 'accounting', 'hr', 'management'
]

# Valid salary levels
VALID_SALARY_LEVELS = ['low', 'medium', 'high']


@dataclass
class PerturbableFeature:
    """Metadata about a feature that can be modified in counterfactual analysis."""
    name: str
    label: str
    current_value: Any
    type: str  # 'float', 'int', 'bool', 'categorical'
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    options: Optional[List[str]] = None  # For categorical
    description: str = ""
    impact_direction: str = "lower_is_better"  # or 'higher_is_better'


@dataclass
class CounterfactualResult:
    """Result of a counterfactual simulation using real model predictions."""
    scenario_name: str
    scenario_id: str

    # Baseline metrics (from actual model prediction)
    baseline_churn_prob: float
    baseline_risk_level: str
    baseline_eltv: float
    baseline_confidence: float
    baseline_factors: List[Dict[str, Any]]

    # Scenario metrics (from actual model prediction with modifications)
    scenario_churn_prob: float
    scenario_risk_level: str
    scenario_eltv: float
    scenario_confidence: float
    scenario_factors: List[Dict[str, Any]]

    # Delta calculations
    churn_delta: float  # Negative = improvement
    eltv_delta: float   # Positive = improvement

    # ROI metrics
    implied_annual_cost: float
    implied_roi: float

    # Survival projections
    baseline_survival_probs: Dict[str, float] = field(default_factory=dict)
    scenario_survival_probs: Dict[str, float] = field(default_factory=dict)

    # What was modified
    modifications: Dict[str, Any] = field(default_factory=dict)

    # Metadata
    simulated_at: datetime = field(default_factory=datetime.utcnow)
    prediction_method: str = "model"  # 'model' or 'heuristic'


class CounterfactualAtlasService:
    """
    Service for true counterfactual analysis using ML model perturbation.

    Unlike the heuristic-based AtlasScenarioService, this service directly
    calls the trained ML model with modified features to get real predictions.
    """

    # Feature metadata for building the UI
    FEATURE_METADATA = {
        'satisfaction_level': {
            'label': 'Satisfaction Level',
            'type': 'float',
            'min_value': 0.0,
            'max_value': 1.0,
            'step': 0.05,
            'description': 'Employee satisfaction score (0 = very unsatisfied, 1 = very satisfied)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 2000,  # Cost to improve by 0.1
        },
        'last_evaluation': {
            'label': 'Last Evaluation Score',
            'type': 'float',
            'min_value': 0.0,
            'max_value': 1.0,
            'step': 0.05,
            'description': 'Last performance evaluation score (0-1)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 1500,
        },
        'number_project': {
            'label': 'Number of Projects',
            'type': 'int',
            'min_value': 1,
            'max_value': 10,
            'step': 1,
            'description': 'Number of projects assigned',
            'impact_direction': 'neutral',  # Too few or too many can be bad
            'cost_per_point': 0,
        },
        'average_monthly_hours': {
            'label': 'Average Monthly Hours',
            'type': 'float',
            'min_value': 80,
            'max_value': 300,
            'step': 5,
            'description': 'Average monthly working hours',
            'impact_direction': 'lower_is_better',  # Less overwork
            'cost_per_point': 50,  # Cost of reducing 1 hour
        },
        'time_spend_company': {
            'label': 'Years at Company',
            'type': 'int',
            'min_value': 0,
            'max_value': 30,
            'step': 1,
            'description': 'Years spent at the company (tenure)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 0,  # Can't directly change tenure
        },
        'work_accident': {
            'label': 'Work Accident History',
            'type': 'bool',
            'description': 'Whether the employee has had a work accident',
            'impact_direction': 'neutral',
            'cost_per_point': 0,
        },
        'promotion_last_5years': {
            'label': 'Promoted in Last 5 Years',
            'type': 'bool',
            'description': 'Whether the employee was promoted in the last 5 years',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 5000,  # Average promotion cost
        },
        'department': {
            'label': 'Department',
            'type': 'categorical',
            'options': VALID_DEPARTMENTS,
            'description': 'Employee department',
            'impact_direction': 'neutral',
            'cost_per_point': 2000,  # Department transfer cost
        },
        'salary_level': {
            'label': 'Salary Level',
            'type': 'categorical',
            'options': VALID_SALARY_LEVELS,
            'description': 'Salary tier (low < $60k, medium $60k-$100k, high > $100k)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 15000,  # Cost to move up one tier
        },
    }

    def __init__(self):
        self.churn_service = churn_prediction_service
        self.eltv_service = eltv_service

    def _map_structure_to_department(self, structure_name: str) -> str:
        """Map HR structure name to valid ML department."""
        if not structure_name:
            return 'support'

        structure_lower = structure_name.lower()

        # Direct matches
        for dept in VALID_DEPARTMENTS:
            if dept.lower() in structure_lower:
                return dept

        # Common mappings
        mappings = {
            'engineering': 'technical',
            'development': 'technical',
            'tech': 'technical',
            'dev': 'technical',
            'r&d': 'RandD',
            'research': 'RandD',
            'customer': 'support',
            'service': 'support',
            'finance': 'accounting',
            'admin': 'management',
            'operations': 'management',
            'people': 'hr',
            'human': 'hr',
            'product': 'product_mng',
            'pm': 'product_mng',
        }

        for key, dept in mappings.items():
            if key in structure_lower:
                return dept

        return 'support'  # Default

    def _derive_salary_level(self, employee_cost: Optional[float]) -> str:
        """Derive salary level from employee cost."""
        if employee_cost is None:
            return 'medium'

        cost = float(employee_cost)
        if cost < 60000:
            return 'low'
        elif cost < 100000:
            return 'medium'
        else:
            return 'high'

    async def get_employee_ml_features(
        self,
        db: AsyncSession,
        employee_id: str,
        dataset_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get the ML features for an employee that can be perturbed.

        Sources (in order of preference):
        1. ChurnOutput stored features (if available)
        2. HRDataInput.additional_data mapped to ML features
        3. Intelligent defaults with HR-derived values
        """
        # Get the latest HR data for this employee
        query = select(HRDataInput).where(
            HRDataInput.hr_code == employee_id
        )
        if dataset_id:
            query = query.where(HRDataInput.dataset_id == dataset_id)

        query = query.order_by(desc(HRDataInput.report_date))
        result = await db.execute(query)
        employee = result.scalar_one_or_none()

        if not employee:
            raise ValueError(f"Employee {employee_id} not found")

        # Get additional_data if available
        additional_data = employee.additional_data or {}

        # Build ML features from available data
        features = {
            # Try to get from additional_data first, then use defaults
            'satisfaction_level': float(
                additional_data.get('satisfaction_level',
                additional_data.get('satisfaction', 0.6))
            ),
            'last_evaluation': float(
                additional_data.get('last_evaluation',
                additional_data.get('performance_rating_latest',
                additional_data.get('evaluation', 0.7)) / 5.0  # Normalize if 1-5 scale
                if additional_data.get('performance_rating_latest', 0) > 1 else 0.7)
            ),
            'number_project': int(
                additional_data.get('number_project',
                additional_data.get('projects', 3))
            ),
            'average_monthly_hours': float(
                additional_data.get('average_monthly_hours',
                additional_data.get('avg_hours', 160))
            ),
            'time_spend_company': int(float(employee.tenure or 0)),
            'work_accident': bool(
                additional_data.get('work_accident', False)
            ),
            'promotion_last_5years': bool(
                additional_data.get('promotion_last_5years',
                additional_data.get('promotions_24m', 0) > 0)
            ),
            'department': self._map_structure_to_department(employee.structure_name),
            'salary_level': additional_data.get(
                'salary_level',
                self._derive_salary_level(employee.employee_cost)
            ),
        }

        # Validate and clamp values
        features['satisfaction_level'] = max(0.0, min(1.0, features['satisfaction_level']))
        features['last_evaluation'] = max(0.0, min(1.0, features['last_evaluation']))
        features['number_project'] = max(1, min(10, features['number_project']))
        features['average_monthly_hours'] = max(80, min(300, features['average_monthly_hours']))
        features['time_spend_company'] = max(0, min(30, features['time_spend_company']))

        if features['department'] not in VALID_DEPARTMENTS:
            features['department'] = 'support'
        if features['salary_level'] not in VALID_SALARY_LEVELS:
            features['salary_level'] = 'medium'

        return features

    def get_perturbable_features(
        self,
        current_features: Dict[str, Any]
    ) -> List[PerturbableFeature]:
        """
        Build list of perturbable features with metadata for UI.
        """
        result = []

        for name, meta in self.FEATURE_METADATA.items():
            current_value = current_features.get(name)

            feature = PerturbableFeature(
                name=name,
                label=meta['label'],
                current_value=current_value,
                type=meta['type'],
                min_value=meta.get('min_value'),
                max_value=meta.get('max_value'),
                step=meta.get('step'),
                options=meta.get('options'),
                description=meta['description'],
                impact_direction=meta['impact_direction'],
            )
            result.append(feature)

        return result

    def _calculate_modification_cost(
        self,
        modifications: Dict[str, Any],
        base_features: Dict[str, Any]
    ) -> float:
        """Calculate the estimated annual cost of modifications."""
        total_cost = 0.0

        for feature, new_value in modifications.items():
            if feature not in self.FEATURE_METADATA:
                continue

            meta = self.FEATURE_METADATA[feature]
            cost_per_point = meta.get('cost_per_point', 0)
            old_value = base_features.get(feature)

            if cost_per_point == 0:
                continue

            if meta['type'] == 'float':
                # Calculate proportional cost
                delta = abs(float(new_value) - float(old_value or 0))
                if feature == 'satisfaction_level':
                    # Cost per 0.1 improvement
                    total_cost += (delta / 0.1) * cost_per_point
                elif feature == 'average_monthly_hours':
                    # Cost of reducing hours
                    if new_value < old_value:
                        total_cost += (old_value - new_value) * cost_per_point
                else:
                    total_cost += delta * cost_per_point

            elif meta['type'] == 'bool':
                # Cost only if changing from False to True
                if new_value and not old_value:
                    total_cost += cost_per_point

            elif meta['type'] == 'categorical':
                if feature == 'salary_level':
                    # Cost to move up tiers
                    tiers = {'low': 0, 'medium': 1, 'high': 2}
                    old_tier = tiers.get(str(old_value), 1)
                    new_tier = tiers.get(str(new_value), 1)
                    if new_tier > old_tier:
                        total_cost += (new_tier - old_tier) * cost_per_point
                elif feature == 'department':
                    # Cost of department transfer
                    if new_value != old_value:
                        total_cost += cost_per_point

        return total_cost

    def _apply_modifications(
        self,
        base_features: Dict[str, Any],
        modifications: Dict[str, Any]
    ) -> EmployeeChurnFeatures:
        """Apply modifications to base features and create EmployeeChurnFeatures."""
        modified = base_features.copy()

        for key, value in modifications.items():
            if key in modified:
                modified[key] = value

        # Validate and create EmployeeChurnFeatures
        return EmployeeChurnFeatures(
            satisfaction_level=max(0.0, min(1.0, float(modified['satisfaction_level']))),
            last_evaluation=max(0.0, min(1.0, float(modified['last_evaluation']))),
            number_project=max(1, min(10, int(modified['number_project']))),
            average_monthly_hours=max(80, min(300, float(modified['average_monthly_hours']))),
            time_spend_company=max(0, min(30, int(modified['time_spend_company']))),
            work_accident=bool(modified['work_accident']),
            promotion_last_5years=bool(modified['promotion_last_5years']),
            department=str(modified['department']) if modified['department'] in VALID_DEPARTMENTS else 'support',
            salary_level=str(modified['salary_level']) if modified['salary_level'] in VALID_SALARY_LEVELS else 'medium',
        )

    def _get_risk_level(self, probability: float) -> str:
        """Determine risk level from probability."""
        if probability >= 0.7:
            return "High"
        elif probability >= 0.4:
            return "Medium"
        else:
            return "Low"

    async def simulate_counterfactual(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        modifications: Dict[str, Any],
        dataset_id: Optional[str] = None,
        scenario_name: Optional[str] = None,
        scenario_id: Optional[str] = None,
        annual_salary: Optional[float] = None
    ) -> CounterfactualResult:
        """
        Run TRUE counterfactual simulation using ML model perturbation.

        This calls the actual ChurnPredictionService with both baseline
        and modified features to get real model predictions.
        """
        scenario_id = scenario_id or f"counterfactual_{datetime.utcnow().timestamp()}"
        scenario_name = scenario_name or f"Scenario: {', '.join(modifications.keys())}"

        # Create EmployeeChurnFeatures for baseline
        base_churn_features = self._apply_modifications(base_features, {})

        # Create EmployeeChurnFeatures with modifications
        modified_churn_features = self._apply_modifications(base_features, modifications)

        # Get REAL model predictions
        baseline_prediction = await self.churn_service.predict_churn(
            ChurnPredictionRequest(features=base_churn_features),
            dataset_id=dataset_id
        )

        scenario_prediction = await self.churn_service.predict_churn(
            ChurnPredictionRequest(features=modified_churn_features),
            dataset_id=dataset_id
        )

        # Calculate ELTV for both scenarios
        salary = annual_salary or 70000.0  # Default salary for ELTV
        tenure = base_features.get('time_spend_company', 3)

        # Estimate position level for ELTV
        position_level = self.eltv_service.estimate_position_level(
            position="Employee",
            salary=salary,
            tenure=tenure
        )

        baseline_eltv_result = self.eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=baseline_prediction.churn_probability,
            tenure_years=tenure,
            position_level=position_level
        )

        scenario_eltv_result = self.eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=scenario_prediction.churn_probability,
            tenure_years=tenure,
            position_level=position_level
        )

        # Calculate deltas
        churn_delta = scenario_prediction.churn_probability - baseline_prediction.churn_probability
        eltv_delta = scenario_eltv_result.eltv - baseline_eltv_result.eltv

        # Calculate modification cost
        modification_cost = self._calculate_modification_cost(modifications, base_features)

        # Calculate ROI
        if modification_cost > 0:
            implied_roi = ((eltv_delta - modification_cost) / modification_cost) * 100
        else:
            implied_roi = float('inf') if eltv_delta > 0 else 0

        return CounterfactualResult(
            scenario_name=scenario_name,
            scenario_id=scenario_id,
            # Baseline (from actual model)
            baseline_churn_prob=baseline_prediction.churn_probability,
            baseline_risk_level=self._get_risk_level(baseline_prediction.churn_probability),
            baseline_eltv=baseline_eltv_result.eltv,
            baseline_confidence=baseline_prediction.confidence_score,
            baseline_factors=baseline_prediction.contributing_factors,
            # Scenario (from actual model)
            scenario_churn_prob=scenario_prediction.churn_probability,
            scenario_risk_level=self._get_risk_level(scenario_prediction.churn_probability),
            scenario_eltv=scenario_eltv_result.eltv,
            scenario_confidence=scenario_prediction.confidence_score,
            scenario_factors=scenario_prediction.contributing_factors,
            # Deltas
            churn_delta=churn_delta,
            eltv_delta=eltv_delta,
            # ROI
            implied_annual_cost=modification_cost,
            implied_roi=min(999.99, max(-999.99, implied_roi)),
            # Survival
            baseline_survival_probs=baseline_eltv_result.survival_probabilities,
            scenario_survival_probs=scenario_eltv_result.survival_probabilities,
            # Modifications
            modifications=modifications,
            simulated_at=datetime.utcnow(),
            prediction_method="model"
        )

    async def batch_counterfactuals(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
        dataset_id: Optional[str] = None,
        annual_salary: Optional[float] = None
    ) -> List[CounterfactualResult]:
        """
        Run multiple counterfactual scenarios for comparison.

        Each scenario should have:
        - name: Display name
        - modifications: Dict of feature modifications
        """
        results = []

        for idx, scenario in enumerate(scenarios):
            modifications = scenario.get('modifications', {})
            name = scenario.get('name', f"Scenario {idx + 1}")
            scenario_id = scenario.get('id', f"scenario_{idx}")

            result = await self.simulate_counterfactual(
                employee_id=employee_id,
                base_features=base_features,
                modifications=modifications,
                dataset_id=dataset_id,
                scenario_name=name,
                scenario_id=scenario_id,
                annual_salary=annual_salary
            )
            results.append(result)

        return results


# Singleton instance
counterfactual_atlas_service = CounterfactualAtlasService()
