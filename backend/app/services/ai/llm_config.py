"""
Helpers for resolving LLM provider/model based on persisted settings.
"""

from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.settings.app_settings_service import AppSettingsService, normalize_ai_provider

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


# Model aliases for convenience
_MODEL_ALIASES = {
    "gpt4": "gpt-4o",
    "gpt4o": "gpt-4o",
    "gpt-4": "gpt-4o",
    "gpt-4-turbo": "gpt-4-turbo",
    "gpt35": "gpt-3.5-turbo",
    "gpt-3.5": "gpt-3.5-turbo",
    "claude": "claude-3-5-sonnet-20241022",
    "claude-sonnet": "claude-3-5-sonnet-20241022",
    "claude-opus": "claude-3-opus-20240229",
    "gemma": "gemma3:4b",
    "llama": "llama3.2:3b",
    "mistral": "mistral-large-latest",
    "qwen": "qwen-plus",
    "o1": "o1-preview",
    "o1-mini": "o1-mini",
}

# Models that support reasoning/chain-of-thought
_REASONING_MODELS = {
    "o1-preview",
    "o1-mini",
    "o1",
    "gpt-4o",
    "gpt-4-turbo",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "mistral-large-latest",
    "qwen-plus",
}


def get_model_from_alias(alias: str) -> str:
    """
    Resolve a model alias to the actual model name.

    Args:
        alias: Model alias (e.g., "gpt4", "claude") or actual model name

    Returns:
        Resolved model name
    """
    return _MODEL_ALIASES.get(alias.lower(), alias)


def is_reasoning_model(model: str) -> bool:
    """
    Check if a model supports advanced reasoning capabilities.

    Args:
        model: Model name or alias

    Returns:
        True if the model supports reasoning
    """
    resolved = get_model_from_alias(model)
    return resolved in _REASONING_MODELS


def get_available_providers() -> list[dict]:
    """
    Get list of available (configured) LLM providers.

    Returns:
        List of provider info dicts with id, name, and configured status
    """
    providers = [
        {
            "id": "openai",
            "name": "OpenAI",
            "configured": provider_is_configured("openai"),
            "models": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
        },
        {
            "id": "microsoft",
            "name": "Azure OpenAI",
            "configured": provider_is_configured("azure"),
            "models": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
        },
        {
            "id": "qwen",
            "name": "Alibaba Qwen",
            "configured": provider_is_configured("qwen"),
            "models": ["qwen-plus", "qwen-turbo", "qwen-max"],
        },
        {
            "id": "mistral",
            "name": "Mistral AI",
            "configured": provider_is_configured("mistral"),
            "models": ["mistral-large-latest", "mistral-medium", "mistral-small"],
        },
        {
            "id": "ibm",
            "name": "IBM WatsonX",
            "configured": provider_is_configured("ibm"),
            "models": ["granite-13b-chat-v2", "llama-2-70b-chat"],
        },
        {
            "id": "local",
            "name": "Local (Ollama)",
            "configured": True,
            "models": ["gemma3:4b", "llama3.2:3b", "mistral:7b"],
        },
    ]
    return providers


def get_available_models(provider_id: str = None) -> list[str]:
    """
    Get list of available models, optionally filtered by provider.

    Args:
        provider_id: Optional provider ID to filter by

    Returns:
        List of model names
    """
    providers = get_available_providers()

    if provider_id:
        for p in providers:
            if p["id"] == provider_id and p["configured"]:
                return p["models"]
        return []

    # Return all models from configured providers
    models = []
    for p in providers:
        if p["configured"]:
            models.extend(p["models"])
    return list(set(models))
