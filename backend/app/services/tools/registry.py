"""
Tool Registry - Central registration for all available tools

The registry is a singleton that holds all tool definitions and their handlers.
Tools are registered at application startup and can be looked up by name.
"""

from typing import Dict, Callable, Awaitable, Any, List, Optional
from dataclasses import dataclass
import logging

from app.services.tools.schema import ToolDefinition, ToolSchema, ToolCategory

logger = logging.getLogger(__name__)


@dataclass
class RegisteredTool:
    """A tool that has been registered with the registry"""
    definition: ToolDefinition
    handler: Callable[..., Awaitable[Any]]


class ToolRegistry:
    """
    Central registry for all available tools.

    This is implemented as a singleton to ensure consistent tool registration
    across the application.

    Usage:
        from app.services.tools.registry import tool_registry

        # Register a tool
        @tool_registry.register(definition)
        async def my_tool_handler(db, dataset_id, **kwargs):
            ...

        # Get all tools
        tools = tool_registry.get_all_tools()

        # Get OpenAI format
        openai_tools = tool_registry.get_openai_tools_spec()
    """

    _instance: Optional["ToolRegistry"] = None
    _tools: Dict[str, RegisteredTool]

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._tools = {}
        return cls._instance

    def register(
        self,
        definition: ToolDefinition
    ) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
        """
        Decorator to register a tool handler.

        Usage:
            @tool_registry.register(my_tool_definition)
            async def my_tool(db, dataset_id, **kwargs):
                ...
        """
        def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
            self._tools[definition.tool_schema.name] = RegisteredTool(
                definition=definition,
                handler=func
            )
            logger.info(f"Registered tool: {definition.tool_schema.name}")
            return func
        return decorator

    def register_tool(
        self,
        definition: ToolDefinition,
        handler: Callable[..., Awaitable[Any]]
    ) -> None:
        """
        Programmatic registration of a tool.

        Args:
            definition: The tool definition
            handler: Async function to handle tool calls
        """
        self._tools[definition.tool_schema.name] = RegisteredTool(
            definition=definition,
            handler=handler
        )
        logger.info(f"Registered tool: {definition.tool_schema.name}")

    def get_tool(self, name: str) -> Optional[RegisteredTool]:
        """Get a registered tool by name"""
        return self._tools.get(name)

    def get_all_tools(self) -> List[RegisteredTool]:
        """Get all registered tools"""
        return list(self._tools.values())

    def get_tools_by_category(self, category: ToolCategory) -> List[RegisteredTool]:
        """Get all tools in a specific category"""
        return [
            tool for tool in self._tools.values()
            if tool.definition.category == category
        ]

    def get_openai_tools_spec(self) -> List[Dict[str, Any]]:
        """
        Get all tools in OpenAI function calling format.

        Returns a list suitable for passing to the OpenAI API's `tools` parameter.
        """
        return [
            tool.definition.tool_schema.to_openai_format()
            for tool in self._tools.values()
        ]

    def get_tools_prompt(self) -> str:
        """
        Generate a tools description prompt for LLMs without native tool support.

        This creates a human-readable description of all tools that can be
        injected into the system prompt for Ollama and similar providers.
        """
        tools_desc = [
            tool.definition.tool_schema.to_prompt_format()
            for tool in self._tools.values()
        ]

        return """You have access to the following data analysis tools:

{}

To use a tool, respond with a JSON object in this EXACT format:
{{"tool_calls": [{{"name": "tool_name", "arguments": {{"arg1": "value1"}}}}]}}

IMPORTANT:
- Only output the JSON when you need to call a tool
- You can call multiple tools at once by adding more items to the array
- After receiving tool results, analyze them and provide a clear answer
- If you have enough information to answer WITHOUT tools, respond naturally (no JSON)

Example tool call:
{{"tool_calls": [{{"name": "count_employees", "arguments": {{"department": "Engineering"}}}}]}}
""".format("\n".join(tools_desc))

    def clear(self) -> None:
        """Clear all registered tools (useful for testing)"""
        self._tools.clear()

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools


# Global singleton instance
tool_registry = ToolRegistry()
