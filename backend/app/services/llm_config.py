"""
Helpers for resolving LLM provider/model based on persisted settings.
"""

from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.app_settings_service import AppSettingsService, normalize_ai_provider

_PROVIDER_PREFERENCE = ["openai", "microsoft", "qwen", "mistral", "ibm", "local"]


def _provider_id_to_runtime(provider_id: str) -> str:
    if provider_id == "local":
        return "ollama"
    if provider_id == "microsoft":
        return "azure"
    return provider_id


def provider_is_configured(runtime_provider: str) -> bool:
    if runtime_provider == "openai":
        return bool(settings.OPENAI_API_KEY)
    if runtime_provider == "azure":
        return bool(settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT)
    if runtime_provider == "qwen":
        return bool(settings.QWEN_API_KEY)
    if runtime_provider == "mistral":
        return bool(settings.MISTRAL_API_KEY)
    if runtime_provider == "ibm":
        return bool(settings.IBM_API_KEY)
    if runtime_provider == "ollama":
        return True
    return False


def model_for_provider(runtime_provider: str) -> str:
    if runtime_provider == "openai":
        return settings.OPENAI_MODEL
    if runtime_provider == "azure":
        return f"azure-{settings.AZURE_OPENAI_MODEL}"
    if runtime_provider == "qwen":
        return settings.QWEN_MODEL
    if runtime_provider == "mistral":
        return settings.MISTRAL_MODEL
    if runtime_provider == "ibm":
        return settings.IBM_MODEL
    return settings.OLLAMA_MODEL


async def resolve_llm_provider_and_model(db: AsyncSession) -> Tuple[str, str, str]:
    """
    Resolve provider/model for the current tenant settings.

    Returns (provider_id, runtime_provider, model).
    """
    service = AppSettingsService(db)
    app_settings = await service.get_settings()

    provider_id = normalize_ai_provider(app_settings.ai_provider)
    if app_settings.strict_offline_mode:
        provider_id = "local"

    if provider_id == "auto":
        for candidate in _PROVIDER_PREFERENCE:
            runtime = _provider_id_to_runtime(candidate)
            if provider_is_configured(runtime):
                return candidate, runtime, model_for_provider(runtime)
        return "local", "ollama", model_for_provider("ollama")

    runtime_provider = _provider_id_to_runtime(provider_id)
    if not provider_is_configured(runtime_provider):
        return "local", "ollama", model_for_provider("ollama")

    return provider_id, runtime_provider, model_for_provider(runtime_provider)
