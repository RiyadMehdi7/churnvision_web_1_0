from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import date


class EmployeeDataStrict(BaseModel):
    """Employee data structure for playground"""
    hr_code: str
    full_name: str
    structure_name: str
    position: str
    status: str
    tenure: float
    employee_cost: float
    report_date: str
    normalized_position_level: Optional[str] = None
    termination_date: Optional[str] = None


class ELTVMetrics(BaseModel):
    """ELTV calculation metrics"""
    eltv: float = Field(..., description="Employee Lifetime Value in currency")
    expected_tenure_months: float = Field(..., description="Expected remaining tenure in months")
    replacement_cost: float = Field(..., description="Cost to replace this employee")
    revenue_multiplier: float = Field(..., description="Revenue multiplier used in calculation")
    discount_rate: float = Field(..., description="Annual discount rate used")
    horizon_months: int = Field(..., description="Prediction horizon in months")


class PlaygroundEmployeeData(BaseModel):
    """Comprehensive employee data for playground scenarios"""
    employee_id: str
    current_features: Dict[str, Any]
    current_churn_probability: float = Field(..., ge=0, le=1, description="Annual churn probability")
    current_eltv: float = Field(..., description="Current ELTV value")
    current_survival_probabilities: Dict[str, float] = Field(
        ...,
        description="Survival probabilities by month (month_1 through month_24 plus legacy keys)"
    )
    shap_values: Dict[str, Any] = Field(default_factory=dict)
    normalized_position_level: Optional[str] = None
    eltv_metrics: Optional[ELTVMetrics] = Field(
        None,
        description="Detailed ELTV calculation metrics"
    )

class TreatmentSuggestion(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    cost: float
    effectSize: Optional[float] = None
    timeToEffect: str
    projected_churn_prob_change: float
    projected_post_eltv: float
    projected_roi: str # 'high', 'medium', 'low'
    riskLevels: Optional[List[str]] = None
    explanation: Optional[List[Dict[str, Any]]] = None

class InlineTreatmentData(BaseModel):
    """Inline treatment data for AI-generated treatments that aren't in the database."""
    name: str
    description: Optional[str] = None
    type: Optional[str] = None  # 'material' or 'non-material'
    estimated_cost: Optional[float] = 0
    expected_impact: Optional[str] = "Medium"  # 'High', 'Medium', 'Low'
    implementation_timeline: Optional[str] = "2 weeks"


class ApplyTreatmentRequest(BaseModel):
    employee_id: str
    treatment_id: int
    # Optional inline treatment data for AI-generated treatments (ID >= 1000)
    treatment_data: Optional[InlineTreatmentData] = None

class ApplyTreatmentResult(BaseModel):
    employee_id: str
    eltv_pre_treatment: float
    eltv_post_treatment: float
    treatment_effect_eltv: float
    treatment_cost: float
    roi: float
    pre_churn_probability: float
    post_churn_probability: float
    new_survival_probabilities: Dict[str, float]
    applied_treatment: Dict[str, Any]

class ManualSimulationRequest(BaseModel):
    employee_id: str
    changed_features: Dict[str, Any]

class ManualSimulationResponse(BaseModel):
    new_churn_probability: float
    new_risk_level: str
    delta: float


# =============================================================================
# ML-Based Simulation Schemas (using real model predictions)
# =============================================================================

class MLSimulationRequest(BaseModel):
    """Request for ML-based treatment simulation"""
    employee_id: str = Field(..., description="Employee HR code")
    treatment_id: int = Field(..., description="Treatment definition ID")
    custom_modifications: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional custom feature modifications to override treatment defaults"
    )
    use_ml_model: bool = Field(
        True,
        description="Whether to use real ML model (True) or heuristics (False)"
    )


class MLSimulationResult(BaseModel):
    """Result of ML-based treatment simulation"""
    employee_id: str
    treatment_id: int
    treatment_name: str
    treatment_cost: float
    feature_modifications: Dict[str, Any] = Field(
        ...,
        description="The ML features that were modified for this simulation"
    )
    pre_churn_probability: float = Field(..., ge=0, le=1)
    post_churn_probability: float = Field(..., ge=0, le=1)
    churn_delta: float = Field(
        ...,
        description="Change in churn probability (negative = improvement)"
    )
    eltv_pre_treatment: float
    eltv_post_treatment: float
    treatment_effect_eltv: float
    net_benefit: float = Field(
        ...,
        description="ELTV gain minus treatment cost"
    )
    roi: float = Field(..., description="ROI percentage")
    new_survival_probabilities: Dict[str, float]
    ml_model_used: bool = Field(
        ...,
        description="Whether real ML model was used (True) or heuristics (False)"
    )
    applied_treatment: Dict[str, Any]


class TreatmentFeatureMappingResponse(BaseModel):
    """Response showing how a treatment maps to ML features"""
    treatment_id: int
    treatment_name: str
    description: str
    estimated_cost: float
    feature_modifications: Dict[str, Any] = Field(
        ...,
        description="The ML features this treatment affects and their target values"
    )
    affected_features: List[str] = Field(
        ...,
        description="List of ML feature names affected by this treatment"
    )
