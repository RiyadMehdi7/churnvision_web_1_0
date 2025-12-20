"""
Installation identity management for ChurnVision Enterprise.

Provides a stable, persisted installation ID used for license binding.
"""

import os
import uuid
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("churnvision.installation")


def _installation_path() -> Path:
    path = os.getenv("INSTALLATION_ID_PATH", settings.INSTALLATION_ID_PATH)
    return Path(path)


def get_installation_id() -> str:
    """
    Return a stable installation ID. If none exists, create and persist one.
    """
    env_override = os.getenv("INSTALLATION_ID")
    if env_override:
        return env_override.strip()

    path = _installation_path()
    if path.exists():
        try:
            existing = path.read_text().strip()
            if existing:
                return existing
        except Exception as exc:
            logger.warning(f"Failed to read installation ID: {exc}")

    install_id = uuid.uuid4().hex
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(install_id)
    except Exception as exc:
        logger.warning(f"Failed to persist installation ID: {exc}")

    return install_id
