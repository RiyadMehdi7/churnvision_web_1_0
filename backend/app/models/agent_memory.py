"""
Agent Memory Models

Stores agent session context for cross-session persistence:
- Employees discussed
- Insights discovered
- Decisions made
- User preferences
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class AgentSession(Base):
    """
    Stores agent session data for a user.
    Each user has one active session that persists across browser sessions.
    """
    __tablename__ = "agent_sessions"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    session_id = Column(String, nullable=False, index=True)

    # Employees discussed in this session (JSON array)
    employees_discussed = Column(JSON, nullable=True, default=list)

    # Recent insights/decisions (JSON array of MemoryItem objects)
    recent_decisions = Column(JSON, nullable=True, default=list)

    # User preferences learned over time
    preferences = Column(JSON, nullable=True, default=dict)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    # Relationship
    user = relationship("UserAccount", back_populates="agent_session")


class AgentInsight(Base):
    """
    Stores individual insights discovered during conversations.
    Allows for organizational learning across users.
    """
    __tablename__ = "agent_insights"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    # Insight details
    insight_type = Column(String, nullable=False, index=True)  # 'employee_discussed', 'decision_made', 'insight_found', 'action_taken'
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)

    # Related entities (for organizational learning)
    related_employee_hr_code = Column(String, nullable=True, index=True)
    related_department = Column(String, nullable=True, index=True)

    # Full context (JSON for flexibility)
    context = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OrganizationalPattern(Base):
    """
    Stores patterns discovered across the organization.
    Used for advanced recommendations.
    """
    __tablename__ = "organizational_patterns"  # type: ignore[assignment]

    id = Column(Integer, primary_key=True, index=True)

    # Pattern identification
    pattern_type = Column(String, nullable=False, index=True)  # 'risk_pattern', 'treatment_effectiveness', 'department_trend'
    pattern_key = Column(String, nullable=False, index=True)   # Unique identifier for the pattern

    # Pattern data
    description = Column(Text, nullable=True)
    data = Column(JSON, nullable=False)

    # Statistics
    occurrence_count = Column(Integer, default=1)
    confidence_score = Column(Integer, default=50)  # 0-100

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


# Indexes for efficient querying
Index('idx_agent_sessions_user_id', AgentSession.user_id)
Index('idx_agent_insights_user_type', AgentInsight.user_id, AgentInsight.insight_type)
Index('idx_agent_insights_employee', AgentInsight.related_employee_hr_code)
Index('idx_org_patterns_type_key', OrganizationalPattern.pattern_type, OrganizationalPattern.pattern_key)
