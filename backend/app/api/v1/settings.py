from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter()

# Pydantic models
class OfflineModeRequest(BaseModel):
    enabled: bool

class OfflineModeResponse(BaseModel):
    enabled: bool
    message: Optional[str] = None

# In-memory store for settings (in production, use database)
SETTINGS_STORE = {
    'strict_offline_mode': False,
}

@router.get("/offline-mode", response_model=OfflineModeResponse)
async def get_offline_mode(
    current_user: User = Depends(get_current_user)
):
    """
    Get the current strict offline mode setting.
    """
    enabled = SETTINGS_STORE.get('strict_offline_mode', False)

    return OfflineModeResponse(
        enabled=enabled,
        message=f"Strict offline mode is {'enabled' if enabled else 'disabled'}"
    )

@router.post("/offline-mode", response_model=OfflineModeResponse)
async def set_offline_mode(
    request: OfflineModeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Set the strict offline mode setting.
    When enabled, the application will not make any external network requests.
    """
    SETTINGS_STORE['strict_offline_mode'] = request.enabled

    return OfflineModeResponse(
        enabled=request.enabled,
        message=f"Strict offline mode {'enabled' if request.enabled else 'disabled'}"
    )

@router.get("/all")
async def get_all_settings(
    current_user: User = Depends(get_current_user)
):
    """
    Get all application settings.
    """
    return {
        'settings': SETTINGS_STORE,
        'user_id': current_user.id
    }

@router.post("/reset")
async def reset_settings(
    current_user: User = Depends(get_current_user)
):
    """
    Reset all settings to defaults.
    """
    SETTINGS_STORE['strict_offline_mode'] = False

    return {
        'success': True,
        'message': 'Settings reset to defaults',
        'settings': SETTINGS_STORE
    }
