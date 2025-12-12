"""
RAG (Retrieval-Augmented Generation) Models

Models for document storage, chunking, custom HR rules, and knowledge base settings.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base_class import Base


class RAGDocument(Base):
    """
    Stores uploaded company documents for RAG retrieval.

    Documents are processed into chunks for semantic search.
    """
    __tablename__ = "rag_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500), nullable=False)
    source_path = Column(String(1000), nullable=True)
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)

    # Processing status
    status = Column(String(50), default="pending")  # pending, processing, ready, error
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Multi-tenancy (no FK - different user table used in auth)
    user_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)

    # Document classification
    document_type = Column(String(50), default="general")  # policy, benefit, rule, general
    tags = Column(String(500), nullable=True)  # Comma-separated tags

    # Relationships
    chunks = relationship("RAGChunk", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<RAGDocument(id={self.id}, title='{self.title}', status='{self.status}')>"


class RAGChunk(Base):
    """
    Stores individual chunks of documents for semantic retrieval.

    Each chunk has a corresponding entry in ChromaDB for vector search.
    """
    __tablename__ = "rag_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)

    # Chunk metadata (JSON string: page_number, section, headers, etc.)
    chunk_metadata = Column(Text, nullable=True)

    # Reference to ChromaDB
    chroma_id = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    document = relationship("RAGDocument", back_populates="chunks")

    def __repr__(self):
        return f"<RAGChunk(id={self.id}, doc_id={self.document_id}, index={self.chunk_index})>"


class CustomHRRule(Base):
    """
    User-defined HR rules that override or complement document-based knowledge.

    These rules are explicitly defined by users and take precedence
    over general knowledge and sometimes document content.
    """
    __tablename__ = "custom_hr_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    category = Column(String(50), nullable=True)  # benefit, restriction, policy, process, eligibility
    rule_text = Column(Text, nullable=False)

    # Priority: 1-10, higher = more important (overrides lower priority)
    priority = Column(Integer, default=5)
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Multi-tenancy (no FK - different user table used in auth)
    user_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)

    def __repr__(self):
        return f"<CustomHRRule(id={self.id}, name='{self.name}', category='{self.category}')>"


class KnowledgeBaseSettings(Base):
    """
    Per-user/project RAG configuration settings.

    Controls how document retrieval and rule application work.
    Also stores company context for AI personalization.
    """
    __tablename__ = "knowledge_base_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Company context (for AI personalization)
    company_name = Column(String(200), nullable=True)
    industry = Column(String(100), nullable=True)  # tech, finance, healthcare, retail, manufacturing, other
    company_size = Column(String(50), nullable=True)  # small (<50), medium (50-200), large (200-1000), enterprise (1000+)
    company_description = Column(Text, nullable=True)  # Brief context about the company

    # Mode: automatic (documents only), custom (rules only), hybrid (both)
    mode = Column(String(20), default="automatic")

    # Chunking settings
    chunk_size = Column(Integer, default=500)
    chunk_overlap = Column(Integer, default=50)

    # Retrieval settings
    retrieval_top_k = Column(Integer, default=5)
    similarity_threshold = Column(Float, default=0.7)

    # Behavior settings
    use_general_hr_knowledge = Column(Boolean, default=True)
    strict_policy_mode = Column(Boolean, default=False)  # Only allow documented policies

    # Multi-tenancy (no FK - different user table used in auth)
    user_id = Column(String(100), nullable=True)
    project_id = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<KnowledgeBaseSettings(id={self.id}, mode='{self.mode}')>"
