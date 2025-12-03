"""
Treatment Validation and Analysis Service

This service handles:
- Treatment feasibility validation
- Treatment effect estimation
- ROI calculation for treatment interventions
- A/B testing support for treatment effectiveness measurement
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, date
import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.treatment import TreatmentDefinition, TreatmentApplication
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput
from app.services.eltv_service import ELTVService, eltv_service


@dataclass
class TreatmentFeasibility:
    """Result of treatment feasibility analysis"""
    is_feasible: bool
    feasibility_score: float  # 0-1
    constraints_met: Dict[str, bool]
    warnings: List[str]
    blocking_reasons: List[str]


@dataclass
class TreatmentEffect:
    """Estimated effect of a treatment"""
    base_effect_size: float
    adjusted_effect_size: float
    confidence: float
    factors: Dict[str, float]


@dataclass
class TreatmentSuggestionResult:
    """A treatment suggestion with full analysis"""
    treatment_id: int
    name: str
    description: Optional[str]
    cost: float
    effect_size: float
    time_to_effect: str
    projected_churn_change: float
    projected_post_eltv: float
    projected_roi: str
    risk_levels: List[str]
    explanation: List[Dict[str, Any]]
    feasibility: TreatmentFeasibility
    priority_score: float


class TreatmentValidationService:
    """
    Service for validating and analyzing treatment interventions.

    This service determines whether a treatment is appropriate for an employee
    based on their profile, risk level, and organizational constraints.
    """

    # Risk level mappings
    RISK_THRESHOLDS = {
        'high': 0.7,
        'medium': 0.4,
        'low': 0.0
    }

    # Treatment effectiveness by risk level
    EFFECTIVENESS_BY_RISK = {
        'high': 0.7,    # High risk employees respond less to treatment
        'medium': 1.0,  # Medium risk employees respond normally
        'low': 0.5      # Low risk employees have less room for improvement
    }

    def __init__(self, eltv_svc: Optional[ELTVService] = None):
        self.eltv_service = eltv_svc or eltv_service

    def get_risk_level(self, churn_probability: float) -> str:
        """Determine risk level from churn probability"""
        if churn_probability >= self.RISK_THRESHOLDS['high']:
            return 'High'
        elif churn_probability >= self.RISK_THRESHOLDS['medium']:
            return 'Medium'
        else:
            return 'Low'

    def validate_treatment_feasibility(
        self,
        treatment: TreatmentDefinition,
        employee_data: Dict[str, Any],
        churn_probability: float,
        organizational_constraints: Optional[Dict] = None
    ) -> TreatmentFeasibility:
        """
        Validate whether a treatment is feasible for a given employee.

        Checks:
        - Risk level alignment
        - Budget constraints
        - Timing constraints
        - Employee eligibility
        """
        constraints_met = {}
        warnings = []
        blocking_reasons = []

        # Parse treatment metadata
        risk_levels = []
        if treatment.risk_levels_json:
            try:
                risk_levels = json.loads(treatment.risk_levels_json)
            except (json.JSONDecodeError, TypeError):
                risk_levels = []

        best_for = []
        if treatment.best_for_json:
            try:
                best_for = json.loads(treatment.best_for_json)
            except (json.JSONDecodeError, TypeError):
                best_for = []

        # Check 1: Risk level alignment
        employee_risk = self.get_risk_level(churn_probability)
        if risk_levels:
            risk_aligned = employee_risk in risk_levels
            constraints_met['risk_alignment'] = risk_aligned
            if not risk_aligned:
                warnings.append(
                    f"Treatment is designed for {', '.join(risk_levels)} risk employees, "
                    f"but this employee is {employee_risk} risk."
                )
        else:
            constraints_met['risk_alignment'] = True

        # Check 2: Budget constraint
        treatment_cost = float(treatment.base_cost) if treatment.base_cost else 0
        employee_salary = employee_data.get('employee_cost', 0) or 0
        max_budget_ratio = organizational_constraints.get('max_treatment_budget_ratio', 0.20) if organizational_constraints else 0.20

        if employee_salary > 0:
            cost_ratio = treatment_cost / employee_salary
            constraints_met['budget'] = cost_ratio <= max_budget_ratio
            if not constraints_met['budget']:
                warnings.append(
                    f"Treatment cost ({cost_ratio:.1%} of salary) exceeds budget limit ({max_budget_ratio:.1%})."
                )
        else:
            constraints_met['budget'] = True

        # Check 3: Tenure constraint (some treatments work better with tenure)
        tenure = employee_data.get('tenure', 0) or 0
        constraints_met['tenure'] = True
        if 'new_hire' in best_for and tenure > 1:
            warnings.append("Treatment is best for new hires but employee has >1 year tenure.")
        elif 'veteran' in best_for and tenure < 3:
            warnings.append("Treatment is best for veteran employees but employee has <3 years tenure.")

        # Check 4: Previous treatment history
        # (Would check DB for recent applications - placeholder)
        constraints_met['no_recent_treatment'] = True

        # Calculate overall feasibility
        blocking_constraints = ['budget']  # Which constraints block the treatment
        is_feasible = all(
            constraints_met.get(c, True)
            for c in blocking_constraints
        )

        # Calculate feasibility score
        met_count = sum(1 for v in constraints_met.values() if v)
        feasibility_score = met_count / len(constraints_met) if constraints_met else 1.0

        return TreatmentFeasibility(
            is_feasible=is_feasible,
            feasibility_score=feasibility_score,
            constraints_met=constraints_met,
            warnings=warnings,
            blocking_reasons=blocking_reasons
        )

    def estimate_treatment_effect(
        self,
        treatment: TreatmentDefinition,
        churn_probability: float,
        employee_data: Dict[str, Any]
    ) -> TreatmentEffect:
        """
        Estimate the effect of a treatment on churn probability.

        The effect is modulated by:
        - Base effect size of the treatment
        - Current risk level (medium risk sees best response)
        - Employee characteristics
        - Treatment targeting
        """
        base_effect = float(treatment.base_effect_size) if treatment.base_effect_size else 0.05

        # Get effectiveness modifier based on risk level
        risk_level = self.get_risk_level(churn_probability).lower()
        risk_modifier = self.EFFECTIVENESS_BY_RISK.get(risk_level, 1.0)

        # Calculate adjusted effect
        factors = {
            'base_effect': base_effect,
            'risk_modifier': risk_modifier,
        }

        # Tenure modifier (newer employees might respond better)
        tenure = employee_data.get('tenure', 0) or 0
        if tenure < 1:
            tenure_modifier = 1.2  # New employees respond well
        elif tenure < 3:
            tenure_modifier = 1.0  # Normal response
        else:
            tenure_modifier = 0.9  # Slight decrease for long-tenured

        factors['tenure_modifier'] = tenure_modifier

        # Salary modifier (higher salary = more leverage)
        salary = employee_data.get('employee_cost', 0) or 0
        if salary > 100000:
            salary_modifier = 0.9  # Harder to retain high earners
        elif salary < 50000:
            salary_modifier = 1.1  # More impact on lower earners
        else:
            salary_modifier = 1.0

        factors['salary_modifier'] = salary_modifier

        # Calculate final adjusted effect
        adjusted_effect = base_effect * risk_modifier * tenure_modifier * salary_modifier

        # Ensure effect is reasonable
        adjusted_effect = min(0.5, max(0.01, adjusted_effect))

        # Calculate confidence based on how well-targeted this treatment is
        confidence = 0.8  # Base confidence

        return TreatmentEffect(
            base_effect_size=base_effect,
            adjusted_effect_size=adjusted_effect,
            confidence=confidence,
            factors=factors
        )

    def calculate_projected_outcomes(
        self,
        employee_data: Dict[str, Any],
        current_churn_prob: float,
        treatment_effect: TreatmentEffect,
        treatment_cost: float
    ) -> Dict[str, Any]:
        """
        Calculate projected outcomes after treatment application.
        """
        # Calculate new churn probability
        effect = treatment_effect.adjusted_effect_size
        new_churn_prob = max(0.01, current_churn_prob * (1 - effect))
        churn_reduction = current_churn_prob - new_churn_prob

        # Get employee salary for ELTV calculation
        salary = employee_data.get('employee_cost', 50000) or 50000
        tenure = employee_data.get('tenure', 0) or 0
        position = employee_data.get('position')

        # Calculate ELTV with treatment
        eltv_result = self.eltv_service.calculate_eltv_with_treatment(
            annual_salary=float(salary),
            pre_treatment_churn=current_churn_prob,
            post_treatment_churn=new_churn_prob,
            tenure_years=float(tenure),
            position_level=self.eltv_service.estimate_position_level(position, float(salary), float(tenure)),
            treatment_cost=treatment_cost
        )

        return {
            'pre_churn_probability': current_churn_prob,
            'post_churn_probability': new_churn_prob,
            'churn_reduction': churn_reduction,
            'pre_eltv': eltv_result['pre_treatment']['eltv'],
            'post_eltv': eltv_result['post_treatment']['eltv'],
            'eltv_gain': eltv_result['treatment_impact']['eltv_gain'],
            'net_gain': eltv_result['treatment_impact']['net_gain'],
            'roi': eltv_result['treatment_impact']['roi'],
            'roi_category': eltv_result['treatment_impact']['roi_category'],
            'survival_probabilities': eltv_result['post_treatment']['survival_probabilities'],
            'expected_tenure_months': eltv_result['post_treatment']['expected_tenure_months']
        }

    async def generate_treatment_suggestions(
        self,
        db: AsyncSession,
        employee_hr_code: str,
        employee_data: Dict[str, Any],
        churn_probability: float,
        max_suggestions: int = 5
    ) -> List[TreatmentSuggestionResult]:
        """
        Generate ranked treatment suggestions for an employee.
        """
        # Get all active treatments
        query = select(TreatmentDefinition).where(TreatmentDefinition.is_active == 1)
        result = await db.execute(query)
        treatments = result.scalars().all()

        suggestions = []

        for treatment in treatments:
            # Validate feasibility
            feasibility = self.validate_treatment_feasibility(
                treatment=treatment,
                employee_data=employee_data,
                churn_probability=churn_probability
            )

            # Estimate effect
            effect = self.estimate_treatment_effect(
                treatment=treatment,
                churn_probability=churn_probability,
                employee_data=employee_data
            )

            # Calculate projected outcomes
            treatment_cost = float(treatment.base_cost) if treatment.base_cost else 0
            outcomes = self.calculate_projected_outcomes(
                employee_data=employee_data,
                current_churn_prob=churn_probability,
                treatment_effect=effect,
                treatment_cost=treatment_cost
            )

            # Parse risk levels
            risk_levels = []
            if treatment.risk_levels_json:
                try:
                    risk_levels = json.loads(treatment.risk_levels_json)
                except (json.JSONDecodeError, TypeError):
                    risk_levels = []

            # Create explanation
            explanation = [{
                'ruleId': 'default',
                'reason': f"This treatment targets {effect.base_effect_size*100:.0f}% churn reduction "
                          f"with {effect.confidence*100:.0f}% confidence."
            }]

            # Add LLM reasoning if available
            if treatment.llm_reasoning:
                explanation.insert(0, {
                    'ruleId': 'llm',
                    'reason': treatment.llm_reasoning
                })

            # Calculate priority score
            priority_score = self._calculate_priority_score(
                feasibility=feasibility,
                effect=effect,
                outcomes=outcomes
            )

            suggestion = TreatmentSuggestionResult(
                treatment_id=treatment.id,
                name=treatment.name,
                description=treatment.description,
                cost=treatment_cost,
                effect_size=effect.adjusted_effect_size,
                time_to_effect=treatment.time_to_effect or "3 months",
                projected_churn_change=-outcomes['churn_reduction'],  # Negative because it's a reduction
                projected_post_eltv=outcomes['post_eltv'],
                projected_roi=outcomes['roi_category'],
                risk_levels=risk_levels or ['High', 'Medium'],
                explanation=explanation,
                feasibility=feasibility,
                priority_score=priority_score
            )

            suggestions.append(suggestion)

        # Sort by priority score (highest first) and filter feasible
        suggestions.sort(key=lambda x: (x.feasibility.is_feasible, x.priority_score), reverse=True)

        return suggestions[:max_suggestions]

    def _calculate_priority_score(
        self,
        feasibility: TreatmentFeasibility,
        effect: TreatmentEffect,
        outcomes: Dict[str, Any]
    ) -> float:
        """
        Calculate a priority score for ranking treatments.

        Higher score = better treatment option.
        """
        score = 0.0

        # Feasibility component (0-30 points)
        score += feasibility.feasibility_score * 30

        # Effect size component (0-25 points)
        effect_score = min(effect.adjusted_effect_size / 0.3, 1.0) * 25
        score += effect_score

        # ROI component (0-25 points)
        roi = outcomes.get('roi', 0)
        if isinstance(roi, (int, float)) and roi != float('inf'):
            roi_score = min(roi / 5.0, 1.0) * 25
        else:
            roi_score = 25  # Perfect ROI for infinite or very high
        score += roi_score

        # ELTV gain component (0-20 points)
        eltv_gain = outcomes.get('eltv_gain', 0)
        eltv_score = min(eltv_gain / 50000, 1.0) * 20
        score += eltv_score

        return score

    async def apply_treatment_simulation(
        self,
        db: AsyncSession,
        employee_hr_code: str,
        treatment_id: int
    ) -> Dict[str, Any]:
        """
        Simulate applying a treatment to an employee.

        This does not persist the application - use record_treatment_application
        for that.
        """
        # Get employee data
        query = select(HRDataInput).where(
            HRDataInput.hr_code == employee_hr_code
        ).order_by(desc(HRDataInput.report_date)).limit(1)
        result = await db.execute(query)
        employee = result.scalar_one_or_none()

        if not employee:
            raise ValueError(f"Employee {employee_hr_code} not found")

        # Get treatment
        query = select(TreatmentDefinition).where(TreatmentDefinition.id == treatment_id)
        result = await db.execute(query)
        treatment = result.scalar_one_or_none()

        if not treatment:
            raise ValueError(f"Treatment {treatment_id} not found")

        # Get churn probability
        query = select(ChurnOutput).where(
            ChurnOutput.hr_code == employee_hr_code
        ).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await db.execute(query)
        churn_data = result.scalar_one_or_none()

        current_churn = float(churn_data.resign_proba) if churn_data else 0.5

        # Build employee data dict
        employee_data = {
            'hr_code': employee.hr_code,
            'full_name': employee.full_name,
            'structure_name': employee.structure_name,
            'position': employee.position,
            'status': employee.status,
            'tenure': float(employee.tenure) if employee.tenure else 0,
            'employee_cost': float(employee.employee_cost) if employee.employee_cost else 50000,
        }

        # Calculate treatment effect
        effect = self.estimate_treatment_effect(
            treatment=treatment,
            churn_probability=current_churn,
            employee_data=employee_data
        )

        # Calculate outcomes
        treatment_cost = float(treatment.base_cost) if treatment.base_cost else 0
        outcomes = self.calculate_projected_outcomes(
            employee_data=employee_data,
            current_churn_prob=current_churn,
            treatment_effect=effect,
            treatment_cost=treatment_cost
        )

        return {
            'employee_id': employee_hr_code,
            'treatment_id': treatment_id,
            'treatment_name': treatment.name,
            'treatment_cost': treatment_cost,
            'effect_size': effect.adjusted_effect_size,
            'pre_churn_probability': outcomes['pre_churn_probability'],
            'post_churn_probability': outcomes['post_churn_probability'],
            'eltv_pre_treatment': outcomes['pre_eltv'],
            'eltv_post_treatment': outcomes['post_eltv'],
            'treatment_effect_eltv': outcomes['eltv_gain'],
            'roi': outcomes['roi'],
            'new_survival_probabilities': outcomes['survival_probabilities'],
            'applied_treatment': {
                'id': treatment.id,
                'name': treatment.name,
                'cost': treatment_cost,
                'effectSize': effect.adjusted_effect_size
            }
        }

    async def record_treatment_application(
        self,
        db: AsyncSession,
        employee_hr_code: str,
        treatment_id: int,
        simulation_results: Dict[str, Any],
        is_simulation: bool = False,
        applied_by: str = 'system',
        notes: Optional[str] = None
    ) -> TreatmentApplication:
        """
        Record a treatment application in the database.
        """
        application = TreatmentApplication(
            hr_code=employee_hr_code,
            treatment_id=treatment_id,
            treatment_name=simulation_results['treatment_name'],
            treatment_type='standard',
            cost=simulation_results['treatment_cost'],
            predicted_churn_reduction=simulation_results['pre_churn_probability'] - simulation_results['post_churn_probability'],
            predicted_cost=simulation_results['treatment_cost'],
            predicted_roi=simulation_results['roi'] if isinstance(simulation_results['roi'], (int, float)) else 0,
            pre_churn_probability=simulation_results['pre_churn_probability'],
            post_churn_probability=simulation_results['post_churn_probability'],
            pre_eltv=simulation_results['eltv_pre_treatment'],
            post_eltv=simulation_results['eltv_post_treatment'],
            roi=simulation_results['roi'] if isinstance(simulation_results['roi'], (int, float)) else 0,
            is_simulation=is_simulation,
            applied_by=applied_by,
            notes=notes
        )

        db.add(application)
        await db.commit()
        await db.refresh(application)

        return application


# Singleton instance
treatment_validation_service = TreatmentValidationService()
