from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Optional
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.user import User

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

# In-memory store for AI settings (in production, use database or config)
AI_SETTINGS = {
    'current_provider': 'openai',  # Default to OpenAI for web
    'provider_status': {
        'openai': {'installed': True, 'ready': True},
        'local': {'installed': False, 'ready': False},
        'microsoft': {'installed': False, 'ready': False},
        'anthropic': {'installed': False, 'ready': False},
    }
}

@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status(
    current_user: User = Depends(get_current_user)
):
    """
    Get current AI/LLM service status.
    For web application, AI is handled server-side via FastAPI.
    """
    provider = AI_SETTINGS['current_provider']
    provider_info = AI_SETTINGS['provider_status'].get(provider, {})

    return AIStatusResponse(
        ready=provider_info.get('ready', False),
        model_type=provider,
        provider=provider,
        message=f"Using {provider} provider"
    )

@router.get("/providers", response_model=AIProviderResponse)
async def get_ai_providers(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of available AI providers and current selection.
    """
    available_providers = [
        {'id': 'openai', 'name': 'OpenAI', 'description': 'GPT-4 and GPT-3.5'},
        {'id': 'anthropic', 'name': 'Anthropic', 'description': 'Claude models'},
        {'id': 'microsoft', 'name': 'Microsoft Azure', 'description': 'Azure OpenAI Service'},
        {'id': 'local', 'name': 'Local LLM', 'description': 'Self-hosted models'},
    ]

    return AIProviderResponse(
        providers=available_providers,
        current=AI_SETTINGS['current_provider']
    )

@router.post("/set-provider")
async def set_ai_provider(
    request: SetProviderRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Set the current AI provider.
    """
    provider = request.provider

    valid_providers = ['openai', 'local', 'microsoft', 'anthropic', 'auto']
    if provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider. Must be one of: {', '.join(valid_providers)}"
        )

    # Auto resolves to openai for web
    if provider == 'auto':
        provider = 'openai'

    AI_SETTINGS['current_provider'] = provider

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
    return ProviderStatusResponse(
        status=AI_SETTINGS['provider_status']
    )

@router.post("/provision-provider", response_model=ProvisionProviderResponse)
async def provision_provider(
    request: ProvisionProviderRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Provision/install an AI provider.
    For web application, this is mostly a no-op since providers are server-side.
    """
    provider_id = request.provider_id

    if provider_id not in AI_SETTINGS['provider_status']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {provider_id}"
        )

    # For OpenAI, just mark as ready (assumes API key is configured server-side)
    if provider_id == 'openai':
        AI_SETTINGS['provider_status'][provider_id] = {
            'installed': True,
            'ready': True
        }
        return ProvisionProviderResponse(
            success=True,
            message=f"Provider {provider_id} is ready"
        )

    # For other providers, would need actual provisioning logic
    return ProvisionProviderResponse(
        success=False,
        message=f"Provider {provider_id} provisioning not implemented"
    )

@router.get("/model-type")
async def get_model_type(
    current_user: User = Depends(get_current_user)
):
    """
    Get the current AI model type.
    """
    return {
        'modelType': AI_SETTINGS['current_provider'],
        'provider': AI_SETTINGS['current_provider']
    }
