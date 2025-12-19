from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.risk_threshold_service import RiskThresholdService
from app.services.app_settings_service import AppSettingsService

router = APIRouter()

# Pydantic models
class OfflineModeRequest(BaseModel):
    enabled: bool

class OfflineModeResponse(BaseModel):
    enabled: bool
    message: Optional[str] = None

class RiskThresholdsResponse(BaseModel):
    """Risk thresholds for categorizing employee churn risk"""
    highRisk: float = Field(..., description="Threshold for High Risk (>= this value)")
    mediumRisk: float = Field(..., description="Threshold for Medium Risk (>= this value, < highRisk)")
    source: Optional[str] = Field(None, description="Source of thresholds: 'dynamic' or 'fallback'")
    sampleSize: Optional[int] = Field(None, description="Number of employees used for calculation")

class RiskThresholdsDetailedResponse(BaseModel):
    """Detailed risk thresholds with distribution info"""
    highRisk: float
    mediumRisk: float
    source: str
    reason: str
    sampleSize: int
    distribution: Optional[Dict[str, Any]] = None
    statistics: Optional[Dict[str, float]] = None

class RiskThresholdsRequest(BaseModel):
    """Request to manually override risk thresholds"""
    highRisk: float = Field(..., ge=0.0, le=1.0, description="High risk threshold (0-1)")
    mediumRisk: float = Field(..., ge=0.0, le=1.0, description="Medium risk threshold (0-1)")

@router.get("/offline-mode", response_model=OfflineModeResponse)
async def get_offline_mode(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the current strict offline mode setting.
    """
    service = AppSettingsService(db)
    app_settings = await service.get_settings()
    enabled = app_settings.strict_offline_mode

    return OfflineModeResponse(
        enabled=enabled,
        message=f"Strict offline mode is {'enabled' if enabled else 'disabled'}"
    )

@router.post("/offline-mode", response_model=OfflineModeResponse)
async def set_offline_mode(
    request: OfflineModeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Set the strict offline mode setting.
    When enabled, the application will not make any external network requests.
    """
    service = AppSettingsService(db)
    await service.set_offline_mode(request.enabled)

    return OfflineModeResponse(
        enabled=request.enabled,
        message=f"Strict offline mode {'enabled' if request.enabled else 'disabled'}"
    )

@router.get("/all")
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all application settings.
    """
    service = AppSettingsService(db)
    app_settings = await service.get_settings()
    override = None
    if app_settings.risk_thresholds_override_high is not None and app_settings.risk_thresholds_override_medium is not None:
        override = {
            'highRisk': app_settings.risk_thresholds_override_high,
            'mediumRisk': app_settings.risk_thresholds_override_medium,
        }
    return {
        'settings': {
            'strict_offline_mode': app_settings.strict_offline_mode,
            'risk_thresholds_override': override,
        },
        'user_id': current_user.id
    }

@router.post("/reset")
async def reset_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reset all settings to defaults.
    """
    service = AppSettingsService(db)
    await service.set_offline_mode(False)
    await service.clear_risk_threshold_override()

    return {
        'success': True,
        'message': 'Settings reset to defaults (risk thresholds will be calculated dynamically)',
        'settings': {
            'strict_offline_mode': False,
            'risk_thresholds_override': None
        }
    }


@router.get("/risk-thresholds", response_model=RiskThresholdsResponse)
async def get_risk_thresholds(
    db: AsyncSession = Depends(get_db),
    dataset_id: Optional[str] = Query(None, description="Dataset ID to calculate thresholds for"),
    current_user: User = Depends(get_current_user)
):
    """
    Get risk thresholds for categorizing employee churn risk.

    Thresholds are calculated dynamically based on the distribution of active employees'
    churn probabilities. This ensures consistent categorization:
    - Top 15% of probabilities = High Risk
    - Next 25% = Medium Risk
    - Bottom 60% = Low Risk

    If a manual override is set, that will be returned instead.
    If insufficient data (<10 employees), fallback values are used.
    """
    # Check for manual override first
    settings_service = AppSettingsService(db)
    app_settings = await settings_service.get_settings()
    if app_settings.risk_thresholds_override_high is not None and app_settings.risk_thresholds_override_medium is not None:
        return RiskThresholdsResponse(
            highRisk=app_settings.risk_thresholds_override_high,
            mediumRisk=app_settings.risk_thresholds_override_medium,
            source='manual',
            sampleSize=None
        )

    # Calculate dynamic thresholds
    service = RiskThresholdService(db)
    result = await service.calculate_dynamic_thresholds(dataset_id)

    return RiskThresholdsResponse(
        highRisk=result['thresholds']['highRisk'],
        mediumRisk=result['thresholds']['mediumRisk'],
        source=result['source'],
        sampleSize=result['sampleSize']
    )


@router.get("/risk-thresholds/detailed", response_model=RiskThresholdsDetailedResponse)
async def get_risk_thresholds_detailed(
    db: AsyncSession = Depends(get_db),
    dataset_id: Optional[str] = Query(None, description="Dataset ID to calculate thresholds for"),
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed risk thresholds including distribution statistics.

    Returns the thresholds along with:
    - Current distribution of employees in each risk category
    - Statistical summary of churn probabilities (mean, median, std, percentiles)
    - Source of thresholds (dynamic vs fallback)
    """
    settings_service = AppSettingsService(db)
    app_settings = await settings_service.get_settings()
    if app_settings.risk_thresholds_override_high is not None and app_settings.risk_thresholds_override_medium is not None:
        return RiskThresholdsDetailedResponse(
            highRisk=app_settings.risk_thresholds_override_high,
            mediumRisk=app_settings.risk_thresholds_override_medium,
            source='manual',
            reason='Manual override',
            sampleSize=0,
            distribution=None,
            statistics=None
        )

    service = RiskThresholdService(db)
    result = await service.calculate_dynamic_thresholds(dataset_id)

    return RiskThresholdsDetailedResponse(
        highRisk=result['thresholds']['highRisk'],
        mediumRisk=result['thresholds']['mediumRisk'],
        source=result['source'],
        reason=result['reason'],
        sampleSize=result['sampleSize'],
        distribution=result.get('distribution'),
        statistics=result.get('statistics')
    )


@router.put("/risk-thresholds", response_model=RiskThresholdsResponse)
async def update_risk_thresholds(
    request: RiskThresholdsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually override risk thresholds.

    This sets a manual override that takes precedence over dynamic calculation.
    Use POST /risk-thresholds/reset to clear the override and return to dynamic mode.

    Constraints:
    - highRisk must be greater than mediumRisk
    - Both values must be between 0 and 1
    """
    if request.mediumRisk >= request.highRisk:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Medium risk threshold must be less than high risk threshold"
        )

    service = AppSettingsService(db)
    await service.set_risk_threshold_override(request.highRisk, request.mediumRisk)

    return RiskThresholdsResponse(
        highRisk=request.highRisk,
        mediumRisk=request.mediumRisk,
        source='manual',
        sampleSize=None
    )


@router.post("/risk-thresholds/reset", response_model=RiskThresholdsResponse)
async def reset_risk_thresholds(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Clear manual threshold override and return to dynamic calculation.

    After reset, thresholds will be calculated dynamically based on
    the distribution of active employees' churn probabilities.
    """
    settings_service = AppSettingsService(db)
    await settings_service.clear_risk_threshold_override()

    # Return the dynamic thresholds
    service = RiskThresholdService(db)
    result = await service.calculate_dynamic_thresholds()

    return RiskThresholdsResponse(
        highRisk=result['thresholds']['highRisk'],
        mediumRisk=result['thresholds']['mediumRisk'],
        source=result['source'],
        sampleSize=result['sampleSize']
    )
