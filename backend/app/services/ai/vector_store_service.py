"""
Vector Store Service

Manages ChromaDB for document embeddings and semantic search.
Uses sentence-transformers for local embedding generation.
"""

import os
import uuid
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class VectorStoreService:
    """
    Manages ChromaDB for document embeddings and semantic search.

    Features:
    - Local embedding generation using sentence-transformers
    - Persistent storage for offline operation
    - Project-based collection isolation
    - Metadata filtering for document type and project
    """

    _instance: Optional["VectorStoreService"] = None
    _initialized: bool = False

    def __new__(cls):
        """Singleton pattern for shared ChromaDB client."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the vector store service."""
        if VectorStoreService._initialized:
            return

        self._ensure_storage_path()
        self._init_chromadb()
        VectorStoreService._initialized = True

    @classmethod
    def reset_instance(cls):
        """Reset the singleton instance. Useful for recovery from errors."""
        cls._instance = None
        cls._initialized = False

    def _ensure_storage_path(self):
        """Ensure the ChromaDB storage directory exists."""
        storage_path = Path(settings.RAG_STORAGE_PATH)
        storage_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"ChromaDB storage path: {storage_path}")

    def _init_chromadb(self):
        """Initialize ChromaDB client and collection."""
        try:
            import chromadb
            from chromadb.utils import embedding_functions
        except ImportError:
            raise ImportError(
                "chromadb is required. Install with: pip install chromadb"
            )

        # Create persistent client with automatic recovery from corruption
        storage_path = Path(settings.RAG_STORAGE_PATH)
        try:
            self.client = chromadb.PersistentClient(
                path=str(storage_path)
            )
        except ValueError as e:
            if "Could not connect to tenant" in str(e):
                logger.warning(
                    f"ChromaDB tenant error detected. Resetting storage at {storage_path}"
                )
                # Remove corrupted ChromaDB files and reinitialize
                import shutil
                if storage_path.exists():
                    shutil.rmtree(storage_path)
                storage_path.mkdir(parents=True, exist_ok=True)
                self.client = chromadb.PersistentClient(
                    path=str(storage_path)
                )
                logger.info("ChromaDB storage reset successfully")
            else:
                raise

        # Use sentence-transformers for embeddings
        try:
            self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=settings.RAG_EMBEDDING_MODEL
            )
            logger.info(f"Initialized embedding model: {settings.RAG_EMBEDDING_MODEL}")
        except Exception as e:
            logger.error(f"Failed to initialize embedding model: {e}")
            raise

        # Get or create the main collection
        self.collection = self.client.get_or_create_collection(
            name=settings.RAG_COLLECTION_NAME,
            embedding_function=self.embedding_function,
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity
        )

        logger.info(
            f"ChromaDB collection '{settings.RAG_COLLECTION_NAME}' initialized with "
            f"{self.collection.count()} documents"
        )

    def add_chunks(
        self,
        chunks: List[Dict[str, Any]],
        document_id: int,
        document_title: str,
        document_type: str = "general",
        project_id: Optional[str] = None,
    ) -> List[str]:
        """
        Add document chunks to the vector store.

        Args:
            chunks: List of chunk dictionaries with 'content' and 'metadata'
            document_id: Database ID of the parent document
            document_title: Title of the source document
            document_type: Type of document (policy, benefit, rule, general)
            project_id: Project ID for multi-tenancy filtering

        Returns:
            List of ChromaDB IDs for the added chunks
        """
        if not chunks:
            return []

        ids = []
        documents = []
        metadatas = []

        for chunk in chunks:
            # Generate unique ID for ChromaDB
            chroma_id = f"doc_{document_id}_chunk_{chunk.get('chunk_index', 0)}_{uuid.uuid4().hex[:8]}"
            ids.append(chroma_id)

            # Document content
            documents.append(chunk["content"])

            # Metadata for filtering
            metadata = {
                "document_id": document_id,
                "document_title": document_title,
                "document_type": document_type,
                "chunk_index": chunk.get("chunk_index", 0),
            }
            if project_id:
                metadata["project_id"] = project_id

            # Include any additional metadata from the chunk
            if chunk.get("metadata"):
                import json
                try:
                    chunk_meta = json.loads(chunk["metadata"]) if isinstance(chunk["metadata"], str) else chunk["metadata"]
                    # Only include simple types that ChromaDB supports
                    for key, value in chunk_meta.items():
                        if isinstance(value, (str, int, float, bool)):
                            metadata[f"source_{key}"] = value
                except (json.JSONDecodeError, TypeError, KeyError) as e:
                    logger.debug(f"Could not parse chunk metadata: {e}")
                except Exception as e:
                    logger.warning(f"Unexpected error parsing chunk metadata: {type(e).__name__}: {e}")

            metadatas.append(metadata)

        # Add to ChromaDB
        try:
            self.collection.add(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
            )
            logger.info(f"Added {len(ids)} chunks for document {document_id}")
        except Exception as e:
            logger.error(f"Failed to add chunks to ChromaDB: {e}")
            raise

        return ids

    def search(
        self,
        query: str,
        top_k: int = None,
        project_id: Optional[str] = None,
        document_types: Optional[List[str]] = None,
        document_ids: Optional[List[int]] = None,
        min_similarity: float = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search for relevant chunks.

        Args:
            query: Search query text
            top_k: Number of results to return (default from settings)
            project_id: Filter by project ID
            document_types: Filter by document types
            document_ids: Filter by specific document IDs
            min_similarity: Minimum similarity score (default from settings)

        Returns:
            List of result dictionaries with content, metadata, and similarity score
        """
        top_k = top_k or settings.RAG_TOP_K
        min_similarity = min_similarity or settings.RAG_SIMILARITY_THRESHOLD

        # Build where clause for filtering
        where_clause = None
        conditions = []

        if project_id:
            conditions.append({"project_id": {"$eq": project_id}})

        if document_types:
            conditions.append({"document_type": {"$in": document_types}})

        if document_ids:
            conditions.append({"document_id": {"$in": document_ids}})

        if conditions:
            if len(conditions) == 1:
                where_clause = conditions[0]
            else:
                where_clause = {"$and": conditions}

        # Perform search
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=top_k,
                where=where_clause,
                include=["documents", "metadatas", "distances"]
            )
        except Exception as e:
            logger.error(f"ChromaDB query failed: {e}")
            return []

        # Process results
        processed_results = []

        if results and results["ids"] and results["ids"][0]:
            for i, (doc_id, document, metadata, distance) in enumerate(zip(
                results["ids"][0],
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            )):
                # Convert distance to similarity (cosine distance = 1 - similarity)
                similarity = 1 - distance

                # Filter by minimum similarity
                if similarity < min_similarity:
                    continue

                processed_results.append({
                    "chroma_id": doc_id,
                    "content": document,
                    "metadata": metadata,
                    "similarity": round(similarity, 4),
                    "source": metadata.get("document_title", "Unknown"),
                    "document_id": metadata.get("document_id"),
                    "document_type": metadata.get("document_type", "general"),
                })

        logger.info(f"Search returned {len(processed_results)} results for query: '{query[:50]}...'")
        return processed_results

    def delete_document(self, document_id: int) -> int:
        """
        Remove all chunks for a document from the vector store.

        Args:
            document_id: Database ID of the document to delete

        Returns:
            Number of chunks deleted
        """
        try:
            # Find all chunks for this document
            results = self.collection.get(
                where={"document_id": {"$eq": document_id}},
                include=["metadatas"]
            )

            if results and results["ids"]:
                chunk_count = len(results["ids"])
                self.collection.delete(ids=results["ids"])
                logger.info(f"Deleted {chunk_count} chunks for document {document_id}")
                return chunk_count

            return 0

        except Exception as e:
            logger.error(f"Failed to delete document chunks: {e}")
            raise

    def delete_by_project(self, project_id: str) -> int:
        """
        Remove all chunks for a project.

        Args:
            project_id: Project ID to delete

        Returns:
            Number of chunks deleted
        """
        try:
            results = self.collection.get(
                where={"project_id": {"$eq": project_id}},
                include=["metadatas"]
            )

            if results and results["ids"]:
                chunk_count = len(results["ids"])
                self.collection.delete(ids=results["ids"])
                logger.info(f"Deleted {chunk_count} chunks for project {project_id}")
                return chunk_count

            return 0

        except Exception as e:
            logger.error(f"Failed to delete project chunks: {e}")
            raise

    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the vector store collection.

        Returns:
            Dictionary with collection statistics
        """
        return {
            "collection_name": settings.RAG_COLLECTION_NAME,
            "total_chunks": self.collection.count(),
            "embedding_model": settings.RAG_EMBEDDING_MODEL,
            "storage_path": settings.RAG_STORAGE_PATH,
        }

    def update_chunk_metadata(self, chroma_id: str, metadata: Dict[str, Any]):
        """
        Update metadata for a specific chunk.

        Args:
            chroma_id: ChromaDB ID of the chunk
            metadata: New metadata to set
        """
        try:
            self.collection.update(
                ids=[chroma_id],
                metadatas=[metadata]
            )
        except Exception as e:
            logger.error(f"Failed to update chunk metadata: {e}")
            raise


# Singleton accessor
def get_vector_store() -> VectorStoreService:
    """Get the shared VectorStoreService instance.

    Handles initialization errors gracefully by resetting and retrying once.
    """
    try:
        return VectorStoreService()
    except Exception as e:
        logger.warning(f"VectorStoreService initialization failed: {e}. Resetting and retrying...")
        VectorStoreService.reset_instance()
        return VectorStoreService()
