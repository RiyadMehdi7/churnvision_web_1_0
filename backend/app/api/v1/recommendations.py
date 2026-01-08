"""
Recommendation API Endpoints

These endpoints manage formal treatment recommendations:
- Generate recommendations for employees
- List pending recommendations for review
- Approve or reject recommendations
- Bulk recommendation generation
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.analytics.recommendation_service import recommendation_service

router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================

class GenerateRecommendationRequest(BaseModel):
    """Request for generating a recommendation"""
    employee_id: str = Field(..., description="Employee HR code")
    treatment_id: Optional[int] = Field(
        None,
        description="Specific treatment ID (auto-selects best if not provided)"
    )
    use_ml_model: bool = Field(
        True,
        description="Use ML model for prediction (True) or heuristics (False)"
    )
    reasoning_override: Optional[str] = Field(
        None,
        description="Custom reasoning text to override auto-generated"
    )


class RecommendationResponse(BaseModel):
    """Response for a single recommendation"""
    recommendation_id: int
    employee_id: str
    employee_name: str
    current_risk_level: str
    churn_probability: float
    recommended_treatment_id: int
    recommended_treatment_name: str
    treatment_cost: float
    projected_churn_reduction: float
    projected_eltv_gain: float
    projected_roi: float
    reasoning: str
    priority_score: float
    expires_date: str


class PendingRecommendationResponse(BaseModel):
    """Response for pending recommendation list"""
    recommendation_id: int
    employee_id: str
    employee_name: str
    department: str
    position: str
    risk_level: str
    churn_probability: float
    recommended_treatments: List[dict]
    priority_score: float
    estimated_impact: float
    estimated_cost: float
    estimated_roi: float
    reasoning: str
    recommendation_date: str
    expires_date: Optional[str]
    status: str


class ApproveRecommendationRequest(BaseModel):
    """Request for approving a recommendation"""
    notes: Optional[str] = Field(None, description="Optional notes for the approval")


class RejectRecommendationRequest(BaseModel):
    """Request for rejecting a recommendation"""
    rejection_reason: str = Field(..., description="Reason for rejecting the recommendation")


class BulkRecommendationRequest(BaseModel):
    """Request for generating bulk recommendations"""
    risk_level_filter: Optional[str] = Field(
        "High",
        description="Risk level to filter (High, Medium, Low)"
    )
    department_filter: Optional[str] = Field(
        None,
        description="Department to filter"
    )
    max_recommendations: int = Field(
        20,
        ge=1,
        le=100,
        description="Maximum number of recommendations to generate"
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/generate", response_model=RecommendationResponse)
async def generate_recommendation(
    request: GenerateRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a formal treatment recommendation for an employee.

    If treatment_id is not provided, automatically selects the best treatment
    based on ROI analysis using ML model predictions.

    The recommendation is stored in the database for HR review and approval.
    """
    try:
        result = await recommendation_service.generate_recommendation(
            db=db,
            employee_hr_code=request.employee_id,
            treatment_id=request.treatment_id,
            use_ml_model=request.use_ml_model,
            created_by=current_user.username,
            reasoning_override=request.reasoning_override
        )

        return RecommendationResponse(
            recommendation_id=result.recommendation_id,
            employee_id=result.employee_id,
            employee_name=result.employee_name,
            current_risk_level=result.current_risk_level,
            churn_probability=result.churn_probability,
            recommended_treatment_id=result.recommended_treatment_id,
            recommended_treatment_name=result.recommended_treatment_name,
            treatment_cost=result.treatment_cost,
            projected_churn_reduction=result.projected_churn_reduction,
            projected_eltv_gain=result.projected_eltv_gain,
            projected_roi=min(999.99, max(-999.99, result.projected_roi)),
            reasoning=result.reasoning,
            priority_score=result.priority_score,
            expires_date=result.expires_date.isoformat()
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating recommendation: {str(e)}"
        )


@router.get("/pending", response_model=List[PendingRecommendationResponse])
async def get_pending_recommendations(
    department: Optional[str] = Query(None, description="Filter by department"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all pending recommendations for HR review.

    Returns recommendations sorted by priority score (highest first).
    """
    try:
        recommendations = await recommendation_service.get_pending_recommendations(
            db=db,
            department_filter=department,
            risk_level_filter=risk_level,
            limit=limit
        )

        return [
            PendingRecommendationResponse(**rec)
            for rec in recommendations
        ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving recommendations: {str(e)}"
        )


@router.post("/{recommendation_id}/approve")
async def approve_recommendation(
    recommendation_id: int,
    request: ApproveRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Approve a pending recommendation.

    This creates a TreatmentApplication record and marks the recommendation
    as approved. The treatment is now considered "applied" to the employee.
    """
    try:
        result = await recommendation_service.approve_recommendation(
            db=db,
            recommendation_id=recommendation_id,
            approved_by=current_user.username,
            notes=request.notes
        )

        return {
            "success": True,
            "message": f"Recommendation #{recommendation_id} approved",
            "details": result
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error approving recommendation: {str(e)}"
        )


@router.post("/{recommendation_id}/reject")
async def reject_recommendation(
    recommendation_id: int,
    request: RejectRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Reject a pending recommendation with a reason.

    The recommendation is marked as rejected and won't appear in pending lists.
    """
    try:
        result = await recommendation_service.reject_recommendation(
            db=db,
            recommendation_id=recommendation_id,
            rejection_reason=request.rejection_reason,
            rejected_by=current_user.username
        )

        return {
            "success": True,
            "message": f"Recommendation #{recommendation_id} rejected",
            "details": result
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error rejecting recommendation: {str(e)}"
        )


@router.post("/bulk-generate", response_model=List[RecommendationResponse])
async def generate_bulk_recommendations(
    request: BulkRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate recommendations for multiple high-risk employees at once.

    This is useful for proactive retention campaigns. It automatically:
    1. Identifies employees matching the filter criteria
    2. Selects the best treatment for each
    3. Creates recommendation records for review

    Skips employees who already have pending recommendations.
    """
    try:
        results = await recommendation_service.generate_bulk_recommendations(
            db=db,
            risk_level_filter=request.risk_level_filter,
            department_filter=request.department_filter,
            max_recommendations=request.max_recommendations
        )

        return [
            RecommendationResponse(
                recommendation_id=r.recommendation_id,
                employee_id=r.employee_id,
                employee_name=r.employee_name,
                current_risk_level=r.current_risk_level,
                churn_probability=r.churn_probability,
                recommended_treatment_id=r.recommended_treatment_id,
                recommended_treatment_name=r.recommended_treatment_name,
                treatment_cost=r.treatment_cost,
                projected_churn_reduction=r.projected_churn_reduction,
                projected_eltv_gain=r.projected_eltv_gain,
                projected_roi=min(999.99, max(-999.99, r.projected_roi)),
                reasoning=r.reasoning,
                priority_score=r.priority_score,
                expires_date=r.expires_date.isoformat()
            )
            for r in results
        ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating bulk recommendations: {str(e)}"
        )


@router.get("/stats")
async def get_recommendation_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get statistics about recommendations.

    Returns counts of pending, approved, rejected, and expired recommendations.
    """
    from sqlalchemy import func, select
    from app.models.treatment import TreatmentRecommendation

    try:
        # Count by status
        status_query = select(
            TreatmentRecommendation.recommendation_status,
            func.count(TreatmentRecommendation.id)
        ).group_by(TreatmentRecommendation.recommendation_status)

        result = await db.execute(status_query)
        status_counts = {status: count for status, count in result.all()}

        # Count by risk level (pending only)
        risk_query = select(
            TreatmentRecommendation.risk_level,
            func.count(TreatmentRecommendation.id)
        ).where(
            TreatmentRecommendation.recommendation_status == 'pending'
        ).group_by(TreatmentRecommendation.risk_level)

        result = await db.execute(risk_query)
        risk_counts = {level: count for level, count in result.all()}

        return {
            "total_recommendations": sum(status_counts.values()),
            "by_status": {
                "pending": status_counts.get('pending', 0),
                "approved": status_counts.get('approved', 0),
                "rejected": status_counts.get('rejected', 0),
                "expired": status_counts.get('expired', 0)
            },
            "pending_by_risk_level": {
                "High": risk_counts.get('High', 0),
                "Medium": risk_counts.get('Medium', 0),
                "Low": risk_counts.get('Low', 0)
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving recommendation stats: {str(e)}"
        )
