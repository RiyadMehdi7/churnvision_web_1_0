from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base


class User(Base):
    __tablename__ = "legacy_users"  # Renamed to avoid conflict with UserAccount in auth.py

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    tenant_id = Column(String, index=True, nullable=True)  # Multi-tenancy support
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    # SSO integration fields
    sso_provider = Column(String, nullable=True)  # oidc, ldap, saml
    sso_subject = Column(String, nullable=True, index=True)  # Unique ID from IdP
