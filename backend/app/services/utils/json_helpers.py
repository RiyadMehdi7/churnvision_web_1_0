"""
JSON Parsing Helpers

Utilities for parsing and cleaning JSON responses from LLMs and other sources.
"""

import json
import re
import logging
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


def clean_json_string(text: str) -> str:
    """
    Clean a string that might contain JSON wrapped in markdown code blocks.

    Args:
        text: Raw text that may contain JSON

    Returns:
        Cleaned string with markdown formatting removed
    """
    cleaned = text.strip()

    # Remove markdown code blocks
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def safe_json_loads(
    text: str,
    default: Optional[Any] = None
) -> Any:
    """
    Safely parse JSON with fallback to default value.

    Args:
        text: JSON string to parse
        default: Default value if parsing fails

    Returns:
        Parsed JSON or default value
    """
    if not text:
        return default

    try:
        # Handle both string and already-parsed objects
        if isinstance(text, (dict, list)):
            return text
        return json.loads(text)
    except (json.JSONDecodeError, TypeError) as e:
        logger.debug(f"JSON parse failed: {e}")
        return default


def parse_json_response(
    response_text: str,
    expect_type: str = "object"
) -> Union[Dict[str, Any], List[Any]]:
    """
    Parse JSON from LLM response, handling common formatting issues.

    Args:
        response_text: Raw response text from LLM
        expect_type: Expected JSON type - "object" for dict, "array" for list

    Returns:
        Parsed JSON object or array

    Raises:
        json.JSONDecodeError: If JSON cannot be parsed
        ValueError: If parsed JSON doesn't match expected type
    """
    cleaned = clean_json_string(response_text)

    # Try direct parsing first
    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to extract JSON from mixed text
        if expect_type == "array":
            json_match = re.search(r'\[[\s\S]*\]', cleaned)
        else:
            json_match = re.search(r'\{[\s\S]*\}', cleaned)

        if json_match:
            result = json.loads(json_match.group())
        else:
            raise json.JSONDecodeError(
                f"No JSON {expect_type} found in response",
                cleaned,
                0
            )

    # Validate type
    if expect_type == "array" and not isinstance(result, list):
        raise ValueError(f"Expected JSON array but got {type(result).__name__}")
    if expect_type == "object" and not isinstance(result, dict):
        raise ValueError(f"Expected JSON object but got {type(result).__name__}")

    return result


def parse_json_field(
    data: Any,
    field_name: str,
    default: Optional[Any] = None
) -> Any:
    """
    Parse a JSON field that might be a string or already parsed.

    Args:
        data: The data object containing the field
        field_name: Name of the field to parse
        default: Default value if field doesn't exist or can't be parsed

    Returns:
        Parsed value or default
    """
    if not data:
        return default

    value = getattr(data, field_name, None) if hasattr(data, field_name) else data.get(field_name)

    if value is None:
        return default

    return safe_json_loads(value, default=value if isinstance(value, (dict, list)) else default)
