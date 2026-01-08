"""
Centralized Dataset Service.

Consolidates duplicate dataset retrieval logic from churn.py and employees.py.
All dataset-related queries should go through this service.
"""

from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset as DatasetModel
from app.services.data.project_service import get_active_project, ensure_default_project


class DatasetService:
    """
    Centralized service for dataset operations.

    Provides:
    - get_active_dataset(): Full validation including file existence
    - get_active_dataset_id(): Just the ID for status queries
    - get_active_dataset_entry(): Optional model without validation
    """

    @staticmethod
    async def get_active_dataset(
        db: AsyncSession,
        validate_file: bool = True
    ) -> DatasetModel:
        """
        Get the active dataset for the current project.

        Args:
            db: Database session
            validate_file: If True, validate that file_path exists on disk

        Returns:
            DatasetModel: The active dataset

        Raises:
            HTTPException: If no active dataset, missing file path, or file not found
        """
        await ensure_default_project(db)
        active_project = await get_active_project(db)

        dataset = await db.scalar(
            select(DatasetModel).where(
                DatasetModel.project_id == active_project.id,
                DatasetModel.is_active == 1,
            )
        )

        if not dataset:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active dataset for project"
            )

        if validate_file:
            if not dataset.file_path:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Active dataset missing file path"
                )

            if not Path(dataset.file_path).exists():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Active dataset file not found on disk"
                )

        return dataset

    @staticmethod
    async def get_active_dataset_id(db: AsyncSession) -> Optional[str]:
        """
        Get the active dataset ID for the current project.

        This is a lightweight query that doesn't validate file existence.
        Useful for status endpoints where the file might not exist yet.

        Args:
            db: Database session

        Returns:
            Optional[str]: Dataset ID or None if no active dataset
        """
        try:
            await ensure_default_project(db)
            active_project = await get_active_project(db)

            dataset = await db.scalar(
                select(DatasetModel).where(
                    DatasetModel.project_id == active_project.id,
                    DatasetModel.is_active == 1,
                )
            )
            return dataset.dataset_id if dataset else None
        except Exception:
            return None

    @staticmethod
    async def get_active_dataset_entry(db: AsyncSession) -> Optional[DatasetModel]:
        """
        Get the active dataset entry without file validation.

        Returns the DatasetModel or None if no active dataset exists.
        Does not raise exceptions - callers should handle None case.

        Args:
            db: Database session

        Returns:
            Optional[DatasetModel]: The active dataset or None
        """
        await ensure_default_project(db)
        active_project = await get_active_project(db)

        return await db.scalar(
            select(DatasetModel).where(
                DatasetModel.project_id == active_project.id,
                DatasetModel.is_active == 1,
            )
        )


# Module-level singleton instance
dataset_service = DatasetService()


# Convenience functions for backwards compatibility
async def get_active_dataset(
    db: AsyncSession,
    validate_file: bool = True
) -> DatasetModel:
    """Get the active dataset for the current project."""
    return await dataset_service.get_active_dataset(db, validate_file)


async def get_active_dataset_id(db: AsyncSession) -> Optional[str]:
    """Get the active dataset ID for the current project."""
    return await dataset_service.get_active_dataset_id(db)


async def get_active_dataset_entry(db: AsyncSession) -> Optional[DatasetModel]:
    """Get the active dataset entry without validation."""
    return await dataset_service.get_active_dataset_entry(db)
