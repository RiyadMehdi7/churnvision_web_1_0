from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.employee import Employee
from app.schemas.churn import EmployeeResponse

router = APIRouter()

@router.get("/", response_model=List[EmployeeResponse])
async def read_employees(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Retrieve employees.
    """
    query = select(Employee).offset(skip).limit(limit)
    result = await db.execute(query)
    employees = result.scalars().all()
    return employees

@router.get("/{employee_id}", response_model=EmployeeResponse)
async def read_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get employee by ID.
    """
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    return employee
