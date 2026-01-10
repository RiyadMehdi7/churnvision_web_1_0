"""
Helpers for resolving LLM provider/model based on persisted settings.
"""

from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.license import LicenseValidator
from app.services.settings.app_settings_service import AppSettingsService, normalize_ai_provider

_PROVIDER_PREFERENCE = ["openai", "anthropic", "google", "local"]


def _provider_id_to_runtime(provider_id: str) -> str:
    if provider_id == "local":
        return "ollama"
    return provider_id


def provider_is_configured(runtime_provider: str) -> bool:
    if runtime_provider == "openai":
        return bool(get_provider_api_key("openai"))
    if runtime_provider == "anthropic":
        return bool(get_provider_api_key("anthropic"))
    if runtime_provider == "google":
        return bool(get_provider_api_key("google"))
    if runtime_provider == "ollama":
        return True
    return False


def get_provider_api_key(provider: str) -> str | None:
    if provider == "openai" and settings.OPENAI_API_KEY:
        return settings.OPENAI_API_KEY
    if provider == "anthropic" and settings.ANTHROPIC_API_KEY:
        return settings.ANTHROPIC_API_KEY
    if provider == "google" and settings.GOOGLE_API_KEY:
        return settings.GOOGLE_API_KEY

    payload = LicenseValidator.get_license_payload()
    if not payload:
        return None

    llm_keys = payload.get("llm_api_keys")
    if isinstance(llm_keys, dict):
        candidate = llm_keys.get(provider)
        if candidate:
            return candidate

    return payload.get(f"{provider}_api_key")


def model_for_provider(runtime_provider: str) -> str:
    if runtime_provider == "openai":
        return settings.OPENAI_MODEL
    if runtime_provider == "anthropic":
        return settings.CLAUDE_MODEL
    if runtime_provider == "google":
        return settings.GEMINI_MODEL
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


# Model aliases for convenience - maps short names to full model IDs
_MODEL_ALIASES = {
    "gpt": "gpt-5-mini-2025-08-07",
    "openai": "gpt-5-mini-2025-08-07",
    "claude": "claude-haiku-4-5",
    "anthropic": "claude-haiku-4-5",
    "gemini": "gemini-3-flash-preview",
    "google": "gemini-3-flash-preview",
    "gemma": "gemma3:4b",
    "ollama": "gemma3:4b",
    "local": "gemma3:4b",
}

# Models that support reasoning/chain-of-thought
_REASONING_MODELS = {
    "gpt-5-mini-2025-08-07",
    "claude-haiku-4-5",
    "gemini-3-flash-preview",
    "gemma3:4b",
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
        List of provider info dicts with id, name, model, description, and configured status
    """
    providers = [
        {
            "id": "openai",
            "name": "OpenAI",
            "model": "gpt-5-mini-2025-08-07",
            "description": "Most capable general-purpose model",
            "configured": provider_is_configured("openai"),
        },
        {
            "id": "anthropic",
            "name": "Anthropic Claude",
            "model": "claude-haiku-4-5",
            "description": "Fast and cost-effective for enterprise",
            "configured": provider_is_configured("anthropic"),
        },
        {
            "id": "google",
            "name": "Google Gemini",
            "model": "gemini-3-flash-preview",
            "description": "Multimodal with strong reasoning",
            "configured": provider_is_configured("google"),
        },
        {
            "id": "local",
            "name": "Local (Ollama)",
            "model": "gemma3:4b",
            "description": "On-premise, data stays local",
            "configured": True,
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
                return [p["model"]]
        return []

    # Return all models from configured providers
    return [p["model"] for p in providers if p["configured"]]
