# Import all the models, so that Base has them before being
# imported by Alembic
from app.db.base_class import Base  # noqa

# Legacy models (keeping for backwards compatibility)
from app.models.employee import Employee  # noqa
from app.models.user import User  # noqa

# Authentication and RBAC models
from app.models.auth import UserAccount, Session, Role, Permission, RolePermission, UserRole  # noqa
from app.models.refresh_token import RefreshToken  # noqa

# Dataset and connection models
from app.models.dataset import Dataset, Connection, ScopedProject, ImportProfile  # noqa
from app.models.project import Project  # noqa

# HR data models
from app.models.hr_data import HRDataInput, EmployeeSnapshot, InterviewData  # noqa

# Churn and ELTV models
from app.models.churn import (  # noqa
    ELTVInput, ELTVOutput, ChurnOutput, ChurnModel,
    BusinessRule, BehavioralStage, ChurnReasoning,
    TrainingJob, ModelFeatureImportance
)

# Treatment models
from app.models.treatment import (  # noqa
    TreatmentDefinition, TreatmentApplication, TreatmentRecommendation,
    RetentionValidation, ABTestGroup, TreatmentEffectiveness, HRSyncLog
)

# Monitoring models
from app.models.monitoring import (  # noqa
    ModelPerformance, ModelPerformanceMonitoring,
    DataDriftMonitoring, ModelAlert
)

# Application settings
from app.models.app_settings import AppSettings  # noqa

# RAG models
from app.models.rag import RAGDocument, RAGChunk  # noqa

# Chatbot models
from app.models.chatbot import Conversation, Message, ChatMessage  # noqa

# Behavioral signals models (Slack/Teams metadata)
from app.models.behavioral_signals import EmployeeBehavioralSignals, BehavioralSignalsSyncLog  # noqa
