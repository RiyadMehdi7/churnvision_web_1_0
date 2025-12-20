"""
Generate an integrity manifest for critical modules.

Optionally signs the manifest when INTEGRITY_PRIVATE_KEY or
INTEGRITY_PRIVATE_KEY_PATH is provided.
"""

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.integrity import IntegrityChecker


def _load_private_key():
    key = os.getenv("INTEGRITY_PRIVATE_KEY")
    if not key:
        key_path = os.getenv("INTEGRITY_PRIVATE_KEY_PATH")
        if key_path and Path(key_path).exists():
            key = Path(key_path).read_text()
    if not key:
        return None
    return serialization.load_pem_private_key(
        key.replace("\\n", "\n").encode(),
        password=None,
    )


def main() -> None:
    manifest_path = os.getenv("INTEGRITY_MANIFEST_OUT", "/build/integrity.json")
    signature_path = os.getenv("INTEGRITY_SIGNATURE_OUT", "/build/integrity.sig")

    manifest = IntegrityChecker.generate_manifest()
    manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()

    Path(manifest_path).parent.mkdir(parents=True, exist_ok=True)
    Path(manifest_path).write_text(manifest_bytes.decode())

    private_key = _load_private_key()
    if not private_key:
        Path(signature_path).write_text("")
        return

    signature = private_key.sign(
        manifest_bytes,
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    Path(signature_path).write_text(base64.b64encode(signature).decode())


if __name__ == "__main__":
    main()
