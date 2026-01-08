"""
Tool Calling System for ChurnVision Intelligent Chat

This package provides OpenAI-style function/tool calling capabilities,
allowing the LLM to execute data analysis tools dynamically.

Main components:
- schema.py: Pydantic models for tool definitions (OpenAI format)
- registry.py: Singleton registry for all available tools
- executor.py: Safe tool execution with validation & limits
- agent.py: Main agent loop orchestrating tool calls
- provider_adapter.py: Provider capabilities (native vs simulated)
"""

from app.services.tools.schema import ToolSchema, ToolDefinition, ToolParameter
from app.services.tools.registry import tool_registry, ToolRegistry
from app.services.tools.executor import ToolExecutor
from app.services.tools.agent import ToolCallingAgent
from app.services.tools.provider_adapter import get_provider_capabilities, ProviderCapabilities

__all__ = [
    "ToolSchema",
    "ToolDefinition",
    "ToolParameter",
    "tool_registry",
    "ToolRegistry",
    "ToolExecutor",
    "ToolCallingAgent",
    "get_provider_capabilities",
    "ProviderCapabilities",
]
