from sqlalchemy import Column, Integer, String, DateTime, Text, Index, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class Dataset(Base):
    __tablename__ = "datasets"

    dataset_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    row_count = Column(Integer, nullable=True)
    file_type = Column(String, nullable=True)
    size = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_active = Column(Integer, default=0, nullable=False)
    is_snapshot = Column(Integer, default=0, nullable=False)
    snapshot_group = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)
    file_path = Column(String, nullable=True)
    column_mapping = Column(JSON, nullable=True)

    # Relationships
    hr_data_inputs = relationship("HRDataInput", back_populates="dataset", cascade="all, delete-orphan")
    employee_snapshots = relationship("EmployeeSnapshot", back_populates="dataset", cascade="all, delete-orphan")
    training_jobs = relationship("TrainingJob", back_populates="dataset", cascade="all, delete-orphan")
    churn_outputs = relationship("ChurnOutput", back_populates="dataset", cascade="all, delete-orphan")
    project = relationship("Project", back_populates="datasets")


# Indexes
Index('idx_datasets_upload_date', Dataset.upload_date)
Index('idx_datasets_is_active', Dataset.is_active)


class Connection(Base):
    __tablename__ = "connections"

    connection_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    database_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Integer, default=1)

    # Relationships
    import_profiles = relationship("ImportProfile", back_populates="connection", cascade="all, delete-orphan")


Index('idx_connections_name', Connection.name)
Index('idx_connections_type', Connection.type)


class ScopedProject(Base):
    __tablename__ = "scoped_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scope_level = Column(String, nullable=False)  # 'manager' or 'director'
    scope_id = Column(String, nullable=False)
    project_dir = Column(String, nullable=False)
    project_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_synced_at = Column(DateTime(timezone=True), server_default=func.now())
    active = Column(Integer, default=1)


Index('idx_scoped_projects_scope', ScopedProject.scope_level, ScopedProject.scope_id, unique=True)


class ImportProfile(Base):
    __tablename__ = "import_profiles"

    id = Column(String, primary_key=True)
    connection_id = Column(String, ForeignKey("connections.connection_id"), nullable=False)
    name = Column(String, nullable=False)
    dataset_name = Column(String, nullable=False)
    query = Column(Text, nullable=True)
    table_name = Column(String, nullable=True)
    row_limit = Column(Integer, default=100000)
    mappings_json = Column(Text, nullable=False)
    schedule_interval_minutes = Column(Integer, default=0)
    is_enabled = Column(Integer, default=0)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    connection = relationship("Connection", back_populates="import_profiles")


Index('idx_import_profiles_enabled', ImportProfile.is_enabled)
