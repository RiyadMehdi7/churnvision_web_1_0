# ML Services Package
# Machine Learning, model training, and prediction services

from app.services.ml.churn_prediction_service import ChurnPredictionService, churn_prediction_service
from app.services.ml.ensemble_service import EnsembleService, EnsembleConfig
from app.services.ml.tabpfn_service import TabPFNWrapper, is_tabpfn_available, compute_permutation_importance
from app.services.ml.model_router_service import ModelRouterService, ModelRecommendation, model_router
from app.services.ml.model_drift_service import model_drift_service, ModelDriftService
from app.services.ml.model_intelligence_service import model_intelligence_service, ModelIntelligenceService
from app.services.ml.survival_analysis_service import survival_service, SurvivalAnalysisService
from app.services.ml.dataset_profiler_service import DatasetProfilerService, DatasetProfile

__all__ = [
    # Churn Prediction
    "ChurnPredictionService",
    "churn_prediction_service",
    # Ensemble
    "EnsembleService",
    "EnsembleConfig",
    # TabPFN
    "TabPFNWrapper",
    "is_tabpfn_available",
    "compute_permutation_importance",
    # Model Router
    "ModelRouterService",
    "ModelRecommendation",
    "model_router",
    # Model Drift
    "model_drift_service",
    "ModelDriftService",
    # Model Intelligence
    "model_intelligence_service",
    "ModelIntelligenceService",
    # Survival Analysis
    "survival_service",
    "SurvivalAnalysisService",
    # Dataset Profiler
    "DatasetProfilerService",
    "DatasetProfile",
]
