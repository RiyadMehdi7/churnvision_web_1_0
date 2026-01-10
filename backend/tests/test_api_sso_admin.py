"""
Tests for app/api/v1/sso_admin.py - SSO Administration endpoints.

Tests cover:
- SSO configuration retrieval
- SSO configuration update
- SSO connection testing
- SSO disable functionality
- Super admin access requirements
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_super_admin_user():
    """Create a mock super admin user."""
    user = MagicMock()
    user.id = 1
    user.username = "superadmin"
    user.email = "superadmin@example.com"
    user.is_superuser = True
    user.is_active = True
    return user


@pytest.fixture
def mock_regular_user():
    """Create a mock regular user (not super admin)."""
    user = MagicMock()
    user.id = 2
    user.username = "regularuser"
    user.email = "user@example.com"
    user.is_superuser = False
    user.is_active = True
    return user


@pytest.fixture
def mock_sso_config():
    """Create a mock SSO configuration."""
    config = MagicMock()
    config.id = 1
    config.enabled = True
    config.provider = "oidc"
    config.issuer_url = "https://auth.example.com"
    config.client_id = "churnvision-app"
    config.client_secret_encrypted = "encrypted_secret_value"
    config.redirect_uri = "https://app.example.com/auth/callback"
    config.scopes = "openid email profile"
    config.auto_create_users = True
    config.default_role = "viewer"
    config.admin_groups = "admins,superusers"
    config.session_lifetime = 86400
    config.created_at = datetime.utcnow()
    config.updated_at = datetime.utcnow()
    config.created_by = "admin"
    config.updated_by = "admin"
    config.last_test_at = datetime.utcnow()
    config.last_test_success = True
    config.last_test_error = None
    return config


# ============ Test Super Admin Requirement ============

class TestRequireSuperAdmin:
    """Test super admin access requirement."""

    @pytest.mark.asyncio
    async def test_require_super_admin_success(self, mock_super_admin_user):
        """Should allow super admin access."""
        from app.api.v1.sso_admin import require_super_admin

        result = await require_super_admin(current_user=mock_super_admin_user)

        assert result == mock_super_admin_user

    @pytest.mark.asyncio
    async def test_require_super_admin_denied(self, mock_regular_user):
        """Should deny non-super admin access."""
        from app.api.v1.sso_admin import require_super_admin

        with pytest.raises(HTTPException) as exc_info:
            await require_super_admin(current_user=mock_regular_user)

        assert exc_info.value.status_code == 403
        assert "Super admin access required" in exc_info.value.detail


# ============ Test Get SSO Config ============

class TestGetSSOConfig:
    """Test get SSO configuration endpoint."""

    @pytest.mark.asyncio
    async def test_get_sso_config_exists(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should return existing SSO configuration."""
        from app.api.v1.sso_admin import get_sso_config

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_sso_config(
            db=mock_db_session,
            current_user=mock_super_admin_user,
        )

        assert result.id == 1
        assert result.enabled is True
        assert result.provider == "oidc"
        assert result.issuer_url == "https://auth.example.com"
        assert result.client_id == "churnvision-app"
        assert result.has_client_secret is True
        assert result.auto_create_users is True

    @pytest.mark.asyncio
    async def test_get_sso_config_empty(
        self, mock_db_session, mock_super_admin_user
    ):
        """Should return default config when none exists."""
        from app.api.v1.sso_admin import get_sso_config

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_sso_config(
            db=mock_db_session,
            current_user=mock_super_admin_user,
        )

        assert result.id == 0
        assert result.enabled is False
        assert result.provider == "oidc"
        assert result.has_client_secret is False
        assert result.scopes == "openid email profile"


# ============ Test Update SSO Config ============

class TestUpdateSSOConfig:
    """Test update SSO configuration endpoint."""

    @pytest.mark.asyncio
    async def test_update_sso_config_existing(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should update existing SSO configuration."""
        from app.api.v1.sso_admin import update_sso_config, SSOConfigUpdate

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()
        mock_db_session.refresh = AsyncMock()

        config_update = SSOConfigUpdate(
            enabled=True,
            provider="oidc",
            issuer_url="https://new-auth.example.com",
            client_id="new-client-id",
            client_secret="new-secret",
            redirect_uri="https://app.example.com/callback",
            scopes="openid email profile groups",
            auto_create_users=False,
            default_role="analyst",
            admin_groups="admins",
            session_lifetime=43200,
        )

        with patch("app.api.v1.sso_admin.encrypt_secret") as mock_encrypt:
            mock_encrypt.return_value = "encrypted_new_secret"

            result = await update_sso_config(
                config_update=config_update,
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        assert result.enabled is True
        assert result.client_id == "new-client-id"
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_sso_config_create_new(
        self, mock_db_session, mock_super_admin_user
    ):
        """Should create new SSO configuration when none exists."""
        from app.api.v1.sso_admin import update_sso_config, SSOConfigUpdate

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        # Mock refresh to set attributes on the new config
        async def mock_refresh(obj):
            obj.id = 1
            obj.created_at = datetime.utcnow()
            obj.updated_at = datetime.utcnow()
            obj.last_test_at = None
            obj.last_test_success = None
            obj.last_test_error = None

        mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)

        config_update = SSOConfigUpdate(
            enabled=True,
            provider="oidc",
            issuer_url="https://auth.example.com",
            client_id="client-123",
        )

        with patch("app.api.v1.sso_admin.encrypt_secret") as mock_encrypt:
            mock_encrypt.return_value = ""

            result = await update_sso_config(
                config_update=config_update,
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_sso_config_without_secret(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should preserve existing secret when not provided."""
        from app.api.v1.sso_admin import update_sso_config, SSOConfigUpdate

        original_secret = mock_sso_config.client_secret_encrypted

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()
        mock_db_session.refresh = AsyncMock()

        # Update without providing client_secret
        config_update = SSOConfigUpdate(
            enabled=True,
            provider="oidc",
            issuer_url="https://auth.example.com",
            client_id="client-123",
            # No client_secret provided
        )

        result = await update_sso_config(
            config_update=config_update,
            db=mock_db_session,
            current_user=mock_super_admin_user,
        )

        # Secret should remain unchanged
        assert mock_sso_config.client_secret_encrypted == original_secret


# ============ Test SSO Connection Test ============

class TestTestSSOConnection:
    """Test SSO connection test endpoint."""

    @pytest.mark.asyncio
    async def test_sso_connection_success(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should successfully test SSO connection."""
        from app.api.v1.sso_admin import test_sso_connection

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()

        mock_oidc_response = {
            "issuer": "https://auth.example.com",
            "authorization_endpoint": "https://auth.example.com/authorize",
            "token_endpoint": "https://auth.example.com/token",
            "userinfo_endpoint": "https://auth.example.com/userinfo",
        }

        with patch("app.api.v1.sso_admin.httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            mock_response.json = MagicMock(return_value=mock_oidc_response)

            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value = mock_client_instance

            result = await test_sso_connection(
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        assert result.success is True
        assert "Successfully connected" in result.message
        assert result.issuer_info is not None
        assert result.issuer_info["issuer"] == "https://auth.example.com"

    @pytest.mark.asyncio
    async def test_sso_connection_not_configured(
        self, mock_db_session, mock_super_admin_user
    ):
        """Should return error when SSO not configured."""
        from app.api.v1.sso_admin import test_sso_connection

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await test_sso_connection(
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        assert exc_info.value.status_code == 400
        assert "SSO not configured" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_sso_connection_timeout(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should handle connection timeout."""
        from app.api.v1.sso_admin import test_sso_connection
        import httpx

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.sso_admin.httpx.AsyncClient") as mock_client:
            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
            mock_client.return_value = mock_client_instance

            result = await test_sso_connection(
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        assert result.success is False
        assert "timeout" in result.message.lower()
        assert mock_sso_config.last_test_success is False

    @pytest.mark.asyncio
    async def test_sso_connection_http_error(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should handle HTTP errors."""
        from app.api.v1.sso_admin import test_sso_connection
        import httpx

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()

        with patch("app.api.v1.sso_admin.httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 404
            mock_response.text = "Not Found"

            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(side_effect=httpx.HTTPStatusError(
                "Not Found", request=MagicMock(), response=mock_response
            ))
            mock_client.return_value = mock_client_instance

            result = await test_sso_connection(
                db=mock_db_session,
                current_user=mock_super_admin_user,
            )

        assert result.success is False
        assert "HTTP error" in result.message


# ============ Test Disable SSO ============

class TestDisableSSO:
    """Test disable SSO endpoint."""

    @pytest.mark.asyncio
    async def test_disable_sso_success(
        self, mock_db_session, mock_super_admin_user, mock_sso_config
    ):
        """Should disable SSO configuration."""
        from app.api.v1.sso_admin import disable_sso

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_sso_config)
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.commit = AsyncMock()

        result = await disable_sso(
            db=mock_db_session,
            current_user=mock_super_admin_user,
        )

        assert result["message"] == "SSO has been disabled"
        assert mock_sso_config.enabled is False
        assert mock_sso_config.updated_by == "superadmin"
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_disable_sso_not_configured(
        self, mock_db_session, mock_super_admin_user
    ):
        """Should handle disable when no config exists."""
        from app.api.v1.sso_admin import disable_sso

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await disable_sso(
            db=mock_db_session,
            current_user=mock_super_admin_user,
        )

        assert result["message"] == "SSO has been disabled"
        # Should not fail even if no config exists


# ============ Test Encryption Helpers ============

class TestEncryptionHelpers:
    """Test encryption helper functions."""

    def test_encrypt_secret_empty(self):
        """Should return empty string for empty input."""
        from app.api.v1.sso_admin import encrypt_secret

        result = encrypt_secret("")

        assert result == ""

    def test_encrypt_secret_valid(self):
        """Should encrypt non-empty secret."""
        from app.api.v1.sso_admin import encrypt_secret

        with patch("app.api.v1.sso_admin.encrypt_field") as mock_encrypt:
            mock_encrypt.return_value = "encrypted_value"

            result = encrypt_secret("my-secret")

        mock_encrypt.assert_called_once_with("my-secret")
        assert result == "encrypted_value"

    def test_decrypt_secret_empty(self):
        """Should return empty string for empty input."""
        from app.api.v1.sso_admin import decrypt_secret

        result = decrypt_secret("")

        assert result == ""

    def test_decrypt_secret_valid(self):
        """Should decrypt valid encrypted value."""
        from app.api.v1.sso_admin import decrypt_secret

        with patch("app.api.v1.sso_admin.decrypt_field") as mock_decrypt:
            mock_decrypt.return_value = "my-secret"

            result = decrypt_secret("encrypted_value")

        mock_decrypt.assert_called_once_with("encrypted_value")
        assert result == "my-secret"

    def test_decrypt_secret_error(self):
        """Should return empty string on decryption error."""
        from app.api.v1.sso_admin import decrypt_secret, EncryptionError

        with patch("app.api.v1.sso_admin.decrypt_field") as mock_decrypt:
            mock_decrypt.side_effect = EncryptionError("Decryption failed")

            result = decrypt_secret("invalid_encrypted_value")

        assert result == ""
