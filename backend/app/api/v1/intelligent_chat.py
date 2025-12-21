from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import json
import asyncio

from app.api.deps import get_current_user, get_db, get_db_session
from app.core.security_utils import sanitize_error_message, get_or_create_session_id
from app.core.config import settings
from app.models.auth import UserAccount
from jose import jwt, JWTError
from app.services.intelligent_chatbot import IntelligentChatbotService, PatternType
from app.models.chatbot import ChatMessage
from sqlalchemy import select, desc

router = APIRouter()


# WebSocket connection manager for chat streaming
class ConnectionManager:
    """Manages WebSocket connections for chat streaming."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_token(self, websocket: WebSocket, token: str):
        """Send a single token to the client."""
        await websocket.send_json({"type": "token", "content": token})

    async def send_thinking(self, websocket: WebSocket, message: str = "Thinking..."):
        """Send thinking indicator to the client."""
        await websocket.send_json({"type": "thinking", "content": message})

    async def send_done(self, websocket: WebSocket):
        """Signal that streaming is complete."""
        await websocket.send_json({"type": "done"})

    async def send_error(self, websocket: WebSocket, error: str):
        """Send error message to the client."""
        await websocket.send_json({"type": "error", "error": error})

    async def send_context(self, websocket: WebSocket, context: Dict[str, Any]):
        """Send context data to the client."""
        await websocket.send_json({"type": "context", "context": context})


ws_manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_chat(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token for authentication"),
):
    """
    WebSocket endpoint for streaming LLM chat responses.

    Connect with token as query parameter: /ws?token=<jwt_token>

    Send messages as JSON:
    {
        "message": "your question here",
        "session_id": "unique-session-id",
        "employee_id": "optional-hr-code"
    }

    Receive streaming responses as JSON:
    - {"type": "thinking", "content": "Thinking..."} - AI is processing
    - {"type": "token", "content": "word"} - Streamed token
    - {"type": "done"} - Response complete
    - {"type": "error", "error": "message"} - Error occurred
    """
    # Authenticate user from token
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token payload")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    await ws_manager.connect(websocket, user_id)

    try:
        async with get_db_session() as db:
            service = IntelligentChatbotService(db)

            while True:
                # Receive message from client
                try:
                    data = await websocket.receive_json()
                except Exception:
                    # Connection closed or invalid JSON
                    break

                message = data.get("message", "")
                session_id = data.get("session_id", "default")
                employee_id = data.get("employee_id")
                dataset_id = data.get("dataset_id")

                if not message:
                    await ws_manager.send_error(websocket, "Message is required")
                    continue

                # Validate session ID
                validated_session_id = get_or_create_session_id(session_id)

                try:
                    # Send thinking indicator
                    await ws_manager.send_thinking(websocket)

                    # Stream the response
                    async for chunk in service.stream_chat(
                        message=message,
                        session_id=validated_session_id,
                        employee_id=employee_id,
                        dataset_id=dataset_id,
                    ):
                        if chunk:
                            await ws_manager.send_token(websocket, chunk)
                            # Small delay to prevent overwhelming the client
                            await asyncio.sleep(0.01)

                    await ws_manager.send_done(websocket)

                except Exception as e:
                    error_msg = sanitize_error_message(e, "chat streaming")
                    await ws_manager.send_error(websocket, error_msg)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        # Log unexpected errors
        print(f"WebSocket error: {e}")
    finally:
        ws_manager.disconnect(user_id)


class IntelligentChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    session_id: str = Field(..., description="Session ID for conversation tracking")
    employee_id: Optional[str] = Field(None, description="Optional employee context (HR code)")
    dataset_id: Optional[str] = Field(None, description="Active dataset context for scoping responses")
    action_type: Optional[str] = Field(None, description="Quick action type: 'diagnose', 'retention_plan', 'compare_resigned', 'compare_stayed', 'exit_patterns', 'workforce_trends', 'department_analysis'. If provided, returns structured data for that action. Otherwise uses LLM.")


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
    Intelligent chat endpoint with LLM-powered responses.

    Two modes:
    1. **Quick Action** (action_type provided): Returns structured data cards
       - 'diagnose': Risk diagnosis card
       - 'retention_plan': Retention plan card
       - 'compare_resigned': Compare with resigned employees
       - 'compare_stayed': Compare with retained employees
       - 'exit_patterns': Exit pattern analysis
       - 'workforce_trends': Workforce trends overview
       - 'department_analysis': Department analysis

    2. **Chat** (no action_type): Uses LLM with full employee context to respond naturally

    Returns structured_data for frontend renderers when action_type is specified.
    """
    service = IntelligentChatbotService(db)

    # Validate/sanitize session ID
    validated_session_id = get_or_create_session_id(request.session_id)

    try:
        # Process message - action_type determines if we return structured data or LLM response
        result = await service.chat(
            message=request.message,
            session_id=validated_session_id,
            employee_id=request.employee_id,
            dataset_id=request.dataset_id,
            action_type=request.action_type
        )

        # Handle both old (string) and new (dict) return formats
        if isinstance(result, dict):
            return IntelligentChatResponse(
                response=result.get("response", ""),
                session_id=validated_session_id,
                pattern_detected=result.get("pattern_detected"),
                structured_data=result.get("structured_data")
            )
        else:
            # Legacy string response
            return IntelligentChatResponse(
                response=result,
                session_id=validated_session_id
            )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "chat request processing"),
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
    from app.services.chatbot_service import ChatbotService
    from app.services.llm_config import resolve_llm_provider_and_model
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

    provider_id, runtime_provider, model = await resolve_llm_provider_and_model(db)
    logger.info(f"Refine content using provider={provider_id}, runtime={runtime_provider}, model={model}")

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
