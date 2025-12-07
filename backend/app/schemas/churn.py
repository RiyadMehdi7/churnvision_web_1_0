from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ChurnRiskLevel(str, Enum):
    """Standard risk levels - 3 levels only for consistency"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EmployeeChurnFeatures(BaseModel):
    """Features used for churn prediction"""
    satisfaction_level: float = Field(..., ge=0.0, le=1.0, description="Employee satisfaction level (0-1)")
    last_evaluation: float = Field(..., ge=0.0, le=1.0, description="Last performance evaluation score (0-1)")
    number_project: int = Field(..., ge=0, le=20, description="Number of projects assigned")
    average_monthly_hours: float = Field(..., ge=0, description="Average monthly working hours")
    time_spend_company: int = Field(..., ge=0, description="Years spent at company")
    work_accident: bool = Field(..., description="Had work accident")
    promotion_last_5years: bool = Field(..., description="Promoted in last 5 years")
    department: str = Field(..., description="Department name")
    salary_level: str = Field(..., description="Salary level: low, medium, high")


class ChurnPredictionRequest(BaseModel):
    """Request model for single employee churn prediction"""
    employee_id: Optional[int] = Field(None, description="Employee ID if exists in database")
    features: EmployeeChurnFeatures


class BatchChurnPredictionRequest(BaseModel):
    """Request model for batch churn predictions"""
    predictions: List[ChurnPredictionRequest]


class ChurnPredictionResponse(BaseModel):
    """Response model for churn prediction"""
    employee_id: Optional[int]
    churn_probability: float = Field(..., ge=0.0, le=1.0, description="Probability of churning (0-1)")
    confidence_score: float = Field(default=0.7, ge=0.0, le=1.0, description="Model confidence in prediction (0-1)")
    confidence_breakdown: Dict[str, float] = Field(default_factory=dict, description="Breakdown of confidence components")
    risk_level: ChurnRiskLevel
    contributing_factors: List[Dict[str, Any]] = Field(default_factory=list, description="Top factors contributing to churn risk")
    recommendations: List[str] = Field(default_factory=list, description="Recommendations to reduce churn risk")
    predicted_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "employee_id": 123,
                "churn_probability": 0.75,
                "confidence_score": 0.82,
                "confidence_breakdown": {
                    "tree_agreement": 0.88,
                    "prediction_margin": 0.50,
                    "final_confidence": 0.82
                },
                "risk_level": "high",
                "contributing_factors": [
                    {"feature": "satisfaction_level", "value": 0.2, "impact": "high"},
                    {"feature": "average_monthly_hours", "value": 280, "impact": "medium"}
                ],
                "recommendations": [
                    "Schedule one-on-one meeting to discuss satisfaction",
                    "Review workload and consider redistributing projects"
                ],
                "predicted_at": "2024-01-15T10:30:00"
            }
        }


class BatchChurnPredictionResponse(BaseModel):
    """Response model for batch predictions"""
    predictions: List[ChurnPredictionResponse]
    total_processed: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int


class ModelTrainingRequest(BaseModel):
    """Request to train a new churn prediction model"""
    model_type: str = Field(default="xgboost", description="Model type: xgboost, random_forest, logistic")
    hyperparameters: Optional[Dict[str, Any]] = Field(default=None, description="Model hyperparameters")
    use_existing_data: bool = Field(default=True, description="Use existing employee data for training")
    training_data_url: Optional[str] = Field(None, description="URL to external training data CSV")


class ModelTrainingResponse(BaseModel):
    """Response after model training with comprehensive metrics"""
    model_id: str
    model_type: str
    # Basic metrics (on TEST set, not training set)
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    # Advanced metrics
    roc_auc: Optional[float] = Field(None, description="ROC Area Under Curve (0.5=random, 1.0=perfect)")
    pr_auc: Optional[float] = Field(None, description="Precision-Recall AUC (better for imbalanced data)")
    brier_score: Optional[float] = Field(None, description="Calibration quality (0=perfect, 1=worst)")
    # Cross-validation metrics
    cv_roc_auc_mean: Optional[float] = Field(None, description="Mean ROC-AUC from 5-fold CV")
    cv_roc_auc_std: Optional[float] = Field(None, description="Std deviation of CV scores")
    # Training info
    trained_at: datetime
    training_samples: int
    test_samples: Optional[int] = None
    feature_importance: Dict[str, float]
    # Calibration & thresholds
    calibrated: bool = False
    optimal_high_threshold: Optional[float] = Field(None, description="Data-driven high risk threshold")
    optimal_medium_threshold: Optional[float] = Field(None, description="Data-driven medium risk threshold")
    class_imbalance_ratio: Optional[float] = Field(None, description="Negative/Positive class ratio")


class ModelMetricsResponse(BaseModel):
    """Current model performance metrics"""
    model_id: str
    model_type: str
    # Basic metrics
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    # Advanced metrics
    roc_auc: Optional[float] = None
    pr_auc: Optional[float] = None
    brier_score: Optional[float] = None
    cv_roc_auc_mean: Optional[float] = None
    cv_roc_auc_std: Optional[float] = None
    # Info
    last_trained: Optional[datetime] = None
    predictions_made: int = 0
    feature_importance: Dict[str, float] = Field(default_factory=dict)
    # Calibration
    calibrated: bool = False
    optimal_high_threshold: Optional[float] = None
    optimal_medium_threshold: Optional[float] = None


class RealizedMetricsResponse(BaseModel):
    """Realized accuracy metrics - how well predictions actually performed"""
    total_predictions: int = Field(..., description="Total predictions made")
    verified_predictions: int = Field(..., description="Predictions with known outcome")
    # Precision: Of high-risk flagged, how many actually left?
    high_risk_flagged: int
    high_risk_left: int
    realized_precision: float = Field(..., description="Precision: high_risk_left / high_risk_flagged")
    # Recall: Of those who left, how many were flagged?
    total_left: int
    flagged_before_leaving: int
    realized_recall: float = Field(..., description="Recall: flagged_before_leaving / total_left")
    # Overall
    correct_predictions: int
    accuracy: float
    # Time metrics
    avg_days_to_departure: Optional[float] = None
    predictions_within_90_days: int = 0
    # Interpretation
    interpretation: Optional[Dict[str, str]] = None


class EmployeeCreate(BaseModel):
    """Schema for creating employee with churn features"""
    tenant_id: str
    full_name: str
    role: str
    salary: float
    department: str
    satisfaction_level: float = Field(..., ge=0.0, le=1.0)
    last_evaluation: float = Field(..., ge=0.0, le=1.0)
    number_project: int = Field(..., ge=0, le=20)
    average_monthly_hours: float = Field(..., ge=0)
    time_spend_company: int = Field(..., ge=0)
    work_accident: bool = False
    promotion_last_5years: bool = False
    salary_level: str = Field(..., description="low, medium, or high")
    is_active: bool = True

    @validator('salary_level')
    def validate_salary_level(cls, v):
        if v not in ['low', 'medium', 'high']:
            raise ValueError('salary_level must be low, medium, or high')
        return v

    @validator('department')
    def validate_department(cls, v):
        valid_departments = ['sales', 'technical', 'support', 'IT', 'product_mng',
                             'marketing', 'RandD', 'accounting', 'hr', 'management']
        if v not in valid_departments:
            raise ValueError(f'department must be one of {valid_departments}')
        return v


class EmployeeResponse(BaseModel):
    """Schema for employee response"""
    id: int
    tenant_id: Optional[str] = None
    full_name: str
    role: Optional[str] = None
    salary: Optional[float] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    churn_risk: Optional[ChurnRiskLevel] = None
    churn_probability: Optional[float] = None

    class Config:
        from_attributes = True


class ChurnAnalyticsRequest(BaseModel):
    """Request for churn analytics"""
    tenant_id: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    department: Optional[str] = None
    risk_level: Optional[ChurnRiskLevel] = None


class ChurnAnalyticsResponse(BaseModel):
    """Response with churn analytics and insights"""
    tenant_id: str
    total_employees: int
    high_risk_employees: int
    medium_risk_employees: int
    low_risk_employees: int
    average_churn_probability: float
    department_breakdown: Dict[str, Dict[str, Any]]
    risk_trends: List[Dict[str, Any]]
    top_contributing_factors: List[Dict[str, Any]]
