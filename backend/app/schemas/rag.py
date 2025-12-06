"""
RAG Subsystem Pydantic Schemas

Request and response models for the RAG API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

class DocumentType(str, Enum):
    """Document classification types."""
    POLICY = "policy"
    BENEFIT = "benefit"
    RULE = "rule"
    GENERAL = "general"


class DocumentStatus(str, Enum):
    """Document processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class RuleCategory(str, Enum):
    """Custom rule categories."""
    BENEFIT = "benefit"
    RESTRICTION = "restriction"
    POLICY = "policy"
    PROCESS = "process"
    ELIGIBILITY = "eligibility"


class KnowledgeBaseMode(str, Enum):
    """Knowledge base operation modes."""
    AUTOMATIC = "automatic"  # Documents only
    CUSTOM = "custom"        # Rules only
    HYBRID = "hybrid"        # Both documents and rules


# ============================================================================
# Document Schemas
# ============================================================================

class DocumentBase(BaseModel):
    """Base document fields."""
    title: str = Field(..., min_length=1, max_length=500)
    document_type: DocumentType = Field(default=DocumentType.GENERAL)
    tags: Optional[str] = Field(None, max_length=500)


class DocumentUploadResponse(BaseModel):
    """Response after document upload."""
    id: int
    title: str
    source_path: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    status: DocumentStatus
    document_type: str
    chunk_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentSummary(BaseModel):
    """Document summary for listings."""
    id: int
    title: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    document_type: str
    tags: Optional[str] = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentDetail(DocumentSummary):
    """Full document details including chunks."""
    source_path: Optional[str] = None
    project_id: Optional[str] = None
    user_id: Optional[int] = None
    chunks: List[Dict[str, Any]] = []


# ============================================================================
# Custom Rule Schemas
# ============================================================================

class CustomRuleBase(BaseModel):
    """Base custom rule fields."""
    name: str = Field(..., min_length=1, max_length=200)
    category: Optional[RuleCategory] = None
    rule_text: str = Field(..., min_length=1)
    priority: int = Field(default=5, ge=1, le=10)


class CustomRuleCreate(CustomRuleBase):
    """Create custom rule request."""
    project_id: Optional[str] = None


class CustomRuleUpdate(BaseModel):
    """Update custom rule request."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[RuleCategory] = None
    rule_text: Optional[str] = Field(None, min_length=1)
    priority: Optional[int] = Field(None, ge=1, le=10)
    is_active: Optional[bool] = None


class CustomRuleResponse(BaseModel):
    """Custom rule response."""
    id: int
    name: str
    category: Optional[str] = None
    rule_text: str
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    project_id: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Query Schemas
# ============================================================================

class RAGQueryRequest(BaseModel):
    """Request for querying the knowledge base."""
    query: str = Field(..., min_length=1, description="Search query")
    document_types: Optional[List[DocumentType]] = None
    include_rules: bool = Field(default=True)
    top_k: Optional[int] = Field(default=5, ge=1, le=20)
    project_id: Optional[str] = None


class RAGChunkResult(BaseModel):
    """Single chunk result from search."""
    content: str
    source: str
    document_id: Optional[int] = None
    document_type: str
    similarity: float
    metadata: Optional[Dict[str, Any]] = None


class RAGQueryResponse(BaseModel):
    """Response from knowledge base query."""
    documents: List[RAGChunkResult]
    custom_rules: List[CustomRuleResponse]
    sources: List[Dict[str, Any]]
    query: str
    total_chunks: int
    total_rules: int


# ============================================================================
# Knowledge Base Settings Schemas
# ============================================================================

class KnowledgeBaseSettingsBase(BaseModel):
    """Base KB settings fields."""
    mode: KnowledgeBaseMode = Field(default=KnowledgeBaseMode.AUTOMATIC)
    chunk_size: int = Field(default=500, ge=100, le=2000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)
    retrieval_top_k: int = Field(default=5, ge=1, le=20)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    use_general_hr_knowledge: bool = Field(default=True)
    strict_policy_mode: bool = Field(default=False)


class KnowledgeBaseSettingsUpdate(BaseModel):
    """Update KB settings request."""
    mode: Optional[KnowledgeBaseMode] = None
    chunk_size: Optional[int] = Field(None, ge=100, le=2000)
    chunk_overlap: Optional[int] = Field(None, ge=0, le=500)
    retrieval_top_k: Optional[int] = Field(None, ge=1, le=20)
    similarity_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    use_general_hr_knowledge: Optional[bool] = None
    strict_policy_mode: Optional[bool] = None


class KnowledgeBaseSettingsResponse(KnowledgeBaseSettingsBase):
    """KB settings response."""
    id: int
    project_id: Optional[str] = None
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# Treatment Validation Schemas
# ============================================================================

class TreatmentValidationRequest(BaseModel):
    """Request to validate a treatment against policies."""
    treatment: Dict[str, Any] = Field(..., description="Treatment to validate")
    project_id: Optional[str] = None


class TreatmentViolation(BaseModel):
    """Policy violation details."""
    rule: Optional[str] = None
    source: Optional[str] = None
    reason: str


class TreatmentAdaptation(BaseModel):
    """Treatment adaptation details."""
    field: Optional[str] = None
    original: Optional[Any] = None
    adapted: Optional[Any] = None
    note: Optional[str] = None
    reason: Optional[str] = None


class TreatmentValidationResponse(BaseModel):
    """Treatment validation result."""
    is_valid: bool
    treatment_name: str
    violations: List[TreatmentViolation]
    adaptations: List[TreatmentAdaptation]
    reasoning: str
    adapted_treatment: Optional[Dict[str, Any]] = None


# ============================================================================
# Statistics Schemas
# ============================================================================

class RAGStatsResponse(BaseModel):
    """RAG system statistics."""
    total_documents: int
    ready_documents: int
    total_chunks: int
    total_rules: int
    active_rules: int
    collection_stats: Dict[str, Any]
