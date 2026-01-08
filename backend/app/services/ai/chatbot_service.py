from typing import List, Optional, Dict, Any, Literal, Tuple, Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from openai import AsyncOpenAI, AsyncAzureOpenAI
from ollama import AsyncClient
import httpx
import asyncio

from app.core.config import settings
from app.models.chatbot import Conversation, Message
from app.schemas.chatbot import (
    ChatRequest,
    ChatResponse,
    MessageResponse,
    ConversationResponse,
    ConversationCreate,
    ConversationListResponse
)
from app.services.compliance.pii_masking_service import (
    PIIMaskingService,
    MaskingContext,
    SalaryPercentiles,
    calculate_salary_percentiles_from_db
)

# Provider type for routing
ProviderType = Literal["ollama", "openai", "azure", "qwen", "mistral", "ibm"]

# Cloud providers that require PII masking (data leaves on-premise)
CLOUD_PROVIDERS: set = {"openai", "azure", "qwen", "mistral", "ibm"}

# Local providers where data stays on-premise (no masking needed)
LOCAL_PROVIDERS: set = {"ollama"}

# Model to provider mapping
MODEL_PROVIDER_MAP: Dict[str, ProviderType] = {
    # Local (Ollama)
    "qwen3:4b": "ollama",
    "qwen3:8b": "ollama",
    "llama3": "ollama",
    # OpenAI
    "gpt-5.1": "openai",
    "gpt-4": "openai",
    "gpt-4-turbo": "openai",
    "gpt-3.5-turbo": "openai",
    # Azure OpenAI
    "azure-gpt-5.1": "azure",
    "azure-gpt-4": "azure",
    # Qwen Cloud
    "qwen3-max": "qwen",
    "qwen-turbo": "qwen",
    # Mistral
    "mistral-large-latest": "mistral",
    "mistral-large-3": "mistral",
    # IBM
    "granite-3.0-8b-instruct": "ibm",
}


class ChatbotService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._pii_masking_service = PIIMaskingService()
        self._percentiles_loaded = False

    async def _ensure_salary_percentiles(self) -> None:
        """
        Load salary percentiles from the database if not already loaded.
        Called lazily before masking is needed.
        """
        if self._percentiles_loaded or not settings.PII_MASKING_ENABLED:
            return

        try:
            percentiles = await calculate_salary_percentiles_from_db(self.db)
            if percentiles.employee_count > 0:
                self._pii_masking_service.set_salary_percentiles(percentiles)
                print(f"[PII] Loaded salary percentiles from {percentiles.employee_count} employees: "
                      f"p20=${percentiles.p20:,.0f}, p40=${percentiles.p40:,.0f}, "
                      f"p60=${percentiles.p60:,.0f}, p80=${percentiles.p80:,.0f}", flush=True)
            self._percentiles_loaded = True
        except Exception as e:
            print(f"[PII] Warning: Failed to load salary percentiles: {e}", flush=True)
            self._percentiles_loaded = True  # Don't retry on failure

    def _determine_provider(self, model: str) -> ProviderType:
        """Determine provider based on model name"""
        # Check explicit mapping first
        if model in MODEL_PROVIDER_MAP:
            return MODEL_PROVIDER_MAP[model]

        # Fallback to pattern matching
        if model.startswith("gpt-") or model.startswith("o1-"):
            return "openai"
        elif model.startswith("azure-"):
            return "azure"
        elif model.startswith("qwen") and ":" in model:
            # Local Ollama model (e.g., qwen3:4b)
            return "ollama"
        elif model.startswith("qwen"):
            # Cloud Qwen model (e.g., qwen3-max)
            return "qwen"
        elif model.startswith("mistral"):
            return "mistral"
        elif model.startswith("granite"):
            return "ibm"
        elif "/" in model:
            # Ollama format with namespace
            return "ollama"

        return settings.DEFAULT_LLM_PROVIDER

    async def _call_openai(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """Call OpenAI API with optional function calling support"""
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=settings.LLM_REQUEST_TIMEOUT)

        # Build request kwargs
        request_kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            request_kwargs["max_tokens"] = max_tokens
        if tools:
            request_kwargs["tools"] = tools
            request_kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**request_kwargs)

        message = response.choices[0].message
        content = message.content or ""
        usage = response.usage

        # Extract tool calls if present
        tool_calls = None
        if message.tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                }
                for tc in message.tool_calls
            ]

        return content, {
            "tokens_used": usage.total_tokens if usage else None,
            "prompt_tokens": usage.prompt_tokens if usage else None,
            "completion_tokens": usage.completion_tokens if usage else None
        }, tool_calls

    async def _call_azure(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """Call Azure OpenAI API with optional function calling support"""
        if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
            raise ValueError("AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be configured")

        # Remove azure- prefix for the actual model name
        actual_model = model.replace("azure-", "") if model.startswith("azure-") else settings.AZURE_OPENAI_MODEL

        client = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            timeout=settings.LLM_REQUEST_TIMEOUT
        )

        # Build request kwargs
        request_kwargs = {
            "model": actual_model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            request_kwargs["max_tokens"] = max_tokens
        if tools:
            request_kwargs["tools"] = tools
            request_kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**request_kwargs)

        message = response.choices[0].message
        content = message.content or ""
        usage = response.usage

        # Extract tool calls if present
        tool_calls = None
        if message.tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                }
                for tc in message.tool_calls
            ]

        return content, {
            "tokens_used": usage.total_tokens if usage else None,
            "prompt_tokens": usage.prompt_tokens if usage else None,
            "completion_tokens": usage.completion_tokens if usage else None
        }, tool_calls

    async def _call_qwen(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> tuple[str, Dict[str, Any]]:
        """Call Qwen Cloud API (OpenAI-compatible)"""
        if not settings.QWEN_API_KEY:
            raise ValueError("QWEN_API_KEY not configured")

        client = AsyncOpenAI(
            api_key=settings.QWEN_API_KEY,
            base_url=settings.QWEN_BASE_URL,
            timeout=settings.LLM_REQUEST_TIMEOUT
        )
        response = await client.chat.completions.create(
            model=model or settings.QWEN_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )

        content = response.choices[0].message.content or ""
        usage = response.usage
        return content, {
            "tokens_used": usage.total_tokens if usage else None,
            "prompt_tokens": usage.prompt_tokens if usage else None,
            "completion_tokens": usage.completion_tokens if usage else None
        }

    async def _call_mistral(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> tuple[str, Dict[str, Any]]:
        """Call Mistral API (OpenAI-compatible)"""
        if not settings.MISTRAL_API_KEY:
            raise ValueError("MISTRAL_API_KEY not configured")

        client = AsyncOpenAI(
            api_key=settings.MISTRAL_API_KEY,
            base_url=settings.MISTRAL_BASE_URL,
            timeout=settings.LLM_REQUEST_TIMEOUT
        )
        response = await client.chat.completions.create(
            model=model or settings.MISTRAL_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )

        content = response.choices[0].message.content or ""
        usage = response.usage
        return content, {
            "tokens_used": usage.total_tokens if usage else None,
            "prompt_tokens": usage.prompt_tokens if usage else None,
            "completion_tokens": usage.completion_tokens if usage else None
        }

    async def _call_ibm(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> tuple[str, Dict[str, Any]]:
        """Call IBM Granite API"""
        if not settings.IBM_API_KEY:
            raise ValueError("IBM_API_KEY not configured")

        # Convert messages to IBM format (prompt string)
        prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])

        async with httpx.AsyncClient(timeout=settings.LLM_REQUEST_TIMEOUT) as client:
            response = await client.post(
                settings.IBM_BASE_URL,
                headers={
                    "Authorization": f"Bearer {settings.IBM_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model_id": model or settings.IBM_MODEL,
                    "input": prompt,
                    "parameters": {
                        "temperature": temperature,
                        "max_new_tokens": max_tokens or 1024
                    }
                }
            )
            response.raise_for_status()
            data = response.json()

        content = data.get("results", [{}])[0].get("generated_text", "")
        return content, {
            "tokens_used": data.get("results", [{}])[0].get("generated_token_count"),
            "prompt_tokens": data.get("results", [{}])[0].get("input_token_count"),
            "completion_tokens": data.get("results", [{}])[0].get("generated_token_count")
        }

    async def _call_ollama(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int]
    ) -> tuple[str, Dict[str, Any]]:
        """Call local Ollama API"""
        client = AsyncClient(host=settings.OLLAMA_BASE_URL)
        
        # Wrap Ollama call in timeout to prevent indefinite hanging
        response = await asyncio.wait_for(
            client.chat(
                model=model or settings.OLLAMA_MODEL,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens if max_tokens else -1
                }
            ),
            timeout=settings.LLM_REQUEST_TIMEOUT
        )

        # Handle both dict (older ollama versions) and ChatResponse object (newer versions)
        if isinstance(response, dict):
            message = response.get("message", {})
            content = message.get("content", "") if isinstance(message, dict) else ""
            eval_count = response.get('eval_count', 0)
            prompt_eval_count = response.get('prompt_eval_count', 0)
        else:
            # Newer ollama-python versions return ChatResponse object with attributes
            message = getattr(response, 'message', None)
            if message:
                content = getattr(message, 'content', '') or ''
            else:
                content = ''
            eval_count = getattr(response, 'eval_count', 0) or 0
            prompt_eval_count = getattr(response, 'prompt_eval_count', 0) or 0

        return content, {
            "tokens_used": eval_count + prompt_eval_count,
            "prompt_tokens": prompt_eval_count,
            "completion_tokens": eval_count
        }

    async def generate_response(
        self,
        messages: List[Dict[str, str]],
        model: str = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Generate a response from the LLM without persisting conversation history.
        Useful for one-off generation tasks.
        """
        model = model or settings.OLLAMA_MODEL
        content, _ = await self._get_llm_response(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        return content

    async def _get_llm_response(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        masking_context: Optional[MaskingContext] = None
    ) -> tuple[str, Dict[str, Any]]:
        """
        Get response from LLM provider based on model selection.

        For cloud providers (OpenAI, Azure, Qwen, Mistral, IBM):
        - PII is automatically masked before sending
        - Response is unmasked before returning

        For local providers (Ollama):
        - No masking applied, data stays on-premise

        Args:
            messages: Chat messages to send
            model: Model name
            temperature: Generation temperature
            max_tokens: Max tokens to generate
            masking_context: Optional pre-populated MaskingContext for consistent masking

        Returns:
            (response_content, metadata)
        """
        provider = self._determine_provider(model)

        metadata = {
            "model": model,
            "provider": provider,
            "temperature": temperature,
            "pii_masked": False
        }

        # Apply PII masking for cloud providers
        should_mask = (
            provider in CLOUD_PROVIDERS and
            settings.PII_MASKING_ENABLED
        )

        if should_mask:
            # Ensure salary percentiles are loaded for accurate masking
            await self._ensure_salary_percentiles()
            masking_context = masking_context or MaskingContext()
            masked_messages = self._mask_messages(messages, masking_context)
            metadata["pii_masked"] = True
            metadata["pii_tokens_masked"] = len(masking_context.name_map) + len(masking_context.id_map)
            messages_to_send = masked_messages
            print(f"[LLM] PII masking applied for {provider}: {len(masking_context.name_map)} names, {len(masking_context.id_map)} IDs masked", flush=True)
        else:
            messages_to_send = messages
            if provider in CLOUD_PROVIDERS and not settings.PII_MASKING_ENABLED:
                print(f"[LLM] WARNING: Cloud provider {provider} used without PII masking!", flush=True)

        try:
            if provider == "openai":
                content, usage, _ = await self._call_openai(messages_to_send, model, temperature, max_tokens)
            elif provider == "azure":
                content, usage, _ = await self._call_azure(messages_to_send, model, temperature, max_tokens)
            elif provider == "qwen":
                content, usage = await self._call_qwen(messages_to_send, model, temperature, max_tokens)
            elif provider == "mistral":
                content, usage = await self._call_mistral(messages_to_send, model, temperature, max_tokens)
            elif provider == "ibm":
                content, usage = await self._call_ibm(messages_to_send, model, temperature, max_tokens)
            else:  # ollama (default)
                content, usage = await self._call_ollama(messages_to_send, model, temperature, max_tokens)

            # Unmask response for cloud providers
            if should_mask and masking_context:
                content = self._pii_masking_service.unmask_text(content, masking_context)

            metadata.update(usage)
            return content, metadata

        except asyncio.TimeoutError:
            raise Exception(f"LLM API error ({provider}): Request timed out after {settings.LLM_REQUEST_TIMEOUT}s")
        except Exception as e:
            error_type = type(e).__name__
            raise Exception(f"LLM API error ({provider}): [{error_type}] {str(e)}")

    async def get_response_with_tools(
        self,
        messages: List[Dict[str, Any]],
        model: str,
        tools: List[Dict[str, Any]],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None
    ) -> Tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """
        Get LLM response with function/tool calling support.

        This method is used by the ToolCallingAgent for providers that support
        native function calling (OpenAI, Azure). For other providers, returns
        (content, metadata, None) and the agent handles tool parsing from text.

        Args:
            messages: Chat messages including system prompt
            model: Model name
            tools: Tool definitions in OpenAI format
            temperature: Generation temperature (lower = more deterministic)
            max_tokens: Optional max tokens

        Returns:
            Tuple of (content, metadata, tool_calls)
            - content: Text response (may be empty if tool_calls present)
            - metadata: Token usage and provider info
            - tool_calls: List of tool calls or None
        """
        provider = self._determine_provider(model)

        metadata = {
            "model": model,
            "provider": provider,
            "temperature": temperature,
            "supports_native_tools": provider in {"openai", "azure", "mistral"}
        }

        try:
            if provider == "openai":
                content, usage, tool_calls = await self._call_openai(
                    messages, model, temperature, max_tokens, tools
                )
            elif provider == "azure":
                content, usage, tool_calls = await self._call_azure(
                    messages, model, temperature, max_tokens, tools
                )
            else:
                # Provider doesn't support native tools
                # Agent will handle parsing tool calls from text
                content, usage = await self._get_llm_response(
                    messages, model, temperature, max_tokens
                )
                tool_calls = None
                usage = {"tokens_used": usage.get("tokens_used", 0)}

            metadata.update(usage)
            return content, metadata, tool_calls

        except asyncio.TimeoutError:
            raise Exception(f"LLM API error ({provider}): Request timed out")
        except Exception as e:
            error_type = type(e).__name__
            raise Exception(f"LLM API error ({provider}): [{error_type}] {str(e)}")

    def _mask_messages(
        self,
        messages: List[Dict[str, str]],
        context: MaskingContext
    ) -> List[Dict[str, str]]:
        """Mask PII in all message contents."""
        masked_messages = []
        for msg in messages:
            masked_msg = msg.copy()
            if 'content' in masked_msg and masked_msg['content']:
                masked_msg['content'] = self._pii_masking_service.mask_text(
                    masked_msg['content'],
                    context
                )
            masked_messages.append(masked_msg)
        return masked_messages

    async def create_conversation(self, user_id: int, title: Optional[str] = None) -> Conversation:
        """Create a new conversation"""
        conversation = Conversation(
            user_id=user_id,
            title=title or "New Conversation"
        )
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)
        return conversation

    async def get_conversation(self, conversation_id: int, user_id: int) -> Optional[Conversation]:
        """Get a conversation by ID for a specific user"""
        result = await self.db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    async def list_conversations(self, user_id: int, skip: int = 0, limit: int = 20) -> List[ConversationListResponse]:
        """List all conversations for a user"""
        # Get conversations with message count
        result = await self.db.execute(
            select(
                Conversation,
                func.count(Message.id).label('message_count')
            )
            .outerjoin(Message)
            .where(Conversation.user_id == user_id)
            .group_by(Conversation.id)
            .order_by(Conversation.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )

        conversations = []
        for conv, msg_count in result.all():
            conv_dict = {
                "id": conv.id,
                "user_id": conv.user_id,
                "title": conv.title,
                "is_active": conv.is_active,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
                "message_count": msg_count
            }
            conversations.append(ConversationListResponse(**conv_dict))

        return conversations

    async def add_message(
        self,
        conversation_id: int,
        role: str,
        content: str,
        message_metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Add a message to a conversation"""
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            message_metadata=message_metadata
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def get_conversation_history(
        self,
        conversation_id: int,
        max_messages: Optional[int] = None
    ) -> List[Dict[str, str]]:
        """Get conversation history formatted for LLM"""
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        messages = result.scalars().all()

        # Limit to recent messages if specified
        if max_messages:
            messages = messages[-max_messages:]

        # Format for LLM
        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

    async def chat(self, request: ChatRequest, user_id: int) -> ChatResponse:
        """Process a chat request"""

        # Get or create conversation
        if request.conversation_id:
            conversation = await self.get_conversation(request.conversation_id, user_id)
            if not conversation:
                raise ValueError("Conversation not found")
        else:
            conversation = await self.create_conversation(user_id)

        # Add user message to database
        user_message = await self.add_message(
            conversation_id=conversation.id,
            role="user",
            content=request.message
        )

        # Build message history for LLM
        history = await self.get_conversation_history(
            conversation.id,
            max_messages=settings.CHATBOT_MAX_HISTORY
        )

        # Add system prompt if this is the first message
        if len(history) == 1:
            history.insert(0, {
                "role": "system",
                "content": settings.CHATBOT_SYSTEM_PROMPT
            })

        # Get LLM response
        try:
            ai_content, metadata = await self._get_llm_response(
                messages=history,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
        except Exception as e:
            # If LLM fails, still save the user message but return error
            raise Exception(f"Failed to get AI response: {str(e)}")

        # Save AI response to database
        ai_message = await self.add_message(
            conversation_id=conversation.id,
            role="assistant",
            content=ai_content,
            message_metadata=metadata
        )

        # Update conversation title if it's the first exchange
        if not conversation.title or conversation.title == "New Conversation":
            # Generate a title from the first message
            title = request.message[:50] + ("..." if len(request.message) > 50 else "")
            conversation.title = title
            await self.db.commit()

        return ChatResponse(
            conversation_id=conversation.id,
            message=MessageResponse.from_orm(ai_message),
            user_message=MessageResponse.from_orm(user_message)
        )

    async def delete_conversation(self, conversation_id: int, user_id: int) -> bool:
        """Delete a conversation"""
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False

        await self.db.delete(conversation)
        await self.db.commit()
        return True
