"""
Tests for Settings API Endpoints

Tests the application settings system including:
- Offline mode configuration
- Risk threshold management (dynamic & manual override)
- Settings reset functionality
- Threshold calculation from probability distributions
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from decimal import Decimal
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
    session.rollback = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.username = "admin"
    user.email = "admin@example.com"
    user.role = "admin"
    user.is_active = True
    return user


@pytest.fixture
def mock_app_settings():
    """Mock application settings object."""
    settings = MagicMock()
    settings.strict_offline_mode = False
    settings.risk_thresholds_override_high = None
    settings.risk_thresholds_override_medium = None
    return settings


@pytest.fixture
def mock_app_settings_with_override():
    """Mock app settings with manual threshold override."""
    settings = MagicMock()
    settings.strict_offline_mode = False
    settings.risk_thresholds_override_high = 0.70
    settings.risk_thresholds_override_medium = 0.40
    return settings


@pytest.fixture
def mock_probabilities():
    """Mock list of churn probabilities for threshold calculation."""
    # 20 probabilities to exceed MIN_SAMPLE_SIZE (10)
    return [
        0.15, 0.22, 0.28, 0.32, 0.35,  # Low risk
        0.42, 0.45, 0.48, 0.52, 0.55,  # Low-Medium
        0.58, 0.62, 0.65, 0.68, 0.72,  # Medium
        0.75, 0.78, 0.82, 0.88, 0.92   # High risk
    ]


# =============================================================================
# Offline Mode Tests
# =============================================================================

class TestOfflineMode:
    """Tests for offline mode endpoints."""

    @pytest.mark.asyncio
    async def test_get_offline_mode_disabled(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test getting offline mode when disabled."""
        from app.api.v1.settings import get_offline_mode

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            result = await get_offline_mode(
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.enabled is False
        assert "disabled" in result.message

    @pytest.mark.asyncio
    async def test_get_offline_mode_enabled(
        self, mock_db_session, mock_user
    ):
        """Test getting offline mode when enabled."""
        from app.api.v1.settings import get_offline_mode

        enabled_settings = MagicMock()
        enabled_settings.strict_offline_mode = True

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=enabled_settings)
            MockService.return_value = mock_service_instance

            result = await get_offline_mode(
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.enabled is True
        assert "enabled" in result.message

    @pytest.mark.asyncio
    async def test_set_offline_mode_enable(
        self, mock_db_session, mock_user
    ):
        """Test enabling offline mode."""
        from app.api.v1.settings import set_offline_mode, OfflineModeRequest

        request = OfflineModeRequest(enabled=True)

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_offline_mode = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_offline_mode(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.enabled is True
        assert "enabled" in result.message
        mock_service_instance.set_offline_mode.assert_called_once_with(True)

    @pytest.mark.asyncio
    async def test_set_offline_mode_disable(
        self, mock_db_session, mock_user
    ):
        """Test disabling offline mode."""
        from app.api.v1.settings import set_offline_mode, OfflineModeRequest

        request = OfflineModeRequest(enabled=False)

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_offline_mode = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_offline_mode(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.enabled is False
        assert "disabled" in result.message


# =============================================================================
# All Settings Tests
# =============================================================================

class TestGetAllSettings:
    """Tests for GET /settings/all endpoint."""

    @pytest.mark.asyncio
    async def test_get_all_settings_no_override(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test getting all settings without threshold override."""
        from app.api.v1.settings import get_all_settings

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            result = await get_all_settings(
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["settings"]["strict_offline_mode"] is False
        assert result["settings"]["risk_thresholds_override"] is None
        assert result["user_id"] == 1

    @pytest.mark.asyncio
    async def test_get_all_settings_with_override(
        self, mock_db_session, mock_user, mock_app_settings_with_override
    ):
        """Test getting all settings with threshold override."""
        from app.api.v1.settings import get_all_settings

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(
                return_value=mock_app_settings_with_override
            )
            MockService.return_value = mock_service_instance

            result = await get_all_settings(
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["settings"]["risk_thresholds_override"] is not None
        assert result["settings"]["risk_thresholds_override"]["highRisk"] == 0.70
        assert result["settings"]["risk_thresholds_override"]["mediumRisk"] == 0.40


# =============================================================================
# Reset Settings Tests
# =============================================================================

class TestResetSettings:
    """Tests for POST /settings/reset endpoint."""

    @pytest.mark.asyncio
    async def test_reset_settings_success(
        self, mock_db_session, mock_user
    ):
        """Test resetting all settings to defaults."""
        from app.api.v1.settings import reset_settings

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_offline_mode = AsyncMock()
            mock_service_instance.clear_risk_threshold_override = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await reset_settings(
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["success"] is True
        assert "reset" in result["message"].lower()
        assert result["settings"]["strict_offline_mode"] is False
        assert result["settings"]["risk_thresholds_override"] is None

        mock_service_instance.set_offline_mode.assert_called_once_with(False)
        mock_service_instance.clear_risk_threshold_override.assert_called_once()


# =============================================================================
# Risk Thresholds Tests
# =============================================================================

class TestRiskThresholds:
    """Tests for risk threshold endpoints."""

    @pytest.mark.asyncio
    async def test_get_risk_thresholds_dynamic(
        self, mock_db_session, mock_user, mock_app_settings, mock_probabilities
    ):
        """Test getting dynamically calculated risk thresholds."""
        from app.api.v1.settings import get_risk_thresholds

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            with patch(
                "app.api.v1.settings._calculate_dynamic_thresholds"
            ) as mock_calc:
                mock_calc.return_value = {
                    'thresholds': {'highRisk': 0.75, 'mediumRisk': 0.45},
                    'source': 'dynamic',
                    'reason': 'Calculated from 20 active employees',
                    'sampleSize': 20,
                    'distribution': None,
                    'statistics': None
                }

                result = await get_risk_thresholds(
                    db=mock_db_session,
                    dataset_id=None,
                    current_user=mock_user
                )

        assert result.highRisk == 0.75
        assert result.mediumRisk == 0.45
        assert result.source == "dynamic"
        assert result.sampleSize == 20

    @pytest.mark.asyncio
    async def test_get_risk_thresholds_manual_override(
        self, mock_db_session, mock_user, mock_app_settings_with_override
    ):
        """Test that manual override takes precedence."""
        from app.api.v1.settings import get_risk_thresholds

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(
                return_value=mock_app_settings_with_override
            )
            MockService.return_value = mock_service_instance

            result = await get_risk_thresholds(
                db=mock_db_session,
                dataset_id=None,
                current_user=mock_user
            )

        assert result.highRisk == 0.70
        assert result.mediumRisk == 0.40
        assert result.source == "manual"
        assert result.sampleSize is None

    @pytest.mark.asyncio
    async def test_get_risk_thresholds_with_dataset_id(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test getting thresholds for specific dataset."""
        from app.api.v1.settings import get_risk_thresholds

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            with patch(
                "app.api.v1.settings._calculate_dynamic_thresholds"
            ) as mock_calc:
                mock_calc.return_value = {
                    'thresholds': {'highRisk': 0.80, 'mediumRisk': 0.50},
                    'source': 'dynamic',
                    'reason': 'Calculated',
                    'sampleSize': 50,
                    'distribution': None,
                    'statistics': None
                }

                await get_risk_thresholds(
                    db=mock_db_session,
                    dataset_id="dataset-123",
                    current_user=mock_user
                )

                mock_calc.assert_called_once()
                call_args = mock_calc.call_args
                assert call_args[0][1] == "dataset-123"


# =============================================================================
# Detailed Risk Thresholds Tests
# =============================================================================

class TestRiskThresholdsDetailed:
    """Tests for GET /settings/risk-thresholds/detailed endpoint."""

    @pytest.mark.asyncio
    async def test_get_detailed_thresholds_dynamic(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test detailed thresholds with distribution and statistics."""
        from app.api.v1.settings import get_risk_thresholds_detailed

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            with patch(
                "app.api.v1.settings._calculate_dynamic_thresholds"
            ) as mock_calc:
                mock_calc.return_value = {
                    'thresholds': {'highRisk': 0.75, 'mediumRisk': 0.45},
                    'source': 'dynamic',
                    'reason': 'Calculated from 100 active employees',
                    'sampleSize': 100,
                    'distribution': {
                        'high': {'count': 15, 'percentage': 15.0},
                        'medium': {'count': 25, 'percentage': 25.0},
                        'low': {'count': 60, 'percentage': 60.0}
                    },
                    'statistics': {
                        'mean': 0.45,
                        'median': 0.42,
                        'std': 0.22,
                        'min': 0.05,
                        'max': 0.95,
                        'p25': 0.28,
                        'p75': 0.65
                    }
                }

                result = await get_risk_thresholds_detailed(
                    db=mock_db_session,
                    dataset_id=None,
                    current_user=mock_user
                )

        assert result.highRisk == 0.75
        assert result.mediumRisk == 0.45
        assert result.source == "dynamic"
        assert result.sampleSize == 100
        assert result.distribution is not None
        assert result.distribution["high"]["percentage"] == 15.0
        assert result.statistics is not None
        assert result.statistics["mean"] == 0.45

    @pytest.mark.asyncio
    async def test_get_detailed_thresholds_manual_override(
        self, mock_db_session, mock_user, mock_app_settings_with_override
    ):
        """Test detailed thresholds when manual override is set."""
        from app.api.v1.settings import get_risk_thresholds_detailed

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(
                return_value=mock_app_settings_with_override
            )
            MockService.return_value = mock_service_instance

            result = await get_risk_thresholds_detailed(
                db=mock_db_session,
                dataset_id=None,
                current_user=mock_user
            )

        assert result.highRisk == 0.70
        assert result.mediumRisk == 0.40
        assert result.source == "manual"
        assert result.reason == "Manual override"
        assert result.distribution is None
        assert result.statistics is None


# =============================================================================
# Update Risk Thresholds Tests
# =============================================================================

class TestUpdateRiskThresholds:
    """Tests for PUT /settings/risk-thresholds endpoint."""

    @pytest.mark.asyncio
    async def test_update_risk_thresholds_success(
        self, mock_db_session, mock_user
    ):
        """Test successfully updating risk thresholds."""
        from app.api.v1.settings import update_risk_thresholds, RiskThresholdsRequest

        request = RiskThresholdsRequest(highRisk=0.75, mediumRisk=0.40)

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_risk_threshold_override = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await update_risk_thresholds(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result.highRisk == 0.75
        assert result.mediumRisk == 0.40
        assert result.source == "manual"
        mock_service_instance.set_risk_threshold_override.assert_called_once_with(0.75, 0.40)

    @pytest.mark.asyncio
    async def test_update_risk_thresholds_invalid_order(
        self, mock_db_session, mock_user
    ):
        """Test error when mediumRisk >= highRisk."""
        from app.api.v1.settings import update_risk_thresholds, RiskThresholdsRequest
        from fastapi import HTTPException

        # Medium equals high
        request = RiskThresholdsRequest(highRisk=0.50, mediumRisk=0.50)

        with pytest.raises(HTTPException) as exc_info:
            await update_risk_thresholds(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert exc_info.value.status_code == 400
        assert "less than" in str(exc_info.value.detail).lower()

    @pytest.mark.asyncio
    async def test_update_risk_thresholds_medium_greater_than_high(
        self, mock_db_session, mock_user
    ):
        """Test error when mediumRisk > highRisk."""
        from app.api.v1.settings import update_risk_thresholds, RiskThresholdsRequest
        from fastapi import HTTPException

        request = RiskThresholdsRequest(highRisk=0.40, mediumRisk=0.60)

        with pytest.raises(HTTPException) as exc_info:
            await update_risk_thresholds(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert exc_info.value.status_code == 400

    def test_risk_thresholds_request_validation_bounds(self):
        """Test that threshold values must be between 0 and 1."""
        from app.api.v1.settings import RiskThresholdsRequest
        from pydantic import ValidationError

        # Valid request
        valid = RiskThresholdsRequest(highRisk=0.8, mediumRisk=0.4)
        assert valid.highRisk == 0.8

        # Invalid: negative value
        with pytest.raises(ValidationError):
            RiskThresholdsRequest(highRisk=-0.1, mediumRisk=0.3)

        # Invalid: value > 1
        with pytest.raises(ValidationError):
            RiskThresholdsRequest(highRisk=1.5, mediumRisk=0.3)


# =============================================================================
# Reset Risk Thresholds Tests
# =============================================================================

class TestResetRiskThresholds:
    """Tests for POST /settings/risk-thresholds/reset endpoint."""

    @pytest.mark.asyncio
    async def test_reset_risk_thresholds_success(
        self, mock_db_session, mock_user
    ):
        """Test resetting risk thresholds to dynamic mode."""
        from app.api.v1.settings import reset_risk_thresholds

        with patch("app.api.v1.settings.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.clear_risk_threshold_override = AsyncMock()
            MockService.return_value = mock_service_instance

            with patch(
                "app.api.v1.settings._calculate_dynamic_thresholds"
            ) as mock_calc:
                mock_calc.return_value = {
                    'thresholds': {'highRisk': 0.72, 'mediumRisk': 0.42},
                    'source': 'dynamic',
                    'reason': 'Calculated',
                    'sampleSize': 50,
                    'distribution': None,
                    'statistics': None
                }

                result = await reset_risk_thresholds(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.highRisk == 0.72
        assert result.mediumRisk == 0.42
        assert result.source == "dynamic"
        mock_service_instance.clear_risk_threshold_override.assert_called_once()


# =============================================================================
# Helper Function Tests
# =============================================================================

class TestThresholdCalculationHelpers:
    """Tests for threshold calculation helper functions."""

    def test_calculate_thresholds_from_distribution(self, mock_probabilities):
        """Test percentile-based threshold calculation."""
        from app.api.v1.settings import _calculate_thresholds_from_distribution

        result = _calculate_thresholds_from_distribution(mock_probabilities)

        # Should calculate based on TARGET_HIGH_PCT (15%) and TARGET_MEDIUM_PCT (25%)
        assert 'highRisk' in result
        assert 'mediumRisk' in result
        assert result['highRisk'] > result['mediumRisk']
        assert 0 <= result['mediumRisk'] <= 1
        assert 0 <= result['highRisk'] <= 1

    def test_calculate_thresholds_insufficient_data(self):
        """Test fallback thresholds when data is insufficient."""
        from app.api.v1.settings import (
            _calculate_thresholds_from_distribution,
            FALLBACK_THRESHOLDS
        )

        # Only 5 probabilities (below MIN_SAMPLE_SIZE of 10)
        small_sample = [0.3, 0.4, 0.5, 0.6, 0.7]
        result = _calculate_thresholds_from_distribution(small_sample)

        assert result == FALLBACK_THRESHOLDS

    def test_calculate_distribution(self, mock_probabilities):
        """Test distribution calculation across risk categories."""
        from app.api.v1.settings import _calculate_distribution

        thresholds = {'highRisk': 0.75, 'mediumRisk': 0.45}
        result = _calculate_distribution(mock_probabilities, thresholds)

        assert result is not None
        assert 'high' in result
        assert 'medium' in result
        assert 'low' in result
        assert result['high']['count'] + result['medium']['count'] + result['low']['count'] == 20

        # Percentages should sum to 100
        total_pct = (
            result['high']['percentage'] +
            result['medium']['percentage'] +
            result['low']['percentage']
        )
        assert abs(total_pct - 100.0) < 0.1  # Allow small rounding error

    def test_calculate_distribution_empty(self):
        """Test distribution calculation with empty data."""
        from app.api.v1.settings import _calculate_distribution

        result = _calculate_distribution([], {'highRisk': 0.7, 'mediumRisk': 0.4})
        assert result is None

    def test_calculate_statistics(self, mock_probabilities):
        """Test statistical summary calculation."""
        from app.api.v1.settings import _calculate_statistics

        result = _calculate_statistics(mock_probabilities)

        assert result is not None
        assert 'mean' in result
        assert 'median' in result
        assert 'std' in result
        assert 'min' in result
        assert 'max' in result
        assert 'p25' in result
        assert 'p75' in result

        # Basic sanity checks
        assert result['min'] <= result['median'] <= result['max']
        assert result['p25'] <= result['median'] <= result['p75']

    def test_calculate_statistics_empty(self):
        """Test statistics with empty data."""
        from app.api.v1.settings import _calculate_statistics

        result = _calculate_statistics([])
        assert result is None

    @pytest.mark.asyncio
    async def test_get_active_employee_probabilities(self, mock_db_session):
        """Test fetching probabilities from database."""
        from app.api.v1.settings import _get_active_employee_probabilities

        # Mock query result
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            0.25, 0.45, Decimal("0.65"), 0.85, None  # Include None to test filtering
        ]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await _get_active_employee_probabilities(mock_db_session)

        # Should filter out None and convert Decimal
        assert len(result) == 4
        assert all(isinstance(p, float) for p in result)
        assert 0.65 in result

    @pytest.mark.asyncio
    async def test_get_active_employee_probabilities_with_dataset(self, mock_db_session):
        """Test fetching probabilities filtered by dataset_id."""
        from app.api.v1.settings import _get_active_employee_probabilities

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [0.5, 0.6]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        await _get_active_employee_probabilities(mock_db_session, dataset_id="ds-123")

        # Verify execute was called (query should include dataset filter)
        mock_db_session.execute.assert_called_once()


# =============================================================================
# Dynamic Threshold Calculation Integration Tests
# =============================================================================

class TestDynamicThresholdCalculation:
    """Integration tests for dynamic threshold calculation."""

    @pytest.mark.asyncio
    async def test_calculate_dynamic_thresholds_success(
        self, mock_db_session, mock_probabilities
    ):
        """Test full dynamic threshold calculation flow."""
        from app.api.v1.settings import _calculate_dynamic_thresholds

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_probabilities
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch(
            "app.api.v1.settings.data_driven_thresholds_service"
        ) as mock_service:
            mock_service.compute_risk_thresholds_from_predictions.return_value = (
                0.75, 0.45
            )

            result = await _calculate_dynamic_thresholds(mock_db_session)

        assert result['source'] == 'dynamic'
        assert result['sampleSize'] == 20
        assert 'thresholds' in result
        assert result['distribution'] is not None
        assert result['statistics'] is not None

    @pytest.mark.asyncio
    async def test_calculate_dynamic_thresholds_fallback(self, mock_db_session):
        """Test fallback when insufficient data."""
        from app.api.v1.settings import _calculate_dynamic_thresholds, FALLBACK_THRESHOLDS

        # Return only 5 probabilities (below MIN_SAMPLE_SIZE)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [0.3, 0.4, 0.5, 0.6, 0.7]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await _calculate_dynamic_thresholds(mock_db_session)

        assert result['source'] == 'fallback'
        assert result['thresholds'] == FALLBACK_THRESHOLDS
        assert 'Insufficient data' in result['reason']
        assert result['distribution'] is None
        assert result['statistics'] is None


# =============================================================================
# Schema Validation Tests
# =============================================================================

class TestSchemaValidation:
    """Tests for Pydantic schema validation."""

    def test_offline_mode_request(self):
        """Test OfflineModeRequest schema."""
        from app.api.v1.settings import OfflineModeRequest

        request = OfflineModeRequest(enabled=True)
        assert request.enabled is True

        request = OfflineModeRequest(enabled=False)
        assert request.enabled is False

    def test_risk_thresholds_response(self):
        """Test RiskThresholdsResponse schema."""
        from app.api.v1.settings import RiskThresholdsResponse

        response = RiskThresholdsResponse(
            highRisk=0.75,
            mediumRisk=0.45,
            source="dynamic",
            sampleSize=100
        )
        assert response.highRisk == 0.75
        assert response.mediumRisk == 0.45

    def test_risk_thresholds_detailed_response(self):
        """Test RiskThresholdsDetailedResponse schema."""
        from app.api.v1.settings import RiskThresholdsDetailedResponse

        response = RiskThresholdsDetailedResponse(
            highRisk=0.75,
            mediumRisk=0.45,
            source="dynamic",
            reason="Calculated from 100 employees",
            sampleSize=100,
            distribution={"high": {"count": 15, "percentage": 15.0}},
            statistics={"mean": 0.45, "median": 0.42}
        )
        assert response.distribution is not None
        assert response.statistics is not None
