"""
Risk Threshold and Level Helpers

Centralized risk calculation utilities used across multiple services.
All risk thresholds are data-driven, computed from user's actual data distribution.
"""

from typing import Tuple, Optional
from enum import Enum


class RiskLevel(str, Enum):
    """Risk level enumeration."""
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


# Default fallback thresholds (used only when no data-driven thresholds available)
DEFAULT_HIGH_THRESHOLD = 0.6
DEFAULT_MEDIUM_THRESHOLD = 0.3


def get_risk_thresholds(dataset_id: Optional[str] = None) -> Tuple[float, float]:
    """
    Get data-driven risk thresholds (high, medium).

    Args:
        dataset_id: Optional dataset ID for dataset-specific thresholds

    Returns:
        Tuple of (high_threshold, medium_threshold)
    """
    # Import here to avoid circular imports
    from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service

    thresholds = data_driven_thresholds_service.get_cached_thresholds(dataset_id)
    if thresholds and thresholds.risk_high_threshold > 0:
        return (thresholds.risk_high_threshold, thresholds.risk_medium_threshold)
    return (DEFAULT_HIGH_THRESHOLD, DEFAULT_MEDIUM_THRESHOLD)


def get_risk_level(
    risk_score: float,
    dataset_id: Optional[str] = None,
    include_critical: bool = False
) -> str:
    """
    Determine risk level using data-driven thresholds.

    Args:
        risk_score: The churn probability score (0-1)
        dataset_id: Optional dataset ID for dataset-specific thresholds
        include_critical: If True, includes "Critical" level for very high risk

    Returns:
        Risk level string: "Critical", "High", "Medium", or "Low"
    """
    high_thresh, medium_thresh = get_risk_thresholds(dataset_id)

    if include_critical:
        # Critical is top tier of high risk
        critical_thresh = min(0.9, high_thresh + 0.2)
        if risk_score >= critical_thresh:
            return RiskLevel.CRITICAL.value

    if risk_score >= high_thresh:
        return RiskLevel.HIGH.value
    elif risk_score >= medium_thresh:
        return RiskLevel.MEDIUM.value
    return RiskLevel.LOW.value


def get_priority_from_risk(
    risk_score: float,
    dataset_id: Optional[str] = None
) -> str:
    """
    Get priority level based on risk score.

    Args:
        risk_score: The churn probability score (0-1)
        dataset_id: Optional dataset ID for dataset-specific thresholds

    Returns:
        Priority string in lowercase: "critical", "high", "medium", or "low"
    """
    return get_risk_level(risk_score, dataset_id, include_critical=True).lower()


def get_urgency_and_focus(
    risk_score: float,
    dataset_id: Optional[str] = None
) -> Tuple[str, str]:
    """
    Get urgency level and treatment focus based on risk score.

    Args:
        risk_score: The churn probability score (0-1)
        dataset_id: Optional dataset ID for dataset-specific thresholds

    Returns:
        Tuple of (urgency_message, focus_area)
    """
    high_thresh, medium_thresh = get_risk_thresholds(dataset_id)

    if risk_score >= high_thresh:
        return (
            "CRITICAL - Immediate intervention required",
            "aggressive retention with significant investment"
        )
    elif risk_score >= medium_thresh:
        return (
            "ELEVATED - Proactive engagement needed",
            "engagement improvement and career development"
        )
    else:
        return (
            "MODERATE - Preventive measures recommended",
            "long-term engagement and growth opportunities"
        )
