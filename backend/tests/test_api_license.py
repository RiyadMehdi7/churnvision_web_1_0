"""
Tests for app/api/v1/license.py - License management endpoints.

Tests cover:
- Installation ID retrieval
- License activation
- License status checking
- License refresh
- Sync status (hybrid mode)
- Force sync operations
"""
import pytest
from datetime import datetime, timedelta
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
def mock_license_info():
    """Create a mock license info object."""
    info = MagicMock()
    info.license_type = "enterprise"
    info.company_name = "Test Corp"
    info.expires_at = datetime.utcnow() + timedelta(days=365)
    info.features = ["rag", "atlas", "advanced_analytics"]
    info.max_employees = 10000
    info.max_users = 50
    return info


@pytest.fixture
def mock_expired_license_info():
    """Create a mock expired license info."""
    info = MagicMock()
    info.license_type = "starter"
    info.company_name = "Test Corp"
    info.expires_at = datetime.utcnow() - timedelta(days=30)
    info.features = []
    return info


@pytest.fixture
def mock_grace_period_license_info():
    """Create a mock license in grace period (expires within 7 days)."""
    info = MagicMock()
    info.license_type = "pro"
    info.company_name = "Test Corp"
    info.expires_at = datetime.utcnow() + timedelta(days=3)
    info.features = ["rag"]
    return info


@pytest.fixture
def mock_sync_log():
    """Create a mock sync log entry."""
    log = MagicMock()
    log.id = 1
    log.sync_type = "validation"
    log.status = "success"
    log.response_code = 200
    log.error_message = None
    log.duration_ms = 150
    log.created_at = datetime.utcnow()
    return log


# ============ Test Installation ID ============

class TestGetInstallationId:
    """Test installation ID endpoint."""

    @pytest.mark.asyncio
    async def test_get_installation_id_success(self):
        """Should return the installation ID."""
        from app.api.v1.license import get_installation_id

        with patch("app.api.v1.license.load_installation_id") as mock_load:
            mock_load.return_value = "inst-abc123-def456"

            result = await get_installation_id()

        assert result.installation_id == "inst-abc123-def456"


# ============ Test License Activation ============

class TestActivateLicense:
    """Test license activation endpoint."""

    @pytest.mark.asyncio
    async def test_activate_license_success(self, mock_license_info):
        """Should activate license successfully."""
        from app.api.v1.license import activate_license, LicenseActivationRequest

        request = LicenseActivationRequest(
            license_key="VALID-LICENSE-KEY-12345",
            installation_id="inst-001",
        )

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.decode_license.return_value = mock_license_info
            mock_validator.save_license = MagicMock()

            result = await activate_license(request)

        assert result.success is True
        assert result.message == "License activated successfully"
        assert result.license_data["tier"] == "enterprise"
        assert result.license_data["company_name"] == "Test Corp"

    @pytest.mark.asyncio
    async def test_activate_license_empty_key(self):
        """Should reject empty license key."""
        from app.api.v1.license import activate_license, LicenseActivationRequest

        request = LicenseActivationRequest(
            license_key="   ",  # Whitespace only
        )

        with pytest.raises(HTTPException) as exc_info:
            await activate_license(request)

        assert exc_info.value.status_code == 400
        assert "License key is required" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_activate_license_invalid_key(self):
        """Should reject invalid license key."""
        from app.api.v1.license import activate_license, LicenseActivationRequest

        request = LicenseActivationRequest(
            license_key="INVALID-KEY",
        )

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.decode_license.side_effect = HTTPException(
                status_code=400,
                detail="Invalid license key format"
            )

            with pytest.raises(HTTPException) as exc_info:
                await activate_license(request)

            assert exc_info.value.status_code == 400
            assert "Invalid license key" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_activate_license_save_failure(self, mock_license_info):
        """Should handle save failure gracefully."""
        from app.api.v1.license import activate_license, LicenseActivationRequest

        request = LicenseActivationRequest(
            license_key="VALID-LICENSE-KEY",
        )

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.decode_license.return_value = mock_license_info
            mock_validator.save_license.side_effect = Exception("Disk full")

            with pytest.raises(HTTPException) as exc_info:
                await activate_license(request)

            assert exc_info.value.status_code == 500
            assert "Failed to activate license" in exc_info.value.detail


# ============ Test License Status ============

class TestGetLicenseStatus:
    """Test license status endpoint."""

    @pytest.mark.asyncio
    async def test_get_license_status_active(self, mock_license_info):
        """Should return ACTIVE status for valid license."""
        from app.api.v1.license import get_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.return_value = mock_license_info

            result = await get_license_status()

        assert result.status == "ACTIVE"
        assert result.tier == "enterprise"
        assert result.is_licensed is True
        assert result.expires_at is not None

    @pytest.mark.asyncio
    async def test_get_license_status_expired(self, mock_expired_license_info):
        """Should return EXPIRED status for expired license."""
        from app.api.v1.license import get_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.return_value = mock_expired_license_info

            result = await get_license_status()

        assert result.status == "EXPIRED"
        assert result.is_licensed is False

    @pytest.mark.asyncio
    async def test_get_license_status_grace_period(self, mock_grace_period_license_info):
        """Should return GRACE_PERIOD status when expiring soon."""
        from app.api.v1.license import get_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.return_value = mock_grace_period_license_info

            result = await get_license_status()

        assert result.status == "GRACE_PERIOD"
        assert result.tier == "pro"
        assert result.is_licensed is True
        assert result.grace_period_ends is not None

    @pytest.mark.asyncio
    async def test_get_license_status_invalid(self):
        """Should return INVALID status for invalid license."""
        from app.api.v1.license import get_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.side_effect = HTTPException(
                status_code=401,
                detail="License key is invalid"
            )

            result = await get_license_status()

        assert result.status == "INVALID"
        assert result.tier == "starter"
        assert result.is_licensed is False

    @pytest.mark.asyncio
    async def test_get_license_status_expired_exception(self):
        """Should detect expired status from exception message."""
        from app.api.v1.license import get_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.side_effect = HTTPException(
                status_code=401,
                detail="License has expired"
            )

            result = await get_license_status()

        assert result.status == "EXPIRED"
        assert result.is_licensed is False


# ============ Test License Refresh ============

class TestRefreshLicenseStatus:
    """Test license refresh endpoint."""

    @pytest.mark.asyncio
    async def test_refresh_license_success(self, mock_license_info):
        """Should refresh and return current license status."""
        from app.api.v1.license import refresh_license_status

        with patch("app.api.v1.license.LicenseValidator") as mock_validator:
            mock_validator.validate_license.return_value = mock_license_info

            result = await refresh_license_status()

        assert result.status == "ACTIVE"
        assert result.is_licensed is True


# ============ Test Sync Status ============

class TestGetSyncStatus:
    """Test sync status endpoint."""

    @pytest.mark.asyncio
    async def test_get_sync_status_success(
        self, mock_db_session, mock_legacy_user, mock_sync_log
    ):
        """Should return comprehensive sync status."""
        from app.api.v1.license import get_sync_status

        # Mock database query result
        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_sync_log])))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_hybrid_status = {
            "offline_since": None,
            "revoked_at": None,
            "revocation_grace_ends": None,
            "cached_tier": "enterprise",
        }

        with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
            mock_service = MagicMock()
            mock_service.is_running.return_value = True
            mock_get_service.return_value = mock_service

            with patch("app.api.v1.license.LicenseValidator") as mock_validator:
                mock_validator.get_hybrid_status.return_value = mock_hybrid_status

                with patch("app.api.v1.license.settings") as mock_settings:
                    mock_settings.LICENSE_VALIDATION_MODE = "hybrid"
                    mock_settings.LICENSE_OFFLINE_GRACE_DAYS = 7

                    with patch("app.api.v1.license.ADMIN_API_URL", "https://admin.example.com"):
                        result = await get_sync_status(
                            db=mock_db_session,
                            current_user=mock_legacy_user,
                        )

        assert result.validation_mode == "hybrid"
        assert result.admin_panel_configured is True
        assert result.sync_service_running is True
        assert result.cached_tier == "enterprise"
        assert len(result.recent_sync_logs) == 1

    @pytest.mark.asyncio
    async def test_get_sync_status_offline_mode(
        self, mock_db_session, mock_legacy_user
    ):
        """Should show offline grace period when offline."""
        from app.api.v1.license import get_sync_status

        offline_since = (datetime.utcnow() - timedelta(days=2)).isoformat()

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        mock_hybrid_status = {
            "offline_since": offline_since,
            "revoked_at": None,
            "revocation_grace_ends": None,
            "cached_tier": "pro",
        }

        with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
            mock_service = MagicMock()
            mock_service.is_running.return_value = True
            mock_get_service.return_value = mock_service

            with patch("app.api.v1.license.LicenseValidator") as mock_validator:
                mock_validator.get_hybrid_status.return_value = mock_hybrid_status

                with patch("app.api.v1.license.settings") as mock_settings:
                    mock_settings.LICENSE_VALIDATION_MODE = "hybrid"
                    mock_settings.LICENSE_OFFLINE_GRACE_DAYS = 7

                    with patch("app.api.v1.license.ADMIN_API_URL", "https://admin.example.com"):
                        result = await get_sync_status(
                            db=mock_db_session,
                            current_user=mock_legacy_user,
                        )

        assert result.offline_since == offline_since
        assert result.is_offline_grace_active is True
        assert result.offline_grace_ends is not None

    @pytest.mark.asyncio
    async def test_get_sync_status_no_admin_panel(
        self, mock_db_session, mock_legacy_user
    ):
        """Should indicate admin panel not configured."""
        from app.api.v1.license import get_sync_status

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
            mock_service = MagicMock()
            mock_service.is_running.return_value = False
            mock_get_service.return_value = mock_service

            with patch("app.api.v1.license.LicenseValidator") as mock_validator:
                mock_validator.get_hybrid_status.return_value = {}

                with patch("app.api.v1.license.settings") as mock_settings:
                    mock_settings.LICENSE_VALIDATION_MODE = "offline"
                    mock_settings.LICENSE_OFFLINE_GRACE_DAYS = 7

                    with patch("app.api.v1.license.ADMIN_API_URL", None):
                        result = await get_sync_status(
                            db=mock_db_session,
                            current_user=mock_legacy_user,
                        )

        assert result.admin_panel_configured is False
        assert result.validation_mode == "offline"


# ============ Test Force Sync ============

class TestForceSync:
    """Test force sync endpoint."""

    @pytest.mark.asyncio
    async def test_force_sync_success(self, mock_legacy_user):
        """Should successfully perform force sync."""
        from app.api.v1.license import force_sync

        with patch("app.api.v1.license.ADMIN_API_URL", "https://admin.example.com"):
            with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
                mock_service = MagicMock()
                mock_service.sync_license_validation = AsyncMock(return_value=True)
                mock_service.sync_health_report = AsyncMock(return_value=True)
                mock_service.sync_telemetry = AsyncMock(return_value=True)
                mock_get_service.return_value = mock_service

                with patch("app.api.v1.license.invalidate_license_cache") as mock_invalidate:
                    result = await force_sync(current_user=mock_legacy_user)

        assert result.success is True
        assert result.validation_result == "success"
        assert result.health_reported is True
        assert result.telemetry_sent is True
        assert result.error is None
        mock_invalidate.assert_called_once()

    @pytest.mark.asyncio
    async def test_force_sync_validation_failed(self, mock_legacy_user):
        """Should report validation failure."""
        from app.api.v1.license import force_sync

        with patch("app.api.v1.license.ADMIN_API_URL", "https://admin.example.com"):
            with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
                mock_service = MagicMock()
                mock_service.sync_license_validation = AsyncMock(return_value=False)
                mock_service.sync_health_report = AsyncMock(return_value=True)
                mock_service.sync_telemetry = AsyncMock(return_value=False)
                mock_get_service.return_value = mock_service

                with patch("app.api.v1.license.invalidate_license_cache"):
                    result = await force_sync(current_user=mock_legacy_user)

        assert result.success is False
        assert result.validation_result == "failed"
        assert result.health_reported is True
        assert result.telemetry_sent is False

    @pytest.mark.asyncio
    async def test_force_sync_no_admin_panel(self, mock_legacy_user):
        """Should reject sync when admin panel not configured."""
        from app.api.v1.license import force_sync

        with patch("app.api.v1.license.ADMIN_API_URL", None):
            with pytest.raises(HTTPException) as exc_info:
                await force_sync(current_user=mock_legacy_user)

            assert exc_info.value.status_code == 400
            assert "Admin Panel not configured" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_force_sync_exception_handling(self, mock_legacy_user):
        """Should handle sync exceptions gracefully."""
        from app.api.v1.license import force_sync

        with patch("app.api.v1.license.ADMIN_API_URL", "https://admin.example.com"):
            with patch("app.api.v1.license.get_license_sync_service") as mock_get_service:
                mock_service = MagicMock()
                mock_service.sync_license_validation = AsyncMock(
                    side_effect=Exception("Network timeout")
                )
                mock_get_service.return_value = mock_service

                result = await force_sync(current_user=mock_legacy_user)

        assert result.success is False
        assert result.error == "Network timeout"


# ============ Test Status Helper Function ============

class TestStatusFromLicenseInfo:
    """Test the _status_from_license_info helper function."""

    def test_status_active(self, mock_license_info):
        """Should return ACTIVE for license with >7 days remaining."""
        from app.api.v1.license import _status_from_license_info

        result = _status_from_license_info(mock_license_info)

        assert result.status == "ACTIVE"
        assert result.is_licensed is True
        assert result.tier == "enterprise"
        assert result.grace_period_ends is None

    def test_status_grace_period(self, mock_grace_period_license_info):
        """Should return GRACE_PERIOD for license expiring within 7 days."""
        from app.api.v1.license import _status_from_license_info

        result = _status_from_license_info(mock_grace_period_license_info)

        assert result.status == "GRACE_PERIOD"
        assert result.is_licensed is True
        assert result.grace_period_ends is not None

    def test_status_expired(self, mock_expired_license_info):
        """Should return EXPIRED for expired license."""
        from app.api.v1.license import _status_from_license_info

        result = _status_from_license_info(mock_expired_license_info)

        assert result.status == "EXPIRED"
        assert result.is_licensed is False
        assert result.tier == "starter"
