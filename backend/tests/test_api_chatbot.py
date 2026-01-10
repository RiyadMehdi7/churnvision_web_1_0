"""
Tests for Chatbot API Endpoints

Tests the general-purpose chatbot system including:
- Send chat messages
- Conversation CRUD operations
- Pagination and user scoping
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db_session():
    """Mock async database session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.username = "test_user"
    user.email = "test@example.com"
    user.role = "analyst"
    user.is_active = True
    return user


@pytest.fixture
def mock_chat_response():
    """Mock ChatResponse from service."""
    response = MagicMock()
    response.message = "Based on the data analysis, I can help you understand the churn patterns."
    response.conversation_id = 101
    response.model = "gpt-5.1"
    response.tokens_used = 150
    response.created_at = datetime(2026, 1, 10, 12, 0, 0)
    return response


@pytest.fixture
def mock_conversation():
    """Mock Conversation object."""
    conv = MagicMock()
    conv.id = 101
    conv.user_id = 1
    conv.title = "Churn Analysis Discussion"
    conv.created_at = datetime(2026, 1, 10, 10, 0, 0)
    conv.updated_at = datetime(2026, 1, 10, 12, 0, 0)
    conv.messages = []
    return conv


@pytest.fixture
def mock_conversation_list():
    """Mock list of conversations."""
    conv1 = MagicMock()
    conv1.id = 101
    conv1.user_id = 1
    conv1.title = "Churn Analysis"
    conv1.created_at = datetime(2026, 1, 10, 10, 0, 0)
    conv1.updated_at = datetime(2026, 1, 10, 12, 0, 0)
    conv1.message_count = 5

    conv2 = MagicMock()
    conv2.id = 102
    conv2.user_id = 1
    conv2.title = "HR Questions"
    conv2.created_at = datetime(2026, 1, 9, 14, 0, 0)
    conv2.updated_at = datetime(2026, 1, 9, 16, 0, 0)
    conv2.message_count = 3

    return [conv1, conv2]


@pytest.fixture
def mock_message():
    """Mock chat message."""
    msg = MagicMock()
    msg.id = 1
    msg.conversation_id = 101
    msg.role = "assistant"
    msg.content = "I can help analyze churn patterns."
    msg.created_at = datetime(2026, 1, 10, 12, 0, 0)
    return msg


# =============================================================================
# Chat Endpoint Tests
# =============================================================================

class TestChatEndpoint:
    """Tests for POST /chatbot/chat endpoint."""

    @pytest.mark.asyncio
    async def test_chat_success(
        self, mock_db_session, mock_user, mock_chat_response
    ):
        """Test successful chat message."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(
            message="What are the main churn risk factors?",
            conversation_id=101
        )

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(return_value=mock_chat_response)
            MockService.return_value = mock_service_instance

            result = await chat(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result.conversation_id == 101
        mock_service_instance.chat.assert_called_once()

    @pytest.mark.asyncio
    async def test_chat_new_conversation(
        self, mock_db_session, mock_user, mock_chat_response
    ):
        """Test chat without conversation_id creates new conversation."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(
            message="Hello, I need help with churn analysis"
            # No conversation_id - should create new
        )

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(return_value=mock_chat_response)
            MockService.return_value = mock_service_instance

            result = await chat(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result is not None
        mock_service_instance.chat.assert_called_once_with(request, mock_user.id)

    @pytest.mark.asyncio
    async def test_chat_with_temperature(
        self, mock_db_session, mock_user, mock_chat_response
    ):
        """Test chat with custom temperature setting."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(
            message="Explain churn prediction creatively",
            temperature=1.2
        )

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(return_value=mock_chat_response)
            MockService.return_value = mock_service_instance

            result = await chat(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result is not None
        call_args = mock_service_instance.chat.call_args
        assert call_args[0][0].temperature == 1.2

    @pytest.mark.asyncio
    async def test_chat_conversation_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when conversation doesn't exist."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest
        from fastapi import HTTPException

        request = ChatRequest(
            message="Hello",
            conversation_id=999
        )

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(
                side_effect=ValueError("Conversation not found")
            )
            MockService.return_value = mock_service_instance

            with pytest.raises(HTTPException) as exc_info:
                await chat(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_chat_service_error(
        self, mock_db_session, mock_user
    ):
        """Test 500 when service encounters error."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest
        from fastapi import HTTPException

        request = ChatRequest(message="Hello")

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(
                side_effect=Exception("LLM service unavailable")
            )
            MockService.return_value = mock_service_instance

            with pytest.raises(HTTPException) as exc_info:
                await chat(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 500
        mock_db_session.rollback.assert_called()


# =============================================================================
# List Conversations Tests
# =============================================================================

class TestListConversations:
    """Tests for GET /chatbot/conversations endpoint."""

    @pytest.mark.asyncio
    async def test_list_conversations_success(
        self, mock_db_session, mock_user, mock_conversation_list
    ):
        """Test listing user's conversations."""
        from app.api.v1.chatbot import list_conversations

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.list_conversations = AsyncMock(
                return_value=mock_conversation_list
            )
            MockService.return_value = mock_service_instance

            result = await list_conversations(
                skip=0,
                limit=20,
                current_user=mock_user,
                db=mock_db_session
            )

        assert len(result) == 2
        assert result[0].id == 101
        assert result[1].id == 102

    @pytest.mark.asyncio
    async def test_list_conversations_with_pagination(
        self, mock_db_session, mock_user, mock_conversation_list
    ):
        """Test conversation list pagination."""
        from app.api.v1.chatbot import list_conversations

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.list_conversations = AsyncMock(
                return_value=[mock_conversation_list[1]]  # Second page
            )
            MockService.return_value = mock_service_instance

            result = await list_conversations(
                skip=1,
                limit=1,
                current_user=mock_user,
                db=mock_db_session
            )

        mock_service_instance.list_conversations.assert_called_once_with(
            user_id=mock_user.id,
            skip=1,
            limit=1
        )

    @pytest.mark.asyncio
    async def test_list_conversations_empty(
        self, mock_db_session, mock_user
    ):
        """Test empty conversation list."""
        from app.api.v1.chatbot import list_conversations

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.list_conversations = AsyncMock(return_value=[])
            MockService.return_value = mock_service_instance

            result = await list_conversations(
                skip=0,
                limit=20,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result == []


# =============================================================================
# Get Conversation Tests
# =============================================================================

class TestGetConversation:
    """Tests for GET /chatbot/conversations/{id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_conversation_success(
        self, mock_db_session, mock_user, mock_conversation, mock_message
    ):
        """Test getting a specific conversation."""
        from app.api.v1.chatbot import get_conversation

        mock_conversation.messages = [mock_message]

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_conversation = AsyncMock(
                return_value=mock_conversation
            )
            MockService.return_value = mock_service_instance

            result = await get_conversation(
                conversation_id=101,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result.id == 101
        assert result.title == "Churn Analysis Discussion"

    @pytest.mark.asyncio
    async def test_get_conversation_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when conversation doesn't exist."""
        from app.api.v1.chatbot import get_conversation
        from fastapi import HTTPException

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_conversation = AsyncMock(return_value=None)
            MockService.return_value = mock_service_instance

            with pytest.raises(HTTPException) as exc_info:
                await get_conversation(
                    conversation_id=999,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404
        assert "not found" in str(exc_info.value.detail).lower()

    @pytest.mark.asyncio
    async def test_get_conversation_user_scoped(
        self, mock_db_session, mock_user
    ):
        """Test that conversation is scoped to current user."""
        from app.api.v1.chatbot import get_conversation

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.get_conversation = AsyncMock(return_value=None)
            MockService.return_value = mock_service_instance

            try:
                await get_conversation(
                    conversation_id=101,
                    current_user=mock_user,
                    db=mock_db_session
                )
            except Exception:
                pass

            # Verify user_id was passed to service
            mock_service_instance.get_conversation.assert_called_once_with(
                101, mock_user.id
            )


# =============================================================================
# Create Conversation Tests
# =============================================================================

class TestCreateConversation:
    """Tests for POST /chatbot/conversations endpoint."""

    @pytest.mark.asyncio
    async def test_create_conversation_success(
        self, mock_db_session, mock_user, mock_conversation
    ):
        """Test creating a new conversation."""
        from app.api.v1.chatbot import create_conversation
        from app.schemas.chatbot import ConversationCreate

        request = ConversationCreate(title="New Discussion")

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.create_conversation = AsyncMock(
                return_value=mock_conversation
            )
            MockService.return_value = mock_service_instance

            result = await create_conversation(
                conversation_data=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result is not None
        mock_service_instance.create_conversation.assert_called_once_with(
            user_id=mock_user.id,
            title="New Discussion"
        )

    @pytest.mark.asyncio
    async def test_create_conversation_without_title(
        self, mock_db_session, mock_user, mock_conversation
    ):
        """Test creating conversation without title."""
        from app.api.v1.chatbot import create_conversation
        from app.schemas.chatbot import ConversationCreate

        request = ConversationCreate()  # No title

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.create_conversation = AsyncMock(
                return_value=mock_conversation
            )
            MockService.return_value = mock_service_instance

            result = await create_conversation(
                conversation_data=request,
                current_user=mock_user,
                db=mock_db_session
            )

        mock_service_instance.create_conversation.assert_called_once_with(
            user_id=mock_user.id,
            title=None
        )


# =============================================================================
# Delete Conversation Tests
# =============================================================================

class TestDeleteConversation:
    """Tests for DELETE /chatbot/conversations/{id} endpoint."""

    @pytest.mark.asyncio
    async def test_delete_conversation_success(
        self, mock_db_session, mock_user
    ):
        """Test deleting a conversation."""
        from app.api.v1.chatbot import delete_conversation

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.delete_conversation = AsyncMock(return_value=True)
            MockService.return_value = mock_service_instance

            result = await delete_conversation(
                conversation_id=101,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result is None  # 204 No Content
        mock_service_instance.delete_conversation.assert_called_once_with(
            101, mock_user.id
        )

    @pytest.mark.asyncio
    async def test_delete_conversation_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when deleting non-existent conversation."""
        from app.api.v1.chatbot import delete_conversation
        from fastapi import HTTPException

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.delete_conversation = AsyncMock(return_value=False)
            MockService.return_value = mock_service_instance

            with pytest.raises(HTTPException) as exc_info:
                await delete_conversation(
                    conversation_id=999,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conversation_user_scoped(
        self, mock_db_session, mock_user
    ):
        """Test that delete is scoped to current user."""
        from app.api.v1.chatbot import delete_conversation

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.delete_conversation = AsyncMock(return_value=True)
            MockService.return_value = mock_service_instance

            await delete_conversation(
                conversation_id=101,
                current_user=mock_user,
                db=mock_db_session
            )

            # Verify user_id was passed to prevent deleting other users' conversations
            mock_service_instance.delete_conversation.assert_called_once_with(
                101, mock_user.id
            )


# =============================================================================
# Schema Validation Tests
# =============================================================================

class TestSchemaValidation:
    """Tests for Pydantic schema validation."""

    def test_chat_request_minimal(self):
        """Test ChatRequest with minimal fields."""
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(message="Hello")
        assert request.message == "Hello"
        assert request.conversation_id is None

    def test_chat_request_full(self):
        """Test ChatRequest with all fields."""
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(
            message="Hello",
            conversation_id=101,
            model="gpt-5.1",
            temperature=0.8,
            max_tokens=1000
        )
        assert request.message == "Hello"
        assert request.conversation_id == 101
        assert request.temperature == 0.8

    def test_conversation_create_optional_title(self):
        """Test ConversationCreate with optional title."""
        from app.schemas.chatbot import ConversationCreate

        # Without title
        request = ConversationCreate()
        assert request.title is None

        # With title
        request_with_title = ConversationCreate(title="My Conversation")
        assert request_with_title.title == "My Conversation"


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Tests for error handling patterns."""

    @pytest.mark.asyncio
    async def test_chat_rollback_on_value_error(
        self, mock_db_session, mock_user
    ):
        """Test that rollback is called on ValueError."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(message="Hello", conversation_id=999)

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(
                side_effect=ValueError("Not found")
            )
            MockService.return_value = mock_service_instance

            try:
                await chat(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )
            except Exception:
                pass

        # Rollback should be called (at least for cleanup at start)
        assert mock_db_session.rollback.called

    @pytest.mark.asyncio
    async def test_chat_rollback_on_exception(
        self, mock_db_session, mock_user
    ):
        """Test that rollback is called on general exceptions."""
        from app.api.v1.chatbot import chat
        from app.schemas.chatbot import ChatRequest

        request = ChatRequest(message="Hello")

        with patch("app.api.v1.chatbot.ChatbotService") as MockService:
            mock_service_instance = MagicMock()
            mock_service_instance.chat = AsyncMock(
                side_effect=Exception("Service error")
            )
            MockService.return_value = mock_service_instance

            try:
                await chat(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )
            except Exception:
                pass

        assert mock_db_session.rollback.called
