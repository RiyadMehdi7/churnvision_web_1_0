from typing import List, Dict, Any, Optional, Tuple
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

logger = logging.getLogger(__name__)

# Try to import SHAP (optional but recommended)
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logger.warning("SHAP not available - using rule-based explanations")


class ChurnPredictionService:
    """Service for employee churn prediction using ML models"""

    # Feature names used for training and prediction
    FEATURE_NAMES = [
        'satisfaction_level', 'last_evaluation', 'number_project',
        'average_monthly_hours', 'time_spend_company', 'work_accident',
        'promotion_last_5years', 'department', 'salary_level'
    ]

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

        # SHAP explainer for model interpretability
        self.shap_explainer = None

        # Optimized thresholds (data-driven)
        self.risk_thresholds = {
            'high': 0.60,
            'medium': 0.30
        }
        self.thresholds_by_dataset: Dict[str, Dict[str, float]] = {}

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
        """Load saved model, scaler, and encoders for a dataset (or global default)."""
        model_path, scaler_path, encoders_path = self._artifact_paths(dataset_id)
        try:
            if model_path.exists():
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)

                with open(scaler_path, 'rb') as f:
                    self.scaler = pickle.load(f)

                with open(encoders_path, 'rb') as f:
                    self.label_encoders = pickle.load(f)

                self.active_version = model_path.stem
                self.active_dataset_id = dataset_id
                # Restore cached metrics if we have them
                cache_key = dataset_id or "default"
                if cache_key in self.model_metrics_by_dataset:
                    self.model_metrics = self.model_metrics_by_dataset[cache_key]
                if cache_key in self.feature_importance_by_dataset:
                    self.feature_importance = self.feature_importance_by_dataset[cache_key]
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
            print(f"Error loading model for dataset {dataset_id}: {e}")
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

        # Initialize label encoders for categorical features
        self.label_encoders = {
            'department': LabelEncoder(),
            'salary_level': LabelEncoder()
        }

        # Fit encoders with expected values
        self.label_encoders['department'].fit([
            'sales', 'technical', 'support', 'IT', 'product_mng',
            'marketing', 'RandD', 'accounting', 'hr', 'management'
        ])
        self.label_encoders['salary_level'].fit(['low', 'medium', 'high'])
        self.model_metrics = {}

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
        """Save model, scaler, and encoders to disk (scoped per dataset)."""
        model_path, scaler_path, encoders_path = self._artifact_paths(dataset_id)
        try:
            with open(model_path, 'wb') as f:
                pickle.dump(self.model, f)

            with open(scaler_path, 'wb') as f:
                pickle.dump(self.scaler, f)

            with open(encoders_path, 'wb') as f:
                pickle.dump(self.label_encoders, f)
        except Exception as e:
            print(f"Error saving model for dataset {dataset_id}: {e}")

    def _prepare_features(self, features: EmployeeChurnFeatures) -> np.ndarray:
        """Convert employee features to model input format"""
        # Encode categorical variables
        department_encoded = self.label_encoders['department'].transform([features.department])[0]
        salary_encoded = self.label_encoders['salary_level'].transform([features.salary_level])[0]

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

        # Scale features
        feature_array_scaled = self.scaler.transform(feature_array)

        return feature_array_scaled

    def _determine_risk_level(self, probability: float, dataset_id: Optional[str] = None) -> ChurnRiskLevel:
        """Determine risk level based on churn probability using data-driven thresholds."""
        # Use dataset-specific thresholds if available, otherwise use defaults
        thresholds = self.thresholds_by_dataset.get(dataset_id or "default", self.risk_thresholds)

        if probability >= thresholds.get('high', 0.60):
            return ChurnRiskLevel.HIGH
        elif probability >= thresholds.get('medium', 0.30):
            return ChurnRiskLevel.MEDIUM
        else:
            return ChurnRiskLevel.LOW

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

        # Component 1: Prediction Margin (40% weight)
        # How far from 50/50 uncertainty
        margin = abs(probability - 0.5) * 2  # Scale to 0-1
        breakdown['prediction_margin'] = margin

        # Component 2: Tree Agreement (60% weight)
        # Measure variance across individual tree predictions
        tree_agreement = self._calculate_tree_agreement(features_array)
        breakdown['tree_agreement'] = tree_agreement

        # Final confidence: weighted combination
        confidence = (0.6 * tree_agreement) + (0.4 * margin)

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

    def _shap_to_impact_level(self, shap_value: float) -> str:
        """Convert SHAP value magnitude to impact level."""
        abs_val = abs(shap_value)
        if abs_val >= 0.3:
            return "critical"
        elif abs_val >= 0.15:
            return "high"
        elif abs_val >= 0.05:
            return "medium"
        else:
            return "low"

    def _generate_shap_message(self, feature: str, value: Any, shap_val: float) -> str:
        """Generate human-readable message from SHAP explanation."""
        direction = "increases" if shap_val > 0 else "decreases"
        magnitude = abs(shap_val)

        messages = {
            "satisfaction_level": f"Satisfaction level ({value:.2f}) {direction} churn risk",
            "last_evaluation": f"Performance score ({value:.2f}) {direction} churn risk",
            "number_project": f"Project count ({value}) {direction} churn risk",
            "average_monthly_hours": f"Monthly hours ({value:.0f}) {direction} churn risk",
            "time_spend_company": f"Tenure ({value} years) {direction} churn risk",
            "work_accident": f"Work accident history {direction} churn risk",
            "promotion_last_5years": f"Promotion status {direction} churn risk",
            "department": f"Department ({value}) {direction} churn risk",
            "salary_level": f"Salary level ({value}) {direction} churn risk"
        }

        return messages.get(feature, f"{feature} ({value}) {direction} churn risk")

    def _get_heuristic_contributing_factors(self, features: EmployeeChurnFeatures) -> List[Dict[str, Any]]:
        """Fallback: Identify contributing factors using heuristic rules."""
        factors = []

        # Low satisfaction is a major factor
        if features.satisfaction_level < 0.4:
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "shap_value": 0.4,  # Estimated impact
                "impact": "critical",
                "direction": "increases_risk",
                "message": f"Very low satisfaction level ({features.satisfaction_level:.2f})"
            })
        elif features.satisfaction_level < 0.6:
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "shap_value": 0.2,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"Low satisfaction level ({features.satisfaction_level:.2f})"
            })

        # Overwork indicator
        if features.average_monthly_hours > 250:
            factors.append({
                "feature": "average_monthly_hours",
                "value": features.average_monthly_hours,
                "shap_value": 0.15,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"High workload ({features.average_monthly_hours:.0f} hours/month)"
            })

        # Too many or too few projects
        if features.number_project > 6:
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"High project count ({features.number_project} projects)"
            })
        elif features.number_project < 2:
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"Low project engagement ({features.number_project} projects)"
            })

        # Low evaluation score
        if features.last_evaluation < 0.5:
            factors.append({
                "feature": "last_evaluation",
                "value": features.last_evaluation,
                "shap_value": 0.2,
                "impact": "high",
                "direction": "increases_risk",
                "message": f"Low performance evaluation ({features.last_evaluation:.2f})"
            })

        # Long tenure without promotion
        if features.time_spend_company > 4 and not features.promotion_last_5years:
            factors.append({
                "feature": "promotion_last_5years",
                "value": False,
                "shap_value": 0.1,
                "impact": "medium",
                "direction": "increases_risk",
                "message": f"No promotion in {features.time_spend_company} years"
            })

        # Salary level
        if features.salary_level == "low":
            factors.append({
                "feature": "salary_level",
                "value": features.salary_level,
                "shap_value": 0.05,
                "impact": "medium",
                "direction": "increases_risk",
                "message": "Low salary level"
            })

        return factors[:5]

    def _get_contributing_factors(self, features: EmployeeChurnFeatures, probability: float) -> List[Dict[str, Any]]:
        """Identify top contributing factors for churn risk (legacy compatibility)."""
        return self._get_heuristic_contributing_factors(features)

    def _get_recommendations(self, features: EmployeeChurnFeatures, factors: List[Dict[str, Any]]) -> List[str]:
        """Generate actionable recommendations based on churn factors"""
        recommendations = []

        if features.satisfaction_level < 0.5:
            recommendations.append("Schedule immediate one-on-one meeting to discuss employee satisfaction and concerns")

        if features.average_monthly_hours > 250:
            recommendations.append("Review current workload and consider redistributing projects to reduce overtime")

        if features.number_project > 6:
            recommendations.append("Evaluate project assignments and potentially reduce workload")
        elif features.number_project < 2:
            recommendations.append("Consider increasing project involvement to boost engagement")

        if not features.promotion_last_5years and features.time_spend_company > 3:
            recommendations.append("Discuss career development opportunities and potential promotion path")

        if features.salary_level == "low":
            recommendations.append("Review compensation package and consider salary adjustment")

        if features.last_evaluation < 0.5:
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

        # Get prediction
        if self.model is None:
            if settings.ENVIRONMENT == "production":
                raise RuntimeError("No trained model loaded. Train a model before serving predictions.")
            # If no trained model, use heuristic-based prediction
            probability = self._heuristic_prediction(request.features)
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
            contributing_factors = self._get_heuristic_contributing_factors(request.features)
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
        recommendations = self._get_recommendations(request.features, contributing_factors)

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

    def _heuristic_prediction(self, features: EmployeeChurnFeatures) -> float:
        """Fallback heuristic-based prediction when no model is trained"""
        score = 0.0

        # Satisfaction is the strongest predictor
        score += (1 - features.satisfaction_level) * 0.4

        # Evaluation score
        if features.last_evaluation < 0.5:
            score += 0.2

        # Workload
        if features.average_monthly_hours > 250:
            score += 0.15
        elif features.average_monthly_hours < 120:
            score += 0.1

        # Projects
        if features.number_project > 6 or features.number_project < 2:
            score += 0.1

        # Tenure and promotion
        if features.time_spend_company > 4 and not features.promotion_last_5years:
            score += 0.1

        # Salary
        if features.salary_level == "low":
            score += 0.05

        return min(score, 1.0)

    async def predict_batch(self, request: BatchChurnPredictionRequest, dataset_id: Optional[str] = None) -> BatchChurnPredictionResponse:
        """Predict churn for multiple employees"""
        predictions = []

        for pred_request in request.predictions:
            prediction = await self.predict_churn(pred_request, dataset_id)
            predictions.append(prediction)

        # Count risk levels
        high_risk = sum(1 for p in predictions if p.risk_level in [ChurnRiskLevel.HIGH, ChurnRiskLevel.CRITICAL])
        medium_risk = sum(1 for p in predictions if p.risk_level == ChurnRiskLevel.MEDIUM)
        low_risk = sum(1 for p in predictions if p.risk_level == ChurnRiskLevel.LOW)

        return BatchChurnPredictionResponse(
            predictions=predictions,
            total_processed=len(predictions),
            high_risk_count=high_risk,
            medium_risk_count=medium_risk,
            low_risk_count=low_risk
        )

    async def train_model(self, request: ModelTrainingRequest, training_data: pd.DataFrame, dataset_id: Optional[str] = None) -> ModelTrainingResponse:
        """Train a new churn prediction model with proper validation and calibration."""

        # Remember which dataset this model belongs to
        self.active_dataset_id = dataset_id

        # Prepare training data
        X, y = self._prepare_training_data(training_data)

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

        # Initialize model based on type with class imbalance handling
        if request.model_type == "xgboost":
            params = request.hyperparameters or {
                'n_estimators': 100,
                'max_depth': 5,
                'learning_rate': 0.1,
                'random_state': 42,
                'scale_pos_weight': class_imbalance_ratio,  # Handle imbalance
                'eval_metric': 'auc'
            }
            self.model = xgb.XGBClassifier(**params)
        elif request.model_type == "random_forest":
            params = request.hyperparameters or {
                'n_estimators': 100,
                'max_depth': 10,
                'random_state': 42,
                'class_weight': 'balanced'  # Handle imbalance
            }
            self.model = RandomForestClassifier(**params)
        elif request.model_type == "logistic":
            params = request.hyperparameters or {
                'random_state': 42,
                'max_iter': 1000,
                'class_weight': 'balanced'  # Handle imbalance
            }
            self.model = LogisticRegression(**params)

        # Fit scaler on training data only
        self.scaler.fit(X_train)
        X_train_scaled = self.scaler.transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # Train model on training data
        self.model.fit(X_train_scaled, y_train)

        # === IMPROVEMENT 3: Proper Validation Metrics (on TEST set) ===
        y_pred_test = self.model.predict(X_test_scaled)
        y_proba_test = self.model.predict_proba(X_test_scaled)[:, 1]

        # Basic metrics on test set
        metrics = {
            'accuracy': float(accuracy_score(y_test, y_pred_test)),
            'precision': float(precision_score(y_test, y_pred_test, zero_division=0)),
            'recall': float(recall_score(y_test, y_pred_test, zero_division=0)),
            'f1_score': float(f1_score(y_test, y_pred_test, zero_division=0)),
        }

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

        # Cross-validation scores (on full data for robustness estimate)
        if len(X) >= 50:
            try:
                X_all_scaled = self.scaler.transform(X)
                cv_scores = cross_val_score(self.model, X_all_scaled, y, cv=5, scoring='roc_auc')
                metrics['cv_roc_auc_mean'] = float(cv_scores.mean())
                metrics['cv_roc_auc_std'] = float(cv_scores.std())
            except Exception as e:
                logger.warning(f"Cross-validation failed: {e}")
                metrics['cv_roc_auc_mean'] = metrics.get('roc_auc', 0.5)
                metrics['cv_roc_auc_std'] = 0.0

        # Training set metrics (for reference)
        y_pred_train = self.model.predict(X_train_scaled)
        metrics['train_accuracy'] = float(accuracy_score(y_train, y_pred_train))
        metrics['class_imbalance_ratio'] = float(class_imbalance_ratio)
        metrics['test_size'] = len(y_test)
        metrics['train_size'] = len(y_train)

        # === IMPROVEMENT 5: Initialize SHAP Explainer ===
        if SHAP_AVAILABLE:
            try:
                if isinstance(self.model, (xgb.XGBClassifier, RandomForestClassifier)):
                    self.shap_explainer = shap.TreeExplainer(self.model)
                    logger.info("SHAP TreeExplainer initialized")
                else:
                    # For logistic regression, use KernelExplainer (slower)
                    background = shap.sample(X_train_scaled, min(100, len(X_train_scaled)))
                    self.shap_explainer = shap.KernelExplainer(self.model.predict_proba, background)
                    logger.info("SHAP KernelExplainer initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize SHAP explainer: {e}")
                self.shap_explainer = None

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

        # === IMPROVEMENT 7: Data-Driven Threshold Optimization ===
        optimal_thresholds = self._optimize_thresholds(y_test, y_proba_test)
        cache_key = dataset_id or "default"
        self.thresholds_by_dataset[cache_key] = optimal_thresholds
        metrics['optimal_high_threshold'] = optimal_thresholds['high']
        metrics['optimal_medium_threshold'] = optimal_thresholds['medium']

        # Get feature importance
        if hasattr(self.model, 'feature_importances_'):
            feature_names = [
                'satisfaction_level', 'last_evaluation', 'number_project',
                'average_monthly_hours', 'time_spend_company', 'work_accident',
                'promotion_last_5years', 'department', 'salary_level'
            ]
            self.feature_importance = dict(zip(feature_names, self.model.feature_importances_.tolist()))
        else:
            self.feature_importance = {}

        trained_at = datetime.utcnow()

        # Persist metrics for status checks (per dataset)
        model_id = f"{request.model_type}_{cache_key}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
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

        logger.info(f"Model trained: accuracy={metrics['accuracy']:.3f}, "
                   f"roc_auc={metrics.get('roc_auc', 0):.3f}, "
                   f"precision={metrics['precision']:.3f}, "
                   f"recall={metrics['recall']:.3f}")

        return ModelTrainingResponse(
            model_id=model_id,
            model_type=request.model_type,
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
            class_imbalance_ratio=metrics.get('class_imbalance_ratio')
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
