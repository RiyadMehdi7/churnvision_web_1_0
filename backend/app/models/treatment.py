from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Text, ForeignKey, Index, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class TreatmentDefinition(Base):
    __tablename__ = "treatment_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    base_cost = Column(Numeric, nullable=False)
    base_effect_size = Column(Numeric, nullable=True)
    targeted_variables_json = Column(Text, nullable=True)
    best_for_json = Column(Text, nullable=True)
    time_to_effect = Column(String, nullable=True)
    risk_levels_json = Column(Text, nullable=True)
    impact_factors_json = Column(Text, nullable=True)
    is_active = Column(Integer, default=1)
    is_custom = Column(Integer, default=0)
    llm_prompt = Column(Text, nullable=True)
    llm_reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    applications = relationship("TreatmentApplication", back_populates="treatment_definition", cascade="all, delete-orphan")


Index('idx_treatment_definitions_active', TreatmentDefinition.is_active)
Index('idx_treatment_definitions_custom', TreatmentDefinition.is_custom)


class TreatmentApplication(Base):
    __tablename__ = "treatment_applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String, nullable=True)
    hr_code = Column(String, ForeignKey("hr_data_input.hr_code", ondelete="CASCADE"), nullable=False)
    treatment_id = Column(Integer, ForeignKey("treatment_definitions.id", ondelete="CASCADE"), nullable=False)
    treatment_name = Column(String, nullable=False)
    treatment_type = Column(String, default='standard')
    applied_date = Column(DateTime(timezone=True), server_default=func.now())
    cost = Column(Numeric(10, 2), nullable=False)
    predicted_churn_reduction = Column(Numeric, default=0)
    predicted_cost = Column(Numeric(10, 2), default=0)
    predicted_roi = Column(Numeric, default=0)
    actual_cost = Column(Numeric(10, 2), nullable=True)
    pre_churn_probability = Column(Numeric(5, 3), nullable=False)
    post_churn_probability = Column(Numeric(5, 3), nullable=False)
    pre_eltv = Column(Numeric(10, 2), nullable=False)
    post_eltv = Column(Numeric(10, 2), nullable=False)
    roi = Column(Numeric(5, 2), nullable=False)
    status = Column(String, default='applied')  # applied, active, completed, cancelled
    success_indicator = Column(String, default='pending')  # pending, successful, failed, ongoing
    notes = Column(Text, nullable=True)
    applied_by = Column(String, default='system')
    follow_up_date = Column(Date, nullable=True)
    ab_group = Column(String, default='treatment')  # control, treatment
    is_simulation = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hr_data = relationship("HRDataInput", back_populates="treatment_applications")
    treatment_definition = relationship("TreatmentDefinition", back_populates="applications")


Index('idx_treatment_applications_hr_code', TreatmentApplication.hr_code)
Index('idx_treatment_applications_treatment_id', TreatmentApplication.treatment_id)
Index('idx_treatment_applications_applied_date', TreatmentApplication.applied_date)
Index('idx_treatment_applications_success', TreatmentApplication.success_indicator)
Index('idx_treatment_applications_simulation', TreatmentApplication.is_simulation)


class TreatmentRecommendation(Base):
    __tablename__ = "treatment_recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String, nullable=False)
    hr_code = Column(String, nullable=False)
    recommendation_date = Column(Date, nullable=False)
    churn_probability = Column(Numeric(5, 3), nullable=False)
    risk_level = Column(String, nullable=False)
    recommended_treatments = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=True)
    priority_score = Column(Numeric(3, 2), nullable=False)
    estimated_impact = Column(Numeric(5, 3), nullable=True)
    estimated_cost = Column(Numeric(10, 2), nullable=True)
    estimated_roi = Column(Numeric(8, 3), nullable=True)
    recommendation_status = Column(String, default='pending')
    applied_treatment_id = Column(Integer, nullable=True)
    rejection_reason = Column(String, nullable=True)
    expires_date = Column(Date, nullable=True)
    model_version = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RetentionValidation(Base):
    __tablename__ = "retention_validation"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(String, nullable=False)
    hr_code = Column(String, nullable=False)
    baseline_churn_prob = Column(Numeric(5, 3), nullable=False)
    treatment_applied = Column(Boolean, default=False, nullable=False)
    treatment_application_id = Column(Integer, nullable=True)
    validation_date = Column(Date, nullable=False)
    check_period = Column(Integer, nullable=False)
    still_employed = Column(Boolean, nullable=False)
    actual_churn_date = Column(Date, nullable=True)
    churn_reason = Column(String, nullable=True)
    new_churn_prob = Column(Numeric(5, 3), nullable=True)
    effectiveness_score = Column(Numeric(5, 3), nullable=True)
    confidence_interval_low = Column(Numeric(5, 3), nullable=True)
    confidence_interval_high = Column(Numeric(5, 3), nullable=True)
    validation_source = Column(String, default='hr_sync')
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_retention_val_employee_period', RetentionValidation.employee_id, RetentionValidation.check_period)


class ABTestGroup(Base):
    __tablename__ = "ab_test_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    test_name = Column(String, nullable=False)
    test_description = Column(Text, nullable=True)
    employee_id = Column(String, nullable=False)
    hr_code = Column(String, nullable=False)
    group_assignment = Column(String, nullable=False)
    baseline_churn_prob = Column(Numeric(5, 3), nullable=False)
    risk_category = Column(String, nullable=False)
    department = Column(String, nullable=True)
    position = Column(String, nullable=True)
    tenure_months = Column(Numeric(5, 1), nullable=True)
    assignment_date = Column(Date, nullable=False)
    test_duration_days = Column(Integer, default=180)
    test_status = Column(String, default='active')
    exclusion_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_ab_groups_test_assignment', ABTestGroup.test_name, ABTestGroup.group_assignment)


class TreatmentEffectiveness(Base):
    __tablename__ = "treatment_effectiveness"

    id = Column(Integer, primary_key=True, autoincrement=True)
    treatment_type = Column(String, nullable=False)
    treatment_name = Column(String, nullable=False)
    evaluation_period_start = Column(Date, nullable=False)
    evaluation_period_end = Column(Date, nullable=False)
    total_applications = Column(Integer, nullable=False)
    successful_retentions = Column(Integer, nullable=False)
    control_group_retentions = Column(Integer, nullable=True)
    effectiveness_rate = Column(Numeric(5, 3), nullable=False)
    average_cost = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)
    estimated_value_saved = Column(Numeric(12, 2), nullable=False)
    roi_ratio = Column(Numeric(8, 3), nullable=False)
    confidence_level = Column(Numeric(3, 2), default=0.95)
    statistical_significance = Column(Boolean, default=False)
    sample_size = Column(Integer, nullable=False)
    min_recommended_sample = Column(Integer, default=30)
    risk_category_breakdown = Column(Text, nullable=True)
    department_breakdown = Column(Text, nullable=True)
    tenure_breakdown = Column(Text, nullable=True)
    recommendations = Column(Text, nullable=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now())


class HRSyncLog(Base):
    __tablename__ = "hr_sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sync_date = Column(DateTime(timezone=True), nullable=False)
    connection_id = Column(String, nullable=False)
    sync_type = Column(String, nullable=False)
    records_processed = Column(Integer, nullable=False)
    records_updated = Column(Integer, nullable=False)
    records_new = Column(Integer, nullable=False)
    records_errors = Column(Integer, nullable=False)
    sync_duration_seconds = Column(Integer, nullable=False)
    error_details = Column(Text, nullable=True)
    success_rate = Column(Numeric(5, 3), nullable=False)
    sync_status = Column(String, nullable=False)
    triggered_by = Column(String, default='scheduled')
    next_sync_scheduled = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
