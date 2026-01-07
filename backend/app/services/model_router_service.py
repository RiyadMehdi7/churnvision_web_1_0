"""
Model Router Service

Intelligent model selection based on dataset characteristics.
Automatically routes to the optimal model or ensemble based on data profiling.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
import logging

from app.services.dataset_profiler_service import DatasetProfile
from app.services.tabpfn_service import is_tabpfn_available

logger = logging.getLogger(__name__)


# Available model types
MODEL_TYPES = ["tabpfn", "xgboost", "lightgbm", "catboost", "random_forest", "logistic"]


@dataclass
class ModelRecommendation:
    """Model routing recommendation with reasoning."""

    # Primary recommendation
    primary_model: str  # 'tabpfn', 'xgboost', 'random_forest', 'logistic'
    confidence: float  # 0-1 confidence in recommendation
    reasoning: List[str]  # Human-readable reasons

    # Ensemble configuration
    use_ensemble: bool = False
    ensemble_models: List[str] = field(default_factory=list)
    ensemble_weights: Dict[str, float] = field(default_factory=dict)
    ensemble_method: str = "weighted_voting"  # 'weighted_voting', 'stacking'

    # Alternative recommendations
    alternatives: List[Tuple[str, float, str]] = field(default_factory=list)

    # Scores for all models
    model_scores: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "primary_model": self.primary_model,
            "confidence": round(self.confidence, 3),
            "reasoning": self.reasoning,
            "use_ensemble": self.use_ensemble,
            "ensemble_models": self.ensemble_models,
            "ensemble_weights": {k: round(v, 3) for k, v in self.ensemble_weights.items()},
            "ensemble_method": self.ensemble_method,
            "alternatives": [
                {"model": m, "score": round(s, 3), "reason": r}
                for m, s, r in self.alternatives
            ],
            "model_scores": {k: round(v, 3) for k, v in self.model_scores.items()},
        }


class ModelRouterService:
    """
    Intelligent model selection service.

    Analyzes dataset characteristics and routes to the optimal model
    or recommends an ensemble when appropriate.
    """

    # Ensemble trigger threshold: if top 2 models are within this difference, ensemble
    ENSEMBLE_THRESHOLD = 0.10

    # Minimum score difference to consider a clear winner
    CLEAR_WINNER_THRESHOLD = 0.15

    # Minimum viable score for a model to be considered
    MIN_VIABLE_SCORE = 0.3

    def __init__(self):
        self._tabpfn_available: Optional[bool] = None

    def route(self, profile: DatasetProfile) -> ModelRecommendation:
        """
        Route to optimal model based on dataset profile.

        Args:
            profile: Comprehensive dataset profile from DatasetProfilerService

        Returns:
            ModelRecommendation with selected model(s) and reasoning
        """
        logger.info(
            f"Routing model for dataset: {profile.n_samples} samples, "
            f"{profile.n_features} features"
        )

        # Score each model type
        scores = self._score_all_models(profile)

        # Check TabPFN availability
        if not self._check_tabpfn_available():
            if "tabpfn" in scores:
                scores["tabpfn"] = 0.0
                logger.info("TabPFN not available, removing from candidates")

        # Sort by score
        sorted_models = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        # Get top models
        top_model, top_score = sorted_models[0]
        second_model, second_score = sorted_models[1] if len(sorted_models) > 1 else (None, 0)

        # Build recommendation
        reasoning = []
        alternatives = []

        # Determine if ensemble is warranted
        use_ensemble = False
        ensemble_models = []
        ensemble_weights = {}

        score_diff = top_score - second_score if second_model else 1.0

        if score_diff < self.ENSEMBLE_THRESHOLD and second_score >= self.MIN_VIABLE_SCORE:
            # Top 2 models are close - recommend ensemble
            use_ensemble = True
            ensemble_models = [top_model, second_model]

            # Compute weights based on relative scores
            total_score = top_score + second_score
            ensemble_weights = {
                top_model: top_score / total_score,
                second_model: second_score / total_score,
            }

            reasoning.append(
                f"Ensemble recommended: {top_model} and {second_model} have similar scores "
                f"({top_score:.2f} vs {second_score:.2f})"
            )
        else:
            # Clear winner
            reasoning.append(f"Selected {top_model} with score {top_score:.2f}")

        # Add model-specific reasoning
        reasoning.extend(self._get_model_reasoning(top_model, profile, top_score))

        # Build alternatives list
        for model, score in sorted_models[1:]:
            if score >= self.MIN_VIABLE_SCORE:
                reason = self._get_alternative_reason(model, profile, score)
                alternatives.append((model, score, reason))

        # Determine confidence
        confidence = self._compute_confidence(top_score, score_diff, profile)

        recommendation = ModelRecommendation(
            primary_model=top_model,
            confidence=confidence,
            reasoning=reasoning,
            use_ensemble=use_ensemble,
            ensemble_models=ensemble_models,
            ensemble_weights=ensemble_weights,
            ensemble_method="weighted_voting",
            alternatives=alternatives,
            model_scores=scores,
        )

        logger.info(
            f"Routing decision: {recommendation.primary_model} "
            f"(confidence: {recommendation.confidence:.2f}, ensemble: {recommendation.use_ensemble})"
        )

        return recommendation

    def _score_all_models(self, profile: DatasetProfile) -> Dict[str, float]:
        """Score all available model types."""
        return {
            "tabpfn": self._score_tabpfn(profile),
            "xgboost": self._score_xgboost(profile),
            "lightgbm": self._score_lightgbm(profile),
            "catboost": self._score_catboost(profile),
            "random_forest": self._score_random_forest(profile),
            "logistic": self._score_logistic(profile),
        }

    def _score_tabpfn(self, profile: DatasetProfile) -> float:
        """
        Score TabPFN suitability.

        TabPFN excels with:
        - Small datasets (< 1000 samples)
        - Few features (< 100)
        - Binary/few-class classification
        - Clean data (low missing values)
        """
        # Start with precomputed suitability score
        score = profile.tabpfn_suitability_score

        # Hard constraints - return 0 if violated
        if profile.n_samples > 1000:
            return 0.0
        if profile.n_features > 100:
            return 0.0
        if profile.n_classes > 10:
            return 0.0

        # Boost for ideal scenarios
        if profile.n_samples < 500 and profile.n_features < 50:
            score = min(1.0, score + 0.15)

        # Penalize characteristics TabPFN struggles with
        if profile.is_severely_imbalanced:
            score *= 0.85

        if profile.missing_ratio > 0.05:
            score *= 0.8

        if profile.high_cardinality_features > 2:
            score *= 0.9

        return max(0.0, min(1.0, score))

    def _score_xgboost(self, profile: DatasetProfile) -> float:
        """
        Score XGBoost suitability.

        XGBoost excels with:
        - Medium to large datasets
        - Imbalanced classes
        - Mixed feature types
        - Some missing data
        """
        score = profile.tree_model_suitability_score

        # XGBoost handles larger datasets well
        if profile.n_samples > 5000:
            score = min(1.0, score + 0.1)
        elif profile.n_samples > 1000:
            score = min(1.0, score + 0.05)

        # XGBoost has native imbalance handling
        if profile.is_severely_imbalanced:
            score = min(1.0, score + 0.1)

        # XGBoost handles missing data natively
        if 0 < profile.missing_ratio < 0.2:
            score = min(1.0, score + 0.05)

        # XGBoost can capture complex interactions
        if profile.highly_correlated_pairs > 0:
            score = min(1.0, score + 0.05)

        # Slight penalty for very small datasets (TabPFN may be better)
        if profile.n_samples < 200:
            score *= 0.85

        return max(0.0, min(1.0, score))

    def _score_lightgbm(self, profile: DatasetProfile) -> float:
        """
        Score LightGBM suitability.

        LightGBM excels with:
        - Large datasets (fastest gradient boosting)
        - High-dimensional sparse data
        - Categorical features (native support)
        - Memory efficiency
        """
        score = profile.tree_model_suitability_score

        # LightGBM shines with large datasets (histogram-based, very fast)
        if profile.n_samples > 10000:
            score = min(1.0, score + 0.15)
        elif profile.n_samples > 5000:
            score = min(1.0, score + 0.1)
        elif profile.n_samples > 1000:
            score = min(1.0, score + 0.05)

        # LightGBM handles high-dimensional data efficiently
        if profile.n_features > 50:
            score = min(1.0, score + 0.1)

        # Native categorical feature handling
        if profile.categorical_features > 0:
            score = min(1.0, score + 0.05)

        # LightGBM handles missing data natively
        if 0 < profile.missing_ratio < 0.2:
            score = min(1.0, score + 0.05)

        # Good with imbalanced data
        if profile.is_severely_imbalanced:
            score = min(1.0, score + 0.08)

        # Slight penalty for very small datasets (may overfit)
        if profile.n_samples < 500:
            score *= 0.9

        return max(0.0, min(1.0, score))

    def _score_catboost(self, profile: DatasetProfile) -> float:
        """
        Score CatBoost suitability.

        CatBoost excels with:
        - Categorical features (best-in-class handling)
        - Mixed feature types
        - Preventing target leakage (ordered boosting)
        - Out-of-the-box quality without tuning
        """
        score = profile.tree_model_suitability_score

        # CatBoost is the champion for categorical features
        if profile.categorical_features > 3:
            score = min(1.0, score + 0.15)
        elif profile.categorical_features > 0:
            score = min(1.0, score + 0.08)

        # High cardinality categoricals are CatBoost's specialty
        if profile.high_cardinality_features > 2:
            score = min(1.0, score + 0.12)
        elif profile.high_cardinality_features > 0:
            score = min(1.0, score + 0.06)

        # CatBoost handles imbalanced data well
        if profile.is_severely_imbalanced:
            score = min(1.0, score + 0.08)

        # Ordered boosting prevents overfitting on medium datasets
        if 1000 <= profile.n_samples <= 10000:
            score = min(1.0, score + 0.05)

        # CatBoost handles missing data natively
        if 0 < profile.missing_ratio < 0.2:
            score = min(1.0, score + 0.05)

        # Large datasets - CatBoost is good but LightGBM is faster
        if profile.n_samples > 50000:
            score *= 0.95

        # Small datasets - ordered boosting helps prevent overfitting
        if profile.n_samples < 500:
            score *= 0.95

        return max(0.0, min(1.0, score))

    def _score_random_forest(self, profile: DatasetProfile) -> float:
        """
        Score Random Forest suitability.

        Random Forest excels with:
        - High cardinality categoricals
        - Noisy data
        - Medium datasets
        - When interpretability matters (feature importance)
        """
        score = profile.tree_model_suitability_score * 0.95  # Slight base penalty vs XGBoost

        # RF handles high cardinality well
        if profile.high_cardinality_features > 2:
            score = min(1.0, score + 0.1)

        # RF is robust to outliers
        if profile.outlier_ratio > 0.05:
            score = min(1.0, score + 0.05)

        # RF provides stable feature importance
        if profile.n_features > 15:
            score = min(1.0, score + 0.05)

        # RF doesn't handle missing data as well as XGBoost
        if profile.missing_ratio > 0.1:
            score *= 0.9

        # RF can be slower for large datasets
        if profile.n_samples > 10000:
            score *= 0.95

        return max(0.0, min(1.0, score))

    def _score_logistic(self, profile: DatasetProfile) -> float:
        """
        Score Logistic Regression suitability.

        Logistic Regression excels with:
        - Linear relationships
        - Interpretability requirements
        - Low feature count
        - Fast inference needs
        """
        score = profile.linear_model_suitability_score

        # Strong target correlations favor linear models
        if profile.target_correlation_max > 0.6:
            score = min(1.0, score + 0.15)

        # Few features favor interpretability
        if profile.n_features < 15:
            score = min(1.0, score + 0.1)

        # Low multicollinearity is good
        if profile.max_feature_correlation < 0.5:
            score = min(1.0, score + 0.05)

        # Penalize characteristics logistic struggles with
        if profile.high_cardinality_features > 2:
            score *= 0.8

        if profile.is_severely_imbalanced:
            score *= 0.9  # Less robust than tree methods

        if profile.outlier_ratio > 0.1:
            score *= 0.85

        if profile.missing_ratio > 0.1:
            score *= 0.85

        # Very small datasets - logistic may overfit
        if profile.n_samples < 100 and profile.n_features > 5:
            score *= 0.8

        return max(0.0, min(1.0, score))

    def _get_model_reasoning(
        self,
        model: str,
        profile: DatasetProfile,
        score: float
    ) -> List[str]:
        """Generate human-readable reasoning for model selection."""
        reasons = []

        if model == "tabpfn":
            reasons.append(
                f"Small dataset ({profile.n_samples} samples) ideal for pre-trained transformer"
            )
            if profile.n_features < 50:
                reasons.append(f"Low feature count ({profile.n_features}) within TabPFN sweet spot")
            if profile.missing_ratio < 0.01:
                reasons.append("Clean data with minimal missing values")

        elif model == "xgboost":
            if profile.n_samples > 1000:
                reasons.append(
                    f"Large dataset ({profile.n_samples} samples) benefits from gradient boosting"
                )
            if profile.is_severely_imbalanced:
                reasons.append("Class imbalance handled with scale_pos_weight")
            if profile.missing_ratio > 0:
                reasons.append("Native missing value handling")

        elif model == "lightgbm":
            if profile.n_samples > 5000:
                reasons.append(
                    f"Large dataset ({profile.n_samples} samples) ideal for histogram-based boosting"
                )
            if profile.n_features > 50:
                reasons.append(
                    f"High-dimensional data ({profile.n_features} features) handled efficiently"
                )
            if profile.categorical_features > 0:
                reasons.append("Native categorical feature support")

        elif model == "catboost":
            if profile.categorical_features > 0:
                reasons.append(
                    f"Categorical features ({profile.categorical_features}) "
                    "handled with target encoding"
                )
            if profile.high_cardinality_features > 0:
                reasons.append(
                    f"High cardinality features ({profile.high_cardinality_features}) "
                    "are CatBoost's specialty"
                )
            if 1000 <= profile.n_samples <= 10000:
                reasons.append("Ordered boosting prevents overfitting on medium datasets")

        elif model == "random_forest":
            if profile.high_cardinality_features > 0:
                reasons.append(
                    f"High cardinality features ({profile.high_cardinality_features}) "
                    "handled well by Random Forest"
                )
            if profile.outlier_ratio > 0.05:
                reasons.append("Robust to outliers in data")

        elif model == "logistic":
            if profile.target_correlation_max > 0.5:
                reasons.append(
                    f"Strong linear relationships detected (max corr: {profile.target_correlation_max:.2f})"
                )
            if profile.n_features < 20:
                reasons.append("Low feature count favors interpretable model")

        return reasons

    def _get_alternative_reason(
        self,
        model: str,
        profile: DatasetProfile,
        score: float
    ) -> str:
        """Generate reason why an alternative model could work."""
        if model == "tabpfn":
            return "Pre-trained transformer for small data"
        if model == "xgboost":
            return "Robust gradient boosting for general tabular data"
        if model == "lightgbm":
            return "Fast histogram-based boosting for large datasets"
        if model == "catboost":
            return "Best-in-class categorical feature handling"
        if model == "random_forest":
            return "Ensemble method with feature importance"
        if model == "logistic":
            return "Fast, interpretable linear model"
        return f"Alternative with score {score:.2f}"

    def _compute_confidence(
        self,
        top_score: float,
        score_diff: float,
        profile: DatasetProfile
    ) -> float:
        """
        Compute confidence in the routing decision.

        Higher confidence when:
        - Top model has high absolute score
        - Clear gap between top and second model
        - Data quality is high
        """
        # Base confidence from top score
        confidence = top_score * 0.6

        # Boost for clear winner
        if score_diff > self.CLEAR_WINNER_THRESHOLD:
            confidence += 0.2
        elif score_diff > self.ENSEMBLE_THRESHOLD:
            confidence += 0.1

        # Adjust for data quality
        confidence *= (0.7 + 0.3 * profile.overall_quality_score)

        return max(0.0, min(1.0, confidence))

    def _check_tabpfn_available(self) -> bool:
        """Check if TabPFN is available (cached)."""
        if self._tabpfn_available is None:
            self._tabpfn_available = is_tabpfn_available()
        return self._tabpfn_available

    def get_supported_models(self) -> List[str]:
        """Get list of all supported model types."""
        models = ["xgboost", "lightgbm", "catboost", "random_forest", "logistic"]
        if self._check_tabpfn_available():
            models.insert(0, "tabpfn")
        return models


# Singleton instance
model_router = ModelRouterService()
