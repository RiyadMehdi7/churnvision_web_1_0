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
    parameters = Column(JSON, nullable=False)
    training_data_info = Column(Text, nullable=True)
    performance_metrics = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Integer, default=0)
    pipeline_generated = Column(Integer, default=1)


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
