"""
Atlas Counterfactual API Endpoints

Provides TRUE counterfactual analysis using ML model perturbation.
This allows users to model the impact of interventions using real model predictions.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps import get_current_user, get_db
from app.api.helpers import get_latest_employee_by_hr_code
from app.models.user import User
from app.schemas.atlas import (
    # Counterfactual schemas only
    PerturbableFeature,
    EmployeeMlFeaturesResponse,
    CounterfactualRequest,
    CounterfactualBatchRequest,
    CounterfactualResponse,
    CounterfactualBatchResponse,
)
from app.services.ml.churn_prediction_service import churn_prediction_service

router = APIRouter()


# =============================================================================
# Counterfactual Endpoints (TRUE ML Model Perturbation)
# =============================================================================

@router.get("/employee-features/{employee_id}", response_model=EmployeeMlFeaturesResponse)
async def get_employee_ml_features(
    employee_id: str,
    dataset_id: Optional[str] = Query(None, description="Dataset ID for model selection"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the ML features for an employee that can be perturbed in counterfactual analysis.

    Returns:
    - Current values for all 9 EmployeeChurnFeatures
    - Metadata for each perturbable feature (type, min, max, etc.)
    - Employee's annual salary for ELTV calculations

    These features are derived from:
    1. HRDataInput.additional_data (if available)
    2. Intelligent defaults based on HR fields (tenure, employee_cost, structure_name)
    """
    try:
        # Get ML features from unified service
        features = await churn_prediction_service.get_employee_ml_features(
            db, employee_id, dataset_id
        )

        # Get employee for name and salary
        employee = await get_latest_employee_by_hr_code(db, employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        # Get perturbable feature metadata
        perturbable = churn_prediction_service.get_perturbable_features(features)

        # Convert to schema format
        perturbable_features = [
            PerturbableFeature(
                name=p.name,
                label=p.label,
                current_value=p.current_value,
                type=p.type,
                min_value=p.min_value,
                max_value=p.max_value,
                step=p.step,
                options=p.options,
                description=p.description,
                impact_direction=p.impact_direction,
            )
            for p in perturbable
        ]

        return EmployeeMlFeaturesResponse(
            employee_id=employee_id,
            employee_name=employee.full_name,
            dataset_id=dataset_id,
            features=features,
            perturbable_features=perturbable_features,
            annual_salary=float(employee.employee_cost) if employee.employee_cost else 70000.0,
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/counterfactual", response_model=CounterfactualResponse)
async def run_counterfactual(
    request: CounterfactualRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Run TRUE counterfactual simulation using ML model perturbation.

    This endpoint:
    1. Takes the employee's base ML features
    2. Applies the requested modifications
    3. Runs the ACTUAL trained ML model on both baseline and modified features
    4. Returns real model predictions (not heuristic estimates)

    Features:
    - Uses real ML model predictions
    - Returns SHAP-based contributing factors from the actual model
    - Provides model confidence scores for both baseline and scenario
    - Works with EmployeeChurnFeatures (the 9 features the model was trained on)

    Example request:
    ```json
    {
        "employee_id": "EMP001",
        "base_features": {
            "satisfaction_level": 0.4,
            "last_evaluation": 0.7,
            "number_project": 3,
            "average_monthly_hours": 200,
            "time_spend_company": 3,
            "work_accident": false,
            "promotion_last_5years": false,
            "department": "technical",
            "salary_level": "medium"
        },
        "modifications": {
            "satisfaction_level": 0.8,
            "promotion_last_5years": true
        },
        "scenario_name": "Improve Satisfaction + Promote"
    }
    ```
    """
    try:
        result = await churn_prediction_service.simulate_counterfactual(
            employee_id=request.employee_id,
            base_features=request.base_features,
            modifications=request.modifications,
            dataset_id=request.dataset_id,
            scenario_name=request.scenario_name,
            scenario_id=request.scenario_id,
            annual_salary=request.annual_salary,
        )

        return CounterfactualResponse(
            scenario_name=result.scenario_name,
            scenario_id=result.scenario_id,
            baseline_churn_prob=result.baseline_churn_prob,
            baseline_risk_level=result.baseline_risk_level,
            baseline_eltv=result.baseline_eltv,
            baseline_confidence=result.baseline_confidence,
            baseline_factors=result.baseline_factors,
            scenario_churn_prob=result.scenario_churn_prob,
            scenario_risk_level=result.scenario_risk_level,
            scenario_eltv=result.scenario_eltv,
            scenario_confidence=result.scenario_confidence,
            scenario_factors=result.scenario_factors,
            churn_delta=result.churn_delta,
            eltv_delta=result.eltv_delta,
            implied_annual_cost=result.implied_annual_cost,
            implied_roi=result.implied_roi,
            baseline_survival_probs=result.baseline_survival_probs,
            scenario_survival_probs=result.scenario_survival_probs,
            modifications=result.modifications,
            simulated_at=result.simulated_at,
            prediction_method=result.prediction_method,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Counterfactual simulation failed: {str(e)}")


@router.post("/counterfactual/batch", response_model=CounterfactualBatchResponse)
async def run_counterfactual_batch(
    request: CounterfactualBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Run multiple counterfactual scenarios for side-by-side comparison.

    Each scenario should include:
    - name: Display name for the scenario
    - modifications: Dict of feature modifications

    Returns all scenarios with real ML predictions and best ROI recommendation.

    Example request:
    ```json
    {
        "employee_id": "EMP001",
        "base_features": {...},
        "scenarios": [
            {"name": "Improve Satisfaction", "modifications": {"satisfaction_level": 0.8}},
            {"name": "Reduce Workload", "modifications": {"average_monthly_hours": 150}},
            {"name": "Promote", "modifications": {"promotion_last_5years": true}}
        ]
    }
    ```
    """
    try:
        # Get employee for name
        employee = await get_latest_employee_by_hr_code(db, request.employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        # Run batch counterfactuals
        results = await churn_prediction_service.batch_counterfactuals(
            employee_id=request.employee_id,
            base_features=request.base_features,
            scenarios=request.scenarios,
            dataset_id=request.dataset_id,
            annual_salary=request.annual_salary,
        )

        # Convert to response format
        scenario_responses = [
            CounterfactualResponse(
                scenario_name=r.scenario_name,
                scenario_id=r.scenario_id,
                baseline_churn_prob=r.baseline_churn_prob,
                baseline_risk_level=r.baseline_risk_level,
                baseline_eltv=r.baseline_eltv,
                baseline_confidence=r.baseline_confidence,
                baseline_factors=r.baseline_factors,
                scenario_churn_prob=r.scenario_churn_prob,
                scenario_risk_level=r.scenario_risk_level,
                scenario_eltv=r.scenario_eltv,
                scenario_confidence=r.scenario_confidence,
                scenario_factors=r.scenario_factors,
                churn_delta=r.churn_delta,
                eltv_delta=r.eltv_delta,
                implied_annual_cost=r.implied_annual_cost,
                implied_roi=r.implied_roi,
                baseline_survival_probs=r.baseline_survival_probs,
                scenario_survival_probs=r.scenario_survival_probs,
                modifications=r.modifications,
                simulated_at=r.simulated_at,
                prediction_method=r.prediction_method,
            )
            for r in results
        ]

        # Find best scenario by ROI
        best_scenario = max(results, key=lambda r: r.implied_roi) if results else None
        best_scenario_id = best_scenario.scenario_id if best_scenario else None

        # Use baseline from first result (all share same baseline)
        baseline = results[0] if results else None

        # Build comparison summary
        comparison_summary = {
            "total_scenarios": len(results),
            "best_roi_scenario": best_scenario_id,
            "best_roi_value": best_scenario.implied_roi if best_scenario else 0,
            "max_churn_reduction": min(r.churn_delta for r in results) if results else 0,
            "max_eltv_gain": max(r.eltv_delta for r in results) if results else 0,
            "avg_roi": sum(r.implied_roi for r in results) / len(results) if results else 0,
            "prediction_method": "model",  # Always model-based for counterfactual
        }

        return CounterfactualBatchResponse(
            employee_id=request.employee_id,
            employee_name=employee.full_name,
            current_churn_prob=baseline.baseline_churn_prob if baseline else 0.3,
            current_eltv=baseline.baseline_eltv if baseline else 0.0,
            scenarios=scenario_responses,
            best_scenario=best_scenario_id,
            comparison_summary=comparison_summary,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch counterfactual failed: {str(e)}")


@router.get("/counterfactual/presets")
async def get_counterfactual_presets(
    current_user: User = Depends(get_current_user)
):
    """
    Get pre-built scenario templates for counterfactual analysis.

    These presets work with the 9 EmployeeChurnFeatures and can be
    used as starting points for custom scenarios.
    """
    return {
        "presets": [
            {
                "id": "satisfaction_boost",
                "name": "Satisfaction Boost",
                "description": "Improve satisfaction to 0.8",
                "modifications": {"satisfaction_level": 0.8},
                "impact": "Targets the strongest predictor of churn"
            },
            {
                "id": "workload_reduction",
                "name": "Reduce Workload",
                "description": "Reduce monthly hours to 160",
                "modifications": {"average_monthly_hours": 160},
                "impact": "Reduces burnout risk"
            },
            {
                "id": "promotion",
                "name": "Give Promotion",
                "description": "Promote the employee",
                "modifications": {"promotion_last_5years": True},
                "impact": "Significant retention boost"
            },
            {
                "id": "salary_increase",
                "name": "Salary Increase",
                "description": "Move to high salary tier",
                "modifications": {"salary_level": "high"},
                "impact": "Addresses compensation concerns"
            },
            {
                "id": "project_balance",
                "name": "Balance Projects",
                "description": "Set projects to optimal range (3-4)",
                "modifications": {"number_project": 4},
                "impact": "Improves workload balance"
            },
            {
                "id": "comprehensive",
                "name": "Comprehensive Package",
                "description": "Combined high-impact interventions",
                "modifications": {
                    "satisfaction_level": 0.8,
                    "promotion_last_5years": True,
                    "average_monthly_hours": 160
                },
                "impact": "Maximum retention improvement"
            }
        ]
    }
