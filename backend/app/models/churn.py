from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Text, ForeignKey, Index, JSON, PrimaryKeyConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class ELTVInput(Base):
    __tablename__ = "eltv_input"

    hr_code = Column(String, ForeignKey("hr_data_input.hr_code", ondelete="CASCADE"), primary_key=True)
    full_name = Column(String, nullable=False)
    employee_cost = Column(Numeric(10, 2), nullable=True)
    resign_proba = Column(Numeric(5, 3), nullable=False)
    periods = Column(Integer, default=36, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hr_data = relationship("HRDataInput", back_populates="eltv_input")
    eltv_output = relationship("ELTVOutput", back_populates="eltv_input", uselist=False, cascade="all, delete-orphan")


class ELTVOutput(Base):
    __tablename__ = "eltv_output"

    hr_code = Column(String, ForeignKey("eltv_input.hr_code", ondelete="CASCADE"), primary_key=True)
    eltv_pre_treatment = Column(Numeric(10, 2), nullable=False)
    eltv_post_treatment = Column(Numeric(10, 2), nullable=False)
    treatment_effect = Column(Numeric(10, 2), nullable=True)
    survival_probabilities = Column(JSON, nullable=False)
    model_version = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    eltv_input = relationship("ELTVInput", back_populates="eltv_output")


Index('idx_eltv_output_treatment_effect', ELTVOutput.treatment_effect)


class ChurnOutput(Base):
    __tablename__ = "churn_output"

    hr_code = Column(String, ForeignKey("hr_data_input.hr_code", ondelete="CASCADE"), nullable=False)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    resign_proba = Column(Numeric(5, 3), nullable=False)
    shap_values = Column(JSON, nullable=True)
    model_version = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    confidence_score = Column(Numeric, default=70.0)
    uncertainty_range = Column(String, nullable=True)
    counterfactuals = Column(Text, nullable=True)
    prediction_date = Column(String, nullable=True)

    __table_args__ = (
        PrimaryKeyConstraint('hr_code', 'dataset_id'),
    )

    # Relationships
    hr_data = relationship("HRDataInput", back_populates="churn_outputs")
    dataset = relationship("Dataset", back_populates="churn_outputs")


Index('idx_churn_output_resign_proba', ChurnOutput.resign_proba)


class ChurnModel(Base):
    __tablename__ = "churn_models"

    model_id = Column(Integer, primary_key=True)
    model_name = Column(String, nullable=False)
    model_version = Column(String, nullable=True, unique=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="SET NULL"), nullable=True, index=True)
    parameters = Column(JSON, nullable=False)
    training_data_info = Column(Text, nullable=True)
    performance_metrics = Column(JSON, nullable=True)
    metrics = Column(JSON, nullable=True)
    artifact_path = Column(String, nullable=True)
    scaler_path = Column(String, nullable=True)
    encoders_path = Column(String, nullable=True)
    trained_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Integer, default=0)
    pipeline_generated = Column(Integer, default=1)

    # Model routing fields (added for intelligent model selection)
    routing_decision_id = Column(Integer, ForeignKey("model_routing_decisions.id", ondelete="SET NULL"), nullable=True)
    is_ensemble = Column(Integer, default=0)
    ensemble_artifact_paths = Column(JSON, nullable=True)

    # Relationships
    routing_decision = relationship("ModelRoutingDecision", back_populates="churn_models")


class BusinessRule(Base):
    __tablename__ = "business_rules"

    rule_id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String, nullable=False)
    rule_description = Column(Text, nullable=True)
    rule_condition = Column(Text, nullable=False)
    adjustment_logic = Column(Text, nullable=True)
    priority = Column(Integer, default=1)
    is_active = Column(Integer, default=1)
    is_custom = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


Index('idx_business_rules_active', BusinessRule.is_active)
Index('idx_business_rules_priority', BusinessRule.priority)


class BehavioralStage(Base):
    __tablename__ = "behavioral_stages"

    stage_id = Column(Integer, primary_key=True, autoincrement=True)
    stage_name = Column(String, nullable=False, unique=True)
    stage_description = Column(Text, nullable=True)
    min_tenure = Column(Numeric, default=0)
    max_tenure = Column(Numeric, nullable=True)
    stage_indicators = Column(Text, nullable=True)
    base_risk_score = Column(Numeric, default=0.0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_behavioral_stages_active', BehavioralStage.is_active)


class ChurnReasoning(Base):
    __tablename__ = "churn_reasoning"

    hr_code = Column(String, ForeignKey("hr_data_input.hr_code", ondelete="CASCADE"), primary_key=True)
    churn_risk = Column(Numeric, nullable=False)
    stage = Column(String, nullable=False)
    stage_score = Column(Numeric, default=0.0)
    ml_score = Column(Numeric, default=0.0)
    heuristic_score = Column(Numeric, default=0.0)
    ml_contributors = Column(Text, nullable=True)
    heuristic_alerts = Column(Text, nullable=True)
    reasoning = Column(Text, nullable=True)
    recommendations = Column(Text, nullable=True)
    confidence_level = Column(Numeric, default=0.7)
    calculation_breakdown = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hr_data = relationship("HRDataInput", back_populates="churn_reasoning")


Index('idx_churn_reasoning_hr_code', ChurnReasoning.hr_code)
Index('idx_churn_reasoning_updated_at', ChurnReasoning.updated_at)
Index('idx_churn_reasoning_churn_risk', ChurnReasoning.churn_risk)
Index('idx_churn_reasoning_stage', ChurnReasoning.stage)
Index('idx_churn_reasoning_hr_code_updated', ChurnReasoning.hr_code, ChurnReasoning.updated_at)


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    job_id = Column(Integer, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    dataset = relationship("Dataset", back_populates="training_jobs")


Index('idx_training_jobs_dataset_id', TrainingJob.dataset_id)


class ModelFeatureImportance(Base):
    __tablename__ = "model_feature_importances"

    model_version = Column(String, nullable=False, primary_key=True)
    feature_name = Column(String, nullable=False, primary_key=True)
    importance = Column(Numeric, nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint('model_version', 'feature_name'),
    )


Index('idx_feature_importance_model', ModelFeatureImportance.model_version)


class DatasetProfileDB(Base):
    """
    Stores comprehensive dataset analysis results for model routing.

    This profile is computed when training is triggered and used by
    the ModelRouterService to select the optimal model.
    """
    __tablename__ = "dataset_profiles"

    id = Column(Integer, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False, unique=True)

    # Size metrics
    n_samples = Column(Integer, nullable=False)
    n_features = Column(Integer, nullable=False)
    n_numeric_features = Column(Integer, nullable=True)
    n_categorical_features = Column(Integer, nullable=True)

    # Class distribution
    n_classes = Column(Integer, nullable=True)
    class_balance_ratio = Column(Numeric(5, 4), nullable=True)
    is_severely_imbalanced = Column(Integer, default=0)

    # Missing data
    missing_ratio = Column(Numeric(5, 4), nullable=True)
    features_with_missing = Column(Integer, nullable=True)
    max_missing_per_feature = Column(Numeric(5, 4), nullable=True)

    # Outliers
    has_outliers = Column(Integer, default=0)
    outlier_ratio = Column(Numeric(5, 4), nullable=True)

    # Categorical analysis
    max_cardinality = Column(Integer, nullable=True)
    avg_cardinality = Column(Numeric(8, 2), nullable=True)
    high_cardinality_features = Column(Integer, nullable=True)

    # Correlation analysis
    max_feature_correlation = Column(Numeric(5, 4), nullable=True)
    highly_correlated_pairs = Column(Integer, nullable=True)
    target_correlation_max = Column(Numeric(5, 4), nullable=True)

    # Detailed stats (JSON)
    numeric_stats = Column(JSON, nullable=True)
    categorical_stats = Column(JSON, nullable=True)
    correlation_stats = Column(JSON, nullable=True)

    # Suitability scores (0-1)
    overall_quality_score = Column(Numeric(4, 3), nullable=True)
    tabpfn_suitability = Column(Numeric(4, 3), nullable=True)
    tree_model_suitability = Column(Numeric(4, 3), nullable=True)
    linear_model_suitability = Column(Numeric(4, 3), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    dataset = relationship("Dataset", back_populates="profile")


Index('idx_dataset_profiles_dataset_id', DatasetProfileDB.dataset_id)
Index('idx_dataset_profiles_n_samples', DatasetProfileDB.n_samples)
Index('idx_dataset_profiles_tabpfn_suitability', DatasetProfileDB.tabpfn_suitability)


class ModelRoutingDecision(Base):
    """
    Records automatic model selection decisions made by the router.

    Stores the reasoning and alternatives for transparency and debugging.
    """
    __tablename__ = "model_routing_decisions"

    id = Column(Integer, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    model_version = Column(String, nullable=True)

    # Primary decision
    selected_model = Column(String(50), nullable=False)  # 'tabpfn', 'xgboost', etc.
    confidence = Column(Numeric(4, 3), nullable=False)

    # Ensemble configuration
    is_ensemble = Column(Integer, default=0)
    ensemble_models = Column(JSON, nullable=True)  # ['xgboost', 'random_forest']
    ensemble_weights = Column(JSON, nullable=True)  # {'xgboost': 0.6, 'random_forest': 0.4}
    ensemble_method = Column(String(50), nullable=True)  # 'weighted_voting', 'stacking'

    # Reasoning
    reasoning = Column(JSON, nullable=True)  # ['Small dataset...', 'Low missing values...']
    alternative_models = Column(JSON, nullable=True)  # [{'model': 'xgboost', 'score': 0.8}]
    model_scores = Column(JSON, nullable=True)  # {'tabpfn': 0.9, 'xgboost': 0.75}

    # Timestamp
    decided_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    dataset = relationship("Dataset", back_populates="routing_decisions")
    churn_models = relationship("ChurnModel", back_populates="routing_decision")


Index('idx_routing_decisions_dataset', ModelRoutingDecision.dataset_id)
Index('idx_routing_decisions_selected_model', ModelRoutingDecision.selected_model)
Index('idx_routing_decisions_is_ensemble', ModelRoutingDecision.is_ensemble)
