"""
Tool Calling Agent - Main orchestration loop for LLM tool calling

This module implements the agent loop that:
1. Sends messages to the LLM with tool definitions
2. Parses tool calls from the response
3. Executes tools and feeds results back
4. Repeats until the LLM provides a final answer

Supports both native function calling (OpenAI/Azure) and
simulated tool calling (Ollama/Qwen/IBM) via prompt injection.
"""

from typing import Dict, Any, List, Optional, AsyncGenerator
from dataclasses import dataclass, field
from enum import Enum
import json
import re
import logging
import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tools.registry import tool_registry
from app.services.tools.executor import ToolExecutor
from app.services.tools.schema import ToolCall, ToolResult
from app.services.tools.provider_adapter import get_provider_capabilities, supports_native_tools
from app.core.config import settings

logger = logging.getLogger(__name__)


class AgentState(str, Enum):
    """States the agent can be in during execution"""
    THINKING = "thinking"
    CALLING_TOOL = "calling_tool"
    OBSERVING = "observing"
    RESPONDING = "responding"
    DONE = "done"
    ERROR = "error"


@dataclass
class AgentContext:
    """Context maintained across the agent loop"""
    messages: List[Dict[str, Any]] = field(default_factory=list)
    tool_calls: List[ToolCall] = field(default_factory=list)
    tool_results: List[ToolResult] = field(default_factory=list)
    iteration: int = 0
    total_tokens_used: int = 0
    dataset_id: Optional[str] = None
    employee_context: Optional[Dict[str, Any]] = None


class ToolCallingAgent:
    """
    Agent that orchestrates tool calling with LLMs.

    This class implements the core agent loop pattern:
    1. User message + tool definitions -> LLM
    2. LLM decides to call tools (or respond directly)
    3. Execute tools, collect results
    4. Feed results back to LLM
    5. Repeat until LLM provides final answer

    Works with:
    - OpenAI/Azure (native function calling)
    - Ollama/Qwen/IBM (simulated via prompt injection)

    Usage:
        agent = ToolCallingAgent(db, model, provider, dataset_id)
        result = await agent.run("How many employees in Engineering?")
        print(result["response"])
    """

    MAX_ITERATIONS = 10
    MAX_TOOL_CALLS_PER_ITERATION = 3

    def __init__(
        self,
        db: AsyncSession,
        model: str,
        provider: str,
        dataset_id: str,
        employee_context: Optional[Dict[str, Any]] = None,
        chatbot_service: Optional[Any] = None
    ):
        """
        Initialize the tool calling agent.

        Args:
            db: Database session
            model: LLM model name
            provider: LLM provider (openai, ollama, etc.)
            dataset_id: Current dataset ID
            employee_context: Optional selected employee context
            chatbot_service: Optional ChatbotService instance (created if not provided)
        """
        self.db = db
        self.model = model
        self.provider = provider.lower()
        self.dataset_id = dataset_id

        # Initialize services
        self.tool_executor = ToolExecutor(db, dataset_id, employee_context)

        # Import here to avoid circular imports
        if chatbot_service is None:
            from app.services.ai.chatbot_service import ChatbotService
            self.chatbot_service = ChatbotService(db)
        else:
            self.chatbot_service = chatbot_service

        # Initialize context
        self.context = AgentContext(
            dataset_id=dataset_id,
            employee_context=employee_context
        )

        # Get provider capabilities
        self.capabilities = get_provider_capabilities(provider)

    @property
    def uses_native_tools(self) -> bool:
        """Check if this provider supports native function calling"""
        return self.capabilities.native_function_calling

    async def run(
        self,
        user_message: str,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Run the agent loop until completion or max iterations.

        Args:
            user_message: The user's question
            system_prompt: Optional custom system prompt
            conversation_history: Optional previous messages

        Returns:
            Dict with:
                - response: Final text response
                - tool_history: List of tool calls and results
                - iterations: Number of iterations taken
                - tokens_used: Total tokens consumed
        """
        # Initialize messages
        self._initialize_messages(system_prompt, conversation_history, user_message)

        while self.context.iteration < self.MAX_ITERATIONS:
            self.context.iteration += 1
            logger.info(f"Agent iteration {self.context.iteration}")

            # Get LLM response
            try:
                response = await self._get_llm_response()
            except Exception as e:
                logger.exception(f"LLM call failed: {e}")
                return self._create_error_response(str(e))

            # Check for tool calls
            tool_calls = response.get("tool_calls", [])

            if tool_calls:
                logger.info(f"LLM requested {len(tool_calls)} tool call(s)")

                # Execute tools
                results = await self._execute_tools(tool_calls)

                # Add results to message history
                self._append_tool_results(tool_calls, results)

                # Continue loop
                continue
            else:
                # No tool calls - agent is done
                content = response.get("content", "")
                return {
                    "response": content,
                    "tool_history": self._get_tool_history(),
                    "iterations": self.context.iteration,
                    "tokens_used": self.context.total_tokens_used,
                    "success": True
                }

        # Max iterations reached
        logger.warning("Agent reached max iterations")
        return {
            "response": self._generate_partial_response(),
            "tool_history": self._get_tool_history(),
            "iterations": self.context.iteration,
            "tokens_used": self.context.total_tokens_used,
            "max_iterations_reached": True,
            "success": True
        }

    async def run_streaming(
        self,
        user_message: str,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Streaming version of run() - yields state updates for WebSocket.

        Yields events like:
            {"type": "state", "state": "thinking"}
            {"type": "tool_call", "tool": "count_employees", "arguments": {...}}
            {"type": "tool_result", "tool": "count_employees", "success": true, "preview": "..."}
            {"type": "token", "content": "word "}
            {"type": "done", "full_response": "..."}
        """
        # Initialize messages
        self._initialize_messages(system_prompt, conversation_history, user_message)

        while self.context.iteration < self.MAX_ITERATIONS:
            self.context.iteration += 1

            yield {"type": "state", "state": AgentState.THINKING.value}

            try:
                response = await self._get_llm_response()
            except Exception as e:
                yield {"type": "error", "error": str(e)}
                return

            tool_calls = response.get("tool_calls", [])

            if tool_calls:
                # Notify about each tool call
                for tc in tool_calls:
                    yield {
                        "type": "tool_call",
                        "tool": tc.name,
                        "arguments": tc.arguments
                    }

                yield {"type": "state", "state": AgentState.CALLING_TOOL.value}

                # Execute tools
                results = await self._execute_tools(tool_calls)

                # Notify about results
                for result in results:
                    preview = None
                    if result.success and result.data:
                        preview = str(result.data)[:200]
                    yield {
                        "type": "tool_result",
                        "tool": result.tool_name,
                        "success": result.success,
                        "preview": preview,
                        "execution_time_ms": result.execution_time_ms
                    }

                self._append_tool_results(tool_calls, results)
                continue

            else:
                # Stream final response
                yield {"type": "state", "state": AgentState.RESPONDING.value}

                content = response.get("content", "")

                # Simulate token streaming
                words = content.split()
                for i, word in enumerate(words):
                    separator = " " if i < len(words) - 1 else ""
                    yield {"type": "token", "content": word + separator}
                    await asyncio.sleep(0.02)

                yield {
                    "type": "done",
                    "full_response": content,
                    "tool_history": self._get_tool_history(),
                    "iterations": self.context.iteration
                }
                return

        # Max iterations
        yield {
            "type": "done",
            "full_response": self._generate_partial_response(),
            "max_iterations_reached": True
        }

    def _initialize_messages(
        self,
        system_prompt: Optional[str],
        conversation_history: Optional[List[Dict[str, Any]]],
        user_message: str
    ) -> None:
        """Initialize the message list for the agent loop"""
        self.context.messages = []

        # System prompt
        base_prompt = system_prompt or self._get_default_system_prompt()

        # For non-native providers, inject tool descriptions
        if not self.uses_native_tools:
            tools_prompt = tool_registry.get_tools_prompt()
            base_prompt = f"{base_prompt}\n\n{tools_prompt}"

        self.context.messages.append({
            "role": "system",
            "content": base_prompt
        })

        # Add employee context if available
        if self.context.employee_context:
            context_msg = self._format_employee_context()
            self.context.messages.append({
                "role": "system",
                "content": context_msg
            })

        # Add conversation history
        if conversation_history:
            for msg in conversation_history[-10:]:  # Last 10 messages
                self.context.messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })

        # Add current user message
        self.context.messages.append({
            "role": "user",
            "content": user_message
        })

    def _get_default_system_prompt(self) -> str:
        """Get the default system prompt for the agent"""
        return """You are a helpful AI assistant for ChurnVision Enterprise, an employee churn prediction platform.
You help users understand their workforce data, analyze employee turnover patterns, and make data-driven HR decisions.

When answering questions about data, ALWAYS use the available tools to get accurate information.
Do NOT make up or estimate numbers - use tools to query the actual data.

After receiving tool results, provide a clear, concise answer based on the actual data.
Include relevant numbers and statistics from the tool results."""

    def _format_employee_context(self) -> str:
        """Format the current employee context for the LLM"""
        emp = self.context.employee_context
        if not emp:
            return ""

        return f"""Current Employee Context (user has selected this employee):
- Name: {emp.get('full_name', 'Unknown')}
- HR Code: {emp.get('hr_code', 'Unknown')}
- Position: {emp.get('position', 'Unknown')}
- Department: {emp.get('structure_name', emp.get('department', 'Unknown'))}
- Tenure: {emp.get('tenure', 0):.1f} years
- Status: {emp.get('status', 'Unknown')}

When the user asks questions about "this employee" or uses similar references, they mean the employee above."""

    async def _get_llm_response(self) -> Dict[str, Any]:
        """
        Get response from LLM, handling both native and simulated tool calling.

        Returns:
            Dict with 'content' and optional 'tool_calls'
        """
        if self.uses_native_tools:
            return await self._get_native_tool_response()
        else:
            return await self._get_simulated_tool_response()

    async def _get_native_tool_response(self) -> Dict[str, Any]:
        """
        Use native OpenAI/Azure function calling.

        This method calls the LLM with the tools parameter and parses
        the structured tool_calls from the response.
        """
        tools_spec = tool_registry.get_openai_tools_spec()

        # Use the chatbot service's native tool calling
        # We need to extend ChatbotService to support this
        content, metadata, tool_calls_raw = await self.chatbot_service.get_response_with_tools(
            messages=self.context.messages,
            model=self.model,
            tools=tools_spec,
            temperature=0.3
        )

        self.context.total_tokens_used += metadata.get("tokens_used", 0)

        if tool_calls_raw:
            tool_calls = [
                ToolCall(
                    id=tc.get("id", f"call_{i}"),
                    name=tc.get("function", {}).get("name", tc.get("name", "")),
                    arguments=json.loads(tc.get("function", {}).get("arguments", "{}"))
                    if isinstance(tc.get("function", {}).get("arguments"), str)
                    else tc.get("function", {}).get("arguments", tc.get("arguments", {}))
                )
                for i, tc in enumerate(tool_calls_raw)
            ]
            return {"tool_calls": tool_calls, "content": content}

        return {"content": content}

    async def _get_simulated_tool_response(self) -> Dict[str, Any]:
        """
        Simulate tool calling for providers without native support.

        The tool descriptions are already in the system prompt.
        We parse JSON tool calls from the LLM's text response.
        """
        content, metadata = await self.chatbot_service._get_llm_response(
            messages=self.context.messages,
            model=self.model,
            temperature=0.3
        )

        self.context.total_tokens_used += metadata.get("tokens_used", 0)

        # Try to parse tool calls from response
        tool_calls = self._parse_tool_calls_from_text(content)

        if tool_calls:
            return {"tool_calls": tool_calls, "content": None}

        return {"content": content}

    def _parse_tool_calls_from_text(self, text: str) -> Optional[List[ToolCall]]:
        """
        Parse tool calls from LLM text response.

        Looks for JSON in the format:
        {"tool_calls": [{"name": "...", "arguments": {...}}]}
        """
        if not text:
            return None

        # Try to find JSON in the response
        # Pattern 1: Full tool_calls object
        pattern1 = r'\{[\s\S]*?"tool_calls"[\s\S]*?\}'
        # Pattern 2: Just the array
        pattern2 = r'\[\s*\{[\s\S]*?"name"[\s\S]*?\}\s*\]'

        for pattern in [pattern1, pattern2]:
            matches = re.findall(pattern, text, re.DOTALL)
            for match in matches:
                try:
                    data = json.loads(match)

                    # Handle both formats
                    if isinstance(data, list):
                        calls = data
                    elif "tool_calls" in data:
                        calls = data["tool_calls"]
                    else:
                        continue

                    if calls:
                        return [
                            ToolCall(
                                id=f"sim_{uuid.uuid4().hex[:8]}",
                                name=tc.get("name", ""),
                                arguments=tc.get("arguments", {})
                            )
                            for tc in calls
                            if tc.get("name")
                        ]
                except json.JSONDecodeError:
                    continue

        return None

    async def _execute_tools(self, tool_calls: List[ToolCall]) -> List[ToolResult]:
        """Execute tool calls and return results"""
        # Limit concurrent tool calls
        tool_calls = tool_calls[:self.MAX_TOOL_CALLS_PER_ITERATION]
        results = []

        for tc in tool_calls:
            self.context.tool_calls.append(tc)
            result = await self.tool_executor.execute(tc.name, tc.arguments)
            results.append(result)
            self.context.tool_results.append(result)

        return results

    def _append_tool_results(
        self,
        tool_calls: List[ToolCall],
        results: List[ToolResult]
    ) -> None:
        """Add tool results to message history for next iteration"""
        if self.uses_native_tools:
            # OpenAI format: assistant message with tool_calls, then tool messages
            self.context.messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments)
                        }
                    }
                    for tc in tool_calls
                ]
            })

            for tc, result in zip(tool_calls, results):
                self.context.messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result.to_message_content()
                })
        else:
            # Simulated format: just add results as assistant context
            results_text = "\n\n".join([
                f"Tool '{r.tool_name}' result:\n{r.to_message_content()}"
                for r in results
            ])

            self.context.messages.append({
                "role": "assistant",
                "content": f"I called the following tools:\n\n{results_text}\n\nLet me analyze these results."
            })

    def _get_tool_history(self) -> List[Dict[str, Any]]:
        """Get the history of tool calls and results"""
        history = []
        for tc, tr in zip(self.context.tool_calls, self.context.tool_results):
            history.append({
                "call": {
                    "id": tc.id,
                    "name": tc.name,
                    "arguments": tc.arguments
                },
                "result": {
                    "success": tr.success,
                    "data": tr.data,
                    "error": tr.error,
                    "execution_time_ms": tr.execution_time_ms
                }
            })
        return history

    def _generate_partial_response(self) -> str:
        """Generate a response when max iterations reached"""
        if not self.context.tool_results:
            return "I wasn't able to gather enough information to answer your question."

        # Summarize successful results
        summaries = []
        for result in self.context.tool_results:
            if result.success and result.data:
                data_str = str(result.data)
                if len(data_str) > 100:
                    data_str = data_str[:100] + "..."
                summaries.append(f"- {result.tool_name}: {data_str}")

        if summaries:
            return "Based on the data I gathered:\n" + "\n".join(summaries)

        return "I encountered some issues while gathering data. Please try rephrasing your question."

    def _create_error_response(self, error: str) -> Dict[str, Any]:
        """Create an error response"""
        return {
            "response": f"I encountered an error: {error}",
            "tool_history": self._get_tool_history(),
            "iterations": self.context.iteration,
            "tokens_used": self.context.total_tokens_used,
            "success": False,
            "error": error
        }
