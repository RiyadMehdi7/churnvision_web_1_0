from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from typing import List
import json
import uuid
from datetime import datetime
from pathlib import Path
from copy import deepcopy

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.dataset import Dataset as DatasetModel, Connection as ConnectionModel, ScopedProject
from app.schemas.data_management import (
    Project, Dataset, Connection, CreateConnectionRequest,
    ImportFromDbRequest, CreateProjectRequest, SetActiveProjectRequest,
    OperationResult
)

router = APIRouter()
UPLOAD_DIR = Path("/tmp/churnvision/uploads")
PROJECT_STORE: list[dict] = [{
    "id": "default",
    "name": "Default Project",
    "path": "/default",
    "dbPath": "default.db",
    "exists": True,
    "active": True,
}]
DATASET_STORE: list[dict] = []

# --- Projects ---

@router.get("/projects", response_model=List[Project])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List available projects"""
    # Use in-memory store for now; avoids recreating the default after deletion
    return [Project(**p) for p in PROJECT_STORE]

@router.post("/projects", response_model=OperationResult)
async def create_project(
    request: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    project_id = str(uuid.uuid4())
    project_dir = f"/projects/{request.name}"
    project = {
        "id": project_id,
        "name": request.name,
        "path": project_dir,
        "dbPath": f"{project_dir}/database.db",
        "exists": True,
        "active": False,
    }
    PROJECT_STORE.append(project)

    return OperationResult(success=True, project=Project(**project))

@router.post("/projects/active", response_model=OperationResult)
async def set_active_project(
    request: SetActiveProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set active project"""
    for p in PROJECT_STORE:
        p["active"] = (p.get("dbPath") == request.dbPath)
    return OperationResult(success=True)

@router.delete("/projects/{path:path}", response_model=OperationResult)
async def delete_project(
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a project"""
    removed = False
    for p in list(PROJECT_STORE):
        if p.get("path") == f"/{path.lstrip('/')}":
            PROJECT_STORE.remove(p)
            removed = True
            break

    # Remove datasets tied to the project
    if removed:
        target_path = f"/{path.lstrip('/')}"
        target_id = None
        for proj in PROJECT_STORE:
            if proj.get("path") == target_path:
                target_id = proj.get("id")
                break
        if target_id:
            for d in list(DATASET_STORE):
                if d.get("projectId") == target_id:
                    DATASET_STORE.remove(d)

    return OperationResult(success=removed, error=None if removed else "Project not found")

# --- Datasets ---

@router.get("/datasets", response_model=List[Dataset])
async def list_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List datasets scoped to the active project only."""
    active_project = next((p for p in PROJECT_STORE if p.get("active")), None)
    if not active_project:
        # When no active project is selected, do not leak datasets from other projects
        return []

    project_id = active_project.get("id")
    datasets = [d for d in DATASET_STORE if d.get("projectId") == project_id]

    return [Dataset(**d) for d in datasets]

@router.delete("/datasets/{dataset_id}", response_model=OperationResult)
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a dataset scoped to the active project."""
    active_project = next((p for p in PROJECT_STORE if p.get("active")), None)
    if not active_project:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active project selected")

    project_id = active_project.get("id")

    # Remove from in-memory store first so the UI reflects the change immediately
    removed = False
    for idx, d in enumerate(list(DATASET_STORE)):
        if d.get("id") == dataset_id and d.get("projectId") == project_id:
            DATASET_STORE.pop(idx)
            removed = True
            break

    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found for active project")

    # Best-effort delete from DB (datasets table does not store project_id)
    try:
        await db.execute(delete(DatasetModel).where(DatasetModel.dataset_id == dataset_id))
        await db.commit()
    except Exception:
        await db.rollback()

    return OperationResult(success=True)


@router.post("/datasets/{dataset_id}/activate", response_model=OperationResult)
async def activate_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set a dataset as active for the current project (and deactivate others)."""
    active_project = next((p for p in PROJECT_STORE if p.get("active")), None)
    if not active_project:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active project selected")

    project_id = active_project.get("id")

    found = False
    for d in DATASET_STORE:
        if project_id and d.get("projectId") != project_id:
            continue
        if d.get("id") == dataset_id:
            d["active"] = True
            found = True
        else:
            # Deactivate other datasets for the same project scope
            d["active"] = False

    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found for active project")

    # Sync active flags to DB best-effort
    try:
        await db.execute(update(DatasetModel).values(is_active=0))
        await db.execute(
            update(DatasetModel)
            .where(DatasetModel.dataset_id == dataset_id)
            .values(is_active=1)
        )
        await db.commit()
    except Exception:
        await db.rollback()

    return OperationResult(success=True)

# --- Connections ---

@router.get("/connections", response_model=List[Connection])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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
            status="active" # Mock status
        ) for c in connections
    ]

@router.post("/connections", response_model=OperationResult)
async def create_connection(
    request: CreateConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a connection"""
    new_conn = ConnectionModel(
        connection_id=str(uuid.uuid4()),
        name=request.name,
        type=request.type,
        host=request.host,
        port=request.port,
        username=request.username,
        database_name=request.databaseName
    )
    db.add(new_conn)
    await db.commit()
    
    return OperationResult(success=True)

@router.get("/connections/{connection_id}/tables", response_model=List[str])
async def list_tables(
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List tables in a connection"""
    # Mock implementation as we can't easily connect to external DBs from here without drivers
    return ["employees", "departments", "salaries", "performance_reviews"]

@router.post("/import/db", response_model=OperationResult)
async def import_from_db(
    request: ImportFromDbRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Import data from DB"""
    # Mock implementation
    return OperationResult(success=True, message=f"Imported data from {request.tableName} to {request.datasetName}")

@router.post("/projects/export", response_model=OperationResult)
async def export_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Export project"""
    # Mock implementation
    return OperationResult(success=True, filePath="/tmp/export.zip")

@router.post("/projects/import", response_model=OperationResult)
async def import_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Import project"""
    # Mock implementation
    return OperationResult(success=True, importedProject=Project(
        name="Imported Project",
        path="/projects/imported",
        dbPath="/projects/imported/database.db",
        exists=True
    ))

@router.post("/upload", response_model=OperationResult)
async def upload_file(
    file: UploadFile = File(...),
    columnMapping: str = Form(None),
    mappings: str = Form(None),
    projectName: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload file (mock implementation that persists to tmp and creates a dataset record)."""
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        dest = UPLOAD_DIR / file.filename
        content = await file.read()
        dest.write_bytes(content)

        # Determine active project
        active_project = next((p for p in PROJECT_STORE if p.get("active")), None)
        project_id = None
        if projectName:
            by_name = next((p for p in PROJECT_STORE if p.get("name") == projectName), None)
            if not by_name:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
            project_id = by_name.get("id")
        if not project_id and active_project:
            project_id = active_project.get("id")

        if not project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active project selected")

        # Set active flags per project (only one active dataset per project)
        if project_id:
            for d in DATASET_STORE:
                if d.get("projectId") == project_id:
                    d["active"] = False

        # Parse column mapping (optional) sent by the UI
        parsed_mapping = None
        mapping_payload = columnMapping or mappings
        if mapping_payload:
            try:
                parsed_mapping = json.loads(mapping_payload)
            except Exception:
                parsed_mapping = None

        # Create a mock dataset record so the UI can display it
        dataset = DatasetModel(
            dataset_id=str(uuid.uuid4()),
            name=file.filename,
            upload_date=datetime.utcnow(),
            row_count=None,
            file_type=file.content_type or "unknown",
            size=len(content),
            is_active=1,
            is_snapshot=0,
            snapshot_group=None,
            description=f"Uploaded {file.filename}" + (f" for project {projectName}" if projectName else ""),
        )
        db.add(dataset)
        try:
            await db.commit()
        except Exception:
            await db.rollback()

        dataset_entry = {
            "id": dataset.dataset_id,
            "name": dataset.name,
            "type": dataset.file_type or "Unknown",
            "size": dataset.size or 0,
            "uploadedAt": dataset.upload_date,
            "rowCount": dataset.row_count,
            "active": True if project_id else False,
            "isSnapshot": bool(dataset.is_snapshot),
            "snapshotGroup": dataset.snapshot_group,
            "description": dataset.description,
            "projectId": project_id,
            "snapshotPairDatasetId": None,
            "filePath": str(dest),
            "columnMapping": parsed_mapping,
        }
        DATASET_STORE.append(deepcopy(dataset_entry))

        return OperationResult(
            success=True,
            message="File uploaded successfully",
            filePath=str(dest),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {exc}",
        )
