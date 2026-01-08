"""
Employee Tools - Tools for querying individual employee data

These tools provide access to employee-level data including:
- Basic employee information
- Churn predictions and risk scores
- ELTV (Employee Lifetime Value)
- Treatment history
"""

from typing import Dict, Any, Optional, List
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.services.tools.schema import ToolSchema, ToolDefinition, ToolCategory
from app.services.tools.registry import tool_registry
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning, ELTVOutput
from app.models.treatment import TreatmentApplication

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Definitions
# =============================================================================

GET_EMPLOYEE_DATA_SCHEMA = ToolSchema(
    name="get_employee_data",
    description="""Retrieve detailed information about a specific employee.
Returns: name, position, department, tenure, salary, status, and manager.
Use this when you need to look up information about a specific person.""",
    parameters={
        "type": "object",
        "properties": {
            "hr_code": {
                "type": "string",
                "description": "The employee's HR code (e.g., 'CV001', 'EMP-123')"
            },
            "employee_name": {
                "type": "string",
                "description": "The employee's full name for fuzzy search (use if hr_code unknown)"
            }
        },
        "required": []
    }
)

GET_EMPLOYEE_DATA_DEF = ToolDefinition(
    tool_schema=GET_EMPLOYEE_DATA_SCHEMA,
    category=ToolCategory.EMPLOYEE,
    requires_employee_context=False,
    requires_dataset=True
)


GET_CHURN_PREDICTION_SCHEMA = ToolSchema(
    name="get_churn_prediction",
    description="""Get churn risk prediction for a specific employee.
Returns: risk score (0-100%), risk level (high/medium/low), key risk factors, and confidence.
Use this to understand why an employee might be at risk of leaving.""",
    parameters={
        "type": "object",
        "properties": {
            "hr_code": {
                "type": "string",
                "description": "The employee's HR code"
            }
        },
        "required": ["hr_code"]
    }
)

GET_CHURN_PREDICTION_DEF = ToolDefinition(
    tool_schema=GET_CHURN_PREDICTION_SCHEMA,
    category=ToolCategory.EMPLOYEE,
    requires_employee_context=False,
    requires_dataset=True
)


GET_EMPLOYEE_ELTV_SCHEMA = ToolSchema(
    name="get_employee_eltv",
    description="""Get Employee Lifetime Value (ELTV) for a specific employee.
Returns: current ELTV, projected ELTV with/without treatment, replacement cost.
Use this to understand the financial value of retaining an employee.""",
    parameters={
        "type": "object",
        "properties": {
            "hr_code": {
                "type": "string",
                "description": "The employee's HR code"
            }
        },
        "required": ["hr_code"]
    }
)

GET_EMPLOYEE_ELTV_DEF = ToolDefinition(
    tool_schema=GET_EMPLOYEE_ELTV_SCHEMA,
    category=ToolCategory.EMPLOYEE,
    requires_employee_context=False,
    requires_dataset=True
)


GET_TREATMENT_HISTORY_SCHEMA = ToolSchema(
    name="get_treatment_history",
    description="""Get the history of retention treatments applied to an employee.
Returns: list of treatments, their costs, dates, and effectiveness.
Use this to see what retention efforts have been made for an employee.""",
    parameters={
        "type": "object",
        "properties": {
            "hr_code": {
                "type": "string",
                "description": "The employee's HR code"
            }
        },
        "required": ["hr_code"]
    }
)

GET_TREATMENT_HISTORY_DEF = ToolDefinition(
    tool_schema=GET_TREATMENT_HISTORY_SCHEMA,
    category=ToolCategory.EMPLOYEE,
    requires_employee_context=False,
    requires_dataset=True
)


# =============================================================================
# Tool Handlers
# =============================================================================

@tool_registry.register(GET_EMPLOYEE_DATA_DEF)
async def get_employee_data(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    hr_code: Optional[str] = None,
    employee_name: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Get detailed employee information.

    Searches by hr_code (exact match) or employee_name (fuzzy match).
    """
    if not hr_code and not employee_name:
        # Use employee context if available
        if employee_context and employee_context.get("hr_code"):
            hr_code = employee_context["hr_code"]
        else:
            return {"error": "Please provide either hr_code or employee_name"}

    # Build query
    query = select(HRDataInput).where(HRDataInput.dataset_id == dataset_id)

    if hr_code:
        query = query.where(HRDataInput.hr_code == hr_code)
    elif employee_name:
        # Fuzzy search by name
        query = query.where(HRDataInput.full_name.ilike(f"%{employee_name}%"))

    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        return {"error": f"Employee not found: {hr_code or employee_name}"}

    return {
        "hr_code": employee.hr_code,
        "full_name": employee.full_name,
        "position": employee.position,
        "department": employee.structure_name,
        "tenure_years": float(employee.tenure) if employee.tenure else 0,
        "salary": float(employee.employee_cost) if employee.employee_cost else 0,
        "status": employee.status,
        "manager_id": employee.manager_id,
        "report_date": str(employee.report_date) if employee.report_date else None,
        "termination_date": str(employee.termination_date) if employee.termination_date else None
    }


@tool_registry.register(GET_CHURN_PREDICTION_DEF)
async def get_churn_prediction(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    hr_code: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Get churn prediction for an employee.

    Returns risk score, risk level, top factors, and confidence.
    """
    if not hr_code:
        if employee_context and employee_context.get("hr_code"):
            hr_code = employee_context["hr_code"]
        else:
            return {"error": "Please provide hr_code"}

    # Get churn output
    query = select(ChurnOutput).where(
        ChurnOutput.hr_code == hr_code,
        ChurnOutput.dataset_id == dataset_id
    ).order_by(ChurnOutput.generated_at.desc())

    result = await db.execute(query)
    churn = result.scalar_one_or_none()

    if not churn:
        return {"error": f"No churn prediction found for {hr_code}"}

    # Get reasoning if available
    reasoning_query = select(ChurnReasoning).where(
        ChurnReasoning.hr_code == hr_code,
        ChurnReasoning.dataset_id == dataset_id
    ).order_by(ChurnReasoning.generated_at.desc())

    reasoning_result = await db.execute(reasoning_query)
    reasoning = reasoning_result.scalar_one_or_none()

    # Determine risk level
    risk_score = float(churn.resign_proba) * 100 if churn.resign_proba else 0
    if risk_score >= 70:
        risk_level = "high"
    elif risk_score >= 40:
        risk_level = "medium"
    else:
        risk_level = "low"

    response = {
        "hr_code": hr_code,
        "risk_score_percent": round(risk_score, 1),
        "risk_level": risk_level,
        "confidence": float(churn.confidence_score) if churn.confidence_score else None,
    }

    # Add SHAP values (top factors) if available
    if churn.shap_values:
        shap_data = churn.shap_values if isinstance(churn.shap_values, dict) else {}
        # Sort by absolute value and get top 5
        sorted_factors = sorted(
            shap_data.items(),
            key=lambda x: abs(x[1]) if isinstance(x[1], (int, float)) else 0,
            reverse=True
        )[:5]
        response["top_risk_factors"] = [
            {"factor": k, "impact": round(v, 3) if isinstance(v, (int, float)) else v}
            for k, v in sorted_factors
        ]

    # Add reasoning if available
    if reasoning:
        response["stage"] = reasoning.stage
        response["ml_score"] = float(reasoning.ml_score) if reasoning.ml_score else None
        response["heuristic_score"] = float(reasoning.heuristic_score) if reasoning.heuristic_score else None

    return response


@tool_registry.register(GET_EMPLOYEE_ELTV_DEF)
async def get_employee_eltv(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    hr_code: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Get Employee Lifetime Value data.

    Returns ELTV pre/post treatment, survival probabilities, replacement cost.
    """
    if not hr_code:
        if employee_context and employee_context.get("hr_code"):
            hr_code = employee_context["hr_code"]
        else:
            return {"error": "Please provide hr_code"}

    # Get ELTV output
    query = select(ELTVOutput).where(
        ELTVOutput.hr_code == hr_code,
        ELTVOutput.dataset_id == dataset_id
    ).order_by(ELTVOutput.generated_at.desc())

    result = await db.execute(query)
    eltv = result.scalar_one_or_none()

    if not eltv:
        return {"error": f"No ELTV data found for {hr_code}"}

    # Get employee salary for replacement cost estimate
    emp_query = select(HRDataInput.employee_cost).where(
        HRDataInput.hr_code == hr_code,
        HRDataInput.dataset_id == dataset_id
    )
    emp_result = await db.execute(emp_query)
    salary = emp_result.scalar_one_or_none()

    # Estimate replacement cost (typically 0.5-2x annual salary)
    replacement_cost = float(salary) * 1.5 if salary else None

    return {
        "hr_code": hr_code,
        "eltv_pre_treatment": float(eltv.eltv_pre_treatment) if eltv.eltv_pre_treatment else None,
        "eltv_post_treatment": float(eltv.eltv_post_treatment) if eltv.eltv_post_treatment else None,
        "eltv_improvement": (
            float(eltv.eltv_post_treatment) - float(eltv.eltv_pre_treatment)
            if eltv.eltv_post_treatment and eltv.eltv_pre_treatment else None
        ),
        "survival_probabilities": eltv.survival_probabilities if eltv.survival_probabilities else None,
        "estimated_replacement_cost": replacement_cost,
        "annual_salary": float(salary) if salary else None
    }


@tool_registry.register(GET_TREATMENT_HISTORY_DEF)
async def get_treatment_history(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    hr_code: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Get treatment history for an employee.

    Returns list of all treatments applied, with costs and outcomes.
    """
    if not hr_code:
        if employee_context and employee_context.get("hr_code"):
            hr_code = employee_context["hr_code"]
        else:
            return {"error": "Please provide hr_code"}

    query = select(TreatmentApplication).where(
        TreatmentApplication.hr_code == hr_code,
        TreatmentApplication.dataset_id == dataset_id
    ).order_by(TreatmentApplication.applied_date.desc())

    result = await db.execute(query)
    treatments = result.scalars().all()

    if not treatments:
        return {
            "hr_code": hr_code,
            "treatments": [],
            "total_treatments": 0,
            "total_cost": 0,
            "message": "No treatments have been applied to this employee"
        }

    treatment_list = []
    total_cost = 0

    for t in treatments:
        cost = float(t.actual_cost or t.predicted_cost or 0)
        total_cost += cost

        treatment_list.append({
            "treatment_name": t.treatment_name,
            "applied_date": str(t.applied_date) if t.applied_date else None,
            "cost": cost,
            "pre_churn_probability": float(t.pre_churn_probability) * 100 if t.pre_churn_probability else None,
            "post_churn_probability": float(t.post_churn_probability) * 100 if t.post_churn_probability else None,
            "churn_reduction": (
                (float(t.pre_churn_probability) - float(t.post_churn_probability)) * 100
                if t.pre_churn_probability and t.post_churn_probability else None
            ),
            "roi": float(t.roi) if t.roi else None,
            "success": t.success_indicator,
            "is_simulation": t.is_simulation
        })

    return {
        "hr_code": hr_code,
        "treatments": treatment_list,
        "total_treatments": len(treatment_list),
        "total_cost": total_cost,
        "successful_treatments": sum(1 for t in treatment_list if t.get("success"))
    }
