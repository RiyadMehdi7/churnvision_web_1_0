"""
Security utilities for the ChurnVision backend.

Provides helper functions for input sanitization, validation, and security hardening.
"""

import re
import uuid
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to prevent path traversal and other attacks.

    - Removes directory components (e.g., ../../../etc/passwd -> passwd)
    - Replaces dangerous characters with underscores
    - Prevents hidden files (leading dots)
    - Ensures a valid filename is always returned

    Args:
        filename: The original filename from user input

    Returns:
        A safe filename string
    """
    if not filename:
        return f"unnamed_{uuid.uuid4().hex[:8]}"

    # Get just the filename, removing any directory components
    name = Path(filename).name

    # Remove null bytes and other control characters
    name = re.sub(r'[\x00-\x1f\x7f]', '', name)

    # Replace potentially dangerous characters with underscores
    # Allow only alphanumeric, dots, hyphens, underscores, and spaces
    safe_name = re.sub(r'[^\w.\-\s]', '_', name)

    # Collapse multiple underscores/spaces
    safe_name = re.sub(r'[_\s]+', '_', safe_name)

    # Prevent hidden files (remove leading dots)
    safe_name = safe_name.lstrip('.')

    # Prevent empty filenames
    if not safe_name or safe_name == '_':
        safe_name = f"unnamed_{uuid.uuid4().hex[:8]}"

    # Limit filename length (preserve extension)
    max_length = 200
    if len(safe_name) > max_length:
        name_part, _, ext = safe_name.rpartition('.')
        if ext and len(ext) < 10:
            safe_name = name_part[:max_length - len(ext) - 1] + '.' + ext
        else:
            safe_name = safe_name[:max_length]

    return safe_name


def validate_uuid(value: str) -> Optional[str]:
    """
    Validate that a string is a valid UUID.

    Args:
        value: String to validate

    Returns:
        The validated UUID string, or None if invalid
    """
    try:
        uuid.UUID(value)
        return value
    except (ValueError, TypeError):
        return None


def get_or_create_session_id(session_id: Optional[str]) -> str:
    """
    Validate a session ID or create a new one if invalid.

    Args:
        session_id: Optional session ID to validate

    Returns:
        A valid UUID session ID
    """
    if session_id and validate_uuid(session_id):
        return session_id
    return str(uuid.uuid4())


def sanitize_error_message(error: Exception, context: str = "operation") -> str:
    """
    Create a safe error message for client responses.

    Logs the full error internally but returns a generic message to clients.

    Args:
        error: The exception that occurred
        context: Description of the operation that failed

    Returns:
        A safe, generic error message
    """
    # Log the full error for debugging
    logger.error(f"{context} failed: {str(error)}", exc_info=True)

    # Return generic message to client
    return f"{context.capitalize()} failed. Please try again or contact support."
