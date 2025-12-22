"""
ROI Dashboard Schemas

Schemas for the CFO/Executive ROI Dashboard providing portfolio-level
financial metrics, department breakdowns, and timeline projections.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date


class PortfolioSummary(BaseModel):
    """Aggregate portfolio-level KPIs for executives"""

    total_employees: int = Field(..., description="Total employees in dataset")
    high_risk_count: int = Field(..., description="Employees with churn probability > threshold")
    medium_risk_count: int = Field(..., description="Employees with medium churn probability")
    low_risk_count: int = Field(..., description="Employees with low churn probability")

    total_eltv_at_risk: float = Field(..., description="Sum of ELTV for high-risk employees")
    recovery_potential: float = Field(..., description="Estimated ELTV gain if treatments applied")
    aggregate_roi: float = Field(..., description="Portfolio-wide ROI percentage")

    treatments_applied: int = Field(default=0, description="Number of treatments applied")
    treatments_pending: int = Field(default=0, description="Number of recommended treatments not yet applied")

    avg_churn_probability: float = Field(..., description="Average churn probability across portfolio")
    avg_eltv: float = Field(..., description="Average ELTV per employee")


class DepartmentROI(BaseModel):
    """ROI metrics broken down by department/structure"""

    department: str = Field(..., description="Department/structure name")
    employee_count: int = Field(..., description="Number of employees in department")

    high_risk_count: int = Field(..., description="High-risk employees in department")
    eltv_at_risk: float = Field(..., description="Total ELTV at risk in department")
    avg_churn_probability: float = Field(..., description="Average churn probability in department")

    recovery_potential: float = Field(..., description="Potential ELTV recovery with treatments")
    recommended_budget: float = Field(..., description="Recommended treatment budget for department")

    # Comparative metrics
    risk_concentration: float = Field(
        ...,
        description="Percentage of total risk concentrated in this department"
    )
    priority_score: float = Field(
        ...,
        description="Priority score for treatment allocation (higher = more urgent)"
    )


class MonthlyProjection(BaseModel):
    """Month-by-month ELTV projection with/without treatment"""

    month: str = Field(..., description="Month in YYYY-MM format")
    month_index: int = Field(..., description="Month index (0 = current month)")

    eltv_baseline: float = Field(..., description="Projected ELTV without treatment")
    eltv_with_treatment: float = Field(..., description="Projected ELTV with treatment")

    cumulative_loss_baseline: float = Field(..., description="Cumulative ELTV loss without treatment")
    cumulative_recovery: float = Field(..., description="Cumulative ELTV recovered with treatment")

    expected_departures_baseline: int = Field(..., description="Expected departures without treatment")
    expected_departures_treated: int = Field(..., description="Expected departures with treatment")


class TreatmentROISummary(BaseModel):
    """Summary of treatment ROI across all applied treatments"""

    total_treatment_cost: float = Field(..., description="Total cost of all applied treatments")
    total_eltv_preserved: float = Field(..., description="Total ELTV preserved by treatments")
    net_benefit: float = Field(..., description="ELTV preserved minus treatment cost")
    overall_roi_percentage: float = Field(..., description="(Net benefit / cost) * 100")

    treatments_by_type: dict = Field(
        default_factory=dict,
        description="Count of treatments by type"
    )
    avg_treatment_effectiveness: float = Field(
        ...,
        description="Average churn probability reduction per treatment"
    )


class ROIDashboardData(BaseModel):
    """Complete ROI Dashboard response"""

    portfolio_summary: PortfolioSummary
    department_breakdown: List[DepartmentROI]
    timeline_projections: List[MonthlyProjection]
    treatment_roi_summary: TreatmentROISummary

    # Metadata
    data_as_of: date = Field(..., description="Date of data snapshot")
    projection_horizon_months: int = Field(default=12, description="Months of projection")

    class Config:
        json_schema_extra = {
            "example": {
                "portfolio_summary": {
                    "total_employees": 500,
                    "high_risk_count": 45,
                    "medium_risk_count": 120,
                    "low_risk_count": 335,
                    "total_eltv_at_risk": 2500000.00,
                    "recovery_potential": 1800000.00,
                    "aggregate_roi": 320.5,
                    "treatments_applied": 12,
                    "treatments_pending": 33,
                    "avg_churn_probability": 0.23,
                    "avg_eltv": 85000.00
                },
                "department_breakdown": [
                    {
                        "department": "Engineering",
                        "employee_count": 150,
                        "high_risk_count": 18,
                        "eltv_at_risk": 900000.00,
                        "avg_churn_probability": 0.28,
                        "recovery_potential": 650000.00,
                        "recommended_budget": 45000.00,
                        "risk_concentration": 0.36,
                        "priority_score": 8.5
                    }
                ],
                "timeline_projections": [
                    {
                        "month": "2025-01",
                        "month_index": 0,
                        "eltv_baseline": 42500000.00,
                        "eltv_with_treatment": 43200000.00,
                        "cumulative_loss_baseline": 0,
                        "cumulative_recovery": 700000.00,
                        "expected_departures_baseline": 8,
                        "expected_departures_treated": 5
                    }
                ],
                "treatment_roi_summary": {
                    "total_treatment_cost": 150000.00,
                    "total_eltv_preserved": 630000.00,
                    "net_benefit": 480000.00,
                    "overall_roi_percentage": 320.0,
                    "treatments_by_type": {"salary_review": 5, "mentoring": 4, "training": 3},
                    "avg_treatment_effectiveness": 0.15
                },
                "data_as_of": "2025-01-15",
                "projection_horizon_months": 12
            }
        }


class ROIDashboardRequest(BaseModel):
    """Optional filters for ROI Dashboard"""

    department_filter: Optional[List[str]] = Field(
        default=None,
        description="Filter to specific departments"
    )
    risk_level_filter: Optional[str] = Field(
        default=None,
        description="Filter by risk level: 'high', 'medium', 'low'"
    )
    include_terminated: bool = Field(
        default=False,
        description="Include terminated employees in calculations"
    )
    projection_months: int = Field(
        default=12,
        ge=1,
        le=24,
        description="Number of months to project"
    )
