"""
Treatment Mapping Service

Maps TreatmentDefinition to ML feature modifications for counterfactual analysis.
This bridges the gap between business-level treatments and ML-level features.

The key insight is that treatments define high-level interventions ("Give Promotion")
but the ML model needs specific feature modifications (promotion_last_5years=True).
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import json
import logging
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.treatment import TreatmentDefinition

logger = logging.getLogger(__name__)


@dataclass
class TreatmentFeatureMapping:
    """Maps a treatment to its corresponding ML feature modifications."""
    treatment_id: int
    treatment_name: str
    feature_modifications: Dict[str, Any]
    estimated_cost: float
    description: str


# =============================================================================
# Predefined Treatment-to-Feature Mappings
# =============================================================================
# These mappings define how each treatment type affects the ML model features.
# The 9 EmployeeChurnFeatures are:
#   - satisfaction_level (float, 0-1)
#   - last_evaluation (float, 0-1)
#   - number_project (int, 1-10)
#   - average_monthly_hours (int, 80-300)
#   - time_spend_company (int, years)
#   - work_accident (bool)
#   - promotion_last_5years (bool)
#   - department (categorical)
#   - salary_level (categorical: low/medium/high)

TREATMENT_FEATURE_MAPPINGS: Dict[str, Dict[str, Any]] = {
    # Career Advancement Treatments
    "promotion": {
        "promotion_last_5years": True,
        "salary_level": "high",
    },
    "career_development": {
        "satisfaction_level": 0.8,  # Target value
        "last_evaluation": 0.85,
    },
    "leadership_program": {
        "satisfaction_level": 0.75,
        "number_project": 4,  # Optimal project count
    },

    # Compensation Treatments
    "salary_increase": {
        "salary_level": "high",
        "satisfaction_level": 0.8,
    },
    "retention_bonus": {
        "salary_level": "high",
        "satisfaction_level": 0.85,
    },
    "equity_grant": {
        "salary_level": "high",
    },

    # Work-Life Balance Treatments
    "workload_reduction": {
        "average_monthly_hours": 160,  # Standard 40hr week
        "number_project": 3,
    },
    "flexible_work": {
        "satisfaction_level": 0.75,
        "average_monthly_hours": 165,
    },
    "remote_work": {
        "satisfaction_level": 0.8,
    },

    # Engagement Treatments
    "role_enrichment": {
        "satisfaction_level": 0.8,
        "number_project": 4,
        "last_evaluation": 0.8,
    },
    "team_change": {
        "satisfaction_level": 0.7,
    },
    "mentoring": {
        "satisfaction_level": 0.75,
        "last_evaluation": 0.75,
    },

    # Recognition Treatments
    "recognition_program": {
        "satisfaction_level": 0.8,
        "last_evaluation": 0.85,
    },
    "performance_bonus": {
        "satisfaction_level": 0.85,
        "last_evaluation": 0.9,
    },

    # Development Treatments
    "training": {
        "satisfaction_level": 0.75,
        "last_evaluation": 0.8,
    },
    "certification": {
        "satisfaction_level": 0.8,
    },
    "conference": {
        "satisfaction_level": 0.75,
    },

    # Comprehensive Packages
    "comprehensive_retention": {
        "satisfaction_level": 0.9,
        "promotion_last_5years": True,
        "salary_level": "high",
        "average_monthly_hours": 165,
    },
    "high_performer_package": {
        "promotion_last_5years": True,
        "salary_level": "high",
        "last_evaluation": 0.9,
        "number_project": 4,
    },
}

# Name pattern matching for mapping treatment names to feature sets
TREATMENT_NAME_PATTERNS = {
    "promotion": ["promotion", "advance", "career path"],
    "salary_increase": ["salary", "compensation", "pay raise", "market adjustment"],
    "retention_bonus": ["bonus", "retention incentive", "stay bonus"],
    "workload_reduction": ["workload", "hours", "reduce projects"],
    "flexible_work": ["flexible", "flex", "work-life"],
    "remote_work": ["remote", "wfh", "work from home", "hybrid"],
    "role_enrichment": ["role", "enrichment", "job expansion"],
    "recognition_program": ["recognition", "reward", "appreciation"],
    "training": ["training", "learning", "skill development"],
    "comprehensive_retention": ["comprehensive", "full package", "retention package"],
}


class TreatmentMappingService:
    """
    Service for mapping TreatmentDefinitions to ML feature modifications.

    This enables the Unified Playground to:
    1. Show which ML features a treatment affects
    2. Allow users to fine-tune those features
    3. Run counterfactual simulations with real ML predictions
    """

    def __init__(self):
        self._custom_mappings: Dict[int, Dict[str, Any]] = {}

    async def get_treatment_feature_mapping(
        self,
        db: AsyncSession,
        treatment_id: int
    ) -> TreatmentFeatureMapping:
        """
        Get the feature mapping for a specific treatment.

        Args:
            db: Database session
            treatment_id: The treatment definition ID

        Returns:
            TreatmentFeatureMapping with the ML feature modifications
        """
        # Get treatment from database
        query = select(TreatmentDefinition).where(TreatmentDefinition.id == treatment_id)
        result = await db.execute(query)
        treatment = result.scalar_one_or_none()

        if not treatment:
            raise ValueError(f"Treatment {treatment_id} not found")

        # Get feature modifications
        modifications = self._get_modifications_for_treatment(treatment)

        return TreatmentFeatureMapping(
            treatment_id=treatment.id,
            treatment_name=treatment.name,
            feature_modifications=modifications,
            estimated_cost=float(treatment.base_cost) if treatment.base_cost else 0,
            description=treatment.description or ""
        )

    def _get_modifications_for_treatment(
        self,
        treatment: TreatmentDefinition
    ) -> Dict[str, Any]:
        """
        Determine the ML feature modifications for a treatment.

        Priority:
        1. Custom mapping registered for this treatment ID
        2. Mapping from treatment's targeted_variables_json
        3. Pattern matching on treatment name
        4. Default based on treatment type
        """
        # Check custom mapping first
        if treatment.id in self._custom_mappings:
            return self._custom_mappings[treatment.id]

        # Try targeted_variables_json (from treatment definition)
        if treatment.targeted_variables_json:
            try:
                targeted = json.loads(treatment.targeted_variables_json)
                if isinstance(targeted, dict) and targeted:
                    return self._convert_targeted_to_modifications(targeted)
            except (json.JSONDecodeError, TypeError):
                pass

        # Pattern matching on treatment name
        treatment_name_lower = (treatment.name or "").lower()
        for mapping_key, patterns in TREATMENT_NAME_PATTERNS.items():
            for pattern in patterns:
                if pattern in treatment_name_lower:
                    if mapping_key in TREATMENT_FEATURE_MAPPINGS:
                        return TREATMENT_FEATURE_MAPPINGS[mapping_key].copy()

        # Default fallback: satisfaction improvement
        logger.warning(
            f"No mapping found for treatment '{treatment.name}' (id={treatment.id}), "
            f"using satisfaction improvement as default"
        )
        return {
            "satisfaction_level": 0.8  # Conservative default
        }

    def _convert_targeted_to_modifications(
        self,
        targeted: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert targeted_variables from treatment definition to ML features.

        The targeted_variables_json may contain business terms that need
        mapping to ML feature names.
        """
        # Mapping from business terms to ML feature names
        BUSINESS_TO_ML_FEATURE = {
            "satisfaction": "satisfaction_level",
            "employee_satisfaction": "satisfaction_level",
            "performance": "last_evaluation",
            "evaluation": "last_evaluation",
            "workload": "average_monthly_hours",
            "hours": "average_monthly_hours",
            "projects": "number_project",
            "project_count": "number_project",
            "tenure": "time_spend_company",
            "promotion": "promotion_last_5years",
            "promoted": "promotion_last_5years",
            "salary": "salary_level",
            "compensation": "salary_level",
            "department": "department",
            "team": "department",
        }

        modifications = {}
        for key, value in targeted.items():
            key_lower = key.lower().replace(" ", "_")

            # Direct match
            if key_lower in BUSINESS_TO_ML_FEATURE:
                ml_feature = BUSINESS_TO_ML_FEATURE[key_lower]
                modifications[ml_feature] = value
            # Already an ML feature name
            elif key_lower in [
                "satisfaction_level", "last_evaluation", "number_project",
                "average_monthly_hours", "time_spend_company", "work_accident",
                "promotion_last_5years", "department", "salary_level"
            ]:
                modifications[key_lower] = value

        return modifications

    def treatment_to_counterfactual(
        self,
        treatment_name: str,
        base_features: Dict[str, Any],
        custom_modifications: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Convert a treatment name to counterfactual modifications.

        This is used when we don't have a database connection but need
        to map treatments to features quickly.

        Args:
            treatment_name: Name of the treatment
            base_features: Current employee ML features
            custom_modifications: Optional user-specified modifications

        Returns:
            Dict of ML feature modifications for counterfactual analysis
        """
        # Start with custom modifications if provided
        if custom_modifications:
            return custom_modifications

        # Pattern matching on treatment name
        treatment_name_lower = treatment_name.lower()

        for mapping_key, patterns in TREATMENT_NAME_PATTERNS.items():
            for pattern in patterns:
                if pattern in treatment_name_lower:
                    if mapping_key in TREATMENT_FEATURE_MAPPINGS:
                        modifications = TREATMENT_FEATURE_MAPPINGS[mapping_key].copy()
                        return self._apply_relative_adjustments(modifications, base_features)

        # Default: improve satisfaction
        return {"satisfaction_level": min(1.0, base_features.get("satisfaction_level", 0.5) + 0.3)}

    def _apply_relative_adjustments(
        self,
        modifications: Dict[str, Any],
        base_features: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        For float features, ensure we're improving from current value.

        E.g., if satisfaction_level is already 0.9, don't set to 0.8.
        """
        result = {}
        for feature, target_value in modifications.items():
            current_value = base_features.get(feature)

            if isinstance(target_value, (int, float)) and isinstance(current_value, (int, float)):
                if feature in ["satisfaction_level", "last_evaluation"]:
                    # For these, we want higher = better
                    result[feature] = max(current_value, target_value)
                elif feature == "average_monthly_hours":
                    # For hours, we want to reduce if high
                    if current_value > target_value:
                        result[feature] = target_value
                    # Don't reduce if already low
                else:
                    result[feature] = target_value
            else:
                result[feature] = target_value

        return result

    def register_custom_mapping(
        self,
        treatment_id: int,
        modifications: Dict[str, Any]
    ) -> None:
        """
        Register a custom mapping for a specific treatment ID.

        This allows administrators to define precise mappings for
        treatments that don't fit the standard patterns.
        """
        self._custom_mappings[treatment_id] = modifications
        logger.info(f"Registered custom mapping for treatment {treatment_id}: {modifications}")

    def get_affected_features(
        self,
        treatment_name: str
    ) -> List[str]:
        """
        Get the list of ML features affected by a treatment.

        Useful for displaying to users which features will change.
        """
        treatment_name_lower = treatment_name.lower()

        for mapping_key, patterns in TREATMENT_NAME_PATTERNS.items():
            for pattern in patterns:
                if pattern in treatment_name_lower:
                    if mapping_key in TREATMENT_FEATURE_MAPPINGS:
                        return list(TREATMENT_FEATURE_MAPPINGS[mapping_key].keys())

        return ["satisfaction_level"]  # Default

    def estimate_modification_cost(
        self,
        modifications: Dict[str, Any],
        base_features: Dict[str, Any]
    ) -> float:
        """
        Estimate the cost of implementing the feature modifications.

        This is used for ROI calculation when user fine-tunes features.
        """
        # Cost per feature change (annual cost)
        COST_PER_FEATURE = {
            "satisfaction_level": 2000,  # Per 0.1 increase
            "last_evaluation": 1500,
            "number_project": 500,  # Per project change
            "average_monthly_hours": 100,  # Per hour reduction
            "promotion_last_5years": 15000,  # Average promotion cost
            "salary_level": 12000,  # Per tier increase
        }

        total_cost = 0.0

        for feature, new_value in modifications.items():
            old_value = base_features.get(feature)
            if old_value is None:
                continue

            cost_per_unit = COST_PER_FEATURE.get(feature, 1000)

            if feature == "satisfaction_level":
                delta = max(0, float(new_value) - float(old_value))
                total_cost += (delta / 0.1) * cost_per_unit

            elif feature == "last_evaluation":
                delta = max(0, float(new_value) - float(old_value))
                total_cost += (delta / 0.1) * cost_per_unit

            elif feature == "average_monthly_hours":
                # Cost of reducing workload
                if new_value < old_value:
                    delta = old_value - new_value
                    total_cost += delta * cost_per_unit

            elif feature == "number_project":
                delta = abs(new_value - old_value)
                total_cost += delta * cost_per_unit

            elif feature == "promotion_last_5years":
                if new_value and not old_value:
                    total_cost += cost_per_unit

            elif feature == "salary_level":
                tiers = {"low": 0, "medium": 1, "high": 2}
                old_tier = tiers.get(str(old_value).lower(), 0)
                new_tier = tiers.get(str(new_value).lower(), 0)
                tier_jump = max(0, new_tier - old_tier)
                total_cost += tier_jump * cost_per_unit

        return total_cost


# Singleton instance
treatment_mapping_service = TreatmentMappingService()
