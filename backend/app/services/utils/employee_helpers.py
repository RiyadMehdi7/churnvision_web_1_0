"""
Employee Data Helpers

Common database queries for fetching employee-related data.
Used across multiple services to avoid code duplication.
"""

from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc


async def get_employee_by_hr_code(db: AsyncSession, hr_code: str):
    """
    Get the most recent employee data by HR code.

    Args:
        db: Database session
        hr_code: Employee HR code

    Returns:
        HRDataInput or None
    """
    from app.models.hr_data import HRDataInput

    query = (
        select(HRDataInput)
        .where(HRDataInput.hr_code == hr_code)
        .order_by(desc(HRDataInput.report_date))
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_churn_data_by_hr_code(db: AsyncSession, hr_code: str):
    """
    Get the most recent churn prediction data by HR code.

    Args:
        db: Database session
        hr_code: Employee HR code

    Returns:
        ChurnOutput or None
    """
    from app.models.churn import ChurnOutput

    query = (
        select(ChurnOutput)
        .where(ChurnOutput.hr_code == hr_code)
        .order_by(desc(ChurnOutput.generated_at))
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_churn_reasoning_by_hr_code(db: AsyncSession, hr_code: str):
    """
    Get the most recent churn reasoning by HR code.

    Args:
        db: Database session
        hr_code: Employee HR code

    Returns:
        ChurnReasoning or None
    """
    from app.models.churn import ChurnReasoning

    query = (
        select(ChurnReasoning)
        .where(ChurnReasoning.hr_code == hr_code)
        .order_by(desc(ChurnReasoning.updated_at))
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_eltv_data_by_hr_code(db: AsyncSession, hr_code: str):
    """
    Get Employee Lifetime Value data by HR code.

    Args:
        db: Database session
        hr_code: Employee HR code

    Returns:
        ELTVOutput or None
    """
    from app.models.churn import ELTVOutput

    query = (
        select(ELTVOutput)
        .where(ELTVOutput.hr_code == hr_code)
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_interview_data_by_hr_code(
    db: AsyncSession,
    hr_code: str,
    limit: int = 5
) -> List:
    """
    Get interview history for employee.

    Args:
        db: Database session
        hr_code: Employee HR code
        limit: Maximum number of interviews to return

    Returns:
        List of InterviewData
    """
    from app.models.hr_data import InterviewData

    query = (
        select(InterviewData)
        .where(InterviewData.hr_code == hr_code)
        .order_by(desc(InterviewData.interview_date))
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_treatment_history_by_hr_code(
    db: AsyncSession,
    hr_code: str,
    limit: int = 10
) -> List:
    """
    Get treatment application history for employee.

    Args:
        db: Database session
        hr_code: Employee HR code
        limit: Maximum number of treatments to return

    Returns:
        List of TreatmentApplication
    """
    from app.models.treatment import TreatmentApplication

    query = (
        select(TreatmentApplication)
        .where(TreatmentApplication.hr_code == hr_code)
        .order_by(desc(TreatmentApplication.applied_date))
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())
