from typing import Any, List, Optional, Dict
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, Dict, List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.hr_data import HRDataInput
from app.models.user import User
from app.services.data.dataset_service import get_active_dataset_entry

router = APIRouter()


class EmployeeRecord(BaseModel):
    """Lightweight employee record returned to the UI."""
    hr_code: str
    full_name: str
    structure_name: str
    position: str
    status: Optional[str] = None
    manager_id: Optional[str] = None
    tenure: Optional[float] = None
    employee_cost: Optional[float] = None
    resign_proba: Optional[float] = None
    shap_values: Optional[Dict[str, Any]] = None
    additional_data: Optional[Dict[str, Any]] = None
    termination_date: Optional[str] = None
    reasoning_churn_risk: Optional[float] = None
    reasoning_stage: Optional[str] = None
    reasoning_confidence: Optional[float] = None
    performance_rating_latest: Optional[float] = None
    eltv_pre_treatment: Optional[float] = None


async def _hydrate_hr_data_from_active_dataset(db: AsyncSession) -> Optional[str]:
    """
    If the HR data table is empty for the active dataset, hydrate it from the
    dataset file so the Home page has something to display.
    """
    dataset_entry = await get_active_dataset_entry(db)
    if not dataset_entry or not dataset_entry.file_path:
        return None

    dataset_id = dataset_entry.dataset_id
    path_obj = Path(dataset_entry.file_path)
    if not path_obj.exists():
        return None

    # Only hydrate when we do not yet have rows for this dataset
    existing_count = await db.execute(
        select(func.count()).select_from(HRDataInput).where(HRDataInput.dataset_id == dataset_id)
    )
    if existing_count.scalar_one() > 0:
        return dataset_id

    # Use the stored column mapping (if any) to rename columns
    mapping = dataset_entry.column_mapping or {}
    try:
        df = pd.read_csv(path_obj)
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The dataset file is empty or contains no data"
        )
    except pd.errors.ParserError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV file: invalid format or encoding"
        )
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read dataset: file encoding not supported. Please use UTF-8."
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset file not found. Please re-upload the dataset."
        )
    except Exception as e:
        # Log the actual error for debugging but don't expose internal paths
        import logging
        logging.getLogger(__name__).error(f"Failed to read dataset {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read dataset due to an internal error"
        )

    rename_map = {}
    canonical_fields = {
        "hr_code": "hr_code",
        "full_name": "full_name",
        "structure_name": "structure_name",
        "position": "position",
        "status": "status",
        "manager_id": "manager_id",
        "tenure": "tenure",
        "employee_cost": "employee_cost",
        "termination_date": "termination_date",
    }
    for target, default_col in canonical_fields.items():
        source_col = mapping.get(target) or default_col
        if source_col in df.columns:
            rename_map[source_col] = target

    required = {"hr_code", "full_name", "structure_name", "position", "status", "manager_id", "tenure"}
    missing = [field for field in required if field not in rename_map.values()]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Active dataset is missing required columns: {missing}"
        )

    df = df.rename(columns=rename_map)
    df["status"] = df.get("status", "Active").fillna("Active")

    # Helper to parse date strings to date objects
    def parse_date(val):
        if pd.isnull(val) or val is None or val == '':
            return None
        if isinstance(val, datetime):
            return val.date()
        if hasattr(val, 'date'):  # datetime-like
            return val.date()
        try:
            return datetime.strptime(str(val), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return None

    records: List[dict] = []
    for _, row in df.iterrows():
        report_date_val = row.get("report_date") if "report_date" in df.columns else None
        report_date = parse_date(report_date_val) or datetime.utcnow().date()

        termination_date_val = row.get("termination_date") if "termination_date" in df.columns else None
        termination_date = parse_date(termination_date_val)

        records.append({
            "hr_code": str(row.get("hr_code")),
            "dataset_id": dataset_id,
            "full_name": row.get("full_name"),
            "structure_name": row.get("structure_name"),
            "position": row.get("position"),
            "status": row.get("status", "Active"),
            "manager_id": str(row.get("manager_id")) if pd.notnull(row.get("manager_id")) else None,
            "tenure": float(row.get("tenure")) if pd.notnull(row.get("tenure")) else 0,
            "employee_cost": float(row.get("employee_cost")) if pd.notnull(row.get("employee_cost")) else None,
            "report_date": report_date,
            "termination_date": termination_date,
            "additional_data": row.get("additional_data") if isinstance(row.get("additional_data"), dict) else None,
        })

    if records:
        # Use PostgreSQL INSERT ... ON CONFLICT DO NOTHING to handle duplicates gracefully
        # Batch inserts to avoid exceeding PostgreSQL's parameter limit (32,767)
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        BATCH_SIZE = 500  # 500 records * ~12 columns = ~6000 params per batch (safe margin)

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            stmt = pg_insert(HRDataInput).values(batch).on_conflict_do_nothing(
                index_elements=['hr_code', 'dataset_id']
            )
            await db.execute(stmt)

        await db.commit()

    return dataset_id


@router.get("/", response_model=List[EmployeeRecord])
async def read_employees(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: Optional[int] = None,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Retrieve employees, hydrating from the active dataset if the HR table is empty.
    """
    try:
        # Ensure we have HR data for the active dataset
        dataset_entry = await get_active_dataset_entry(db)
        dataset_id = dataset_entry.dataset_id if dataset_entry else None
        hydrated_dataset_id = await _hydrate_hr_data_from_active_dataset(db)
        dataset_id = dataset_id or hydrated_dataset_id

        # If we still do not have a dataset, return empty list
        if not dataset_id:
            return []

        query = (
            select(
                HRDataInput.hr_code,
                HRDataInput.full_name,
                HRDataInput.structure_name,
                HRDataInput.position,
                HRDataInput.status,
                HRDataInput.manager_id,
                HRDataInput.tenure,
                HRDataInput.employee_cost,
                HRDataInput.termination_date,
                HRDataInput.additional_data,
                ChurnOutput.resign_proba,
                ChurnOutput.shap_values,
                ChurnReasoning.churn_risk.label("reasoning_churn_risk"),
                ChurnReasoning.stage.label("reasoning_stage"),
                ChurnReasoning.confidence_level.label("reasoning_confidence"),
            )
            .select_from(HRDataInput)
            .outerjoin(
                ChurnOutput,
                and_(
                    ChurnOutput.hr_code == HRDataInput.hr_code,
                    ChurnOutput.dataset_id == HRDataInput.dataset_id,
                ),
            )
            .outerjoin(ChurnReasoning, ChurnReasoning.hr_code == HRDataInput.hr_code)
            .where(HRDataInput.dataset_id == dataset_id)
        )
        if skip:
            query = query.offset(skip)
        if limit and limit > 0:
            query = query.limit(limit)
        result = await db.execute(query)

        employees: List[EmployeeRecord] = []
        for row in result:
            employees.append(EmployeeRecord(
                hr_code=row.hr_code,
                full_name=row.full_name,
                structure_name=row.structure_name,
                position=row.position,
                status=row.status,
                manager_id=row.manager_id,
                tenure=float(row.tenure) if row.tenure is not None else None,
                employee_cost=float(row.employee_cost) if row.employee_cost is not None else None,
                resign_proba=float(row.resign_proba) if row.resign_proba is not None else None,
                shap_values=row.shap_values,
                additional_data=row.additional_data,
                termination_date=str(row.termination_date) if row.termination_date else None,
                reasoning_churn_risk=float(row.reasoning_churn_risk) if row.reasoning_churn_risk is not None else None,
                reasoning_stage=row.reasoning_stage,
                reasoning_confidence=float(row.reasoning_confidence) if row.reasoning_confidence is not None else None,
            ))
        return employees
    except Exception as e:
        # Surface a graceful error instead of a generic 500 to help frontend handling
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load employees: {e}"
        )


@router.post("/{hr_code}/generate-treatments", response_model=List[Dict[str, Any]])
async def generate_treatments(
    hr_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Generate personalized treatments for an employee using AI.
    """
    try:
        from app.services.ai.treatment_generation_service import TreatmentGenerationService
        service = TreatmentGenerationService(db)
        treatments = await service.generate_personalized_treatments(hr_code)
        return treatments
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate treatments: {str(e)}"
        )
