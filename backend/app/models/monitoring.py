from sqlalchemy import Column, Integer, String, Numeric, DateTime, Text, Index
from sqlalchemy.sql import func
from app.db.base_class import Base


class ModelPerformance(Base):
    __tablename__ = "model_performance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evaluation_date = Column(DateTime(timezone=True), nullable=False)
    model_version = Column(String, nullable=False)
    prediction_period = Column(Integer, nullable=False)
    total_predictions = Column(Integer, nullable=False)
    correct_predictions = Column(Integer, nullable=False)
    false_positives = Column(Integer, nullable=False)
    false_negatives = Column(Integer, nullable=False)
    accuracy = Column(Numeric(5, 3), nullable=False)
    precision_score = Column(Numeric(5, 3), nullable=False)
    recall_score = Column(Numeric(5, 3), nullable=False)
    f1_score = Column(Numeric(5, 3), nullable=False)
    roc_auc = Column(Numeric(5, 3), nullable=False)
    calibration_score = Column(Numeric(5, 3), nullable=True)
    drift_score = Column(Numeric(5, 3), nullable=True)
    recommendations = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_model_perf_date_version', ModelPerformance.evaluation_date, ModelPerformance.model_version)


class ModelPerformanceMonitoring(Base):
    __tablename__ = "model_performance_monitoring"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    model_version = Column(String, nullable=False)
    metric_name = Column(String, nullable=False)
    metric_value = Column(Numeric, nullable=False)
    sample_size = Column(Integer, nullable=False)
    confidence_interval_low = Column(Numeric, nullable=True)
    confidence_interval_high = Column(Numeric, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_model_performance_version', ModelPerformanceMonitoring.model_version)


class DataDriftMonitoring(Base):
    __tablename__ = "data_drift_monitoring"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    feature_name = Column(String, nullable=False)
    drift_score = Column(Numeric, nullable=False)
    p_value = Column(Numeric, nullable=True)
    drift_type = Column(String, nullable=False)
    reference_period_start = Column(DateTime(timezone=True), nullable=False)
    reference_period_end = Column(DateTime(timezone=True), nullable=False)
    current_period_start = Column(DateTime(timezone=True), nullable=False)
    current_period_end = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_data_drift_feature', DataDriftMonitoring.feature_name)


class ModelAlert(Base):
    __tablename__ = "model_alerts"

    id = Column(String, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    message = Column(String, nullable=False)
    details = Column(Text, nullable=False)
    resolved = Column(Integer, default=0)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


Index('idx_model_alerts_type', ModelAlert.alert_type, ModelAlert.resolved)
