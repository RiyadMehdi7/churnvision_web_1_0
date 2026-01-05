"""
Tests for app/core/config.py - Configuration and settings validation.
"""
import os
import importlib
import pytest


class TestSettingsValidation:
    """Test configuration validation logic."""

    def test_development_mode_allows_default_secrets(self, monkeypatch, tmp_path):
        """Development mode should allow default/insecure secrets."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("DEBUG", "true")

        # Should not raise - development mode allows defaults
        from app.core import config
        importlib.reload(config)

        assert config.settings.ENVIRONMENT == "development"
        assert config.settings.DEBUG is True

    def test_production_mode_rejects_default_secret_key(self, monkeypatch):
        """Production mode must reject default SECRET_KEY."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        # Leave SECRET_KEY as default

        from app.core import config

        with pytest.raises(ValueError) as exc_info:
            importlib.reload(config)

        assert "SECRET_KEY is insecure" in str(exc_info.value)

    def test_production_mode_requires_public_key(self, monkeypatch):
        """Production mode must require a license public key for RS256."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("SECRET_KEY", "a-very-secure-secret-key-that-is-long-enough-32chars")
        monkeypatch.setenv("POSTGRES_PASSWORD", "secure-db-password")
        monkeypatch.setenv("LICENSE_KEY", "valid-license-key")
        # Leave LICENSE_PUBLIC_KEY unset

        from app.core import config

        with pytest.raises(ValueError) as exc_info:
            importlib.reload(config)

        assert "LICENSE_PUBLIC_KEY" in str(exc_info.value)

    def test_production_mode_rejects_insecure_db_password(self, monkeypatch):
        """Production mode must reject insecure database passwords."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        monkeypatch.setenv("SECRET_KEY", "a-very-secure-secret-key-that-is-long-enough-32chars")
        monkeypatch.setenv("LICENSE_SECRET_KEY", "secure-license-secret")
        monkeypatch.setenv("LICENSE_KEY", "valid-license-key")
        monkeypatch.setenv("POSTGRES_PASSWORD", "postgres")  # Insecure default

        from app.core import config

        with pytest.raises(ValueError) as exc_info:
            importlib.reload(config)

        # Check for insecure password message - actual message includes DATABASE_URL
        assert "insecure" in str(exc_info.value).lower()

    def test_production_mode_rejects_debug_true(self, monkeypatch):
        """Production mode must have DEBUG=False."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "true")  # Invalid in production
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        monkeypatch.setenv("SECRET_KEY", "a-very-secure-secret-key-that-is-long-enough-32chars")
        monkeypatch.setenv("LICENSE_SECRET_KEY", "secure-license-secret")
        monkeypatch.setenv("LICENSE_KEY", "valid-license-key")
        monkeypatch.setenv("POSTGRES_PASSWORD", "secure-password")

        from app.core import config

        with pytest.raises(ValueError) as exc_info:
            importlib.reload(config)

        assert "DEBUG must be False" in str(exc_info.value)

    def test_production_mode_with_valid_config(self, monkeypatch):
        """Production mode should work with all valid settings."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        monkeypatch.setenv("SECRET_KEY", "a-very-secure-secret-key-that-is-long-enough-32chars")
        monkeypatch.setenv("LICENSE_SECRET_KEY", "secure-license-secret-key")
        monkeypatch.setenv("LICENSE_KEY", "valid-production-license-key")
        monkeypatch.setenv("POSTGRES_PASSWORD", "super-secure-db-password")
        # Also need ENCRYPTION_KEY and non-localhost ALLOWED_ORIGINS for production
        monkeypatch.setenv("ENCRYPTION_KEY", "gAAAAABkZjY4X3Rlc3Rfa2V5X2Zvcl9lbmNyeXB0aW9uXw==")
        monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.com,https://api.example.com")

        from app.core import config
        importlib.reload(config)

        assert config.settings.ENVIRONMENT == "production"
        assert config.settings.DEBUG is False

    def test_secret_key_minimum_length(self, monkeypatch):
        """SECRET_KEY must be at least 32 characters in production."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        monkeypatch.setenv("SECRET_KEY", "short-key")  # Too short

        from app.core import config

        with pytest.raises(ValueError) as exc_info:
            importlib.reload(config)

        assert "SECRET_KEY is insecure" in str(exc_info.value)


class TestSettingsComputed:
    """Test computed settings properties."""

    def test_database_url_from_env(self, monkeypatch):
        """DATABASE_URL should be read from environment when set."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        expected_url = "postgresql+asyncpg://myuser:mypassword@myhost:5433/mydb"
        monkeypatch.setenv("DATABASE_URL", expected_url)

        from app.core import config
        importlib.reload(config)

        assert config.settings.DATABASE_URL == expected_url

    def test_cookie_secure_in_production(self, monkeypatch):
        """COOKIE_SECURE should be True in production."""
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("INTEGRITY_REQUIRE_SIGNED", "false")
        monkeypatch.setenv("ARTIFACT_ENCRYPTION_REQUIRED", "true")
        monkeypatch.setenv("LICENSE_SIGNING_ALG", "RS256")
        monkeypatch.setenv("LICENSE_PUBLIC_KEY", "test-public-key")
        monkeypatch.setenv("SECRET_KEY", "a-very-secure-secret-key-that-is-long-enough-32chars")
        monkeypatch.setenv("LICENSE_SECRET_KEY", "secure-license-secret-key")
        monkeypatch.setenv("LICENSE_KEY", "valid-production-license-key")
        monkeypatch.setenv("POSTGRES_PASSWORD", "super-secure-db-password")
        # Also need ENCRYPTION_KEY and non-localhost ALLOWED_ORIGINS for production
        monkeypatch.setenv("ENCRYPTION_KEY", "gAAAAABkZjY4X3Rlc3Rfa2V5X2Zvcl9lbmNyeXB0aW9uXw==")
        monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.com,https://api.example.com")

        from app.core import config
        importlib.reload(config)

        assert config.settings.COOKIE_SECURE is True

    def test_cookie_secure_in_development(self, monkeypatch):
        """COOKIE_SECURE should be False in development."""
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.core import config
        importlib.reload(config)

        assert config.settings.COOKIE_SECURE is False


class TestAllowedOrigins:
    """Test CORS origins parsing."""

    def test_parse_comma_separated_origins(self, monkeypatch):
        """ALLOWED_ORIGINS should parse comma-separated string."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:4001,https://app.example.com")

        from app.core import config
        importlib.reload(config)

        assert "http://localhost:3000" in config.settings.ALLOWED_ORIGINS
        assert "http://localhost:4001" in config.settings.ALLOWED_ORIGINS
        assert "https://app.example.com" in config.settings.ALLOWED_ORIGINS

    def test_parse_origins_with_whitespace(self, monkeypatch):
        """ALLOWED_ORIGINS should handle whitespace in values."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("ALLOWED_ORIGINS", " http://localhost:3000 , http://localhost:4001 ")

        from app.core import config
        importlib.reload(config)

        assert "http://localhost:3000" in config.settings.ALLOWED_ORIGINS
        assert "http://localhost:4001" in config.settings.ALLOWED_ORIGINS

    def test_default_origins_in_development(self, monkeypatch):
        """Default origins should be set in development mode."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        # Don't set ALLOWED_ORIGINS

        from app.core import config
        importlib.reload(config)

        assert len(config.settings.ALLOWED_ORIGINS) > 0


class TestPoolingSettings:
    """Test database connection pooling settings."""

    def test_default_pool_size(self, monkeypatch):
        """Default pool size should be 20."""
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.core import config
        importlib.reload(config)

        assert config.settings.DB_POOL_SIZE == 20

    def test_default_max_overflow(self, monkeypatch):
        """Default max overflow should be 40."""
        monkeypatch.setenv("ENVIRONMENT", "development")

        from app.core import config
        importlib.reload(config)

        assert config.settings.DB_MAX_OVERFLOW == 40

    def test_custom_pool_settings(self, monkeypatch):
        """Custom pool settings should be respected."""
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("DB_POOL_SIZE", "50")
        monkeypatch.setenv("DB_MAX_OVERFLOW", "100")

        from app.core import config
        importlib.reload(config)

        assert config.settings.DB_POOL_SIZE == 50
        assert config.settings.DB_MAX_OVERFLOW == 100
