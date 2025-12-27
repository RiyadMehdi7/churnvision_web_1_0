"""
Playground API Endpoints

These endpoints power the ELTV Treatment Playground, providing:
- Employee data with calculated ELTV and survival probabilities
- AI-generated treatment suggestions
- Treatment simulation and application
- What-if scenario analysis
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import List, Dict, Any, Optional
from datetime import date, datetime
from dateutil.relativedelta import relativedelta

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
from app.schemas.roi_dashboard import (
    ROIDashboardData,
    ROIDashboardRequest,
    PortfolioSummary,
    DepartmentROI,
    MonthlyProjection,
    TreatmentROISummary
)
from app.services.eltv_service import eltv_service
from app.services.treatment_service import treatment_validation_service
from app.services.roi_dashboard_service import roi_dashboard_service

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


@router.get("/roi-dashboard", response_model=ROIDashboardData)
async def get_roi_dashboard(
    department_filter: Optional[List[str]] = Query(default=None),
    risk_level_filter: Optional[str] = Query(default=None),
    include_terminated: bool = Query(default=False),
    projection_months: int = Query(default=12, ge=1, le=24),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated ROI metrics for CFO/Executive dashboard.

    Returns portfolio-level ELTV at risk, department breakdowns,
    timeline projections, and treatment ROI summary.

    This endpoint aggregates data across all employees to provide
    executive-level financial visibility into retention risk.
    """

    # Build base query for employees
    base_query = select(HRDataInput)

    if not include_terminated:
        base_query = base_query.where(HRDataInput.status != 'Resigned')

    if department_filter:
        base_query = base_query.where(HRDataInput.structure_name.in_(department_filter))

    # Get distinct employees (latest record per hr_code)
    subquery = (
        select(
            HRDataInput.hr_code,
            func.max(HRDataInput.report_date).label('max_date')
        )
        .group_by(HRDataInput.hr_code)
        .subquery()
    )

    query = (
        select(HRDataInput)
        .join(
            subquery,
            (HRDataInput.hr_code == subquery.c.hr_code) &
            (HRDataInput.report_date == subquery.c.max_date)
        )
    )

    if not include_terminated:
        query = query.where(HRDataInput.status != 'Resigned')

    if department_filter:
        query = query.where(HRDataInput.structure_name.in_(department_filter))

    result = await db.execute(query)
    employees = result.scalars().all()

    if not employees:
        raise HTTPException(status_code=404, detail="No employees found")

    # Get all churn outputs for these employees
    hr_codes = [e.hr_code for e in employees]

    # Use join-based approach instead of IN clause to avoid PostgreSQL parameter limit (32767)
    # Create a subquery from the employees we already have (using their hr_codes from the main query)
    employee_hr_codes_subquery = (
        select(HRDataInput.hr_code)
        .join(
            subquery,
            (HRDataInput.hr_code == subquery.c.hr_code) &
            (HRDataInput.report_date == subquery.c.max_date)
        )
    )
    if not include_terminated:
        employee_hr_codes_subquery = employee_hr_codes_subquery.where(HRDataInput.status != 'Resigned')
    if department_filter:
        employee_hr_codes_subquery = employee_hr_codes_subquery.where(HRDataInput.structure_name.in_(department_filter))

    employee_hr_codes_subquery = employee_hr_codes_subquery.subquery()

    churn_subquery = (
        select(
            ChurnOutput.hr_code,
            func.max(ChurnOutput.generated_at).label('max_date')
        )
        .where(ChurnOutput.hr_code.in_(select(employee_hr_codes_subquery.c.hr_code)))
        .group_by(ChurnOutput.hr_code)
        .subquery()
    )

    churn_query = (
        select(ChurnOutput)
        .join(
            churn_subquery,
            (ChurnOutput.hr_code == churn_subquery.c.hr_code) &
            (ChurnOutput.generated_at == churn_subquery.c.max_date)
        )
    )

    churn_result = await db.execute(churn_query)
    churn_outputs = {c.hr_code: c for c in churn_result.scalars().all()}

    # Risk thresholds
    HIGH_RISK_THRESHOLD = 0.7
    MEDIUM_RISK_THRESHOLD = 0.4

    # Get treatment effectiveness data early for use in calculations
    early_effectiveness = await roi_dashboard_service.get_realized_effectiveness(db)
    early_effectiveness_rate = early_effectiveness or 0.0

    # Calculate metrics per employee
    employee_metrics = []
    department_data = {}

    for emp in employees:
        churn_data = churn_outputs.get(emp.hr_code)
        churn_prob = float(churn_data.resign_proba) if churn_data else 0.3
        salary = float(emp.employee_cost) if emp.employee_cost else 50000
        tenure = float(emp.tenure) if emp.tenure else 0

        # Apply risk level filter
        if risk_level_filter:
            if risk_level_filter == 'high' and churn_prob < HIGH_RISK_THRESHOLD:
                continue
            elif risk_level_filter == 'medium' and (churn_prob >= HIGH_RISK_THRESHOLD or churn_prob < MEDIUM_RISK_THRESHOLD):
                continue
            elif risk_level_filter == 'low' and churn_prob >= MEDIUM_RISK_THRESHOLD:
                continue

        # Determine risk level
        if churn_prob >= HIGH_RISK_THRESHOLD:
            risk_level = 'high'
        elif churn_prob >= MEDIUM_RISK_THRESHOLD:
            risk_level = 'medium'
        else:
            risk_level = 'low'

        # Calculate ELTV
        position_level = eltv_service.estimate_position_level(
            position=emp.position,
            salary=salary,
            tenure=tenure
        )

        eltv_result = eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=churn_prob,
            tenure_years=tenure,
            position_level=position_level
        )

        # Calculate potential recovery using data-driven effectiveness rate
        treated_churn = max(0.05, churn_prob * (1 - early_effectiveness_rate))
        eltv_treated = eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=treated_churn,
            tenure_years=tenure,
            position_level=position_level
        )

        recovery_potential = eltv_treated.eltv - eltv_result.eltv

        employee_metrics.append({
            'hr_code': emp.hr_code,
            'department': emp.structure_name or 'Unknown',
            'churn_prob': churn_prob,
            'risk_level': risk_level,
            'eltv': eltv_result.eltv,
            'eltv_at_risk': eltv_result.eltv if risk_level == 'high' else 0,
            'recovery_potential': recovery_potential if risk_level in ('high', 'medium') else 0,
            'salary': salary,
            'survival_probs': eltv_result.survival_probabilities
        })

        # Aggregate by department
        dept = emp.structure_name or 'Unknown'
        if dept not in department_data:
            department_data[dept] = {
                'employees': [],
                'total_eltv_at_risk': 0,
                'total_recovery': 0,
                'churn_probs': []
            }

        department_data[dept]['employees'].append(emp.hr_code)
        department_data[dept]['churn_probs'].append(churn_prob)
        if risk_level == 'high':
            department_data[dept]['total_eltv_at_risk'] += eltv_result.eltv
        if risk_level in ('high', 'medium'):
            department_data[dept]['total_recovery'] += recovery_potential

    # Build portfolio summary
    total_employees = len(employee_metrics)
    high_risk = sum(1 for e in employee_metrics if e['risk_level'] == 'high')
    medium_risk = sum(1 for e in employee_metrics if e['risk_level'] == 'medium')
    low_risk = sum(1 for e in employee_metrics if e['risk_level'] == 'low')

    total_eltv_at_risk = sum(e['eltv_at_risk'] for e in employee_metrics)
    total_recovery = sum(e['recovery_potential'] for e in employee_metrics)
    avg_churn = sum(e['churn_prob'] for e in employee_metrics) / total_employees if total_employees > 0 else 0
    avg_eltv = sum(e['eltv'] for e in employee_metrics) / total_employees if total_employees > 0 else 0

    # Get real treatment data from database
    treatment_summary = await roi_dashboard_service.get_treatment_summary(db, department_filter)
    treated_hr_codes = await roi_dashboard_service.get_treated_hr_codes(db)
    avg_treatment_cost = await roi_dashboard_service.get_average_treatment_cost(db)
    avg_effectiveness = await roi_dashboard_service.get_realized_effectiveness(db)

    # Use actual data values (no fallbacks)
    effectiveness_rate = avg_effectiveness or 0.0
    cost_per_treatment = avg_treatment_cost or 0.0

    # Calculate treatments applied and pending
    treatments_applied = treatment_summary.total_applied
    high_risk_hr_codes = [e['hr_code'] for e in employee_metrics if e['risk_level'] == 'high']
    treatments_pending = len([hr for hr in high_risk_hr_codes if hr not in treated_hr_codes])

    # Calculate ROI using real data if available, otherwise estimate
    if treatment_summary.total_applied > 0:
        roi_metrics = await roi_dashboard_service.calculate_actual_roi(db)
        aggregate_roi = roi_metrics.roi_percentage
    else:
        # Projection based on average treatment cost
        estimated_treatment_cost = high_risk * cost_per_treatment
        aggregate_roi = ((total_recovery - estimated_treatment_cost) / estimated_treatment_cost * 100) if estimated_treatment_cost > 0 else 0

    portfolio_summary = PortfolioSummary(
        total_employees=total_employees,
        high_risk_count=high_risk,
        medium_risk_count=medium_risk,
        low_risk_count=low_risk,
        total_eltv_at_risk=round(total_eltv_at_risk, 2),
        recovery_potential=round(total_recovery, 2),
        aggregate_roi=round(aggregate_roi, 2),
        treatments_applied=treatments_applied,
        treatments_pending=treatments_pending,
        avg_churn_probability=round(avg_churn, 4),
        avg_eltv=round(avg_eltv, 2)
    )

    # Build department breakdown
    department_breakdown = []
    for dept, data in department_data.items():
        emp_count = len(data['employees'])
        avg_dept_churn = sum(data['churn_probs']) / emp_count if emp_count > 0 else 0
        high_risk_in_dept = sum(1 for p in data['churn_probs'] if p >= HIGH_RISK_THRESHOLD)

        # Risk concentration = dept's ELTV at risk / total ELTV at risk
        risk_concentration = (data['total_eltv_at_risk'] / total_eltv_at_risk * 100) if total_eltv_at_risk > 0 else 0

        # Priority score based on risk concentration and employee count
        priority_score = (risk_concentration * 0.6) + (high_risk_in_dept / max(emp_count, 1) * 40)

        # Recommended budget: use data-driven cost per treatment
        recommended_budget = high_risk_in_dept * cost_per_treatment

        department_breakdown.append(DepartmentROI(
            department=dept,
            employee_count=emp_count,
            high_risk_count=high_risk_in_dept,
            eltv_at_risk=round(data['total_eltv_at_risk'], 2),
            avg_churn_probability=round(avg_dept_churn, 4),
            recovery_potential=round(data['total_recovery'], 2),
            recommended_budget=round(recommended_budget, 2),
            risk_concentration=round(risk_concentration, 2),
            priority_score=round(priority_score, 2)
        ))

    # Sort by priority score descending
    department_breakdown.sort(key=lambda x: x.priority_score, reverse=True)

    # Build timeline projections
    timeline_projections = []
    current_date = date.today()

    # Get average survival probabilities across high-risk employees
    high_risk_employees = [e for e in employee_metrics if e['risk_level'] == 'high']

    for month_idx in range(projection_months):
        month_key = f"month_{month_idx + 1}"
        month_date = current_date + relativedelta(months=month_idx)
        month_str = month_date.strftime("%Y-%m")

        # Calculate baseline ELTV (without treatment)
        baseline_eltv = 0
        treated_eltv = 0
        expected_departures_baseline = 0
        expected_departures_treated = 0

        for emp in employee_metrics:
            survival_prob = emp['survival_probs'].get(month_key, 0.5)
            emp_eltv = emp['eltv']

            baseline_eltv += emp_eltv * survival_prob

            # With treatment: use data-driven effectiveness rate
            if emp['risk_level'] in ('high', 'medium'):
                improved_survival = min(1.0, survival_prob + (1 - survival_prob) * effectiveness_rate)
                treated_eltv += emp_eltv * improved_survival
            else:
                treated_eltv += emp_eltv * survival_prob

            # Expected departures
            if survival_prob < 0.5:
                expected_departures_baseline += 1
            if emp['risk_level'] in ('high', 'medium'):
                improved_survival = min(1.0, survival_prob + (1 - survival_prob) * effectiveness_rate)
                if improved_survival < 0.5:
                    expected_departures_treated += 1
            else:
                if survival_prob < 0.5:
                    expected_departures_treated += 1

        # Cumulative metrics
        cumulative_loss = sum(e['eltv'] for e in employee_metrics) - baseline_eltv
        cumulative_recovery = treated_eltv - baseline_eltv

        timeline_projections.append(MonthlyProjection(
            month=month_str,
            month_index=month_idx,
            eltv_baseline=round(baseline_eltv, 2),
            eltv_with_treatment=round(treated_eltv, 2),
            cumulative_loss_baseline=round(cumulative_loss, 2),
            cumulative_recovery=round(cumulative_recovery, 2),
            expected_departures_baseline=expected_departures_baseline,
            expected_departures_treated=expected_departures_treated
        ))

    # Treatment ROI summary from real data
    treatments_by_type = await roi_dashboard_service.get_treatments_by_type(db)

    if treatment_summary.total_applied > 0:
        roi_metrics = await roi_dashboard_service.calculate_actual_roi(db)
        treatment_roi_summary = TreatmentROISummary(
            total_treatment_cost=roi_metrics.total_cost,
            total_eltv_preserved=roi_metrics.total_eltv_preserved,
            net_benefit=roi_metrics.net_benefit,
            overall_roi_percentage=roi_metrics.roi_percentage,
            treatments_by_type=treatments_by_type,
            avg_treatment_effectiveness=effectiveness_rate
        )
    else:
        # No treatments yet - show zeros
        treatment_roi_summary = TreatmentROISummary(
            total_treatment_cost=0,
            total_eltv_preserved=0,
            net_benefit=0,
            overall_roi_percentage=0,
            treatments_by_type={},
            avg_treatment_effectiveness=0.0
        )

    return ROIDashboardData(
        portfolio_summary=portfolio_summary,
        department_breakdown=department_breakdown,
        timeline_projections=timeline_projections,
        treatment_roi_summary=treatment_roi_summary,
        data_as_of=current_date,
        projection_horizon_months=projection_months
    )
