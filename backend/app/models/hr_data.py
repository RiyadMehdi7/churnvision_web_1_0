from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, Text, ForeignKey, Index, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class HRDataInput(Base):
    __tablename__ = "hr_data_input"

    hr_code = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    full_name = Column(String, nullable=False)
    structure_name = Column(String, nullable=False)
    position = Column(String, nullable=False)
    status = Column(String, nullable=False)
    manager_id = Column(String, nullable=False)
    tenure = Column(Numeric, nullable=False)
    employee_cost = Column(Numeric(10, 2), nullable=True)
    report_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    additional_data = Column(JSON, nullable=True)

    # Relationships
    dataset = relationship("Dataset", back_populates="hr_data_inputs")
    eltv_input = relationship("ELTVInput", back_populates="hr_data", uselist=False, cascade="all, delete-orphan")
    churn_outputs = relationship("ChurnOutput", back_populates="hr_data", cascade="all, delete-orphan")
    churn_reasoning = relationship("ChurnReasoning", back_populates="hr_data", uselist=False, cascade="all, delete-orphan")
    treatment_applications = relationship("TreatmentApplication", back_populates="hr_data", cascade="all, delete-orphan")
    interview_data = relationship("InterviewData", back_populates="hr_data", cascade="all, delete-orphan")


# Indexes
Index('idx_hr_data_manager_id', HRDataInput.manager_id)
Index('idx_hr_data_report_date', HRDataInput.report_date)
Index('idx_hr_data_status', HRDataInput.status)
Index('idx_hr_data_structure', HRDataInput.structure_name)
Index('idx_hr_data_hr_code', HRDataInput.hr_code)
Index('idx_hr_data_employee_cost', HRDataInput.employee_cost)
Index('idx_hr_data_status_hr_code', HRDataInput.status, HRDataInput.hr_code)
Index('idx_hr_data_active_cost', HRDataInput.status, HRDataInput.employee_cost)


class EmployeeSnapshot(Base):
    __tablename__ = "employee_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(String, ForeignKey("datasets.dataset_id", ondelete="CASCADE"), nullable=False)
    hr_code = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    structure_name = Column(String, nullable=False)
    position = Column(String, nullable=False)
    status = Column(String, nullable=False)
    manager_id = Column(String, nullable=False)
    tenure = Column(Numeric, nullable=False)
    employee_cost = Column(Numeric(10, 2), nullable=True)
    report_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    additional_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    dataset = relationship("Dataset", back_populates="employee_snapshots")


Index('idx_snapshots_dataset', EmployeeSnapshot.dataset_id)
Index('idx_snapshots_hr_code', EmployeeSnapshot.hr_code)
Index('idx_snapshots_manager', EmployeeSnapshot.manager_id)
Index('idx_snapshots_report_date', EmployeeSnapshot.report_date)


class InterviewData(Base):
    __tablename__ = "interview_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hr_code = Column(String, ForeignKey("hr_data_input.hr_code", ondelete="CASCADE"), nullable=False)
    interview_date = Column(Date, nullable=False)
    interview_type = Column(String, nullable=False)  # 'stay' or 'exit'
    notes = Column(Text, nullable=False)
    sentiment_score = Column(Numeric, nullable=True)
    processed_insights = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hr_data = relationship("HRDataInput", back_populates="interview_data")


Index('idx_interview_data_hr_code', InterviewData.hr_code)
Index('idx_interview_data_interview_date', InterviewData.interview_date)
Index('idx_interview_data_interview_type', InterviewData.interview_type)
