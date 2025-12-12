"""
Playground API Endpoints

These endpoints power the ELTV Treatment Playground, providing:
- Employee data with calculated ELTV and survival probabilities
- AI-generated treatment suggestions
- Treatment simulation and application
- What-if scenario analysis
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Dict, Any

from app.api.deps import get_current_user, get_db
from app.api.helpers import get_latest_employee_by_hr_code, get_latest_churn_output, extract_employee_values
from app.models.user import User
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.schemas.playground import (
    PlaygroundEmployeeData,
    ELTVMetrics,
    TreatmentSuggestion,
    ApplyTreatmentRequest,
    ApplyTreatmentResult,
    ManualSimulationRequest,
    ManualSimulationResponse
)
from app.services.eltv_service import eltv_service
from app.services.treatment_service import treatment_validation_service

router = APIRouter()


@router.get("/data/{employee_id}", response_model=PlaygroundEmployeeData)
async def get_playground_data(
    employee_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get comprehensive data for playground (employee + churn + ELTV with Weibull survival).

    This endpoint calculates ELTV using proper Weibull survival curves and returns
    month-by-month survival probabilities for visualization.
    """

    # 1. Get Employee Data (get most recent if duplicates exist)
    employee = await get_latest_employee_by_hr_code(db, employee_id)

    # 2. Get Churn Data
    churn_data = await get_latest_churn_output(db, employee_id)

    # 3. Get Reasoning Data (optional - for SHAP values)
    query = select(ChurnReasoning).where(ChurnReasoning.hr_code == employee_id)
    result = await db.execute(query)
    reasoning = result.scalar_one_or_none()

    # Extract values
    churn_prob = float(churn_data.resign_proba) if churn_data else 0.3
    salary = float(employee.employee_cost) if employee.employee_cost else 50000
    tenure = float(employee.tenure) if employee.tenure else 0

    # Estimate position level from available data
    position_level = eltv_service.estimate_position_level(
        position=employee.position,
        salary=salary,
        tenure=tenure
    )

    # 4. Calculate ELTV using Weibull survival curves
    eltv_result = eltv_service.calculate_eltv(
        annual_salary=salary,
        churn_probability=churn_prob,
        tenure_years=tenure,
        position_level=position_level
    )

    # 5. Construct employee features
    current_features = {
        "hr_code": employee.hr_code,
        "full_name": employee.full_name,
        "structure_name": employee.structure_name,
        "position": employee.position,
        "status": employee.status,
        "tenure": tenure,
        "employee_cost": salary,
        "report_date": str(employee.report_date),
        "normalized_position_level": position_level,
        "termination_date": str(employee.termination_date) if employee.termination_date else None
    }

    # 6. Get SHAP values if available
    shap_values = {}
    if churn_data and churn_data.shap_values:
        shap_values = churn_data.shap_values
    elif reasoning and reasoning.shap_values:
        shap_values = reasoning.shap_values

    # 7. Construct ELTV metrics
    eltv_metrics = ELTVMetrics(
        eltv=eltv_result.eltv,
        expected_tenure_months=eltv_result.expected_tenure_months,
        replacement_cost=eltv_result.replacement_cost,
        revenue_multiplier=eltv_result.revenue_multiplier,
        discount_rate=eltv_result.discount_rate,
        horizon_months=eltv_result.horizon_months
    )

    return PlaygroundEmployeeData(
        employee_id=employee.hr_code,
        current_features=current_features,
        current_churn_probability=churn_prob,
        current_eltv=eltv_result.eltv,
        current_survival_probabilities=eltv_result.survival_probabilities,
        shap_values=shap_values,
        normalized_position_level=position_level,
        eltv_metrics=eltv_metrics
    )


@router.get("/treatments/{employee_id}", response_model=List[TreatmentSuggestion])
async def get_treatment_suggestions(
    employee_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get AI-generated treatment suggestions for an employee.

    Treatments are ranked by:
    - Feasibility (budget, risk alignment, constraints)
    - Expected effect size
    - ROI (ELTV gain vs treatment cost)
    """

    # Get employee and churn data
    employee = await get_latest_employee_by_hr_code(db, employee_id)
    churn_data = await get_latest_churn_output(db, employee_id)

    # Extract values with defaults
    values = extract_employee_values(employee, churn_data)
    churn_prob = values['churn_prob']
    salary = values['salary']
    tenure = values['tenure']

    # Build employee data dict for treatment service
    employee_data = {
        'hr_code': employee.hr_code,
        'full_name': employee.full_name,
        'structure_name': employee.structure_name,
        'position': employee.position,
        'status': employee.status,
        'tenure': tenure,
        'employee_cost': salary,
    }

    # Generate treatment suggestions using the service
    suggestions = await treatment_validation_service.generate_treatment_suggestions(
        db=db,
        employee_hr_code=employee_id,
        employee_data=employee_data,
        churn_probability=churn_prob,
        max_suggestions=6
    )

    # Convert to API response format
    result_suggestions = []
    for s in suggestions:
        result_suggestions.append(TreatmentSuggestion(
            id=s.treatment_id,
            name=s.name,
            description=s.description,
            cost=s.cost,
            effectSize=s.effect_size,
            timeToEffect=s.time_to_effect,
            projected_churn_prob_change=s.projected_churn_change,
            projected_post_eltv=s.projected_post_eltv,
            projected_roi=s.projected_roi,
            riskLevels=s.risk_levels,
            explanation=s.explanation
        ))

    return result_suggestions


@router.post("/simulate", response_model=ApplyTreatmentResult)
async def apply_treatment(
    request: ApplyTreatmentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate applying a treatment to an employee.

    This calculates the expected outcomes including:
    - New churn probability after treatment
    - ELTV change (using Weibull survival curves)
    - ROI of the treatment
    - Updated survival probabilities
    """

    try:
        # Use the treatment service to simulate application
        result = await treatment_validation_service.apply_treatment_simulation(
            db=db,
            employee_hr_code=request.employee_id,
            treatment_id=request.treatment_id
        )

        # Convert ROI to float (handle infinity)
        roi_value = result['roi']
        if isinstance(roi_value, float) and (roi_value == float('inf') or roi_value == float('-inf')):
            roi_value = 999.99 if roi_value > 0 else -999.99

        return ApplyTreatmentResult(
            employee_id=result['employee_id'],
            eltv_pre_treatment=result['eltv_pre_treatment'],
            eltv_post_treatment=result['eltv_post_treatment'],
            treatment_effect_eltv=result['treatment_effect_eltv'],
            treatment_cost=result['treatment_cost'],
            roi=roi_value,
            pre_churn_probability=result['pre_churn_probability'],
            post_churn_probability=result['post_churn_probability'],
            new_survival_probabilities=result['new_survival_probabilities'],
            applied_treatment=result['applied_treatment']
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error simulating treatment: {str(e)}"
        )


@router.post("/manual-simulate", response_model=ManualSimulationResponse)
async def manual_simulate(
    request: ManualSimulationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Simulate churn with manual feature changes (What-If analysis).

    This allows users to see how changes to employee attributes
    (salary, tenure, etc.) would affect their churn probability.
    """

    # Get current churn probability
    query = select(ChurnOutput).where(
        ChurnOutput.hr_code == request.employee_id
    ).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()

    current_prob = float(churn_data.resign_proba) if churn_data else 0.5
    new_prob = current_prob

    changes = request.changed_features

    # Apply heuristic adjustments based on feature changes
    # In a production system, you would re-run the ML model with modified features

    # Tenure adjustment
    if 'tenure' in changes:
        new_tenure = float(changes['tenure'])
        # Longer tenure generally means lower churn
        if new_tenure > 3:
            new_prob *= 0.9
        elif new_tenure > 5:
            new_prob *= 0.85

    # Salary adjustment
    if 'employee_cost' in changes:
        new_salary = float(changes['employee_cost'])
        # Higher salary generally means lower churn
        if new_salary > 100000:
            new_prob *= 0.85
        elif new_salary > 75000:
            new_prob *= 0.9

    # Satisfaction level adjustment
    if 'satisfaction_level' in changes:
        satisfaction = float(changes['satisfaction_level'])
        if satisfaction > 0.8:
            new_prob *= 0.7
        elif satisfaction > 0.6:
            new_prob *= 0.85
        elif satisfaction < 0.4:
            new_prob *= 1.3

    # Promotion adjustment
    if changes.get('promotion_last_5years') == 1:
        new_prob *= 0.85

    # Clamp probability
    new_prob = max(0.01, min(0.99, new_prob))

    delta = new_prob - current_prob

    # Determine risk level
    if new_prob >= 0.7:
        risk_level = "High"
    elif new_prob >= 0.4:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return ManualSimulationResponse(
        new_churn_probability=new_prob,
        new_risk_level=risk_level,
        delta=delta
    )


@router.get("/eltv/{employee_id}")
async def get_eltv_details(
    employee_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed ELTV breakdown for an employee.

    Returns comprehensive ELTV metrics including:
    - Full 24-month survival curve
    - Expected tenure
    - Replacement cost
    - Revenue multiplier used
    """

    # Get employee
    query = select(HRDataInput).where(
        HRDataInput.hr_code == employee_id
    ).order_by(desc(HRDataInput.report_date)).limit(1)
    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get churn data
    query = select(ChurnOutput).where(
        ChurnOutput.hr_code == employee_id
    ).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()

    churn_prob = float(churn_data.resign_proba) if churn_data else 0.3
    salary = float(employee.employee_cost) if employee.employee_cost else 50000
    tenure = float(employee.tenure) if employee.tenure else 0

    position_level = eltv_service.estimate_position_level(
        position=employee.position,
        salary=salary,
        tenure=tenure
    )

    # Calculate ELTV
    eltv_result = eltv_service.calculate_eltv(
        annual_salary=salary,
        churn_probability=churn_prob,
        tenure_years=tenure,
        position_level=position_level
    )

    return {
        "employee_id": employee_id,
        "annual_salary": salary,
        "churn_probability": churn_prob,
        "tenure_years": tenure,
        "position_level": position_level,
        "eltv": eltv_result.eltv,
        "eltv_category": eltv_service.convert_eltv_to_category(eltv_result.eltv),
        "survival_probabilities": eltv_result.survival_probabilities,
        "expected_tenure_months": eltv_result.expected_tenure_months,
        "replacement_cost": eltv_result.replacement_cost,
        "revenue_multiplier": eltv_result.revenue_multiplier,
        "discount_rate": eltv_result.discount_rate,
        "horizon_months": eltv_result.horizon_months
    }


@router.post("/compare-scenarios")
async def compare_treatment_scenarios(
    employee_id: str,
    treatment_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Compare multiple treatment scenarios for an employee.

    Useful for side-by-side comparison of different treatment options.
    """

    if len(treatment_ids) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 treatments can be compared at once"
        )

    scenarios = []

    for treatment_id in treatment_ids:
        try:
            result = await treatment_validation_service.apply_treatment_simulation(
                db=db,
                employee_hr_code=employee_id,
                treatment_id=treatment_id
            )
            scenarios.append({
                "treatment_id": treatment_id,
                "treatment_name": result['treatment_name'],
                "treatment_cost": result['treatment_cost'],
                "eltv_gain": result['treatment_effect_eltv'],
                "churn_reduction": result['pre_churn_probability'] - result['post_churn_probability'],
                "roi": result['roi'] if isinstance(result['roi'], (int, float)) else 0,
                "post_eltv": result['eltv_post_treatment'],
                "survival_probabilities": result['new_survival_probabilities']
            })
        except ValueError:
            scenarios.append({
                "treatment_id": treatment_id,
                "error": "Treatment not found"
            })

    # Sort by ROI (highest first)
    scenarios.sort(key=lambda x: x.get('roi', 0), reverse=True)

    return {
        "employee_id": employee_id,
        "scenarios": scenarios,
        "recommendation": scenarios[0] if scenarios and 'error' not in scenarios[0] else None
    }


from pydantic import BaseModel


class ApplyTreatmentWithTrackingRequest(BaseModel):
    """Request for applying treatment with tracking"""
    hr_code: str
    treatment_id: int


@router.post("/apply-treatment")
async def apply_treatment_with_tracking(
    request: ApplyTreatmentWithTrackingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Apply a treatment to an employee and return simulation results.

    This is similar to /simulate but uses hr_code instead of employee_id
    for compatibility with TreatmentTracker component.
    """
    try:
        # Use the treatment service to simulate application
        result = await treatment_validation_service.apply_treatment_simulation(
            db=db,
            employee_hr_code=request.hr_code,
            treatment_id=request.treatment_id
        )

        # Convert ROI to float (handle infinity)
        roi_value = result['roi']
        if isinstance(roi_value, float) and (roi_value == float('inf') or roi_value == float('-inf')):
            roi_value = 999.99 if roi_value > 0 else -999.99

        return {
            "employee_id": result['employee_id'],
            "treatment_id": result['treatment_id'],
            "treatment_name": result['treatment_name'],
            "treatment_cost": result['treatment_cost'],
            "pre_churn_probability": result['pre_churn_probability'],
            "post_churn_probability": result['post_churn_probability'],
            "eltv_pre_treatment": result['eltv_pre_treatment'],
            "eltv_post_treatment": result['eltv_post_treatment'],
            "treatment_effect_eltv": result['treatment_effect_eltv'],
            "roi": roi_value,
            "new_survival_probabilities": result['new_survival_probabilities'],
            "applied_treatment": result['applied_treatment']
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error applying treatment: {str(e)}"
        )
