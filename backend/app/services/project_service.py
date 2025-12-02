from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project

DEFAULT_PROJECT_ID = "default"
DEFAULT_PROJECT_NAME = "Default Project"
DEFAULT_PROJECT_PATH = "/default"
DEFAULT_PROJECT_DB_PATH = "/default/database.db"


async def ensure_default_project(db: AsyncSession) -> Project:
    project = await db.scalar(select(Project).where(Project.id == DEFAULT_PROJECT_ID))
    if project:
        return project

    project = Project(
        id=DEFAULT_PROJECT_ID,
        name=DEFAULT_PROJECT_NAME,
        path=DEFAULT_PROJECT_PATH,
        db_path=DEFAULT_PROJECT_DB_PATH,
        is_active=True,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def get_active_project(db: AsyncSession) -> Project:
    project = await db.scalar(select(Project).where(Project.is_active.is_(True)))
    if project:
        return project

    # Fallback to default if nothing is active
    project = await ensure_default_project(db)
    await db.execute(update(Project).values(is_active=False))
    project.is_active = True
    await db.commit()
    await db.refresh(project)
    return project


async def set_active_project(db: AsyncSession, project: Project) -> None:
    await db.execute(update(Project).values(is_active=False))
    project.is_active = True
    db.add(project)
    await db.commit()


async def find_project_by_name(db: AsyncSession, name: str) -> Optional[Project]:
    return await db.scalar(select(Project).where(Project.name == name))


async def find_project_by_db_path(db: AsyncSession, db_path: str) -> Optional[Project]:
    return await db.scalar(select(Project).where(Project.db_path == db_path))
