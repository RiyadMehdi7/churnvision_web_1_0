"""
Tests for app/api/v1/data_management.py - Data Management endpoints.

Tests cover:
- Project CRUD (list, create, set active, delete)
- Dataset CRUD (list, delete, preview, activate, quality)
- Connection management
- File upload
- Data quality analysis
"""
import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_legacy_user():
    """Create a mock legacy user for auth."""
    user = MagicMock()
    user.id = 1
    user.username = "testuser"
    user.email = "test@example.com"
    user.is_active = True
    return user


@pytest.fixture
def mock_project():
    """Create a mock project."""
    project = MagicMock()
    project.id = "proj-001"
    project.name = "Test Project"
    project.path = "/projects/test-project"
    project.db_path = "/projects/test-project/database.db"
    project.is_active = True
    project.created_at = datetime.utcnow()
    return project


@pytest.fixture
def mock_inactive_project():
    """Create a mock inactive project."""
    project = MagicMock()
    project.id = "proj-002"
    project.name = "Inactive Project"
    project.path = "/projects/inactive"
    project.db_path = "/projects/inactive/database.db"
    project.is_active = False
    project.created_at = datetime.utcnow()
    return project


@pytest.fixture
def mock_dataset():
    """Create a mock dataset."""
    dataset = MagicMock()
    dataset.dataset_id = "ds-001"
    dataset.name = "employees.csv"
    dataset.file_type = "text/csv"
    dataset.size = 1024
    dataset.upload_date = datetime.utcnow()
    dataset.row_count = 100
    dataset.is_active = 1
    dataset.is_snapshot = 0
    dataset.snapshot_group = None
    dataset.description = "Employee data"
    dataset.project_id = "proj-001"
    dataset.file_path = "/uploads/proj-001/employees.csv"
    dataset.column_mapping = None
    return dataset


@pytest.fixture
def mock_connection():
    """Create a mock database connection."""
    conn = MagicMock()
    conn.connection_id = "conn-001"
    conn.name = "HR Database"
    conn.type = "postgresql"
    conn.host = "localhost"
    conn.port = 5432
    conn.username = "hr_user"
    conn.database_name = "hr_db"
    conn.is_active = 1
    conn.last_used = datetime.utcnow()
    return conn


@pytest.fixture
def mock_hr_data_row():
    """Create a mock HR data input row."""
    row = MagicMock()
    row.hr_code = "EMP001"
    row.full_name = "John Doe"
    row.structure_name = "Engineering"
    row.position = "Software Engineer"
    row.status = "Active"
    row.manager_id = "EMP000"
    row.tenure = 2.5
    row.employee_cost = 75000.0
    row.report_date = datetime.utcnow()
    row.termination_date = None
    row.additional_data = {"location": "NYC"}
    return row


# ============ Test Projects ============

class TestListProjects:
    """Test project listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_projects_success(self, mock_db_session, mock_legacy_user, mock_project):
        """Should list all projects."""
        from app.api.v1.data_management import list_projects

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_project]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.data_management.ensure_default_project", new_callable=AsyncMock):
            result = await list_projects(
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert len(result) == 1
        assert result[0].name == "Test Project"
        assert result[0].active is True

    @pytest.mark.asyncio
    async def test_list_projects_empty(self, mock_db_session, mock_legacy_user):
        """Should return empty list when no projects exist."""
        from app.api.v1.data_management import list_projects

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.data_management.ensure_default_project", new_callable=AsyncMock):
            result = await list_projects(
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert len(result) == 0


class TestCreateProject:
    """Test project creation endpoint."""

    @pytest.mark.asyncio
    async def test_create_project_success(self, mock_db_session, mock_legacy_user):
        """Should create a new project."""
        from app.api.v1.data_management import create_project
        from app.schemas.data_management import CreateProjectRequest

        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        async def mock_refresh(obj):
            obj.id = "proj-new"
            obj.path = "/projects/my-new-project"
            obj.db_path = "/projects/my-new-project/database.db"
            obj.is_active = False

        mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)

        request = CreateProjectRequest(name="My New Project")

        result = await create_project(
            request=request,
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is True
        assert result.project is not None
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_project_sanitizes_name(self, mock_db_session, mock_legacy_user):
        """Should sanitize project name for path."""
        from app.api.v1.data_management import _sanitize_project_name

        result = _sanitize_project_name("My Test Project!")

        assert result == "my-test-project"
        assert " " not in result
        assert "!" not in result


class TestSetActiveProject:
    """Test setting active project endpoint."""

    @pytest.mark.asyncio
    async def test_set_active_project_success(self, mock_db_session, mock_legacy_user, mock_project):
        """Should set project as active."""
        from app.api.v1.data_management import set_active_project
        from app.schemas.data_management import SetActiveProjectRequest

        request = SetActiveProjectRequest(dbPath="/projects/test-project/database.db")

        with patch("app.api.v1.data_management.find_project_by_db_path", new_callable=AsyncMock) as mock_find:
            mock_find.return_value = mock_project
            with patch("app.api.v1.data_management.set_active_project_service", new_callable=AsyncMock):
                result = await set_active_project(
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_set_active_project_not_found(self, mock_db_session, mock_legacy_user):
        """Should return 404 for non-existent project."""
        from app.api.v1.data_management import set_active_project
        from app.schemas.data_management import SetActiveProjectRequest

        request = SetActiveProjectRequest(dbPath="/nonexistent/database.db")

        with patch("app.api.v1.data_management.find_project_by_db_path", new_callable=AsyncMock) as mock_find:
            mock_find.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                await set_active_project(
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404
            assert "Project not found" in exc_info.value.detail


class TestDeleteProject:
    """Test project deletion endpoint."""

    @pytest.mark.asyncio
    async def test_delete_project_success(self, mock_db_session, mock_legacy_user, mock_project):
        """Should delete a project."""
        from app.api.v1.data_management import delete_project

        mock_db_session.scalar = AsyncMock(return_value=mock_project)
        mock_db_session.execute = AsyncMock()
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.data_management.ensure_default_project", new_callable=AsyncMock):
            with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock):
                result = await delete_project(
                    path="projects/test-project",
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_delete_project_not_found(self, mock_db_session, mock_legacy_user):
        """Should return failure for non-existent project."""
        from app.api.v1.data_management import delete_project

        mock_db_session.scalar = AsyncMock(return_value=None)

        result = await delete_project(
            path="nonexistent",
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is False
        assert "not found" in result.error.lower()


# ============ Test Datasets ============

class TestListDatasets:
    """Test dataset listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_datasets_success(self, mock_db_session, mock_legacy_user, mock_project, mock_dataset):
        """Should list datasets for active project."""
        from app.api.v1.data_management import list_datasets

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_dataset]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            result = await list_datasets(
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert len(result) == 1
        assert result[0].name == "employees.csv"
        assert result[0].active is True


class TestDeleteDataset:
    """Test dataset deletion endpoint."""

    @pytest.mark.asyncio
    async def test_delete_dataset_success(self, mock_db_session, mock_legacy_user, mock_project, mock_dataset):
        """Should delete a dataset."""
        from app.api.v1.data_management import delete_dataset

        mock_db_session.scalar = AsyncMock(return_value=mock_dataset)
        mock_db_session.execute = AsyncMock()
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with patch("pathlib.Path.unlink"):
                result = await delete_dataset(
                    dataset_id="ds-001",
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_delete_dataset_not_found(self, mock_db_session, mock_legacy_user, mock_project):
        """Should return 404 for non-existent dataset."""
        from app.api.v1.data_management import delete_dataset

        # Return None for both queries (active project and legacy datasets)
        mock_db_session.scalar = AsyncMock(return_value=None)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with pytest.raises(HTTPException) as exc_info:
                await delete_dataset(
                    dataset_id="nonexistent",
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404


class TestDatasetPreview:
    """Test dataset preview endpoint."""

    @pytest.mark.asyncio
    async def test_get_dataset_preview_success(
        self, mock_db_session, mock_legacy_user, mock_project, mock_dataset, mock_hr_data_row
    ):
        """Should return dataset preview with rows."""
        from app.api.v1.data_management import get_dataset_preview

        mock_db_session.scalar = AsyncMock(return_value=mock_dataset)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_hr_data_row]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            result = await get_dataset_preview(
                dataset_id="ds-001",
                limit=50,
                offset=0,
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert result["dataset_id"] == "ds-001"
        assert len(result["rows"]) == 1
        assert result["rows"][0]["hr_code"] == "EMP001"

    @pytest.mark.asyncio
    async def test_get_dataset_preview_not_found(self, mock_db_session, mock_legacy_user, mock_project):
        """Should return 404 for non-existent dataset."""
        from app.api.v1.data_management import get_dataset_preview

        mock_db_session.scalar = AsyncMock(return_value=None)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with pytest.raises(HTTPException) as exc_info:
                await get_dataset_preview(
                    dataset_id="nonexistent",
                    limit=50,
                    offset=0,
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404


class TestActivateDataset:
    """Test dataset activation endpoint."""

    @pytest.mark.asyncio
    async def test_activate_dataset_success(self, mock_db_session, mock_legacy_user, mock_project, mock_dataset):
        """Should activate a dataset."""
        from app.api.v1.data_management import activate_dataset

        mock_db_session.scalar = AsyncMock(return_value=mock_dataset)
        mock_db_session.execute = AsyncMock()
        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            result = await activate_dataset(
                dataset_id="ds-001",
                current_user=mock_legacy_user,
                db=mock_db_session
            )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_activate_dataset_not_found(self, mock_db_session, mock_legacy_user, mock_project):
        """Should return 404 for non-existent dataset."""
        from app.api.v1.data_management import activate_dataset

        mock_db_session.scalar = AsyncMock(return_value=None)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with pytest.raises(HTTPException) as exc_info:
                await activate_dataset(
                    dataset_id="nonexistent",
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404


# ============ Test Connections ============

class TestListConnections:
    """Test connection listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_connections_success(self, mock_db_session, mock_legacy_user, mock_connection):
        """Should list active connections."""
        from app.api.v1.data_management import list_connections

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_connection]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_connections(
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert len(result) == 1
        assert result[0].name == "HR Database"
        assert result[0].type == "postgresql"
        assert result[0].host == "localhost"


class TestCreateConnection:
    """Test connection creation endpoint."""

    @pytest.mark.asyncio
    async def test_create_connection_success(self, mock_db_session, mock_legacy_user):
        """Should create a new connection."""
        from app.api.v1.data_management import create_connection
        from app.schemas.data_management import CreateConnectionRequest

        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        request = CreateConnectionRequest(
            name="New Connection",
            type="postgresql",
            host="db.example.com",
            port=5432,
            username="app_user",
            password="secret123",
            databaseName="app_db"
        )

        result = await create_connection(
            request=request,
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is True
        mock_db_session.add.assert_called_once()


class TestListTables:
    """Test connection tables listing endpoint."""

    @pytest.mark.asyncio
    async def test_list_tables_returns_mock_data(self, mock_db_session, mock_legacy_user):
        """Should return mock table names."""
        from app.api.v1.data_management import list_tables

        result = await list_tables(
            connection_id="conn-001",
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert isinstance(result, list)
        assert "employees" in result


# ============ Test Import/Export ============

class TestImportFromDb:
    """Test database import endpoint."""

    @pytest.mark.asyncio
    async def test_import_from_db_success(self, mock_db_session, mock_legacy_user):
        """Should return success for DB import (placeholder)."""
        from app.api.v1.data_management import import_from_db
        from app.schemas.data_management import ImportFromDbRequest

        request = ImportFromDbRequest(
            connectionId="conn-001",
            tableName="employees",
            datasetName="Imported Employees"
        )

        result = await import_from_db(
            request=request,
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is True
        assert "employees" in result.message


class TestExportProject:
    """Test project export endpoint."""

    @pytest.mark.asyncio
    async def test_export_project_success(self, mock_db_session, mock_legacy_user):
        """Should return success with file path."""
        from app.api.v1.data_management import export_project

        result = await export_project(
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is True
        assert result.filePath is not None


class TestImportProject:
    """Test project import endpoint."""

    @pytest.mark.asyncio
    async def test_import_project_success(self, mock_db_session, mock_legacy_user):
        """Should import a new project."""
        from app.api.v1.data_management import import_project

        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        async def mock_refresh(obj):
            obj.id = "proj-imported"
            obj.name = "Imported Project"
            obj.path = "/projects/imported"
            obj.db_path = "/projects/imported/database.db"
            obj.is_active = False

        mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)

        result = await import_project(
            current_user=mock_legacy_user,
            db=mock_db_session
        )

        assert result.success is True
        assert result.importedProject is not None


# ============ Test Data Quality ============

class TestGetDatasetQuality:
    """Test dataset quality assessment endpoint."""

    @pytest.mark.asyncio
    async def test_get_dataset_quality_not_found(self, mock_db_session, mock_legacy_user, mock_project):
        """Should return 404 for non-existent dataset."""
        from app.api.v1.data_management import get_dataset_quality

        mock_db_session.scalar = AsyncMock(return_value=None)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with pytest.raises(HTTPException) as exc_info:
                await get_dataset_quality(
                    dataset_id="nonexistent",
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404


class TestGetActiveDatasetQuality:
    """Test active dataset quality assessment endpoint."""

    @pytest.mark.asyncio
    async def test_get_active_dataset_quality_no_active(self, mock_db_session, mock_legacy_user, mock_project):
        """Should return 404 when no active dataset exists."""
        from app.api.v1.data_management import get_active_dataset_quality

        mock_db_session.scalar = AsyncMock(return_value=None)

        with patch("app.api.v1.data_management.get_active_project", new_callable=AsyncMock) as mock_get_active:
            mock_get_active.return_value = mock_project
            with pytest.raises(HTTPException) as exc_info:
                await get_active_dataset_quality(
                    current_user=mock_legacy_user,
                    db=mock_db_session
                )

            assert exc_info.value.status_code == 404
            assert "No active dataset found" in exc_info.value.detail


# ============ Test Schema Conversions ============

class TestSchemaConversions:
    """Test schema conversion helper functions."""

    def test_project_to_schema(self, mock_project):
        """Should convert project model to schema."""
        from app.api.v1.data_management import _project_to_schema

        result = _project_to_schema(mock_project)

        assert result.id == "proj-001"
        assert result.name == "Test Project"
        assert result.path == "/projects/test-project"
        assert result.active is True

    def test_dataset_to_schema(self, mock_dataset):
        """Should convert dataset model to schema."""
        from app.api.v1.data_management import _dataset_to_schema

        result = _dataset_to_schema(mock_dataset)

        assert result.id == "ds-001"
        assert result.name == "employees.csv"
        assert result.type == "text/csv"
        assert result.rowCount == 100
        assert result.active is True
