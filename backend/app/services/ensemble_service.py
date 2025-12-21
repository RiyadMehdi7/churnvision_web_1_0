"""
Ensemble Service

Automatic ensemble creation and management for combining multiple models.
Supports weighted voting and stacking ensemble methods.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
import pickle
import json
from pathlib import Path
import logging

from sklearn.model_selection import cross_val_predict, StratifiedKFold
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
import xgboost as xgb

logger = logging.getLogger(__name__)


@dataclass
class EnsembleConfig:
    """Configuration for an ensemble model."""

    # Models in the ensemble
    models: List[str]  # ['xgboost', 'random_forest', ...]

    # Weights for weighted voting
    weights: Dict[str, float]

    # Ensemble method
    method: str  # 'weighted_voting', 'stacking'

    # Fitted model instances (populated after training)
    base_models: Dict[str, Any] = field(default_factory=dict)

    # Meta-learner for stacking
    meta_learner: Optional[Any] = None

    # Training info
    training_samples: int = 0
    cv_scores: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to serializable dictionary."""
        return {
            "models": self.models,
            "weights": {k: round(v, 4) for k, v in self.weights.items()},
            "method": self.method,
            "training_samples": self.training_samples,
            "cv_scores": {k: round(v, 4) for k, v in self.cv_scores.items()},
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EnsembleConfig":
        """Create from dictionary."""
        return cls(
            models=data["models"],
            weights=data["weights"],
            method=data["method"],
            training_samples=data.get("training_samples", 0),
            cv_scores=data.get("cv_scores", {}),
        )


class EnsembleService:
    """
    Service for creating and managing model ensembles.

    Supports:
    - Weighted voting: Average predictions weighted by CV performance
    - Stacking: Meta-learner trained on base model predictions
    """

    def __init__(self):
        self._model_factories = {
            "xgboost": self._create_xgboost,
            "random_forest": self._create_random_forest,
            "logistic": self._create_logistic,
            "tabpfn": self._create_tabpfn,
        }

    def create_ensemble(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        models: List[str],
        weights: Optional[Dict[str, float]] = None,
        method: str = "weighted_voting",
        cv_folds: int = 5,
        class_imbalance_ratio: float = 1.0,
    ) -> EnsembleConfig:
        """
        Create and train an ensemble of models.

        Args:
            X_train: Training features
            y_train: Training labels
            models: List of model types to include
            weights: Optional predefined weights (auto-computed if None)
            method: Ensemble method ('weighted_voting' or 'stacking')
            cv_folds: Number of cross-validation folds
            class_imbalance_ratio: Ratio for handling class imbalance

        Returns:
            EnsembleConfig with fitted models
        """
        logger.info(f"Creating {method} ensemble with models: {models}")

        # Initialize config
        config = EnsembleConfig(
            models=models,
            weights=weights or {},
            method=method,
            training_samples=len(X_train),
        )

        # Train each base model
        cv_scores = {}
        for model_name in models:
            logger.info(f"Training base model: {model_name}")

            try:
                model = self._create_model(
                    model_name,
                    class_imbalance_ratio=class_imbalance_ratio
                )

                # Fit model
                model.fit(X_train, y_train)
                config.base_models[model_name] = model

                # Compute CV score for weight optimization
                cv_score = self._compute_cv_score(
                    model_name, X_train, y_train,
                    cv_folds, class_imbalance_ratio
                )
                cv_scores[model_name] = cv_score

                logger.info(f"{model_name} CV score: {cv_score:.4f}")

            except Exception as e:
                logger.error(f"Failed to train {model_name}: {e}")
                continue

        config.cv_scores = cv_scores

        # Compute weights if not provided
        if not config.weights:
            config.weights = self._compute_optimal_weights(cv_scores)

        # For stacking, train meta-learner
        if method == "stacking" and len(config.base_models) >= 2:
            config.meta_learner = self._train_meta_learner(
                X_train, y_train, config.base_models, cv_folds
            )

        logger.info(
            f"Ensemble created: {len(config.base_models)} models, "
            f"weights: {config.weights}"
        )

        return config

    def predict_ensemble(
        self,
        X: np.ndarray,
        config: EnsembleConfig
    ) -> np.ndarray:
        """
        Get ensemble predictions (class labels).

        Args:
            X: Features to predict
            config: Ensemble configuration

        Returns:
            Predicted class labels
        """
        proba = self.predict_proba_ensemble(X, config)
        return (proba[:, 1] >= 0.5).astype(int)

    def predict_proba_ensemble(
        self,
        X: np.ndarray,
        config: EnsembleConfig
    ) -> np.ndarray:
        """
        Get ensemble probability predictions.

        Args:
            X: Features to predict
            config: Ensemble configuration

        Returns:
            Predicted probabilities (n_samples, 2)
        """
        if config.method == "stacking" and config.meta_learner is not None:
            return self._predict_stacking(X, config)
        else:
            return self._predict_weighted_voting(X, config)

    def _predict_weighted_voting(
        self,
        X: np.ndarray,
        config: EnsembleConfig
    ) -> np.ndarray:
        """Weighted voting ensemble prediction."""
        predictions = []
        weights = []

        for model_name, model in config.base_models.items():
            try:
                proba = model.predict_proba(X)
                predictions.append(proba)
                weights.append(config.weights.get(model_name, 1.0))
            except Exception as e:
                logger.warning(f"Prediction failed for {model_name}: {e}")
                continue

        if not predictions:
            raise RuntimeError("No base models produced predictions")

        # Weighted average
        weights = np.array(weights)
        weights = weights / weights.sum()  # Normalize

        weighted_proba = np.zeros_like(predictions[0])
        for pred, weight in zip(predictions, weights):
            weighted_proba += weight * pred

        return weighted_proba

    def _predict_stacking(
        self,
        X: np.ndarray,
        config: EnsembleConfig
    ) -> np.ndarray:
        """Stacking ensemble prediction using meta-learner."""
        # Get base model predictions
        meta_features = self._get_meta_features(X, config.base_models)

        # Use meta-learner
        return config.meta_learner.predict_proba(meta_features)

    def _get_meta_features(
        self,
        X: np.ndarray,
        base_models: Dict[str, Any]
    ) -> np.ndarray:
        """Extract meta-features from base model predictions."""
        meta_features = []

        for model_name, model in base_models.items():
            try:
                proba = model.predict_proba(X)[:, 1]  # Probability of class 1
                meta_features.append(proba)
            except Exception as e:
                logger.warning(f"Meta-feature extraction failed for {model_name}: {e}")
                # Use zeros as fallback
                meta_features.append(np.zeros(len(X)))

        return np.column_stack(meta_features)

    def _train_meta_learner(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        base_models: Dict[str, Any],
        cv_folds: int
    ) -> Any:
        """Train meta-learner for stacking ensemble."""
        logger.info("Training stacking meta-learner")

        # Generate out-of-fold predictions for meta-features
        n_samples = len(X_train)
        n_models = len(base_models)
        meta_train = np.zeros((n_samples, n_models))

        skf = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)

        for model_idx, (model_name, _) in enumerate(base_models.items()):
            # Get OOF predictions using cross_val_predict
            temp_model = self._create_model(model_name)

            try:
                oof_proba = cross_val_predict(
                    temp_model, X_train, y_train,
                    cv=skf, method="predict_proba"
                )
                meta_train[:, model_idx] = oof_proba[:, 1]
            except Exception as e:
                logger.warning(f"OOF prediction failed for {model_name}: {e}")
                meta_train[:, model_idx] = 0.5

        # Train meta-learner (logistic regression for calibrated probabilities)
        meta_learner = LogisticRegression(
            random_state=42,
            max_iter=1000,
            class_weight="balanced"
        )
        meta_learner.fit(meta_train, y_train)

        logger.info("Meta-learner trained successfully")
        return meta_learner

    def _create_model(
        self,
        model_name: str,
        class_imbalance_ratio: float = 1.0
    ) -> Any:
        """Create a model instance by name."""
        factory = self._model_factories.get(model_name)
        if factory is None:
            raise ValueError(f"Unknown model type: {model_name}")
        return factory(class_imbalance_ratio)

    def _create_xgboost(self, class_imbalance_ratio: float) -> xgb.XGBClassifier:
        """Create XGBoost classifier."""
        return xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
            scale_pos_weight=class_imbalance_ratio,
            eval_metric="auc",
            use_label_encoder=False,
        )

    def _create_random_forest(self, class_imbalance_ratio: float) -> RandomForestClassifier:
        """Create Random Forest classifier."""
        return RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            class_weight="balanced",
            n_jobs=-1,
        )

    def _create_logistic(self, class_imbalance_ratio: float) -> LogisticRegression:
        """Create Logistic Regression classifier."""
        return LogisticRegression(
            random_state=42,
            max_iter=1000,
            class_weight="balanced",
        )

    def _create_tabpfn(self, class_imbalance_ratio: float) -> Any:
        """Create TabPFN classifier."""
        from app.services.tabpfn_service import TabPFNWrapper
        return TabPFNWrapper()

    def _compute_cv_score(
        self,
        model_name: str,
        X: np.ndarray,
        y: np.ndarray,
        cv_folds: int,
        class_imbalance_ratio: float
    ) -> float:
        """Compute cross-validation ROC-AUC score."""
        from sklearn.model_selection import cross_val_score

        model = self._create_model(model_name, class_imbalance_ratio)

        try:
            scores = cross_val_score(
                model, X, y,
                cv=min(cv_folds, len(np.unique(y)) * 2),  # Ensure enough samples per fold
                scoring="roc_auc"
            )
            return float(scores.mean())
        except Exception as e:
            logger.warning(f"CV scoring failed for {model_name}: {e}")
            return 0.5

    def _compute_optimal_weights(
        self,
        cv_scores: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Compute optimal ensemble weights based on CV scores.

        Uses softmax-like normalization to give higher weight to better models.
        """
        if not cv_scores:
            return {}

        # Convert scores to weights using softmax
        scores = np.array(list(cv_scores.values()))
        # Temperature parameter to control weight distribution
        temperature = 0.5

        # Shift scores to be positive (for numerical stability)
        scores_shifted = scores - scores.max()
        exp_scores = np.exp(scores_shifted / temperature)
        weights = exp_scores / exp_scores.sum()

        return {
            model: float(weight)
            for model, weight in zip(cv_scores.keys(), weights)
        }

    def save_ensemble(
        self,
        config: EnsembleConfig,
        base_path: Path,
        encrypt_fn: Optional[callable] = None
    ) -> Dict[str, str]:
        """
        Save ensemble configuration and models to disk.

        Args:
            config: Ensemble configuration to save
            base_path: Base directory for saving
            encrypt_fn: Optional encryption function

        Returns:
            Dictionary mapping artifact names to paths
        """
        base_path.mkdir(parents=True, exist_ok=True)
        paths = {}

        # Save manifest
        manifest_path = base_path / "ensemble_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(config.to_dict(), f, indent=2)
        paths["manifest"] = str(manifest_path)

        # Save each base model
        for model_name, model in config.base_models.items():
            model_path = base_path / f"{model_name}_model.pkl"
            model_bytes = pickle.dumps(model)

            if encrypt_fn:
                model_bytes = encrypt_fn(model_bytes)

            with open(model_path, "wb") as f:
                f.write(model_bytes)

            paths[model_name] = str(model_path)

        # Save meta-learner if present
        if config.meta_learner is not None:
            meta_path = base_path / "meta_learner.pkl"
            meta_bytes = pickle.dumps(config.meta_learner)

            if encrypt_fn:
                meta_bytes = encrypt_fn(meta_bytes)

            with open(meta_path, "wb") as f:
                f.write(meta_bytes)

            paths["meta_learner"] = str(meta_path)

        logger.info(f"Ensemble saved to {base_path}")
        return paths

    def load_ensemble(
        self,
        base_path: Path,
        decrypt_fn: Optional[callable] = None
    ) -> EnsembleConfig:
        """
        Load ensemble configuration and models from disk.

        Args:
            base_path: Base directory containing saved ensemble
            decrypt_fn: Optional decryption function

        Returns:
            Loaded EnsembleConfig
        """
        # Load manifest
        manifest_path = base_path / "ensemble_manifest.json"
        with open(manifest_path, "r") as f:
            manifest = json.load(f)

        config = EnsembleConfig.from_dict(manifest)

        # Load base models
        for model_name in config.models:
            model_path = base_path / f"{model_name}_model.pkl"
            if model_path.exists():
                with open(model_path, "rb") as f:
                    model_bytes = f.read()

                if decrypt_fn:
                    model_bytes = decrypt_fn(model_bytes)

                config.base_models[model_name] = pickle.loads(model_bytes)

        # Load meta-learner if present
        meta_path = base_path / "meta_learner.pkl"
        if meta_path.exists():
            with open(meta_path, "rb") as f:
                meta_bytes = f.read()

            if decrypt_fn:
                meta_bytes = decrypt_fn(meta_bytes)

            config.meta_learner = pickle.loads(meta_bytes)

        logger.info(f"Ensemble loaded from {base_path}")
        return config


# Singleton instance
ensemble_service = EnsembleService()
