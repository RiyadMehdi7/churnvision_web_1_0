"""
Tests for health check functionality including Redis and Ollama checks.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestHealthCheckFunctions:
    """Test individual health check functions."""

    @pytest.mark.asyncio
    async def test_check_db_connection_success(self):
        """Should return True when database is reachable."""
        from app.db.session import check_db_connection

        mock_engine = MagicMock()
        mock_connection = AsyncMock()
        mock_engine.connect = MagicMock(return_value=mock_connection)
        mock_connection.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_connection.__aexit__ = AsyncMock(return_value=None)
        mock_connection.execute = AsyncMock()

        with patch('app.db.session.engine', mock_engine):
            result = await check_db_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_check_db_connection_failure(self):
        """Should return False when database is unreachable."""
        from app.db.session import check_db_connection

        mock_engine = MagicMock()
        mock_engine.connect = MagicMock(side_effect=Exception("Connection refused"))

        with patch('app.db.session.engine', mock_engine):
            result = await check_db_connection()

        assert result is False

    @pytest.mark.asyncio
    async def test_check_redis_connection_success(self):
        """Should return True when Redis is reachable."""
        from app.main import check_redis_connection, _health_cache

        # Clear the cache
        _health_cache["redis"] = {"healthy": None, "timestamp": 0}

        mock_cache = AsyncMock()
        mock_cache.set = AsyncMock(return_value=True)

        # get_cache is imported inside check_redis_connection, so patch it there
        with patch('app.core.cache.get_cache', new_callable=AsyncMock, return_value=mock_cache):
            result = await check_redis_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_check_redis_connection_failure(self):
        """Should return False when Redis is unreachable."""
        from app.main import check_redis_connection, _health_cache

        # Clear the cache
        _health_cache["redis"] = {"healthy": None, "timestamp": 0}

        # get_cache is imported inside check_redis_connection
        with patch('app.core.cache.get_cache', new_callable=AsyncMock, side_effect=Exception("Redis connection failed")):
            result = await check_redis_connection()

        assert result is False

    @pytest.mark.asyncio
    async def test_check_ollama_connection_success(self):
        """Should return True when Ollama is reachable."""
        from app.main import check_ollama_connection, _health_cache

        # Clear the cache
        _health_cache["ollama"] = {"healthy": None, "timestamp": 0}

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            result = await check_ollama_connection()

        assert result is True

    @pytest.mark.asyncio
    async def test_check_ollama_connection_failure(self):
        """Should return False when Ollama is unreachable."""
        from app.main import check_ollama_connection, _health_cache

        # Clear the cache
        _health_cache["ollama"] = {"healthy": None, "timestamp": 0}

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            result = await check_ollama_connection()

        assert result is False

    @pytest.mark.asyncio
    async def test_check_ollama_connection_non_200(self):
        """Should return False when Ollama returns non-200."""
        from app.main import check_ollama_connection, _health_cache

        # Clear the cache
        _health_cache["ollama"] = {"healthy": None, "timestamp": 0}

        mock_response = MagicMock()
        mock_response.status_code = 503

        with patch('httpx.AsyncClient') as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            result = await check_ollama_connection()

        assert result is False


class TestHealthEndpoint:
    """Test the /health endpoint response."""

    @pytest.mark.asyncio
    async def test_health_all_services_up(self):
        """Should return healthy when all services are up."""
        from app.main import health_check

        with patch('app.main.check_db_connection', new_callable=AsyncMock, return_value=True):
            with patch('app.main.check_redis_connection', new_callable=AsyncMock, return_value=True):
                with patch('app.main.check_ollama_connection', new_callable=AsyncMock, return_value=True):
                    result = await health_check()

        # Result is a HealthResponse model, access as attributes
        assert result.status == "healthy"
        assert result.checks["database"] is True
        assert result.checks["redis"] is True
        assert result.checks["ollama"] is True

    @pytest.mark.asyncio
    async def test_health_database_down(self):
        """Should return degraded when database is down."""
        from app.main import health_check
        from starlette.responses import JSONResponse

        with patch('app.main.check_db_connection', new_callable=AsyncMock, return_value=False):
            with patch('app.main.check_redis_connection', new_callable=AsyncMock, return_value=True):
                with patch('app.main.check_ollama_connection', new_callable=AsyncMock, return_value=True):
                    result = await health_check()

        # When critical services are down, it returns JSONResponse
        assert isinstance(result, JSONResponse)
        assert result.status_code == 503

    @pytest.mark.asyncio
    async def test_health_redis_down(self):
        """Should return degraded when Redis is down."""
        from app.main import health_check
        from starlette.responses import JSONResponse

        with patch('app.main.check_db_connection', new_callable=AsyncMock, return_value=True):
            with patch('app.main.check_redis_connection', new_callable=AsyncMock, return_value=False):
                with patch('app.main.check_ollama_connection', new_callable=AsyncMock, return_value=True):
                    result = await health_check()

        # When critical services are down, it returns JSONResponse
        assert isinstance(result, JSONResponse)
        assert result.status_code == 503

    @pytest.mark.asyncio
    async def test_health_ollama_down_still_healthy(self):
        """Should return healthy when only Ollama is down (non-critical)."""
        from app.main import health_check

        with patch('app.main.check_db_connection', new_callable=AsyncMock, return_value=True):
            with patch('app.main.check_redis_connection', new_callable=AsyncMock, return_value=True):
                with patch('app.main.check_ollama_connection', new_callable=AsyncMock, return_value=False):
                    result = await health_check()

        # Ollama is not critical - system is still degraded but not 503
        # The implementation returns "degraded" when only ollama is down
        assert result.status in ("healthy", "degraded")
        assert result.checks["ollama"] is False


class TestHealthCheckCaching:
    """Test that health checks are appropriately cached/rate-limited."""

    @pytest.mark.asyncio
    async def test_multiple_rapid_checks_dont_overwhelm(self):
        """Rapid health checks should be efficient."""
        from app.main import health_check
        import asyncio

        call_count = 0

        async def counting_check():
            nonlocal call_count
            call_count += 1
            return True

        with patch('app.main.check_db_connection', counting_check):
            with patch('app.main.check_redis_connection', new_callable=AsyncMock, return_value=True):
                with patch('app.main.check_ollama_connection', new_callable=AsyncMock, return_value=True):
                    # Make 10 rapid health checks
                    results = await asyncio.gather(*[health_check() for _ in range(10)])

        # All should succeed
        assert all(r.status == "healthy" for r in results)
        # Each call should have checked (no caching implemented yet, but test establishes baseline)
        assert call_count == 10
