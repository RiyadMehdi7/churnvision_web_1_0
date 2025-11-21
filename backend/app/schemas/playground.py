from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import date

class EmployeeDataStrict(BaseModel):
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

class PlaygroundEmployeeData(BaseModel):
    employee_id: str
    current_features: Dict[str, Any]
    current_churn_probability: float
    current_eltv: float
    current_survival_probabilities: Dict[str, float]
    shap_values: Dict[str, float]
    normalized_position_level: Optional[str] = None

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
