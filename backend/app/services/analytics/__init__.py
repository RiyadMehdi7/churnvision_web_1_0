# Analytics Services Package
# ELTV, ROI, recommendations, risk analysis, and behavioral analytics

from app.services.analytics.eltv_service import ELTVService, eltv_service
from app.services.analytics.roi_dashboard_service import roi_dashboard_service, ROIDashboardService
from app.services.analytics.recommendation_service import recommendation_service, RecommendationService
from app.services.analytics.risk_alert_service import risk_alert_service, RiskAlertService
from app.services.analytics.outcome_tracking_service import outcome_tracking_service, OutcomeTrackingService
from app.services.analytics.behavioral_stage_service import behavioral_stage_service, StageResult
from app.services.analytics.peer_statistics_service import peer_statistics_service, PeerComparison, RiskThresholds
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service, DatasetThresholds

__all__ = [
    # ELTV
    "ELTVService",
    "eltv_service",
    # ROI Dashboard
    "roi_dashboard_service",
    "ROIDashboardService",
    # Recommendations
    "recommendation_service",
    "RecommendationService",
    # Risk Alerts
    "risk_alert_service",
    "RiskAlertService",
    # Outcome Tracking
    "outcome_tracking_service",
    "OutcomeTrackingService",
    # Behavioral Stage
    "behavioral_stage_service",
    "StageResult",
    # Peer Statistics
    "peer_statistics_service",
    "PeerComparison",
    "RiskThresholds",
    # Data-Driven Thresholds
    "data_driven_thresholds_service",
    "DatasetThresholds",
]
