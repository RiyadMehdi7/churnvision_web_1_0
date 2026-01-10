"""
Tests for Connectors API Endpoints

Tests the HRIS/HCM integration system including:
- Available connectors listing
- OAuth flow initiation
- API key connection creation
- Connection management (CRUD)
- Sync operations and status
- Schema and preview endpoints
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
    session.add = MagicMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.username = "admin"
    user.email = "admin@example.com"
    user.role = "admin"
    return user


@pytest.fixture
def mock_connection():
    """Mock Connection database object."""
    conn = MagicMock()
    conn.connection_id = "conn_abc123"
    conn.name = "BambooHR Production"
    conn.connector_type = "bamboohr"
    conn.is_active = 1
    conn.created_at = datetime(2026, 1, 1, 10, 0, 0)
    conn.last_sync_at = datetime(2026, 1, 10, 8, 0, 0)
    conn.last_sync_status = "success"
    conn.last_sync_records = 150
    conn.last_sync_error = None
    conn.api_key_encrypted = "encrypted_api_key"
    conn.oauth_access_token_encrypted = None
    conn.oauth_refresh_token_encrypted = None
    conn.api_endpoint = "https://api.bamboohr.com/api/gateway.php/company"
    conn.tenant_id = "company_subdomain"
    conn.connector_config = {"sync_frequency_minutes": 60}
    return conn


@pytest.fixture
def mock_available_connectors():
    """Mock available connectors list."""
    return [
        {
            "connector_type": "bamboohr",
            "display_name": "BambooHR",
            "category": "hris",
            "auth_type": "api_key",
            "description": "BambooHR HRIS integration",
            "priority": "high",
            "status": "available"
        },
        {
            "connector_type": "workday",
            "display_name": "Workday",
            "category": "hris",
            "auth_type": "oauth2",
            "description": "Workday HCM integration",
            "priority": "high",
            "status": "available"
        },
        {
            "connector_type": "personio",
            "display_name": "Personio",
            "category": "hris",
            "auth_type": "api_key",
            "description": "Personio HR platform",
            "priority": "medium",
            "status": "planned"
        }
    ]


@pytest.fixture
def mock_test_result():
    """Mock connection test result."""
    result = MagicMock()
    result.success = True
    result.message = "Connection successful"
    result.latency_ms = 125.5
    result.permissions = ["employees:read", "reports:read"]
    result.errors = []
    return result


# =============================================================================
# List Available Connectors Tests
# =============================================================================

class TestListAvailableConnectors:
    """Tests for GET /connectors/available endpoint."""

    @pytest.mark.asyncio
    async def test_list_available_connectors_all(self, mock_user):
        """Test listing all available connectors."""
        from app.api.v1.connectors import list_available_connectors

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS") as mock_connectors:
            mock_connectors.copy.return_value = [
                {"connector_type": "bamboohr", "category": "hris", "status": "available",
                 "display_name": "BambooHR", "auth_type": "api_key", "description": "Test",
                 "priority": "high"},
                {"connector_type": "workday", "category": "hris", "status": "available",
                 "display_name": "Workday", "auth_type": "oauth2", "description": "Test",
                 "priority": "high"}
            ]
            mock_connectors.__iter__ = lambda self: iter(mock_connectors.copy())

            result = await list_available_connectors(
                category=None,
                status_filter=None,
                current_user=mock_user
            )

        assert result.total >= 0
        assert isinstance(result.categories, list)

    @pytest.mark.asyncio
    async def test_list_available_connectors_filter_by_category(self, mock_user):
        """Test filtering connectors by category."""
        from app.api.v1.connectors import list_available_connectors

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS") as mock_connectors:
            all_connectors = [
                {"connector_type": "bamboohr", "category": "hris", "status": "available",
                 "display_name": "BambooHR", "auth_type": "api_key", "description": "Test",
                 "priority": "high"},
                {"connector_type": "slack", "category": "communication", "status": "planned",
                 "display_name": "Slack", "auth_type": "oauth2", "description": "Test",
                 "priority": "low"}
            ]
            mock_connectors.copy.return_value = all_connectors
            mock_connectors.__iter__ = lambda self: iter(all_connectors)

            result = await list_available_connectors(
                category="hris",
                status_filter=None,
                current_user=mock_user
            )

        # Should only include HRIS connectors
        for connector in result.connectors:
            assert connector.category == "hris"

    @pytest.mark.asyncio
    async def test_list_available_connectors_filter_by_status(self, mock_user):
        """Test filtering connectors by status."""
        from app.api.v1.connectors import list_available_connectors

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS") as mock_connectors:
            all_connectors = [
                {"connector_type": "bamboohr", "category": "hris", "status": "available",
                 "display_name": "BambooHR", "auth_type": "api_key", "description": "Test",
                 "priority": "high"},
                {"connector_type": "personio", "category": "hris", "status": "planned",
                 "display_name": "Personio", "auth_type": "api_key", "description": "Test",
                 "priority": "medium"}
            ]
            mock_connectors.copy.return_value = all_connectors
            mock_connectors.__iter__ = lambda self: iter(all_connectors)

            result = await list_available_connectors(
                category=None,
                status_filter="available",
                current_user=mock_user
            )

        for connector in result.connectors:
            assert connector.status == "available"


# =============================================================================
# List Registered Connectors Tests
# =============================================================================

class TestListRegisteredConnectors:
    """Tests for GET /connectors/registered endpoint."""

    @pytest.mark.asyncio
    async def test_list_registered_connectors(self, mock_user):
        """Test listing implemented connectors."""
        from app.api.v1.connectors import list_registered_connectors

        with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
            MockRegistry.list_all.return_value = ["bamboohr"]

            mock_capability = MagicMock()
            mock_capability.connector_type = "bamboohr"
            mock_capability.display_name = "BambooHR"
            mock_capability.category.value = "hris"
            mock_capability.auth_type.value = "api_key"
            mock_capability.description = "BambooHR integration"
            mock_capability.supports_incremental_sync = True
            mock_capability.supports_webhooks = False
            mock_capability.required_scopes = []

            MockRegistry.get_all_capabilities.return_value = [mock_capability]

            result = await list_registered_connectors(current_user=mock_user)

        assert "registered_connectors" in result
        assert "capabilities" in result
        assert "bamboohr" in result["registered_connectors"]


# =============================================================================
# List Connections Tests
# =============================================================================

class TestListConnections:
    """Tests for GET /connectors/connections endpoint."""

    @pytest.mark.asyncio
    async def test_list_connections_success(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test listing all connections."""
        from app.api.v1.connectors import list_connections

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_connection]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_connections(
            db=mock_db_session,
            current_user=mock_user,
            connector_type=None
        )

        assert len(result) == 1
        assert result[0].connection_id == "conn_abc123"
        assert result[0].name == "BambooHR Production"
        assert result[0].status == "active"

    @pytest.mark.asyncio
    async def test_list_connections_filter_by_type(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test filtering connections by connector type."""
        from app.api.v1.connectors import list_connections

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_connection]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_connections(
            db=mock_db_session,
            current_user=mock_user,
            connector_type="bamboohr"
        )

        # Query should have been executed with filter
        assert mock_db_session.execute.called

    @pytest.mark.asyncio
    async def test_list_connections_empty(self, mock_db_session, mock_user):
        """Test empty connections list."""
        from app.api.v1.connectors import list_connections

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await list_connections(
            db=mock_db_session,
            current_user=mock_user,
            connector_type=None
        )

        assert result == []


# =============================================================================
# OAuth Flow Tests
# =============================================================================

class TestOAuthFlow:
    """Tests for OAuth initiation and callback endpoints."""

    @pytest.mark.asyncio
    async def test_initiate_oauth_flow_success(self, mock_db_session, mock_user):
        """Test initiating OAuth flow for valid connector."""
        from app.api.v1.connectors import initiate_oauth_flow, OAuthInitiateRequest

        request = OAuthInitiateRequest(
            connector_type="workday",
            redirect_uri="https://app.example.com/callback"
        )

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", [
            {"connector_type": "workday", "auth_type": "oauth2", "status": "available"}
        ]):
            result = await initiate_oauth_flow(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.authorization_url is not None
        assert result.state is not None
        assert len(result.state) > 0

    @pytest.mark.asyncio
    async def test_initiate_oauth_flow_connector_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when connector type doesn't exist."""
        from app.api.v1.connectors import initiate_oauth_flow, OAuthInitiateRequest
        from fastapi import HTTPException

        request = OAuthInitiateRequest(
            connector_type="nonexistent",
            redirect_uri="https://app.example.com/callback"
        )

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", []):
            with pytest.raises(HTTPException) as exc_info:
                await initiate_oauth_flow(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_initiate_oauth_flow_not_oauth_connector(
        self, mock_db_session, mock_user
    ):
        """Test error when connector doesn't use OAuth."""
        from app.api.v1.connectors import initiate_oauth_flow, OAuthInitiateRequest
        from fastapi import HTTPException

        request = OAuthInitiateRequest(
            connector_type="bamboohr",
            redirect_uri="https://app.example.com/callback"
        )

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", [
            {"connector_type": "bamboohr", "auth_type": "api_key", "status": "available"}
        ]):
            with pytest.raises(HTTPException) as exc_info:
                await initiate_oauth_flow(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 400
        assert "OAuth2" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_oauth_callback(self, mock_db_session, mock_user):
        """Test handling OAuth callback."""
        from app.api.v1.connectors import handle_oauth_callback, OAuthCallbackRequest

        request = OAuthCallbackRequest(
            code="auth_code_123",
            state="state_token",
            connector_type="workday"
        )

        result = await handle_oauth_callback(
            request=request,
            db=mock_db_session,
            current_user=mock_user
        )

        assert result["success"] is True


# =============================================================================
# API Key Connection Tests
# =============================================================================

class TestAPIKeyConnection:
    """Tests for API key connection creation."""

    @pytest.mark.asyncio
    async def test_create_api_key_connection_success(
        self, mock_db_session, mock_user, mock_test_result
    ):
        """Test creating API key connection."""
        from app.api.v1.connectors import create_api_key_connection, APIKeyConnectionRequest

        request = APIKeyConnectionRequest(
            connector_type="bamboohr",
            connection_name="BambooHR Prod",
            api_key="test_api_key_123",
            api_endpoint="https://api.bamboohr.com",
            tenant_id="mycompany"
        )

        mock_connector_class = MagicMock()
        mock_connector = MagicMock()
        mock_connector.test_connection = AsyncMock(return_value=mock_test_result)
        mock_connector_class.return_value = mock_connector

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", [
            {"connector_type": "bamboohr", "auth_type": "api_key", "status": "available"}
        ]):
            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                result = await create_api_key_connection(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.name == "BambooHR Prod"
        assert result.connector_type == "bamboohr"
        assert result.status == "active"

    @pytest.mark.asyncio
    async def test_create_api_key_connection_invalid_connector(
        self, mock_db_session, mock_user
    ):
        """Test error when connector type doesn't exist."""
        from app.api.v1.connectors import create_api_key_connection, APIKeyConnectionRequest
        from fastapi import HTTPException

        request = APIKeyConnectionRequest(
            connector_type="invalid",
            connection_name="Test",
            api_key="key"
        )

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", []):
            with pytest.raises(HTTPException) as exc_info:
                await create_api_key_connection(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_create_api_key_connection_oauth_connector(
        self, mock_db_session, mock_user
    ):
        """Test error when trying API key auth on OAuth connector."""
        from app.api.v1.connectors import create_api_key_connection, APIKeyConnectionRequest
        from fastapi import HTTPException

        request = APIKeyConnectionRequest(
            connector_type="workday",
            connection_name="Test",
            api_key="key"
        )

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", [
            {"connector_type": "workday", "auth_type": "oauth2", "status": "available"}
        ]):
            with pytest.raises(HTTPException) as exc_info:
                await create_api_key_connection(
                    request=request,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_create_api_key_connection_test_fails(
        self, mock_db_session, mock_user
    ):
        """Test error when connection test fails."""
        from app.api.v1.connectors import create_api_key_connection, APIKeyConnectionRequest
        from fastapi import HTTPException

        request = APIKeyConnectionRequest(
            connector_type="bamboohr",
            connection_name="Test",
            api_key="invalid_key"
        )

        failed_result = MagicMock()
        failed_result.success = False
        failed_result.message = "Invalid API key"

        mock_connector_class = MagicMock()
        mock_connector = MagicMock()
        mock_connector.test_connection = AsyncMock(return_value=failed_result)
        mock_connector_class.return_value = mock_connector

        with patch("app.api.v1.connectors.AVAILABLE_CONNECTORS", [
            {"connector_type": "bamboohr", "auth_type": "api_key", "status": "available"}
        ]):
            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                with pytest.raises(HTTPException) as exc_info:
                    await create_api_key_connection(
                        request=request,
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert exc_info.value.status_code == 400
        assert "Connection test failed" in str(exc_info.value.detail)


# =============================================================================
# Get/Update/Delete Connection Tests
# =============================================================================

class TestConnectionCRUD:
    """Tests for connection CRUD operations."""

    @pytest.mark.asyncio
    async def test_get_connection_success(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test getting a single connection."""
        from app.api.v1.connectors import get_connection

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await get_connection(
                connection_id="conn_abc123",
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.connection_id == "conn_abc123"
        assert result.name == "BambooHR Production"

    @pytest.mark.asyncio
    async def test_get_connection_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when connection doesn't exist."""
        from app.api.v1.connectors import get_connection
        from fastapi import HTTPException

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.side_effect = HTTPException(status_code=404, detail="Not found")

            with pytest.raises(HTTPException) as exc_info:
                await get_connection(
                    connection_id="nonexistent",
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_update_connection_name(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test updating connection name."""
        from app.api.v1.connectors import update_connection, ConnectionUpdateRequest

        request = ConnectionUpdateRequest(name="New Connection Name")

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await update_connection(
                connection_id="conn_abc123",
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["success"] is True
        assert "name" in result["updated_fields"]

    @pytest.mark.asyncio
    async def test_update_connection_sync_frequency(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test updating sync frequency."""
        from app.api.v1.connectors import update_connection, ConnectionUpdateRequest

        request = ConnectionUpdateRequest(sync_frequency_minutes=120)

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await update_connection(
                connection_id="conn_abc123",
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert "sync_frequency_minutes" in result["updated_fields"]

    @pytest.mark.asyncio
    async def test_update_connection_deactivate(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test deactivating a connection."""
        from app.api.v1.connectors import update_connection, ConnectionUpdateRequest

        request = ConnectionUpdateRequest(is_active=0)

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await update_connection(
                connection_id="conn_abc123",
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert "is_active" in result["updated_fields"]

    @pytest.mark.asyncio
    async def test_delete_connection_success(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test deleting a connection."""
        from app.api.v1.connectors import delete_connection

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await delete_connection(
                connection_id="conn_abc123",
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["success"] is True
        assert result["deleted_connection_id"] == "conn_abc123"
        mock_db_session.delete.assert_called_once()


# =============================================================================
# Test Connection Tests
# =============================================================================

class TestTestConnection:
    """Tests for POST /connections/{id}/test endpoint."""

    @pytest.mark.asyncio
    async def test_test_connection_success(
        self, mock_db_session, mock_user, mock_connection, mock_test_result
    ):
        """Test successful connection test."""
        from app.api.v1.connectors import test_connection

        mock_connector_class = MagicMock()
        mock_connector_class.AUTH_TYPE = "api_key"
        mock_connector = MagicMock()
        mock_connector.test_connection = AsyncMock(return_value=mock_test_result)
        mock_connector_class.return_value = mock_connector

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                result = await test_connection(
                    connection_id="conn_abc123",
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.success is True
        assert result.latency_ms == 125.5
        assert "employees:read" in result.permissions

    @pytest.mark.asyncio
    async def test_test_connection_no_connector_type(
        self, mock_db_session, mock_user
    ):
        """Test error when connection has no connector type."""
        from app.api.v1.connectors import test_connection
        from fastapi import HTTPException

        conn_no_type = MagicMock()
        conn_no_type.connector_type = None

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = conn_no_type

            with pytest.raises(HTTPException) as exc_info:
                await test_connection(
                    connection_id="conn_abc123",
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_test_connection_not_implemented(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test error when connector is not implemented."""
        from app.api.v1.connectors import test_connection
        from fastapi import HTTPException

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = None  # Not implemented

                with pytest.raises(HTTPException) as exc_info:
                    await test_connection(
                        connection_id="conn_abc123",
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert exc_info.value.status_code == 400
        assert "not implemented" in str(exc_info.value.detail).lower()


# =============================================================================
# Sync Operations Tests
# =============================================================================

class TestSyncOperations:
    """Tests for sync trigger and status endpoints."""

    @pytest.mark.asyncio
    async def test_trigger_sync_success(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test triggering a sync operation."""
        from app.api.v1.connectors import trigger_sync, SyncRequest
        from fastapi import BackgroundTasks

        request = SyncRequest(incremental=False)
        background_tasks = BackgroundTasks()

        mock_connector_class = MagicMock()

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                result = await trigger_sync(
                    connection_id="conn_abc123",
                    request=request,
                    background_tasks=background_tasks,
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.connection_id == "conn_abc123"
        assert result.status == "in_progress"
        assert result.started_at is not None

    @pytest.mark.asyncio
    async def test_get_sync_status(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test getting sync status."""
        from app.api.v1.connectors import get_sync_status

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            result = await get_sync_status(
                connection_id="conn_abc123",
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.connection_id == "conn_abc123"
        assert result.status == "success"
        assert result.records_fetched == 150


# =============================================================================
# Schema and Preview Tests
# =============================================================================

class TestSchemaAndPreview:
    """Tests for schema and data preview endpoints."""

    @pytest.mark.asyncio
    async def test_get_connector_schema(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test getting connector schema."""
        from app.api.v1.connectors import get_connector_schema

        mock_schema = {
            "fields": [
                {"name": "employee_id", "type": "string", "required": True},
                {"name": "full_name", "type": "string", "required": True},
                {"name": "email", "type": "string", "required": False}
            ]
        }

        mock_field_mapping = MagicMock()
        mock_field_mapping.source_field = "employee_id"
        mock_field_mapping.target_field = "hr_code"
        mock_field_mapping.transform = None
        mock_field_mapping.required = True

        mock_connector_class = MagicMock()
        mock_connector_class.AUTH_TYPE = "api_key"
        mock_connector = MagicMock()
        mock_connector.get_schema = AsyncMock(return_value=mock_schema)
        mock_connector.get_default_field_mapping.return_value = [mock_field_mapping]
        mock_connector_class.return_value = mock_connector

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                result = await get_connector_schema(
                    connection_id="conn_abc123",
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result["connector_type"] == "bamboohr"
        assert "schema" in result
        assert "default_mappings" in result

    @pytest.mark.asyncio
    async def test_preview_sync_data(
        self, mock_db_session, mock_user, mock_connection
    ):
        """Test previewing sync data."""
        from app.api.v1.connectors import preview_sync_data

        mock_employees = [
            {"employee_id": "E001", "name": "John Doe", "department": "Engineering"},
            {"employee_id": "E002", "name": "Jane Smith", "department": "Sales"},
            {"employee_id": "E003", "name": "Bob Wilson", "department": "HR"}
        ]

        mock_connector_class = MagicMock()
        mock_connector_class.AUTH_TYPE = "api_key"
        mock_connector = MagicMock()
        mock_connector.fetch_employees = AsyncMock(return_value=mock_employees)
        mock_connector_class.return_value = mock_connector

        with patch("app.api.v1.connectors.get_connection_or_404") as mock_get:
            mock_get.return_value = mock_connection

            with patch("app.api.v1.connectors.ConnectorRegistry") as MockRegistry:
                MockRegistry.get.return_value = mock_connector_class

                with patch("app.api.v1.connectors.assess_data_quality") as mock_quality:
                    mock_report = MagicMock()
                    mock_report.to_dict.return_value = {"score": 0.95}
                    mock_quality.return_value = mock_report

                    result = await preview_sync_data(
                        connection_id="conn_abc123",
                        limit=2,
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert result["total_available"] == 3
        assert result["preview_count"] == 2
        assert len(result["records"]) == 2


# =============================================================================
# Utility Function Tests
# =============================================================================

class TestUtilityFunctions:
    """Tests for utility functions."""

    def test_generate_state_token(self):
        """Test state token generation."""
        from app.api.v1.connectors import generate_state_token

        token1 = generate_state_token()
        token2 = generate_state_token()

        # Tokens should be unique
        assert token1 != token2
        # Should be URL-safe base64
        assert len(token1) > 0

    @pytest.mark.asyncio
    async def test_get_connection_or_404_found(self, mock_db_session, mock_connection):
        """Test get_connection_or_404 when connection exists."""
        from app.api.v1.connectors import get_connection_or_404

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_connection
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_connection_or_404(mock_db_session, "conn_abc123")

        assert result == mock_connection

    @pytest.mark.asyncio
    async def test_get_connection_or_404_not_found(self, mock_db_session):
        """Test get_connection_or_404 raises 404 when not found."""
        from app.api.v1.connectors import get_connection_or_404
        from fastapi import HTTPException

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_connection_or_404(mock_db_session, "nonexistent")

        assert exc_info.value.status_code == 404
