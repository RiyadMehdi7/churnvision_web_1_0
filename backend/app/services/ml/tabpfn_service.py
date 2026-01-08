"""
TabPFN Service

Sklearn-compatible wrapper for TabPFN (Tabular Prior-Data Fitted Network).
TabPFN is a pre-trained transformer for tabular data that requires no training.
"""

from typing import Optional, Dict, Any, List
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Lazy import for TabPFN to avoid loading PyTorch at startup
_tabpfn_available: Optional[bool] = None
_TabPFNClassifier = None


def _check_tabpfn_available() -> bool:
    """Check if TabPFN and PyTorch are available."""
    global _tabpfn_available, _TabPFNClassifier

    if _tabpfn_available is not None:
        return _tabpfn_available

    try:
        import torch
        from tabpfn import TabPFNClassifier as _TPC
        _TabPFNClassifier = _TPC
        _tabpfn_available = True
        logger.info(f"TabPFN available. PyTorch version: {torch.__version__}")
    except ImportError as e:
        _tabpfn_available = False
        logger.warning(f"TabPFN not available: {e}")

    return _tabpfn_available


class TabPFNWrapper:
    """
    Sklearn-compatible wrapper for TabPFN.

    TabPFN is a pre-trained transformer that achieves strong performance
    on small tabular datasets (< 1000 samples, < 100 features) without
    requiring any training.

    Constraints:
        - Maximum 1000 training samples
        - Maximum 100 features
        - Maximum 10 classes for classification
        - Does not support missing values well

    Usage:
        model = TabPFNWrapper()
        model.fit(X_train, y_train)
        proba = model.predict_proba(X_test)
    """

    # Hard constraints
    MAX_SAMPLES = 1000
    MAX_FEATURES = 100
    MAX_CLASSES = 10

    def __init__(self, device: str = "auto", n_ensemble_configurations: int = 16):
        """
        Initialize TabPFN wrapper.

        Args:
            device: Device to run on ('auto', 'cpu', 'cuda', 'mps')
            n_ensemble_configurations: Number of ensemble configs for prediction
        """
        self._model = None
        self._fitted = False
        self._device = device
        self._n_ensemble = n_ensemble_configurations
        self._classes: Optional[np.ndarray] = None
        self._n_features: int = 0
        self._training_samples: int = 0

    def _get_device(self) -> str:
        """Determine the appropriate device."""
        if self._device != "auto":
            return self._device

        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        except ImportError:
            return "cpu"

    def fit(self, X: np.ndarray, y: np.ndarray) -> "TabPFNWrapper":
        """
        Fit TabPFN model.

        Note: TabPFN is pre-trained, so "fitting" simply stores the training
        data and validates constraints.

        Args:
            X: Training features (n_samples, n_features)
            y: Training labels (n_samples,)

        Returns:
            self

        Raises:
            ValueError: If constraints are violated
            ImportError: If TabPFN is not available
        """
        if not _check_tabpfn_available():
            raise ImportError(
                "TabPFN is not available. Please install with: pip install tabpfn torch"
            )

        # Validate constraints
        n_samples, n_features = X.shape
        n_classes = len(np.unique(y))

        if n_samples > self.MAX_SAMPLES:
            raise ValueError(
                f"TabPFN supports max {self.MAX_SAMPLES} samples, got {n_samples}. "
                "Consider subsampling or using a different model."
            )

        if n_features > self.MAX_FEATURES:
            raise ValueError(
                f"TabPFN supports max {self.MAX_FEATURES} features, got {n_features}. "
                "Consider feature selection or using a different model."
            )

        if n_classes > self.MAX_CLASSES:
            raise ValueError(
                f"TabPFN supports max {self.MAX_CLASSES} classes, got {n_classes}. "
                "Consider grouping classes or using a different model."
            )

        # Check for missing values
        if np.isnan(X).any():
            logger.warning(
                "TabPFN does not handle missing values well. "
                "Consider imputing before fitting."
            )

        # Initialize and fit TabPFN
        device = self._get_device()
        logger.info(
            f"Fitting TabPFN: {n_samples} samples, {n_features} features, "
            f"{n_classes} classes, device={device}"
        )

        try:
            self._model = _TabPFNClassifier(
                device=device,
                N_ensemble_configurations=self._n_ensemble
            )
            self._model.fit(X, y)
            self._fitted = True
            self._classes = np.unique(y)
            self._n_features = n_features
            self._training_samples = n_samples

            logger.info("TabPFN fitting complete")

        except Exception as e:
            logger.error(f"TabPFN fitting failed: {e}")
            raise

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class labels.

        Args:
            X: Features (n_samples, n_features)

        Returns:
            Predicted class labels
        """
        self._check_fitted()
        return self._model.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class probabilities.

        Args:
            X: Features (n_samples, n_features)

        Returns:
            Predicted probabilities (n_samples, n_classes)
        """
        self._check_fitted()
        return self._model.predict_proba(X)

    def _check_fitted(self) -> None:
        """Check if model is fitted."""
        if not self._fitted or self._model is None:
            raise RuntimeError("TabPFN is not fitted. Call fit() first.")

    @property
    def feature_importances_(self) -> None:
        """
        Feature importances are not natively available in TabPFN.

        Use permutation importance instead:
            from sklearn.inspection import permutation_importance
            result = permutation_importance(model, X_test, y_test, n_repeats=10)
        """
        return None

    @property
    def classes_(self) -> Optional[np.ndarray]:
        """Return the classes seen during fit."""
        return self._classes

    @property
    def n_features_in_(self) -> int:
        """Number of features seen during fit."""
        return self._n_features

    def get_params(self, deep: bool = True) -> Dict[str, Any]:
        """Get parameters for this estimator (sklearn compatibility)."""
        return {
            "device": self._device,
            "n_ensemble_configurations": self._n_ensemble,
        }

    def set_params(self, **params: Any) -> "TabPFNWrapper":
        """Set parameters for this estimator (sklearn compatibility)."""
        for key, value in params.items():
            if key == "device":
                self._device = value
            elif key == "n_ensemble_configurations":
                self._n_ensemble = value
        return self

    def __repr__(self) -> str:
        """String representation."""
        status = "fitted" if self._fitted else "not fitted"
        return f"TabPFNWrapper(device={self._device}, status={status})"


def compute_permutation_importance(
    model: TabPFNWrapper,
    X: np.ndarray,
    y: np.ndarray,
    feature_names: List[str],
    n_repeats: int = 10,
    random_state: int = 42
) -> Dict[str, float]:
    """
    Compute permutation importance for TabPFN.

    Since TabPFN doesn't provide native feature importances,
    we use permutation importance as an alternative.

    Args:
        model: Fitted TabPFNWrapper
        X: Test features
        y: Test labels
        feature_names: List of feature names
        n_repeats: Number of permutation repeats
        random_state: Random seed

    Returns:
        Dictionary mapping feature names to importance scores
    """
    try:
        from sklearn.inspection import permutation_importance
        from sklearn.metrics import accuracy_score

        result = permutation_importance(
            model,
            X,
            y,
            n_repeats=n_repeats,
            random_state=random_state,
            scoring="accuracy"
        )

        importances = result.importances_mean
        importance_dict = {}

        for name, importance in zip(feature_names, importances):
            importance_dict[name] = float(max(0, importance))  # Clip negative

        # Normalize to sum to 1
        total = sum(importance_dict.values())
        if total > 0:
            importance_dict = {k: v / total for k, v in importance_dict.items()}

        return importance_dict

    except Exception as e:
        logger.warning(f"Failed to compute permutation importance: {e}")
        # Return uniform importance as fallback
        return {name: 1.0 / len(feature_names) for name in feature_names}


def is_tabpfn_available() -> bool:
    """Check if TabPFN is available for use."""
    return _check_tabpfn_available()
