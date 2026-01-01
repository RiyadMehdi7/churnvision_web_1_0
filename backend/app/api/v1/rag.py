"""
RAG API Endpoints

Document management, custom rules, knowledge base queries, and settings
for the Retrieval-Augmented Generation subsystem.
"""

import logging
import os
import uuid
import shutil
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.core.config import settings
from app.core.security_utils import sanitize_filename, sanitize_error_message

logger = logging.getLogger(__name__)
from app.services.rag_service import RAGService
from app.services.vector_store_service import get_vector_store
from app.schemas.rag import (
    DocumentUploadResponse,
    DocumentSummary,
    DocumentDetail,
    CustomRuleCreate,
    CustomRuleUpdate,
    CustomRuleResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    RAGChunkResult,
    KnowledgeBaseSettingsUpdate,
    KnowledgeBaseSettingsResponse,
    TreatmentValidationRequest,
    TreatmentValidationResponse,
    TreatmentViolation,
    TreatmentAdaptation,
    RAGStatsResponse,
)

router = APIRouter()


# ============================================================================
# Document Endpoints
# ============================================================================

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    document_type: str = Form("general"),
    tags: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload and process a document for RAG.

    Supports PDF, DOCX, TXT, and MD files.
    Documents are automatically chunked and embedded for semantic search.
    """
    # Validate file type
    allowed_extensions = {".pdf", ".docx", ".txt", ".md"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
        )

    # Validate file size
    max_size = settings.RAG_MAX_DOCUMENT_SIZE_MB * 1024 * 1024
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {settings.RAG_MAX_DOCUMENT_SIZE_MB}MB"
        )

    # Ensure upload directory exists
    upload_dir = Path(settings.RAG_UPLOAD_PATH)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Save file with unique name (sanitize user-provided filename)
    safe_filename = sanitize_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{safe_filename}"
    file_path = upload_dir / unique_filename

    try:
        with open(file_path, "wb") as f:
            f.write(file_content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "file save"),
        )

    # Use filename as title if not provided
    doc_title = title or file.filename

    # Fix MIME type detection for files that browsers send as octet-stream
    mime_type = file.content_type
    if mime_type in ("application/octet-stream", None, ""):
        # Map file extensions to correct MIME types
        extension_mime_map = {
            ".md": "text/markdown",
            ".txt": "text/plain",
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        mime_type = extension_mime_map.get(file_ext, mime_type)

    # Process document
    try:
        rag_service = RAGService(db)
        document = await rag_service.ingest_document(
            file_path=str(file_path),
            title=doc_title,
            mime_type=mime_type,
            document_type=document_type,
            tags=tags,
            project_id=project_id,
            user_id=str(current_user.id),
        )

        return DocumentUploadResponse(
            id=document.id,
            title=document.title,
            source_path=document.source_path,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            status=document.status,
            document_type=document.document_type,
            chunk_count=document.chunk_count,
            created_at=document.created_at,
        )

    except Exception as e:
        # Clean up file on failure
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "document processing"),
        )


@router.get("/documents", response_model=List[DocumentSummary])
async def list_documents(
    document_type: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all uploaded documents with optional filters."""
    rag_service = RAGService(db)
    documents = await rag_service.list_documents(
        project_id=project_id,
        document_type=document_type,
        status=status,
    )

    return [
        DocumentSummary(
            id=doc.id,
            title=doc.title,
            mime_type=doc.mime_type,
            size_bytes=doc.size_bytes,
            status=doc.status,
            error_message=doc.error_message,
            document_type=doc.document_type,
            tags=doc.tags,
            chunk_count=doc.chunk_count,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )
        for doc in documents
    ]


@router.get("/documents/{document_id}", response_model=DocumentDetail)
async def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed information about a document."""
    rag_service = RAGService(db)
    document = await rag_service.get_document(document_id)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    return DocumentDetail(
        id=document.id,
        title=document.title,
        source_path=document.source_path,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        status=document.status,
        error_message=document.error_message,
        document_type=document.document_type,
        tags=document.tags,
        chunk_count=document.chunk_count,
        created_at=document.created_at,
        updated_at=document.updated_at,
        project_id=document.project_id,
        user_id=document.user_id,
        chunks=[
            {"id": c.id, "chunk_index": c.chunk_index, "content": c.content[:200] + "..."}
            for c in document.chunks[:10]  # Limit chunks in response
        ] if document.chunks else [],
    )


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and its chunks."""
    rag_service = RAGService(db)
    deleted = await rag_service.delete_document(document_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    return {"message": "Document deleted successfully", "document_id": document_id}


# ============================================================================
# Custom Rules Endpoints
# ============================================================================

@router.post("/rules", response_model=CustomRuleResponse)
async def create_custom_rule(
    request: CustomRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom HR rule."""
    rag_service = RAGService(db)
    rule = await rag_service.create_custom_rule(
        name=request.name,
        rule_text=request.rule_text,
        category=request.category.value if request.category else None,
        priority=request.priority,
        project_id=request.project_id,
        user_id=str(current_user.id),
    )

    return CustomRuleResponse(
        id=rule.id,
        name=rule.name,
        category=rule.category,
        rule_text=rule.rule_text,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        project_id=rule.project_id,
    )


@router.get("/rules", response_model=List[CustomRuleResponse])
async def list_custom_rules(
    category: Optional[str] = None,
    is_active: Optional[bool] = True,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List custom HR rules."""
    rag_service = RAGService(db)
    rules = await rag_service.get_custom_rules(
        category=category,
        project_id=project_id,
        include_inactive=not is_active if is_active is not None else True,
    )

    return [
        CustomRuleResponse(
            id=rule.id,
            name=rule.name,
            category=rule.category,
            rule_text=rule.rule_text,
            priority=rule.priority,
            is_active=rule.is_active,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
            project_id=rule.project_id,
        )
        for rule in rules
    ]


@router.get("/rules/{rule_id}", response_model=CustomRuleResponse)
async def get_custom_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific custom rule."""
    from sqlalchemy import select
    from app.models.rag import CustomHRRule

    result = await db.execute(select(CustomHRRule).where(CustomHRRule.id == rule_id))
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    return CustomRuleResponse(
        id=rule.id,
        name=rule.name,
        category=rule.category,
        rule_text=rule.rule_text,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        project_id=rule.project_id,
    )


@router.put("/rules/{rule_id}", response_model=CustomRuleResponse)
async def update_custom_rule(
    rule_id: int,
    request: CustomRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing custom rule."""
    rag_service = RAGService(db)

    updates = request.model_dump(exclude_unset=True)
    if "category" in updates and updates["category"]:
        updates["category"] = updates["category"].value

    rule = await rag_service.update_custom_rule(rule_id, updates)

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    return CustomRuleResponse(
        id=rule.id,
        name=rule.name,
        category=rule.category,
        rule_text=rule.rule_text,
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        project_id=rule.project_id,
    )


@router.delete("/rules/{rule_id}")
async def delete_custom_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom rule."""
    rag_service = RAGService(db)
    deleted = await rag_service.delete_custom_rule(rule_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    return {"message": "Rule deleted successfully", "rule_id": rule_id}


# ============================================================================
# Query Endpoints
# ============================================================================

@router.post("/query", response_model=RAGQueryResponse)
async def query_knowledge_base(
    request: RAGQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Query the knowledge base for relevant context.

    Returns matching document chunks and applicable custom rules.
    """
    rag_service = RAGService(db)

    document_types = None
    if request.document_types:
        document_types = [dt.value for dt in request.document_types]

    context = await rag_service.retrieve_context(
        query=request.query,
        project_id=request.project_id,
        include_custom_rules=request.include_rules,
        document_types=document_types,
        top_k=request.top_k,
    )

    return RAGQueryResponse(
        documents=[
            RAGChunkResult(
                content=doc["content"],
                source=doc.get("source", "Unknown"),
                document_id=doc.get("document_id"),
                document_type=doc.get("document_type", "general"),
                similarity=doc.get("similarity", 0),
                metadata=doc.get("metadata"),
            )
            for doc in context.get("documents", [])
        ],
        custom_rules=[
            CustomRuleResponse(
                id=rule["id"],
                name=rule["name"],
                category=rule.get("category"),
                rule_text=rule["rule_text"],
                priority=rule.get("priority", 5),
                is_active=rule.get("is_active", True),
                created_at=rule.get("created_at"),
                updated_at=rule.get("updated_at"),
                project_id=rule.get("project_id"),
            )
            for rule in context.get("custom_rules", [])
        ],
        sources=context.get("sources", []),
        query=request.query,
        total_chunks=context.get("total_chunks", 0),
        total_rules=context.get("total_rules", 0),
    )


@router.post("/validate-treatment", response_model=TreatmentValidationResponse)
async def validate_treatment(
    request: TreatmentValidationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a treatment against company policies and rules.

    Returns validation result with any violations or required adaptations.
    """
    rag_service = RAGService(db)

    # Get context for the treatment
    treatment_name = request.treatment.get("name", "treatment")
    treatment_type = request.treatment.get("type", "")

    context = await rag_service.retrieve_context(
        query=f"policy rules for {treatment_type} {treatment_name}",
        project_id=request.project_id,
        include_custom_rules=True,
        document_types=["policy", "benefit", "rule"],
    )

    # Validate treatment
    result = await rag_service.validate_treatment(
        treatment=request.treatment,
        context=context,
    )

    return TreatmentValidationResponse(
        is_valid=result["is_valid"],
        treatment_name=result["treatment_name"],
        violations=[
            TreatmentViolation(
                rule=v.get("rule"),
                source=v.get("source"),
                reason=v["reason"],
            )
            for v in result.get("violations", [])
        ],
        adaptations=[
            TreatmentAdaptation(
                field=a.get("field"),
                original=a.get("original"),
                adapted=a.get("adapted"),
                note=a.get("note"),
                reason=a.get("reason"),
            )
            for a in result.get("adaptations", [])
        ],
        reasoning=result.get("reasoning", ""),
        adapted_treatment=result.get("adapted_treatment"),
    )


# ============================================================================
# Settings Endpoints
# ============================================================================

@router.get("/settings", response_model=KnowledgeBaseSettingsResponse)
async def get_rag_settings(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get RAG configuration settings."""
    rag_service = RAGService(db)
    settings_record = await rag_service.get_settings(
        project_id=project_id,
        user_id=str(current_user.id),
    )

    return KnowledgeBaseSettingsResponse(
        id=settings_record.id,
        mode=settings_record.mode,
        chunk_size=settings_record.chunk_size,
        chunk_overlap=settings_record.chunk_overlap,
        retrieval_top_k=settings_record.retrieval_top_k,
        similarity_threshold=settings_record.similarity_threshold,
        use_general_hr_knowledge=settings_record.use_general_hr_knowledge,
        strict_policy_mode=settings_record.strict_policy_mode,
        project_id=settings_record.project_id,
        user_id=settings_record.user_id,
        created_at=settings_record.created_at,
        updated_at=settings_record.updated_at,
    )


@router.put("/settings", response_model=KnowledgeBaseSettingsResponse)
async def update_rag_settings(
    request: KnowledgeBaseSettingsUpdate,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update RAG configuration settings."""
    rag_service = RAGService(db)

    updates = request.model_dump(exclude_unset=True)
    if "mode" in updates and updates["mode"]:
        updates["mode"] = updates["mode"].value

    settings_record = await rag_service.update_settings(
        updates=updates,
        project_id=project_id,
        user_id=str(current_user.id),
    )

    return KnowledgeBaseSettingsResponse(
        id=settings_record.id,
        mode=settings_record.mode,
        chunk_size=settings_record.chunk_size,
        chunk_overlap=settings_record.chunk_overlap,
        retrieval_top_k=settings_record.retrieval_top_k,
        similarity_threshold=settings_record.similarity_threshold,
        use_general_hr_knowledge=settings_record.use_general_hr_knowledge,
        strict_policy_mode=settings_record.strict_policy_mode,
        project_id=settings_record.project_id,
        user_id=settings_record.user_id,
        created_at=settings_record.created_at,
        updated_at=settings_record.updated_at,
    )


# ============================================================================
# Statistics Endpoint
# ============================================================================

@router.get("/stats", response_model=RAGStatsResponse)
async def get_rag_stats(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get RAG system statistics."""
    rag_service = RAGService(db)

    # Get document counts
    all_documents = await rag_service.list_documents(project_id=project_id)
    ready_documents = [d for d in all_documents if d.status == "ready"]
    total_chunks = sum(d.chunk_count for d in ready_documents)

    # Get rule counts
    all_rules = await rag_service.get_custom_rules(
        project_id=project_id,
        include_inactive=True,
    )
    active_rules = [r for r in all_rules if r.is_active]

    # Get vector store stats
    vector_store = get_vector_store()
    collection_stats = vector_store.get_collection_stats()

    return RAGStatsResponse(
        total_documents=len(all_documents),
        ready_documents=len(ready_documents),
        total_chunks=total_chunks,
        total_rules=len(all_rules),
        active_rules=len(active_rules),
        collection_stats=collection_stats,
    )
