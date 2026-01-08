# AI Services Package
# Chatbot, RAG, LLM, and AI-powered generation services

from app.services.ai.chatbot_service import ChatbotService
from app.services.ai.intelligent_chatbot import IntelligentChatbotService, PatternType
from app.services.ai.llm_config import (
    resolve_llm_provider_and_model,
    get_model_from_alias,
    is_reasoning_model,
    get_available_providers,
    get_available_models,
)
from app.services.ai.rag_service import RAGService
from app.services.ai.vector_store_service import get_vector_store, VectorStoreService
from app.services.ai.document_processor_service import DocumentProcessor
from app.services.ai.base_generation_service import BaseAIGenerationService
from app.services.ai.treatment_generation_service import TreatmentGenerationService
from app.services.ai.action_generation_service import ActionGenerationService

__all__ = [
    # Chatbot
    "ChatbotService",
    "IntelligentChatbotService",
    "PatternType",
    # LLM Config
    "resolve_llm_provider_and_model",
    "get_model_from_alias",
    "is_reasoning_model",
    "get_available_providers",
    "get_available_models",
    # RAG
    "RAGService",
    "get_vector_store",
    "VectorStoreService",
    "DocumentProcessor",
    # Generation (Base + Concrete)
    "BaseAIGenerationService",
    "TreatmentGenerationService",
    "ActionGenerationService",
]
