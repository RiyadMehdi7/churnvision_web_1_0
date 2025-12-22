"""
Atlas Scenario Schemas

Pydantic models for Atlas what-if scenario simulation API.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class AtlasScenarioRequest(BaseModel):
    """Request for a single scenario simulation"""
    employee_id: str = Field(..., description="Employee HR code")
    modifications: Dict[str, Any] = Field(
        ...,
        description="Feature modifications to apply",
        example={"employee_cost": 88000, "satisfaction_level": 0.8}
    )
    scenario_name: Optional[str] = Field(
        None,
        description="Optional name for the scenario"
    )
    scenario_id: Optional[str] = Field(
        None,
        description="Optional unique ID for the scenario"
    )


class AtlasBatchScenarioRequest(BaseModel):
    """Request for batch scenario simulation"""
    employee_id: str = Field(..., description="Employee HR code")
    scenarios: List[Dict[str, Any]] = Field(
        ...,
        description="List of scenarios to compare",
        example=[
            {"name": "Salary +10%", "modifications": {"employee_cost": 88000}},
            {"name": "Promotion", "modifications": {"promotion_last_5years": 1}},
            {"name": "Combined", "modifications": {"employee_cost": 88000, "promotion_last_5years": 1}}
        ]
    )


class AtlasScenarioResponse(BaseModel):
    """Response for a single scenario simulation"""
    scenario_name: str
    scenario_id: str

    # Baseline metrics
    baseline_churn_prob: float = Field(..., description="Current churn probability")
    baseline_risk_level: str = Field(..., description="Current risk level")
    baseline_eltv: float = Field(..., description="Current ELTV")

    # Scenario metrics
    scenario_churn_prob: float = Field(..., description="Projected churn probability")
    scenario_risk_level: str = Field(..., description="Projected risk level")
    scenario_eltv: float = Field(..., description="Projected ELTV")

    # Deltas
    churn_delta: float = Field(..., description="Change in churn probability (negative = improvement)")
    eltv_delta: float = Field(..., description="Change in ELTV (positive = improvement)")

    # ROI
    implied_annual_cost: float = Field(..., description="Annual cost of the modification")
    implied_roi: float = Field(..., description="ROI percentage")

    # Survival projections
    baseline_survival_probs: Dict[str, float] = Field(default_factory=dict)
    scenario_survival_probs: Dict[str, float] = Field(default_factory=dict)

    # Applied modifications
    modifications: Dict[str, Any] = Field(default_factory=dict)

    simulated_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "scenario_name": "Salary +10%",
                "scenario_id": "scenario_1",
                "baseline_churn_prob": 0.65,
                "baseline_risk_level": "Medium",
                "baseline_eltv": 85000.00,
                "scenario_churn_prob": 0.45,
                "scenario_risk_level": "Medium",
                "scenario_eltv": 112000.00,
                "churn_delta": -0.20,
                "eltv_delta": 27000.00,
                "implied_annual_cost": 8000.00,
                "implied_roi": 237.5,
                "baseline_survival_probs": {"month_1": 0.95, "month_6": 0.75},
                "scenario_survival_probs": {"month_1": 0.97, "month_6": 0.85},
                "modifications": {"employee_cost": 88000},
                "simulated_at": "2025-01-15T12:00:00Z"
            }
        }


class AtlasBatchScenarioResponse(BaseModel):
    """Response for batch scenario simulation"""
    employee_id: str
    employee_name: str
    current_churn_prob: float
    current_eltv: float
    scenarios: List[AtlasScenarioResponse]
    best_scenario: Optional[str] = Field(
        None,
        description="ID of the scenario with best ROI"
    )
    comparison_summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Summary comparing all scenarios"
    )


class AtlasModificationOption(BaseModel):
    """Available modification option metadata"""
    feature: str
    label: str
    type: str  # 'currency', 'slider', 'boolean', 'number'
    description: str
    impact: str
    cost_type: str  # 'direct', 'fixed', 'per_project', 'initiative', 'indirect', 'none'
    estimated_cost: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    recommended_range: Optional[List[float]] = None
    is_core: Optional[bool] = True  # Core fields always available
    current_value: Optional[float] = None  # Current value if employee selected


class AtlasModificationsResponse(BaseModel):
    """Response listing available modifications"""
    modifications: List[AtlasModificationOption]


# =============================================================================
# Counterfactual Schemas (TRUE ML Model Perturbation)
# =============================================================================

class PerturbableFeature(BaseModel):
    """A feature that can be modified in counterfactual analysis."""
    name: str = Field(..., description="Feature name (matches EmployeeChurnFeatures)")
    label: str = Field(..., description="Human-readable label")
    current_value: Any = Field(..., description="Current value for this employee")
    type: str = Field(..., description="Data type: float, int, bool, categorical")
    min_value: Optional[float] = Field(None, description="Minimum value for numeric types")
    max_value: Optional[float] = Field(None, description="Maximum value for numeric types")
    step: Optional[float] = Field(None, description="Step increment for sliders")
    options: Optional[List[str]] = Field(None, description="Valid options for categorical types")
    description: str = Field("", description="Feature description")
    impact_direction: str = Field(
        "neutral",
        description="Which direction improves retention: higher_is_better, lower_is_better, neutral"
    )


class EmployeeMlFeaturesResponse(BaseModel):
    """Employee's current ML features for counterfactual analysis."""
    employee_id: str
    employee_name: Optional[str] = None
    dataset_id: Optional[str] = None

    # The 9 EmployeeChurnFeatures values
    features: Dict[str, Any] = Field(
        ...,
        description="Current ML feature values",
        example={
            "satisfaction_level": 0.6,
            "last_evaluation": 0.7,
            "number_project": 3,
            "average_monthly_hours": 160,
            "time_spend_company": 3,
            "work_accident": False,
            "promotion_last_5years": False,
            "department": "technical",
            "salary_level": "medium"
        }
    )

    # Metadata for each perturbable feature
    perturbable_features: List[PerturbableFeature] = Field(
        default_factory=list,
        description="List of features with metadata for UI controls"
    )

    # Optional salary for ELTV calculations
    annual_salary: Optional[float] = None


class CounterfactualRequest(BaseModel):
    """Request for counterfactual simulation using ML model perturbation."""
    employee_id: str = Field(..., description="Employee HR code")
    base_features: Dict[str, Any] = Field(
        ...,
        description="Base ML features (from /employee-features endpoint)",
        example={
            "satisfaction_level": 0.6,
            "last_evaluation": 0.7,
            "number_project": 3,
            "average_monthly_hours": 160,
            "time_spend_company": 3,
            "work_accident": False,
            "promotion_last_5years": False,
            "department": "technical",
            "salary_level": "medium"
        }
    )
    modifications: Dict[str, Any] = Field(
        ...,
        description="Feature modifications to apply",
        example={"satisfaction_level": 0.8, "promotion_last_5years": True}
    )
    scenario_name: Optional[str] = Field(None, description="Optional scenario name")
    scenario_id: Optional[str] = Field(None, description="Optional scenario ID")
    dataset_id: Optional[str] = Field(None, description="Dataset ID for model selection")
    annual_salary: Optional[float] = Field(None, description="Annual salary for ELTV calculation")


class CounterfactualBatchRequest(BaseModel):
    """Request for batch counterfactual comparison."""
    employee_id: str = Field(..., description="Employee HR code")
    base_features: Dict[str, Any] = Field(..., description="Base ML features")
    scenarios: List[Dict[str, Any]] = Field(
        ...,
        description="List of scenarios to compare",
        example=[
            {"name": "Improve Satisfaction", "modifications": {"satisfaction_level": 0.8}},
            {"name": "Reduce Workload", "modifications": {"average_monthly_hours": 150}},
            {"name": "Promotion", "modifications": {"promotion_last_5years": True}}
        ]
    )
    dataset_id: Optional[str] = None
    annual_salary: Optional[float] = None


class CounterfactualResponse(BaseModel):
    """Response from counterfactual simulation - uses REAL model predictions."""
    scenario_name: str
    scenario_id: str

    # Baseline (from actual model prediction)
    baseline_churn_prob: float = Field(..., description="Baseline churn probability (real model)")
    baseline_risk_level: str = Field(..., description="Baseline risk level")
    baseline_eltv: float = Field(..., description="Baseline ELTV")
    baseline_confidence: float = Field(..., description="Model confidence for baseline")
    baseline_factors: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="SHAP contributing factors for baseline"
    )

    # Scenario (from actual model prediction with modifications)
    scenario_churn_prob: float = Field(..., description="Scenario churn probability (real model)")
    scenario_risk_level: str = Field(..., description="Scenario risk level")
    scenario_eltv: float = Field(..., description="Scenario ELTV")
    scenario_confidence: float = Field(..., description="Model confidence for scenario")
    scenario_factors: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="SHAP contributing factors for scenario"
    )

    # Deltas
    churn_delta: float = Field(..., description="Change in churn (negative = improvement)")
    eltv_delta: float = Field(..., description="Change in ELTV (positive = improvement)")

    # ROI
    implied_annual_cost: float = Field(..., description="Estimated annual cost of modifications")
    implied_roi: float = Field(..., description="ROI percentage")

    # Survival projections
    baseline_survival_probs: Dict[str, float] = Field(default_factory=dict)
    scenario_survival_probs: Dict[str, float] = Field(default_factory=dict)

    # Modifications applied
    modifications: Dict[str, Any] = Field(default_factory=dict)

    # Metadata
    simulated_at: datetime
    prediction_method: str = Field(
        default="model",
        description="Prediction method: 'model' (real ML) or 'heuristic' (fallback)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "scenario_name": "Improve Satisfaction",
                "scenario_id": "cf_1",
                "baseline_churn_prob": 0.65,
                "baseline_risk_level": "High",
                "baseline_eltv": 85000.0,
                "baseline_confidence": 0.82,
                "baseline_factors": [
                    {"feature": "satisfaction_level", "value": 0.4, "impact": "critical"}
                ],
                "scenario_churn_prob": 0.35,
                "scenario_risk_level": "Low",
                "scenario_eltv": 145000.0,
                "scenario_confidence": 0.78,
                "scenario_factors": [
                    {"feature": "satisfaction_level", "value": 0.8, "impact": "low"}
                ],
                "churn_delta": -0.30,
                "eltv_delta": 60000.0,
                "implied_annual_cost": 8000.0,
                "implied_roi": 650.0,
                "modifications": {"satisfaction_level": 0.8},
                "simulated_at": "2025-01-15T12:00:00Z",
                "prediction_method": "model"
            }
        }


class CounterfactualBatchResponse(BaseModel):
    """Response for batch counterfactual comparison."""
    employee_id: str
    employee_name: Optional[str] = None
    current_churn_prob: float
    current_eltv: float
    scenarios: List[CounterfactualResponse]
    best_scenario: Optional[str] = Field(
        None,
        description="ID of the scenario with best ROI"
    )
    comparison_summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Summary comparing all scenarios"
    )
