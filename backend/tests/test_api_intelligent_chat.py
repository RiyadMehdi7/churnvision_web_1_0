"""
Tests for app/api/v1/intelligent_chat.py - Intelligent Chat endpoints.

Tests cover:
- Main chat endpoint (POST /chat)
- Chat with tools (POST /chat-tools)
- Chat history management (GET/DELETE /history/{session_id})
- Risk analysis endpoint (POST /analyze-risk)
- Retention plan generation (POST /generate-retention-plan)
- Exit patterns analysis (GET /exit-patterns)
- Employee comparison (POST /compare-employee)
- Content refinement (POST /refine-content)
- Connection manager (WebSocket helper)
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException


# ============ Fixtures ============

@pytest.fixture
def mock_rbac_user():
    """Create a mock RBAC user (UserAccount)."""
    user = MagicMock()
    user.user_id = "1"
    user.username = "testuser"
    user.email = "test@example.com"
    user.full_name = "Test User"
    user.is_active = 1
    return user


@pytest.fixture
def mock_chat_message():
    """Create a mock chat message."""
    msg = MagicMock()
    msg.id = 1
    msg.session_id = "session-123"
    msg.employee_id = "EMP001"
    msg.message = "What is the churn risk for this employee?"
    msg.role = "user"
    msg.timestamp = datetime.utcnow()
    return msg


@pytest.fixture
def mock_chat_response():
    """Create a mock chat service response (dict format)."""
    return {
        "response": "Based on the analysis, this employee has a moderate churn risk...",
        "pattern_detected": "churn_risk_diagnosis",
        "structured_data": {
            "risk_level": "medium",
            "risk_score": 0.65,
            "key_factors": ["low_satisfaction", "high_workload"],
        }
    }


@pytest.fixture
def mock_tool_chat_response():
    """Create a mock tool-calling chat response."""
    return {
        "response": "There are 150 employees in the Engineering department.",
        "tool_history": [
            {
                "name": "count_employees",
                "arguments": {"department": "Engineering"},
                "result": {"count": 150}
            }
        ],
        "iterations": 1,
        "tokens_used": 500,
        "success": True,
        "error": None
    }


@pytest.fixture
def mock_context():
    """Create a mock context for analysis endpoints."""
    return {
        "employee": {
            "hr_code": "EMP001",
            "name": "John Doe",
            "department": "Engineering",
            "tenure": 3.5,
        },
        "prediction": {
            "churn_probability": 0.65,
            "risk_level": "medium",
        },
        "similar_employees": [
            {"hr_code": "EMP002", "similarity": 0.85},
            {"hr_code": "EMP003", "similarity": 0.78},
        ],
        "exit_data": {
            "common_reasons": ["better_opportunity", "management"],
            "average_tenure_at_exit": 2.5,
        }
    }


# ============ Test Chat Endpoint ============

class TestIntelligentChat:
    """Test main chat endpoint."""

    @pytest.mark.asyncio
    async def test_chat_success_dict_response(
        self, mock_db_session, mock_rbac_user, mock_chat_response
    ):
        """Should return chat response with structured data."""
        from app.api.v1.intelligent_chat import intelligent_chat, IntelligentChatRequest

        request = IntelligentChatRequest(
            message="What is the risk for EMP001?",
            session_id="session-123",
            employee_id="EMP001",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat = AsyncMock(return_value=mock_chat_response)

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-123"

                result = await intelligent_chat(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert "moderate churn risk" in result.response
        assert result.session_id == "session-123"
        assert result.pattern_detected == "churn_risk_diagnosis"
        assert result.structured_data is not None
        assert result.structured_data["risk_level"] == "medium"

    @pytest.mark.asyncio
    async def test_chat_success_string_response(
        self, mock_db_session, mock_rbac_user
    ):
        """Should handle legacy string response format."""
        from app.api.v1.intelligent_chat import intelligent_chat, IntelligentChatRequest

        request = IntelligentChatRequest(
            message="Hello, how are you?",
            session_id="session-456",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            # Legacy string response
            mock_service.chat = AsyncMock(return_value="Hello! I'm here to help with employee insights.")

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-456"

                result = await intelligent_chat(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert "Hello" in result.response
        assert result.session_id == "session-456"
        assert result.pattern_detected is None
        assert result.structured_data is None

    @pytest.mark.asyncio
    async def test_chat_with_action_type(
        self, mock_db_session, mock_rbac_user
    ):
        """Should handle quick action type requests."""
        from app.api.v1.intelligent_chat import intelligent_chat, IntelligentChatRequest

        request = IntelligentChatRequest(
            message="Analyze this employee",
            session_id="session-789",
            employee_id="EMP001",
            action_type="diagnose",
        )

        structured_response = {
            "response": "Risk diagnosis for EMP001",
            "pattern_detected": "diagnose",
            "structured_data": {
                "diagnosis_type": "risk",
                "recommendations": ["action1", "action2"]
            }
        }

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat = AsyncMock(return_value=structured_response)

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-789"

                result = await intelligent_chat(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert result.structured_data is not None
        assert "recommendations" in result.structured_data

    @pytest.mark.asyncio
    async def test_chat_value_error(
        self, mock_db_session, mock_rbac_user
    ):
        """Should return 400 for ValueError."""
        from app.api.v1.intelligent_chat import intelligent_chat, IntelligentChatRequest

        request = IntelligentChatRequest(
            message="Invalid request",
            session_id="session-err",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat = AsyncMock(side_effect=ValueError("Invalid input format"))

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-err"

                with pytest.raises(HTTPException) as exc_info:
                    await intelligent_chat(
                        request=request,
                        current_user=mock_rbac_user,
                        db=mock_db_session,
                    )

                assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_chat_internal_error(
        self, mock_db_session, mock_rbac_user
    ):
        """Should return 500 for internal errors."""
        from app.api.v1.intelligent_chat import intelligent_chat, IntelligentChatRequest

        request = IntelligentChatRequest(
            message="Test",
            session_id="session-500",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat = AsyncMock(side_effect=Exception("LLM service unavailable"))

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-500"

                with pytest.raises(HTTPException) as exc_info:
                    await intelligent_chat(
                        request=request,
                        current_user=mock_rbac_user,
                        db=mock_db_session,
                    )

                assert exc_info.value.status_code == 500


# ============ Test Chat With Tools ============

class TestChatWithTools:
    """Test tool-calling chat endpoint."""

    @pytest.mark.asyncio
    async def test_chat_with_tools_success(
        self, mock_db_session, mock_rbac_user, mock_tool_chat_response
    ):
        """Should return tool-calling response."""
        from app.api.v1.intelligent_chat import chat_with_tools, ToolChatRequest

        request = ToolChatRequest(
            message="How many employees in Engineering?",
            session_id="session-tools-1",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat_with_tools = AsyncMock(return_value=mock_tool_chat_response)

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-tools-1"

                result = await chat_with_tools(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert "150 employees" in result.response
        assert len(result.tool_history) == 1
        assert result.tool_history[0]["name"] == "count_employees"
        assert result.iterations == 1
        assert result.success is True

    @pytest.mark.asyncio
    async def test_chat_with_tools_error(
        self, mock_db_session, mock_rbac_user
    ):
        """Should handle tool-calling errors."""
        from app.api.v1.intelligent_chat import chat_with_tools, ToolChatRequest

        request = ToolChatRequest(
            message="Complex query",
            session_id="session-tools-err",
        )

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service.chat_with_tools = AsyncMock(
                side_effect=Exception("Tool execution failed")
            )

            with patch("app.api.v1.intelligent_chat.get_or_create_session_id") as mock_session:
                mock_session.return_value = "session-tools-err"

                with pytest.raises(HTTPException) as exc_info:
                    await chat_with_tools(
                        request=request,
                        current_user=mock_rbac_user,
                        db=mock_db_session,
                    )

                assert exc_info.value.status_code == 500


# ============ Test Chat History ============

class TestChatHistory:
    """Test chat history endpoints."""

    @pytest.mark.asyncio
    async def test_get_chat_history_success(
        self, mock_db_session, mock_rbac_user, mock_chat_message
    ):
        """Should return chat history for session."""
        from app.api.v1.intelligent_chat import get_chat_history

        # Create second message
        mock_response_msg = MagicMock()
        mock_response_msg.id = 2
        mock_response_msg.session_id = "session-123"
        mock_response_msg.employee_id = "EMP001"
        mock_response_msg.message = "This employee has moderate risk..."
        mock_response_msg.role = "assistant"
        mock_response_msg.timestamp = datetime.utcnow()

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_response_msg, mock_chat_message])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_chat_history(
            session_id="session-123",
            limit=50,
            current_user=mock_rbac_user,
            db=mock_db_session,
        )

        assert len(result) == 2
        # Should be in chronological order (reversed)
        assert result[0].role == "user"
        assert result[1].role == "assistant"

    @pytest.mark.asyncio
    async def test_get_chat_history_empty(
        self, mock_db_session, mock_rbac_user
    ):
        """Should return empty list for new session."""
        from app.api.v1.intelligent_chat import get_chat_history

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_chat_history(
            session_id="new-session",
            limit=50,
            current_user=mock_rbac_user,
            db=mock_db_session,
        )

        assert len(result) == 0


class TestDeleteChatHistory:
    """Test delete chat history endpoint."""

    @pytest.mark.asyncio
    async def test_delete_chat_history_success(
        self, mock_db_session, mock_rbac_user, mock_chat_message
    ):
        """Should delete all messages in session."""
        from app.api.v1.intelligent_chat import delete_chat_history

        mock_result = MagicMock()
        mock_result.scalars = MagicMock(return_value=MagicMock(
            all=MagicMock(return_value=[mock_chat_message])
        ))
        mock_db_session.execute = AsyncMock(return_value=mock_result)
        mock_db_session.delete = AsyncMock()
        mock_db_session.commit = AsyncMock()

        result = await delete_chat_history(
            session_id="session-123",
            current_user=mock_rbac_user,
            db=mock_db_session,
        )

        assert result["status"] == "success"
        assert result["deleted_count"] == 1
        mock_db_session.delete.assert_called_once()
        mock_db_session.commit.assert_called_once()


# ============ Test Analysis Endpoints ============

class TestAnalyzeEmployeeRisk:
    """Test risk analysis endpoint."""

    @pytest.mark.asyncio
    async def test_analyze_risk_success(
        self, mock_db_session, mock_rbac_user, mock_context
    ):
        """Should analyze employee risk."""
        from app.api.v1.intelligent_chat import analyze_employee_risk

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service._resolve_dataset_id = AsyncMock(return_value="ds-001")
            mock_service.gather_context = AsyncMock(return_value=mock_context)
            mock_service._generate_enhanced_risk_diagnosis = AsyncMock(
                return_value="Risk analysis: This employee shows moderate risk..."
            )

            result = await analyze_employee_risk(
                hr_code="EMP001",
                dataset_id="ds-001",
                current_user=mock_rbac_user,
                db=mock_db_session,
            )

        assert result["hr_code"] == "EMP001"
        assert "Risk analysis" in result["analysis"]
        assert "employee" in result["context"]


class TestGenerateRetentionPlan:
    """Test retention plan generation endpoint."""

    @pytest.mark.asyncio
    async def test_generate_retention_plan_success(
        self, mock_db_session, mock_rbac_user, mock_context
    ):
        """Should generate retention plan."""
        from app.api.v1.intelligent_chat import generate_retention_plan

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service._resolve_dataset_id = AsyncMock(return_value="ds-001")
            mock_service.gather_context = AsyncMock(return_value=mock_context)
            mock_service._generate_enhanced_retention_playbook = AsyncMock(
                return_value="Retention Plan: 1. Increase salary..."
            )

            result = await generate_retention_plan(
                hr_code="EMP001",
                dataset_id="ds-001",
                current_user=mock_rbac_user,
                db=mock_db_session,
            )

        assert result["hr_code"] == "EMP001"
        assert "Retention Plan" in result["plan"]


class TestGetExitPatterns:
    """Test exit patterns analysis endpoint."""

    @pytest.mark.asyncio
    async def test_get_exit_patterns_success(
        self, mock_db_session, mock_rbac_user, mock_context
    ):
        """Should analyze exit patterns."""
        from app.api.v1.intelligent_chat import get_exit_patterns

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service._resolve_dataset_id = AsyncMock(return_value=None)
            mock_service.gather_context = AsyncMock(return_value=mock_context)
            mock_service._generate_exit_pattern_mining = AsyncMock(
                return_value="Common exit patterns: Management issues..."
            )

            result = await get_exit_patterns(
                dataset_id=None,
                current_user=mock_rbac_user,
                db=mock_db_session,
            )

        assert "exit patterns" in result["analysis"].lower()


class TestCompareWithResigned:
    """Test employee comparison endpoint."""

    @pytest.mark.asyncio
    async def test_compare_employee_success(
        self, mock_db_session, mock_rbac_user, mock_context
    ):
        """Should compare employee with resigned employees."""
        from app.api.v1.intelligent_chat import compare_with_resigned

        with patch("app.api.v1.intelligent_chat.IntelligentChatbotService") as mock_service_class:
            mock_service = MagicMock()
            mock_service_class.return_value = mock_service
            mock_service._resolve_dataset_id = AsyncMock(return_value="ds-001")
            mock_service.gather_context = AsyncMock(return_value=mock_context)
            mock_service._generate_enhanced_similarity_analysis = AsyncMock(
                return_value="Comparison: This employee is similar to 3 resigned employees..."
            )

            result = await compare_with_resigned(
                hr_code="EMP001",
                dataset_id="ds-001",
                current_user=mock_rbac_user,
                db=mock_db_session,
            )

        assert result["hr_code"] == "EMP001"
        assert "Comparison" in result["comparison"]
        assert len(result["similar_employees"]) == 2


# ============ Test Content Refinement ============

class TestRefineContent:
    """Test content refinement endpoint."""

    @pytest.mark.asyncio
    async def test_refine_content_success(
        self, mock_db_session, mock_rbac_user
    ):
        """Should refine content based on instruction."""
        from app.api.v1.intelligent_chat import refine_content, ContentRefineRequest

        request = ContentRefineRequest(
            content_type="email",
            subject="Meeting Request",
            body="Hi, can we meet tomorrow?",
            instruction="make it more formal",
            recipient_context="Senior leadership",
        )

        mock_llm_response = '''{"refined_subject": "Meeting Request - Formal Discussion",
        "refined_body": "Dear Leadership Team,\\n\\nI would like to request a meeting at your earliest convenience.",
        "changes_made": "Made greeting more formal, improved tone"}'''

        with patch("app.api.v1.intelligent_chat.ChatbotService") as mock_chatbot:
            mock_service = MagicMock()
            mock_chatbot.return_value = mock_service
            mock_service._get_llm_response = AsyncMock(
                return_value=(mock_llm_response, {"tokens": 100})
            )

            with patch("app.api.v1.intelligent_chat.resolve_llm_provider_and_model") as mock_resolve:
                mock_resolve.return_value = ("openai", "openai", "gpt-4")

                result = await refine_content(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert "Formal Discussion" in result.refined_subject
        assert "Leadership Team" in result.refined_body
        assert "formal" in result.changes_made.lower()

    @pytest.mark.asyncio
    async def test_refine_content_empty_response(
        self, mock_db_session, mock_rbac_user
    ):
        """Should handle empty LLM response."""
        from app.api.v1.intelligent_chat import refine_content, ContentRefineRequest

        request = ContentRefineRequest(
            content_type="email",
            subject="Test",
            body="Test body",
            instruction="shorten",
        )

        with patch("app.api.v1.intelligent_chat.ChatbotService") as mock_chatbot:
            mock_service = MagicMock()
            mock_chatbot.return_value = mock_service
            mock_service._get_llm_response = AsyncMock(
                return_value=("", {"tokens": 0})
            )

            with patch("app.api.v1.intelligent_chat.resolve_llm_provider_and_model") as mock_resolve:
                mock_resolve.return_value = ("openai", "openai", "gpt-4")

                with pytest.raises(HTTPException) as exc_info:
                    await refine_content(
                        request=request,
                        current_user=mock_rbac_user,
                        db=mock_db_session,
                    )

                assert exc_info.value.status_code == 500
                assert "empty response" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_refine_content_fallback_response(
        self, mock_db_session, mock_rbac_user
    ):
        """Should use fallback for non-JSON response."""
        from app.api.v1.intelligent_chat import refine_content, ContentRefineRequest

        request = ContentRefineRequest(
            content_type="meeting",
            body="Team sync meeting tomorrow at 2pm",
            instruction="add agenda items",
        )

        # Non-JSON but valid content response
        mock_llm_response = "Team sync meeting tomorrow at 2pm.\n\nAgenda:\n1. Project updates\n2. Q&A"

        with patch("app.api.v1.intelligent_chat.ChatbotService") as mock_chatbot:
            mock_service = MagicMock()
            mock_chatbot.return_value = mock_service
            mock_service._get_llm_response = AsyncMock(
                return_value=(mock_llm_response, {"tokens": 50})
            )

            with patch("app.api.v1.intelligent_chat.resolve_llm_provider_and_model") as mock_resolve:
                mock_resolve.return_value = ("ollama", "ollama", "llama3")

                result = await refine_content(
                    request=request,
                    current_user=mock_rbac_user,
                    db=mock_db_session,
                )

        assert "Agenda" in result.refined_body
        assert result.changes_made == "Content refined based on instruction"


# ============ Test Connection Manager ============

class TestConnectionManager:
    """Test WebSocket connection manager."""

    @pytest.mark.asyncio
    async def test_connection_manager_connect(self):
        """Should accept and store connection."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.accept = AsyncMock()

        await manager.connect(mock_websocket, "user-123")

        mock_websocket.accept.assert_called_once()
        assert "user-123" in manager.active_connections

    def test_connection_manager_disconnect(self):
        """Should remove connection on disconnect."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        manager.active_connections["user-123"] = MagicMock()

        manager.disconnect("user-123")

        assert "user-123" not in manager.active_connections

    @pytest.mark.asyncio
    async def test_connection_manager_send_token(self):
        """Should send token message."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_token(mock_websocket, "Hello")

        mock_websocket.send_json.assert_called_once_with({
            "type": "token",
            "content": "Hello"
        })

    @pytest.mark.asyncio
    async def test_connection_manager_send_thinking(self):
        """Should send thinking indicator."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_thinking(mock_websocket, "Processing...")

        mock_websocket.send_json.assert_called_once_with({
            "type": "thinking",
            "content": "Processing..."
        })

    @pytest.mark.asyncio
    async def test_connection_manager_send_done(self):
        """Should send done signal."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_done(mock_websocket)

        mock_websocket.send_json.assert_called_once_with({"type": "done"})

    @pytest.mark.asyncio
    async def test_connection_manager_send_error(self):
        """Should send error message."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_error(mock_websocket, "Something went wrong")

        mock_websocket.send_json.assert_called_once_with({
            "type": "error",
            "error": "Something went wrong"
        })

    @pytest.mark.asyncio
    async def test_connection_manager_send_tool_call(self):
        """Should send tool call notification."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_tool_call(mock_websocket, "count_employees", {"department": "Sales"})

        mock_websocket.send_json.assert_called_once_with({
            "type": "tool_call",
            "tool": "count_employees",
            "arguments": {"department": "Sales"}
        })

    @pytest.mark.asyncio
    async def test_connection_manager_send_tool_result(self):
        """Should send tool result notification."""
        from app.api.v1.intelligent_chat import ConnectionManager

        manager = ConnectionManager()
        mock_websocket = MagicMock()
        mock_websocket.send_json = AsyncMock()

        await manager.send_tool_result(
            mock_websocket,
            tool_name="count_employees",
            success=True,
            preview="Found 50 employees",
            execution_time_ms=150
        )

        mock_websocket.send_json.assert_called_once_with({
            "type": "tool_result",
            "tool": "count_employees",
            "success": True,
            "preview": "Found 50 employees",
            "execution_time_ms": 150
        })
