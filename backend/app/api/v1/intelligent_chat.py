from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_db
from app.models.auth import UserAccount
from app.services.intelligent_chatbot import IntelligentChatbotService
from app.models.chatbot import ChatMessage
from sqlalchemy import select, desc

router = APIRouter()


class IntelligentChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    session_id: str = Field(..., description="Session ID for conversation tracking")
    employee_id: Optional[str] = Field(None, description="Optional employee context (HR code)")


class IntelligentChatResponse(BaseModel):
    response: str
    session_id: str
    pattern_detected: Optional[str] = None


class ChatHistoryResponse(BaseModel):
    id: int
    session_id: str
    employee_id: Optional[str]
    message: str
    role: str
    timestamp: str

    class Config:
        from_attributes = True


@router.post("/chat", response_model=IntelligentChatResponse)
async def intelligent_chat(
    request: IntelligentChatRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Intelligent chat endpoint that understands ChurnVision-specific queries.

    Automatically detects patterns such as:
    - Churn risk diagnosis ("Why is John Smith at high risk?")
    - Retention plan generation ("Create a retention plan for Mike Chen")
    - Employee comparison ("Compare Sarah with similar resigned employees")
    - Exit pattern mining ("Show common exit patterns")
    - SHAP explanations ("What factors contribute to risk?")
    - General chat (falls back to LLM)
    """
    service = IntelligentChatbotService(db)

    try:
        # Process message with intelligence
        response = await service.chat(
            message=request.message,
            session_id=request.session_id,
            employee_id=request.employee_id
        )

        return IntelligentChatResponse(
            response=response,
            session_id=request.session_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing chat request: {str(e)}"
        )


@router.get("/history/{session_id}", response_model=List[ChatHistoryResponse])
async def get_chat_history(
    session_id: str,
    limit: int = 50,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get chat history for a specific session.

    - **session_id**: The session ID to retrieve history for
    - **limit**: Maximum number of messages to return (default: 50)
    """
    query = select(ChatMessage).where(
        ChatMessage.session_id == session_id
    ).order_by(desc(ChatMessage.timestamp)).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()

    # Reverse to get chronological order
    messages = list(reversed(messages))

    return [
        ChatHistoryResponse(
            id=msg.id,
            session_id=msg.session_id,
            employee_id=msg.employee_id,
            message=msg.message,
            role=msg.role,
            timestamp=msg.timestamp.isoformat() if msg.timestamp else ""
        )
        for msg in messages
    ]


@router.delete("/history/{session_id}")
async def delete_chat_history(
    session_id: str,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete all chat history for a specific session.

    - **session_id**: The session ID to delete
    """
    query = select(ChatMessage).where(ChatMessage.session_id == session_id)
    result = await db.execute(query)
    messages = result.scalars().all()

    for message in messages:
        await db.delete(message)

    await db.commit()

    return {"status": "success", "deleted_count": len(messages)}


@router.post("/analyze-risk")
async def analyze_employee_risk(
    hr_code: str,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Direct endpoint to analyze employee churn risk.

    - **hr_code**: Employee HR code to analyze
    """
    service = IntelligentChatbotService(db)

    # Manually trigger risk diagnosis
    pattern_type = "churn_risk_diagnosis"
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities)
    response = await service._generate_risk_diagnosis(context)

    return {"hr_code": hr_code, "analysis": response, "context": context}


@router.post("/generate-retention-plan")
async def generate_retention_plan(
    hr_code: str,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Direct endpoint to generate retention plan for an employee.

    - **hr_code**: Employee HR code
    """
    service = IntelligentChatbotService(db)

    # Manually trigger retention plan generation
    pattern_type = "retention_plan"
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities)
    response = await service._generate_retention_plan(context)

    return {"hr_code": hr_code, "plan": response, "context": context}


@router.get("/exit-patterns")
async def get_exit_patterns(
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get analysis of common exit patterns in the organization.
    """
    service = IntelligentChatbotService(db)

    # Manually trigger exit pattern analysis
    pattern_type = "exit_pattern_mining"
    context = await service.gather_context(pattern_type, {})
    response = await service._generate_exit_patterns(context)

    return {"analysis": response, "data": context.get("exit_patterns", {})}


@router.post("/compare-employee")
async def compare_with_resigned(
    hr_code: str,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Compare an employee with similar resigned employees.

    - **hr_code**: Employee HR code to compare
    """
    service = IntelligentChatbotService(db)

    # Manually trigger employee comparison
    pattern_type = "employee_comparison"
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities)
    response = await service._generate_comparison(context)

    return {"hr_code": hr_code, "comparison": response, "similar_employees": context.get("similar_employees", [])}
