"""
Dataset Profiler Service

Comprehensive dataset analysis for intelligent model routing.
Analyzes dataset characteristics to determine optimal model selection.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
import pandas as pd
from scipy import stats
import logging

logger = logging.getLogger(__name__)


@dataclass
class DatasetProfile:
    """Comprehensive dataset profile for model routing decisions."""

    # Size metrics
    n_samples: int
    n_features: int
    n_numeric_features: int
    n_categorical_features: int

    # Class distribution
    n_classes: int
    class_balance_ratio: float  # minority/majority ratio (0-1)
    is_severely_imbalanced: bool  # ratio < 0.1
    class_distribution: Dict[Any, int] = field(default_factory=dict)

    # Missing data
    missing_ratio: float  # overall missing percentage
    features_with_missing: int
    max_missing_per_feature: float
    missing_per_feature: Dict[str, float] = field(default_factory=dict)

    # Numeric feature statistics
    numeric_stats: Dict[str, Dict[str, float]] = field(default_factory=dict)
    has_outliers: bool = False
    outlier_ratio: float = 0.0
    outlier_features: List[str] = field(default_factory=list)

    # Categorical feature analysis
    max_cardinality: int = 0
    avg_cardinality: float = 0.0
    high_cardinality_features: int = 0  # features with >20 unique values
    categorical_stats: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Correlation analysis
    max_feature_correlation: float = 0.0
    highly_correlated_pairs: int = 0  # pairs with |r| > 0.8
    target_correlation_max: float = 0.0
    correlation_matrix: Optional[Dict[str, Dict[str, float]]] = None

    # Quality & suitability scores (0-1)
    overall_quality_score: float = 0.5
    tabpfn_suitability_score: float = 0.0
    tree_model_suitability_score: float = 0.5
    linear_model_suitability_score: float = 0.5

    # Feature type breakdown
    feature_types: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert profile to dictionary for JSON serialization."""
        return {
            "n_samples": self.n_samples,
            "n_features": self.n_features,
            "n_numeric_features": self.n_numeric_features,
            "n_categorical_features": self.n_categorical_features,
            "n_classes": self.n_classes,
            "class_balance_ratio": round(self.class_balance_ratio, 4),
            "is_severely_imbalanced": self.is_severely_imbalanced,
            "class_distribution": self.class_distribution,
            "missing_ratio": round(self.missing_ratio, 4),
            "features_with_missing": self.features_with_missing,
            "max_missing_per_feature": round(self.max_missing_per_feature, 4),
            "has_outliers": self.has_outliers,
            "outlier_ratio": round(self.outlier_ratio, 4),
            "max_cardinality": self.max_cardinality,
            "avg_cardinality": round(self.avg_cardinality, 2),
            "high_cardinality_features": self.high_cardinality_features,
            "max_feature_correlation": round(self.max_feature_correlation, 4),
            "highly_correlated_pairs": self.highly_correlated_pairs,
            "target_correlation_max": round(self.target_correlation_max, 4),
            "overall_quality_score": round(self.overall_quality_score, 3),
            "tabpfn_suitability_score": round(self.tabpfn_suitability_score, 3),
            "tree_model_suitability_score": round(self.tree_model_suitability_score, 3),
            "linear_model_suitability_score": round(self.linear_model_suitability_score, 3),
            "numeric_stats": self.numeric_stats,
            "categorical_stats": self.categorical_stats,
        }


class DatasetProfilerService:
    """
    Service for comprehensive dataset analysis.

    Analyzes datasets to extract characteristics useful for:
    - Model selection routing
    - Data quality assessment
    - Preprocessing recommendations
    """

    # TabPFN constraints
    TABPFN_MAX_SAMPLES = 1000
    TABPFN_MAX_FEATURES = 100
    TABPFN_MAX_CLASSES = 10

    # Thresholds
    SEVERE_IMBALANCE_THRESHOLD = 0.1
    HIGH_CARDINALITY_THRESHOLD = 20
    HIGH_CORRELATION_THRESHOLD = 0.8
    OUTLIER_IQR_MULTIPLIER = 1.5

    def analyze_dataset(
        self,
        df: pd.DataFrame,
        target_column: str = "left",
        feature_columns: Optional[List[str]] = None
    ) -> DatasetProfile:
        """
        Perform comprehensive dataset analysis.

        Args:
            df: Input DataFrame
            target_column: Name of the target variable column
            feature_columns: Optional list of feature columns (auto-detected if None)

        Returns:
            DatasetProfile with all computed characteristics
        """
        logger.info(f"Analyzing dataset with {len(df)} samples")

        # Separate features and target
        if target_column in df.columns:
            y = df[target_column]
            X = df.drop(columns=[target_column])
        else:
            y = pd.Series([0] * len(df))  # Dummy if no target
            X = df

        if feature_columns:
            X = X[feature_columns]

        # Identify feature types
        numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = X.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

        # Initialize profile
        profile = DatasetProfile(
            n_samples=len(df),
            n_features=len(X.columns),
            n_numeric_features=len(numeric_cols),
            n_categorical_features=len(categorical_cols),
            n_classes=0,
            class_balance_ratio=1.0,
            is_severely_imbalanced=False,
            missing_ratio=0.0,
            features_with_missing=0,
            max_missing_per_feature=0.0,
        )

        # Compute all characteristics
        self._compute_class_distribution(y, profile)
        self._compute_missing_data(X, profile)
        self._compute_numeric_stats(X, numeric_cols, profile)
        self._compute_categorical_stats(X, categorical_cols, profile)
        self._detect_outliers(X, numeric_cols, profile)
        self._compute_correlations(X, y, numeric_cols, profile)
        self._compute_feature_types(X, profile)

        # Compute suitability scores
        self._compute_suitability_scores(profile)

        # Compute overall quality score
        self._compute_quality_score(profile)

        logger.info(
            f"Dataset profile complete: {profile.n_samples} samples, "
            f"{profile.n_features} features, "
            f"TabPFN suitability: {profile.tabpfn_suitability_score:.2f}"
        )

        return profile

    def _compute_class_distribution(
        self,
        y: pd.Series,
        profile: DatasetProfile
    ) -> None:
        """Compute class distribution and imbalance metrics."""
        if y is None or len(y) == 0:
            return

        # Convert to numeric if needed
        if y.dtype == "object" or y.dtype == "bool":
            y = y.astype(str)

        value_counts = y.value_counts()
        profile.n_classes = len(value_counts)
        profile.class_distribution = value_counts.to_dict()

        if profile.n_classes >= 2:
            minority_count = value_counts.min()
            majority_count = value_counts.max()
            profile.class_balance_ratio = minority_count / max(majority_count, 1)
            profile.is_severely_imbalanced = profile.class_balance_ratio < self.SEVERE_IMBALANCE_THRESHOLD

    def _compute_missing_data(
        self,
        X: pd.DataFrame,
        profile: DatasetProfile
    ) -> None:
        """Compute missing data statistics."""
        total_cells = X.size
        missing_per_col = X.isnull().sum()
        total_missing = missing_per_col.sum()

        profile.missing_ratio = total_missing / max(total_cells, 1)
        profile.features_with_missing = (missing_per_col > 0).sum()

        if len(X) > 0:
            missing_ratios = missing_per_col / len(X)
            profile.max_missing_per_feature = float(missing_ratios.max()) if len(missing_ratios) > 0 else 0.0
            profile.missing_per_feature = {
                col: round(float(ratio), 4)
                for col, ratio in missing_ratios.items()
                if ratio > 0
            }

    def _compute_numeric_stats(
        self,
        X: pd.DataFrame,
        numeric_cols: List[str],
        profile: DatasetProfile
    ) -> None:
        """Compute statistics for numeric features."""
        if not numeric_cols:
            return

        X_numeric = X[numeric_cols]
        numeric_stats = {}

        for col in numeric_cols:
            col_data = X_numeric[col].dropna()
            if len(col_data) == 0:
                continue

            try:
                col_stats = {
                    "mean": float(col_data.mean()),
                    "std": float(col_data.std()),
                    "min": float(col_data.min()),
                    "max": float(col_data.max()),
                    "median": float(col_data.median()),
                    "q25": float(col_data.quantile(0.25)),
                    "q75": float(col_data.quantile(0.75)),
                }

                # Skewness and kurtosis (require enough samples)
                if len(col_data) >= 8:
                    col_stats["skewness"] = float(stats.skew(col_data))
                    col_stats["kurtosis"] = float(stats.kurtosis(col_data))
                else:
                    col_stats["skewness"] = 0.0
                    col_stats["kurtosis"] = 0.0

                numeric_stats[col] = col_stats
            except Exception as e:
                logger.warning(f"Error computing stats for {col}: {e}")
                continue

        profile.numeric_stats = numeric_stats

    def _compute_categorical_stats(
        self,
        X: pd.DataFrame,
        categorical_cols: List[str],
        profile: DatasetProfile
    ) -> None:
        """Compute statistics for categorical features."""
        if not categorical_cols:
            return

        categorical_stats = {}
        cardinalities = []

        for col in categorical_cols:
            col_data = X[col].dropna()
            n_unique = col_data.nunique()
            cardinalities.append(n_unique)

            value_counts = col_data.value_counts()
            top_values = value_counts.head(5).to_dict()

            categorical_stats[col] = {
                "cardinality": n_unique,
                "top_values": {str(k): int(v) for k, v in top_values.items()},
                "mode": str(value_counts.index[0]) if len(value_counts) > 0 else None,
                "mode_frequency": float(value_counts.iloc[0] / len(col_data)) if len(col_data) > 0 else 0.0,
            }

        profile.categorical_stats = categorical_stats

        if cardinalities:
            profile.max_cardinality = max(cardinalities)
            profile.avg_cardinality = sum(cardinalities) / len(cardinalities)
            profile.high_cardinality_features = sum(
                1 for c in cardinalities if c > self.HIGH_CARDINALITY_THRESHOLD
            )

    def _detect_outliers(
        self,
        X: pd.DataFrame,
        numeric_cols: List[str],
        profile: DatasetProfile
    ) -> None:
        """Detect outliers using IQR method."""
        if not numeric_cols or len(X) < 4:
            return

        total_outliers = 0
        total_values = 0
        outlier_features = []

        for col in numeric_cols:
            col_data = X[col].dropna()
            if len(col_data) < 4:
                continue

            Q1 = col_data.quantile(0.25)
            Q3 = col_data.quantile(0.75)
            IQR = Q3 - Q1

            lower_bound = Q1 - self.OUTLIER_IQR_MULTIPLIER * IQR
            upper_bound = Q3 + self.OUTLIER_IQR_MULTIPLIER * IQR

            outliers = ((col_data < lower_bound) | (col_data > upper_bound)).sum()
            if outliers > 0:
                outlier_features.append(col)
                total_outliers += outliers

            total_values += len(col_data)

        profile.has_outliers = total_outliers > 0
        profile.outlier_ratio = total_outliers / max(total_values, 1)
        profile.outlier_features = outlier_features

    def _compute_correlations(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        numeric_cols: List[str],
        profile: DatasetProfile
    ) -> None:
        """Compute correlation analysis."""
        if len(numeric_cols) < 2:
            return

        try:
            X_numeric = X[numeric_cols].dropna()
            if len(X_numeric) < 10:
                return

            # Feature-feature correlations
            corr_matrix = X_numeric.corr()

            # Find max correlation (excluding diagonal)
            corr_values = []
            highly_correlated = 0

            for i, col1 in enumerate(numeric_cols):
                for j, col2 in enumerate(numeric_cols):
                    if i < j and col1 in corr_matrix.columns and col2 in corr_matrix.columns:
                        corr = abs(corr_matrix.loc[col1, col2])
                        if not np.isnan(corr):
                            corr_values.append(corr)
                            if corr > self.HIGH_CORRELATION_THRESHOLD:
                                highly_correlated += 1

            if corr_values:
                profile.max_feature_correlation = max(corr_values)
                profile.highly_correlated_pairs = highly_correlated

            # Target correlations
            if y is not None and len(y) == len(X):
                y_numeric = pd.to_numeric(y, errors="coerce")
                if not y_numeric.isna().all():
                    target_corrs = []
                    for col in numeric_cols:
                        if col in X.columns:
                            try:
                                corr = abs(X[col].corr(y_numeric))
                                if not np.isnan(corr):
                                    target_corrs.append(corr)
                            except Exception:
                                continue

                    if target_corrs:
                        profile.target_correlation_max = max(target_corrs)

        except Exception as e:
            logger.warning(f"Error computing correlations: {e}")

    def _compute_feature_types(
        self,
        X: pd.DataFrame,
        profile: DatasetProfile
    ) -> None:
        """Classify feature types."""
        feature_types = {}

        for col in X.columns:
            dtype = X[col].dtype

            if pd.api.types.is_numeric_dtype(dtype):
                if X[col].nunique() <= 2:
                    feature_types[col] = "binary"
                elif X[col].nunique() <= 10:
                    feature_types[col] = "ordinal"
                else:
                    feature_types[col] = "continuous"
            elif pd.api.types.is_bool_dtype(dtype):
                feature_types[col] = "binary"
            else:
                feature_types[col] = "categorical"

        profile.feature_types = feature_types

    def _compute_suitability_scores(self, profile: DatasetProfile) -> None:
        """
        Compute suitability scores for different model types.

        Each score is 0-1 where higher means more suitable.
        """
        # TabPFN suitability
        profile.tabpfn_suitability_score = self._score_tabpfn_suitability(profile)

        # Tree model suitability (XGBoost, Random Forest)
        profile.tree_model_suitability_score = self._score_tree_suitability(profile)

        # Linear model suitability (Logistic Regression)
        profile.linear_model_suitability_score = self._score_linear_suitability(profile)

    def _score_tabpfn_suitability(self, profile: DatasetProfile) -> float:
        """
        Score how suitable the dataset is for TabPFN.

        TabPFN works best with:
        - Small datasets (< 1000 samples)
        - Limited features (< 100)
        - Binary or few classes (< 10)
        """
        score = 1.0

        # Sample size constraint (hard limit at 1000)
        if profile.n_samples > self.TABPFN_MAX_SAMPLES:
            score = 0.0  # Hard constraint - TabPFN cannot handle
        elif profile.n_samples > 500:
            # Slight penalty for approaching limit
            score *= 1.0 - (profile.n_samples - 500) / 1000

        # Feature constraint (hard limit at 100)
        if profile.n_features > self.TABPFN_MAX_FEATURES:
            score = 0.0
        elif profile.n_features > 50:
            score *= 1.0 - (profile.n_features - 50) / 100

        # Class constraint
        if profile.n_classes > self.TABPFN_MAX_CLASSES:
            score = 0.0
        elif profile.n_classes > 5:
            score *= 0.9

        # TabPFN handles missing data poorly
        if profile.missing_ratio > 0.1:
            score *= 0.7
        elif profile.missing_ratio > 0.05:
            score *= 0.9

        # TabPFN is great for small, clean datasets
        if profile.n_samples < 300 and profile.missing_ratio < 0.01:
            score = min(1.0, score * 1.2)

        return max(0.0, min(1.0, score))

    def _score_tree_suitability(self, profile: DatasetProfile) -> float:
        """
        Score how suitable the dataset is for tree-based models.

        Tree models (XGBoost, RF) work well with:
        - Large datasets
        - High cardinality categoricals
        - Non-linear relationships
        - Imbalanced classes (with proper handling)
        """
        score = 0.7  # Base score - trees are generally reliable

        # Larger datasets favor tree models
        if profile.n_samples > 10000:
            score += 0.15
        elif profile.n_samples > 5000:
            score += 0.1
        elif profile.n_samples > 1000:
            score += 0.05

        # Tree models handle high cardinality well
        if profile.high_cardinality_features > 0:
            score += 0.1

        # Trees handle imbalanced data (with proper weighting)
        if profile.is_severely_imbalanced:
            score += 0.05  # XGBoost has scale_pos_weight

        # Trees can handle some missing data
        if profile.missing_ratio > 0 and profile.missing_ratio < 0.2:
            score += 0.05

        # Trees capture non-linear patterns
        # (proxy: low linear correlation with target)
        if profile.target_correlation_max < 0.5:
            score += 0.05

        return max(0.0, min(1.0, score))

    def _score_linear_suitability(self, profile: DatasetProfile) -> float:
        """
        Score how suitable the dataset is for linear models.

        Linear models work well with:
        - Linear relationships
        - Low feature count
        - Interpretability needs
        - Well-scaled features
        """
        score = 0.5  # Base score

        # Strong target correlations favor linear models
        if profile.target_correlation_max > 0.7:
            score += 0.25
        elif profile.target_correlation_max > 0.5:
            score += 0.15

        # Fewer features favor interpretability
        if profile.n_features < 20:
            score += 0.15
        elif profile.n_features < 50:
            score += 0.05

        # Low multicollinearity is good for linear models
        if profile.max_feature_correlation < 0.7:
            score += 0.1

        # High cardinality is challenging for linear models
        if profile.high_cardinality_features > 3:
            score -= 0.2

        # Outliers can affect linear models
        if profile.outlier_ratio > 0.1:
            score -= 0.15

        # Missing data requires imputation
        if profile.missing_ratio > 0.1:
            score -= 0.1

        return max(0.0, min(1.0, score))

    def _compute_quality_score(self, profile: DatasetProfile) -> None:
        """
        Compute overall data quality score.

        Considers:
        - Missing data
        - Class balance
        - Outliers
        - Sample size
        """
        score = 1.0

        # Penalize missing data
        if profile.missing_ratio > 0.2:
            score -= 0.3
        elif profile.missing_ratio > 0.1:
            score -= 0.15
        elif profile.missing_ratio > 0.05:
            score -= 0.05

        # Penalize severe imbalance
        if profile.is_severely_imbalanced:
            score -= 0.15
        elif profile.class_balance_ratio < 0.3:
            score -= 0.05

        # Penalize high outlier ratio
        if profile.outlier_ratio > 0.1:
            score -= 0.1
        elif profile.outlier_ratio > 0.05:
            score -= 0.05

        # Penalize very small datasets
        if profile.n_samples < 100:
            score -= 0.2
        elif profile.n_samples < 500:
            score -= 0.1

        # Bonus for clean, sizeable dataset
        if profile.missing_ratio < 0.01 and profile.n_samples > 1000:
            score = min(1.0, score + 0.1)

        profile.overall_quality_score = max(0.0, min(1.0, score))


# Singleton instance
dataset_profiler = DatasetProfilerService()
