from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.chatbot import ChatbotService
from app.schemas.chatbot import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    ConversationListResponse,
    ConversationCreate,
    ConversationUpdate
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Send a message to the chatbot and get a response.

    - **message**: The user's message
    - **conversation_id**: Optional ID of existing conversation (creates new if not provided)
    - **model**: LLM model to use (default: gpt-5.1)
    - **temperature**: Sampling temperature (0.0 to 2.0, default: 0.7)
    - **max_tokens**: Maximum tokens in response (optional)
    """
    service = ChatbotService(db)
    try:
        response = await service.chat(request, current_user.id)
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing chat request: {str(e)}"
        )


@router.get("/conversations", response_model=List[ConversationListResponse])
async def list_conversations(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of all conversations for the current user.

    - **skip**: Number of conversations to skip (pagination)
    - **limit**: Maximum number of conversations to return
    """
    service = ChatbotService(db)
    conversations = await service.list_conversations(
        user_id=current_user.id,
        skip=skip,
        limit=limit
    )
    return conversations


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a specific conversation with all its messages.

    - **conversation_id**: ID of the conversation to retrieve
    """
    service = ChatbotService(db)
    conversation = await service.get_conversation(conversation_id, current_user.id)

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )

    return conversation


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conversation_data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new conversation.

    - **title**: Optional title for the conversation
    """
    service = ChatbotService(db)
    conversation = await service.create_conversation(
        user_id=current_user.id,
        title=conversation_data.title
    )

    # Refresh to get the conversation with messages relationship
    await db.refresh(conversation, ["messages"])
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a conversation and all its messages.

    - **conversation_id**: ID of the conversation to delete
    """
    service = ChatbotService(db)
    deleted = await service.delete_conversation(conversation_id, current_user.id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )

    return None
