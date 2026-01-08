"""
Tool Executor - Safe execution of tools with validation and limits

This module provides a secure wrapper for executing tools, including:
- Parameter validation
- Execution time limits
- Error handling
- Result caching
"""

from typing import Dict, Any, Optional, Set
import asyncio
import time
import logging
import json
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tools.registry import tool_registry
from app.services.tools.schema import ToolResult

logger = logging.getLogger(__name__)


class ToolExecutionError(Exception):
    """Raised when tool execution fails"""
    pass


class ToolValidationError(Exception):
    """Raised when tool parameters are invalid"""
    pass


class ToolExecutor:
    """
    Safe tool execution with validation and limits.

    This class wraps tool execution to ensure:
    1. Parameters are validated before execution
    2. Execution time is limited
    3. Errors are caught and reported gracefully
    4. Results are optionally cached
    """

    # Whitelist of allowed fields for flexible queries (security)
    ALLOWED_FIELDS: Set[str] = {
        "full_name", "hr_code", "position", "department", "structure_name",
        "tenure", "salary", "employee_cost", "risk_score", "resign_proba",
        "risk_level", "eltv", "eltv_pre_treatment", "eltv_post_treatment",
        "status", "manager_id", "report_date", "termination_date"
    }

    # Allowed operators for filters
    ALLOWED_OPERATORS: Set[str] = {"=", "!=", ">", "<", ">=", "<=", "contains", "in", "not_in"}

    # Limits
    MAX_RESULTS = 100
    DEFAULT_TIMEOUT_MS = 30000

    def __init__(
        self,
        db: AsyncSession,
        dataset_id: str,
        employee_context: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the tool executor.

        Args:
            db: Database session for queries
            dataset_id: Current dataset ID
            employee_context: Optional current employee context
        """
        self.db = db
        self.dataset_id = dataset_id
        self.employee_context = employee_context
        self._cache: Dict[str, Any] = {}

    async def execute(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        timeout_ms: Optional[int] = None
    ) -> ToolResult:
        """
        Execute a tool with the given arguments.

        Args:
            tool_name: Name of the tool to execute
            arguments: Arguments to pass to the tool
            timeout_ms: Optional timeout override in milliseconds

        Returns:
            ToolResult with success status and data or error
        """
        start_time = time.time()

        # Get the tool from registry
        registered_tool = tool_registry.get_tool(tool_name)
        if not registered_tool:
            return ToolResult(
                tool_call_id=f"error_{tool_name}",
                tool_name=tool_name,
                success=False,
                error=f"Unknown tool: {tool_name}"
            )

        definition = registered_tool.definition
        handler = registered_tool.handler

        # Validate requirements
        if definition.requires_dataset and not self.dataset_id:
            return ToolResult(
                tool_call_id=f"error_{tool_name}",
                tool_name=tool_name,
                success=False,
                error="This tool requires a dataset to be selected"
            )

        if definition.requires_employee_context and not self.employee_context:
            return ToolResult(
                tool_call_id=f"error_{tool_name}",
                tool_name=tool_name,
                success=False,
                error="This tool requires an employee to be selected"
            )

        # Validate arguments
        try:
            self._validate_arguments(tool_name, arguments, definition.tool_schema.parameters)
        except ToolValidationError as e:
            return ToolResult(
                tool_call_id=f"error_{tool_name}",
                tool_name=tool_name,
                success=False,
                error=str(e)
            )

        # Check cache
        cache_key = self._get_cache_key(tool_name, arguments)
        if definition.cacheable and cache_key in self._cache:
            logger.debug(f"Cache hit for {tool_name}")
            cached_result = self._cache[cache_key]
            return ToolResult(
                tool_call_id=f"cached_{tool_name}",
                tool_name=tool_name,
                success=True,
                data=cached_result,
                execution_time_ms=0
            )

        # Execute with timeout
        timeout = timeout_ms or definition.max_execution_time_ms
        timeout_seconds = timeout / 1000

        try:
            result = await asyncio.wait_for(
                handler(
                    db=self.db,
                    dataset_id=self.dataset_id,
                    employee_context=self.employee_context,
                    **arguments
                ),
                timeout=timeout_seconds
            )

            execution_time_ms = int((time.time() - start_time) * 1000)

            # Cache successful results
            if definition.cacheable:
                self._cache[cache_key] = result

            logger.info(f"Tool {tool_name} executed in {execution_time_ms}ms")

            return ToolResult(
                tool_call_id=f"success_{tool_name}",
                tool_name=tool_name,
                success=True,
                data=result,
                execution_time_ms=execution_time_ms
            )

        except asyncio.TimeoutError:
            execution_time_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Tool {tool_name} timed out after {execution_time_ms}ms")
            return ToolResult(
                tool_call_id=f"timeout_{tool_name}",
                tool_name=tool_name,
                success=False,
                error=f"Tool execution timed out after {timeout}ms",
                execution_time_ms=execution_time_ms
            )

        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            logger.exception(f"Tool {tool_name} failed: {e}")
            return ToolResult(
                tool_call_id=f"error_{tool_name}",
                tool_name=tool_name,
                success=False,
                error=str(e),
                execution_time_ms=execution_time_ms
            )

    def _validate_arguments(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        schema: Dict[str, Any]
    ) -> None:
        """
        Validate tool arguments against the schema.

        Raises ToolValidationError if validation fails.
        """
        properties = schema.get("properties", {})
        required = schema.get("required", [])

        # Check required parameters
        for param in required:
            if param not in arguments:
                raise ToolValidationError(f"Missing required parameter: {param}")

        # Validate parameter types and values
        for param_name, param_value in arguments.items():
            if param_name not in properties:
                # Allow unknown parameters but log a warning
                logger.warning(f"Unknown parameter {param_name} for tool {tool_name}")
                continue

            param_spec = properties[param_name]
            expected_type = param_spec.get("type")
            enum_values = param_spec.get("enum")

            # Type validation
            if expected_type:
                if not self._check_type(param_value, expected_type):
                    raise ToolValidationError(
                        f"Parameter {param_name} should be {expected_type}, got {type(param_value).__name__}"
                    )

            # Enum validation
            if enum_values and param_value not in enum_values:
                raise ToolValidationError(
                    f"Parameter {param_name} must be one of: {', '.join(enum_values)}"
                )

        # Special validation for flexible query tool
        if tool_name == "flexible_data_query":
            self._validate_flexible_query(arguments)

    def _check_type(self, value: Any, expected: str) -> bool:
        """Check if value matches expected JSON Schema type"""
        type_map = {
            "string": str,
            "number": (int, float),
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        expected_types = type_map.get(expected)
        if expected_types is None:
            return True  # Unknown type, allow
        return isinstance(value, expected_types)

    def _validate_flexible_query(self, arguments: Dict[str, Any]) -> None:
        """
        Validate flexible query parameters for security.

        Ensures only whitelisted fields and operators are used.
        """
        # Validate select fields
        select_fields = arguments.get("select_fields", [])
        for field in select_fields:
            if field not in self.ALLOWED_FIELDS and field != "*":
                raise ToolValidationError(f"Invalid field: {field}")

        # Validate filters
        filters = arguments.get("filters", [])
        for f in filters:
            field = f.get("field", "")
            operator = f.get("operator", "")

            if field not in self.ALLOWED_FIELDS:
                raise ToolValidationError(f"Invalid filter field: {field}")
            if operator not in self.ALLOWED_OPERATORS:
                raise ToolValidationError(f"Invalid operator: {operator}")

        # Validate group_by
        group_by = arguments.get("group_by")
        if group_by and group_by not in self.ALLOWED_FIELDS:
            raise ToolValidationError(f"Invalid group_by field: {group_by}")

        # Validate order_by
        order_by = arguments.get("order_by", {})
        if order_by:
            order_field = order_by.get("field")
            if order_field and order_field not in self.ALLOWED_FIELDS:
                raise ToolValidationError(f"Invalid order_by field: {order_field}")

        # Enforce limits
        limit = arguments.get("limit", 10)
        if limit > self.MAX_RESULTS:
            arguments["limit"] = self.MAX_RESULTS
            logger.warning(f"Limit capped at {self.MAX_RESULTS}")

    def _get_cache_key(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """Generate a cache key for tool results"""
        args_str = json.dumps(arguments, sort_keys=True, default=str)
        return f"{tool_name}:{self.dataset_id}:{args_str}"

    def clear_cache(self) -> None:
        """Clear the result cache"""
        self._cache.clear()
