"""
Model Drift Service

Detects data drift and concept drift using statistical methods.
Supports Kolmogorov-Smirnov (KS) test for continuous features
and Population Stability Index (PSI) for categorical features.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import numpy as np
import logging
from enum import Enum

from scipy import stats

logger = logging.getLogger(__name__)


class DriftSeverity(str, Enum):
    """Drift severity levels."""
    NONE = "none"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class FeatureDriftResult:
    """Drift detection result for a single feature."""
    feature_name: str
    drift_score: float
    p_value: Optional[float]
    drift_detected: bool
    severity: DriftSeverity
    method: str  # 'ks' or 'psi'
    reference_stats: Dict[str, float]
    current_stats: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "feature_name": self.feature_name,
            "drift_score": round(self.drift_score, 4),
            "p_value": round(self.p_value, 4) if self.p_value else None,
            "drift_detected": self.drift_detected,
            "severity": self.severity.value,
            "method": self.method,
            "reference_stats": {
                k: round(v, 4) if isinstance(v, float) else v
                for k, v in self.reference_stats.items()
            },
            "current_stats": {
                k: round(v, 4) if isinstance(v, float) else v
                for k, v in self.current_stats.items()
            },
        }


@dataclass
class DriftReport:
    """Complete drift detection report."""
    timestamp: datetime
    model_version: str
    overall_drift_detected: bool
    overall_severity: DriftSeverity
    overall_drift_score: float
    feature_results: List[FeatureDriftResult]
    drifted_features: List[str]
    recommendations: List[str]
    reference_sample_size: int
    current_sample_size: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "model_version": self.model_version,
            "overall_drift_detected": self.overall_drift_detected,
            "overall_severity": self.overall_severity.value,
            "overall_drift_score": round(self.overall_drift_score, 4),
            "feature_results": [r.to_dict() for r in self.feature_results],
            "drifted_features": self.drifted_features,
            "recommendations": self.recommendations,
            "reference_sample_size": self.reference_sample_size,
            "current_sample_size": self.current_sample_size,
        }


class ModelDriftService:
    """
    Service for detecting model drift.

    Supports:
    - KS test for continuous features
    - PSI (Population Stability Index) for categorical features
    - Configurable drift thresholds
    """

    # KS test thresholds
    KS_THRESHOLD_LOW = 0.1
    KS_THRESHOLD_MODERATE = 0.2
    KS_THRESHOLD_HIGH = 0.3

    # PSI thresholds (industry standard)
    PSI_THRESHOLD_LOW = 0.1
    PSI_THRESHOLD_MODERATE = 0.2
    PSI_THRESHOLD_HIGH = 0.25

    # P-value threshold for statistical significance
    P_VALUE_THRESHOLD = 0.05

    def __init__(self):
        self._reference_data: Optional[np.ndarray] = None
        self._reference_feature_names: Optional[List[str]] = None
        self._categorical_features: Optional[List[str]] = None
        self._model_version: Optional[str] = None
        self._reference_timestamp: Optional[datetime] = None

    def set_reference_data(
        self,
        X: np.ndarray,
        feature_names: List[str],
        categorical_features: Optional[List[str]] = None,
        model_version: str = "unknown"
    ) -> None:
        """
        Set reference data for drift detection.

        Args:
            X: Reference feature matrix (typically training data)
            feature_names: List of feature names
            categorical_features: List of categorical feature names
            model_version: Version of the model
        """
        self._reference_data = X.copy()
        self._reference_feature_names = feature_names.copy()
        self._categorical_features = categorical_features or []
        self._model_version = model_version
        self._reference_timestamp = datetime.now()

        logger.info(
            f"Reference data set: {X.shape[0]} samples, "
            f"{X.shape[1]} features, model version: {model_version}"
        )

    def detect_drift(
        self,
        X_current: np.ndarray,
        feature_names: Optional[List[str]] = None
    ) -> DriftReport:
        """
        Detect drift between reference and current data.

        Args:
            X_current: Current feature matrix
            feature_names: Feature names (uses reference names if not provided)

        Returns:
            DriftReport with detailed drift analysis
        """
        if self._reference_data is None:
            raise ValueError("Reference data not set. Call set_reference_data() first.")

        feature_names = feature_names or self._reference_feature_names
        if len(feature_names) != X_current.shape[1]:
            raise ValueError(
                f"Feature count mismatch: expected {len(feature_names)}, "
                f"got {X_current.shape[1]}"
            )

        feature_results: List[FeatureDriftResult] = []

        for i, feature_name in enumerate(feature_names):
            ref_values = self._reference_data[:, i]
            curr_values = X_current[:, i]

            # Choose method based on feature type
            if feature_name in self._categorical_features:
                result = self._compute_psi(feature_name, ref_values, curr_values)
            else:
                result = self._compute_ks_test(feature_name, ref_values, curr_values)

            feature_results.append(result)

        # Compute overall drift metrics
        drifted_features = [r.feature_name for r in feature_results if r.drift_detected]
        drift_scores = [r.drift_score for r in feature_results]
        overall_drift_score = np.mean(drift_scores) if drift_scores else 0.0

        # Determine overall severity
        overall_severity = self._compute_overall_severity(feature_results)
        overall_drift_detected = len(drifted_features) > 0

        # Generate recommendations
        recommendations = self._generate_recommendations(
            feature_results, overall_severity, drifted_features
        )

        report = DriftReport(
            timestamp=datetime.now(),
            model_version=self._model_version or "unknown",
            overall_drift_detected=overall_drift_detected,
            overall_severity=overall_severity,
            overall_drift_score=overall_drift_score,
            feature_results=feature_results,
            drifted_features=drifted_features,
            recommendations=recommendations,
            reference_sample_size=len(self._reference_data),
            current_sample_size=len(X_current),
        )

        logger.info(
            f"Drift detection complete: {len(drifted_features)} features drifted, "
            f"severity: {overall_severity.value}"
        )

        return report

    def _compute_ks_test(
        self,
        feature_name: str,
        ref_values: np.ndarray,
        curr_values: np.ndarray
    ) -> FeatureDriftResult:
        """
        Compute Kolmogorov-Smirnov test for continuous features.

        The KS test compares the cumulative distribution functions (CDFs)
        of two samples. The test statistic is the maximum distance between
        the two CDFs.
        """
        # Remove NaN values
        ref_clean = ref_values[~np.isnan(ref_values)]
        curr_clean = curr_values[~np.isnan(curr_values)]

        if len(ref_clean) < 10 or len(curr_clean) < 10:
            logger.warning(f"Insufficient data for KS test on {feature_name}")
            return FeatureDriftResult(
                feature_name=feature_name,
                drift_score=0.0,
                p_value=1.0,
                drift_detected=False,
                severity=DriftSeverity.NONE,
                method="ks",
                reference_stats={"n": len(ref_clean)},
                current_stats={"n": len(curr_clean)},
            )

        # Perform KS test
        statistic, p_value = stats.ks_2samp(ref_clean, curr_clean)

        # Determine severity based on KS statistic
        severity = self._ks_to_severity(statistic)
        drift_detected = p_value < self.P_VALUE_THRESHOLD and severity != DriftSeverity.NONE

        return FeatureDriftResult(
            feature_name=feature_name,
            drift_score=float(statistic),
            p_value=float(p_value),
            drift_detected=drift_detected,
            severity=severity,
            method="ks",
            reference_stats={
                "mean": float(np.mean(ref_clean)),
                "std": float(np.std(ref_clean)),
                "min": float(np.min(ref_clean)),
                "max": float(np.max(ref_clean)),
                "n": len(ref_clean),
            },
            current_stats={
                "mean": float(np.mean(curr_clean)),
                "std": float(np.std(curr_clean)),
                "min": float(np.min(curr_clean)),
                "max": float(np.max(curr_clean)),
                "n": len(curr_clean),
            },
        )

    def _compute_psi(
        self,
        feature_name: str,
        ref_values: np.ndarray,
        curr_values: np.ndarray,
        n_bins: int = 10
    ) -> FeatureDriftResult:
        """
        Compute Population Stability Index (PSI) for categorical features.

        PSI measures the shift in distribution between two datasets.
        PSI = sum((actual_pct - expected_pct) * ln(actual_pct / expected_pct))

        Industry standard thresholds:
        - PSI < 0.1: No significant change
        - 0.1 <= PSI < 0.2: Moderate change, investigation needed
        - PSI >= 0.2: Significant change, action required
        """
        # For continuous features treated as categorical, bin them
        if ref_values.dtype in [np.float32, np.float64]:
            # Bin continuous values
            ref_clean = ref_values[~np.isnan(ref_values)]
            curr_clean = curr_values[~np.isnan(curr_values)]

            # Create bins from reference data
            percentiles = np.linspace(0, 100, n_bins + 1)
            bins = np.percentile(ref_clean, percentiles)
            bins[0] = -np.inf
            bins[-1] = np.inf

            ref_binned = np.digitize(ref_clean, bins)
            curr_binned = np.digitize(curr_clean, bins)
        else:
            ref_binned = ref_values
            curr_binned = curr_values

        # Get unique categories
        all_categories = np.unique(np.concatenate([ref_binned, curr_binned]))

        # Compute PSI
        psi = 0.0
        for cat in all_categories:
            ref_pct = np.mean(ref_binned == cat)
            curr_pct = np.mean(curr_binned == cat)

            # Avoid division by zero with small epsilon
            ref_pct = max(ref_pct, 1e-6)
            curr_pct = max(curr_pct, 1e-6)

            psi += (curr_pct - ref_pct) * np.log(curr_pct / ref_pct)

        psi = abs(psi)  # PSI is always positive

        # Determine severity
        severity = self._psi_to_severity(psi)
        drift_detected = severity != DriftSeverity.NONE

        return FeatureDriftResult(
            feature_name=feature_name,
            drift_score=float(psi),
            p_value=None,  # PSI doesn't have p-value
            drift_detected=drift_detected,
            severity=severity,
            method="psi",
            reference_stats={
                "n_categories": len(np.unique(ref_binned)),
                "n": len(ref_binned),
            },
            current_stats={
                "n_categories": len(np.unique(curr_binned)),
                "n": len(curr_binned),
            },
        )

    def _ks_to_severity(self, ks_statistic: float) -> DriftSeverity:
        """Convert KS statistic to severity level."""
        if ks_statistic >= self.KS_THRESHOLD_HIGH:
            return DriftSeverity.CRITICAL
        if ks_statistic >= self.KS_THRESHOLD_MODERATE:
            return DriftSeverity.HIGH
        if ks_statistic >= self.KS_THRESHOLD_LOW:
            return DriftSeverity.MODERATE
        return DriftSeverity.NONE

    def _psi_to_severity(self, psi: float) -> DriftSeverity:
        """Convert PSI to severity level."""
        if psi >= self.PSI_THRESHOLD_HIGH:
            return DriftSeverity.CRITICAL
        if psi >= self.PSI_THRESHOLD_MODERATE:
            return DriftSeverity.HIGH
        if psi >= self.PSI_THRESHOLD_LOW:
            return DriftSeverity.MODERATE
        return DriftSeverity.NONE

    def _compute_overall_severity(
        self,
        feature_results: List[FeatureDriftResult]
    ) -> DriftSeverity:
        """Compute overall drift severity from feature results."""
        if not feature_results:
            return DriftSeverity.NONE

        # Count severities
        severity_counts = {s: 0 for s in DriftSeverity}
        for result in feature_results:
            severity_counts[result.severity] += 1

        # Determine overall severity based on worst cases
        n_features = len(feature_results)

        if severity_counts[DriftSeverity.CRITICAL] >= 1:
            return DriftSeverity.CRITICAL
        if severity_counts[DriftSeverity.HIGH] >= 2:
            return DriftSeverity.HIGH
        if severity_counts[DriftSeverity.HIGH] >= 1:
            return DriftSeverity.MODERATE
        if severity_counts[DriftSeverity.MODERATE] >= n_features * 0.3:
            return DriftSeverity.MODERATE
        if severity_counts[DriftSeverity.MODERATE] >= 1:
            return DriftSeverity.LOW

        return DriftSeverity.NONE

    def _generate_recommendations(
        self,
        feature_results: List[FeatureDriftResult],
        overall_severity: DriftSeverity,
        drifted_features: List[str]
    ) -> List[str]:
        """Generate actionable recommendations based on drift analysis."""
        recommendations = []

        if overall_severity == DriftSeverity.NONE:
            recommendations.append("No significant drift detected. Model is stable.")
            return recommendations

        if overall_severity == DriftSeverity.CRITICAL:
            recommendations.append(
                "CRITICAL: Immediate model retraining recommended due to severe drift."
            )
        elif overall_severity == DriftSeverity.HIGH:
            recommendations.append(
                "HIGH PRIORITY: Schedule model retraining within the next week."
            )
        elif overall_severity == DriftSeverity.MODERATE:
            recommendations.append(
                "Monitor closely. Consider retraining if drift persists."
            )
        else:
            recommendations.append(
                "Minor drift detected. Continue monitoring."
            )

        # Feature-specific recommendations
        if drifted_features:
            recommendations.append(
                f"Features with significant drift: {', '.join(drifted_features[:5])}"
            )

        # Check for specific patterns
        high_drift_features = [
            r for r in feature_results
            if r.severity in [DriftSeverity.HIGH, DriftSeverity.CRITICAL]
        ]

        if len(high_drift_features) > len(feature_results) * 0.5:
            recommendations.append(
                "Widespread drift suggests a fundamental data distribution change. "
                "Review data collection process and business context."
            )

        return recommendations

    def get_reference_info(self) -> Dict[str, Any]:
        """Get information about the current reference data."""
        if self._reference_data is None:
            return {"status": "not_set"}

        return {
            "status": "set",
            "sample_size": len(self._reference_data),
            "n_features": self._reference_data.shape[1],
            "feature_names": self._reference_feature_names,
            "categorical_features": self._categorical_features,
            "model_version": self._model_version,
            "timestamp": (
                self._reference_timestamp.isoformat()
                if self._reference_timestamp else None
            ),
        }

    def clear_reference_data(self) -> None:
        """Clear reference data."""
        self._reference_data = None
        self._reference_feature_names = None
        self._categorical_features = None
        self._model_version = None
        self._reference_timestamp = None
        logger.info("Reference data cleared")


# Singleton instance
model_drift_service = ModelDriftService()
