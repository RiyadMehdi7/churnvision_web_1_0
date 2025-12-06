from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_db
from app.models.auth import UserAccount
from app.services.intelligent_chatbot import IntelligentChatbotService, PatternType
from app.models.chatbot import ChatMessage
from sqlalchemy import select, desc

router = APIRouter()


class IntelligentChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    session_id: str = Field(..., description="Session ID for conversation tracking")
    employee_id: Optional[str] = Field(None, description="Optional employee context (HR code)")
    dataset_id: Optional[str] = Field(None, description="Active dataset context for scoping responses")


class IntelligentChatResponse(BaseModel):
    response: str
    session_id: str
    pattern_detected: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = Field(None, description="Structured JSON for frontend renderers")


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
    - Workforce trends ("Show overall churn trends")
    - Department analysis ("Analyze Sales department")
    - SHAP explanations ("What factors contribute to risk?")
    - General chat (falls back to LLM)

    Returns structured_data for frontend renderers when applicable.
    """
    service = IntelligentChatbotService(db)

    try:
        # Process message with intelligence - returns both text and structured data
        result = await service.chat(
            message=request.message,
            session_id=request.session_id,
            employee_id=request.employee_id,
            dataset_id=request.dataset_id
        )

        # Handle both old (string) and new (dict) return formats
        if isinstance(result, dict):
            return IntelligentChatResponse(
                response=result.get("response", ""),
                session_id=request.session_id,
                pattern_detected=result.get("pattern_detected"),
                structured_data=result.get("structured_data")
            )
        else:
            # Legacy string response
            return IntelligentChatResponse(
                response=result,
                session_id=request.session_id
            )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
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
    dataset_id: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Direct endpoint to analyze employee churn risk.

    - **hr_code**: Employee HR code to analyze
    - **dataset_id**: Optional dataset context (defaults to active dataset)
    """
    service = IntelligentChatbotService(db)

    # Resolve dataset context
    resolved_dataset_id = await service._resolve_dataset_id(dataset_id)

    # Manually trigger risk diagnosis
    pattern_type = PatternType.CHURN_RISK_DIAGNOSIS
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities, resolved_dataset_id)
    response = await service._generate_enhanced_risk_diagnosis(context)

    return {"hr_code": hr_code, "analysis": response, "context": context}


@router.post("/generate-retention-plan")
async def generate_retention_plan(
    hr_code: str,
    dataset_id: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Direct endpoint to generate retention plan for an employee.

    - **hr_code**: Employee HR code
    - **dataset_id**: Optional dataset context (defaults to active dataset)
    """
    service = IntelligentChatbotService(db)

    # Resolve dataset context
    resolved_dataset_id = await service._resolve_dataset_id(dataset_id)

    # Manually trigger retention plan generation
    pattern_type = PatternType.RETENTION_PLAN
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities, resolved_dataset_id)
    response = await service._generate_enhanced_retention_playbook(context)

    return {"hr_code": hr_code, "plan": response, "context": context}


@router.get("/exit-patterns")
async def get_exit_patterns(
    dataset_id: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get analysis of common exit patterns in the organization.

    - **dataset_id**: Optional dataset context (defaults to active dataset)
    """
    service = IntelligentChatbotService(db)

    # Resolve dataset context
    resolved_dataset_id = await service._resolve_dataset_id(dataset_id)

    # Manually trigger exit pattern analysis
    pattern_type = PatternType.EXIT_PATTERN_MINING
    context = await service.gather_context(pattern_type, {}, resolved_dataset_id)
    response = await service._generate_exit_pattern_mining(context)

    return {"analysis": response, "data": context.get("exit_data", {})}


@router.post("/compare-employee")
async def compare_with_resigned(
    hr_code: str,
    dataset_id: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Compare an employee with similar resigned employees.

    - **hr_code**: Employee HR code to compare
    - **dataset_id**: Optional dataset context (defaults to active dataset)
    """
    service = IntelligentChatbotService(db)

    # Resolve dataset context
    resolved_dataset_id = await service._resolve_dataset_id(dataset_id)

    # Manually trigger employee comparison
    pattern_type = PatternType.EMPLOYEE_COMPARISON
    entities = {"hr_code": hr_code}

    context = await service.gather_context(pattern_type, entities, resolved_dataset_id)
    response = await service._generate_enhanced_similarity_analysis(context, "resigned")

    return {"hr_code": hr_code, "comparison": response, "similar_employees": context.get("similar_employees", [])}


class ContentRefineRequest(BaseModel):
    content_type: str = Field(..., description="Type of content: 'email' or 'meeting'")
    subject: Optional[str] = Field(None, description="Subject/title of the content")
    body: str = Field(..., description="Current body/content to refine")
    instruction: str = Field(..., description="User's refinement instruction (e.g., 'make it more formal')")
    recipient_context: Optional[str] = Field(None, description="Context about recipients")


class ContentRefineResponse(BaseModel):
    refined_subject: Optional[str] = None
    refined_body: str
    changes_made: str


@router.post("/refine-content", response_model=ContentRefineResponse)
async def refine_content(
    request: ContentRefineRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-powered content refinement for emails and meetings.

    Takes existing content and user instructions, returns refined version.

    Examples:
    - "make it more formal"
    - "shorten to 2 paragraphs"
    - "add a greeting and sign-off"
    - "translate to German"
    - "make it friendlier"
    """
    from app.services.chatbot import ChatbotService
    from app.core.config import settings
    import json
    import re
    import logging

    logger = logging.getLogger(__name__)
    chatbot_service = ChatbotService(db)
    content_label = "email" if request.content_type == "email" else "meeting invitation/agenda"

    system_prompt = """You are a professional communication assistant. Your task is to refine content based on user instructions.
Always respond with valid JSON only, no additional text."""

    user_prompt = f"""Refine the following {content_label} based on the user's instruction.

CURRENT CONTENT:
{f"Subject: {request.subject}" if request.subject else ""}
Body:
{request.body}

{f"Recipient Context: {request.recipient_context}" if request.recipient_context else ""}

USER INSTRUCTION: {request.instruction}

IMPORTANT RULES:
1. Apply ONLY the changes requested by the user
2. Maintain the core message and intent
3. Keep appropriate professional tone unless asked otherwise
4. Return the refined content in the same structure

Respond in this exact JSON format:
{{
    "refined_subject": "new subject if changed, or null if not applicable",
    "refined_body": "the refined body content",
    "changes_made": "brief summary of changes made"
}}"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    # Determine model based on DEFAULT_LLM_PROVIDER
    provider = settings.DEFAULT_LLM_PROVIDER.lower()
    if provider == "openai" and settings.OPENAI_API_KEY:
        model = settings.OPENAI_MODEL
    elif provider == "azure" and settings.AZURE_OPENAI_API_KEY:
        model = f"azure-{settings.AZURE_OPENAI_MODEL}"
    elif provider == "qwen" and settings.QWEN_API_KEY:
        model = settings.QWEN_MODEL
    elif provider == "mistral" and settings.MISTRAL_API_KEY:
        model = settings.MISTRAL_MODEL
    elif provider == "ibm" and settings.IBM_API_KEY:
        model = settings.IBM_MODEL
    else:
        # Default to local Ollama
        model = settings.OLLAMA_MODEL

    logger.info(f"Refine content using provider={provider}, model={model}")

    try:
        response, metadata = await chatbot_service._get_llm_response(
            messages=messages,
            model=model,
            temperature=0.7
        )

        logger.info(f"LLM response length: {len(response) if response else 0}, metadata: {metadata}")

        # Check for empty response
        if not response or not response.strip():
            logger.error(f"LLM returned empty response. Provider={provider}, Model={model}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI returned empty response (provider: {provider}, model: {model}). Check if the LLM service is running."
            )

        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            try:
                result = json.loads(json_match.group())
                refined_body = result.get("refined_body")

                # Validate refined_body is not empty
                if not refined_body or not refined_body.strip():
                    refined_body = request.body  # Fall back to original

                return ContentRefineResponse(
                    refined_subject=result.get("refined_subject"),
                    refined_body=refined_body,
                    changes_made=result.get("changes_made", "Content refined")
                )
            except json.JSONDecodeError:
                # JSON parsing failed, use fallback
                pass

        # Fallback: treat entire response as refined body (only if it looks like content)
        stripped_response = response.strip()
        # Check if response looks like actual content (not an error message or very short)
        if len(stripped_response) > 20 and not stripped_response.lower().startswith(("error", "sorry", "i cannot")):
            return ContentRefineResponse(
                refined_subject=request.subject,
                refined_body=stripped_response,
                changes_made="Content refined based on instruction"
            )
        else:
            # Response doesn't look like valid refined content
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI could not refine the content. Please try a different instruction."
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error refining content: {str(e)}"
        )
