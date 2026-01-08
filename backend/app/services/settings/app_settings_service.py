"""
Persistence helpers for application-wide settings.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.app_settings import AppSettings

AI_PROVIDER_IDS = {
    "local",
    "openai",
    "anthropic",
    "google",
    "auto",
}

_DEFAULT_PROVIDER_MAP = {
    "ollama": "local",
}


def normalize_ai_provider(provider: Optional[str]) -> str:
    if not provider:
        return "local"
    normalized = provider.strip().lower()
    return normalized if normalized in AI_PROVIDER_IDS else "local"


def default_ai_provider() -> str:
    provider = settings.DEFAULT_LLM_PROVIDER.strip().lower()
    mapped = _DEFAULT_PROVIDER_MAP.get(provider, provider)
    return mapped if mapped in AI_PROVIDER_IDS else "local"


class AppSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(self) -> AppSettings:
        result = await self.db.execute(select(AppSettings).where(AppSettings.id == 1))
        settings_row = result.scalar_one_or_none()

        if settings_row:
            return settings_row

        settings_row = AppSettings(
            id=1,
            strict_offline_mode=False,
            ai_provider=default_ai_provider(),
        )
        self.db.add(settings_row)
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row

    async def set_offline_mode(self, enabled: bool) -> AppSettings:
        settings_row = await self.get_settings()
        settings_row.strict_offline_mode = enabled
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row

    async def set_risk_threshold_override(self, high: float, medium: float) -> AppSettings:
        settings_row = await self.get_settings()
        settings_row.risk_thresholds_override_high = high
        settings_row.risk_thresholds_override_medium = medium
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row

    async def clear_risk_threshold_override(self) -> AppSettings:
        settings_row = await self.get_settings()
        settings_row.risk_thresholds_override_high = None
        settings_row.risk_thresholds_override_medium = None
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row

    async def set_ai_provider(self, provider: str) -> AppSettings:
        settings_row = await self.get_settings()
        settings_row.ai_provider = normalize_ai_provider(provider)
        await self.db.commit()
        await self.db.refresh(settings_row)
        return settings_row
