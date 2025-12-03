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

class ApplyTreatmentRequest(BaseModel):
    employee_id: str
    treatment_id: int

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
