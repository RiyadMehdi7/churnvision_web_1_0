"""
Tests for Projects API Endpoints

Tests the scoped project management system including:
- List all projects
- Get individual project details
- Default project fallback behavior
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db_session():
    """Mock async database session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.username = "analyst"
    user.email = "analyst@example.com"
    user.role = "analyst"
    user.is_active = True
    return user


@pytest.fixture
def mock_project():
    """Mock ScopedProject object."""
    project = MagicMock()
    project.id = "proj-123"
    project.project_name = "HR Analytics 2026"
    project.project_dir = "/projects/hr-analytics-2026"
    project.active = 1
    project.created_at = datetime(2026, 1, 1, 10, 0, 0)
    project.last_synced_at = datetime(2026, 1, 10, 15, 30, 0)
    return project


@pytest.fixture
def mock_projects_list(mock_project):
    """Mock list of multiple projects."""
    project2 = MagicMock()
    project2.id = "proj-456"
    project2.project_name = "Sales Retention Q1"
    project2.project_dir = "/projects/sales-retention-q1"
    project2.active = 1
    project2.created_at = datetime(2026, 1, 5, 9, 0, 0)
    project2.last_synced_at = datetime(2026, 1, 9, 12, 0, 0)

    project3 = MagicMock()
    project3.id = "proj-789"
    project3.project_name = "Engineering Team Analysis"
    project3.project_dir = "/projects/eng-team"
    project3.active = 1
    project3.created_at = datetime(2025, 12, 15, 14, 0, 0)
    project3.last_synced_at = datetime(2026, 1, 8, 10, 0, 0)

    return [mock_project, project2, project3]


# =============================================================================
# List Projects Tests
# =============================================================================

class TestListProjects:
    """Tests for GET /projects endpoint."""

    @pytest.mark.asyncio
    async def test_list_projects_success(
        self, mock_db_session, mock_user, mock_projects_list
    ):
        """Test listing all active projects."""
        from app.api.v1.projects import list_projects

        # Mock query result
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_projects_list
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_projects(
            current_user=mock_user,
            db=mock_db_session
        )

        assert len(result) == 3
        assert result[0]["id"] == "proj-123"
        assert result[0]["name"] == "HR Analytics 2026"
        assert result[0]["path"] == "/projects/hr-analytics-2026"
        assert "dbPath" in result[0]

    @pytest.mark.asyncio
    async def test_list_projects_empty_returns_default(
        self, mock_db_session, mock_user
    ):
        """Test that empty project list returns default placeholder."""
        from app.api.v1.projects import list_projects

        # Mock empty query result
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_projects(
            current_user=mock_user,
            db=mock_db_session
        )

        assert len(result) == 1
        assert result[0]["id"] == "default"
        assert result[0]["name"] == "Default Project"
        assert result[0]["path"] == "/projects/default"

    @pytest.mark.asyncio
    async def test_list_projects_serialization(
        self, mock_db_session, mock_user, mock_project
    ):
        """Test project serialization format."""
        from app.api.v1.projects import list_projects

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_project]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_projects(
            current_user=mock_user,
            db=mock_db_session
        )

        project = result[0]
        assert project["id"] == "proj-123"
        assert project["name"] == "HR Analytics 2026"
        assert project["created_at"] == "2026-01-01T10:00:00"
        assert project["updated_at"] == "2026-01-10T15:30:00"
        assert project["dbPath"] == "/projects/hr-analytics-2026/database.db"
        assert project["path"] == "/projects/hr-analytics-2026"

    @pytest.mark.asyncio
    async def test_list_projects_without_name(
        self, mock_db_session, mock_user
    ):
        """Test project with null name gets default name."""
        from app.api.v1.projects import list_projects

        project_no_name = MagicMock()
        project_no_name.id = "proj-999"
        project_no_name.project_name = None  # No name set
        project_no_name.project_dir = "/projects/unnamed"
        project_no_name.active = 1
        project_no_name.created_at = datetime(2026, 1, 1)
        project_no_name.last_synced_at = datetime(2026, 1, 1)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [project_no_name]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_projects(
            current_user=mock_user,
            db=mock_db_session
        )

        # Should use fallback name
        assert result[0]["name"] == "Project proj-999"


# =============================================================================
# Get Project Tests
# =============================================================================

class TestGetProject:
    """Tests for GET /projects/{project_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_project_success(
        self, mock_db_session, mock_user, mock_project
    ):
        """Test getting a single project by ID."""
        from app.api.v1.projects import get_project

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_project(
            project_id="proj-123",
            current_user=mock_user,
            db=mock_db_session
        )

        assert result["id"] == "proj-123"
        assert result["name"] == "HR Analytics 2026"
        assert result["path"] == "/projects/hr-analytics-2026"

    @pytest.mark.asyncio
    async def test_get_project_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when project doesn't exist."""
        from app.api.v1.projects import get_project
        from fastapi import HTTPException

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_project(
                project_id="nonexistent",
                current_user=mock_user,
                db=mock_db_session
            )

        assert exc_info.value.status_code == 404
        assert "not found" in str(exc_info.value.detail).lower()

    @pytest.mark.asyncio
    async def test_get_project_serialization(
        self, mock_db_session, mock_user, mock_project
    ):
        """Test project response format matches expected schema."""
        from app.api.v1.projects import get_project

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_project(
            project_id="proj-123",
            current_user=mock_user,
            db=mock_db_session
        )

        # Verify all expected fields are present
        expected_fields = ["id", "name", "created_at", "updated_at", "dbPath", "path"]
        for field in expected_fields:
            assert field in result, f"Missing field: {field}"


# =============================================================================
# Serialize Project Helper Tests
# =============================================================================

class TestSerializeProject:
    """Tests for _serialize_project helper function."""

    def test_serialize_project_with_datetime(self, mock_project):
        """Test serialization with datetime objects."""
        from app.api.v1.projects import _serialize_project

        result = _serialize_project(mock_project)

        assert result["id"] == "proj-123"
        assert result["name"] == "HR Analytics 2026"
        assert result["created_at"] == "2026-01-01T10:00:00"
        assert result["updated_at"] == "2026-01-10T15:30:00"

    def test_serialize_project_with_string_dates(self):
        """Test serialization when dates are already strings."""
        from app.api.v1.projects import _serialize_project

        project = MagicMock()
        project.id = "proj-str"
        project.project_name = "String Dates Project"
        project.project_dir = "/projects/str-dates"
        project.created_at = "2026-01-01T00:00:00"  # Already string
        project.last_synced_at = "2026-01-10T00:00:00"

        result = _serialize_project(project)

        assert result["created_at"] == "2026-01-01T00:00:00"
        assert result["updated_at"] == "2026-01-10T00:00:00"

    def test_serialize_project_null_name(self):
        """Test serialization with null project name."""
        from app.api.v1.projects import _serialize_project

        project = MagicMock()
        project.id = "proj-noname"
        project.project_name = None
        project.project_dir = "/projects/noname"
        project.created_at = datetime(2026, 1, 1)
        project.last_synced_at = datetime(2026, 1, 1)

        result = _serialize_project(project)

        # Should fallback to "Project {id}"
        assert result["name"] == "Project proj-noname"

    def test_serialize_project_db_path_format(self, mock_project):
        """Test that dbPath is correctly derived from project_dir."""
        from app.api.v1.projects import _serialize_project

        result = _serialize_project(mock_project)

        assert result["dbPath"] == f"{mock_project.project_dir}/database.db"
        assert result["path"] == mock_project.project_dir


# =============================================================================
# Authentication Tests
# =============================================================================

class TestProjectAuthentication:
    """Tests for authentication requirements."""

    @pytest.mark.asyncio
    async def test_list_projects_requires_auth(self):
        """Test that list_projects requires current_user."""
        from app.api.v1.projects import list_projects
        import inspect

        # Verify endpoint has current_user dependency
        sig = inspect.signature(list_projects)
        params = list(sig.parameters.keys())
        assert "current_user" in params

    @pytest.mark.asyncio
    async def test_get_project_requires_auth(self):
        """Test that get_project requires current_user."""
        from app.api.v1.projects import get_project
        import inspect

        sig = inspect.signature(get_project)
        params = list(sig.parameters.keys())
        assert "current_user" in params
