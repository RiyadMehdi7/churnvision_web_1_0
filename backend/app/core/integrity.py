"""
Binary Integrity Verification for ChurnVision Enterprise

Ensures the application binary hasn't been tampered with by verifying
checksums of critical modules at runtime.
"""

import hashlib
import inspect
import importlib
import os
from typing import Dict, List, Optional
from datetime import datetime

from fastapi import HTTPException, status


class IntegrityChecker:
    """
    Verifies the integrity of critical application components.

    This helps detect if someone has modified the binary to bypass
    license checks or other security measures.
    """

    # Modules to verify (add your critical modules here)
    CRITICAL_MODULES = [
        "app.core.license",
        "app.core.hardware_fingerprint",
        "app.api.deps",
    ]

    # Store expected hashes (populated at build time)
    # In production, these would be embedded during Nuitka compilation
    _expected_hashes: Dict[str, str] = {}
    _verified: bool = False
    _last_check: Optional[datetime] = None

    @classmethod
    def _hash_module(cls, module_name: str) -> Optional[str]:
        """Generate a hash of a module's source code"""
        try:
            module = importlib.import_module(module_name)

            # Get the source file
            source_file = inspect.getfile(module)

            # For compiled modules (.pyc, .so), hash the binary
            if source_file.endswith(('.pyc', '.pyo', '.so', '.pyd')):
                with open(source_file, 'rb') as f:
                    return hashlib.sha256(f.read()).hexdigest()

            # For source files, hash the source
            source = inspect.getsource(module)
            return hashlib.sha256(source.encode()).hexdigest()

        except Exception:
            return None

    @classmethod
    def generate_manifest(cls) -> Dict[str, str]:
        """
        Generate a manifest of module hashes.

        Run this at build time to create the expected hashes.
        """
        manifest = {}
        for module_name in cls.CRITICAL_MODULES:
            hash_value = cls._hash_module(module_name)
            if hash_value:
                manifest[module_name] = hash_value
        return manifest

    @classmethod
    def set_expected_hashes(cls, hashes: Dict[str, str]) -> None:
        """Set the expected hashes (called at startup from secure source)"""
        cls._expected_hashes = hashes

    @classmethod
    def verify_integrity(cls, raise_on_failure: bool = True) -> bool:
        """
        Verify all critical modules haven't been tampered with.

        Args:
            raise_on_failure: Whether to raise an exception on failure

        Returns:
            True if all modules pass verification

        Raises:
            HTTPException: If verification fails and raise_on_failure is True
        """
        if not cls._expected_hashes:
            # No hashes set - skip verification (dev mode)
            return True

        failed_modules: List[str] = []

        for module_name, expected_hash in cls._expected_hashes.items():
            current_hash = cls._hash_module(module_name)

            if current_hash != expected_hash:
                failed_modules.append(module_name)

        cls._last_check = datetime.utcnow()

        if failed_modules:
            cls._verified = False
            if raise_on_failure:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Application integrity check failed. Please reinstall."
                )
            return False

        cls._verified = True
        return True

    @classmethod
    def is_verified(cls) -> bool:
        """Check if the last integrity verification passed"""
        return cls._verified


def verify_startup_integrity() -> None:
    """
    Called at application startup to verify integrity.

    In production builds, the expected hashes would be embedded
    in the compiled binary.
    """
    # Load expected hashes from secure location
    hashes_file = os.getenv("INTEGRITY_MANIFEST_PATH", "/etc/churnvision/integrity.json")

    if os.path.exists(hashes_file):
        import json
        try:
            with open(hashes_file, "r") as f:
                hashes = json.load(f)
            IntegrityChecker.set_expected_hashes(hashes)
            IntegrityChecker.verify_integrity()
        except Exception as e:
            # In production, you might want to fail hard here
            print(f"Warning: Integrity verification skipped: {e}")
