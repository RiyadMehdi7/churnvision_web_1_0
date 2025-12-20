"""
Model artifact encryption for anti-piracy protection.

Artifacts are encrypted at rest and bound to the current license,
installation, and hardware fingerprint.
"""

import base64
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings
from app.core.hardware_fingerprint import HardwareFingerprint
from app.core.installation import get_installation_id
from app.core.license import LicenseValidator

_MAGIC_PREFIX = b"CVENC1:"
_FERNET: Optional[Fernet] = None


class ArtifactCryptoError(Exception):
    """Raised when artifact encryption/decryption fails."""
    pass


def _encryption_required() -> bool:
    raw = os.getenv("ARTIFACT_ENCRYPTION_REQUIRED")
    if raw is None:
        return settings.ARTIFACT_ENCRYPTION_REQUIRED or settings.ENVIRONMENT.lower() == "production"
    return raw.lower() in {"1", "true", "yes"}


def _derive_artifact_key() -> bytes:
    LicenseValidator.validate_license()
    license_key = LicenseValidator.load_license()
    if not license_key:
        raise ArtifactCryptoError("License key missing; cannot derive artifact encryption key.")

    installation_id = get_installation_id()
    hardware_id = HardwareFingerprint.generate()
    seed = f"{license_key}|{installation_id}|{hardware_id}".encode()

    salt = b"churnvision_artifact_v1"
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=200000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(seed))
    return key


def _get_fernet() -> Fernet:
    global _FERNET
    if _FERNET is None:
        _FERNET = Fernet(_derive_artifact_key())
    return _FERNET


def encrypt_blob(data: bytes) -> bytes:
    if not data:
        return data
    token = _get_fernet().encrypt(data)
    return _MAGIC_PREFIX + token


def decrypt_blob(data: bytes) -> bytes:
    if not data:
        return data
    if not data.startswith(_MAGIC_PREFIX):
        if _encryption_required():
            raise ArtifactCryptoError("Unencrypted artifact blocked in production.")
        return data

    token = data[len(_MAGIC_PREFIX):]
    try:
        return _get_fernet().decrypt(token)
    except InvalidToken as exc:
        raise ArtifactCryptoError("Artifact decryption failed; license or hardware mismatch.") from exc


def is_encrypted(data: bytes) -> bool:
    return data.startswith(_MAGIC_PREFIX)
