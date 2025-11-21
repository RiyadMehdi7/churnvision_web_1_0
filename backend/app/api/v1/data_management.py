from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
import uuid
from datetime import datetime

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.dataset import Dataset as DatasetModel, Connection as ConnectionModel, ScopedProject
from app.schemas.data_management import (
    Project, Dataset, Connection, CreateConnectionRequest,
    ImportFromDbRequest, CreateProjectRequest, SetActiveProjectRequest,
    OperationResult
)

router = APIRouter()

# --- Projects ---

@router.get("/projects", response_model=List[Project])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List available projects"""
    # For now, return a default project or fetch from ScopedProject
    # In a real web app, projects might be organizations or workspaces
    
    query = select(ScopedProject).where(ScopedProject.active == 1)
    result = await db.execute(query)
    projects = result.scalars().all()
    
    if not projects:
        # Return a default project if none exist
        return [Project(
            name="Default Project",
            path="/default",
            dbPath="default.db",
            exists=True
        )]
        
    return [
        Project(
            name=p.project_name or f"Project {p.id}",
            path=p.project_dir,
            dbPath=f"{p.project_dir}/database.db",
            exists=True
        ) for p in projects
    ]

@router.post("/projects", response_model=OperationResult)
async def create_project(
    request: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    # Mock implementation for web
    new_project = ScopedProject(
        scope_level="user",
        scope_id=str(current_user.id),
        project_dir=f"/projects/{request.name}",
        project_name=request.name
    )
    db.add(new_project)
    await db.commit()
    
    return OperationResult(
        success=True,
        project=Project(
            name=request.name,
            path=f"/projects/{request.name}",
            dbPath=f"/projects/{request.name}/database.db",
            exists=True
        )
    )

@router.post("/projects/active", response_model=OperationResult)
async def set_active_project(
    request: SetActiveProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set active project"""
    # In a web app, active project is usually session-based or stored in user preferences
    # For now, just return success
    return OperationResult(success=True)

@router.delete("/projects/{path:path}", response_model=OperationResult)
async def delete_project(
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a project"""
    # Mock implementation
    return OperationResult(success=True)

# --- Datasets ---

@router.get("/datasets", response_model=List[Dataset])
async def list_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List datasets"""
    query = select(DatasetModel).where(DatasetModel.is_active == 1)
    result = await db.execute(query)
    datasets = result.scalars().all()
    
    return [
        Dataset(
            id=d.dataset_id,
            name=d.name,
            type=d.file_type or "Unknown",
            size=d.size or 0,
            uploadedAt=d.upload_date,
            rowCount=d.row_count,
            active=bool(d.is_active),
            isSnapshot=bool(d.is_snapshot),
            snapshotGroup=d.snapshot_group,
            description=d.description
        ) for d in datasets
    ]

@router.delete("/datasets/{dataset_id}", response_model=OperationResult)
async def delete_dataset(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a dataset"""
    query = delete(DatasetModel).where(DatasetModel.dataset_id == dataset_id)
    await db.execute(query)
    await db.commit()
    
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
    # file: UploadFile = File(...), # In real implementation
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload file"""
    # Mock implementation
    return OperationResult(success=True, message="File uploaded successfully")
