"""
Tests for AI API Endpoints

Tests the AI/LLM provider management system including:
- AI service status checking
- Available providers listing
- Provider selection and switching
- Provider status and provisioning
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
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
    user.username = "admin"
    user.email = "admin@example.com"
    user.role = "admin"
    user.is_active = True
    return user


@pytest.fixture
def mock_app_settings():
    """Mock application settings."""
    settings = MagicMock()
    settings.ai_provider = "auto"
    return settings


@pytest.fixture
def mock_provider_status():
    """Mock provider status dictionary."""
    return {
        "local": {"installed": True, "ready": True},
        "openai": {"installed": True, "ready": True},
        "anthropic": {"installed": False, "ready": False},
        "google": {"installed": True, "ready": True},
        "auto": {"installed": True, "ready": True}
    }


# =============================================================================
# AI Status Tests
# =============================================================================

class TestGetAIStatus:
    """Tests for GET /ai/status endpoint."""

    @pytest.mark.asyncio
    async def test_get_ai_status_ready(self, mock_db_session, mock_user):
        """Test getting AI status when provider is ready."""
        from app.api.v1.ai import get_ai_status

        with patch("app.api.v1.ai.resolve_llm_provider_and_model") as mock_resolve:
            mock_resolve.return_value = ("openai", "openai", "gpt-4")

            with patch("app.api.v1.ai._build_provider_status") as mock_status:
                mock_status.return_value = {
                    "openai": {"installed": True, "ready": True}
                }

                with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
                    mock_configured.return_value = True

                    result = await get_ai_status(
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert result.ready is True
        assert result.provider == "openai"
        assert result.model_type == "openai"

    @pytest.mark.asyncio
    async def test_get_ai_status_local_ollama(self, mock_db_session, mock_user):
        """Test AI status when using local Ollama provider."""
        from app.api.v1.ai import get_ai_status

        with patch("app.api.v1.ai.resolve_llm_provider_and_model") as mock_resolve:
            mock_resolve.return_value = ("local", "ollama", "gemma3:4b")

            with patch("app.api.v1.ai._build_provider_status") as mock_status:
                mock_status.return_value = {
                    "local": {"installed": True, "ready": True}
                }

                result = await get_ai_status(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.provider == "local"
        assert "local" in result.message.lower()

    @pytest.mark.asyncio
    async def test_get_ai_status_auto_provider(self, mock_db_session, mock_user):
        """Test AI status with auto provider selection."""
        from app.api.v1.ai import get_ai_status

        with patch("app.api.v1.ai.resolve_llm_provider_and_model") as mock_resolve:
            mock_resolve.return_value = ("auto", "openai", "gpt-4")

            with patch("app.api.v1.ai._build_provider_status") as mock_status:
                mock_status.return_value = {
                    "auto": {"installed": True, "ready": True}
                }

                with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
                    mock_configured.return_value = True

                    result = await get_ai_status(
                        db=mock_db_session,
                        current_user=mock_user
                    )

        assert result.provider == "auto"


# =============================================================================
# AI Providers Tests
# =============================================================================

class TestGetAIProviders:
    """Tests for GET /ai/providers endpoint."""

    @pytest.mark.asyncio
    async def test_get_ai_providers_list(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test getting list of available AI providers."""
        from app.api.v1.ai import get_ai_providers

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            with patch("app.api.v1.ai.normalize_ai_provider") as mock_normalize:
                mock_normalize.return_value = "auto"

                result = await get_ai_providers(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert len(result.providers) == 5
        provider_ids = [p["id"] for p in result.providers]
        assert "local" in provider_ids
        assert "openai" in provider_ids
        assert "anthropic" in provider_ids
        assert "google" in provider_ids
        assert "auto" in provider_ids
        assert result.current == "auto"

    @pytest.mark.asyncio
    async def test_get_ai_providers_current_openai(
        self, mock_db_session, mock_user
    ):
        """Test getting providers with openai as current."""
        from app.api.v1.ai import get_ai_providers

        settings_openai = MagicMock()
        settings_openai.ai_provider = "openai"

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=settings_openai)
            MockService.return_value = mock_service_instance

            with patch("app.api.v1.ai.normalize_ai_provider") as mock_normalize:
                mock_normalize.return_value = "openai"

                result = await get_ai_providers(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result.current == "openai"


# =============================================================================
# Set Provider Tests
# =============================================================================

class TestSetAIProvider:
    """Tests for POST /ai/set-provider endpoint."""

    @pytest.mark.asyncio
    async def test_set_ai_provider_success(self, mock_db_session, mock_user):
        """Test successfully setting AI provider."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest

        request = SetProviderRequest(provider="openai")

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_ai_provider = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["success"] is True
        assert result["provider"] == "openai"
        mock_service_instance.set_ai_provider.assert_called_once_with("openai")

    @pytest.mark.asyncio
    async def test_set_ai_provider_local(self, mock_db_session, mock_user):
        """Test setting provider to local (Ollama)."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest

        request = SetProviderRequest(provider="local")

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_ai_provider = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["provider"] == "local"

    @pytest.mark.asyncio
    async def test_set_ai_provider_auto(self, mock_db_session, mock_user):
        """Test setting provider to auto-select."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest

        request = SetProviderRequest(provider="auto")

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_ai_provider = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["provider"] == "auto"

    @pytest.mark.asyncio
    async def test_set_ai_provider_invalid(self, mock_db_session, mock_user):
        """Test error when setting invalid provider."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest
        from fastapi import HTTPException

        request = SetProviderRequest(provider="invalid_provider")

        with pytest.raises(HTTPException) as exc_info:
            await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert exc_info.value.status_code == 400
        assert "Invalid provider" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_set_ai_provider_case_insensitive(self, mock_db_session, mock_user):
        """Test that provider names are case insensitive."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest

        request = SetProviderRequest(provider="OpenAI")  # Mixed case

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_ai_provider = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["provider"] == "openai"

    @pytest.mark.asyncio
    async def test_set_ai_provider_trims_whitespace(self, mock_db_session, mock_user):
        """Test that provider names are trimmed."""
        from app.api.v1.ai import set_ai_provider, SetProviderRequest

        request = SetProviderRequest(provider="  openai  ")

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.set_ai_provider = AsyncMock()
            MockService.return_value = mock_service_instance

            result = await set_ai_provider(
                request=request,
                db=mock_db_session,
                current_user=mock_user
            )

        assert result["provider"] == "openai"


# =============================================================================
# Provider Status Tests
# =============================================================================

class TestGetProviderStatus:
    """Tests for GET /ai/provider-status endpoint."""

    @pytest.mark.asyncio
    async def test_get_provider_status_all_ready(
        self, mock_user, mock_provider_status
    ):
        """Test getting provider status when all are ready."""
        from app.api.v1.ai import get_provider_status

        with patch("app.api.v1.ai._build_provider_status") as mock_build:
            mock_build.return_value = mock_provider_status

            result = await get_provider_status(current_user=mock_user)

        assert "local" in result.status
        assert "openai" in result.status
        assert "anthropic" in result.status
        assert "google" in result.status
        assert "auto" in result.status

    @pytest.mark.asyncio
    async def test_get_provider_status_local_not_ready(self, mock_user):
        """Test provider status when local Ollama is not running."""
        from app.api.v1.ai import get_provider_status

        status = {
            "local": {"installed": True, "ready": False},
            "openai": {"installed": True, "ready": True},
            "anthropic": {"installed": False, "ready": False},
            "google": {"installed": False, "ready": False},
            "auto": {"installed": True, "ready": True}
        }

        with patch("app.api.v1.ai._build_provider_status") as mock_build:
            mock_build.return_value = status

            result = await get_provider_status(current_user=mock_user)

        assert result.status["local"]["ready"] is False
        assert result.status["auto"]["ready"] is True  # Still ready via openai


# =============================================================================
# Provision Provider Tests
# =============================================================================

class TestProvisionProvider:
    """Tests for POST /ai/provision-provider endpoint."""

    @pytest.mark.asyncio
    async def test_provision_provider_local_ready(self, mock_user):
        """Test provisioning local provider when Ollama is running."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="local")

        with patch("app.api.v1.ai._ollama_ready") as mock_ollama:
            mock_ollama.return_value = True

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is True
        assert "ready" in result.message.lower()

    @pytest.mark.asyncio
    async def test_provision_provider_local_not_ready(self, mock_user):
        """Test provisioning local provider when Ollama is not running."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="local")

        with patch("app.api.v1.ai._ollama_ready") as mock_ollama:
            mock_ollama.return_value = False

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is False
        assert "not ready" in result.message.lower()

    @pytest.mark.asyncio
    async def test_provision_provider_openai_configured(self, mock_user):
        """Test provisioning OpenAI when configured."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="openai")

        with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
            mock_configured.return_value = True

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is True
        assert "OpenAI" in result.message

    @pytest.mark.asyncio
    async def test_provision_provider_openai_not_configured(self, mock_user):
        """Test provisioning OpenAI when not configured."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="openai")

        with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
            mock_configured.return_value = False

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is False
        assert "not configured" in result.message.lower()

    @pytest.mark.asyncio
    async def test_provision_provider_anthropic(self, mock_user):
        """Test provisioning Anthropic Claude."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="anthropic")

        with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
            mock_configured.return_value = True

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is True
        assert "Anthropic" in result.message

    @pytest.mark.asyncio
    async def test_provision_provider_google(self, mock_user):
        """Test provisioning Google Gemini."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="google")

        with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
            mock_configured.return_value = True

            result = await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert result.success is True
        assert "Google" in result.message

    @pytest.mark.asyncio
    async def test_provision_provider_invalid(self, mock_user):
        """Test error when provisioning invalid provider."""
        from app.api.v1.ai import provision_provider, ProvisionProviderRequest
        from fastapi import HTTPException

        request = ProvisionProviderRequest(provider_id="invalid")

        with pytest.raises(HTTPException) as exc_info:
            await provision_provider(
                request=request,
                current_user=mock_user
            )

        assert exc_info.value.status_code == 400
        assert "Unknown provider" in str(exc_info.value.detail)


# =============================================================================
# Model Type Tests
# =============================================================================

class TestGetModelType:
    """Tests for GET /ai/model-type endpoint."""

    @pytest.mark.asyncio
    async def test_get_model_type_auto(
        self, mock_db_session, mock_user, mock_app_settings
    ):
        """Test getting model type when set to auto."""
        from app.api.v1.ai import get_model_type

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=mock_app_settings)
            MockService.return_value = mock_service_instance

            with patch("app.api.v1.ai.normalize_ai_provider") as mock_normalize:
                mock_normalize.return_value = "auto"

                result = await get_model_type(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result["modelType"] == "auto"
        assert result["provider"] == "auto"

    @pytest.mark.asyncio
    async def test_get_model_type_openai(self, mock_db_session, mock_user):
        """Test getting model type when set to openai."""
        from app.api.v1.ai import get_model_type

        settings_openai = MagicMock()
        settings_openai.ai_provider = "openai"

        with patch("app.api.v1.ai.AppSettingsService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_settings = AsyncMock(return_value=settings_openai)
            MockService.return_value = mock_service_instance

            with patch("app.api.v1.ai.normalize_ai_provider") as mock_normalize:
                mock_normalize.return_value = "openai"

                result = await get_model_type(
                    db=mock_db_session,
                    current_user=mock_user
                )

        assert result["modelType"] == "openai"
        assert result["provider"] == "openai"


# =============================================================================
# Helper Function Tests
# =============================================================================

class TestHelperFunctions:
    """Tests for helper functions."""

    @pytest.mark.asyncio
    async def test_ollama_ready_success(self):
        """Test Ollama ready check when service is running."""
        from app.api.v1.ai import _ollama_ready
        import httpx

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = MagicMock()
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock()
            MockClient.return_value = mock_client_instance

            result = await _ollama_ready()

        assert result is True

    @pytest.mark.asyncio
    async def test_ollama_ready_not_running(self):
        """Test Ollama ready check when service is not running."""
        from app.api.v1.ai import _ollama_ready
        import httpx

        with patch("httpx.AsyncClient") as MockClient:
            mock_client_instance = MagicMock()
            mock_client_instance.get = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock()
            MockClient.return_value = mock_client_instance

            result = await _ollama_ready()

        assert result is False

    @pytest.mark.asyncio
    async def test_build_provider_status(self):
        """Test building provider status dictionary."""
        from app.api.v1.ai import _build_provider_status

        with patch("app.api.v1.ai._ollama_ready") as mock_ollama:
            mock_ollama.return_value = True

            with patch("app.api.v1.ai.provider_is_configured") as mock_configured:
                mock_configured.side_effect = lambda p: p == "openai"

                result = await _build_provider_status()

        assert "local" in result
        assert "openai" in result
        assert "anthropic" in result
        assert "google" in result
        assert "auto" in result

        assert result["local"]["ready"] is True
        assert result["openai"]["ready"] is True
        assert result["anthropic"]["ready"] is False
        assert result["auto"]["ready"] is True


# =============================================================================
# Schema Validation Tests
# =============================================================================

class TestSchemaValidation:
    """Tests for Pydantic schema validation."""

    def test_ai_status_response(self):
        """Test AIStatusResponse schema."""
        from app.api.v1.ai import AIStatusResponse

        response = AIStatusResponse(
            ready=True,
            model_type="openai",
            provider="openai",
            message="Using openai provider"
        )
        assert response.ready is True
        assert response.provider == "openai"

    def test_ai_provider_response(self):
        """Test AIProviderResponse schema."""
        from app.api.v1.ai import AIProviderResponse

        response = AIProviderResponse(
            providers=[{"id": "local", "name": "Local"}],
            current="local"
        )
        assert len(response.providers) == 1
        assert response.current == "local"

    def test_set_provider_request(self):
        """Test SetProviderRequest schema."""
        from app.api.v1.ai import SetProviderRequest

        request = SetProviderRequest(provider="openai")
        assert request.provider == "openai"

    def test_provision_provider_request(self):
        """Test ProvisionProviderRequest schema."""
        from app.api.v1.ai import ProvisionProviderRequest

        request = ProvisionProviderRequest(provider_id="local")
        assert request.provider_id == "local"

    def test_provision_provider_response(self):
        """Test ProvisionProviderResponse schema."""
        from app.api.v1.ai import ProvisionProviderResponse

        response = ProvisionProviderResponse(
            success=True,
            message="Provider is ready"
        )
        assert response.success is True
