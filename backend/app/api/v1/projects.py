from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db, get_current_user
from app.models.dataset import ScopedProject

router = APIRouter()


def _serialize_project(project: ScopedProject) -> dict:
    """Map ScopedProject ORM entity to the shape expected by the frontend."""
    return {
        "id": str(project.id),
        "name": project.project_name or f"Project {project.id}",
        "created_at": project.created_at.isoformat() if isinstance(project.created_at, datetime) else project.created_at,
        "updated_at": project.last_synced_at.isoformat() if isinstance(project.last_synced_at, datetime) else project.last_synced_at,
        "dbPath": f"{project.project_dir}/database.db",
        "path": project.project_dir,
    }


@router.get("/projects", response_model=List[dict])
async def list_projects(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List scoped projects for the current tenant/user."""
    result = await db.execute(
        select(ScopedProject).where(ScopedProject.active == 1)
    )
    projects = result.scalars().all()

    # If none exist, return a default placeholder to keep UI stable
    if not projects:
        return [
            {
                "id": "default",
                "name": "Default Project",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "dbPath": "/projects/default/database.db",
                "path": "/projects/default",
            }
        ]

    return [_serialize_project(p) for p in projects]


@router.get("/projects/{project_id}", response_model=dict)
async def get_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single project by id."""
    result = await db.execute(
        select(ScopedProject).where(ScopedProject.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return _serialize_project(project)
