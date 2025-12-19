from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Optional
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.app_settings_service import AppSettingsService, normalize_ai_provider
from app.services.llm_config import (
    resolve_llm_provider_and_model,
    provider_is_configured,
)
from app.core.config import settings
import httpx

router = APIRouter()

# Pydantic models
class AIStatusResponse(BaseModel):
    ready: bool
    model_type: str
    provider: str
    message: Optional[str] = None

class AIProviderResponse(BaseModel):
    providers: list
    current: str

class SetProviderRequest(BaseModel):
    provider: str  # openai, local, microsoft, etc.

class ProviderStatusResponse(BaseModel):
    status: Dict[str, dict]

class ProvisionProviderRequest(BaseModel):
    provider_id: str

class ProvisionProviderResponse(BaseModel):
    success: bool
    message: str

_PROVIDER_IDS = ["local", "openai", "auto", "microsoft", "qwen", "mistral", "ibm"]


async def _ollama_ready() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def _build_provider_status() -> Dict[str, dict]:
    local_ready = await _ollama_ready()
    status = {
        "local": {"installed": True, "ready": local_ready},
        "openai": {"installed": bool(settings.OPENAI_API_KEY), "ready": provider_is_configured("openai")},
        "microsoft": {
            "installed": bool(settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT),
            "ready": provider_is_configured("azure"),
        },
        "qwen": {"installed": bool(settings.QWEN_API_KEY), "ready": provider_is_configured("qwen")},
        "mistral": {"installed": bool(settings.MISTRAL_API_KEY), "ready": provider_is_configured("mistral")},
        "ibm": {"installed": bool(settings.IBM_API_KEY), "ready": provider_is_configured("ibm")},
    }
    status["auto"] = {
        "installed": True,
        "ready": any(item["ready"] for item in status.values()) or local_ready,
    }
    return status

@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get current AI/LLM service status.
    For web application, AI is handled server-side via FastAPI.
    """
    provider_id, runtime_provider, _model = await resolve_llm_provider_and_model(db)
    provider_status = await _build_provider_status()
    provider_info = provider_status.get(provider_id, {})
    ready = provider_info.get("ready", False)

    if runtime_provider == "ollama" and provider_id != "auto":
        ready = provider_info.get("ready", False)
    elif runtime_provider != "ollama":
        ready = provider_is_configured(runtime_provider)

    return AIStatusResponse(
        ready=ready,
        model_type=provider_id,
        provider=provider_id,
        message=f"Using {provider_id} provider"
    )

@router.get("/providers", response_model=AIProviderResponse)
async def get_ai_providers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of available AI providers and current selection.
    """
    available_providers = [
        {'id': 'local', 'name': 'Local LLM', 'description': 'Self-hosted models (Ollama)'},
        {'id': 'openai', 'name': 'OpenAI', 'description': 'GPT-5.1'},
        {'id': 'microsoft', 'name': 'Microsoft Azure', 'description': 'Azure OpenAI Service'},
        {'id': 'qwen', 'name': 'Qwen', 'description': 'Qwen3-Max'},
        {'id': 'mistral', 'name': 'Mistral', 'description': 'Mistral Large'},
        {'id': 'ibm', 'name': 'IBM', 'description': 'Granite 3.0'},
        {'id': 'auto', 'name': 'Auto', 'description': 'Auto-select based on availability'},
    ]

    service = AppSettingsService(db)
    app_settings = await service.get_settings()

    return AIProviderResponse(
        providers=available_providers,
        current=normalize_ai_provider(app_settings.ai_provider)
    )

@router.post("/set-provider")
async def set_ai_provider(
    request: SetProviderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Set the current AI provider.
    """
    provider = request.provider.strip().lower()

    valid_providers = _PROVIDER_IDS
    if provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider. Must be one of: {', '.join(valid_providers)}"
        )

    service = AppSettingsService(db)
    await service.set_ai_provider(provider)

    return {
        'success': True,
        'message': f'AI provider set to {provider}',
        'provider': provider
    }

@router.get("/provider-status", response_model=ProviderStatusResponse)
async def get_provider_status(
    current_user: User = Depends(get_current_user)
):
    """
    Get installation/provisioning status of all providers.
    """
    status = await _build_provider_status()
    return ProviderStatusResponse(status=status)

@router.post("/provision-provider", response_model=ProvisionProviderResponse)
async def provision_provider(
    request: ProvisionProviderRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Provision/install an AI provider.
    For web application, this is mostly a no-op since providers are server-side.
    """
    provider_id = request.provider_id.strip().lower()

    if provider_id not in _PROVIDER_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {provider_id}"
        )

    if provider_id == "local":
        ready = await _ollama_ready()
        if ready:
            return ProvisionProviderResponse(
                success=True,
                message="Local provider is ready"
            )
        return ProvisionProviderResponse(
            success=False,
            message="Local provider not ready. Ensure Ollama is running and the model is available."
        )

    if provider_id == "openai" and provider_is_configured("openai"):
        return ProvisionProviderResponse(
            success=True,
            message="OpenAI provider is ready"
        )

    if provider_id == "microsoft" and provider_is_configured("azure"):
        return ProvisionProviderResponse(
            success=True,
            message="Azure OpenAI provider is ready"
        )

    if provider_id == "qwen" and provider_is_configured("qwen"):
        return ProvisionProviderResponse(
            success=True,
            message="Qwen provider is ready"
        )

    if provider_id == "mistral" and provider_is_configured("mistral"):
        return ProvisionProviderResponse(
            success=True,
            message="Mistral provider is ready"
        )

    if provider_id == "ibm" and provider_is_configured("ibm"):
        return ProvisionProviderResponse(
            success=True,
            message="IBM provider is ready"
        )

    return ProvisionProviderResponse(
        success=False,
        message=f"Provider {provider_id} is not configured"
    )

@router.get("/model-type")
async def get_model_type(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the current AI model type.
    """
    service = AppSettingsService(db)
    app_settings = await service.get_settings()
    return {
        'modelType': normalize_ai_provider(app_settings.ai_provider),
        'provider': normalize_ai_provider(app_settings.ai_provider)
    }
