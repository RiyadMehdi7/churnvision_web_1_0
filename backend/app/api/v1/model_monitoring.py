"""
Model Monitoring API

Endpoints for monitoring model health, detecting drift,
and tracking model performance over time.
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel, Field

from app.api.deps import get_db, get_current_user
from app.models.monitoring import (
    DataDriftMonitoring,
    ModelPerformanceMonitoring,
    ModelAlert,
)
from app.services.ml.model_drift_service import (
    model_drift_service,
    DriftReport,
    DriftSeverity,
)

router = APIRouter()


# Pydantic Schemas
class DriftStatusResponse(BaseModel):
    """Response for drift status check."""
    has_reference_data: bool
    reference_sample_size: Optional[int] = None
    reference_feature_count: Optional[int] = None
    model_version: Optional[str] = None
    reference_timestamp: Optional[str] = None
    last_check: Optional[str] = None
    last_drift_severity: Optional[str] = None


class DriftCheckRequest(BaseModel):
    """Request to check drift on current data."""
    employee_ids: Optional[List[str]] = Field(
        None,
        description="Employee IDs to check. If None, uses recent predictions."
    )
    days_back: int = Field(
        7,
        ge=1,
        le=90,
        description="Number of days back to include in current data"
    )


class FeatureDriftResponse(BaseModel):
    """Response for a single feature's drift."""
    feature_name: str
    drift_score: float
    p_value: Optional[float]
    drift_detected: bool
    severity: str
    method: str


class DriftReportResponse(BaseModel):
    """Full drift report response."""
    timestamp: str
    model_version: str
    overall_drift_detected: bool
    overall_severity: str
    overall_drift_score: float
    drifted_features: List[str]
    recommendations: List[str]
    reference_sample_size: int
    current_sample_size: int
    feature_results: List[FeatureDriftResponse]


class DriftHistoryItem(BaseModel):
    """Single drift history entry."""
    timestamp: str
    feature_name: str
    drift_score: float
    p_value: Optional[float]
    drift_type: str


class ModelHealthResponse(BaseModel):
    """Overall model health response."""
    status: str  # 'healthy', 'warning', 'critical'
    model_version: str
    last_training: Optional[str]
    drift_status: str
    performance_status: str
    alerts_count: int
    recommendations: List[str]


@router.get("/drift/status", response_model=DriftStatusResponse)
async def get_drift_status(
    current_user=Depends(get_current_user),
) -> DriftStatusResponse:
    """
    Get current drift detection status.

    Returns information about the reference data and last drift check.
    """
    ref_info = model_drift_service.get_reference_info()

    return DriftStatusResponse(
        has_reference_data=ref_info.get("status") == "set",
        reference_sample_size=ref_info.get("sample_size"),
        reference_feature_count=ref_info.get("n_features"),
        model_version=ref_info.get("model_version"),
        reference_timestamp=ref_info.get("timestamp"),
        last_check=None,  # Would need to track this separately
        last_drift_severity=None,
    )


@router.post("/drift/check", response_model=DriftReportResponse)
async def check_drift(
    request: DriftCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> DriftReportResponse:
    """
    Check for data drift on current/recent data.

    Compares recent prediction data against the training reference data
    using KS test for continuous features and PSI for categorical features.
    """
    ref_info = model_drift_service.get_reference_info()
    if ref_info.get("status") != "set":
        raise HTTPException(
            status_code=400,
            detail="Reference data not set. Train a model first to establish baseline."
        )

    # Get current data from recent predictions
    # This would typically pull from your prediction logs or employee data
    try:
        from app.services.ml.churn_prediction_service import churn_prediction_service

        # Get feature data for recent employees
        # For now, use a simplified approach
        current_data = await _get_current_feature_data(
            db, request.employee_ids, request.days_back
        )

        if current_data is None or len(current_data) < 10:
            raise HTTPException(
                status_code=400,
                detail="Insufficient current data for drift detection. Need at least 10 samples."
            )

        # Run drift detection
        report = model_drift_service.detect_drift(current_data)

        # Store results in database
        await _store_drift_results(db, report)

        return DriftReportResponse(
            timestamp=report.timestamp.isoformat(),
            model_version=report.model_version,
            overall_drift_detected=report.overall_drift_detected,
            overall_severity=report.overall_severity.value,
            overall_drift_score=report.overall_drift_score,
            drifted_features=report.drifted_features,
            recommendations=report.recommendations,
            reference_sample_size=report.reference_sample_size,
            current_sample_size=report.current_sample_size,
            feature_results=[
                FeatureDriftResponse(
                    feature_name=r.feature_name,
                    drift_score=r.drift_score,
                    p_value=r.p_value,
                    drift_detected=r.drift_detected,
                    severity=r.severity.value,
                    method=r.method,
                )
                for r in report.feature_results
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Drift detection failed: {str(e)}"
        )


@router.get("/drift/history", response_model=List[DriftHistoryItem])
async def get_drift_history(
    feature_name: Optional[str] = Query(None, description="Filter by feature name"),
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum records to return"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> List[DriftHistoryItem]:
    """
    Get drift detection history.

    Returns historical drift measurements for monitoring trends.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    query = select(DataDriftMonitoring).where(
        DataDriftMonitoring.timestamp >= cutoff
    )

    if feature_name:
        query = query.where(DataDriftMonitoring.feature_name == feature_name)

    query = query.order_by(desc(DataDriftMonitoring.timestamp)).limit(limit)

    result = await db.execute(query)
    records = result.scalars().all()

    return [
        DriftHistoryItem(
            timestamp=r.timestamp.isoformat(),
            feature_name=r.feature_name,
            drift_score=float(r.drift_score),
            p_value=float(r.p_value) if r.p_value else None,
            drift_type=r.drift_type,
        )
        for r in records
    ]


@router.get("/health", response_model=ModelHealthResponse)
async def get_model_health(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ModelHealthResponse:
    """
    Get overall model health status.

    Combines drift detection, performance metrics, and alerts
    into a single health assessment.
    """
    # Get latest performance metrics
    perf_query = select(ModelPerformanceMonitoring).order_by(
        desc(ModelPerformanceMonitoring.timestamp)
    ).limit(1)
    perf_result = await db.execute(perf_query)
    latest_perf = perf_result.scalar_one_or_none()

    # Get unresolved alerts count
    alerts_query = select(ModelAlert).where(ModelAlert.resolved == 0)
    alerts_result = await db.execute(alerts_query)
    alerts = alerts_result.scalars().all()
    alerts_count = len(alerts)

    # Get latest drift check
    drift_query = select(DataDriftMonitoring).order_by(
        desc(DataDriftMonitoring.timestamp)
    ).limit(1)
    drift_result = await db.execute(drift_query)
    latest_drift = drift_result.scalar_one_or_none()

    # Determine overall status
    status = "healthy"
    recommendations = []
    drift_status = "unknown"
    performance_status = "unknown"

    if latest_drift:
        drift_score = float(latest_drift.drift_score)
        if drift_score >= 0.25:
            drift_status = "critical"
            status = "critical"
            recommendations.append("Critical drift detected. Immediate retraining recommended.")
        elif drift_score >= 0.1:
            drift_status = "warning"
            if status != "critical":
                status = "warning"
            recommendations.append("Moderate drift detected. Monitor closely.")
        else:
            drift_status = "healthy"

    if alerts_count > 5:
        status = "critical"
        recommendations.append(f"{alerts_count} unresolved alerts require attention.")
    elif alerts_count > 0:
        if status != "critical":
            status = "warning"
        recommendations.append(f"{alerts_count} unresolved alerts.")

    if not recommendations:
        recommendations.append("Model is operating within normal parameters.")

    # Get model version from drift service
    ref_info = model_drift_service.get_reference_info()
    model_version = ref_info.get("model_version", "unknown")

    return ModelHealthResponse(
        status=status,
        model_version=model_version,
        last_training=ref_info.get("timestamp"),
        drift_status=drift_status,
        performance_status=performance_status,
        alerts_count=alerts_count,
        recommendations=recommendations,
    )


@router.get("/alerts")
async def get_model_alerts(
    resolved: bool = Query(False, description="Include resolved alerts"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get model-related alerts.

    Returns alerts for drift detection, performance degradation, etc.
    """
    query = select(ModelAlert)

    if not resolved:
        query = query.where(ModelAlert.resolved == 0)

    if severity:
        query = query.where(ModelAlert.severity == severity)

    query = query.order_by(desc(ModelAlert.timestamp)).limit(limit)

    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        {
            "id": a.id,
            "timestamp": a.timestamp.isoformat(),
            "alert_type": a.alert_type,
            "severity": a.severity,
            "message": a.message,
            "resolved": a.resolved == 1,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        }
        for a in alerts
    ]


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Resolve a model alert."""
    query = select(ModelAlert).where(ModelAlert.id == alert_id)
    result = await db.execute(query)
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.resolved = 1
    alert.resolved_at = datetime.utcnow()
    await db.commit()

    return {"status": "resolved", "alert_id": alert_id}


# Helper functions
async def _get_current_feature_data(
    db: AsyncSession,
    employee_ids: Optional[List[str]],
    days_back: int
) -> Optional[any]:
    """
    Get current feature data for drift comparison.

    This is a placeholder that would integrate with your actual
    prediction service to get recent feature data.
    """
    # Import here to avoid circular imports
    try:
        from app.services.ml.churn_prediction_service import churn_prediction_service

        # Get reference feature names from drift service
        ref_info = model_drift_service.get_reference_info()
        if ref_info.get("status") != "set":
            return None

        # This would typically query recent predictions or employee features
        # For now, return None to indicate no data available
        # The actual implementation would pull from employee data

        return None

    except Exception:
        return None


async def _store_drift_results(
    db: AsyncSession,
    report: DriftReport
) -> None:
    """Store drift detection results in the database."""
    now = datetime.utcnow()

    for feature_result in report.feature_results:
        if feature_result.drift_detected:
            drift_record = DataDriftMonitoring(
                timestamp=now,
                feature_name=feature_result.feature_name,
                drift_score=feature_result.drift_score,
                p_value=feature_result.p_value,
                drift_type=feature_result.method,
                reference_period_start=now - timedelta(days=90),
                reference_period_end=now,
                current_period_start=now - timedelta(days=7),
                current_period_end=now,
            )
            db.add(drift_record)

    await db.commit()
