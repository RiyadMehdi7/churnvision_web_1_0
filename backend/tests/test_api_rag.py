"""
Tests for app/api/v1/rag.py - RAG (Retrieval-Augmented Generation) endpoints.

Tests cover:
- Document upload and management
- Custom HR rules CRUD
- Knowledge base queries
- Treatment validation
- RAG settings management
- Statistics endpoint
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.schemas.rag import (
    RuleCategory,
    DocumentType,
    KnowledgeBaseMode,
)


# ============ Fixtures ============

@pytest.fixture
def mock_legacy_user():
    """Create a mock legacy user for auth."""
    user = MagicMock()
    user.id = 1
    user.username = "testuser"
    user.email = "test@example.com"
    user.is_active = True
    return user


@pytest.fixture
def mock_document():
    """Create a mock document record."""
    doc = MagicMock()
    doc.id = 1
    doc.title = "HR Policy Document"
    doc.source_path = "/uploads/abc123_policy.pdf"
    doc.mime_type = "application/pdf"
    doc.size_bytes = 102400
    doc.status = "ready"
    doc.error_message = None
    doc.document_type = "policy"
    doc.tags = "hr,policy,2024"
    doc.chunk_count = 15
    doc.project_id = "proj-001"
    doc.user_id = 1
    doc.created_at = datetime.utcnow()
    doc.updated_at = datetime.utcnow()
    doc.chunks = []
    return doc


@pytest.fixture
def mock_custom_rule():
    """Create a mock custom HR rule."""
    rule = MagicMock()
    rule.id = 1
    rule.name = "Remote Work Eligibility"
    rule.category = "eligibility"
    rule.rule_text = "Employees with tenure >= 6 months are eligible for remote work."
    rule.priority = 8
    rule.is_active = True
    rule.project_id = "proj-001"
    rule.created_at = datetime.utcnow()
    rule.updated_at = datetime.utcnow()
    return rule


@pytest.fixture
def mock_rag_settings():
    """Create mock RAG settings."""
    settings = MagicMock()
    settings.id = 1
    settings.mode = "hybrid"
    settings.chunk_size = 500
    settings.chunk_overlap = 50
    settings.retrieval_top_k = 5
    settings.similarity_threshold = 0.7
    settings.use_general_hr_knowledge = True
    settings.strict_policy_mode = False
    settings.project_id = "proj-001"
    settings.user_id = 1
    settings.created_at = datetime.utcnow()
    settings.updated_at = datetime.utcnow()
    return settings


# ============ Test Document Endpoints ============

class TestDocumentUpload:
    """Test document upload endpoint."""

    @pytest.mark.asyncio
    async def test_upload_document_unsupported_type(
        self, mock_db_session, mock_legacy_user
    ):
        """Should reject unsupported file types."""
        from app.api.v1.rag import upload_document
        from io import BytesIO

        # Create a mock UploadFile with unsupported extension
        mock_file = MagicMock()
        mock_file.filename = "document.exe"
        mock_file.content_type = "application/octet-stream"
        mock_file.read = AsyncMock(return_value=b"fake content")

        with pytest.raises(HTTPException) as exc_info:
            await upload_document(
                file=mock_file,
                title="Test Document",
                document_type="general",
                tags=None,
                project_id=None,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 400
        assert "File type not supported" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_upload_document_too_large(
        self, mock_db_session, mock_legacy_user
    ):
        """Should reject files exceeding size limit."""
        from app.api.v1.rag import upload_document

        mock_file = MagicMock()
        mock_file.filename = "large_document.pdf"
        mock_file.content_type = "application/pdf"
        # Return content larger than limit (assume 10MB limit)
        mock_file.read = AsyncMock(return_value=b"x" * (15 * 1024 * 1024))

        with patch("app.api.v1.rag.settings") as mock_settings:
            mock_settings.RAG_MAX_DOCUMENT_SIZE_MB = 10

            with pytest.raises(HTTPException) as exc_info:
                await upload_document(
                    file=mock_file,
                    title="Large Document",
                    document_type="general",
                    tags=None,
                    project_id=None,
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

            assert exc_info.value.status_code == 400
            assert "File too large" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_upload_document_success(
        self, mock_db_session, mock_legacy_user, mock_document
    ):
        """Should successfully upload and process document."""
        from app.api.v1.rag import upload_document

        mock_file = MagicMock()
        mock_file.filename = "policy.pdf"
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(return_value=b"PDF content here")

        with patch("app.api.v1.rag.settings") as mock_settings:
            mock_settings.RAG_MAX_DOCUMENT_SIZE_MB = 10
            mock_settings.RAG_UPLOAD_PATH = "/tmp/rag_uploads"

            with patch("app.api.v1.rag.Path") as mock_path:
                mock_path_instance = MagicMock()
                mock_path.return_value = mock_path_instance
                mock_path_instance.suffix = ".pdf"
                mock_path_instance.mkdir = MagicMock()
                mock_path_instance.__truediv__ = MagicMock(return_value=mock_path_instance)
                mock_path_instance.exists = MagicMock(return_value=False)

                with patch("builtins.open", MagicMock()):
                    with patch("app.api.v1.rag.RAGService") as mock_rag_service:
                        mock_service_instance = MagicMock()
                        mock_rag_service.return_value = mock_service_instance
                        mock_service_instance.ingest_document = AsyncMock(return_value=mock_document)

                        result = await upload_document(
                            file=mock_file,
                            title="HR Policy",
                            document_type="policy",
                            tags="hr,policy",
                            project_id="proj-001",
                            current_user=mock_legacy_user,
                            db=mock_db_session,
                        )

        assert result.id == 1
        assert result.title == "HR Policy Document"
        assert result.status.value == "ready" or result.status == "ready"


class TestListDocuments:
    """Test list documents endpoint."""

    @pytest.mark.asyncio
    async def test_list_documents_success(
        self, mock_db_session, mock_legacy_user, mock_document
    ):
        """Should return list of documents."""
        from app.api.v1.rag import list_documents

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.list_documents = AsyncMock(return_value=[mock_document])

            result = await list_documents(
                document_type=None,
                status=None,
                project_id=None,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert len(result) == 1
        assert result[0].id == 1
        assert result[0].title == "HR Policy Document"
        assert result[0].chunk_count == 15

    @pytest.mark.asyncio
    async def test_list_documents_with_filters(
        self, mock_db_session, mock_legacy_user, mock_document
    ):
        """Should filter documents by type and status."""
        from app.api.v1.rag import list_documents

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.list_documents = AsyncMock(return_value=[mock_document])

            result = await list_documents(
                document_type="policy",
                status="ready",
                project_id="proj-001",
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

            # Verify service was called with filters
            mock_service_instance.list_documents.assert_called_once_with(
                project_id="proj-001",
                document_type="policy",
                status="ready",
            )


class TestGetDocument:
    """Test get document endpoint."""

    @pytest.mark.asyncio
    async def test_get_document_success(
        self, mock_db_session, mock_legacy_user, mock_document
    ):
        """Should return document details."""
        from app.api.v1.rag import get_document

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.get_document = AsyncMock(return_value=mock_document)

            result = await get_document(
                document_id=1,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.id == 1
        assert result.title == "HR Policy Document"
        assert result.project_id == "proj-001"

    @pytest.mark.asyncio
    async def test_get_document_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when document not found."""
        from app.api.v1.rag import get_document

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.get_document = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await get_document(
                    document_id=999,
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

            assert exc_info.value.status_code == 404
            assert "Document not found" in exc_info.value.detail


class TestDeleteDocument:
    """Test delete document endpoint."""

    @pytest.mark.asyncio
    async def test_delete_document_success(
        self, mock_db_session, mock_legacy_user
    ):
        """Should delete document successfully."""
        from app.api.v1.rag import delete_document

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.delete_document = AsyncMock(return_value=True)

            result = await delete_document(
                document_id=1,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result["message"] == "Document deleted successfully"
        assert result["document_id"] == 1

    @pytest.mark.asyncio
    async def test_delete_document_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when document not found."""
        from app.api.v1.rag import delete_document

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.delete_document = AsyncMock(return_value=False)

            with pytest.raises(HTTPException) as exc_info:
                await delete_document(
                    document_id=999,
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

            assert exc_info.value.status_code == 404


# ============ Test Custom Rules Endpoints ============

class TestCreateCustomRule:
    """Test create custom rule endpoint."""

    @pytest.mark.asyncio
    async def test_create_custom_rule_success(
        self, mock_db_session, mock_legacy_user, mock_custom_rule
    ):
        """Should create custom rule successfully."""
        from app.api.v1.rag import create_custom_rule
        from app.schemas.rag import CustomRuleCreate

        request = CustomRuleCreate(
            name="Remote Work Eligibility",
            category=RuleCategory.ELIGIBILITY,
            rule_text="Employees with tenure >= 6 months are eligible for remote work.",
            priority=8,
            project_id="proj-001",
        )

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.create_custom_rule = AsyncMock(return_value=mock_custom_rule)

            result = await create_custom_rule(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.id == 1
        assert result.name == "Remote Work Eligibility"
        assert result.priority == 8
        assert result.is_active is True


class TestListCustomRules:
    """Test list custom rules endpoint."""

    @pytest.mark.asyncio
    async def test_list_custom_rules_success(
        self, mock_db_session, mock_legacy_user, mock_custom_rule
    ):
        """Should return list of custom rules."""
        from app.api.v1.rag import list_custom_rules

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.get_custom_rules = AsyncMock(return_value=[mock_custom_rule])

            result = await list_custom_rules(
                category=None,
                is_active=True,
                project_id=None,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert len(result) == 1
        assert result[0].name == "Remote Work Eligibility"


class TestGetCustomRule:
    """Test get custom rule endpoint."""

    @pytest.mark.asyncio
    async def test_get_custom_rule_success(
        self, mock_db_session, mock_legacy_user, mock_custom_rule
    ):
        """Should return custom rule details."""
        from app.api.v1.rag import get_custom_rule

        # Mock the direct DB query in the endpoint
        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_custom_rule)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        result = await get_custom_rule(
            rule_id=1,
            current_user=mock_legacy_user,
            db=mock_db_session,
        )

        assert result.id == 1
        assert result.name == "Remote Work Eligibility"

    @pytest.mark.asyncio
    async def test_get_custom_rule_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when rule not found."""
        from app.api.v1.rag import get_custom_rule

        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_custom_rule(
                rule_id=999,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 404
        assert "Rule not found" in exc_info.value.detail


class TestUpdateCustomRule:
    """Test update custom rule endpoint."""

    @pytest.mark.asyncio
    async def test_update_custom_rule_success(
        self, mock_db_session, mock_legacy_user, mock_custom_rule
    ):
        """Should update custom rule successfully."""
        from app.api.v1.rag import update_custom_rule
        from app.schemas.rag import CustomRuleUpdate

        request = CustomRuleUpdate(
            priority=10,
            is_active=False,
        )

        mock_custom_rule.priority = 10
        mock_custom_rule.is_active = False

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.update_custom_rule = AsyncMock(return_value=mock_custom_rule)

            result = await update_custom_rule(
                rule_id=1,
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.priority == 10
        assert result.is_active is False

    @pytest.mark.asyncio
    async def test_update_custom_rule_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when rule not found."""
        from app.api.v1.rag import update_custom_rule
        from app.schemas.rag import CustomRuleUpdate

        request = CustomRuleUpdate(priority=10)

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.update_custom_rule = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await update_custom_rule(
                    rule_id=999,
                    request=request,
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

            assert exc_info.value.status_code == 404


class TestDeleteCustomRule:
    """Test delete custom rule endpoint."""

    @pytest.mark.asyncio
    async def test_delete_custom_rule_success(
        self, mock_db_session, mock_legacy_user
    ):
        """Should delete custom rule successfully."""
        from app.api.v1.rag import delete_custom_rule

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.delete_custom_rule = AsyncMock(return_value=True)

            result = await delete_custom_rule(
                rule_id=1,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result["message"] == "Rule deleted successfully"
        assert result["rule_id"] == 1

    @pytest.mark.asyncio
    async def test_delete_custom_rule_not_found(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return 404 when rule not found."""
        from app.api.v1.rag import delete_custom_rule

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.delete_custom_rule = AsyncMock(return_value=False)

            with pytest.raises(HTTPException) as exc_info:
                await delete_custom_rule(
                    rule_id=999,
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

            assert exc_info.value.status_code == 404


# ============ Test Query Endpoints ============

class TestQueryKnowledgeBase:
    """Test knowledge base query endpoint."""

    @pytest.mark.asyncio
    async def test_query_knowledge_base_success(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return query results with documents and rules."""
        from app.api.v1.rag import query_knowledge_base
        from app.schemas.rag import RAGQueryRequest

        request = RAGQueryRequest(
            query="What is the remote work policy?",
            include_rules=True,
            top_k=5,
        )

        mock_context = {
            "documents": [
                {
                    "content": "Remote work is allowed for eligible employees...",
                    "source": "HR Policy Document",
                    "document_id": 1,
                    "document_type": "policy",
                    "similarity": 0.92,
                    "metadata": {"page": 5},
                }
            ],
            "custom_rules": [
                {
                    "id": 1,
                    "name": "Remote Work Eligibility",
                    "category": "eligibility",
                    "rule_text": "Employees with tenure >= 6 months...",
                    "priority": 8,
                    "is_active": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "project_id": None,
                }
            ],
            "sources": [{"title": "HR Policy Document", "type": "policy"}],
            "total_chunks": 1,
            "total_rules": 1,
        }

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.retrieve_context = AsyncMock(return_value=mock_context)

            result = await query_knowledge_base(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert len(result.documents) == 1
        assert result.documents[0].similarity == 0.92
        assert len(result.custom_rules) == 1
        assert result.total_chunks == 1
        assert result.total_rules == 1

    @pytest.mark.asyncio
    async def test_query_knowledge_base_empty_results(
        self, mock_db_session, mock_legacy_user
    ):
        """Should handle empty results gracefully."""
        from app.api.v1.rag import query_knowledge_base
        from app.schemas.rag import RAGQueryRequest

        request = RAGQueryRequest(
            query="Nonexistent topic",
            include_rules=False,
            top_k=5,
        )

        mock_context = {
            "documents": [],
            "custom_rules": [],
            "sources": [],
            "total_chunks": 0,
            "total_rules": 0,
        }

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.retrieve_context = AsyncMock(return_value=mock_context)

            result = await query_knowledge_base(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert len(result.documents) == 0
        assert len(result.custom_rules) == 0


class TestValidateTreatment:
    """Test treatment validation endpoint."""

    @pytest.mark.asyncio
    async def test_validate_treatment_valid(
        self, mock_db_session, mock_legacy_user
    ):
        """Should validate treatment as valid."""
        from app.api.v1.rag import validate_treatment
        from app.schemas.rag import TreatmentValidationRequest

        request = TreatmentValidationRequest(
            treatment={
                "name": "Salary Increase",
                "type": "compensation",
                "amount": 5000,
            },
            project_id="proj-001",
        )

        mock_context = {
            "documents": [],
            "custom_rules": [],
            "sources": [],
        }

        mock_validation_result = {
            "is_valid": True,
            "treatment_name": "Salary Increase",
            "violations": [],
            "adaptations": [],
            "reasoning": "Treatment complies with all policies.",
            "adapted_treatment": None,
        }

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.retrieve_context = AsyncMock(return_value=mock_context)
            mock_service_instance.validate_treatment = AsyncMock(return_value=mock_validation_result)

            result = await validate_treatment(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.is_valid is True
        assert result.treatment_name == "Salary Increase"
        assert len(result.violations) == 0

    @pytest.mark.asyncio
    async def test_validate_treatment_with_violations(
        self, mock_db_session, mock_legacy_user
    ):
        """Should return violations for invalid treatment."""
        from app.api.v1.rag import validate_treatment
        from app.schemas.rag import TreatmentValidationRequest

        request = TreatmentValidationRequest(
            treatment={
                "name": "Excessive Bonus",
                "type": "bonus",
                "amount": 100000,
            },
        )

        mock_context = {"documents": [], "custom_rules": [], "sources": []}

        mock_validation_result = {
            "is_valid": False,
            "treatment_name": "Excessive Bonus",
            "violations": [
                {
                    "rule": "Max Bonus Policy",
                    "source": "HR Policy Document",
                    "reason": "Bonus amount exceeds maximum allowed of $50,000",
                }
            ],
            "adaptations": [
                {
                    "field": "amount",
                    "original": 100000,
                    "adapted": 50000,
                    "note": "Reduced to maximum allowed",
                    "reason": "Company policy cap",
                }
            ],
            "reasoning": "Treatment violates bonus cap policy.",
            "adapted_treatment": {"name": "Excessive Bonus", "type": "bonus", "amount": 50000},
        }

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.retrieve_context = AsyncMock(return_value=mock_context)
            mock_service_instance.validate_treatment = AsyncMock(return_value=mock_validation_result)

            result = await validate_treatment(
                request=request,
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.is_valid is False
        assert len(result.violations) == 1
        assert result.violations[0].rule == "Max Bonus Policy"
        assert len(result.adaptations) == 1
        assert result.adapted_treatment is not None


# ============ Test Settings Endpoints ============

class TestGetRAGSettings:
    """Test get RAG settings endpoint."""

    @pytest.mark.asyncio
    async def test_get_rag_settings_success(
        self, mock_db_session, mock_legacy_user, mock_rag_settings
    ):
        """Should return RAG settings."""
        from app.api.v1.rag import get_rag_settings

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.get_settings = AsyncMock(return_value=mock_rag_settings)

            result = await get_rag_settings(
                project_id="proj-001",
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.id == 1
        assert result.mode == "hybrid"
        assert result.chunk_size == 500
        assert result.retrieval_top_k == 5


class TestUpdateRAGSettings:
    """Test update RAG settings endpoint."""

    @pytest.mark.asyncio
    async def test_update_rag_settings_success(
        self, mock_db_session, mock_legacy_user, mock_rag_settings
    ):
        """Should update RAG settings successfully."""
        from app.api.v1.rag import update_rag_settings
        from app.schemas.rag import KnowledgeBaseSettingsUpdate

        request = KnowledgeBaseSettingsUpdate(
            chunk_size=750,
            retrieval_top_k=10,
            mode=KnowledgeBaseMode.CUSTOM,
        )

        mock_rag_settings.chunk_size = 750
        mock_rag_settings.retrieval_top_k = 10
        mock_rag_settings.mode = "custom"

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.update_settings = AsyncMock(return_value=mock_rag_settings)

            result = await update_rag_settings(
                request=request,
                project_id="proj-001",
                current_user=mock_legacy_user,
                db=mock_db_session,
            )

        assert result.chunk_size == 750
        assert result.retrieval_top_k == 10
        assert result.mode == "custom"


# ============ Test Statistics Endpoint ============

class TestGetRAGStats:
    """Test RAG statistics endpoint."""

    @pytest.mark.asyncio
    async def test_get_rag_stats_success(
        self, mock_db_session, mock_legacy_user, mock_document, mock_custom_rule
    ):
        """Should return RAG system statistics."""
        from app.api.v1.rag import get_rag_stats

        # Create mock documents with different statuses
        doc_ready = MagicMock()
        doc_ready.status = "ready"
        doc_ready.chunk_count = 15

        doc_pending = MagicMock()
        doc_pending.status = "pending"
        doc_pending.chunk_count = 0

        mock_custom_rule.is_active = True
        inactive_rule = MagicMock()
        inactive_rule.is_active = False

        mock_collection_stats = {
            "name": "churnvision_docs",
            "count": 150,
            "embedding_dimension": 384,
        }

        with patch("app.api.v1.rag.RAGService") as mock_rag_service:
            mock_service_instance = MagicMock()
            mock_rag_service.return_value = mock_service_instance
            mock_service_instance.list_documents = AsyncMock(return_value=[doc_ready, doc_pending])
            mock_service_instance.get_custom_rules = AsyncMock(
                return_value=[mock_custom_rule, inactive_rule]
            )

            with patch("app.api.v1.rag.get_vector_store") as mock_get_vs:
                mock_vector_store = MagicMock()
                mock_get_vs.return_value = mock_vector_store
                mock_vector_store.get_collection_stats = MagicMock(return_value=mock_collection_stats)

                result = await get_rag_stats(
                    project_id="proj-001",
                    current_user=mock_legacy_user,
                    db=mock_db_session,
                )

        assert result.total_documents == 2
        assert result.ready_documents == 1
        assert result.total_chunks == 15
        assert result.total_rules == 2
        assert result.active_rules == 1
        assert result.collection_stats["name"] == "churnvision_docs"
