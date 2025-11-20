from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import openai
import ollama

from app.core.config import settings
from app.models.chatbot import Conversation, Message
from app.schemas.chatbot import (
    ChatRequest,
    ChatResponse,
    MessageResponse,
    ConversationResponse,
    ConversationCreate,
    ConversationListResponse
)


class ChatbotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_llm_response(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> tuple[str, Dict[str, Any]]:
        """Get response from LLM provider (OpenAI or Ollama)"""

        # Determine provider based on model name
        if model.startswith("gpt-") or model.startswith("o1-"):
            provider = "openai"
        elif model.startswith("qwen") or "/" in model:
            provider = "ollama"
        else:
            provider = settings.DEFAULT_LLM_PROVIDER

        metadata = {
            "model": model,
            "provider": provider,
            "temperature": temperature
        }

        try:
            if provider == "openai":
                if not settings.OPENAI_API_KEY:
                    raise ValueError("OPENAI_API_KEY not configured")

                openai.api_key = settings.OPENAI_API_KEY
                response = openai.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )

                content = response.choices[0].message.content
                metadata.update({
                    "tokens_used": response.usage.total_tokens,
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens
                })

            else:  # ollama
                response = ollama.chat(
                    model=model,
                    messages=messages,
                    options={
                        "temperature": temperature,
                        "num_predict": max_tokens if max_tokens else -1
                    }
                )

                content = response['message']['content']
                metadata.update({
                    "tokens_used": response.get('eval_count', 0) + response.get('prompt_eval_count', 0),
                    "prompt_tokens": response.get('prompt_eval_count', 0),
                    "completion_tokens": response.get('eval_count', 0)
                })

            return content, metadata

        except Exception as e:
            raise Exception(f"LLM API error: {str(e)}")

    async def create_conversation(self, user_id: int, title: Optional[str] = None) -> Conversation:
        """Create a new conversation"""
        conversation = Conversation(
            user_id=user_id,
            title=title or "New Conversation"
        )
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)
        return conversation

    async def get_conversation(self, conversation_id: int, user_id: int) -> Optional[Conversation]:
        """Get a conversation by ID for a specific user"""
        result = await self.db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def list_conversations(self, user_id: int, skip: int = 0, limit: int = 20) -> List[ConversationListResponse]:
        """List all conversations for a user"""
        # Get conversations with message count
        result = await self.db.execute(
            select(
                Conversation,
                func.count(Message.id).label('message_count')
            )
            .outerjoin(Message)
            .where(Conversation.user_id == user_id)
            .group_by(Conversation.id)
            .order_by(Conversation.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )

        conversations = []
        for conv, msg_count in result.all():
            conv_dict = {
                "id": conv.id,
                "user_id": conv.user_id,
                "title": conv.title,
                "is_active": conv.is_active,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
                "message_count": msg_count
            }
            conversations.append(ConversationListResponse(**conv_dict))

        return conversations

    async def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        message_metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Add a message to a conversation"""
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            message_metadata=message_metadata
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def get_conversation_history(
        self,
        conversation_id: int,
        max_messages: Optional[int] = None
    ) -> List[Dict[str, str]]:
        """Get conversation history formatted for LLM"""
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        messages = result.scalars().all()

        # Limit to recent messages if specified
        if max_messages:
            messages = messages[-max_messages:]

        # Format for LLM
        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

    async def chat(self, request: ChatRequest, user_id: int) -> ChatResponse:
        """Process a chat request"""

        # Get or create conversation
        if request.conversation_id:
            conversation = await self.get_conversation(request.conversation_id, user_id)
            if not conversation:
                raise ValueError("Conversation not found")
        else:
            conversation = await self.create_conversation(user_id)

        # Add user message to database
        user_message = await self.add_message(
            conversation_id=conversation.id,
            role="user",
            content=request.message
        )

        # Build message history for LLM
        history = await self.get_conversation_history(
            conversation.id,
            max_messages=settings.CHATBOT_MAX_HISTORY
        )

        # Add system prompt if this is the first message
        if len(history) == 1:
            history.insert(0, {
                "role": "system",
                "content": settings.CHATBOT_SYSTEM_PROMPT
            })

        # Get LLM response
        try:
            ai_content, metadata = await self._get_llm_response(
                messages=history,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
        except Exception as e:
            # If LLM fails, still save the user message but return error
            raise Exception(f"Failed to get AI response: {str(e)}")

        # Save AI response to database
        ai_message = await self.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content=ai_content,
            message_metadata=metadata
        )

        # Update conversation title if it's the first exchange
        if not conversation.title or conversation.title == "New Conversation":
            # Generate a title from the first message
            title = request.message[:50] + ("..." if len(request.message) > 50 else "")
            conversation.title = title
            await self.db.commit()

        return ChatResponse(
            conversation_id=conversation.id,
            message=MessageResponse.from_orm(ai_message),
            user_message=MessageResponse.from_orm(user_message)
        )

    async def delete_conversation(self, conversation_id: int, user_id: int) -> bool:
        """Delete a conversation"""
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False

        await self.db.delete(conversation)
        await self.db.commit()
        return True
