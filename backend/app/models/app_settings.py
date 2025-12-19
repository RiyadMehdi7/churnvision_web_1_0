"""
Application-wide settings stored in the database.

These settings back admin-tunable controls that must persist across restarts
and be consistent across multiple instances.
"""

from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime
from sqlalchemy.sql import func

from app.db.base_class import Base


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)

    # Feature controls
    strict_offline_mode = Column(Boolean, default=False, nullable=False)

    # Risk threshold override (None => use dynamic thresholds)
    risk_thresholds_override_high = Column(Float, nullable=True)
    risk_thresholds_override_medium = Column(Float, nullable=True)

    # AI provider selection (frontend provider IDs: local/openai/auto/microsoft/qwen/mistral/ibm)
    ai_provider = Column(String(50), default="local", nullable=False)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
