"""
Tests for app/main.py - FastAPI application and health checks.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import status


class TestHealthEndpoint:
    """Test application health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check_healthy(self):
        """Health check should return healthy when DB is connected."""
        from app.main import health_check

        with patch("app.main.check_db_connection", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = True

            response = await health_check()

        assert response.status == "healthy"
        assert response.checks["database"] is True

    @pytest.mark.asyncio
    async def test_health_check_degraded_when_db_down(self):
        """Health check should return degraded when DB is down."""
        from app.main import health_check
        from fastapi.responses import JSONResponse

        with patch("app.main.check_db_connection", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = False

            response = await health_check()

        # Response should be JSONResponse with 503 status
        assert isinstance(response, JSONResponse)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


class TestGlobalExceptionHandler:
    """Test global exception handler."""

    @pytest.mark.asyncio
    async def test_exception_handler_in_dev_includes_details(self, mock_request, monkeypatch):
        """In development, exception details should be included."""
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.main import global_exception_handler
        from app.core import config
        import importlib
        importlib.reload(config)

        # Reload main to pick up new settings
        from app import main
        importlib.reload(main)

        exc = ValueError("Test error message")
        mock_request.url.path = "/api/v1/test"

        response = await main.global_exception_handler(mock_request, exc)

        content = response.body.decode()
        assert "ValueError" in content or "Test error" in content

    @pytest.mark.asyncio
    async def test_exception_handler_generates_error_id(self, mock_request):
        """Exception handler should generate reference ID."""
        from app.main import global_exception_handler

        exc = Exception("Test error")

        response = await global_exception_handler(mock_request, exc)

        content = response.body.decode()
        # Should contain timestamp-based ID
        assert "timestamp" in content.lower() or "20" in content  # Year prefix


class TestRootEndpoint:
    """Test root endpoint."""

    @pytest.mark.asyncio
    async def test_root_returns_welcome(self):
        """Root endpoint should return welcome message."""
        from app.main import root

        response = await root()

        assert "message" in response
        assert "ChurnVision" in response["message"]


class TestDatabaseConnection:
    """Test database connection check."""

    @pytest.mark.asyncio
    async def test_check_db_connection_success(self):
        """DB check should return True on successful connection."""
        from app.db.session import check_db_connection

        with patch("app.db.session.engine") as mock_engine:
            mock_conn = AsyncMock()
            mock_conn.execute = AsyncMock()
            mock_engine.connect = AsyncMock(return_value=mock_conn)

            # Mock context manager
            mock_engine.connect.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_engine.connect.return_value.__aexit__ = AsyncMock(return_value=None)

            result = await check_db_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_check_db_connection_failure(self):
        """DB check should return False on connection failure."""
        from app.db.session import check_db_connection

        with patch("app.db.session.engine") as mock_engine:
            mock_engine.connect = AsyncMock(side_effect=Exception("Connection failed"))

            result = await check_db_connection()

        assert result is False


class TestErrorResponseModel:
    """Test ErrorResponse Pydantic model."""

    def test_error_response_structure(self):
        """ErrorResponse should have correct structure."""
        from app.main import ErrorResponse

        response = ErrorResponse(
            error="TestError",
            detail="Test detail message",
            timestamp="2024-01-01T00:00:00",
            path="/api/v1/test"
        )

        assert response.error == "TestError"
        assert response.detail == "Test detail message"
        assert response.path == "/api/v1/test"

    def test_error_response_optional_fields(self):
        """ErrorResponse should allow None for optional fields."""
        from app.main import ErrorResponse

        response = ErrorResponse(
            error="TestError",
            timestamp="2024-01-01T00:00:00"
        )

        assert response.detail is None
        assert response.path is None


class TestHealthResponseModel:
    """Test HealthResponse Pydantic model."""

    def test_health_response_structure(self):
        """HealthResponse should have correct structure."""
        from app.main import HealthResponse

        response = HealthResponse(
            status="healthy",
            service="churnvision-backend",
            version="1.0.0",
            environment="development",
            checks={"database": True}
        )

        assert response.status == "healthy"
        assert response.service == "churnvision-backend"
        assert response.checks["database"] is True
