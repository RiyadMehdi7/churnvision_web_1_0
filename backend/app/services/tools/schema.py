"""
Tool Definition Schema - OpenAI Function Calling Format

Defines Pydantic models for tool definitions that are compatible with
OpenAI's function calling API format.
"""

from typing import Dict, Any, List, Optional, Literal, Callable, Awaitable
from pydantic import BaseModel, Field
from enum import Enum


class ToolCategory(str, Enum):
    """Categories of tools for organization"""
    EMPLOYEE = "employee"
    AGGREGATION = "aggregation"
    COMPARISON = "comparison"
    ANALYSIS = "analysis"
    ROI = "roi"


class ToolParameter(BaseModel):
    """Individual parameter definition for a tool"""
    type: Literal["string", "number", "integer", "boolean", "array", "object"]
    description: str
    enum: Optional[List[str]] = None
    items: Optional[Dict[str, Any]] = None  # For array types
    properties: Optional[Dict[str, Any]] = None  # For object types
    required: Optional[List[str]] = None  # For object types
    default: Optional[Any] = None


class ToolSchema(BaseModel):
    """
    OpenAI-compatible function/tool definition.

    This schema follows the OpenAI function calling format:
    https://platform.openai.com/docs/guides/function-calling
    """
    name: str = Field(..., description="Unique tool identifier (snake_case)")
    description: str = Field(..., description="Clear description of what the tool does and when to use it")
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {"type": "object", "properties": {}, "required": []},
        description="JSON Schema for the tool's parameters"
    )

    def to_openai_format(self) -> Dict[str, Any]:
        """Convert to OpenAI tools API format"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }

    def to_prompt_format(self) -> str:
        """Convert to human-readable format for prompt injection (Ollama)"""
        params_desc = []
        properties = self.parameters.get("properties", {})
        required = self.parameters.get("required", [])

        for param_name, param_spec in properties.items():
            param_type = param_spec.get("type", "string")
            param_desc = param_spec.get("description", "")
            is_required = param_name in required
            enum_values = param_spec.get("enum", [])

            param_str = f"  - {param_name} ({param_type}"
            if is_required:
                param_str += ", required"
            param_str += f"): {param_desc}"
            if enum_values:
                param_str += f" [options: {', '.join(enum_values)}]"
            params_desc.append(param_str)

        params_section = "\n".join(params_desc) if params_desc else "  (no parameters)"

        return f"""Tool: {self.name}
Description: {self.description}
Parameters:
{params_section}
"""


class ToolDefinition(BaseModel):
    """
    Full tool registration including metadata and handler reference.

    This extends ToolSchema with additional metadata for the registry.
    """
    # Renamed from 'schema' to avoid shadowing BaseModel.schema
    tool_schema: ToolSchema
    category: ToolCategory = ToolCategory.ANALYSIS
    requires_employee_context: bool = Field(
        default=False,
        description="If True, this tool requires an employee to be selected"
    )
    requires_dataset: bool = Field(
        default=True,
        description="If True, this tool requires a dataset_id"
    )
    max_execution_time_ms: int = Field(
        default=30000,
        description="Maximum execution time in milliseconds"
    )
    cacheable: bool = Field(
        default=True,
        description="Whether results can be cached"
    )
    cache_ttl_seconds: int = Field(
        default=60,
        description="Cache TTL in seconds if cacheable"
    )

    class Config:
        use_enum_values = True


class ToolCall(BaseModel):
    """Represents a single tool call from the LLM"""
    id: str = Field(..., description="Unique identifier for this tool call")
    name: str = Field(..., description="Name of the tool to call")
    arguments: Dict[str, Any] = Field(
        default_factory=dict,
        description="Arguments to pass to the tool"
    )


class ToolResult(BaseModel):
    """Result from tool execution"""
    tool_call_id: str
    tool_name: str
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    execution_time_ms: int = 0

    def to_message_content(self) -> str:
        """Convert to string for LLM message"""
        if self.success:
            import json
            if isinstance(self.data, (dict, list)):
                return json.dumps(self.data, indent=2, default=str)
            return str(self.data)
        return f"Error: {self.error}"
