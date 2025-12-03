"""
ELTV (Employee Lifetime Value) Service

This service provides sophisticated ELTV calculations using Weibull survival curves.
The Weibull distribution models the probability of employee retention over time,
accounting for the "hazard" of churn that may increase or decrease with tenure.

Key Formulas:
- Survival Function: S(t) = exp(-(λt)^k)
  where λ (scale) controls the rate of decline
  and k (shape) determines how the hazard changes over time

- ELTV = Σ[Revenue(t) × S(t) × DiscountFactor(t)] - ReplacementCost × (1 - S(horizon))

References:
- Weibull distribution for employee retention modeling
- DCF (Discounted Cash Flow) methodology for value calculation
"""

from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
from functools import lru_cache
import math


@dataclass
class SurvivalCurveParams:
    """Parameters for Weibull survival curve calculation"""
    scale: float  # λ (lambda) - scale parameter
    shape: float  # k - shape parameter

    @classmethod
    def from_churn_probability(cls, annual_churn_prob: float, tenure_years: float = 0) -> 'SurvivalCurveParams':
        """
        Derive Weibull parameters from annual churn probability.

        The shape parameter (k) models how churn risk changes over time:
        - k < 1: Decreasing hazard (early tenure has higher churn)
        - k = 1: Constant hazard (exponential distribution)
        - k > 1: Increasing hazard (churn risk increases with tenure)

        We use k=1.2 as a baseline which reflects slightly increasing
        churn risk as employees gain market experience.
        """
        # Clamp churn probability to valid range
        churn_prob = max(0.01, min(0.99, annual_churn_prob))

        # Shape parameter - slight increase in hazard over time
        # Modified based on tenure to account for different risk profiles
        if tenure_years < 1:
            k = 0.8  # New employees have decreasing hazard after initial period
        elif tenure_years < 3:
            k = 1.0  # Mid-tenure employees have constant hazard
        else:
            k = 1.2  # Longer-tenure employees may have increasing hazard

        # Derive scale parameter from annual churn probability
        # S(1) = exp(-(λ×1)^k) = 1 - churn_prob
        # Solving for λ: λ = (-ln(1 - churn_prob))^(1/k)
        survival_1yr = 1.0 - churn_prob
        scale = (-math.log(survival_1yr)) ** (1.0 / k)

        return cls(scale=scale, shape=k)


@dataclass
class ELTVResult:
    """Result of ELTV calculation"""
    eltv: float
    survival_probabilities: Dict[str, float]
    expected_tenure_months: float
    replacement_cost: float
    revenue_multiplier: float
    discount_rate: float
    horizon_months: int

    def to_dict(self) -> Dict:
        return {
            "eltv": self.eltv,
            "survival_probabilities": self.survival_probabilities,
            "expected_tenure_months": self.expected_tenure_months,
            "replacement_cost": self.replacement_cost,
            "revenue_multiplier": self.revenue_multiplier,
            "discount_rate": self.discount_rate,
            "horizon_months": self.horizon_months
        }


class ELTVService:
    """
    Service for calculating Employee Lifetime Value using Weibull survival curves.

    The ELTV represents the present value of an employee's expected future
    contribution, accounting for their probability of staying and the
    time value of money.
    """

    # Default configuration
    DEFAULT_HORIZON_MONTHS = 24
    DEFAULT_DISCOUNT_RATE = 0.08  # 8% annual discount rate
    DEFAULT_REPLACEMENT_COST_RATIO = 0.5  # 50% of annual salary

    # Revenue multipliers based on position level/percentile
    REVENUE_MULTIPLIERS = {
        'entry': 2.0,
        'mid': 2.5,
        'senior': 3.0,
        'executive': 3.5
    }

    def __init__(
        self,
        horizon_months: int = DEFAULT_HORIZON_MONTHS,
        annual_discount_rate: float = DEFAULT_DISCOUNT_RATE,
        replacement_cost_ratio: float = DEFAULT_REPLACEMENT_COST_RATIO
    ):
        self.horizon_months = horizon_months
        self.annual_discount_rate = annual_discount_rate
        self.monthly_discount_rate = (1 + annual_discount_rate) ** (1/12) - 1
        self.replacement_cost_ratio = replacement_cost_ratio

        # LRU cache for performance
        self._survival_cache: Dict[Tuple[float, float, int], float] = {}

    def calculate_survival_probability(
        self,
        params: SurvivalCurveParams,
        months: int
    ) -> float:
        """
        Calculate survival probability at a given time using Weibull distribution.

        S(t) = exp(-(λt)^k)

        Args:
            params: Weibull distribution parameters
            months: Time in months

        Returns:
            Probability of employee still being with company at time t
        """
        if months <= 0:
            return 1.0

        # Convert months to years for the calculation
        t = months / 12.0

        # Weibull survival function: S(t) = exp(-(λt)^k)
        exponent = -((params.scale * t) ** params.shape)
        survival_prob = math.exp(exponent)

        # Clamp to valid probability range
        return max(0.0, min(1.0, survival_prob))

    def generate_survival_curve(
        self,
        churn_probability: float,
        tenure_years: float = 0,
        horizon_months: Optional[int] = None
    ) -> Dict[str, float]:
        """
        Generate survival probabilities for each month up to the horizon.

        Args:
            churn_probability: Annual churn probability (0-1)
            tenure_years: Current tenure in years
            horizon_months: Prediction horizon (default: 24 months)

        Returns:
            Dictionary with month keys and survival probability values
        """
        horizon = horizon_months or self.horizon_months
        params = SurvivalCurveParams.from_churn_probability(churn_probability, tenure_years)

        survival_probs = {}
        for month in range(1, horizon + 1):
            key = f"month_{month}"
            survival_probs[key] = self.calculate_survival_probability(params, month)

        # Also include legacy keys for backward compatibility
        survival_probs["12"] = survival_probs.get("month_12", 0.5)
        survival_probs["24"] = survival_probs.get("month_24", 0.25)
        survival_probs["36"] = self.calculate_survival_probability(params, 36)

        return survival_probs

    def get_revenue_multiplier(
        self,
        annual_salary: float,
        position_level: Optional[str] = None
    ) -> float:
        """
        Determine revenue multiplier based on position level or salary percentile.

        Higher-level employees typically generate more value relative to their salary.
        """
        if position_level and position_level.lower() in self.REVENUE_MULTIPLIERS:
            return self.REVENUE_MULTIPLIERS[position_level.lower()]

        # Estimate position level from salary
        if annual_salary >= 150000:
            return self.REVENUE_MULTIPLIERS['executive']
        elif annual_salary >= 100000:
            return self.REVENUE_MULTIPLIERS['senior']
        elif annual_salary >= 60000:
            return self.REVENUE_MULTIPLIERS['mid']
        else:
            return self.REVENUE_MULTIPLIERS['entry']

    def calculate_replacement_cost(self, annual_salary: float) -> float:
        """
        Calculate the cost to replace an employee.

        Replacement costs typically include:
        - Recruiting costs
        - Training costs
        - Lost productivity during onboarding
        - Knowledge transfer costs
        """
        return annual_salary * self.replacement_cost_ratio

    def calculate_eltv(
        self,
        annual_salary: float,
        churn_probability: float,
        tenure_years: float = 0,
        position_level: Optional[str] = None,
        horizon_months: Optional[int] = None
    ) -> ELTVResult:
        """
        Calculate Employee Lifetime Value using Weibull survival curves.

        ELTV = Σ[MonthlyValue × S(t) × DF(t)] - ReplacementCost × P(churn)

        Where:
        - MonthlyValue = (AnnualSalary × RevenueMultiplier) / 12
        - S(t) = Weibull survival probability at month t
        - DF(t) = Discount factor = 1 / (1 + r)^t
        - ReplacementCost = cost to replace if employee leaves
        - P(churn) = probability of churn over horizon

        Args:
            annual_salary: Employee's annual salary
            churn_probability: Annual churn probability (0-1)
            tenure_years: Current tenure in years
            position_level: Optional position level for revenue multiplier
            horizon_months: Prediction horizon (default: 24 months)

        Returns:
            ELTVResult with calculated values
        """
        horizon = horizon_months or self.horizon_months

        # Get Weibull parameters
        params = SurvivalCurveParams.from_churn_probability(churn_probability, tenure_years)

        # Calculate multipliers and costs
        revenue_multiplier = self.get_revenue_multiplier(annual_salary, position_level)
        monthly_revenue = (annual_salary * revenue_multiplier) / 12
        replacement_cost = self.calculate_replacement_cost(annual_salary)

        # Generate survival probabilities
        survival_probs = self.generate_survival_curve(
            churn_probability,
            tenure_years,
            horizon
        )

        # Calculate ELTV using discounted expected value
        eltv = 0.0
        expected_tenure_months = 0.0

        for month in range(1, horizon + 1):
            # Get survival probability for this month
            survival_prob = survival_probs[f"month_{month}"]

            # Discount factor for this month
            discount_factor = 1.0 / ((1 + self.monthly_discount_rate) ** month)

            # Add discounted expected value for this month
            monthly_contribution = monthly_revenue * survival_prob * discount_factor
            eltv += monthly_contribution

            # Track expected tenure
            expected_tenure_months += survival_prob

        # Subtract expected replacement cost (weighted by probability of churn)
        churn_prob_at_horizon = 1.0 - survival_probs[f"month_{horizon}"]
        expected_replacement_cost = replacement_cost * churn_prob_at_horizon

        # Discount replacement cost to present value
        replacement_discount_factor = 1.0 / ((1 + self.monthly_discount_rate) ** (horizon / 2))
        eltv -= expected_replacement_cost * replacement_discount_factor

        return ELTVResult(
            eltv=max(0.0, eltv),  # ELTV cannot be negative
            survival_probabilities=survival_probs,
            expected_tenure_months=expected_tenure_months,
            replacement_cost=replacement_cost,
            revenue_multiplier=revenue_multiplier,
            discount_rate=self.annual_discount_rate,
            horizon_months=horizon
        )

    def calculate_eltv_with_treatment(
        self,
        annual_salary: float,
        pre_treatment_churn: float,
        post_treatment_churn: float,
        tenure_years: float = 0,
        position_level: Optional[str] = None,
        treatment_cost: float = 0,
        horizon_months: Optional[int] = None
    ) -> Dict:
        """
        Calculate ELTV difference with and without treatment.

        This method computes the expected value gain from applying a treatment
        that reduces churn probability.

        Args:
            annual_salary: Employee's annual salary
            pre_treatment_churn: Churn probability before treatment
            post_treatment_churn: Churn probability after treatment
            tenure_years: Current tenure in years
            position_level: Optional position level
            treatment_cost: Cost of the treatment
            horizon_months: Prediction horizon

        Returns:
            Dictionary with pre/post ELTV, gain, and ROI metrics
        """
        # Calculate ELTV before treatment
        pre_result = self.calculate_eltv(
            annual_salary=annual_salary,
            churn_probability=pre_treatment_churn,
            tenure_years=tenure_years,
            position_level=position_level,
            horizon_months=horizon_months
        )

        # Calculate ELTV after treatment
        post_result = self.calculate_eltv(
            annual_salary=annual_salary,
            churn_probability=post_treatment_churn,
            tenure_years=tenure_years,
            position_level=position_level,
            horizon_months=horizon_months
        )

        # Calculate gains and ROI
        eltv_gain = post_result.eltv - pre_result.eltv
        net_gain = eltv_gain - treatment_cost
        roi = net_gain / treatment_cost if treatment_cost > 0 else float('inf')

        return {
            "pre_treatment": {
                "eltv": pre_result.eltv,
                "churn_probability": pre_treatment_churn,
                "survival_probabilities": pre_result.survival_probabilities,
                "expected_tenure_months": pre_result.expected_tenure_months
            },
            "post_treatment": {
                "eltv": post_result.eltv,
                "churn_probability": post_treatment_churn,
                "survival_probabilities": post_result.survival_probabilities,
                "expected_tenure_months": post_result.expected_tenure_months
            },
            "treatment_impact": {
                "eltv_gain": eltv_gain,
                "treatment_cost": treatment_cost,
                "net_gain": net_gain,
                "roi": roi,
                "roi_category": self._categorize_roi(roi),
                "churn_reduction": pre_treatment_churn - post_treatment_churn,
                "tenure_increase_months": post_result.expected_tenure_months - pre_result.expected_tenure_months
            }
        }

    def _categorize_roi(self, roi: float) -> str:
        """Categorize ROI into high/medium/low"""
        if roi == float('inf') or roi > 3.0:
            return "high"
        elif roi > 1.0:
            return "medium"
        else:
            return "low"

    def convert_eltv_to_category(self, eltv: float) -> str:
        """
        Convert numeric ELTV to categorical value for performance mode.

        Categories:
        - High: ELTV >= $100,000
        - Medium: ELTV >= $50,000
        - Low: ELTV < $50,000
        """
        if eltv >= 100000:
            return "High"
        elif eltv >= 50000:
            return "Medium"
        else:
            return "Low"

    def estimate_position_level(
        self,
        position: Optional[str],
        salary: Optional[float],
        tenure: Optional[float]
    ) -> str:
        """
        Estimate position level from available data.
        """
        # Try to infer from position title
        if position:
            position_lower = position.lower()
            if any(x in position_lower for x in ['director', 'vp', 'chief', 'head', 'executive']):
                return 'executive'
            elif any(x in position_lower for x in ['senior', 'lead', 'principal', 'staff']):
                return 'senior'
            elif any(x in position_lower for x in ['junior', 'associate', 'entry', 'intern']):
                return 'entry'

        # Fall back to salary-based estimation
        if salary:
            if salary >= 150000:
                return 'executive'
            elif salary >= 100000:
                return 'senior'
            elif salary >= 60000:
                return 'mid'

        # Default to mid level
        return 'mid'


# Singleton instance for use across the application
eltv_service = ELTVService()
