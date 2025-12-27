from app.db.base_class import Base
from sqlalchemy import Column, Integer, String, Float, Boolean

class Employee(Base):
    __tablename__ = "employees"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, index=True) # Multi-tenancy
    full_name = Column(String, nullable=False)
    role = Column(String)
    salary = Column(Float) # Encrypted at rest in Production
    is_active = Column(Boolean, default=True)
