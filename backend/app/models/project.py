from sqlalchemy import Column, String, DateTime, Boolean, func
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class Project(Base):
    __tablename__ = "projects"  # type: ignore[assignment]

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    path = Column(String, nullable=True, unique=True)
    db_path = Column(String, nullable=True, unique=True)
    is_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
