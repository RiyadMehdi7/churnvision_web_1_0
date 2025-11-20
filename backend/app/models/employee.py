from app.db.base_class import Base
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, index=True)
    full_name = Column(String, nullable=False)
    role = Column(String)
    salary = Column(Float)
    is_active = Column(Boolean, default=True)

    # Churn prediction features
    department = Column(String, nullable=True)
    satisfaction_level = Column(Float, nullable=True)
    last_evaluation = Column(Float, nullable=True)
    number_project = Column(Integer, nullable=True)
    average_monthly_hours = Column(Float, nullable=True)
    time_spend_company = Column(Integer, nullable=True)
    work_accident = Column(Boolean, default=False)
    promotion_last_5years = Column(Boolean, default=False)
    salary_level = Column(String, nullable=True)

    # Churn prediction results (cached)
    churn_probability = Column(Float, nullable=True)
    churn_risk_level = Column(String, nullable=True)
    last_prediction_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
