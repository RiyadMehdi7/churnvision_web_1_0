from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path
import pickle

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder, StandardScaler

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


class ChurnPredictionService:
    """Service for employee churn prediction using ML models"""

    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.feature_importance = {}
        self.model_metrics = {}
        self.active_version: Optional[str] = None
        model_dir = Path(settings.MODELS_DIR)
        self.model_path = model_dir / "churn_model.pkl"
        self.scaler_path = model_dir / "scaler.pkl"
        self.encoders_path = model_dir / "encoders.pkl"

        # Ensure models directory exists
        self.model_path.parent.mkdir(parents=True, exist_ok=True)

        # Load existing model if available
        self._load_model()

    def _load_model(self) -> bool:
        """Load saved model, scaler, and encoders"""
        try:
            if self.model_path.exists():
                with open(self.model_path, 'rb') as f:
                    self.model = pickle.load(f)

                with open(self.scaler_path, 'rb') as f:
                    self.scaler = pickle.load(f)

                with open(self.encoders_path, 'rb') as f:
                    self.label_encoders = pickle.load(f)

                self.active_version = self.model_path.stem
                return True
            else:
                if settings.ENVIRONMENT == "production":
                    raise RuntimeError(f"Model artifacts missing at {self.model_path}. Train a model before serving.")
                # In development, initialize a default model for convenience
                self._initialize_default_model()
                self.active_version = "dev-default"
                return False
        except Exception as e:
            print(f"Error loading model: {e}")
            if settings.ENVIRONMENT == "production":
                raise
            self._initialize_default_model()
            self.active_version = "dev-default"
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

    def _save_model(self):
        """Save model, scaler, and encoders to disk"""
        try:
            with open(self.model_path, 'wb') as f:
                pickle.dump(self.model, f)

            with open(self.scaler_path, 'wb') as f:
                pickle.dump(self.scaler, f)

            with open(self.encoders_path, 'wb') as f:
                pickle.dump(self.label_encoders, f)
        except Exception as e:
            print(f"Error saving model: {e}")

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

    def _determine_risk_level(self, probability: float) -> ChurnRiskLevel:
        """Determine risk level based on churn probability (3 levels: Low, Medium, High)"""
        if probability >= 0.60:
            return ChurnRiskLevel.HIGH
        elif probability >= 0.30:
            return ChurnRiskLevel.MEDIUM
        else:
            return ChurnRiskLevel.LOW

    def _get_contributing_factors(self, features: EmployeeChurnFeatures, probability: float) -> List[Dict[str, Any]]:
        """Identify top contributing factors for churn risk"""
        factors = []

        # Low satisfaction is a major factor
        if features.satisfaction_level < 0.4:
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "impact": "critical",
                "message": f"Very low satisfaction level ({features.satisfaction_level:.2f})"
            })
        elif features.satisfaction_level < 0.6:
            factors.append({
                "feature": "satisfaction_level",
                "value": features.satisfaction_level,
                "impact": "high",
                "message": f"Low satisfaction level ({features.satisfaction_level:.2f})"
            })

        # Overwork indicator
        if features.average_monthly_hours > 250:
            factors.append({
                "feature": "average_monthly_hours",
                "value": features.average_monthly_hours,
                "impact": "high",
                "message": f"High workload ({features.average_monthly_hours:.0f} hours/month)"
            })

        # Too many or too few projects
        if features.number_project > 6:
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "impact": "medium",
                "message": f"High project count ({features.number_project} projects)"
            })
        elif features.number_project < 2:
            factors.append({
                "feature": "number_project",
                "value": features.number_project,
                "impact": "medium",
                "message": f"Low project engagement ({features.number_project} projects)"
            })

        # Low evaluation score
        if features.last_evaluation < 0.5:
            factors.append({
                "feature": "last_evaluation",
                "value": features.last_evaluation,
                "impact": "high",
                "message": f"Low performance evaluation ({features.last_evaluation:.2f})"
            })

        # Long tenure without promotion
        if features.time_spend_company > 4 and not features.promotion_last_5years:
            factors.append({
                "feature": "promotion_last_5years",
                "value": False,
                "impact": "medium",
                "message": f"No promotion in {features.time_spend_company} years"
            })

        # Salary level
        if features.salary_level == "low":
            factors.append({
                "feature": "salary_level",
                "value": features.salary_level,
                "impact": "medium",
                "message": "Low salary level"
            })

        return factors[:5]  # Return top 5 factors

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

    async def predict_churn(self, request: ChurnPredictionRequest) -> ChurnPredictionResponse:
        """Predict churn probability for a single employee"""

        # Prepare features
        features_array = self._prepare_features(request.features)

        # Get prediction
        if self.model is None:
            if settings.ENVIRONMENT == "production":
                raise RuntimeError("No trained model loaded. Train a model before serving predictions.")
            # If no trained model, use heuristic-based prediction
            probability = self._heuristic_prediction(request.features)
        else:
            probability = float(self.model.predict_proba(features_array)[0][1])

        # Determine risk level
        risk_level = self._determine_risk_level(probability)

        # Get contributing factors
        contributing_factors = self._get_contributing_factors(request.features, probability)

        # Get recommendations
        recommendations = self._get_recommendations(request.features, contributing_factors)

        return ChurnPredictionResponse(
            employee_id=request.employee_id,
            churn_probability=probability,
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

    async def predict_batch(self, request: BatchChurnPredictionRequest) -> BatchChurnPredictionResponse:
        """Predict churn for multiple employees"""
        predictions = []

        for pred_request in request.predictions:
            prediction = await self.predict_churn(pred_request)
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

    async def train_model(self, request: ModelTrainingRequest, training_data: pd.DataFrame) -> ModelTrainingResponse:
        """Train a new churn prediction model"""

        # Prepare training data
        X, y = self._prepare_training_data(training_data)

        # Initialize model based on type
        if request.model_type == "xgboost":
            params = request.hyperparameters or {
                'n_estimators': 100,
                'max_depth': 5,
                'learning_rate': 0.1,
                'random_state': 42
            }
            self.model = xgb.XGBClassifier(**params)
        elif request.model_type == "random_forest":
            params = request.hyperparameters or {
                'n_estimators': 100,
                'max_depth': 10,
                'random_state': 42
            }
            self.model = RandomForestClassifier(**params)
        elif request.model_type == "logistic":
            params = request.hyperparameters or {
                'random_state': 42,
                'max_iter': 1000
            }
            self.model = LogisticRegression(**params)

        # Fit scaler
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)

        # Train model
        self.model.fit(X_scaled, y)

        # Calculate metrics
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        y_pred = self.model.predict(X_scaled)

        metrics = {
            'accuracy': float(accuracy_score(y, y_pred)),
            'precision': float(precision_score(y, y_pred)),
            'recall': float(recall_score(y, y_pred)),
            'f1_score': float(f1_score(y, y_pred))
        }

        # Get feature importance
        if hasattr(self.model, 'feature_importances_'):
            feature_names = [
                'satisfaction_level', 'last_evaluation', 'number_project',
                'average_monthly_hours', 'time_spend_company', 'work_accident',
                'promotion_last_5years', 'department', 'salary_level'
            ]
            self.feature_importance = dict(zip(feature_names, self.model.feature_importances_.tolist()))

        trained_at = datetime.utcnow()

        # Persist metrics for status checks
        self.model_metrics = {
            **metrics,
            'trained_at': trained_at,
            'predictions_made': 0
        }

        # Save model
        self._save_model()

        model_id = f"{request.model_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        self.active_version = model_id

        return ModelTrainingResponse(
            model_id=model_id,
            model_type=request.model_type,
            accuracy=metrics['accuracy'],
            precision=metrics['precision'],
            recall=metrics['recall'],
            f1_score=metrics['f1_score'],
            trained_at=trained_at,
            training_samples=len(X),
            feature_importance=self.feature_importance
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
