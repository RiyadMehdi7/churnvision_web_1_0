"""
Atlas Scenario API Endpoints

Provides what-if scenario simulation for employee retention analysis.
Allows users to model the impact of interventions before implementing them.

Includes both:
1. Heuristic-based scenarios (legacy /scenario, /batch endpoints)
2. TRUE counterfactual analysis using ML model perturbation (/counterfactual endpoints)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.api.helpers import get_latest_employee_by_hr_code, get_latest_churn_output
from app.models.user import User
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput
from app.schemas.atlas import (
    AtlasScenarioRequest,
    AtlasScenarioResponse,
    AtlasBatchScenarioRequest,
    AtlasBatchScenarioResponse,
    AtlasModificationsResponse,
    AtlasModificationOption,
    # Counterfactual schemas
    PerturbableFeature,
    EmployeeMlFeaturesResponse,
    CounterfactualRequest,
    CounterfactualBatchRequest,
    CounterfactualResponse,
    CounterfactualBatchResponse,
)
from app.services.atlas_scenario_service import atlas_scenario_service
from app.services.counterfactual_atlas_service import counterfactual_atlas_service

router = APIRouter()


@router.get("/modifications", response_model=AtlasModificationsResponse)
async def get_available_modifications(
    employee_id: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of available feature modifications for scenario simulation.

    If employee_id is provided, returns modifications relevant to that employee's data.
    Otherwise returns all possible modifications (core + optional).

    Returns metadata about each modifiable feature including:
    - Data type (slider, currency, boolean, number)
    - Expected impact on churn
    - Estimated cost
    - Current value (if employee_id provided)
    """
    employee_features = None
    current_values = {}

    if employee_id:
        # Get employee data to determine available modifications
        employee = await get_latest_employee_by_hr_code(db, employee_id)
        if employee:
            employee_features = {
                'hr_code': employee.hr_code,
                'tenure': float(employee.tenure) if employee.tenure else 0,
                'employee_cost': float(employee.employee_cost) if employee.employee_cost else 50000,
                'additional_data': employee.additional_data or {}
            }
            # Build current values dict
            current_values = {
                'employee_cost': employee_features['employee_cost'],
                'tenure': employee_features['tenure'],
            }
            if employee.additional_data:
                current_values.update(employee.additional_data)

    modifications_data = atlas_scenario_service.get_available_modifications(employee_features)

    # Add current values to modifications
    for mod in modifications_data:
        if mod['feature'] in current_values:
            mod['current_value'] = current_values[mod['feature']]

    modifications = [
        AtlasModificationOption(**mod)
        for mod in modifications_data
    ]

    return AtlasModificationsResponse(modifications=modifications)


@router.post("/scenario", response_model=AtlasScenarioResponse)
async def simulate_scenario(
    request: AtlasScenarioRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate a single what-if scenario for an employee.

    Example modifications:
    - {"employee_cost": 88000} - Simulate 10% salary increase
    - {"satisfaction_level": 0.8} - Simulate improved satisfaction
    - {"promotion_last_5years": 1} - Simulate giving a promotion

    Returns comparison of baseline vs scenario metrics including
    churn probability, ELTV, and implied ROI.
    """
    # Get employee data
    employee = await get_latest_employee_by_hr_code(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get current churn probability
    churn_data = await get_latest_churn_output(db, request.employee_id)
    base_churn_prob = float(churn_data.resign_proba) if churn_data else 0.3

    # Build base features dict
    base_features = {
        'hr_code': employee.hr_code,
        'full_name': employee.full_name,
        'structure_name': employee.structure_name,
        'position': employee.position,
        'status': employee.status,
        'tenure': float(employee.tenure) if employee.tenure else 0,
        'employee_cost': float(employee.employee_cost) if employee.employee_cost else 50000,
    }

    # Add any additional data from JSON field
    if employee.additional_data:
        base_features.update(employee.additional_data)

    # Run simulation
    result = await atlas_scenario_service.simulate_scenario(
        employee_id=request.employee_id,
        base_features=base_features,
        base_churn_prob=base_churn_prob,
        modifications=request.modifications,
        scenario_name=request.scenario_name,
        scenario_id=request.scenario_id
    )

    return AtlasScenarioResponse(
        scenario_name=result.scenario_name,
        scenario_id=result.scenario_id,
        baseline_churn_prob=result.baseline_churn_prob,
        baseline_risk_level=result.baseline_risk_level,
        baseline_eltv=result.baseline_eltv,
        scenario_churn_prob=result.scenario_churn_prob,
        scenario_risk_level=result.scenario_risk_level,
        scenario_eltv=result.scenario_eltv,
        churn_delta=result.churn_delta,
        eltv_delta=result.eltv_delta,
        implied_annual_cost=result.implied_annual_cost,
        implied_roi=result.implied_roi,
        baseline_survival_probs=result.baseline_survival_probs,
        scenario_survival_probs=result.scenario_survival_probs,
        modifications=result.modifications,
        simulated_at=result.simulated_at
    )


@router.post("/batch", response_model=AtlasBatchScenarioResponse)
async def simulate_batch_scenarios(
    request: AtlasBatchScenarioRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate multiple scenarios for side-by-side comparison.

    Each scenario should include:
    - name: Display name for the scenario
    - modifications: Dict of feature changes

    Returns all scenarios with comparison summary and best ROI recommendation.
    """
    # Get employee data
    employee = await get_latest_employee_by_hr_code(db, request.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get current churn probability
    churn_data = await get_latest_churn_output(db, request.employee_id)
    base_churn_prob = float(churn_data.resign_proba) if churn_data else 0.3

    # Build base features dict
    base_features = {
        'hr_code': employee.hr_code,
        'full_name': employee.full_name,
        'structure_name': employee.structure_name,
        'position': employee.position,
        'status': employee.status,
        'tenure': float(employee.tenure) if employee.tenure else 0,
        'employee_cost': float(employee.employee_cost) if employee.employee_cost else 50000,
    }

    if employee.additional_data:
        base_features.update(employee.additional_data)

    # Calculate baseline ELTV for reference
    from app.services.eltv_service import eltv_service
    position_level = eltv_service.estimate_position_level(
        position=employee.position,
        salary=base_features['employee_cost'],
        tenure=base_features['tenure']
    )
    baseline_eltv = eltv_service.calculate_eltv(
        annual_salary=base_features['employee_cost'],
        churn_probability=base_churn_prob,
        tenure_years=base_features['tenure'],
        position_level=position_level
    )

    # Run batch simulation
    results = await atlas_scenario_service.batch_scenarios(
        employee_id=request.employee_id,
        base_features=base_features,
        base_churn_prob=base_churn_prob,
        scenarios=request.scenarios
    )

    # Convert to response format
    scenario_responses = [
        AtlasScenarioResponse(
            scenario_name=r.scenario_name,
            scenario_id=r.scenario_id,
            baseline_churn_prob=r.baseline_churn_prob,
            baseline_risk_level=r.baseline_risk_level,
            baseline_eltv=r.baseline_eltv,
            scenario_churn_prob=r.scenario_churn_prob,
            scenario_risk_level=r.scenario_risk_level,
            scenario_eltv=r.scenario_eltv,
            churn_delta=r.churn_delta,
            eltv_delta=r.eltv_delta,
            implied_annual_cost=r.implied_annual_cost,
            implied_roi=r.implied_roi,
            baseline_survival_probs=r.baseline_survival_probs,
            scenario_survival_probs=r.scenario_survival_probs,
            modifications=r.modifications,
            simulated_at=r.simulated_at
        )
        for r in results
    ]

    # Find best scenario by ROI
    best_scenario = max(results, key=lambda r: r.implied_roi) if results else None
    best_scenario_id = best_scenario.scenario_id if best_scenario else None

    # Build comparison summary
    comparison_summary = {
        "total_scenarios": len(results),
        "best_roi_scenario": best_scenario_id,
        "best_roi_value": best_scenario.implied_roi if best_scenario else 0,
        "max_churn_reduction": min(r.churn_delta for r in results) if results else 0,
        "max_eltv_gain": max(r.eltv_delta for r in results) if results else 0,
        "avg_roi": sum(r.implied_roi for r in results) / len(results) if results else 0
    }

    return AtlasBatchScenarioResponse(
        employee_id=request.employee_id,
        employee_name=employee.full_name,
        current_churn_prob=base_churn_prob,
        current_eltv=baseline_eltv.eltv,
        scenarios=scenario_responses,
        best_scenario=best_scenario_id,
        comparison_summary=comparison_summary
    )


@router.get("/presets")
async def get_scenario_presets(
    current_user: User = Depends(get_current_user)
):
    """
    Get pre-built scenario templates for common interventions.

    These presets can be used as starting points for custom scenarios.
    """
    return {
        "presets": [
            {
                "id": "salary_5pct",
                "name": "Salary +5%",
                "description": "Modest salary increase",
                "modifications": {"employee_cost_pct": 1.05},
                "typical_roi": "150-250%"
            },
            {
                "id": "salary_10pct",
                "name": "Salary +10%",
                "description": "Significant salary increase",
                "modifications": {"employee_cost_pct": 1.10},
                "typical_roi": "200-350%"
            },
            {
                "id": "promotion",
                "name": "Promotion",
                "description": "Promote to next level",
                "modifications": {"promotion_last_5years": 1},
                "typical_roi": "300-500%"
            },
            {
                "id": "workload_reduction",
                "name": "Reduce Workload",
                "description": "Reduce monthly hours by 20%",
                "modifications": {"average_monthly_hours_pct": 0.80},
                "typical_roi": "100-200%"
            },
            {
                "id": "engagement_initiative",
                "name": "Engagement Initiative",
                "description": "Targeted satisfaction improvement",
                "modifications": {"satisfaction_level": 0.75},
                "typical_roi": "250-400%"
            },
            {
                "id": "comprehensive",
                "name": "Comprehensive Package",
                "description": "Combined intervention",
                "modifications": {
                    "employee_cost_pct": 1.08,
                    "promotion_last_5years": 1,
                    "satisfaction_level": 0.80
                },
                "typical_roi": "400-600%"
            }
        ]
    }


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
        # Get ML features from service
        features = await counterfactual_atlas_service.get_employee_ml_features(
            db, employee_id, dataset_id
        )

        # Get employee for name and salary
        employee = await get_latest_employee_by_hr_code(db, employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        # Get perturbable feature metadata
        perturbable = counterfactual_atlas_service.get_perturbable_features(features)

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

    Key differences from /scenario:
    - Uses real ML model predictions instead of FEATURE_IMPACTS heuristics
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
        result = await counterfactual_atlas_service.simulate_counterfactual(
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
        results = await counterfactual_atlas_service.batch_counterfactuals(
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
