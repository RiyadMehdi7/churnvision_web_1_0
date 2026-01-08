from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import pickle
import logging

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, brier_score_loss,
    precision_recall_curve
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.inspection import permutation_importance
from sklearn.model_selection import StratifiedKFold, RandomizedSearchCV

# SMOTE for handling class imbalance
try:
    from imblearn.over_sampling import SMOTE, ADASYN
    from imblearn.combine import SMOTETomek
    SMOTE_AVAILABLE = True
except ImportError:
    SMOTE_AVAILABLE = False

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.schemas.churn import (
    ChurnPredictionRequest,
    ChurnPredictionResponse,
    ChurnRiskLevel,
    ModelTrainingRequest,
    ModelTrainingResponse,
    EmployeeChurnFeatures,
    BatchChurnPredictionRequest,
    BatchChurnPredictionResponse,
)
from app.core.config import settings
from app.models.hr_data import HRDataInput
from app.core.artifact_crypto import encrypt_blob, decrypt_blob, ArtifactCryptoError

# Import model routing services
from app.services.ml.dataset_profiler_service import DatasetProfilerService, DatasetProfile
from app.services.ml.model_router_service import ModelRouterService, ModelRecommendation
from app.services.ml.tabpfn_service import TabPFNWrapper, is_tabpfn_available, compute_permutation_importance
from app.services.ml.ensemble_service import EnsembleService, EnsembleConfig
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service, DatasetThresholds
from app.services.ml.model_drift_service import model_drift_service

logger = logging.getLogger(__name__)

# Try to import SHAP (optional but recommended)
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logger.warning("SHAP not available - using rule-based explanations")


# =============================================================================
# Counterfactual Analysis Dataclasses
# =============================================================================


@dataclass
class PerturbableFeature:
    """Metadata about a feature that can be modified in counterfactual analysis."""
    name: str
    label: str
    current_value: Any
    type: str  # 'float', 'int', 'bool', 'categorical'
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    options: Optional[List[str]] = None  # For categorical
    description: str = ""
    impact_direction: str = "lower_is_better"  # or 'higher_is_better'


@dataclass
class CounterfactualResult:
    """Result of a counterfactual simulation using real model predictions."""
    scenario_name: str
    scenario_id: str

    # Baseline metrics (from actual model prediction)
    baseline_churn_prob: float
    baseline_risk_level: str
    baseline_eltv: float
    baseline_confidence: float
    baseline_factors: List[Dict[str, Any]]

    # Scenario metrics (from actual model prediction with modifications)
    scenario_churn_prob: float
    scenario_risk_level: str
    scenario_eltv: float
    scenario_confidence: float
    scenario_factors: List[Dict[str, Any]]

    # Delta calculations
    churn_delta: float  # Negative = improvement
    eltv_delta: float   # Positive = improvement

    # ROI metrics
    implied_annual_cost: float
    implied_roi: float

    # Survival projections
    baseline_survival_probs: Dict[str, float] = field(default_factory=dict)
    scenario_survival_probs: Dict[str, float] = field(default_factory=dict)

    # What was modified
    modifications: Dict[str, Any] = field(default_factory=dict)

    # Metadata
    simulated_at: datetime = field(default_factory=datetime.utcnow)
    prediction_method: str = "model"  # 'model' or 'heuristic'


class ChurnPredictionService:
    """Service for employee churn prediction using ML models"""

    # Feature names used for training and prediction
    FEATURE_NAMES = [
        'satisfaction_level', 'last_evaluation', 'number_project',
        'average_monthly_hours', 'time_spend_company', 'work_accident',
        'promotion_last_5years', 'department', 'salary_level'
    ]

    # Default categorical values for encoding when model is not trained
    # These are used for fallback encoding in counterfactual simulations
    DEPARTMENT_CATEGORIES = [
        'sales', 'accounting', 'hr', 'technical', 'support', 'management',
        'IT', 'product_mng', 'marketing', 'RandD', 'engineering', 'finance',
        'operations', 'legal', 'unknown'
    ]
    SALARY_CATEGORIES = ['low', 'medium', 'high']

    def __init__(self):
        self.model = None
        self.calibrated_model = None  # For probability calibration
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.feature_importance = {}
        self.feature_importance_by_dataset: Dict[str, Dict[str, float]] = {}
        self.model_metrics = {}
        self.model_metrics_by_dataset: Dict[str, Dict[str, Any]] = {}
        self.training_progress: Dict[str, Dict[str, Any]] = {}
        self.active_version: Optional[str] = None
        self.active_dataset_id: Optional[str] = None

        # Optimal classification threshold (learned from training data)
        self.optimal_threshold: float = 0.5  # Default, updated during training
        self.optimal_threshold_by_dataset: Dict[str, float] = {}
        self.thresholds_by_dataset: Dict[str, Dict[str, float]] = {}  # Stores {'high': x, 'medium': y}

        # SHAP explainer for model interpretability
        self.shap_explainer = None

        # Data-driven thresholds service (NO hardcoded values)
        # All thresholds are computed from user's data percentiles
        self.thresholds_service = data_driven_thresholds_service

        # Model routing services (intelligent model selection)
        self.dataset_profiler = DatasetProfilerService()
        self.model_router = ModelRouterService()
        self.ensemble_service = EnsembleService()

        # Store routing decisions for introspection
        self.last_routing_decision: Optional[ModelRecommendation] = None
        self.last_dataset_profile: Optional[DatasetProfile] = None
        self.ensemble_config: Optional[EnsembleConfig] = None

        model_dir = Path(settings.MODELS_DIR)
        self.model_path = model_dir / "churn_model.pkl"
        self.scaler_path = model_dir / "scaler.pkl"
        self.encoders_path = model_dir / "encoders.pkl"
        self.models_dir = model_dir

        # Ensure models directory exists
        self.model_path.parent.mkdir(parents=True, exist_ok=True)

        # Load existing model if available (default/global)
        self._load_model_for_dataset(None)

    def _artifact_paths(self, dataset_id: Optional[str]) -> tuple[Path, Path, Path]:
        """Return paths for model artifacts, scoped by dataset when provided."""
        if dataset_id:
            dataset_dir = self.models_dir / dataset_id
            dataset_dir.mkdir(parents=True, exist_ok=True)
            return (
                dataset_dir / "churn_model.pkl",
                dataset_dir / "scaler.pkl",
                dataset_dir / "encoders.pkl",
            )
        return self.model_path, self.scaler_path, self.encoders_path

    def _load_model_for_dataset(self, dataset_id: Optional[str]) -> bool:
        """Load saved model, scaler, encoders, and optimal threshold for a dataset."""
        model_path, scaler_path, encoders_path = self._artifact_paths(dataset_id)
        try:
            if model_path.exists():
                with open(model_path, 'rb') as f:
                    model_bytes = decrypt_blob(f.read())
                    loaded_data = pickle.loads(model_bytes)

                # Handle both old format (just model) and new format (model bundle)
                if isinstance(loaded_data, dict) and 'model' in loaded_data:
                    self.model = loaded_data['model']
                    self.optimal_threshold = loaded_data.get('optimal_threshold', 0.5)
                    self.calibrated_model = loaded_data.get('calibrated_model', None)
                    logger.info(f"Loaded model bundle with optimal_threshold={self.optimal_threshold:.3f}")
                else:
                    # Legacy format - model saved directly
                    self.model = loaded_data
                    self.optimal_threshold = 0.5
                    self.calibrated_model = None
                    logger.info("Loaded legacy model format, using default threshold=0.5")

                with open(scaler_path, 'rb') as f:
                    scaler_bytes = decrypt_blob(f.read())
                    self.scaler = pickle.loads(scaler_bytes)

                with open(encoders_path, 'rb') as f:
                    encoders_bytes = decrypt_blob(f.read())
                    self.label_encoders = pickle.loads(encoders_bytes)

                self.active_version = model_path.stem
                self.active_dataset_id = dataset_id

                # Restore cached metrics and threshold if we have them
                cache_key = dataset_id or "default"
                if cache_key in self.model_metrics_by_dataset:
                    self.model_metrics = self.model_metrics_by_dataset[cache_key]
                if cache_key in self.feature_importance_by_dataset:
                    self.feature_importance = self.feature_importance_by_dataset[cache_key]
                if cache_key in self.optimal_threshold_by_dataset:
                    self.optimal_threshold = self.optimal_threshold_by_dataset[cache_key]
                return True
            else:
                if settings.ENVIRONMENT == "production" and dataset_id:
                    # If dataset-specific artifacts are missing in prod, fail fast
                    raise RuntimeError(f"Model artifacts missing for dataset {dataset_id}. Train the model first.")
                # In development or when no dataset provided, initialize default model
                self._initialize_default_model()
                self.active_version = "dev-default"
                self.active_dataset_id = dataset_id
                return False
        except Exception as e:
            if isinstance(e, ArtifactCryptoError):
                logger.error(f"Artifact decryption failed for dataset {dataset_id}: {e}")
            else:
                logger.warning(f"Error loading model for dataset {dataset_id}: {e}")
            if settings.ENVIRONMENT == "production":
                raise
            self._initialize_default_model()
            self.active_version = "dev-default"
            self.active_dataset_id = dataset_id
            return False

    def _initialize_default_model(self):
        """Initialize a default XGBoost model with typical parameters"""
        self.model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )

        # Initialize empty label encoders for categorical features
        # These will be fitted dynamically during training with user's actual data
        self.label_encoders = {
            'department': LabelEncoder(),
            'salary_level': LabelEncoder()
        }
        # Note: Encoders are NOT pre-fitted - they will learn categories from training data
        self.model_metrics = {}

    def _is_model_fitted(self) -> bool:
        """Check if the model is actually trained and ready for predictions."""
        if self.model is None:
            return False

        # For XGBoost, check if booster exists (indicates model is fitted)
        if isinstance(self.model, xgb.XGBClassifier):
            try:
                # XGBoost models have a booster after fitting
                _ = self.model.get_booster()
                return True
            except Exception:
                return False

        # For scikit-learn models, check for classes_ attribute
        if hasattr(self.model, 'classes_'):
            return True

        # For calibrated models
        if isinstance(self.model, CalibratedClassifierCV):
            return hasattr(self.model, 'calibrated_classifiers_')

        # Default: assume fitted if model exists
        return True

    def ensure_model_for_dataset(self, dataset_id: Optional[str]) -> None:
        """Load the appropriate model artifacts for the given dataset if needed."""
        target_dataset = dataset_id or None

        # If already loaded for this dataset, nothing to do
        if self.model is not None and self.active_dataset_id == target_dataset:
            return

        # Try loading dataset-scoped artifacts; fallback to default if missing
        loaded = self._load_model_for_dataset(target_dataset)
        if not loaded and settings.ENVIRONMENT != "production":
            # In dev, ensure we at least have a default model ready
            self._initialize_default_model()
            self.active_dataset_id = target_dataset

    def update_training_progress(self, dataset_id: str, status: str, progress: int, message: str, job_id: Optional[int] = None):
        """Track training progress in memory for polling endpoints."""
        self.training_progress[dataset_id] = {
            "status": status,
            "progress": max(0, min(progress, 100)),
            "message": message,
            "job_id": job_id,
            "updated_at": datetime.utcnow(),
        }

    def _save_model(self, dataset_id: Optional[str] = None):
        """Save model, scaler, encoders, and optimal threshold to disk (scoped per dataset)."""
        model_path, scaler_path, encoders_path = self._artifact_paths(dataset_id)
        try:
            # Save model with optimal threshold embedded
            model_bundle = {
                'model': self.model,
                'optimal_threshold': self.optimal_threshold,
                'calibrated_model': self.calibrated_model,
            }
            with open(model_path, 'wb') as f:
                f.write(encrypt_blob(pickle.dumps(model_bundle)))

            with open(scaler_path, 'wb') as f:
                f.write(encrypt_blob(pickle.dumps(self.scaler)))

            with open(encoders_path, 'wb') as f:
                f.write(encrypt_blob(pickle.dumps(self.label_encoders)))

            logger.info(f"Model saved with optimal_threshold={self.optimal_threshold:.3f}")
        except Exception as e:
            logger.error(f"Error saving model for dataset {dataset_id}: {e}")
            if settings.ENVIRONMENT == "production":
                raise

    def _prepare_features(self, features: EmployeeChurnFeatures) -> np.ndarray:
        """Convert employee features to model input format"""
        # Encode categorical variables with fallback for unfitted encoders
        department_encoded = self._safe_encode_single(
            features.department,
            self.label_encoders['department'],
            self.DEPARTMENT_CATEGORIES
        )
        salary_encoded = self._safe_encode_single(
            features.salary_level,
            self.label_encoders['salary_level'],
            self.SALARY_CATEGORIES
        )

        # Create feature array in the correct order
        feature_array = np.array([[
            features.satisfaction_level,
            features.last_evaluation,
            features.number_project,
            features.average_monthly_hours,
            features.time_spend_company,
            int(features.work_accident),
            int(features.promotion_last_5years),
            department_encoded,
            salary_encoded
        ]])

        # Scale features with fallback for unfitted scaler
        if not hasattr(self.scaler, 'mean_') or self.scaler.mean_ is None:
            # Scaler not fitted - use reasonable defaults based on typical HR data ranges
            # This is a fallback for counterfactual simulations when model isn't trained
            default_means = np.array([0.6, 0.7, 4.0, 200.0, 3.5, 0.15, 0.02, 4.0, 1.0])
            default_scales = np.array([0.25, 0.2, 1.5, 50.0, 2.0, 0.35, 0.14, 3.0, 0.8])
            self.scaler.mean_ = default_means
            self.scaler.scale_ = default_scales
            self.scaler.var_ = default_scales ** 2
            self.scaler.n_features_in_ = 9
            self.scaler.n_samples_seen_ = 1
            logger.debug("Using default scaler parameters for unfitted scaler")

        feature_array_scaled = self.scaler.transform(feature_array)

        return feature_array_scaled

    def _determine_risk_level(self, probability: float, dataset_id: Optional[str] = None) -> ChurnRiskLevel:
        """Determine risk level based on churn probability using data-driven thresholds."""
        # Use data-driven thresholds computed from user's actual data
        risk_level = self.thresholds_service.get_risk_level(probability, dataset_id)

        if risk_level == 'high':
            return ChurnRiskLevel.HIGH
        elif risk_level == 'medium':
            return ChurnRiskLevel.MEDIUM
        else:
            return ChurnRiskLevel.LOW

    def _safe_encode_single(self, value: str, encoder: LabelEncoder, default_categories: List[str]) -> int:
        """
        Encode a single categorical value with fallback for unfitted encoders.

        Args:
            value: The categorical value to encode
            encoder: The LabelEncoder instance (may or may not be fitted)
            default_categories: Fallback categories to use if encoder is not fitted

        Returns:
            Integer encoded value
        """
        # Normalize the value
        normalized_value = str(value).lower().strip() if value else "unknown"

        # Check if encoder is fitted
        if not hasattr(encoder, "classes_") or len(encoder.classes_) == 0:
            # Encoder not fitted - fit it with default categories
            encoder.fit(default_categories)
            logger.debug(f"Fitted encoder with default categories: {default_categories}")

        # Get known classes
        known_classes = set(c.lower() if isinstance(c, str) else str(c) for c in encoder.classes_)

        # Handle unknown values by mapping to first known class
        if normalized_value not in known_classes:
            # Try exact match first
            exact_match = [c for c in encoder.classes_ if str(c).lower() == normalized_value]
            if exact_match:
                return int(encoder.transform([exact_match[0]])[0])

            # Fallback to first class
            fallback = encoder.classes_[0]
            logger.debug(f"Unknown value '{value}' mapped to fallback '{fallback}'")
            return int(encoder.transform([fallback])[0])

        # Find the matching class (case-insensitive)
        matching_class = next(
            (c for c in encoder.classes_ if str(c).lower() == normalized_value),
            encoder.classes_[0]
        )
        return int(encoder.transform([matching_class])[0])

    def _safe_encode_series(self, series: pd.Series, encoder: LabelEncoder) -> np.ndarray:
        """Encode categorical series with fallback for unseen values."""
        if not hasattr(encoder, "classes_") or len(encoder.classes_) == 0:
            return encoder.fit_transform(series.fillna("unknown").astype(str))

        fallback = encoder.classes_[0]
        known = set(encoder.classes_.tolist())
        normalized = [
            val if val in known else fallback
            for val in series.fillna(fallback).astype(str)
        ]
        return encoder.transform(normalized)

    def _get_shap_values_batch(self, features_array: np.ndarray):
        """Return SHAP values for a batch or None on failure."""
        if not SHAP_AVAILABLE or self.shap_explainer is None:
            return None
        try:
            shap_values = self.shap_explainer.shap_values(features_array)
            if isinstance(shap_values, list):
                shap_values = shap_values[1]
            return shap_values
        except Exception as e:
            logger.warning(f"SHAP batch explanation failed: {e}")
            return None

    def _build_factors_from_shap_row(self, shap_row: np.ndarray, feature_values: List[Any]) -> List[Dict[str, Any]]:
        """Create contributing factors list from a single SHAP row."""
        factors: List[Dict[str, Any]] = []
        for name, value, shap_val in zip(self.FEATURE_NAMES, feature_values, shap_row):
            # Ensure shap_val is a scalar (not an array)
            if hasattr(shap_val, 'item'):
                shap_val = shap_val.item()
            elif isinstance(shap_val, np.ndarray):
                shap_val = float(shap_val.flatten()[0])
            else:
                shap_val = float(shap_val)

            abs_impact = abs(shap_val)
            if abs_impact <= 0.01:
                continue
            factors.append({
                "feature": name,
                "value": value,
                "shap_value": float(shap_val),
                "impact": self._shap_to_impact_level(shap_val),
                "direction": "increases_risk" if shap_val > 0 else "decreases_risk",
                "message": self._generate_shap_message(name, value, shap_val)
            })
        factors.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
        return factors[:5]

    def calculate_prediction_confidence(
        self,
        features_array: np.ndarray,
        probability: float
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calculate model confidence based on:
        1. Tree Agreement (60%): How much individual trees agree on the prediction
        2. Prediction Margin (40%): Distance from decision boundary (0.5)

        Returns:
            Tuple of (confidence_score, breakdown_dict)
        """
        breakdown = {}

        # Component 1: Prediction Margin
        # How far from 50/50 uncertainty
        margin = abs(probability - 0.5) * 2  # Scale to 0-1
        breakdown['prediction_margin'] = margin

        # Component 2: Tree Agreement
        # Measure variance across individual tree predictions
        tree_agreement = self._calculate_tree_agreement(features_array)
        breakdown['tree_agreement'] = tree_agreement

        # Final confidence: weighted combination
        # Weights are adaptive based on model type - tree-based models weight agreement more
        if isinstance(self.model, (xgb.XGBClassifier, RandomForestClassifier)):
            # Tree-based models: tree agreement is more informative
            tree_weight = 0.6
        else:
            # Non-tree models: rely more on prediction margin
            tree_weight = 0.4
        margin_weight = 1.0 - tree_weight
        confidence = (tree_weight * tree_agreement) + (margin_weight * margin)

        # Ensure bounds
        confidence = max(0.0, min(1.0, confidence))
        breakdown['final_confidence'] = confidence

        return confidence, breakdown

    def _calculate_tree_agreement(self, features_array: np.ndarray) -> float:
        """
        Calculate how much individual trees in the ensemble agree.

        For XGBoost: Get predictions at different boosting iterations
        For RandomForest: Get predictions from individual trees
        For other models: Return moderate confidence (0.7)

        Low variance = high agreement = high confidence
        High variance = trees disagree = low confidence
        """
        if self.model is None:
            return 0.5  # No model, moderate confidence

        try:
            if isinstance(self.model, xgb.XGBClassifier):
                return self._xgboost_tree_agreement(features_array)
            elif isinstance(self.model, RandomForestClassifier):
                return self._random_forest_tree_agreement(features_array)
            else:
                # For other models (LogisticRegression, etc.), use prediction margin only
                return 0.7  # Default moderate-high confidence
        except Exception as e:
            print(f"Error calculating tree agreement: {e}")
            return 0.5

    def _xgboost_tree_agreement(self, features_array: np.ndarray) -> float:
        """
        Calculate tree agreement for XGBoost by getting predictions
        at different boosting iterations and measuring variance.
        """
        try:
            booster = self.model.get_booster()
            n_trees = booster.num_boosted_rounds()

            if n_trees <= 1:
                return 0.7  # Single tree, can't measure agreement

            # Sample predictions at different iteration checkpoints
            # Use ~10 checkpoints for efficiency
            n_checkpoints = min(10, n_trees)
            checkpoint_indices = [int(x) for x in np.linspace(1, n_trees, n_checkpoints)]

            # Convert to DMatrix for booster prediction
            dmatrix = xgb.DMatrix(features_array)

            predictions = []
            for n_iter in checkpoint_indices:
                # Get prediction using first n_iter trees
                pred = booster.predict(dmatrix, iteration_range=(0, int(n_iter)))
                predictions.append(float(pred[0]))

            # Calculate standard deviation of predictions
            predictions = np.array(predictions)
            std_dev = float(np.std(predictions))

            # Convert std to agreement score
            # Lower std = higher agreement
            # Scale: std of 0.25 or more = 0 confidence, std of 0 = 1.0 confidence
            agreement = 1.0 - min(std_dev * 4, 1.0)

            return max(0.0, min(1.0, agreement))

        except Exception as e:
            print(f"XGBoost tree agreement error: {e}")
            return 0.5

    def _random_forest_tree_agreement(self, features_array: np.ndarray) -> float:
        """
        Calculate tree agreement for RandomForest by getting predictions
        from individual trees and measuring variance.
        """
        try:
            n_trees = len(self.model.estimators_)

            if n_trees <= 1:
                return 0.7

            # Get predictions from each tree
            predictions = []
            for tree in self.model.estimators_:
                pred = tree.predict_proba(features_array)[0][1]
                predictions.append(pred)

            # Calculate standard deviation
            predictions = np.array(predictions)
            std_dev = np.std(predictions)

            # Convert std to agreement score
            agreement = 1.0 - min(std_dev * 4, 1.0)

            return max(0.0, min(1.0, agreement))

        except Exception as e:
            print(f"RandomForest tree agreement error: {e}")
            return 0.5

    def _get_shap_contributing_factors(
        self,
        features_array: np.ndarray,
        features: EmployeeChurnFeatures
    ) -> List[Dict[str, Any]]:
        """Get contributing factors using SHAP values for true model interpretability."""
        if not SHAP_AVAILABLE or self.shap_explainer is None:
            return self._get_heuristic_contributing_factors(features)

        try:
            # Get SHAP values for this prediction
            shap_values = self.shap_explainer.shap_values(features_array)

            # Handle different SHAP output formats
            if isinstance(shap_values, list):
                # Binary classification returns list of 2 arrays
                shap_values = shap_values[1]  # Use positive class

            shap_values = shap_values.flatten()

            # Map SHAP values to feature names
            feature_values = [
                features.satisfaction_level,
                features.last_evaluation,
                features.number_project,
                features.average_monthly_hours,
                features.time_spend_company,
                int(features.work_accident),
                int(features.promotion_last_5years),
                features.department,
                features.salary_level
            ]

            # Create factor list sorted by absolute SHAP value
            factors_with_shap = []
            for i, (name, value, shap_val) in enumerate(zip(
                self.FEATURE_NAMES, feature_values, shap_values
            )):
                # Ensure shap_val is a scalar (not an array)
                if hasattr(shap_val, 'item'):
                    shap_val = shap_val.item()
                elif isinstance(shap_val, np.ndarray):
                    shap_val = float(shap_val.flatten()[0])
                else:
                    shap_val = float(shap_val)

                abs_impact = abs(shap_val)
                if abs_impact > 0.01:  # Filter insignificant factors
                    factors_with_shap.append({
                        "feature": name,
                        "value": value,
                        "shap_value": float(shap_val),
                        "impact": self._shap_to_impact_level(shap_val),
                        "direction": "increases_risk" if shap_val > 0 else "decreases_risk",
                        "message": self._generate_shap_message(name, value, shap_val)
                    })

            # Sort by absolute SHAP value (most important first)
            factors_with_shap.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
            return factors_with_shap[:5]

        except Exception as e:
            logger.warning(f"SHAP explanation failed: {e}, falling back to heuristics")
            return self._get_heuristic_contributing_factors(features)

    def _shap_to_impact_level(self, shap_value: float, dataset_id: Optional[str] = None) -> str:
        """Convert SHAP value magnitude to impact level using data-driven thresholds."""
        return self.thresholds_service.get_shap_impact_level(shap_value, dataset_id)

    def _generate_shap_message(self, feature: str, value: Any, shap_val: float) -> str:
        """Generate human-readable message from SHAP explanation."""
        direction = "increases" if shap_val > 0 else "decreases"
        magnitude = abs(shap_val)

        # Safely format numeric values
        def fmt_float(v, decimals=2):
            try:
                return f"{float(v):.{decimals}f}"
            except (ValueError, TypeError):
                return str(v)

        messages = {
            "satisfaction_level": f"Satisfaction level ({fmt_float(value, 2)}) {direction} churn risk",
            "last_evaluation": f"Performance score ({fmt_float(value, 2)}) {direction} churn risk",
            "number_project": f"Project count ({value}) {direction} churn risk",
            "average_monthly_hours": f"Monthly hours ({fmt_float(value, 0)}) {direction} churn risk",
            "time_spend_company": f"Tenure ({value} years) {direction} churn risk",
            "work_accident": f"Work accident history {direction} churn risk",
            "promotion_last_5years": f"Promotion status {direction} churn risk",
            "department": f"Department ({value}) {direction} churn risk",
            "salary_level": f"Salary level ({value}) {direction} churn risk"
        }

        return messages.get(feature, f"{feature} ({value}) {direction} churn risk")

    def _get_heuristic_contributing_factors(
        self,
        features: EmployeeChurnFeatures,
        dataset_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Identify contributing factors using percentile-based analysis.

        All thresholds are derived from the user's data distribution.
        A value is flagged as anomalous if it's in the bottom/top 25% of the dataset.
        """
        factors = []

        # Check satisfaction level against data percentiles
        sat_percentile = self.thresholds_service.get_feature_percentile(
            'satisfaction_level', features.satisfaction_level, dataset_id
        )
        if sat_percentile < 10:  # Bottom 10%
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "shap_value": 0.4,
                "impact": "critical",
                "direction": "increases_risk",
                "message": f"Very low satisfaction level ({features.satisfaction_level:.2f}) - bottom {sat_percentile:.0f}%"
            })
        elif sat_percentile < 25:  # Bottom 25%
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "shap_value": 0.2,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"Low satisfaction level ({features.satisfaction_level:.2f}) - bottom {sat_percentile:.0f}%"
            })

        # Check workload against data percentiles
        hours_percentile = self.thresholds_service.get_feature_percentile(
            'average_monthly_hours', features.average_monthly_hours, dataset_id
        )
        if hours_percentile > 90:  # Top 10% - overwork
            factors.append({
                "feature": "average_monthly_hours",
                "value": features.average_monthly_hours,
                "shap_value": 0.15,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"High workload ({features.average_monthly_hours:.0f} hours/month) - top {100-hours_percentile:.0f}%"
            })

        # Check project count against data percentiles
        projects_percentile = self.thresholds_service.get_feature_percentile(
            'number_project', float(features.number_project), dataset_id
        )
        if projects_percentile > 90:  # Top 10% - too many projects
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"High project count ({features.number_project}) - top {100-projects_percentile:.0f}%"
            })
        elif projects_percentile < 10:  # Bottom 10% - too few projects
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"Low project engagement ({features.number_project}) - bottom {projects_percentile:.0f}%"
            })

        # Check evaluation against data percentiles
        eval_percentile = self.thresholds_service.get_feature_percentile(
            'last_evaluation', features.last_evaluation, dataset_id
        )
        if eval_percentile < 25:  # Bottom 25%
            factors.append({
                "feature": "last_evaluation",
                "value": features.last_evaluation,
                "shap_value": 0.2,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"Low performance evaluation ({features.last_evaluation:.2f}) - bottom {eval_percentile:.0f}%"
            })

        # Check tenure against data percentiles for promotion flag
        tenure_percentile = self.thresholds_service.get_feature_percentile(
            'time_spend_company', float(features.time_spend_company), dataset_id
        )
        if tenure_percentile > 50 and not features.promotion_last_5years:  # Above median tenure with no promotion
            factors.append({
                "feature": "promotion_last_5years",
                "value": False,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"No promotion despite {features.time_spend_company} years tenure (above median)"
            })

        # Note: salary_level is categorical - handled differently
        # The tier itself is already data-driven from the thresholds service

        return factors[:5]

    def _get_contributing_factors(self, features: EmployeeChurnFeatures, probability: float) -> List[Dict[str, Any]]:
        """Identify top contributing factors for churn risk (legacy compatibility)."""
        return self._get_heuristic_contributing_factors(features)

    def _get_recommendations(
        self,
        features: EmployeeChurnFeatures,
        factors: List[Dict[str, Any]],
        dataset_id: Optional[str] = None
    ) -> List[str]:
        """
        Generate actionable recommendations based on churn factors.

        Uses percentile-based analysis to determine what's anomalous for this dataset.
        """
        recommendations = []

        # Check satisfaction against data distribution
        sat_percentile = self.thresholds_service.get_feature_percentile(
            'satisfaction_level', features.satisfaction_level, dataset_id
        )
        if sat_percentile < 25:  # Bottom 25%
            recommendations.append("Schedule immediate one-on-one meeting to discuss employee satisfaction and concerns")

        # Check workload against data distribution
        hours_percentile = self.thresholds_service.get_feature_percentile(
            'average_monthly_hours', features.average_monthly_hours, dataset_id
        )
        if hours_percentile > 75:  # Top 25% - potential overwork
            recommendations.append("Review current workload and consider redistributing projects to reduce overtime")

        # Check project count against data distribution
        projects_percentile = self.thresholds_service.get_feature_percentile(
            'number_project', float(features.number_project), dataset_id
        )
        if projects_percentile > 75:  # Top 25%
            recommendations.append("Evaluate project assignments and potentially reduce workload")
        elif projects_percentile < 25:  # Bottom 25%
            recommendations.append("Consider increasing project involvement to boost engagement")

        # Check tenure for promotion consideration
        tenure_percentile = self.thresholds_service.get_feature_percentile(
            'time_spend_company', float(features.time_spend_company), dataset_id
        )
        if not features.promotion_last_5years and tenure_percentile > 50:  # Above median tenure
            recommendations.append("Discuss career development opportunities and potential promotion path")

        # Note: salary_level recommendations based on actual tier, not hardcoded values
        # The tier itself is already data-driven

        # Check evaluation against data distribution
        eval_percentile = self.thresholds_service.get_feature_percentile(
            'last_evaluation', features.last_evaluation, dataset_id
        )
        if eval_percentile < 25:  # Bottom 25%
            recommendations.append("Provide additional training and performance improvement support")

        if not recommendations:
            recommendations.append("Continue regular check-ins and maintain positive work environment")

        return recommendations[:5]  # Return top 5 recommendations

    async def predict_churn(self, request: ChurnPredictionRequest, dataset_id: Optional[str] = None) -> ChurnPredictionResponse:
        """Predict churn probability for a single employee"""

        # Ensure the correct model is loaded for this dataset
        self.ensure_model_for_dataset(dataset_id)

        # Prepare features
        features_array = self._prepare_features(request.features)

        # Get prediction - check if model is actually fitted, not just initialized
        if not self._is_model_fitted():
            if settings.ENVIRONMENT == "production":
                raise RuntimeError("No trained model loaded. Train a model before serving predictions.")
            # If no trained model, use heuristic-based prediction
            probability = self._heuristic_prediction(request.features, dataset_id)
            # For heuristic predictions, use margin-only confidence
            margin = abs(probability - 0.5) * 2
            confidence_score = margin
            confidence_breakdown = {
                'prediction_margin': margin,
                'tree_agreement': 0.5,  # N/A for heuristic
                'final_confidence': confidence_score,
                'method': 'heuristic'
            }
            # Use heuristic factors for untrained model
            contributing_factors = self._get_heuristic_contributing_factors(request.features, dataset_id)
        else:
            # Use calibrated model if available for better probability estimates
            if self.calibrated_model is not None:
                probability = float(self.calibrated_model.predict_proba(features_array)[0][1])
                confidence_breakdown_method = 'calibrated'
            else:
                probability = float(self.model.predict_proba(features_array)[0][1])
                confidence_breakdown_method = 'raw'

            # Calculate real confidence using tree agreement + margin
            confidence_score, confidence_breakdown = self.calculate_prediction_confidence(
                features_array, probability
            )
            confidence_breakdown['method'] = confidence_breakdown_method

            # Use SHAP-based factors if available, otherwise heuristic
            contributing_factors = self._get_shap_contributing_factors(features_array, request.features)

        # Determine risk level using data-driven thresholds
        risk_level = self._determine_risk_level(probability, dataset_id)

        # Get recommendations
        recommendations = self._get_recommendations(request.features, contributing_factors, dataset_id)

        return ChurnPredictionResponse(
            employee_id=request.employee_id,
            churn_probability=probability,
            confidence_score=confidence_score,
            confidence_breakdown=confidence_breakdown,
            risk_level=risk_level,
            contributing_factors=contributing_factors,
            recommendations=recommendations,
            predicted_at=datetime.utcnow()
        )

    def _heuristic_prediction(
        self,
        features: EmployeeChurnFeatures,
        dataset_id: Optional[str] = None
    ) -> float:
        """
        Fallback heuristic-based prediction when no model is trained.

        Uses percentile-based scoring - values in extreme percentiles contribute to risk.
        """
        score = 0.0

        # Satisfaction - weight by how low it is relative to dataset
        sat_percentile = self.thresholds_service.get_feature_percentile(
            'satisfaction_level', features.satisfaction_level, dataset_id
        )
        # Convert percentile to risk contribution (lower = higher risk)
        score += (1 - sat_percentile / 100) * 0.4

        # Evaluation - low percentile = higher risk
        eval_percentile = self.thresholds_service.get_feature_percentile(
            'last_evaluation', features.last_evaluation, dataset_id
        )
        if eval_percentile < 25:  # Bottom 25%
            score += 0.2 * (1 - eval_percentile / 25)

        # Workload - extreme percentiles are risky
        hours_percentile = self.thresholds_service.get_feature_percentile(
            'average_monthly_hours', features.average_monthly_hours, dataset_id
        )
        if hours_percentile > 75:  # High hours - overwork
            score += 0.15 * ((hours_percentile - 75) / 25)
        elif hours_percentile < 25:  # Low hours - disengagement
            score += 0.1 * ((25 - hours_percentile) / 25)

        # Projects - extreme percentiles are risky
        projects_percentile = self.thresholds_service.get_feature_percentile(
            'number_project', float(features.number_project), dataset_id
        )
        if projects_percentile > 75 or projects_percentile < 25:
            score += 0.1

        # Tenure and promotion - above median tenure without promotion
        tenure_percentile = self.thresholds_service.get_feature_percentile(
            'time_spend_company', float(features.time_spend_company), dataset_id
        )
        if tenure_percentile > 50 and not features.promotion_last_5years:
            score += 0.1 * ((tenure_percentile - 50) / 50)

        return min(score, 1.0)

    async def predict_batch(self, request: BatchChurnPredictionRequest, dataset_id: Optional[str] = None) -> BatchChurnPredictionResponse:
        """Predict churn for multiple employees"""
        predictions = []

        for pred_request in request.predictions:
            prediction = await self.predict_churn(pred_request, dataset_id)
            predictions.append(prediction)

        # Count risk levels
        high_risk = sum(1 for p in predictions if p.risk_level == ChurnRiskLevel.HIGH)
        medium_risk = sum(1 for p in predictions if p.risk_level == ChurnRiskLevel.MEDIUM)
        low_risk = sum(1 for p in predictions if p.risk_level == ChurnRiskLevel.LOW)

        return BatchChurnPredictionResponse(
            predictions=predictions,
            total_processed=len(predictions),
            high_risk_count=high_risk,
            medium_risk_count=medium_risk,
            low_risk_count=low_risk
        )

    async def predict_frame_batch(
        self,
        feature_frame: pd.DataFrame,
        dataset_id: Optional[str] = None,
        hr_codes: Optional[List[str]] = None,
        batch_size: int = 256,
    ) -> List[ChurnPredictionResponse]:
        """
        Vectorized churn prediction for a feature DataFrame.

        Preserves SHAP-based explanations by default while avoiding per-row loops.
        """
        self.ensure_model_for_dataset(dataset_id)

        feature_columns = [
            'satisfaction_level', 'last_evaluation', 'number_project',
            'average_monthly_hours', 'time_spend_company', 'work_accident',
            'promotion_last_5years', 'department', 'salary_level'
        ]

        # Fallback for untrained model: use heuristic path row-by-row (rare)
        if not self._is_model_fitted():
            results: List[ChurnPredictionResponse] = []
            for idx, row in feature_frame.iterrows():
                features_obj = EmployeeChurnFeatures(
                    satisfaction_level=float(row.get("satisfaction_level", 0.5)),
                    last_evaluation=float(row.get("last_evaluation", 0.5)),
                    number_project=int(float(row.get("number_project", 3))),
                    average_monthly_hours=float(row.get("average_monthly_hours", 160)),
                    time_spend_company=int(float(row.get("time_spend_company", 3))),
                    work_accident=bool(int(float(row.get("work_accident", 0)))),
                    promotion_last_5years=bool(int(float(row.get("promotion_last_5years", 0)))),
                    department=str(row.get("department", "general")),
                    salary_level=str(row.get("salary_level", "medium")),
                )
                prob = self._heuristic_prediction(features_obj)
                margin = abs(prob - 0.5) * 2
                factors = self._get_heuristic_contributing_factors(features_obj)
                results.append(ChurnPredictionResponse(
                    employee_id=hr_codes[idx] if hr_codes and idx < len(hr_codes) else None,
                    churn_probability=prob,
                    confidence_score=margin,
                    confidence_breakdown={
                        "prediction_margin": margin,
                        "tree_agreement": 0.5,
                        "final_confidence": margin,
                        "method": "heuristic-batch"
                    },
                    risk_level=self._determine_risk_level(prob, dataset_id),
                    contributing_factors=factors,
                    recommendations=self._get_recommendations(features_obj, factors),
                    predicted_at=datetime.utcnow()
                ))
            return results

        # Prepare numeric matrix
        base_df = feature_frame[feature_columns].copy()
        base_df['department'] = base_df['department'].fillna("unknown").astype(str)
        base_df['salary_level'] = base_df['salary_level'].fillna("medium").astype(str)

        dept_encoded = self._safe_encode_series(base_df['department'], self.label_encoders['department'])
        salary_encoded = self._safe_encode_series(base_df['salary_level'], self.label_encoders['salary_level'])

        feature_matrix = np.column_stack([
            base_df['satisfaction_level'].astype(float).values,
            base_df['last_evaluation'].astype(float).values,
            base_df['number_project'].astype(float).values,
            base_df['average_monthly_hours'].astype(float).values,
            base_df['time_spend_company'].astype(float).values,
            base_df['work_accident'].astype(float).values,
            base_df['promotion_last_5years'].astype(float).values,
            dept_encoded,
            salary_encoded
        ])

        scaled_matrix = self.scaler.transform(feature_matrix)
        results: List[ChurnPredictionResponse] = []

        for start in range(0, len(scaled_matrix), batch_size):
            end = start + batch_size
            batch_scaled = scaled_matrix[start:end]
            batch_slice_df = base_df.iloc[start:end]
            batch_hr_codes = hr_codes[start:end] if hr_codes else None

            if self.calibrated_model is not None:
                batch_proba = self.calibrated_model.predict_proba(batch_scaled)[:, 1]
                confidence_method = "calibrated-batch"
            else:
                batch_proba = self.model.predict_proba(batch_scaled)[:, 1]
                confidence_method = "raw-batch"

            shap_values = self._get_shap_values_batch(batch_scaled)

            for row_idx, prob in enumerate(batch_proba):
                margin = abs(prob - 0.5) * 2
                idx_global = start + row_idx
                feature_row = batch_slice_df.iloc[row_idx]

                if shap_values is not None:
                    factors = self._build_factors_from_shap_row(
                        shap_values[row_idx],
                        [
                            feature_row['satisfaction_level'],
                            feature_row['last_evaluation'],
                            feature_row['number_project'],
                            feature_row['average_monthly_hours'],
                            feature_row['time_spend_company'],
                            feature_row['work_accident'],
                            feature_row['promotion_last_5years'],
                            feature_row['department'],
                            feature_row['salary_level'],
                        ]
                    )
                else:
                    features_obj = EmployeeChurnFeatures(
                        satisfaction_level=float(feature_row.get("satisfaction_level", 0.5)),
                        last_evaluation=float(feature_row.get("last_evaluation", 0.5)),
                        number_project=int(float(feature_row.get("number_project", 3))),
                        average_monthly_hours=float(feature_row.get("average_monthly_hours", 160)),
                        time_spend_company=int(float(feature_row.get("time_spend_company", 3))),
                        work_accident=bool(int(float(feature_row.get("work_accident", 0)))),
                        promotion_last_5years=bool(int(float(feature_row.get("promotion_last_5years", 0)))),
                        department=str(feature_row.get("department", "general")),
                        salary_level=str(feature_row.get("salary_level", "medium")),
                    )
                    factors = self._get_heuristic_contributing_factors(features_obj)

                confidence_breakdown = {
                    "prediction_margin": margin,
                    "tree_agreement": 0.5,  # skip expensive per-row agreement in batch mode
                    "final_confidence": margin,
                    "method": confidence_method,
                }

                results.append(ChurnPredictionResponse(
                    employee_id=batch_hr_codes[row_idx] if batch_hr_codes is not None else None,
                    churn_probability=float(prob),
                    confidence_score=margin,
                    confidence_breakdown=confidence_breakdown,
                    risk_level=self._determine_risk_level(float(prob), dataset_id),
                    contributing_factors=factors,
                    recommendations=self._get_recommendations(
                        EmployeeChurnFeatures(
                            satisfaction_level=float(feature_row.get("satisfaction_level", 0.5)),
                            last_evaluation=float(feature_row.get("last_evaluation", 0.5)),
                            number_project=int(float(feature_row.get("number_project", 3))),
                            average_monthly_hours=float(feature_row.get("average_monthly_hours", 160)),
                            time_spend_company=int(float(feature_row.get("time_spend_company", 3))),
                            work_accident=bool(int(float(feature_row.get("work_accident", 0)))),
                            promotion_last_5years=bool(int(float(feature_row.get("promotion_last_5years", 0)))),
                            department=str(feature_row.get("department", "general")),
                            salary_level=str(feature_row.get("salary_level", "medium")),
                        ),
                        factors,
                    ),
                    predicted_at=datetime.utcnow()
                ))

        return results

    async def train_model(self, request: ModelTrainingRequest, training_data: pd.DataFrame, dataset_id: Optional[str] = None) -> ModelTrainingResponse:
        """Train a new churn prediction model with intelligent routing and automatic model selection."""

        # Remember which dataset this model belongs to
        self.active_dataset_id = dataset_id

        # Prepare training data
        X, y = self._prepare_training_data(training_data)

        # === COMPUTE DATA-DRIVEN THRESHOLDS ===
        # Compute all thresholds from the training data BEFORE model training
        # This ensures all downstream logic uses data-driven percentiles
        logger.info("Computing data-driven thresholds from training data...")
        self.thresholds_service.compute_thresholds_from_dataframe(
            training_data,
            dataset_id=dataset_id,
            target_column='left',
            salary_column='employee_cost' if 'employee_cost' in training_data.columns else 'salary',
            tenure_column='time_spend_company' if 'time_spend_company' in training_data.columns else 'tenure',
        )

        # === NEW: Profile dataset for intelligent model routing ===
        logger.info("Profiling dataset for model routing...")
        self.last_dataset_profile = self.dataset_profiler.analyze_dataset(
            training_data, target_column='left'
        )

        # === NEW: Get routing recommendation ===
        logger.info("Getting model routing recommendation...")
        self.last_routing_decision = self.model_router.route(self.last_dataset_profile)

        # Log deprecation warning if model_type was explicitly provided
        if request.model_type:
            logger.warning(
                f"model_type='{request.model_type}' was provided but is deprecated. "
                f"Using intelligent routing which selected: {self.last_routing_decision.primary_model}"
            )

        # Determine which model to use (from router)
        selected_model_type = self.last_routing_decision.primary_model
        use_ensemble = self.last_routing_decision.use_ensemble

        logger.info(
            f"Router selected: {selected_model_type} "
            f"(confidence: {self.last_routing_decision.confidence:.2f}, "
            f"ensemble: {use_ensemble})"
        )

        # === IMPROVEMENT 1: Proper Train/Test Split ===
        # Use stratified split to maintain class balance
        if len(X) > 50:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, stratify=y, random_state=42
            )
        else:
            # Small dataset - use all data for training
            X_train, X_test, y_train, y_test = X, X, y, y
            logger.warning(f"Small dataset ({len(X)} samples) - using all data for training")

        # === IMPROVEMENT 2: Calculate Class Imbalance ===
        n_positive = np.sum(y_train == 1)
        n_negative = np.sum(y_train == 0)
        class_imbalance_ratio = n_negative / max(n_positive, 1)
        logger.info(f"Class distribution: {n_positive} left, {n_negative} stayed (ratio: {class_imbalance_ratio:.2f})")

        # === CRITICAL FIX: Apply SMOTE for severe class imbalance ===
        # SMOTE should be applied AFTER train/test split, BEFORE scaling
        X_train_resampled, y_train_resampled = X_train, y_train
        smote_applied = False

        if SMOTE_AVAILABLE and class_imbalance_ratio > 2.0 and len(X_train) >= 50:
            try:
                # Use SMOTETomek for better results (combines oversampling + undersampling)
                if class_imbalance_ratio > 5.0:
                    # Severe imbalance - use SMOTETomek
                    resampler = SMOTETomek(
                        smote=SMOTE(
                            sampling_strategy=0.5,  # Target 50% minority
                            k_neighbors=min(5, n_positive - 1) if n_positive > 1 else 1,
                            random_state=42
                        ),
                        random_state=42
                    )
                else:
                    # Moderate imbalance - use plain SMOTE
                    resampler = SMOTE(
                        sampling_strategy='auto',  # Balance classes
                        k_neighbors=min(5, n_positive - 1) if n_positive > 1 else 1,
                        random_state=42
                    )

                X_train_resampled, y_train_resampled = resampler.fit_resample(X_train, y_train)
                smote_applied = True

                new_positive = np.sum(y_train_resampled == 1)
                new_negative = np.sum(y_train_resampled == 0)
                logger.info(
                    f"SMOTE applied: {len(y_train)} → {len(y_train_resampled)} samples "
                    f"(new ratio: {new_negative/max(new_positive,1):.2f})"
                )
            except Exception as e:
                logger.warning(f"SMOTE failed, using original data: {e}")
                X_train_resampled, y_train_resampled = X_train, y_train
        elif not SMOTE_AVAILABLE:
            logger.warning("SMOTE not available - install imbalanced-learn for better performance")

        # === NEW: Handle ensemble training ===
        if use_ensemble:
            return await self._train_ensemble_model(
                X_train_resampled, X_test, y_train_resampled, y_test, X, y,
                class_imbalance_ratio, dataset_id, smote_applied
            )

        # Fit scaler on resampled training data
        self.scaler.fit(X_train_resampled)
        X_train_scaled = self.scaler.transform(X_train_resampled)
        X_test_scaled = self.scaler.transform(X_test)

        # === HYPERPARAMETER TUNING with RandomizedSearchCV ===
        # Only tune if we have enough data and user didn't provide custom hyperparameters
        use_tuning = len(X_train_resampled) >= 200 and request.hyperparameters is None

        if use_tuning and selected_model_type == "xgboost":
            logger.info("Running hyperparameter tuning for XGBoost...")
            self.model = self._tune_xgboost(
                X_train_scaled, y_train_resampled, class_imbalance_ratio
            )
        elif use_tuning and selected_model_type == "random_forest":
            logger.info("Running hyperparameter tuning for Random Forest...")
            self.model = self._tune_random_forest(
                X_train_scaled, y_train_resampled
            )
        else:
            # Use default model with improved parameters
            self.model = self._create_model_instance(
                selected_model_type, class_imbalance_ratio, request.hyperparameters
            )
            self.model.fit(X_train_scaled, y_train_resampled)

        # === IMPROVEMENT 3: Proper Validation Metrics (on TEST set) ===
        y_proba_test = self.model.predict_proba(X_test_scaled)[:, 1]

        # === CRITICAL: Find optimal threshold for imbalanced data ===
        optimal_threshold, threshold_metrics = self._find_optimal_threshold(
            y_test, y_proba_test, method="f1"
        )
        self.optimal_threshold = optimal_threshold  # Store for prediction time

        # Use optimal threshold for predictions (NOT default 0.5)
        y_pred_test = (y_proba_test >= optimal_threshold).astype(int)
        y_pred_default = (y_proba_test >= 0.5).astype(int)

        # Metrics at OPTIMAL threshold (primary metrics)
        metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred_test)),
            'precision': float(precision_score(y_test, y_pred_test, zero_division=0)),
            'recall': float(recall_score(y_test, y_pred_test, zero_division=0)),
            'f1_score': float(f1_score(y_test, y_pred_test, zero_division=0)),
            'optimal_threshold': float(optimal_threshold),
        }

        # Also report metrics at default 0.5 threshold for comparison
        metrics['f1_at_default_threshold'] = float(f1_score(y_test, y_pred_default, zero_division=0))
        metrics['smote_applied'] = smote_applied

        # === IMPROVEMENT 4: Add ROC-AUC, PR-AUC, Brier Score ===
        try:
            metrics['roc_auc'] = float(roc_auc_score(y_test, y_proba_test))
        except ValueError:
            metrics['roc_auc'] = 0.5  # Default if only one class

        try:
            metrics['pr_auc'] = float(average_precision_score(y_test, y_proba_test))
        except ValueError:
            metrics['pr_auc'] = 0.0

        metrics['brier_score'] = float(brier_score_loss(y_test, y_proba_test))

        # Cross-validation with stratified K-fold and F1 scoring
        if len(X) >= 50:
            try:
                X_all_scaled = self.scaler.transform(X)
                cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
                cv_f1_scores = cross_val_score(self.model, X_all_scaled, y, cv=cv, scoring='f1')
                cv_roc_scores = cross_val_score(self.model, X_all_scaled, y, cv=cv, scoring='roc_auc')
                metrics['cv_f1_mean'] = float(cv_f1_scores.mean())
                metrics['cv_f1_std'] = float(cv_f1_scores.std())
                metrics['cv_roc_auc_mean'] = float(cv_roc_scores.mean())
                metrics['cv_roc_auc_std'] = float(cv_roc_scores.std())
            except Exception as e:
                logger.warning(f"Cross-validation failed: {e}")
                metrics['cv_f1_mean'] = metrics.get('f1_score', 0.0)
                metrics['cv_f1_std'] = 0.0
                metrics['cv_roc_auc_mean'] = metrics.get('roc_auc', 0.5)
                metrics['cv_roc_auc_std'] = 0.0

        # Training set metrics (for reference - check for overfitting)
        y_proba_train = self.model.predict_proba(X_train_scaled)[:, 1]
        y_pred_train = (y_proba_train >= optimal_threshold).astype(int)
        metrics['train_accuracy'] = float(accuracy_score(y_train_resampled, y_pred_train))
        metrics['train_f1'] = float(f1_score(y_train_resampled, y_pred_train, zero_division=0))
        metrics['class_imbalance_ratio'] = float(class_imbalance_ratio)
        metrics['test_size'] = len(y_test)
        metrics['train_size'] = len(y_train_resampled)

        # === IMPROVEMENT 5: Initialize SHAP Explainer ===
        # Handle TabPFN separately - it doesn't support SHAP natively
        if isinstance(self.model, TabPFNWrapper):
            # TabPFN uses permutation importance instead of SHAP
            self.shap_explainer = None
            logger.info("TabPFN model - will use permutation importance for explanations")
        elif SHAP_AVAILABLE:
            try:
                # Check if model supports TreeExplainer (XGBoost, RF, LightGBM, CatBoost)
                model_type_name = type(self.model).__name__
                tree_based_models = (
                    'XGBClassifier', 'RandomForestClassifier',
                    'LGBMClassifier', 'CatBoostClassifier'
                )
                if model_type_name in tree_based_models:
                    self.shap_explainer = shap.TreeExplainer(self.model)
                    logger.info(f"SHAP TreeExplainer initialized for {model_type_name}")
                else:
                    # For logistic regression, use KernelExplainer (slower)
                    background = shap.sample(X_train_scaled, min(100, len(X_train_scaled)))
                    self.shap_explainer = shap.KernelExplainer(self.model.predict_proba, background)
                    logger.info("SHAP KernelExplainer initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize SHAP explainer: {e}")
                self.shap_explainer = None

        # === NEW: Compute SHAP thresholds from training data ===
        if self.shap_explainer is not None and SHAP_AVAILABLE:
            try:
                # Compute SHAP values on a sample of training data
                shap_sample_size = min(500, len(X_train_scaled))
                shap_sample = X_train_scaled[:shap_sample_size]
                shap_values = self.shap_explainer.shap_values(shap_sample)

                # Handle different SHAP output formats
                if isinstance(shap_values, list):
                    # For binary classification, use positive class (index 1)
                    shap_values = np.array(shap_values[1]) if len(shap_values) > 1 else np.array(shap_values[0])

                # Compute data-driven SHAP thresholds
                shap_thresholds = self.thresholds_service.compute_shap_thresholds(
                    shap_values, dataset_id
                )
                metrics['shap_thresholds'] = shap_thresholds
                logger.info(f"Computed SHAP thresholds: critical={shap_thresholds['critical']:.3f}, "
                           f"high={shap_thresholds['high']:.3f}, medium={shap_thresholds['medium']:.3f}")
            except Exception as e:
                logger.warning(f"Failed to compute SHAP thresholds: {e}")

        # === NEW: Compute optimal classification threshold ===
        optimal_threshold = self.thresholds_service.compute_optimal_classification_threshold(
            y_test, y_proba_test, dataset_id, method="f1"
        )
        metrics['optimal_classification_threshold'] = optimal_threshold
        logger.info(f"Computed optimal classification threshold: {optimal_threshold:.3f}")

        # === IMPROVEMENT 6: Probability Calibration ===
        if len(X_train) > 100:
            try:
                # Calibrate probabilities using isotonic regression
                self.calibrated_model = CalibratedClassifierCV(
                    self.model, method='isotonic', cv=3
                )
                self.calibrated_model.fit(X_train_scaled, y_train)
                logger.info("Probability calibration applied (isotonic)")
                metrics['calibrated'] = True
            except Exception as e:
                logger.warning(f"Calibration failed: {e}")
                self.calibrated_model = None
                metrics['calibrated'] = False
        else:
            self.calibrated_model = None
            metrics['calibrated'] = False

        # === IMPROVEMENT 7: Data-Driven Risk Thresholds from Predictions ===
        # Compute risk thresholds from actual prediction distribution (percentile-based)
        high_threshold, medium_threshold = self.thresholds_service.compute_risk_thresholds_from_predictions(
            y_proba_test.tolist(),
            dataset_id=dataset_id,
            high_risk_percentile=85.0,   # Top 15% are high risk
            medium_risk_percentile=60.0  # Top 40% are medium+ risk
        )
        metrics['optimal_high_threshold'] = high_threshold
        metrics['optimal_medium_threshold'] = medium_threshold
        cache_key = dataset_id or "default"

        # Get feature importance
        feature_names = [
            'satisfaction_level', 'last_evaluation', 'number_project',
            'average_monthly_hours', 'time_spend_company', 'work_accident',
            'promotion_last_5years', 'department', 'salary_level'
        ]

        if isinstance(self.model, TabPFNWrapper):
            # TabPFN: Use permutation importance
            try:
                self.feature_importance = compute_permutation_importance(
                    self.model, X_test_scaled, y_test, feature_names, n_repeats=5
                )
                logger.info("Computed permutation importance for TabPFN")
            except Exception as e:
                logger.warning(f"Permutation importance failed: {e}")
                self.feature_importance = {name: 1.0 / len(feature_names) for name in feature_names}
        elif hasattr(self.model, 'feature_importances_'):
            self.feature_importance = dict(zip(feature_names, self.model.feature_importances_.tolist()))
        else:
            # Logistic regression - use coefficients
            if hasattr(self.model, 'coef_'):
                coefs = np.abs(self.model.coef_[0])
                normalized = coefs / coefs.sum() if coefs.sum() > 0 else coefs
                self.feature_importance = dict(zip(feature_names, normalized.tolist()))
            else:
                self.feature_importance = {}

        trained_at = datetime.utcnow()

        # Use the routed model type for the model_id
        selected_model_type = self.last_routing_decision.primary_model

        # Store optimal threshold for this dataset
        self.optimal_threshold_by_dataset[cache_key] = optimal_threshold
        self.optimal_threshold = optimal_threshold

        # Persist metrics for status checks (per dataset)
        model_id = f"{selected_model_type}_{cache_key}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        metrics_payload = {
            **metrics,
            'trained_at': trained_at,
            'predictions_made': 0,
            'model_version': model_id,
            'dataset_id': dataset_id,
        }
        self.model_metrics_by_dataset[cache_key] = metrics_payload
        self.model_metrics = metrics_payload
        self.feature_importance_by_dataset[cache_key] = self.feature_importance

        # Save model artifacts in dataset-scoped location
        self._save_model(dataset_id)

        self.active_version = model_id

        # === NEW: Set reference data for drift detection ===
        try:
            categorical_features = ['department', 'salary_level']
            model_drift_service.set_reference_data(
                X=X_train,  # Use original training data (before SMOTE)
                feature_names=feature_names,
                categorical_features=categorical_features,
                model_version=model_id
            )
            logger.info(f"Drift detection reference data set: {len(X_train)} samples")
        except Exception as e:
            logger.warning(f"Failed to set drift reference data: {e}")

        logger.info(f"Model trained: accuracy={metrics['accuracy']:.3f}, "
                   f"roc_auc={metrics.get('roc_auc', 0):.3f}, "
                   f"precision={metrics['precision']:.3f}, "
                   f"recall={metrics['recall']:.3f}")

        return ModelTrainingResponse(
            model_id=model_id,
            model_type=selected_model_type,  # Use routed model type
            accuracy=metrics['accuracy'],
            precision=metrics['precision'],
            recall=metrics['recall'],
            f1_score=metrics['f1_score'],
            roc_auc=metrics.get('roc_auc'),
            pr_auc=metrics.get('pr_auc'),
            brier_score=metrics.get('brier_score'),
            cv_roc_auc_mean=metrics.get('cv_roc_auc_mean'),
            cv_roc_auc_std=metrics.get('cv_roc_auc_std'),
            trained_at=trained_at,
            training_samples=len(X_train),
            test_samples=len(X_test),
            feature_importance=self.feature_importance,
            calibrated=metrics.get('calibrated', False),
            optimal_high_threshold=metrics.get('optimal_high_threshold'),
            optimal_medium_threshold=metrics.get('optimal_medium_threshold'),
            class_imbalance_ratio=metrics.get('class_imbalance_ratio'),
            # NEW: Model routing info
            selected_model=selected_model_type,
            is_ensemble=False,
            ensemble_models=None,
            ensemble_weights=None,
            routing_confidence=self.last_routing_decision.confidence,
            routing_reasoning=self.last_routing_decision.reasoning,
        )

    def _optimize_thresholds(self, y_true: np.ndarray, y_proba: np.ndarray) -> Dict[str, float]:
        """Optimize risk thresholds based on precision-recall trade-offs."""
        try:
            precision, recall, thresholds = precision_recall_curve(y_true, y_proba)

            # Find threshold that maximizes F1 for HIGH risk
            f1_scores = 2 * (precision * recall) / (precision + recall + 1e-8)
            if len(f1_scores) > 0 and len(thresholds) > 0:
                # F1 has one less element than precision/recall
                optimal_idx = min(np.argmax(f1_scores), len(thresholds) - 1)
                high_threshold = float(thresholds[optimal_idx])
            else:
                high_threshold = 0.60

            # For MEDIUM threshold, find where recall is ~0.8
            target_recall = 0.8
            recall_diffs = np.abs(recall - target_recall)
            medium_idx = np.argmin(recall_diffs)
            if medium_idx < len(thresholds):
                medium_threshold = float(thresholds[medium_idx])
            else:
                medium_threshold = 0.30

            # Ensure medium < high
            if medium_threshold >= high_threshold:
                medium_threshold = max(0.20, high_threshold - 0.15)

            # Clamp to reasonable bounds
            high_threshold = max(0.40, min(0.80, high_threshold))
            medium_threshold = max(0.15, min(0.50, medium_threshold))

            logger.info(f"Optimized thresholds: high={high_threshold:.2f}, medium={medium_threshold:.2f}")

            return {'high': high_threshold, 'medium': medium_threshold}

        except Exception as e:
            logger.warning(f"Threshold optimization failed: {e}, using defaults")
            return {'high': 0.60, 'medium': 0.30}

    def _create_model_instance(
        self,
        model_type: str,
        class_imbalance_ratio: float,
        hyperparameters: Optional[Dict[str, Any]] = None
    ) -> Any:
        """
        Create a model instance based on type.

        Args:
            model_type: One of 'tabpfn', 'xgboost', 'random_forest', 'logistic'
            class_imbalance_ratio: Ratio of negative to positive samples
            hyperparameters: Optional custom hyperparameters

        Returns:
            Model instance ready for fitting
        """
        if model_type == "tabpfn":
            return TabPFNWrapper()

        elif model_type == "xgboost":
            # Improved default XGBoost parameters for churn prediction
            params = hyperparameters or {
                'n_estimators': 300,           # More trees for better learning
                'max_depth': 7,                # Deeper trees to capture patterns
                'learning_rate': 0.05,         # Lower LR with more trees
                'min_child_weight': 3,         # Regularization
                'subsample': 0.8,              # Row sampling
                'colsample_bytree': 0.8,       # Feature sampling
                'gamma': 0.1,                  # Pruning parameter
                'reg_alpha': 0.1,              # L1 regularization
                'reg_lambda': 1.0,             # L2 regularization
                'random_state': 42,
                'scale_pos_weight': class_imbalance_ratio,
                'eval_metric': 'aucpr',        # Better for imbalanced data
                'early_stopping_rounds': 30,   # Prevent overfitting
                'n_jobs': -1                   # Use all cores
            }
            return xgb.XGBClassifier(**params)

        elif model_type == "random_forest":
            # Improved Random Forest parameters
            params = hyperparameters or {
                'n_estimators': 300,           # More trees
                'max_depth': 15,               # Deeper trees
                'min_samples_split': 5,        # Prevent overfitting
                'min_samples_leaf': 2,         # Prevent overfitting
                'max_features': 'sqrt',        # Feature subsampling
                'bootstrap': True,
                'oob_score': True,             # Out-of-bag score
                'random_state': 42,
                'class_weight': 'balanced_subsample',  # Better for imbalanced
                'n_jobs': -1
            }
            return RandomForestClassifier(**params)

        elif model_type == "logistic":
            params = hyperparameters or {
                'random_state': 42,
                'max_iter': 1000,
                'class_weight': 'balanced'
            }
            return LogisticRegression(**params)

        elif model_type == "lightgbm":
            # LightGBM - fast histogram-based gradient boosting
            import lightgbm as lgb
            params = hyperparameters or {
                'n_estimators': 300,
                'max_depth': 7,
                'learning_rate': 0.05,
                'num_leaves': 31,          # Default, good for most cases
                'min_child_samples': 20,   # Prevent overfitting
                'subsample': 0.8,
                'colsample_bytree': 0.8,
                'reg_alpha': 0.1,
                'reg_lambda': 1.0,
                'random_state': 42,
                'scale_pos_weight': class_imbalance_ratio,
                'verbosity': -1,           # Suppress warnings
                'force_col_wise': True,    # Better for small datasets
                'n_jobs': -1
            }
            return lgb.LGBMClassifier(**params)

        elif model_type == "catboost":
            # CatBoost - best for categorical features
            from catboost import CatBoostClassifier
            params = hyperparameters or {
                'iterations': 300,
                'depth': 7,
                'learning_rate': 0.05,
                'l2_leaf_reg': 3.0,        # L2 regularization
                'random_seed': 42,
                'scale_pos_weight': class_imbalance_ratio,
                'verbose': False,          # Suppress training output
                'allow_writing_files': False,  # Don't write temp files
                'thread_count': -1
            }
            return CatBoostClassifier(**params)

        else:
            logger.warning(f"Unknown model type '{model_type}', defaulting to XGBoost")
            return xgb.XGBClassifier(
                n_estimators=300,
                max_depth=7,
                learning_rate=0.05,
                random_state=42,
                scale_pos_weight=class_imbalance_ratio,
                eval_metric='aucpr'
            )

    def _tune_xgboost(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        class_imbalance_ratio: float
    ) -> xgb.XGBClassifier:
        """
        Tune XGBoost hyperparameters using RandomizedSearchCV with stratified K-fold.
        Optimizes for F1 score which is more appropriate for imbalanced churn data.
        """
        # Define search space - focused on most impactful parameters
        param_distributions = {
            'n_estimators': [100, 200, 300, 400],
            'max_depth': [4, 5, 6, 7, 8, 10],
            'learning_rate': [0.01, 0.03, 0.05, 0.1],
            'min_child_weight': [1, 3, 5, 7],
            'subsample': [0.6, 0.7, 0.8, 0.9],
            'colsample_bytree': [0.6, 0.7, 0.8, 0.9],
            'gamma': [0, 0.1, 0.2, 0.3],
            'reg_alpha': [0, 0.01, 0.1, 1.0],
            'reg_lambda': [0.5, 1.0, 2.0],
        }

        # Base estimator with fixed parameters
        base_model = xgb.XGBClassifier(
            random_state=42,
            scale_pos_weight=class_imbalance_ratio,
            eval_metric='aucpr',
            n_jobs=-1,
            use_label_encoder=False
        )

        # Stratified K-fold for imbalanced data
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

        # RandomizedSearchCV - faster than GridSearch, often as good
        search = RandomizedSearchCV(
            estimator=base_model,
            param_distributions=param_distributions,
            n_iter=30,                # Number of parameter settings sampled
            scoring='f1',             # Optimize for F1 (better for imbalanced)
            cv=cv,
            random_state=42,
            n_jobs=-1,
            verbose=1
        )

        logger.info("Starting XGBoost hyperparameter search (30 iterations)...")
        search.fit(X_train, y_train)

        logger.info(
            f"Best XGBoost params: {search.best_params_}, "
            f"Best CV F1: {search.best_score_:.4f}"
        )

        return search.best_estimator_

    def _tune_random_forest(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray
    ) -> RandomForestClassifier:
        """
        Tune Random Forest hyperparameters using RandomizedSearchCV.
        """
        param_distributions = {
            'n_estimators': [100, 200, 300, 400, 500],
            'max_depth': [8, 10, 12, 15, 20, None],
            'min_samples_split': [2, 5, 10],
            'min_samples_leaf': [1, 2, 4],
            'max_features': ['sqrt', 'log2', 0.5],
            'bootstrap': [True, False],
        }

        base_model = RandomForestClassifier(
            random_state=42,
            class_weight='balanced_subsample',
            n_jobs=-1
        )

        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

        search = RandomizedSearchCV(
            estimator=base_model,
            param_distributions=param_distributions,
            n_iter=30,
            scoring='f1',
            cv=cv,
            random_state=42,
            n_jobs=-1,
            verbose=1
        )

        logger.info("Starting Random Forest hyperparameter search (30 iterations)...")
        search.fit(X_train, y_train)

        logger.info(
            f"Best RF params: {search.best_params_}, "
            f"Best CV F1: {search.best_score_:.4f}"
        )

        return search.best_estimator_

    def _find_optimal_threshold(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        method: str = "f1"
    ) -> Tuple[float, Dict[str, float]]:
        """
        Find optimal classification threshold for imbalanced churn prediction.

        Args:
            y_true: True labels
            y_proba: Predicted probabilities
            method: Optimization method - "f1", "f2" (recall-weighted), or "youden"

        Returns:
            Tuple of (optimal_threshold, metrics_at_threshold)
        """
        from sklearn.metrics import f1_score as f1_metric, fbeta_score

        thresholds = np.arange(0.1, 0.9, 0.01)
        best_threshold = 0.5
        best_score = 0

        for threshold in thresholds:
            y_pred = (y_proba >= threshold).astype(int)

            if method == "f1":
                score = f1_metric(y_true, y_pred, zero_division=0)
            elif method == "f2":
                # F2 gives more weight to recall (important for churn)
                score = fbeta_score(y_true, y_pred, beta=2, zero_division=0)
            elif method == "youden":
                # Youden's J statistic = sensitivity + specificity - 1
                tn = np.sum((y_pred == 0) & (y_true == 0))
                fp = np.sum((y_pred == 1) & (y_true == 0))
                fn = np.sum((y_pred == 0) & (y_true == 1))
                tp = np.sum((y_pred == 1) & (y_true == 1))
                sensitivity = tp / max(tp + fn, 1)
                specificity = tn / max(tn + fp, 1)
                score = sensitivity + specificity - 1
            else:
                score = f1_metric(y_true, y_pred, zero_division=0)

            if score > best_score:
                best_score = score
                best_threshold = threshold

        # Calculate final metrics at optimal threshold
        y_pred_opt = (y_proba >= best_threshold).astype(int)
        metrics = {
            'threshold': float(best_threshold),
            'f1': float(f1_metric(y_true, y_pred_opt, zero_division=0)),
            'precision': float(precision_score(y_true, y_pred_opt, zero_division=0)),
            'recall': float(recall_score(y_true, y_pred_opt, zero_division=0)),
        }

        logger.info(
            f"Optimal threshold ({method}): {best_threshold:.3f} → "
            f"F1={metrics['f1']:.3f}, Precision={metrics['precision']:.3f}, "
            f"Recall={metrics['recall']:.3f}"
        )

        return best_threshold, metrics

    async def _train_ensemble_model(
        self,
        X_train: np.ndarray,
        X_test: np.ndarray,
        y_train: np.ndarray,
        y_test: np.ndarray,
        X_all: np.ndarray,
        y_all: np.ndarray,
        class_imbalance_ratio: float,
        dataset_id: Optional[str],
        smote_applied: bool = False
    ) -> ModelTrainingResponse:
        """
        Train an ensemble of models when routing recommends it.

        Uses the ensemble_service to create a weighted voting or stacking ensemble.
        """
        recommendation = self.last_routing_decision
        cache_key = dataset_id or "default"

        logger.info(
            f"Training ensemble with models: {recommendation.ensemble_models}, "
            f"method: {recommendation.ensemble_method}"
        )

        # Fit scaler
        self.scaler.fit(X_train)
        X_train_scaled = self.scaler.transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # Create ensemble
        self.ensemble_config = self.ensemble_service.create_ensemble(
            X_train=X_train_scaled,
            y_train=y_train,
            models=recommendation.ensemble_models,
            weights=recommendation.ensemble_weights,
            method=recommendation.ensemble_method,
            cv_folds=5,
            class_imbalance_ratio=class_imbalance_ratio,
        )

        # Use the primary model for single predictions (first in ensemble)
        primary_model_name = recommendation.ensemble_models[0]
        self.model = self.ensemble_config.base_models.get(primary_model_name)

        # Compute metrics using ensemble predictions
        y_proba_test = self.ensemble_service.predict_proba_ensemble(
            X_test_scaled, self.ensemble_config
        )[:, 1]
        y_pred_test = (y_proba_test >= 0.5).astype(int)

        metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred_test)),
            'precision': float(precision_score(y_test, y_pred_test, zero_division=0)),
            'recall': float(recall_score(y_test, y_pred_test, zero_division=0)),
            'f1_score': float(f1_score(y_test, y_pred_test, zero_division=0)),
        }

        try:
            metrics['roc_auc'] = float(roc_auc_score(y_test, y_proba_test))
        except ValueError:
            metrics['roc_auc'] = 0.5

        try:
            metrics['pr_auc'] = float(average_precision_score(y_test, y_proba_test))
        except ValueError:
            metrics['pr_auc'] = 0.0

        metrics['brier_score'] = float(brier_score_loss(y_test, y_proba_test))
        metrics['class_imbalance_ratio'] = float(class_imbalance_ratio)
        metrics['test_size'] = len(y_test)
        metrics['train_size'] = len(y_train)
        metrics['calibrated'] = False  # Ensemble not calibrated separately

        # Add CV scores from ensemble training
        if self.ensemble_config.cv_scores:
            avg_cv = np.mean(list(self.ensemble_config.cv_scores.values()))
            metrics['cv_roc_auc_mean'] = float(avg_cv)
            metrics['cv_roc_auc_std'] = float(np.std(list(self.ensemble_config.cv_scores.values())))

        # Optimize thresholds
        optimal_thresholds = self._optimize_thresholds(y_test, y_proba_test)
        self.thresholds_by_dataset[cache_key] = optimal_thresholds
        metrics['optimal_high_threshold'] = optimal_thresholds['high']
        metrics['optimal_medium_threshold'] = optimal_thresholds['medium']

        # Feature importance: average from base models that have it
        feature_names = self.FEATURE_NAMES
        importances_list = []

        for model_name, model in self.ensemble_config.base_models.items():
            if hasattr(model, 'feature_importances_'):
                importances_list.append(model.feature_importances_)

        if importances_list:
            avg_importance = np.mean(importances_list, axis=0)
            self.feature_importance = dict(zip(feature_names, avg_importance.tolist()))
        else:
            self.feature_importance = {name: 1.0 / len(feature_names) for name in feature_names}

        self.feature_importance_by_dataset[cache_key] = self.feature_importance

        trained_at = datetime.utcnow()
        model_id = f"ensemble_{cache_key}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # Save ensemble artifacts
        ensemble_dir = self.models_dir / dataset_id if dataset_id else self.models_dir
        ensemble_paths = self.ensemble_service.save_ensemble(
            self.ensemble_config,
            ensemble_dir,
            encrypt_fn=encrypt_blob
        )

        # Also save scaler and encoders
        self._save_model(dataset_id)

        # Store metrics
        metrics_payload = {
            **metrics,
            'trained_at': trained_at,
            'predictions_made': 0,
            'model_version': model_id,
            'dataset_id': dataset_id,
            'is_ensemble': True,
            'ensemble_models': recommendation.ensemble_models,
        }
        self.model_metrics_by_dataset[cache_key] = metrics_payload
        self.model_metrics = metrics_payload
        self.active_version = model_id

        logger.info(
            f"Ensemble trained: accuracy={metrics['accuracy']:.3f}, "
            f"roc_auc={metrics.get('roc_auc', 0):.3f}, "
            f"models={recommendation.ensemble_models}"
        )

        return ModelTrainingResponse(
            model_id=model_id,
            model_type=f"ensemble({'+'.join(recommendation.ensemble_models)})",
            accuracy=metrics['accuracy'],
            precision=metrics['precision'],
            recall=metrics['recall'],
            f1_score=metrics['f1_score'],
            roc_auc=metrics.get('roc_auc'),
            pr_auc=metrics.get('pr_auc'),
            brier_score=metrics.get('brier_score'),
            cv_roc_auc_mean=metrics.get('cv_roc_auc_mean'),
            cv_roc_auc_std=metrics.get('cv_roc_auc_std'),
            trained_at=trained_at,
            training_samples=len(y_train),
            test_samples=len(y_test),
            feature_importance=self.feature_importance,
            calibrated=False,
            optimal_high_threshold=metrics.get('optimal_high_threshold'),
            optimal_medium_threshold=metrics.get('optimal_medium_threshold'),
            class_imbalance_ratio=metrics.get('class_imbalance_ratio'),
            # Ensemble routing info
            selected_model=recommendation.primary_model,
            is_ensemble=True,
            ensemble_models=recommendation.ensemble_models,
            ensemble_weights=recommendation.ensemble_weights,
            routing_confidence=recommendation.confidence,
            routing_reasoning=recommendation.reasoning,
        )

    def _prepare_training_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare training data from DataFrame"""
        # Encode categorical variables
        df['department_encoded'] = self.label_encoders['department'].fit_transform(df['department'])
        df['salary_encoded'] = self.label_encoders['salary_level'].fit_transform(df['salary_level'])

        # Select features
        feature_columns = [
            'satisfaction_level', 'last_evaluation', 'number_project',
            'average_monthly_hours', 'time_spend_company', 'work_accident',
            'promotion_last_5years', 'department_encoded', 'salary_encoded'
        ]

        X = df[feature_columns].values
        y = df['left'].values  # Assuming 'left' column indicates churn

        return X, y

    # =========================================================================
    # Counterfactual Analysis Methods
    # =========================================================================

    # Feature metadata for building the UI
    # Note: 'options' for categorical features are populated dynamically from label encoders
    FEATURE_METADATA = {
        'satisfaction_level': {
            'label': 'Satisfaction Level',
            'type': 'float',
            'min_value': 0.0,
            'max_value': 1.0,
            'step': 0.05,
            'description': 'Employee satisfaction score (0 = very unsatisfied, 1 = very satisfied)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 2000,  # Cost to improve by 0.1
        },
        'last_evaluation': {
            'label': 'Last Evaluation Score',
            'type': 'float',
            'min_value': 0.0,
            'max_value': 1.0,
            'step': 0.05,
            'description': 'Last performance evaluation score (0-1)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 1500,
        },
        'number_project': {
            'label': 'Number of Projects',
            'type': 'int',
            'min_value': 1,
            'max_value': 10,
            'step': 1,
            'description': 'Number of projects assigned',
            'impact_direction': 'neutral',  # Too few or too many can be bad
            'cost_per_point': 0,
        },
        'average_monthly_hours': {
            'label': 'Average Monthly Hours',
            'type': 'float',
            'min_value': 80,
            'max_value': 300,
            'step': 5,
            'description': 'Average monthly working hours',
            'impact_direction': 'lower_is_better',  # Less overwork
            'cost_per_point': 50,  # Cost of reducing 1 hour
        },
        'time_spend_company': {
            'label': 'Years at Company',
            'type': 'int',
            'min_value': 0,
            'max_value': 30,
            'step': 1,
            'description': 'Years spent at the company (tenure)',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 0,  # Can't directly change tenure
        },
        'work_accident': {
            'label': 'Work Accident History',
            'type': 'bool',
            'description': 'Whether the employee has had a work accident',
            'impact_direction': 'neutral',
            'cost_per_point': 0,
        },
        'promotion_last_5years': {
            'label': 'Promoted in Last 5 Years',
            'type': 'bool',
            'description': 'Whether the employee was promoted in the last 5 years',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 5000,  # Average promotion cost
        },
        'department': {
            'label': 'Department',
            'type': 'categorical',
            # options populated dynamically from label_encoders['department'].classes_
            'description': 'Employee department',
            'impact_direction': 'neutral',
            'cost_per_point': 2000,  # Department transfer cost
        },
        'salary_level': {
            'label': 'Salary Level',
            'type': 'categorical',
            # options populated dynamically from label_encoders['salary_level'].classes_
            'description': 'Salary tier',
            'impact_direction': 'higher_is_better',
            'cost_per_point': 15000,  # Cost to move up one tier
        },
    }

    def _map_structure_to_department(self, structure_name: str) -> str:
        """
        Map HR structure name to department value.

        Returns the structure_name as-is (normalized to lowercase).
        The label encoder will handle mapping to numeric values during prediction.
        If no structure name is provided, returns 'general' as a fallback.
        """
        if not structure_name:
            return 'general'

        # Return the structure name as-is - the label encoder will handle it
        # This allows the system to work with whatever departments the user has
        return structure_name.strip().lower()

    def _derive_salary_level(
        self,
        employee_cost: Optional[float],
        dataset_id: Optional[str] = None
    ) -> str:
        """
        Derive salary level from employee cost using data-driven thresholds.

        Uses percentile-based tiers computed from the actual salary distribution.
        """
        if employee_cost is None:
            return 'medium'

        # Use data-driven salary tier based on percentiles
        return self.thresholds_service.get_salary_tier(float(employee_cost), dataset_id)

    async def get_employee_ml_features(
        self,
        db: AsyncSession,
        employee_id: str,
        dataset_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get the ML features for an employee that can be perturbed.

        Sources (in order of preference):
        1. HRDataInput.additional_data mapped to ML features
        2. Intelligent defaults with HR-derived values

        Required columns: hr_code, full_name, structure_name, position, status,
                         manager_id, tenure, termination_date, employee_cost
        All other fields go to additional_data and are parsed for ML features.
        """
        # Get the latest HR data for this employee
        query = select(HRDataInput).where(
            HRDataInput.hr_code == employee_id
        )
        if dataset_id:
            query = query.where(HRDataInput.dataset_id == dataset_id)

        query = query.order_by(desc(HRDataInput.report_date)).limit(1)
        result = await db.execute(query)
        employee = result.scalar_one_or_none()

        if not employee:
            raise ValueError(f"Employee {employee_id} not found")

        # Get additional_data if available
        additional_data = employee.additional_data or {}

        # Build ML features from available data
        features = {
            # Try to get from additional_data first, then use defaults
            'satisfaction_level': float(
                additional_data.get('satisfaction_level',
                additional_data.get('satisfaction', 0.6))
            ),
            'last_evaluation': float(
                additional_data.get('last_evaluation',
                additional_data.get('performance_rating_latest',
                additional_data.get('evaluation', 0.7)) / 5.0  # Normalize if 1-5 scale
                if additional_data.get('performance_rating_latest', 0) > 1 else 0.7)
            ),
            'number_project': int(
                additional_data.get('number_project',
                additional_data.get('projects', 3))
            ),
            'average_monthly_hours': float(
                additional_data.get('average_monthly_hours',
                additional_data.get('avg_hours', 160))
            ),
            'time_spend_company': int(float(employee.tenure or 0)),
            'work_accident': bool(
                additional_data.get('work_accident', False)
            ),
            'promotion_last_5years': bool(
                additional_data.get('promotion_last_5years',
                additional_data.get('promotions_24m', 0) > 0)
            ),
            'department': self._map_structure_to_department(employee.structure_name),
            'salary_level': additional_data.get(
                'salary_level',
                self._derive_salary_level(employee.employee_cost, dataset_id)
            ),
        }

        # Validate and clamp numeric values
        features['satisfaction_level'] = max(0.0, min(1.0, features['satisfaction_level']))
        features['last_evaluation'] = max(0.0, min(1.0, features['last_evaluation']))
        features['number_project'] = max(1, min(10, features['number_project']))
        features['average_monthly_hours'] = max(80, min(300, features['average_monthly_hours']))
        features['time_spend_company'] = max(0, min(30, features['time_spend_company']))

        # Categorical values are kept as-is - the label encoder handles unknown values
        # via _safe_encode_series() which uses the first known class as fallback

        return features

    def _get_categorical_options(self, feature_name: str) -> Optional[List[str]]:
        """
        Get the valid options for a categorical feature from the label encoder.

        Returns the classes the encoder learned during training.
        """
        if feature_name not in self.label_encoders:
            return None

        encoder = self.label_encoders[feature_name]
        if hasattr(encoder, 'classes_') and len(encoder.classes_) > 0:
            return encoder.classes_.tolist()

        return None

    def get_perturbable_features(
        self,
        current_features: Dict[str, Any]
    ) -> List[PerturbableFeature]:
        """
        Build list of perturbable features with metadata for UI.

        Categorical options are populated dynamically from the trained label encoders.
        """
        result = []

        for name, meta in self.FEATURE_METADATA.items():
            current_value = current_features.get(name)

            # For categorical features, get options from label encoders
            options = None
            if meta['type'] == 'categorical':
                options = self._get_categorical_options(name)

            feature = PerturbableFeature(
                name=name,
                label=meta['label'],
                current_value=current_value,
                type=meta['type'],
                min_value=meta.get('min_value'),
                max_value=meta.get('max_value'),
                step=meta.get('step'),
                options=options,
                description=meta['description'],
                impact_direction=meta['impact_direction'],
            )
            result.append(feature)

        return result

    def _calculate_counterfactual_cost(
        self,
        modifications: Dict[str, Any],
        base_features: Dict[str, Any]
    ) -> float:
        """Calculate the estimated annual cost of modifications."""
        total_cost = 0.0

        for feature, new_value in modifications.items():
            if feature not in self.FEATURE_METADATA:
                continue

            meta = self.FEATURE_METADATA[feature]
            cost_per_point = meta.get('cost_per_point', 0)
            old_value = base_features.get(feature)

            if cost_per_point == 0:
                continue

            if meta['type'] == 'float':
                # Calculate proportional cost
                delta = abs(float(new_value) - float(old_value or 0))
                if feature == 'satisfaction_level':
                    # Cost per 0.1 improvement
                    total_cost += (delta / 0.1) * cost_per_point
                elif feature == 'average_monthly_hours':
                    # Cost of reducing hours
                    if new_value < old_value:
                        total_cost += (old_value - new_value) * cost_per_point
                else:
                    total_cost += delta * cost_per_point

            elif meta['type'] == 'bool':
                # Cost only if changing from False to True
                if new_value and not old_value:
                    total_cost += cost_per_point

            elif meta['type'] == 'categorical':
                if feature == 'salary_level':
                    # Cost to move up tiers
                    tiers = {'low': 0, 'medium': 1, 'high': 2}
                    old_tier = tiers.get(str(old_value), 1)
                    new_tier = tiers.get(str(new_value), 1)
                    if new_tier > old_tier:
                        total_cost += (new_tier - old_tier) * cost_per_point
                elif feature == 'department':
                    # Cost of department transfer
                    if new_value != old_value:
                        total_cost += cost_per_point

        return total_cost

    def _apply_counterfactual_modifications(
        self,
        base_features: Dict[str, Any],
        modifications: Dict[str, Any]
    ) -> EmployeeChurnFeatures:
        """Apply modifications to base features and create EmployeeChurnFeatures."""
        modified = base_features.copy()

        for key, value in modifications.items():
            if key in modified:
                modified[key] = value

        # Validate and create EmployeeChurnFeatures
        # Categorical values are passed as-is - the encoder handles unknown values gracefully
        return EmployeeChurnFeatures(
            satisfaction_level=max(0.0, min(1.0, float(modified['satisfaction_level']))),
            last_evaluation=max(0.0, min(1.0, float(modified['last_evaluation']))),
            number_project=max(1, min(10, int(modified['number_project']))),
            average_monthly_hours=max(80, min(300, float(modified['average_monthly_hours']))),
            time_spend_company=max(0, min(30, int(modified['time_spend_company']))),
            work_accident=bool(modified['work_accident']),
            promotion_last_5years=bool(modified['promotion_last_5years']),
            department=str(modified['department']),
            salary_level=str(modified['salary_level']),
        )

    def _get_counterfactual_risk_level(
        self,
        probability: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """Determine risk level from probability using data-driven thresholds."""
        risk_level = self.thresholds_service.get_risk_level(probability, dataset_id)
        # Capitalize for display
        return risk_level.capitalize()

    async def simulate_counterfactual(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        modifications: Dict[str, Any],
        dataset_id: Optional[str] = None,
        scenario_name: Optional[str] = None,
        scenario_id: Optional[str] = None,
        annual_salary: Optional[float] = None
    ) -> CounterfactualResult:
        """
        Run TRUE counterfactual simulation using ML model perturbation.

        This calls the actual ChurnPredictionService with both baseline
        and modified features to get real model predictions.
        """
        # Import here to avoid circular dependency
        from app.services.analytics.eltv_service import eltv_service

        scenario_id = scenario_id or f"counterfactual_{datetime.utcnow().timestamp()}"
        scenario_name = scenario_name or f"Scenario: {', '.join(modifications.keys())}"

        # Create EmployeeChurnFeatures for baseline
        base_churn_features = self._apply_counterfactual_modifications(base_features, {})

        # Create EmployeeChurnFeatures with modifications
        modified_churn_features = self._apply_counterfactual_modifications(base_features, modifications)

        # Get REAL model predictions
        baseline_prediction = await self.predict_churn(
            ChurnPredictionRequest(features=base_churn_features),
            dataset_id=dataset_id
        )

        scenario_prediction = await self.predict_churn(
            ChurnPredictionRequest(features=modified_churn_features),
            dataset_id=dataset_id
        )

        # Calculate ELTV for both scenarios
        salary = annual_salary or 70000.0  # Default salary for ELTV
        tenure = base_features.get('time_spend_company', 3)

        # Estimate position level for ELTV
        position_level = eltv_service.estimate_position_level(
            position="Employee",
            salary=salary,
            tenure=tenure
        )

        baseline_eltv_result = eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=baseline_prediction.churn_probability,
            tenure_years=tenure,
            position_level=position_level
        )

        scenario_eltv_result = eltv_service.calculate_eltv(
            annual_salary=salary,
            churn_probability=scenario_prediction.churn_probability,
            tenure_years=tenure,
            position_level=position_level
        )

        # Calculate deltas
        churn_delta = scenario_prediction.churn_probability - baseline_prediction.churn_probability
        eltv_delta = scenario_eltv_result.eltv - baseline_eltv_result.eltv

        # Calculate modification cost
        modification_cost = self._calculate_counterfactual_cost(modifications, base_features)

        # Calculate ROI
        if modification_cost > 0:
            implied_roi = ((eltv_delta - modification_cost) / modification_cost) * 100
        else:
            implied_roi = float('inf') if eltv_delta > 0 else 0

        return CounterfactualResult(
            scenario_name=scenario_name,
            scenario_id=scenario_id,
            # Baseline (from actual model)
            baseline_churn_prob=baseline_prediction.churn_probability,
            baseline_risk_level=self._get_counterfactual_risk_level(baseline_prediction.churn_probability, dataset_id),
            baseline_eltv=baseline_eltv_result.eltv,
            baseline_confidence=baseline_prediction.confidence_score,
            baseline_factors=baseline_prediction.contributing_factors,
            # Scenario (from actual model)
            scenario_churn_prob=scenario_prediction.churn_probability,
            scenario_risk_level=self._get_counterfactual_risk_level(scenario_prediction.churn_probability, dataset_id),
            scenario_eltv=scenario_eltv_result.eltv,
            scenario_confidence=scenario_prediction.confidence_score,
            scenario_factors=scenario_prediction.contributing_factors,
            # Deltas
            churn_delta=churn_delta,
            eltv_delta=eltv_delta,
            # ROI
            implied_annual_cost=modification_cost,
            implied_roi=min(999.99, max(-999.99, implied_roi)),
            # Survival
            baseline_survival_probs=baseline_eltv_result.survival_probabilities,
            scenario_survival_probs=scenario_eltv_result.survival_probabilities,
            # Modifications
            modifications=modifications,
            simulated_at=datetime.utcnow(),
            prediction_method="model"
        )

    async def batch_counterfactuals(
        self,
        employee_id: str,
        base_features: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
        dataset_id: Optional[str] = None,
        annual_salary: Optional[float] = None
    ) -> List[CounterfactualResult]:
        """
        Run multiple counterfactual scenarios for comparison.

        Each scenario should have:
        - name: Display name
        - modifications: Dict of feature modifications
        """
        results = []

        for idx, scenario in enumerate(scenarios):
            modifications = scenario.get('modifications', {})
            name = scenario.get('name', f"Scenario {idx + 1}")
            scenario_id = scenario.get('id', f"scenario_{idx}")

            result = await self.simulate_counterfactual(
                employee_id=employee_id,
                base_features=base_features,
                modifications=modifications,
                dataset_id=dataset_id,
                scenario_name=name,
                scenario_id=scenario_id,
                annual_salary=annual_salary
            )
            results.append(result)

        return results


# Singleton instance for dependency injection
churn_prediction_service = ChurnPredictionService()
