"""
Application version management.

This module provides a single source of truth for the application version.
The version follows semantic versioning (MAJOR.MINOR.PATCH).
"""

# Application version - update this when releasing new versions
APP_VERSION = "1.0.0"

# Build metadata (can be overridden at build time via environment variable)
import os

BUILD_SHA = os.environ.get("BUILD_SHA", "dev")
BUILD_DATE = os.environ.get("BUILD_DATE", "unknown")


def get_full_version() -> str:
    """Get full version string including build metadata."""
    if BUILD_SHA != "dev":
        return f"{APP_VERSION}+{BUILD_SHA[:8]}"
    return APP_VERSION


def get_version_info() -> dict:
    """Get complete version information as a dictionary."""
    return {
        "version": APP_VERSION,
        "build_sha": BUILD_SHA,
        "build_date": BUILD_DATE,
        "full_version": get_full_version(),
    }
