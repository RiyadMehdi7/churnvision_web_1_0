"""
Binary Integrity Verification for ChurnVision Enterprise

Ensures the application binary hasn't been tampered with by verifying
checksums of critical modules at runtime.
"""

import base64
import hashlib
import inspect
import importlib
import os
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, status
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings

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
        "app.core.integrity",
        "app.core.config",
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
    def _env_flag(name: str, default: bool) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        return raw.lower() in {"1", "true", "yes"}

    manifest_path = os.getenv("INTEGRITY_MANIFEST_PATH", settings.INTEGRITY_MANIFEST_PATH)
    signature_path = os.getenv("INTEGRITY_SIGNATURE_PATH", settings.INTEGRITY_SIGNATURE_PATH)
    require_signed = _env_flag("INTEGRITY_REQUIRE_SIGNED", settings.INTEGRITY_REQUIRE_SIGNED)

    if not manifest_path or not os.path.exists(manifest_path):
        if settings.ENVIRONMENT.lower() == "production" and require_signed:
            raise SystemExit("Integrity manifest missing; refusing to start.")
        print("Warning: Integrity manifest missing; skipping verification.")
        return

    with open(manifest_path, "rb") as f:
        manifest_bytes = f.read()

    if require_signed:
        public_key = os.getenv("INTEGRITY_PUBLIC_KEY") or settings.INTEGRITY_PUBLIC_KEY
        if not public_key:
            key_path = os.getenv("INTEGRITY_PUBLIC_KEY_PATH") or settings.INTEGRITY_PUBLIC_KEY_PATH
            if key_path and os.path.exists(key_path):
                public_key = Path(key_path).read_text()
        if not public_key:
            raise SystemExit("Integrity public key missing; refusing to start.")

        if not signature_path or not os.path.exists(signature_path):
            raise SystemExit("Integrity signature missing; refusing to start.")

        with open(signature_path, "rb") as f:
            signature_raw = f.read().strip()

        try:
            signature = base64.b64decode(signature_raw, validate=True)
        except Exception:
            signature = signature_raw

        try:
            key_obj = serialization.load_pem_public_key(public_key.replace("\\n", "\n").encode())
            key_obj.verify(
                signature,
                manifest_bytes,
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except InvalidSignature:
            raise SystemExit("Integrity signature invalid; refusing to start.")
        except Exception as exc:
            raise SystemExit(f"Integrity signature verification failed: {exc}")

    import json
    try:
        hashes = json.loads(manifest_bytes.decode())
        IntegrityChecker.set_expected_hashes(hashes)
        IntegrityChecker.verify_integrity()
    except Exception as e:
        if settings.ENVIRONMENT.lower() == "production":
            raise SystemExit(f"Integrity verification failed: {e}")
        print(f"Warning: Integrity verification skipped: {e}")
