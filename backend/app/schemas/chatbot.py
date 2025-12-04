from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class MessageBase(BaseModel):
    role: str = Field(..., description="Role of the message sender: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Content of the message")


class MessageCreate(MessageBase):
    message_metadata: Optional[Dict[str, Any]] = None


class MessageResponse(MessageBase):
    id: int
    conversation_id: int
    message_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationBase(BaseModel):
    title: Optional[str] = None


class ConversationCreate(ConversationBase):
    pass


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    is_active: Optional[bool] = None


class ConversationResponse(ConversationBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class ConversationListResponse(ConversationBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    message_count: Optional[int] = 0

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message to send to the chatbot")
    conversation_id: Optional[int] = Field(None, description="ID of existing conversation, or None to start new")
    model: Optional[str] = Field("qwen3:4b", description="LLM model to use (qwen3:4b, gpt-4, etc.) - defaults to ChurnVision Local")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: Optional[int] = Field(None, description="Maximum tokens in response")


class ChatResponse(BaseModel):
    conversation_id: int
    message: MessageResponse
    user_message: MessageResponse
