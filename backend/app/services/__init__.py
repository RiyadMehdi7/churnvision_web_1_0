# Services Package
# Re-exports for backward compatibility

# ML Services
from app.services.ml.churn_prediction_service import ChurnPredictionService, churn_prediction_service
from app.services.ml.ensemble_service import EnsembleService, EnsembleConfig
from app.services.ml.tabpfn_service import TabPFNWrapper, is_tabpfn_available, compute_permutation_importance
from app.services.ml.model_router_service import ModelRouterService, ModelRecommendation, model_router
from app.services.ml.model_drift_service import model_drift_service, ModelDriftService
from app.services.ml.model_intelligence_service import model_intelligence_service, ModelIntelligenceService
from app.services.ml.survival_analysis_service import survival_service, SurvivalAnalysisService
from app.services.ml.dataset_profiler_service import DatasetProfilerService, DatasetProfile

# AI Services
from app.services.ai.chatbot_service import ChatbotService
from app.services.ai.intelligent_chatbot import IntelligentChatbotService, PatternType
from app.services.ai.llm_config import (
    resolve_llm_provider_and_model,
    get_model_from_alias,
    is_reasoning_model,
    get_available_providers,
    get_available_models,
)
from app.services.ai.rag_service import RAGService
from app.services.ai.vector_store_service import get_vector_store, VectorStoreService
from app.services.ai.document_processor_service import DocumentProcessor
from app.services.ai.treatment_generation_service import TreatmentGenerationService
from app.services.ai.action_generation_service import ActionGenerationService

# Analytics Services
from app.services.analytics.eltv_service import ELTVService, eltv_service
from app.services.analytics.roi_dashboard_service import roi_dashboard_service, ROIDashboardService
from app.services.analytics.recommendation_service import recommendation_service, RecommendationService
from app.services.analytics.risk_alert_service import risk_alert_service, RiskAlertService
from app.services.analytics.outcome_tracking_service import outcome_tracking_service, OutcomeTrackingService
from app.services.analytics.behavioral_stage_service import behavioral_stage_service, StageResult
from app.services.analytics.peer_statistics_service import peer_statistics_service, PeerComparison, RiskThresholds
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service, DatasetThresholds

# Data Services
from app.services.data.dataset_service import get_active_dataset, get_active_dataset_id, get_active_dataset_entry
from app.services.data.data_quality_service import assess_data_quality, DataQualityReport
from app.services.data import cached_queries_service
from app.services.data.project_service import get_active_project, ensure_default_project

# Treatment Services
from app.services.treatments.treatment_service import treatment_validation_service, TreatmentValidationService
from app.services.treatments.treatment_mapping_service import treatment_mapping_service, TreatmentMappingService
from app.services.treatments.business_rule_service import business_rule_service, HeuristicResult

# Compliance Services
from app.services.compliance.gdpr_service import get_gdpr_service, DATA_CATEGORIES
from app.services.compliance.pii_masking_service import (
    PIIMaskingService,
    get_pii_masking_service,
    mask_pii_in_text,
    mask_pii_in_dict,
)
from app.services.compliance.license_sync_service import get_license_sync_service, LicenseSyncService
from app.services.compliance.admin_panel_client import get_admin_panel_client, AdminPanelClient

# Reasoning Services
from app.services.reasoning.churn_reasoning_orchestrator import (
    churn_reasoning_orchestrator,
    ChurnReasoningOrchestrator,
    OrchestratedReasoning,
)
from app.services.reasoning.interview_insight_service import interview_insight_service, InterviewAnalysisResult

# Settings Services
from app.services.settings.app_settings_service import AppSettingsService, normalize_ai_provider

# Tools (sub-package)
from app.services import tools

__all__ = [
    # ML
    "ChurnPredictionService",
    "churn_prediction_service",
    "EnsembleService",
    "EnsembleConfig",
    "TabPFNWrapper",
    "is_tabpfn_available",
    "compute_permutation_importance",
    "ModelRouterService",
    "ModelRecommendation",
    "model_router",
    "model_drift_service",
    "ModelDriftService",
    "model_intelligence_service",
    "ModelIntelligenceService",
    "survival_service",
    "SurvivalAnalysisService",
    "DatasetProfilerService",
    "DatasetProfile",
    # AI
    "ChatbotService",
    "IntelligentChatbotService",
    "PatternType",
    "resolve_llm_provider_and_model",
    "get_model_from_alias",
    "is_reasoning_model",
    "get_available_providers",
    "get_available_models",
    "RAGService",
    "get_vector_store",
    "VectorStoreService",
    "DocumentProcessor",
    "TreatmentGenerationService",
    "ActionGenerationService",
    # Analytics
    "ELTVService",
    "eltv_service",
    "roi_dashboard_service",
    "ROIDashboardService",
    "recommendation_service",
    "RecommendationService",
    "risk_alert_service",
    "RiskAlertService",
    "outcome_tracking_service",
    "OutcomeTrackingService",
    "behavioral_stage_service",
    "StageResult",
    "peer_statistics_service",
    "PeerComparison",
    "RiskThresholds",
    "data_driven_thresholds_service",
    "DatasetThresholds",
    # Data
    "get_active_dataset",
    "get_active_dataset_id",
    "get_active_dataset_entry",
    "assess_data_quality",
    "DataQualityReport",
    "cached_queries_service",
    "get_active_project",
    "ensure_default_project",
    # Treatments
    "treatment_validation_service",
    "TreatmentValidationService",
    "treatment_mapping_service",
    "TreatmentMappingService",
    "business_rule_service",
    "HeuristicResult",
    # Compliance
    "get_gdpr_service",
    "DATA_CATEGORIES",
    "PIIMaskingService",
    "get_pii_masking_service",
    "mask_pii_in_text",
    "mask_pii_in_dict",
    "get_license_sync_service",
    "LicenseSyncService",
    "get_admin_panel_client",
    "AdminPanelClient",
    # Reasoning
    "churn_reasoning_orchestrator",
    "ChurnReasoningOrchestrator",
    "OrchestratedReasoning",
    "interview_insight_service",
    "InterviewAnalysisResult",
    # Settings
    "AppSettingsService",
    "normalize_ai_provider",
    # Tools
    "tools",
]
