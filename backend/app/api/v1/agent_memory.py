"""
Agent Memory API

Endpoints for persisting and retrieving agent session context,
insights, and organizational patterns.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import uuid

from app.api.deps import get_current_user, get_db
from app.models.auth import UserAccount
from app.models.agent_memory import AgentSession, AgentInsight, OrganizationalPattern

router = APIRouter()


# --- Request/Response Models ---

class EmployeeDiscussed(BaseModel):
    hrCode: str
    name: str
    lastDiscussed: str
    riskLevel: Optional[str] = None


class MemoryItem(BaseModel):
    id: str
    type: str  # 'employee_discussed', 'decision_made', 'insight_found', 'action_taken'
    title: str
    summary: str
    timestamp: str
    relatedEntities: Optional[Dict[str, Any]] = None


class SyncMemoryRequest(BaseModel):
    sessionId: str
    employeesDiscussed: List[EmployeeDiscussed] = Field(default_factory=list)
    recentDecisions: List[MemoryItem] = Field(default_factory=list)


class MemoryResponse(BaseModel):
    sessionId: str
    employeesDiscussed: List[EmployeeDiscussed]
    recentDecisions: List[MemoryItem]
    lastUpdated: Optional[str] = None


class AddInsightRequest(BaseModel):
    insightType: str
    title: str
    summary: Optional[str] = None
    relatedEmployeeHrCode: Optional[str] = None
    relatedDepartment: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class InsightResponse(BaseModel):
    id: int
    insightType: str
    title: str
    summary: Optional[str]
    relatedEmployeeHrCode: Optional[str]
    createdAt: str


# --- Endpoints ---

@router.post("/sync", response_model=MemoryResponse)
async def sync_memory(
    request: SyncMemoryRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Sync agent memory to backend for cross-session persistence.
    Creates or updates the user's agent session.
    """
    # Find existing session or create new
    result = await db.execute(
        select(AgentSession).where(AgentSession.user_id == current_user.user_id)
    )
    session = result.scalar_one_or_none()

    # Convert to storage format
    employees_data = [emp.model_dump() for emp in request.employeesDiscussed]
    decisions_data = [dec.model_dump() for dec in request.recentDecisions]

    if session:
        # Update existing
        session.session_id = request.sessionId
        session.employees_discussed = employees_data
        session.recent_decisions = decisions_data
    else:
        # Create new
        session = AgentSession(
            user_id=current_user.user_id,
            session_id=request.sessionId,
            employees_discussed=employees_data,
            recent_decisions=decisions_data,
        )
        db.add(session)

    await db.commit()
    await db.refresh(session)

    return MemoryResponse(
        sessionId=session.session_id,
        employeesDiscussed=request.employeesDiscussed,
        recentDecisions=request.recentDecisions,
        lastUpdated=session.updated_at.isoformat() if session.updated_at else None
    )


@router.get("/load", response_model=MemoryResponse)
async def load_memory(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Load agent memory from backend.
    Returns empty data if no session exists.
    """
    result = await db.execute(
        select(AgentSession).where(AgentSession.user_id == current_user.user_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        return MemoryResponse(
            sessionId=str(uuid.uuid4()),
            employeesDiscussed=[],
            recentDecisions=[],
        )

    # Convert from storage format
    employees = [
        EmployeeDiscussed(**emp) for emp in (session.employees_discussed or [])
    ]
    decisions = [
        MemoryItem(**dec) for dec in (session.recent_decisions or [])
    ]

    return MemoryResponse(
        sessionId=session.session_id,
        employeesDiscussed=employees,
        recentDecisions=decisions,
        lastUpdated=session.updated_at.isoformat() if session.updated_at else None
    )


@router.delete("/clear")
async def clear_memory(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clear all agent memory for the current user.
    """
    result = await db.execute(
        select(AgentSession).where(AgentSession.user_id == current_user.user_id)
    )
    session = result.scalar_one_or_none()

    if session:
        session.employees_discussed = []
        session.recent_decisions = []
        session.session_id = str(uuid.uuid4())
        await db.commit()

    return {"success": True, "message": "Memory cleared"}


@router.post("/insights", response_model=InsightResponse)
async def add_insight(
    request: AddInsightRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Store a new insight for organizational learning.
    """
    insight = AgentInsight(
        user_id=current_user.user_id,
        insight_type=request.insightType,
        title=request.title,
        summary=request.summary,
        related_employee_hr_code=request.relatedEmployeeHrCode,
        related_department=request.relatedDepartment,
        context=request.context,
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)

    return InsightResponse(
        id=insight.id,
        insightType=insight.insight_type,
        title=insight.title,
        summary=insight.summary,
        relatedEmployeeHrCode=insight.related_employee_hr_code,
        createdAt=insight.created_at.isoformat()
    )


@router.get("/insights", response_model=List[InsightResponse])
async def get_insights(
    limit: int = 50,
    insight_type: Optional[str] = None,
    employee_hr_code: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent insights for the current user.
    """
    query = select(AgentInsight).where(
        AgentInsight.user_id == current_user.user_id
    ).order_by(AgentInsight.created_at.desc()).limit(limit)

    if insight_type:
        query = query.where(AgentInsight.insight_type == insight_type)
    if employee_hr_code:
        query = query.where(AgentInsight.related_employee_hr_code == employee_hr_code)

    result = await db.execute(query)
    insights = result.scalars().all()

    return [
        InsightResponse(
            id=i.id,
            insightType=i.insight_type,
            title=i.title,
            summary=i.summary,
            relatedEmployeeHrCode=i.related_employee_hr_code,
            createdAt=i.created_at.isoformat()
        )
        for i in insights
    ]


@router.get("/insights/employee/{hr_code}", response_model=List[InsightResponse])
async def get_employee_insights(
    hr_code: str,
    limit: int = 20,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get insights related to a specific employee.
    """
    result = await db.execute(
        select(AgentInsight)
        .where(
            AgentInsight.user_id == current_user.user_id,
            AgentInsight.related_employee_hr_code == hr_code
        )
        .order_by(AgentInsight.created_at.desc())
        .limit(limit)
    )
    insights = result.scalars().all()

    return [
        InsightResponse(
            id=i.id,
            insightType=i.insight_type,
            title=i.title,
            summary=i.summary,
            relatedEmployeeHrCode=i.related_employee_hr_code,
            createdAt=i.created_at.isoformat()
        )
        for i in insights
    ]


@router.get("/patterns")
async def get_organizational_patterns(
    pattern_type: Optional[str] = None,
    limit: int = 20,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get organizational patterns discovered across all users.
    Used for advanced recommendations.
    """
    query = select(OrganizationalPattern).order_by(
        OrganizationalPattern.occurrence_count.desc()
    ).limit(limit)

    if pattern_type:
        query = query.where(OrganizationalPattern.pattern_type == pattern_type)

    result = await db.execute(query)
    patterns = result.scalars().all()

    return [
        {
            "id": p.id,
            "patternType": p.pattern_type,
            "patternKey": p.pattern_key,
            "description": p.description,
            "occurrenceCount": p.occurrence_count,
            "confidenceScore": p.confidence_score,
        }
        for p in patterns
    ]
