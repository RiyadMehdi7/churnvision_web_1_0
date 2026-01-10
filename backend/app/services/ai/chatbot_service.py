from typing import List, Optional, Dict, Any, Literal, Tuple, Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from google import genai
from google.genai import types as genai_types
from ollama import AsyncClient
import asyncio
import json

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
from app.services.ai.llm_config import get_provider_api_key

# Provider type for routing
ProviderType = Literal["ollama", "openai", "anthropic", "google"]

# Cloud providers that require PII masking (data leaves on-premise)
CLOUD_PROVIDERS: set = {"openai", "anthropic", "google"}

# Local providers where data stays on-premise (no masking needed)
LOCAL_PROVIDERS: set = {"ollama"}

# Model to provider mapping - one model per provider
MODEL_PROVIDER_MAP: Dict[str, ProviderType] = {
    # Local (Ollama) - on-premise, data stays local
    "gemma3:4b": "ollama",
    # OpenAI - most capable general-purpose model
    "gpt-5-mini-2025-08-07": "openai",
    # Anthropic Claude - fast and cost-effective for enterprise
    "claude-haiku-4-5-20251015": "anthropic",
    # Google Gemini - multimodal with strong reasoning
    "gemini-3-flash": "google",
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
        if model.startswith("gpt-"):
            return "openai"
        elif model.startswith("claude"):
            return "anthropic"
        elif model.startswith("gemini"):
            return "google"

        # Default to local Ollama
        return "ollama"

    async def _call_openai(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """Call OpenAI API with optional function calling support"""
        api_key = get_provider_api_key("openai")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not configured")

        client = AsyncOpenAI(api_key=api_key, timeout=settings.LLM_REQUEST_TIMEOUT)

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

    async def _call_claude(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """
        Call Claude (Anthropic) API with native tool calling support.

        Anthropic uses a different message format than OpenAI:
        - System message is a separate parameter, not in messages array
        - Tool definitions use a slightly different schema
        """
        api_key = get_provider_api_key("anthropic")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        client = AsyncAnthropic(
            api_key=api_key,
            timeout=settings.LLM_REQUEST_TIMEOUT
        )

        # Anthropic requires system message as separate parameter
        system_content = None
        filtered_messages = []
        for msg in messages:
            if msg.get("role") == "system":
                system_content = msg.get("content", "")
            else:
                filtered_messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })

        # Build request kwargs
        request_kwargs = {
            "model": model or settings.CLAUDE_MODEL,
            "max_tokens": max_tokens or 1024,
            "messages": filtered_messages,
        }

        # Add temperature (Claude uses 0-1 range like OpenAI)
        if temperature is not None:
            request_kwargs["temperature"] = temperature

        if system_content:
            request_kwargs["system"] = system_content

        # Convert OpenAI tool format to Anthropic format if tools provided
        if tools:
            anthropic_tools = self._convert_tools_to_anthropic_format(tools)
            request_kwargs["tools"] = anthropic_tools

        response = await client.messages.create(**request_kwargs)

        # Extract content
        content = ""
        tool_calls = None

        for block in response.content:
            if block.type == "text":
                content = block.text
            elif block.type == "tool_use":
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append({
                    "id": block.id,
                    "type": "function",
                    "function": {
                        "name": block.name,
                        "arguments": json.dumps(block.input)
                        if isinstance(block.input, dict) else block.input
                    }
                })

        # Extract usage
        usage = response.usage
        metadata = {
            "tokens_used": (usage.input_tokens + usage.output_tokens) if usage else None,
            "prompt_tokens": usage.input_tokens if usage else None,
            "completion_tokens": usage.output_tokens if usage else None
        }

        return content, metadata, tool_calls

    def _convert_tools_to_anthropic_format(
        self,
        openai_tools: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Convert OpenAI tool format to Anthropic format.

        OpenAI format:
        {
            "type": "function",
            "function": {
                "name": "...",
                "description": "...",
                "parameters": {...}
            }
        }

        Anthropic format:
        {
            "name": "...",
            "description": "...",
            "input_schema": {...}
        }
        """
        anthropic_tools = []
        for tool in openai_tools:
            if tool.get("type") == "function":
                func = tool.get("function", {})
                anthropic_tools.append({
                    "name": func.get("name"),
                    "description": func.get("description", ""),
                    "input_schema": func.get(
                        "parameters", {"type": "object", "properties": {}}
                    )
                })
        return anthropic_tools

    async def _call_gemini(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> tuple[str, Dict[str, Any], Optional[List[Dict[str, Any]]]]:
        """
        Call Gemini (Google) API with tool calling support.

        Uses the new google-genai SDK with async support via client.aio namespace.
        """
        api_key = get_provider_api_key("google")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not configured")

        # Create client with API key
        client = genai.Client(api_key=api_key)

        # Convert messages to Gemini format
        gemini_contents, system_instruction = self._convert_messages_to_gemini_format(
            messages
        )

        # Build generation config
        config_kwargs = {
            "temperature": temperature,
            "max_output_tokens": max_tokens or 1024,
        }

        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        # Convert tools if provided (disable auto function calling)
        if tools:
            config_kwargs["tools"] = self._convert_tools_to_gemini_format(tools)
            # Disable automatic function calling - we handle tool calls manually
            config_kwargs["automatic_function_calling"] = {"disable": True}

        config = genai_types.GenerateContentConfig(**config_kwargs)

        # Use async API
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model or settings.GEMINI_MODEL,
                contents=gemini_contents,
                config=config
            ),
            timeout=settings.LLM_REQUEST_TIMEOUT
        )

        # Parse response
        content = ""
        tool_calls = None

        # Extract text and function calls from response
        if response.candidates and response.candidates[0].content:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'text') and part.text:
                    content = part.text
                elif hasattr(part, 'function_call') and part.function_call:
                    if tool_calls is None:
                        tool_calls = []
                    fc = part.function_call
                    tool_calls.append({
                        "id": f"gemini_{hash(fc.name)}",
                        "type": "function",
                        "function": {
                            "name": fc.name,
                            "arguments": json.dumps(dict(fc.args))
                            if fc.args else "{}"
                        }
                    })

        # Also check response.text as a shortcut
        if not content and hasattr(response, 'text') and response.text:
            content = response.text

        # Token usage
        usage_metadata = getattr(response, 'usage_metadata', None)
        prompt_tokens = getattr(
            usage_metadata, 'prompt_token_count', None
        ) if usage_metadata else None
        completion_tokens = getattr(
            usage_metadata, 'candidates_token_count', None
        ) if usage_metadata else None

        metadata = {
            "tokens_used": (prompt_tokens + completion_tokens)
            if prompt_tokens and completion_tokens else None,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens
        }

        return content, metadata, tool_calls

    def _convert_messages_to_gemini_format(
        self,
        messages: List[Dict[str, str]]
    ) -> tuple[List[genai_types.Content], Optional[str]]:
        """
        Convert OpenAI-style messages to Gemini format.

        Returns (contents, system_instruction) tuple.
        """
        gemini_contents = []
        system_instruction = None

        for msg in messages:
            role = msg.get("role", "user")
            content_text = msg.get("content", "")

            if role == "system":
                # Gemini handles system via system_instruction in config
                system_instruction = content_text
                continue

            # Map roles: assistant -> model
            gemini_role = "model" if role == "assistant" else "user"

            gemini_contents.append(
                genai_types.Content(
                    role=gemini_role,
                    parts=[genai_types.Part(text=content_text)]
                )
            )

        return gemini_contents, system_instruction

    def _convert_tools_to_gemini_format(
        self,
        openai_tools: List[Dict[str, Any]]
    ) -> List[genai_types.Tool]:
        """Convert OpenAI tool format to Gemini Tool format."""
        function_declarations = []

        for tool in openai_tools:
            if tool.get("type") == "function":
                func = tool.get("function", {})
                params = func.get("parameters", {})

                function_declarations.append(
                    genai_types.FunctionDeclaration(
                        name=func.get("name"),
                        description=func.get("description", ""),
                        parameters=params  # Pass schema directly
                    )
                )

        if function_declarations:
            return [genai_types.Tool(function_declarations=function_declarations)]
        return None

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
                content, usage, _ = await self._call_openai(
                    messages_to_send, model, temperature, max_tokens
                )
            elif provider == "anthropic":
                content, usage, _ = await self._call_claude(
                    messages_to_send, model, temperature, max_tokens
                )
            elif provider == "google":
                content, usage, _ = await self._call_gemini(
                    messages_to_send, model, temperature, max_tokens
                )
            else:  # ollama (default)
                content, usage = await self._call_ollama(
                    messages_to_send, model, temperature, max_tokens
                )

            # Unmask response for cloud providers
            if should_mask and masking_context:
                content = self._pii_masking_service.unmask_text(content, masking_context)

            metadata.update(usage)
            return content, metadata

        except asyncio.TimeoutError:
            raise Exception(
                f"LLM API error ({provider}): "
                f"Request timed out after {settings.LLM_REQUEST_TIMEOUT}s"
            )
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

        # Providers with native function calling support
        native_tool_providers = {"openai", "anthropic", "google"}

        metadata = {
            "model": model,
            "provider": provider,
            "temperature": temperature,
            "supports_native_tools": provider in native_tool_providers
        }

        try:
            if provider == "openai":
                content, usage, tool_calls = await self._call_openai(
                    messages, model, temperature, max_tokens, tools
                )
            elif provider == "anthropic":
                content, usage, tool_calls = await self._call_claude(
                    messages, model, temperature, max_tokens, tools
                )
            elif provider == "google":
                content, usage, tool_calls = await self._call_gemini(
                    messages, model, temperature, max_tokens, tools
                )
            else:
                # Ollama doesn't support native tools
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
