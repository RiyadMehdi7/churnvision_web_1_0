"""
Data-Driven Thresholds Service

Computes all thresholds dynamically from user data using percentiles.
NO hardcoded values - everything is derived from the actual dataset.
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import numpy as np
import pandas as pd
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

logger = logging.getLogger(__name__)


@dataclass
class DatasetThresholds:
    """All thresholds computed from a specific dataset."""
    dataset_id: Optional[str]
    computed_at: datetime = field(default_factory=datetime.utcnow)
    sample_size: int = 0

    # Risk thresholds (computed from churn probability distribution)
    risk_high_threshold: float = 0.0
    risk_medium_threshold: float = 0.0

    # Salary tier thresholds (percentile-based)
    salary_tiers: Dict[str, Tuple[float, float]] = field(default_factory=dict)
    # e.g., {'low': (0, 50000), 'medium': (50000, 90000), 'high': (90000, inf)}

    # Tenure stage thresholds (percentile-based)
    tenure_stages: Dict[str, Tuple[float, float]] = field(default_factory=dict)
    # e.g., {'onboarding': (0, 0.5), 'early': (0.5, 2), ...}

    # Feature value ranges (from actual data)
    feature_ranges: Dict[str, Dict[str, float]] = field(default_factory=dict)
    # e.g., {'satisfaction_level': {'min': 0.1, 'max': 0.95, 'p25': 0.4, 'p50': 0.6, 'p75': 0.8}}

    # ELTV thresholds (percentile-based)
    eltv_high_threshold: float = 0.0
    eltv_medium_threshold: float = 0.0

    # Workload thresholds
    hours_high_threshold: float = 0.0  # p75 - overwork
    hours_low_threshold: float = 0.0   # p25 - underwork

    # Project count thresholds
    projects_high_threshold: int = 0   # p75
    projects_low_threshold: int = 0    # p25

    # Base hazard rate (from actual turnover data)
    base_hazard_rate: float = 0.0

    # Risk distribution (actual from data)
    actual_risk_distribution: Dict[str, float] = field(default_factory=dict)

    # SHAP value thresholds (computed from SHAP distribution during training)
    shap_critical_threshold: float = 0.0  # p90 - critical impact
    shap_high_threshold: float = 0.0      # p75 - high impact
    shap_medium_threshold: float = 0.0    # p50 - medium impact
    shap_low_threshold: float = 0.0       # p25 - low impact

    # Sentiment thresholds (computed from interview sentiment distribution)
    sentiment_positive_threshold: float = 0.0   # p75 - positive sentiment
    sentiment_negative_threshold: float = 0.0   # p25 - negative/concerning sentiment

    # Risk change alert thresholds (computed from historical risk changes)
    risk_change_significant: float = 0.0  # 2 sigma - significant change
    risk_change_moderate: float = 0.0     # 1 sigma - moderate change
    risk_change_std: float = 0.0          # Standard deviation of risk changes

    # Optimal classification threshold (from training - F1 maximizing or cost-sensitive)
    optimal_classification_threshold: float = 0.5  # Default to 0.5, updated during training
    classification_threshold_method: str = "f1"    # "f1", "precision", "recall", "cost"


class DataDrivenThresholdsService:
    """
    Computes all thresholds from user data using percentiles.

    Philosophy: NO hardcoded values. Everything is derived from:
    - Percentiles of the actual data distribution
    - Actual turnover rates from historical data
    - Feature distributions from the dataset
    """

    def __init__(self):
        # Cache thresholds per dataset
        self._thresholds_cache: Dict[str, DatasetThresholds] = {}
        self._cache_ttl_seconds = 3600  # 1 hour cache

    def _is_cache_valid(self, dataset_id: Optional[str]) -> bool:
        """Check if cached thresholds are still valid."""
        cache_key = dataset_id or "default"
        if cache_key not in self._thresholds_cache:
            return False

        cached = self._thresholds_cache[cache_key]
        age = (datetime.utcnow() - cached.computed_at).total_seconds()
        return age < self._cache_ttl_seconds

    def get_cached_thresholds(self, dataset_id: Optional[str]) -> Optional[DatasetThresholds]:
        """Get cached thresholds if valid."""
        if self._is_cache_valid(dataset_id):
            return self._thresholds_cache.get(dataset_id or "default")
        return None

    def compute_thresholds_from_dataframe(
        self,
        df: pd.DataFrame,
        dataset_id: Optional[str] = None,
        target_column: str = 'left',
        salary_column: str = 'employee_cost',
        tenure_column: str = 'tenure',
        hours_column: str = 'average_monthly_hours',
        projects_column: str = 'number_project',
        satisfaction_column: str = 'satisfaction_level',
        evaluation_column: str = 'last_evaluation',
    ) -> DatasetThresholds:
        """
        Compute all thresholds from a DataFrame.

        Uses percentiles to determine all boundaries:
        - Risk: Based on predicted probability distribution
        - Salary: Tertiles (33rd, 67th percentile)
        - Tenure: Quintiles (20th, 40th, 60th, 80th percentile)
        - Features: Min, max, quartiles
        """
        thresholds = DatasetThresholds(
            dataset_id=dataset_id,
            sample_size=len(df)
        )

        if len(df) < 10:
            logger.warning(f"Dataset too small ({len(df)} rows) for reliable threshold computation")
            return thresholds

        # Compute salary tier thresholds (tertiles)
        if salary_column in df.columns:
            salary_data = df[salary_column].dropna()
            if len(salary_data) > 0:
                p33 = float(np.percentile(salary_data, 33))
                p67 = float(np.percentile(salary_data, 67))
                thresholds.salary_tiers = {
                    'low': (0.0, p33),
                    'medium': (p33, p67),
                    'high': (p67, float('inf'))
                }

        # Compute tenure stage thresholds (quintiles)
        if tenure_column in df.columns:
            tenure_data = df[tenure_column].dropna()
            if len(tenure_data) > 0:
                p20 = float(np.percentile(tenure_data, 20))
                p40 = float(np.percentile(tenure_data, 40))
                p60 = float(np.percentile(tenure_data, 60))
                p80 = float(np.percentile(tenure_data, 80))
                thresholds.tenure_stages = {
                    'onboarding': (0.0, p20),
                    'early_career': (p20, p40),
                    'established': (p40, p60),
                    'senior': (p60, p80),
                    'veteran': (p80, float('inf'))
                }

        # Compute feature ranges
        numeric_columns = [
            satisfaction_column, evaluation_column, hours_column,
            projects_column, tenure_column, salary_column
        ]
        for col in numeric_columns:
            if col in df.columns:
                col_data = df[col].dropna()
                if len(col_data) > 0:
                    thresholds.feature_ranges[col] = {
                        'min': float(col_data.min()),
                        'max': float(col_data.max()),
                        'p10': float(np.percentile(col_data, 10)),
                        'p25': float(np.percentile(col_data, 25)),
                        'p50': float(np.percentile(col_data, 50)),
                        'p75': float(np.percentile(col_data, 75)),
                        'p90': float(np.percentile(col_data, 90)),
                        'mean': float(col_data.mean()),
                        'std': float(col_data.std())
                    }

        # Compute workload thresholds (p25/p75)
        if hours_column in df.columns:
            hours_data = df[hours_column].dropna()
            if len(hours_data) > 0:
                thresholds.hours_low_threshold = float(np.percentile(hours_data, 25))
                thresholds.hours_high_threshold = float(np.percentile(hours_data, 75))

        # Compute project count thresholds
        if projects_column in df.columns:
            projects_data = df[projects_column].dropna()
            if len(projects_data) > 0:
                thresholds.projects_low_threshold = int(np.percentile(projects_data, 25))
                thresholds.projects_high_threshold = int(np.percentile(projects_data, 75))

        # Compute base hazard rate from actual turnover
        if target_column in df.columns:
            turnover_rate = df[target_column].mean()
            thresholds.base_hazard_rate = float(turnover_rate)

        # Cache the thresholds
        cache_key = dataset_id or "default"
        self._thresholds_cache[cache_key] = thresholds

        logger.info(f"Computed thresholds for dataset {dataset_id}: "
                   f"salary_tiers={thresholds.salary_tiers}, "
                   f"tenure_stages={thresholds.tenure_stages}")

        return thresholds

    def compute_risk_thresholds_from_predictions(
        self,
        predictions: List[float],
        dataset_id: Optional[str] = None,
        high_risk_percentile: float = 85.0,  # Top 15% are high risk
        medium_risk_percentile: float = 60.0  # Top 40% are medium+ risk
    ) -> Tuple[float, float]:
        """
        Compute risk thresholds from actual prediction distribution.

        Args:
            predictions: List of churn probabilities
            high_risk_percentile: Percentile above which is high risk (e.g., 85 = top 15%)
            medium_risk_percentile: Percentile above which is medium risk (e.g., 60 = top 40%)

        Returns:
            (high_threshold, medium_threshold)
        """
        if len(predictions) < 10:
            logger.warning("Not enough predictions for threshold computation")
            # Return median-based fallback
            if len(predictions) > 0:
                median = float(np.median(predictions))
                return (median + 0.2, median)
            return (0.6, 0.3)

        predictions_array = np.array(predictions)
        high_threshold = float(np.percentile(predictions_array, high_risk_percentile))
        medium_threshold = float(np.percentile(predictions_array, medium_risk_percentile))

        # Ensure high > medium
        if high_threshold <= medium_threshold:
            high_threshold = medium_threshold + 0.05

        # Update cache if dataset_id provided
        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].risk_high_threshold = high_threshold
                self._thresholds_cache[cache_key].risk_medium_threshold = medium_threshold

        return (high_threshold, medium_threshold)

    def compute_eltv_thresholds_from_values(
        self,
        eltv_values: List[float],
        dataset_id: Optional[str] = None,
        high_percentile: float = 75.0,
        medium_percentile: float = 50.0
    ) -> Tuple[float, float]:
        """
        Compute ELTV category thresholds from actual ELTV distribution.
        """
        if len(eltv_values) < 10:
            if len(eltv_values) > 0:
                median = float(np.median(eltv_values))
                return (median * 1.5, median)
            return (100000.0, 50000.0)

        eltv_array = np.array(eltv_values)
        high_threshold = float(np.percentile(eltv_array, high_percentile))
        medium_threshold = float(np.percentile(eltv_array, medium_percentile))

        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].eltv_high_threshold = high_threshold
                self._thresholds_cache[cache_key].eltv_medium_threshold = medium_threshold

        return (high_threshold, medium_threshold)

    def get_salary_tier(
        self,
        salary: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """Get salary tier based on data-driven thresholds."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds or not thresholds.salary_tiers:
            # No thresholds computed yet - return middle tier
            return 'medium'

        for tier_name, (low, high) in thresholds.salary_tiers.items():
            if low <= salary < high:
                return tier_name

        return 'medium'

    def get_tenure_stage(
        self,
        tenure_years: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """Get tenure stage based on data-driven thresholds."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds or not thresholds.tenure_stages:
            # No thresholds computed yet - use simple logic
            if tenure_years < 1:
                return 'onboarding'
            elif tenure_years < 3:
                return 'early_career'
            elif tenure_years < 5:
                return 'established'
            elif tenure_years < 10:
                return 'senior'
            return 'veteran'

        for stage_name, (low, high) in thresholds.tenure_stages.items():
            if low <= tenure_years < high:
                return stage_name

        return 'established'

    def get_risk_level(
        self,
        churn_probability: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """Get risk level based on data-driven thresholds."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds or thresholds.risk_high_threshold == 0:
            # No thresholds computed - use probability directly
            # Top third = high, middle third = medium, bottom third = low
            if churn_probability >= 0.67:
                return 'high'
            elif churn_probability >= 0.33:
                return 'medium'
            return 'low'

        if churn_probability >= thresholds.risk_high_threshold:
            return 'high'
        elif churn_probability >= thresholds.risk_medium_threshold:
            return 'medium'
        return 'low'

    def get_feature_percentile(
        self,
        feature_name: str,
        value: float,
        dataset_id: Optional[str] = None
    ) -> float:
        """
        Get the percentile rank of a feature value within the dataset.

        Returns a value between 0 and 100.
        """
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds or feature_name not in thresholds.feature_ranges:
            return 50.0  # Default to median

        ranges = thresholds.feature_ranges[feature_name]

        # Approximate percentile using known percentile values
        if value <= ranges['p10']:
            return 10.0 * (value - ranges['min']) / (ranges['p10'] - ranges['min'] + 0.0001)
        elif value <= ranges['p25']:
            return 10.0 + 15.0 * (value - ranges['p10']) / (ranges['p25'] - ranges['p10'] + 0.0001)
        elif value <= ranges['p50']:
            return 25.0 + 25.0 * (value - ranges['p25']) / (ranges['p50'] - ranges['p25'] + 0.0001)
        elif value <= ranges['p75']:
            return 50.0 + 25.0 * (value - ranges['p50']) / (ranges['p75'] - ranges['p50'] + 0.0001)
        elif value <= ranges['p90']:
            return 75.0 + 15.0 * (value - ranges['p75']) / (ranges['p90'] - ranges['p75'] + 0.0001)
        else:
            return min(100.0, 90.0 + 10.0 * (value - ranges['p90']) / (ranges['max'] - ranges['p90'] + 0.0001))

    def is_feature_anomalous(
        self,
        feature_name: str,
        value: float,
        dataset_id: Optional[str] = None,
        anomaly_threshold: float = 10.0  # Below p10 or above p90
    ) -> Tuple[bool, str]:
        """
        Check if a feature value is anomalous (extreme) for this dataset.

        Returns (is_anomalous, direction) where direction is 'low', 'high', or 'normal'
        """
        percentile = self.get_feature_percentile(feature_name, value, dataset_id)

        if percentile < anomaly_threshold:
            return (True, 'low')
        elif percentile > (100 - anomaly_threshold):
            return (True, 'high')
        return (False, 'normal')

    def get_base_hazard_rate(self, dataset_id: Optional[str] = None) -> float:
        """Get the base hazard rate (turnover rate) from the data."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds or thresholds.base_hazard_rate == 0:
            return 0.15  # Industry average fallback only if no data

        return thresholds.base_hazard_rate

    def invalidate_cache(self, dataset_id: Optional[str] = None):
        """Invalidate cached thresholds for a dataset."""
        cache_key = dataset_id or "default"
        if cache_key in self._thresholds_cache:
            del self._thresholds_cache[cache_key]

    def get_all_thresholds(self, dataset_id: Optional[str] = None) -> Dict[str, Any]:
        """Get all computed thresholds as a dictionary for API responses."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if not thresholds:
            return {"status": "not_computed", "dataset_id": dataset_id}

        return {
            "status": "computed",
            "dataset_id": thresholds.dataset_id,
            "computed_at": thresholds.computed_at.isoformat(),
            "sample_size": thresholds.sample_size,
            "risk_thresholds": {
                "high": thresholds.risk_high_threshold,
                "medium": thresholds.risk_medium_threshold
            },
            "salary_tiers": thresholds.salary_tiers,
            "tenure_stages": thresholds.tenure_stages,
            "feature_ranges": thresholds.feature_ranges,
            "workload_thresholds": {
                "high_hours": thresholds.hours_high_threshold,
                "low_hours": thresholds.hours_low_threshold,
                "high_projects": thresholds.projects_high_threshold,
                "low_projects": thresholds.projects_low_threshold
            },
            "eltv_thresholds": {
                "high": thresholds.eltv_high_threshold,
                "medium": thresholds.eltv_medium_threshold
            },
            "base_hazard_rate": thresholds.base_hazard_rate,
            "shap_thresholds": {
                "critical": thresholds.shap_critical_threshold,
                "high": thresholds.shap_high_threshold,
                "medium": thresholds.shap_medium_threshold,
                "low": thresholds.shap_low_threshold
            },
            "sentiment_thresholds": {
                "positive": thresholds.sentiment_positive_threshold,
                "negative": thresholds.sentiment_negative_threshold
            },
            "risk_change_thresholds": {
                "significant": thresholds.risk_change_significant,
                "moderate": thresholds.risk_change_moderate,
                "std": thresholds.risk_change_std
            },
            "classification_threshold": {
                "optimal": thresholds.optimal_classification_threshold,
                "method": thresholds.classification_threshold_method
            }
        }

    # =========================================================================
    # SHAP Value Thresholds
    # =========================================================================

    def compute_shap_thresholds(
        self,
        shap_values: np.ndarray,
        dataset_id: Optional[str] = None
    ) -> Dict[str, float]:
        """
        Compute SHAP value thresholds from actual SHAP distribution during training.

        Args:
            shap_values: Array of SHAP values (can be 2D: samples x features)
            dataset_id: Optional dataset identifier

        Returns:
            Dict with critical, high, medium, low thresholds
        """
        # Flatten and take absolute values (we care about magnitude)
        flat_shap = np.abs(shap_values.flatten())

        if len(flat_shap) < 100:
            logger.warning("Not enough SHAP values for reliable threshold computation")
            return {"critical": 0.3, "high": 0.15, "medium": 0.05, "low": 0.02}

        thresholds_dict = {
            "critical": float(np.percentile(flat_shap, 90)),  # Top 10% = critical
            "high": float(np.percentile(flat_shap, 75)),      # Top 25% = high
            "medium": float(np.percentile(flat_shap, 50)),    # Top 50% = medium
            "low": float(np.percentile(flat_shap, 25))        # Top 75% = low
        }

        # Update cache if dataset_id provided
        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].shap_critical_threshold = thresholds_dict["critical"]
                self._thresholds_cache[cache_key].shap_high_threshold = thresholds_dict["high"]
                self._thresholds_cache[cache_key].shap_medium_threshold = thresholds_dict["medium"]
                self._thresholds_cache[cache_key].shap_low_threshold = thresholds_dict["low"]

        logger.info(f"Computed SHAP thresholds for dataset {dataset_id}: {thresholds_dict}")
        return thresholds_dict

    def get_shap_impact_level(
        self,
        shap_value: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """
        Get the impact level for a SHAP value based on data-driven thresholds.

        Returns: 'critical', 'high', 'medium', 'low', or 'minimal'
        """
        thresholds = self.get_cached_thresholds(dataset_id)
        abs_val = abs(shap_value)

        if thresholds and thresholds.shap_critical_threshold > 0:
            if abs_val >= thresholds.shap_critical_threshold:
                return "critical"
            elif abs_val >= thresholds.shap_high_threshold:
                return "high"
            elif abs_val >= thresholds.shap_medium_threshold:
                return "medium"
            elif abs_val >= thresholds.shap_low_threshold:
                return "low"
            return "minimal"

        # Fallback if no thresholds computed
        if abs_val >= 0.3:
            return "critical"
        elif abs_val >= 0.15:
            return "high"
        elif abs_val >= 0.05:
            return "medium"
        elif abs_val >= 0.02:
            return "low"
        return "minimal"

    def get_shap_thresholds(
        self,
        dataset_id: Optional[str] = None
    ) -> Dict[str, float]:
        """Get SHAP thresholds for a dataset."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.shap_critical_threshold > 0:
            return {
                "critical": thresholds.shap_critical_threshold,
                "high": thresholds.shap_high_threshold,
                "medium": thresholds.shap_medium_threshold,
                "low": thresholds.shap_low_threshold
            }

        # Fallback defaults
        return {"critical": 0.3, "high": 0.15, "medium": 0.05, "low": 0.02}

    # =========================================================================
    # Sentiment Thresholds
    # =========================================================================

    def compute_sentiment_thresholds(
        self,
        sentiment_scores: List[float],
        dataset_id: Optional[str] = None
    ) -> Tuple[float, float]:
        """
        Compute sentiment thresholds from actual interview sentiment distribution.

        Args:
            sentiment_scores: List of sentiment scores from interviews
            dataset_id: Optional dataset identifier

        Returns:
            (positive_threshold, negative_threshold)
        """
        if len(sentiment_scores) < 10:
            logger.warning("Not enough sentiment scores for threshold computation")
            return (0.6, 0.4)  # Fallback

        scores_array = np.array(sentiment_scores)
        positive_threshold = float(np.percentile(scores_array, 75))  # Top 25% = positive
        negative_threshold = float(np.percentile(scores_array, 25))  # Bottom 25% = concerning

        # Update cache
        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].sentiment_positive_threshold = positive_threshold
                self._thresholds_cache[cache_key].sentiment_negative_threshold = negative_threshold

        logger.info(f"Computed sentiment thresholds for dataset {dataset_id}: "
                   f"positive={positive_threshold}, negative={negative_threshold}")
        return (positive_threshold, negative_threshold)

    def get_sentiment_label(
        self,
        sentiment_score: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """
        Get sentiment label based on data-driven thresholds.

        Returns: 'Positive', 'Neutral', or 'Concerning'
        """
        thresholds = self.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.sentiment_positive_threshold > 0:
            if sentiment_score > thresholds.sentiment_positive_threshold:
                return "Positive"
            elif sentiment_score > thresholds.sentiment_negative_threshold:
                return "Neutral"
            return "Concerning"

        # Fallback
        if sentiment_score > 0.6:
            return "Positive"
        elif sentiment_score > 0.4:
            return "Neutral"
        return "Concerning"

    def get_sentiment_thresholds(
        self,
        dataset_id: Optional[str] = None
    ) -> Tuple[float, float]:
        """Get sentiment thresholds for a dataset."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.sentiment_positive_threshold > 0:
            return (thresholds.sentiment_positive_threshold, thresholds.sentiment_negative_threshold)

        return (0.6, 0.4)  # Fallback

    # =========================================================================
    # Risk Change Alert Thresholds
    # =========================================================================

    def compute_risk_change_thresholds(
        self,
        risk_changes: List[float],
        dataset_id: Optional[str] = None
    ) -> Dict[str, float]:
        """
        Compute risk change alert thresholds from historical risk changes.

        Uses standard deviation approach:
        - Significant change: 2 sigma
        - Moderate change: 1 sigma

        Args:
            risk_changes: List of risk score changes (can be positive or negative)
            dataset_id: Optional dataset identifier

        Returns:
            Dict with significant, moderate thresholds and std
        """
        if len(risk_changes) < 20:
            logger.warning("Not enough risk change data for threshold computation")
            return {"significant": 0.2, "moderate": 0.1, "std": 0.1}

        changes_array = np.array(risk_changes)
        std_dev = float(np.std(changes_array))

        thresholds_dict = {
            "significant": std_dev * 2,  # 2 sigma
            "moderate": std_dev,          # 1 sigma
            "std": std_dev
        }

        # Update cache
        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].risk_change_significant = thresholds_dict["significant"]
                self._thresholds_cache[cache_key].risk_change_moderate = thresholds_dict["moderate"]
                self._thresholds_cache[cache_key].risk_change_std = std_dev

        logger.info(f"Computed risk change thresholds for dataset {dataset_id}: {thresholds_dict}")
        return thresholds_dict

    def get_risk_change_severity(
        self,
        risk_change: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """
        Get severity level for a risk change based on data-driven thresholds.

        Returns: 'critical', 'high', 'moderate', or 'low'
        """
        thresholds = self.get_cached_thresholds(dataset_id)
        abs_change = abs(risk_change)

        if thresholds and thresholds.risk_change_std > 0:
            if abs_change >= thresholds.risk_change_significant:
                return "critical" if risk_change > 0 else "high"
            elif abs_change >= thresholds.risk_change_moderate:
                return "moderate"
            return "low"

        # Fallback
        if abs_change >= 0.2:
            return "critical" if risk_change > 0 else "high"
        elif abs_change >= 0.1:
            return "moderate"
        return "low"

    def get_risk_change_thresholds(
        self,
        dataset_id: Optional[str] = None
    ) -> Dict[str, float]:
        """Get risk change thresholds for a dataset."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.risk_change_std > 0:
            return {
                "significant": thresholds.risk_change_significant,
                "moderate": thresholds.risk_change_moderate,
                "std": thresholds.risk_change_std
            }

        return {"significant": 0.2, "moderate": 0.1, "std": 0.1}  # Fallback

    # =========================================================================
    # Optimal Classification Threshold
    # =========================================================================

    def compute_optimal_classification_threshold(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        dataset_id: Optional[str] = None,
        method: str = "f1",
        cost_fn_ratio: float = 5.0  # Cost of FN / Cost of FP
    ) -> float:
        """
        Compute optimal classification threshold from training data.

        Args:
            y_true: True labels (0/1)
            y_proba: Predicted probabilities
            dataset_id: Optional dataset identifier
            method: "f1" (maximize F1), "precision" (minimize FP),
                    "recall" (minimize FN), "cost" (cost-sensitive)
            cost_fn_ratio: For cost method, ratio of FN cost to FP cost

        Returns:
            Optimal threshold value
        """
        from sklearn.metrics import precision_recall_curve, f1_score

        if len(y_true) < 50:
            logger.warning("Not enough samples for optimal threshold computation")
            return 0.5

        if method == "f1":
            # Find threshold that maximizes F1
            best_threshold = 0.5
            best_f1 = 0.0

            for threshold in np.arange(0.1, 0.9, 0.01):
                y_pred = (y_proba >= threshold).astype(int)
                f1 = f1_score(y_true, y_pred, zero_division=0)
                if f1 > best_f1:
                    best_f1 = f1
                    best_threshold = threshold

            optimal_threshold = best_threshold

        elif method == "precision":
            # Find threshold for minimum false positives while maintaining recall
            precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
            # Find threshold where recall is still > 0.5
            valid_idx = np.where(recall[:-1] > 0.5)[0]
            if len(valid_idx) > 0:
                optimal_threshold = float(thresholds[valid_idx[-1]])
            else:
                optimal_threshold = 0.5

        elif method == "recall":
            # Find threshold for minimum false negatives
            precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
            # Find threshold where precision is still reasonable (> 0.3)
            valid_idx = np.where(precision[:-1] > 0.3)[0]
            if len(valid_idx) > 0:
                optimal_threshold = float(thresholds[valid_idx[0]])
            else:
                optimal_threshold = 0.3

        elif method == "cost":
            # Cost-sensitive threshold selection
            best_threshold = 0.5
            min_cost = float('inf')

            for threshold in np.arange(0.1, 0.9, 0.01):
                y_pred = (y_proba >= threshold).astype(int)
                fp = np.sum((y_pred == 1) & (y_true == 0))
                fn = np.sum((y_pred == 0) & (y_true == 1))
                cost = fp + (fn * cost_fn_ratio)  # FN costs more
                if cost < min_cost:
                    min_cost = cost
                    best_threshold = threshold

            optimal_threshold = best_threshold

        else:
            optimal_threshold = 0.5

        # Update cache
        if dataset_id:
            cache_key = dataset_id or "default"
            if cache_key in self._thresholds_cache:
                self._thresholds_cache[cache_key].optimal_classification_threshold = optimal_threshold
                self._thresholds_cache[cache_key].classification_threshold_method = method

        logger.info(f"Computed optimal threshold for dataset {dataset_id}: "
                   f"{optimal_threshold} (method={method})")
        return optimal_threshold

    def get_classification_threshold(
        self,
        dataset_id: Optional[str] = None
    ) -> float:
        """Get optimal classification threshold for a dataset."""
        thresholds = self.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.optimal_classification_threshold != 0.5:
            return thresholds.optimal_classification_threshold

        return 0.5  # Fallback

    def classify_with_optimal_threshold(
        self,
        probability: float,
        dataset_id: Optional[str] = None
    ) -> bool:
        """
        Classify using the optimal threshold for this dataset.

        Returns: True if predicted positive (high risk), False otherwise
        """
        threshold = self.get_classification_threshold(dataset_id)
        return probability >= threshold


# Singleton instance
data_driven_thresholds_service = DataDrivenThresholdsService()
