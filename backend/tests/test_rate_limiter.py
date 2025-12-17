"""
Tests for app/core/rate_limiter.py - Rate limiting functionality.
"""
import pytest
from unittest.mock import MagicMock, patch


class TestGetRealClientIP:
    """Test real client IP extraction."""

    def test_extracts_from_x_forwarded_for(self):
        """Should extract first IP from X-Forwarded-For header."""
        from app.core.rate_limiter import get_real_client_ip

        mock_request = MagicMock()
        mock_request.headers = {"X-Forwarded-For": "203.0.113.1, 198.51.100.1, 192.0.2.1"}

        ip = get_real_client_ip(mock_request)

        assert ip == "203.0.113.1"

    def test_extracts_from_x_real_ip(self):
        """Should extract from X-Real-IP if X-Forwarded-For not present."""
        from app.core.rate_limiter import get_real_client_ip

        mock_request = MagicMock()
        mock_request.headers = {"X-Real-IP": "203.0.113.2"}

        ip = get_real_client_ip(mock_request)

        assert ip == "203.0.113.2"

    def test_falls_back_to_direct_ip(self):
        """Should fall back to direct connection IP."""
        from app.core.rate_limiter import get_real_client_ip

        mock_request = MagicMock()
        mock_request.headers = {}

        with patch('app.core.rate_limiter.get_remote_address', return_value="192.168.1.100"):
            ip = get_real_client_ip(mock_request)

        assert ip == "192.168.1.100"

    def test_strips_whitespace(self):
        """Should strip whitespace from extracted IP."""
        from app.core.rate_limiter import get_real_client_ip

        mock_request = MagicMock()
        mock_request.headers = {"X-Forwarded-For": "  203.0.113.1  , 198.51.100.1"}

        ip = get_real_client_ip(mock_request)

        assert ip == "203.0.113.1"


class TestGetUserIdentifier:
    """Test user identifier extraction for rate limiting."""

    def test_uses_user_id_when_authenticated(self):
        """Should use user ID prefix when user is authenticated."""
        from app.core.rate_limiter import get_user_identifier

        mock_request = MagicMock()
        mock_request.state.user = MagicMock()
        mock_request.state.user.id = 123

        identifier = get_user_identifier(mock_request)

        assert identifier == "user:123"

    def test_uses_ip_when_not_authenticated(self):
        """Should use IP prefix when no user authenticated."""
        from app.core.rate_limiter import get_user_identifier

        mock_request = MagicMock()
        mock_request.state = MagicMock(spec=[])  # No user attribute
        mock_request.headers = {"X-Forwarded-For": "203.0.113.5"}

        identifier = get_user_identifier(mock_request)

        assert identifier == "ip:203.0.113.5"

    def test_handles_missing_user_attribute(self):
        """Should handle case where user attribute doesn't exist."""
        from app.core.rate_limiter import get_user_identifier

        mock_request = MagicMock()
        del mock_request.state.user  # Remove user attribute
        mock_request.headers = {"X-Real-IP": "10.0.0.1"}

        # Should not raise, should fall back to IP
        identifier = get_user_identifier(mock_request)

        assert identifier.startswith("ip:")


class TestRateLimits:
    """Test predefined rate limits."""

    def test_auth_limits_are_strict(self):
        """Auth endpoints should have stricter limits."""
        from app.core.rate_limiter import RateLimits

        # Auth should have lower limits than API
        assert "5/minute" == RateLimits.AUTH_LOGIN
        assert "3/minute" == RateLimits.AUTH_REGISTER
        assert "3/minute" == RateLimits.AUTH_PASSWORD_RESET

    def test_api_limits_reasonable(self):
        """API endpoints should have reasonable limits."""
        from app.core.rate_limiter import RateLimits

        assert "100/minute" == RateLimits.API_READ
        assert "30/minute" == RateLimits.API_WRITE

    def test_ai_limits_conservative(self):
        """AI endpoints should have conservative limits."""
        from app.core.rate_limiter import RateLimits

        assert "20/minute" == RateLimits.AI_PREDICTION
        assert "2/hour" == RateLimits.AI_TRAINING


class TestRateLimitExceededHandler:
    """Test custom rate limit exceeded handler."""

    def test_returns_429_response(self):
        """Should return 429 status code."""
        from app.core.rate_limiter import rate_limit_exceeded_handler
        from slowapi.errors import RateLimitExceeded

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/auth/login"
        mock_request.headers = {}
        mock_request.state = MagicMock(spec=[])

        exc = RateLimitExceeded("5/minute")
        exc.retry_after = 30

        with patch('app.core.rate_limiter.get_user_identifier', return_value="ip:1.2.3.4"):
            response = rate_limit_exceeded_handler(mock_request, exc)

        assert response.status_code == 429

    def test_includes_retry_after_header(self):
        """Should include Retry-After header."""
        from app.core.rate_limiter import rate_limit_exceeded_handler
        from slowapi.errors import RateLimitExceeded

        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.url.path = "/api/v1/test"
        mock_request.headers = {}
        mock_request.state = MagicMock(spec=[])

        exc = RateLimitExceeded("10/minute")
        exc.retry_after = 45

        with patch('app.core.rate_limiter.get_user_identifier', return_value="ip:1.2.3.4"):
            response = rate_limit_exceeded_handler(mock_request, exc)

        assert "Retry-After" in response.headers
        assert response.headers["Retry-After"] == "45"

    def test_returns_json_body(self):
        """Should return JSON body with error details."""
        from app.core.rate_limiter import rate_limit_exceeded_handler
        from slowapi.errors import RateLimitExceeded
        import json

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/predict"
        mock_request.headers = {}
        mock_request.state = MagicMock(spec=[])

        exc = RateLimitExceeded("20/minute")
        exc.retry_after = 60

        with patch('app.core.rate_limiter.get_user_identifier', return_value="user:123"):
            response = rate_limit_exceeded_handler(mock_request, exc)

        body = json.loads(response.body)
        assert "error" in body
        assert "retry_after" in body
        assert body["retry_after"] == 60


class TestExemptFromRateLimit:
    """Test rate limit exemption logic."""

    def test_health_endpoint_exempt(self):
        """Health check endpoint should be exempt."""
        from app.core.rate_limiter import exempt_from_rate_limit

        mock_request = MagicMock()
        mock_request.url.path = "/health"
        mock_request.headers = {}

        result = exempt_from_rate_limit(mock_request)

        assert result is True

    def test_metrics_endpoint_exempt(self):
        """Metrics endpoint should be exempt."""
        from app.core.rate_limiter import exempt_from_rate_limit

        mock_request = MagicMock()
        mock_request.url.path = "/metrics"
        mock_request.headers = {}

        result = exempt_from_rate_limit(mock_request)

        assert result is True

    def test_normal_endpoint_not_exempt(self):
        """Normal API endpoints should not be exempt."""
        from app.core.rate_limiter import exempt_from_rate_limit

        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/employees"
        mock_request.headers = {}

        with patch('app.core.rate_limiter.get_real_client_ip', return_value="203.0.113.1"):
            result = exempt_from_rate_limit(mock_request)

        assert result is False


class TestLimiterConfiguration:
    """Test limiter configuration."""

    def test_limiter_has_default_limits(self):
        """Limiter should have default rate limits configured."""
        from app.core.rate_limiter import limiter

        assert limiter is not None
        # Check limiter has been initialized with key function
        assert limiter._key_func is not None

    def test_limiter_enables_headers(self):
        """Limiter should be configured to add rate limit headers."""
        from app.core.rate_limiter import limiter

        assert limiter._headers_enabled is True
