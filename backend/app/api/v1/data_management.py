from datetime import datetime
import json
import logging
import uuid
from pathlib import Path
from typing import List, Optional

import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.security_utils import sanitize_filename, sanitize_error_message

logger = logging.getLogger(__name__)
from app.models.user import User
from app.models.dataset import Dataset as DatasetModel, Connection as ConnectionModel
from app.models.project import Project as ProjectModel
from app.models.hr_data import HRDataInput
from app.schemas.data_management import (
    Project,
    Dataset,
    Connection,
    CreateConnectionRequest,
    ImportFromDbRequest,
    CreateProjectRequest,
    SetActiveProjectRequest,
    OperationResult,
)
from app.services.project_service import (
    ensure_default_project,
    get_active_project,
    set_active_project as set_active_project_service,
    find_project_by_name,
    find_project_by_db_path,
)

router = APIRouter()
UPLOAD_DIR = Path("./churnvision_data/uploads")


def _project_to_schema(project: ProjectModel) -> Project:
    return Project(
        id=project.id,
        name=project.name,
        path=project.path or "",
        dbPath=project.db_path or "",
        exists=True,
        active=bool(project.is_active),
    )


def _dataset_to_schema(dataset: DatasetModel) -> Dataset:
    return Dataset(
        id=dataset.dataset_id,
        name=dataset.name,
        type=dataset.file_type or "Unknown",
        size=dataset.size or 0,
        uploadedAt=dataset.upload_date or datetime.utcnow(),
        rowCount=dataset.row_count,
        active=bool(dataset.is_active),
        isSnapshot=bool(dataset.is_snapshot),
        snapshotGroup=dataset.snapshot_group,
        snapshotPairDatasetId=None,
        description=dataset.description,
        projectId=dataset.project_id,
        filePath=dataset.file_path,
        columnMapping=dataset.column_mapping,
    )


def _sanitize_project_name(name: str) -> str:
    safe = name.strip().lower().replace(" ", "-")
    return "".join(ch for ch in safe if ch.isalnum() or ch in ("-", "_"))


# --- Projects ---
@router.get("/projects", response_model=List[Project])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List available projects (persisted)."""
    await ensure_default_project(db)
    result = await db.execute(select(ProjectModel).order_by(ProjectModel.created_at))
    projects = result.scalars().all()
    return [_project_to_schema(p) for p in projects]


@router.post("/projects", response_model=OperationResult)
async def create_project(
    request: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new persisted project."""
    safe_name = _sanitize_project_name(request.name or "project")
    project = ProjectModel(
        id=str(uuid.uuid4()),
        name=request.name,
        path=f"/projects/{safe_name}",
        db_path=f"/projects/{safe_name}/database.db",
        is_active=False,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return OperationResult(success=True, project=_project_to_schema(project))


@router.post("/projects/active", response_model=OperationResult)
async def set_active_project(
    request: SetActiveProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the active project using its dbPath."""
    project = await find_project_by_db_path(db, request.dbPath)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await set_active_project_service(db, project)
    return OperationResult(success=True)


@router.delete("/projects/{path:path}", response_model=OperationResult)
async def delete_project(
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a project and its datasets."""
    normalized_path = f"/{path.lstrip('/')}"
    project = await db.scalar(select(ProjectModel).where(ProjectModel.path == normalized_path))
    if not project:
        return OperationResult(success=False, error="Project not found")

    await db.execute(delete(ProjectModel).where(ProjectModel.id == project.id))
    await db.commit()

    # Ensure there is always an active project after deletion
    await ensure_default_project(db)
    await get_active_project(db)

    return OperationResult(success=True)


# --- Datasets ---
@router.get("/datasets", response_model=List[Dataset])
async def list_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List datasets scoped to the active project only."""
    active_project = await get_active_project(db)
    result = await db.execute(
        select(DatasetModel).where(DatasetModel.project_id == active_project.id).order_by(DatasetModel.upload_date.desc())
    )
    datasets = result.scalars().all()
    return [_dataset_to_schema(d) for d in datasets]


@router.delete("/datasets/{dataset_id}", response_model=OperationResult)
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a dataset scoped to the active project."""
    active_project = await get_active_project(db)
    dataset = await db.scalar(
        select(DatasetModel).where(
            DatasetModel.dataset_id == dataset_id,
            DatasetModel.project_id == active_project.id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found for active project")

    # Remove underlying file best-effort
    if dataset.file_path:
        try:
            Path(dataset.file_path).unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"Failed to delete file {dataset.file_path}: {e}")

    await db.execute(
        delete(DatasetModel).where(
            DatasetModel.dataset_id == dataset_id,
            DatasetModel.project_id == active_project.id,
        )
    )
    await db.commit()

    return OperationResult(success=True)


@router.get("/datasets/{dataset_id}/preview")
async def get_dataset_preview(
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a preview of dataset rows (from hr_data_input table)."""
    active_project = await get_active_project(db)

    # Verify dataset exists and belongs to active project
    dataset = await db.scalar(
        select(DatasetModel).where(
            DatasetModel.dataset_id == dataset_id,
            DatasetModel.project_id == active_project.id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found for active project")

    # Fetch HR data rows for this dataset
    result = await db.execute(
        select(HRDataInput)
        .where(HRDataInput.dataset_id == dataset_id)
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()

    # Convert to list of dicts for JSON response
    data = []
    for row in rows:
        row_dict = {
            "hr_code": row.hr_code,
            "full_name": row.full_name,
            "structure_name": row.structure_name,
            "position": row.position,
            "status": row.status,
            "manager_id": row.manager_id,
            "tenure": float(row.tenure) if row.tenure else None,
            "employee_cost": float(row.employee_cost) if row.employee_cost else None,
            "report_date": row.report_date.isoformat() if row.report_date else None,
            "termination_date": row.termination_date.isoformat() if row.termination_date else None,
        }
        # Include additional_data fields if present
        if row.additional_data:
            row_dict.update(row.additional_data)
        data.append(row_dict)

    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset.name,
        "total_rows": dataset.row_count or len(data),
        "offset": offset,
        "limit": limit,
        "rows": data,
    }


@router.post("/datasets/{dataset_id}/activate", response_model=OperationResult)
async def activate_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a dataset as active for the current project (and deactivate others)."""
    active_project = await get_active_project(db)
    dataset = await db.scalar(
        select(DatasetModel).where(
            DatasetModel.dataset_id == dataset_id,
            DatasetModel.project_id == active_project.id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found for active project")

    await db.execute(
        update(DatasetModel)
        .where(DatasetModel.project_id == active_project.id)
        .values(is_active=0)
    )
    dataset.is_active = 1
    db.add(dataset)
    await db.commit()

    return OperationResult(success=True)


# --- Connections ---
@router.get("/connections", response_model=List[Connection])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List connections"""
    query = select(ConnectionModel).where(ConnectionModel.is_active == 1)
    result = await db.execute(query)
    connections = result.scalars().all()

    return [
        Connection(
            id=c.connection_id,
            name=c.name,
            type=c.type,
            host=c.host,
            port=c.port,
            username=c.username,
            databaseName=c.database_name,
            lastConnected=str(c.last_used) if c.last_used else None,
            status="active",  # Mock status
        )
        for c in connections
    ]


@router.post("/connections", response_model=OperationResult)
async def create_connection(
    request: CreateConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a connection"""
    new_conn = ConnectionModel(
        connection_id=str(uuid.uuid4()),
        name=request.name,
        type=request.type,
        host=request.host,
        port=request.port,
        username=request.username,
        database_name=request.databaseName,
    )
    db.add(new_conn)
    await db.commit()

    return OperationResult(success=True)


@router.get("/connections/{connection_id}/tables", response_model=List[str])
async def list_tables(
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List tables in a connection"""
    # Mock implementation as we can't easily connect to external DBs from here without drivers
    return ["employees", "departments", "salaries", "performance_reviews"]


@router.post("/import/db", response_model=OperationResult)
async def import_from_db(
    request: ImportFromDbRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import data from DB (placeholder)"""
    return OperationResult(success=True, message=f"Imported data from {request.tableName} to {request.datasetName}")


@router.post("/projects/export", response_model=OperationResult)
async def export_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export project"""
    return OperationResult(success=True, filePath="/tmp/export.zip")


@router.post("/projects/import", response_model=OperationResult)
async def import_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import project"""
    imported = ProjectModel(
        id=str(uuid.uuid4()),
        name="Imported Project",
        path="/projects/imported",
        db_path="/projects/imported/database.db",
        is_active=False,
    )
    db.add(imported)
    await db.commit()
    await db.refresh(imported)
    return OperationResult(success=True, importedProject=_project_to_schema(imported))


@router.post("/upload", response_model=OperationResult)
async def upload_file(
    file: UploadFile = File(...),
    columnMapping: str = Form(None),
    mappings: str = Form(None),
    projectName: str = Form(None),
    datasetName: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload file to the active project and persist dataset metadata."""
    try:
        project: Optional[ProjectModel] = None
        if projectName:
            project = await find_project_by_name(db, projectName)
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if not project:
            project = await get_active_project(db)

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        project_dir = UPLOAD_DIR / project.id
        project_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename to prevent path traversal attacks
        safe_filename = sanitize_filename(file.filename)
        dest = project_dir / safe_filename
        content = await file.read()
        dest.write_bytes(content)

        # Count rows for metadata (best-effort, using chunks to avoid memory spikes)
        row_count = None
        try:
            row_count = 0
            for chunk in pd.read_csv(dest, chunksize=50000):
                row_count += len(chunk)
        except Exception:
            row_count = None

        # Parse column mapping (optional) sent by the UI
        parsed_mapping = None
        mapping_payload = columnMapping or mappings
        if mapping_payload:
            try:
                parsed_mapping = json.loads(mapping_payload)
            except Exception:
                parsed_mapping = None

        dataset_id = str(uuid.uuid4())
        # Deactivate other datasets for this project
        await db.execute(
            update(DatasetModel)
            .where(DatasetModel.project_id == project.id)
            .values(is_active=0)
        )

        dataset = DatasetModel(
            dataset_id=dataset_id,
            name=datasetName or file.filename,
            upload_date=datetime.utcnow(),
            row_count=row_count,
            file_type=file.content_type or "unknown",
            size=len(content),
            is_active=1,
            is_snapshot=0,
            snapshot_group=None,
            description=f"Uploaded {file.filename}" + (f" for project {project.name}" if projectName else ""),
            project_id=project.id,
            file_path=str(dest),
            column_mapping=parsed_mapping,
        )
        db.add(dataset)
        await db.commit()

        return OperationResult(
            success=True,
            message="File uploaded successfully",
            filePath=str(dest),
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Rollback any partial changes on error
        await db.rollback()
        logger.error(f"File upload failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(exc, "file upload"),
        )
