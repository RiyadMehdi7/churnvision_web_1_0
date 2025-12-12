"""
Common API Helper Functions

This module contains reusable database query patterns and validation
functions to reduce code duplication across API endpoints.
"""

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional, Dict, Any

from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput


async def get_latest_employee_by_hr_code(
    db: AsyncSession,
    hr_code: str,
    raise_not_found: bool = True
) -> Optional[HRDataInput]:
    """
    Get the most recent employee record by HR code.

    Args:
        db: Database session
        hr_code: Employee HR code
        raise_not_found: If True, raises 404 if not found

    Returns:
        HRDataInput model or None

    Raises:
        HTTPException: 404 if employee not found and raise_not_found=True
    """
    query = select(HRDataInput).where(
        HRDataInput.hr_code == hr_code
    ).order_by(desc(HRDataInput.report_date)).limit(1)

    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee and raise_not_found:
        raise HTTPException(status_code=404, detail="Employee not found")

    return employee


async def get_latest_churn_output(
    db: AsyncSession,
    hr_code: str
) -> Optional[ChurnOutput]:
    """
    Get the most recent churn prediction for an employee.

    Args:
        db: Database session
        hr_code: Employee HR code

    Returns:
        ChurnOutput model or None
    """
    query = select(ChurnOutput).where(
        ChurnOutput.hr_code == hr_code
    ).order_by(desc(ChurnOutput.generated_at)).limit(1)

    result = await db.execute(query)
    return result.scalar_one_or_none()


def extract_employee_values(
    employee: HRDataInput,
    churn_data: Optional[ChurnOutput] = None,
    default_churn_prob: float = 0.3,
    default_salary: float = 50000
) -> Dict[str, Any]:
    """
    Extract common values from employee and churn data with defaults.

    Args:
        employee: HRDataInput model
        churn_data: Optional ChurnOutput model
        default_churn_prob: Default churn probability if no churn data
        default_salary: Default salary if employee_cost is None

    Returns:
        Dict with churn_prob, salary, tenure
    """
    return {
        'churn_prob': float(churn_data.resign_proba) if churn_data else default_churn_prob,
        'salary': float(employee.employee_cost) if employee.employee_cost else default_salary,
        'tenure': float(employee.tenure) if employee.tenure else 0
    }


def build_employee_data_dict(
    employee: HRDataInput,
    include_structure: bool = True
) -> Dict[str, Any]:
    """
    Build a standard employee data dictionary for services.

    Args:
        employee: HRDataInput model
        include_structure: Whether to include structure_name

    Returns:
        Dict with employee data
    """
    data = {
        'hr_code': employee.hr_code,
        'tenure': float(employee.tenure) if employee.tenure else 0,
        'position': employee.position,
        'status': employee.status,
        'employee_cost': float(employee.employee_cost) if employee.employee_cost else 0
    }

    if include_structure:
        data['structure_name'] = employee.structure_name

    return data
