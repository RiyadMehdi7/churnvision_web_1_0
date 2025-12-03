"""
Churn Reasoning API Endpoints

Provides endpoints for the complete churn reasoning pipeline:
- Single employee reasoning calculation
- Batch reasoning calculation
- Component-level access (stages, rules, interviews)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.churn_reasoning_orchestrator import (
    churn_reasoning_orchestrator,
    ChurnReasoningResult
)
from app.services.behavioral_stage_service import behavioral_stage_service
from app.services.business_rule_service import business_rule_service
from app.services.interview_insight_service import interview_insight_service

router = APIRouter()


# ============ Pydantic Models ============

class ReasoningBreakdownResponse(BaseModel):
    """Breakdown of churn reasoning calculation"""
    ml_score: float
    ml_confidence: float
    ml_weight: float
    heuristic_score: float
    heuristic_confidence: float
    heuristic_weight: float
    stage_score: float
    stage_confidence: float
    stage_weight: float
    interview_adjustment: float
    interview_confidence: float
    final_score: float
    final_confidence: float
    calculation_formula: str
    weight_rationale: str


class MLResultResponse(BaseModel):
    """ML prediction result"""
    score: float
    confidence: float
    shap_values: Dict[str, float] = {}
    contributing_factors: List[str] = []


class StageResultResponse(BaseModel):
    """Behavioral stage result"""
    stage_name: str
    stage_score: float
    confidence: float
    indicators: List[str] = []
    risk_factors: List[str] = []
    recommendations: List[str] = []


class HeuristicResultResponse(BaseModel):
    """Heuristic evaluation result"""
    heuristic_score: float
    confidence: float
    coverage: float
    triggered_rules: List[Dict[str, Any]] = []
    alerts: List[str] = []
    total_rules_evaluated: int


class InterviewResultResponse(BaseModel):
    """Interview analysis result"""
    total_interviews: int
    recent_interviews: int
    average_sentiment: float
    risk_adjustment: float
    confidence: float
    summary: str
    recommendations: List[str] = []


class ChurnReasoningResponse(BaseModel):
    """Complete churn reasoning response"""
    hr_code: str
    final_churn_risk: float
    risk_level: str
    confidence: float
    reasoning_summary: str
    recommendations: List[str]
    alerts: List[str]
    breakdown: ReasoningBreakdownResponse
    ml_result: MLResultResponse
    stage_result: StageResultResponse
    heuristic_result: HeuristicResultResponse
    interview_result: Optional[InterviewResultResponse]
    calculated_at: datetime
    cache_valid_until: datetime


class BatchReasoningRequest(BaseModel):
    """Request for batch reasoning calculation"""
    hr_codes: List[str] = Field(..., max_length=100, description="List of employee HR codes")
    force_refresh: bool = Field(False, description="Ignore cache and recalculate")
    max_parallel: int = Field(6, ge=1, le=20, description="Max parallel calculations")


class BatchReasoningResponse(BaseModel):
    """Response for batch reasoning calculation"""
    total_requested: int
    total_processed: int
    total_errors: int
    results: Dict[str, ChurnReasoningResponse]
    errors: Dict[str, str]
    processing_time_ms: float


# ============ Helper Functions ============

def _convert_result_to_response(result: ChurnReasoningResult) -> ChurnReasoningResponse:
    """Convert internal result to API response"""
    return ChurnReasoningResponse(
        hr_code=result.hr_code,
        final_churn_risk=result.final_churn_risk,
        risk_level=result.risk_level,
        confidence=result.confidence,
        reasoning_summary=result.reasoning_summary,
        recommendations=result.recommendations,
        alerts=result.alerts,
        breakdown=ReasoningBreakdownResponse(
            ml_score=result.breakdown.ml_score,
            ml_confidence=result.breakdown.ml_confidence,
            ml_weight=result.breakdown.ml_weight,
            heuristic_score=result.breakdown.heuristic_score,
            heuristic_confidence=result.breakdown.heuristic_confidence,
            heuristic_weight=result.breakdown.heuristic_weight,
            stage_score=result.breakdown.stage_score,
            stage_confidence=result.breakdown.stage_confidence,
            stage_weight=result.breakdown.stage_weight,
            interview_adjustment=result.breakdown.interview_adjustment,
            interview_confidence=result.breakdown.interview_confidence,
            final_score=result.breakdown.final_score,
            final_confidence=result.breakdown.final_confidence,
            calculation_formula=result.breakdown.calculation_formula,
            weight_rationale=result.breakdown.weight_rationale
        ),
        ml_result=MLResultResponse(
            score=result.ml_result.score,
            confidence=result.ml_result.confidence,
            shap_values=result.ml_result.shap_values,
            contributing_factors=result.ml_result.contributing_factors
        ),
        stage_result=StageResultResponse(
            stage_name=result.stage_result.stage_name,
            stage_score=result.stage_result.stage_score,
            confidence=result.stage_result.confidence,
            indicators=result.stage_result.indicators,
            risk_factors=result.stage_result.risk_factors,
            recommendations=result.stage_result.recommendations
        ),
        heuristic_result=HeuristicResultResponse(
            heuristic_score=result.heuristic_result.heuristic_score,
            confidence=result.heuristic_result.confidence,
            coverage=result.heuristic_result.coverage,
            triggered_rules=[
                {
                    'rule_id': r.rule_id,
                    'rule_name': r.rule_name,
                    'adjustment': r.adjustment,
                    'reason': r.reason
                }
                for r in result.heuristic_result.triggered_rules
            ],
            alerts=result.heuristic_result.alerts,
            total_rules_evaluated=result.heuristic_result.total_rules_evaluated
        ),
        interview_result=InterviewResultResponse(
            total_interviews=result.interview_result.total_interviews,
            recent_interviews=result.interview_result.recent_interviews,
            average_sentiment=result.interview_result.average_sentiment,
            risk_adjustment=result.interview_result.risk_adjustment,
            confidence=result.interview_result.confidence,
            summary=result.interview_result.summary,
            recommendations=result.interview_result.recommendations
        ) if result.interview_result else None,
        calculated_at=result.calculated_at,
        cache_valid_until=result.cache_valid_until
    )


# ============ Endpoints ============

@router.get("/calculate/{hr_code}", response_model=ChurnReasoningResponse)
async def calculate_reasoning(
    hr_code: str,
    force_refresh: bool = Query(False, description="Ignore cache and recalculate"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate complete churn reasoning for a single employee.

    This runs the full 5-step pipeline:
    1. ML Prediction
    2. Business Rules (Heuristics)
    3. Behavioral Stage Classification
    4. Interview Analysis
    5. Dynamic Weight Combination

    The result includes a detailed breakdown of how the final score was calculated.
    """
    try:
        result = await churn_reasoning_orchestrator.calculate_churn_reasoning(
            hr_code=hr_code,
            db=db,
            force_refresh=force_refresh
        )
        return _convert_result_to_response(result)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating reasoning: {str(e)}"
        )


@router.post("/calculate/batch", response_model=BatchReasoningResponse)
async def calculate_batch_reasoning(
    request: BatchReasoningRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate churn reasoning for multiple employees in parallel.

    Supports up to 100 employees per request with configurable parallelism.
    """
    import time
    start_time = time.time()

    try:
        results_dict = await churn_reasoning_orchestrator.calculate_batch(
            hr_codes=request.hr_codes,
            db=db,
            max_parallel=request.max_parallel,
            force_refresh=request.force_refresh
        )

        # Convert results
        converted_results = {}
        errors = {}

        for hr_code in request.hr_codes:
            if hr_code in results_dict:
                converted_results[hr_code] = _convert_result_to_response(results_dict[hr_code])
            else:
                errors[hr_code] = "Failed to calculate reasoning"

        processing_time = (time.time() - start_time) * 1000

        return BatchReasoningResponse(
            total_requested=len(request.hr_codes),
            total_processed=len(converted_results),
            total_errors=len(errors),
            results=converted_results,
            errors=errors,
            processing_time_ms=processing_time
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error in batch calculation: {str(e)}"
        )


@router.get("/stage/{hr_code}", response_model=StageResultResponse)
async def get_behavioral_stage(
    hr_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get behavioral stage classification for an employee.

    Returns the stage (Onboarding, Early Career, Established, Senior, Veteran)
    along with stage-specific risk factors and recommendations.
    """
    from sqlalchemy import select, desc
    from app.models.hr_data import HRDataInput

    # Get employee data
    query = select(HRDataInput).where(
        HRDataInput.hr_code == hr_code
    ).order_by(desc(HRDataInput.report_date)).limit(1)

    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee_data = {
        'hr_code': employee.hr_code,
        'tenure': float(employee.tenure) if employee.tenure else 0,
        'position': employee.position,
        'status': employee.status,
        'employee_cost': float(employee.employee_cost) if employee.employee_cost else 0
    }

    stage_result = await behavioral_stage_service.classify_employee(employee_data, 0.0, db)

    return StageResultResponse(
        stage_name=stage_result.stage_name,
        stage_score=stage_result.stage_score,
        confidence=stage_result.confidence,
        indicators=stage_result.indicators,
        risk_factors=stage_result.risk_factors,
        recommendations=stage_result.recommendations
    )


@router.get("/heuristics/{hr_code}", response_model=HeuristicResultResponse)
async def get_heuristic_evaluation(
    hr_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Evaluate business rules for an employee.

    Returns which rules were triggered and their risk adjustments.
    """
    from sqlalchemy import select, desc
    from app.models.hr_data import HRDataInput

    # Get employee data
    query = select(HRDataInput).where(
        HRDataInput.hr_code == hr_code
    ).order_by(desc(HRDataInput.report_date)).limit(1)

    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee_data = {
        'hr_code': employee.hr_code,
        'tenure': float(employee.tenure) if employee.tenure else 0,
        'position': employee.position,
        'status': employee.status,
        'structure_name': employee.structure_name,
        'employee_cost': float(employee.employee_cost) if employee.employee_cost else 0
    }

    heuristic_result = await business_rule_service.evaluate_employee(employee_data, 0.3, db)

    return HeuristicResultResponse(
        heuristic_score=heuristic_result.heuristic_score,
        confidence=heuristic_result.confidence,
        coverage=heuristic_result.coverage,
        triggered_rules=[
            {
                'rule_id': r.rule_id,
                'rule_name': r.rule_name,
                'adjustment': r.adjustment,
                'reason': r.reason
            }
            for r in heuristic_result.triggered_rules
        ],
        alerts=heuristic_result.alerts,
        total_rules_evaluated=heuristic_result.total_rules_evaluated
    )


@router.get("/interviews/{hr_code}", response_model=InterviewResultResponse)
async def get_interview_analysis(
    hr_code: str,
    months_lookback: int = Query(24, ge=1, le=60),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyze interview data for an employee.

    Returns sentiment analysis, risk signals, and recommendations
    based on stay/exit interview notes.
    """
    interview_result = await interview_insight_service.analyze_employee(
        hr_code=hr_code,
        db=db,
        months_lookback=months_lookback
    )

    return InterviewResultResponse(
        total_interviews=interview_result.total_interviews,
        recent_interviews=interview_result.recent_interviews,
        average_sentiment=interview_result.average_sentiment,
        risk_adjustment=interview_result.risk_adjustment,
        confidence=interview_result.confidence,
        summary=interview_result.summary,
        recommendations=interview_result.recommendations
    )


@router.get("/rules")
async def list_business_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all active business rules.

    Returns rule definitions including conditions and adjustments.
    """
    rules = await business_rule_service._get_rules(db)
    summary = business_rule_service.get_rule_summary(rules)

    return {
        "rules": rules,
        "summary": summary
    }


@router.get("/stages")
async def list_behavioral_stages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all behavioral stage definitions.

    Returns stage definitions with tenure ranges and base risk scores.
    """
    stages = await behavioral_stage_service._get_stages(db)

    return {
        "stages": stages,
        "total": len(stages)
    }


@router.get("/summary")
async def get_reasoning_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get summary of the reasoning system configuration.

    Returns overview of weights, rules, and stages.
    """
    rules = await business_rule_service._get_rules(db)
    stages = await behavioral_stage_service._get_stages(db)

    return {
        "weights": {
            "base_weights": churn_reasoning_orchestrator.BASE_WEIGHTS,
            "note": "Actual weights are dynamically adjusted based on component confidence"
        },
        "risk_thresholds": churn_reasoning_orchestrator.RISK_THRESHOLDS,
        "components": {
            "ml_prediction": "ChurnOutput table with XGBoost/RF predictions",
            "business_rules": f"{len(rules)} active rules",
            "behavioral_stages": f"{len(stages)} defined stages",
            "interview_analysis": "Sentiment analysis on InterviewData"
        },
        "cache_ttl_hours": churn_reasoning_orchestrator.CACHE_TTL_HOURS
    }
