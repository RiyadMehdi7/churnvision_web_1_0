"""
RAG Service

Main orchestration service for the Retrieval-Augmented Generation subsystem.
Handles document ingestion, context retrieval, custom rules, and treatment validation.
"""

import os
import json
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.rag import RAGDocument, RAGChunk, CustomHRRule, KnowledgeBaseSettings
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import get_vector_store, VectorStoreService

logger = logging.getLogger(__name__)


class RAGService:
    """
    Main RAG orchestration service.

    Provides:
    - Document ingestion pipeline (upload → extract → chunk → embed → store)
    - Semantic retrieval with custom rules
    - Treatment validation against company policies
    - Knowledge base settings management
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize RAG service.

        Args:
            db: Async database session
        """
        self.db = db
        self.document_processor = DocumentProcessor()
        self.vector_store = get_vector_store()
        self._ensure_upload_path()

    def _ensure_upload_path(self):
        """Ensure the document upload directory exists."""
        upload_path = Path(settings.RAG_UPLOAD_PATH)
        upload_path.mkdir(parents=True, exist_ok=True)

    async def ingest_document(
        self,
        file_path: str,
        title: str,
        mime_type: str = None,
        document_type: str = "general",
        tags: str = None,
        project_id: str = None,
        user_id: int = None,
    ) -> RAGDocument:
        """
        Full document ingestion pipeline.

        1. Create document record
        2. Extract and chunk text
        3. Generate embeddings and store in ChromaDB
        4. Update document status

        Args:
            file_path: Path to the document file
            title: Document title
            mime_type: MIME type (auto-detected if not provided)
            document_type: Type classification (policy, benefit, rule, general)
            tags: Comma-separated tags
            project_id: Project ID for multi-tenancy
            user_id: User ID who uploaded

        Returns:
            The created RAGDocument record
        """
        # Auto-detect MIME type if needed
        if not mime_type:
            mime_type = self.document_processor.get_mime_type(file_path)

        # Get file size
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        # Create document record
        document = RAGDocument(
            title=title,
            source_path=file_path,
            mime_type=mime_type,
            size_bytes=file_size,
            status="processing",
            document_type=document_type,
            tags=tags,
            project_id=project_id,
            user_id=user_id,
        )
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)

        try:
            # Process document (extract and chunk)
            chunks = await self.document_processor.process_document(
                file_path=file_path,
                mime_type=mime_type,
            )

            if not chunks:
                document.status = "error"
                document.error_message = "No text could be extracted from the document"
                await self.db.commit()
                return document

            # Store chunks in database
            chroma_ids = self.vector_store.add_chunks(
                chunks=chunks,
                document_id=document.id,
                document_title=title,
                document_type=document_type,
                project_id=project_id,
            )

            # Save chunk records to database
            for i, chunk in enumerate(chunks):
                chunk_record = RAGChunk(
                    document_id=document.id,
                    chunk_index=chunk.get("chunk_index", i),
                    content=chunk["content"],
                    chunk_metadata=chunk.get("metadata"),
                    chroma_id=chroma_ids[i] if i < len(chroma_ids) else None,
                )
                self.db.add(chunk_record)

            # Update document status
            document.status = "ready"
            document.chunk_count = len(chunks)
            document.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(document)

            logger.info(f"Successfully ingested document: {title} ({len(chunks)} chunks)")
            return document

        except Exception as e:
            logger.error(f"Error ingesting document {title}: {e}")
            document.status = "error"
            document.error_message = str(e)[:500]
            await self.db.commit()
            raise

    async def retrieve_context(
        self,
        query: str,
        project_id: str = None,
        include_custom_rules: bool = True,
        document_types: List[str] = None,
        top_k: int = None,
    ) -> Dict[str, Any]:
        """
        Retrieve relevant context for a query.

        Combines:
        1. Semantic search results from documents
        2. Active custom HR rules

        Args:
            query: User query or context description
            project_id: Filter by project
            include_custom_rules: Whether to include custom rules
            document_types: Filter by document types
            top_k: Number of chunks to retrieve

        Returns:
            Dictionary with documents, custom_rules, and sources
        """
        # Semantic search in vector store
        search_results = self.vector_store.search(
            query=query,
            top_k=top_k or settings.RAG_TOP_K,
            project_id=project_id,
            document_types=document_types,
        )

        # Fetch custom rules if enabled
        custom_rules = []
        if include_custom_rules:
            custom_rules = await self.get_custom_rules(project_id=project_id)

        # Compile sources for citation
        sources = []
        seen_sources = set()
        for result in search_results:
            source_name = result.get("source", "Unknown")
            if source_name not in seen_sources:
                sources.append({
                    "name": source_name,
                    "document_id": result.get("document_id"),
                    "document_type": result.get("document_type"),
                })
                seen_sources.add(source_name)

        return {
            "documents": search_results,
            "custom_rules": [
                {
                    "id": rule.id,
                    "name": rule.name,
                    "category": rule.category,
                    "rule_text": rule.rule_text,
                    "priority": rule.priority,
                }
                for rule in custom_rules
            ],
            "sources": sources,
            "query": query,
            "total_chunks": len(search_results),
            "total_rules": len(custom_rules),
        }

    async def get_custom_rules(
        self,
        category: str = None,
        project_id: str = None,
        include_inactive: bool = False,
    ) -> List[CustomHRRule]:
        """
        Fetch active custom HR rules.

        Args:
            category: Filter by category
            project_id: Filter by project
            include_inactive: Include inactive rules

        Returns:
            List of CustomHRRule records
        """
        query = select(CustomHRRule)

        if not include_inactive:
            query = query.where(CustomHRRule.is_active == True)

        if category:
            query = query.where(CustomHRRule.category == category)

        if project_id:
            query = query.where(CustomHRRule.project_id == project_id)

        query = query.order_by(CustomHRRule.priority.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_custom_rule(
        self,
        name: str,
        rule_text: str,
        category: str = None,
        priority: int = 5,
        project_id: str = None,
        user_id: int = None,
    ) -> CustomHRRule:
        """
        Create a new custom HR rule.

        Args:
            name: Rule name/title
            rule_text: The rule content
            category: Rule category
            priority: Priority level (1-10)
            project_id: Project ID
            user_id: User ID

        Returns:
            Created CustomHRRule record
        """
        rule = CustomHRRule(
            name=name,
            rule_text=rule_text,
            category=category,
            priority=min(max(priority, 1), 10),  # Clamp to 1-10
            project_id=project_id,
            user_id=user_id,
            is_active=True,
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update_custom_rule(
        self,
        rule_id: int,
        updates: Dict[str, Any],
    ) -> Optional[CustomHRRule]:
        """
        Update an existing custom rule.

        Args:
            rule_id: Rule ID to update
            updates: Dictionary of field updates

        Returns:
            Updated rule or None if not found
        """
        query = select(CustomHRRule).where(CustomHRRule.id == rule_id)
        result = await self.db.execute(query)
        rule = result.scalar_one_or_none()

        if not rule:
            return None

        # Apply updates
        allowed_fields = ["name", "rule_text", "category", "priority", "is_active"]
        for field, value in updates.items():
            if field in allowed_fields:
                setattr(rule, field, value)

        rule.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def delete_custom_rule(self, rule_id: int) -> bool:
        """
        Delete a custom rule.

        Args:
            rule_id: Rule ID to delete

        Returns:
            True if deleted, False if not found
        """
        query = delete(CustomHRRule).where(CustomHRRule.id == rule_id)
        result = await self.db.execute(query)
        await self.db.commit()
        return result.rowcount > 0

    async def validate_treatment(
        self,
        treatment: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Validate a treatment against company policies and rules.

        Checks:
        - Treatment type allowed by policies
        - Cost within company limits
        - Eligibility requirements met
        - No restricted actions

        Args:
            treatment: Treatment dictionary with name, type, cost, etc.
            context: RAG context with documents and rules

        Returns:
            Validation result with is_valid, violations, adaptations
        """
        violations = []
        adaptations = []
        is_valid = True

        treatment_name = treatment.get("name", "")
        treatment_type = treatment.get("type", "")
        treatment_cost = treatment.get("estimated_cost", 0)

        # Check against custom rules
        for rule in context.get("custom_rules", []):
            rule_text_lower = rule["rule_text"].lower()
            rule_category = rule.get("category", "").lower()

            # Check for restrictions
            if rule_category == "restriction":
                # Check if treatment is restricted
                if any(keyword in rule_text_lower for keyword in [
                    treatment_type.lower(),
                    treatment_name.lower()
                ]):
                    violations.append({
                        "rule": rule["name"],
                        "reason": f"Treatment may violate: {rule['rule_text'][:100]}",
                    })
                    is_valid = False

            # Check cost limits
            elif rule_category == "benefit":
                # Look for cost limits in rules
                import re
                cost_match = re.search(r'\$[\d,]+|\d+\s*(?:usd|dollars)', rule_text_lower)
                if cost_match and treatment_cost > 0:
                    # Parse the cost limit
                    limit_str = cost_match.group().replace('$', '').replace(',', '')
                    limit_str = re.sub(r'[^\d]', '', limit_str)
                    if limit_str:
                        limit = int(limit_str)
                        if treatment_cost > limit:
                            adaptations.append({
                                "field": "estimated_cost",
                                "original": treatment_cost,
                                "adapted": limit,
                                "reason": f"Cost adjusted to company limit: {rule['name']}",
                            })

        # Check against document context
        for doc in context.get("documents", []):
            content_lower = doc.get("content", "").lower()

            # Look for approval requirements
            if any(term in content_lower for term in ["requires approval", "manager approval", "hr approval"]):
                if treatment_cost > 5000:  # High-cost treatments
                    adaptations.append({
                        "note": "May require additional approval",
                        "source": doc.get("source"),
                    })

            # Look for prohibited items
            if "prohibited" in content_lower or "not allowed" in content_lower:
                # Check if treatment might be prohibited
                if treatment_name.lower() in content_lower:
                    violations.append({
                        "source": doc.get("source"),
                        "reason": "Treatment may be prohibited according to company policy",
                    })
                    is_valid = False

        # Build result
        result = {
            "is_valid": is_valid,
            "treatment_name": treatment_name,
            "violations": violations,
            "adaptations": adaptations,
            "reasoning": self._build_validation_reasoning(violations, adaptations),
        }

        # Create adapted treatment if there are adaptations
        if adaptations and is_valid:
            adapted = treatment.copy()
            for adaptation in adaptations:
                if "field" in adaptation:
                    adapted[adaptation["field"]] = adaptation["adapted"]
            result["adapted_treatment"] = adapted

        return result

    def _build_validation_reasoning(
        self,
        violations: List[Dict],
        adaptations: List[Dict],
    ) -> str:
        """Build human-readable reasoning for validation result."""
        parts = []

        if violations:
            parts.append("Policy violations detected:")
            for v in violations:
                parts.append(f"  - {v.get('reason', v.get('rule', 'Unknown'))}")

        if adaptations:
            parts.append("Adaptations made for compliance:")
            for a in adaptations:
                if "note" in a:
                    parts.append(f"  - {a['note']}")
                elif "reason" in a:
                    parts.append(f"  - {a['reason']}")

        if not parts:
            parts.append("Treatment complies with all known company policies.")

        return "\n".join(parts)

    async def get_document(self, document_id: int) -> Optional[RAGDocument]:
        """Get a document by ID."""
        query = select(RAGDocument).where(RAGDocument.id == document_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_documents(
        self,
        project_id: str = None,
        document_type: str = None,
        status: str = None,
        user_id: int = None,
    ) -> List[RAGDocument]:
        """
        List documents with optional filters.

        Args:
            project_id: Filter by project
            document_type: Filter by type
            status: Filter by status
            user_id: Filter by uploader

        Returns:
            List of RAGDocument records
        """
        query = select(RAGDocument)

        if project_id:
            query = query.where(RAGDocument.project_id == project_id)
        if document_type:
            query = query.where(RAGDocument.document_type == document_type)
        if status:
            query = query.where(RAGDocument.status == status)
        if user_id:
            query = query.where(RAGDocument.user_id == user_id)

        query = query.order_by(RAGDocument.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def delete_document(self, document_id: int) -> bool:
        """
        Delete a document and its chunks.

        Args:
            document_id: Document ID to delete

        Returns:
            True if deleted, False if not found
        """
        # Get document
        document = await self.get_document(document_id)
        if not document:
            return False

        # Remove from vector store
        self.vector_store.delete_document(document_id)

        # Delete from database (cascades to chunks)
        await self.db.delete(document)
        await self.db.commit()

        # Clean up source file if it exists
        if document.source_path and os.path.exists(document.source_path):
            try:
                os.remove(document.source_path)
            except Exception as e:
                logger.warning(f"Failed to delete source file: {e}")

        logger.info(f"Deleted document: {document.title}")
        return True

    async def get_settings(
        self,
        project_id: str = None,
        user_id: int = None,
    ) -> KnowledgeBaseSettings:
        """
        Get knowledge base settings, creating defaults if needed.

        Args:
            project_id: Project ID
            user_id: User ID

        Returns:
            KnowledgeBaseSettings record
        """
        query = select(KnowledgeBaseSettings)

        if project_id:
            query = query.where(KnowledgeBaseSettings.project_id == project_id)
        elif user_id:
            query = query.where(KnowledgeBaseSettings.user_id == user_id)
        else:
            query = query.where(
                KnowledgeBaseSettings.project_id.is_(None),
                KnowledgeBaseSettings.user_id.is_(None),
            )

        result = await self.db.execute(query)
        settings_record = result.scalar_one_or_none()

        if not settings_record:
            # Create default settings
            settings_record = KnowledgeBaseSettings(
                mode="automatic",
                chunk_size=settings.RAG_CHUNK_SIZE,
                chunk_overlap=settings.RAG_CHUNK_OVERLAP,
                retrieval_top_k=settings.RAG_TOP_K,
                similarity_threshold=settings.RAG_SIMILARITY_THRESHOLD,
                use_general_hr_knowledge=True,
                strict_policy_mode=False,
                project_id=project_id,
                user_id=user_id,
            )
            self.db.add(settings_record)
            await self.db.commit()
            await self.db.refresh(settings_record)

        return settings_record

    async def update_settings(
        self,
        updates: Dict[str, Any],
        project_id: str = None,
        user_id: int = None,
    ) -> KnowledgeBaseSettings:
        """
        Update knowledge base settings.

        Args:
            updates: Dictionary of field updates
            project_id: Project ID
            user_id: User ID

        Returns:
            Updated settings record
        """
        settings_record = await self.get_settings(project_id, user_id)

        allowed_fields = [
            "mode", "chunk_size", "chunk_overlap", "retrieval_top_k",
            "similarity_threshold", "use_general_hr_knowledge", "strict_policy_mode"
        ]

        for field, value in updates.items():
            if field in allowed_fields:
                setattr(settings_record, field, value)

        settings_record.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(settings_record)

        return settings_record

    def format_context_for_prompt(self, context: Dict[str, Any]) -> str:
        """
        Format RAG context for inclusion in LLM prompts.

        Args:
            context: RAG context from retrieve_context()

        Returns:
            Formatted string for LLM prompt
        """
        parts = []

        # Add document excerpts
        if context.get("documents"):
            parts.append("COMPANY DOCUMENTATION:")
            parts.append("=" * 40)
            for i, doc in enumerate(context["documents"][:5], 1):
                parts.append(f"\n[{i}] Source: {doc.get('source', 'Unknown')}")
                parts.append(f"Type: {doc.get('document_type', 'general')}")
                parts.append(f"Relevance: {doc.get('similarity', 0):.0%}")
                parts.append(f"\n{doc.get('content', '')}\n")

        # Add custom rules
        if context.get("custom_rules"):
            parts.append("\nCUSTOM HR RULES (MANDATORY):")
            parts.append("=" * 40)
            for rule in context["custom_rules"]:
                parts.append(f"\n[{rule.get('category', 'general').upper()}] {rule.get('name')}")
                parts.append(f"Priority: {rule.get('priority', 5)}/10")
                parts.append(f"{rule.get('rule_text')}\n")

        if not parts:
            return "No company-specific context available."

        return "\n".join(parts)
