"""
Field-level encryption utilities for sensitive data.
Uses Fernet symmetric encryption with key rotation support.
"""

import base64
import logging
import os
import secrets
from typing import Optional, Union

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings

logger = logging.getLogger("churnvision.encryption")


class EncryptionError(Exception):
    """Raised when encryption/decryption fails."""
    pass


class FieldEncryptor:
    """
    Handles field-level encryption for sensitive data.

    Supports:
    - AES-256 encryption via Fernet
    - Key rotation with multiple active keys
    - Automatic salt handling
    - Secure key derivation from master password

    Usage:
        encryptor = FieldEncryptor()
        encrypted = encryptor.encrypt("sensitive data")
        decrypted = encryptor.decrypt(encrypted)
    """

    _instance: Optional["FieldEncryptor"] = None
    _fernet: Optional[Union[Fernet, MultiFernet]] = None

    def __new__(cls) -> "FieldEncryptor":
        """Singleton pattern to ensure consistent encryption across the app."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self) -> None:
        """Initialize the encryption keys."""
        # Get encryption key from settings or environment
        encryption_key = getattr(settings, "ENCRYPTION_KEY", None) or os.getenv("ENCRYPTION_KEY")

        if not encryption_key:
            # In development, generate a warning and use a derived key
            if settings.ENVIRONMENT.lower() != "production":
                logger.warning(
                    "ENCRYPTION_KEY not set. Using derived key from SECRET_KEY. "
                    "Set ENCRYPTION_KEY in production for proper security."
                )
                encryption_key = self._derive_key_from_secret(settings.SECRET_KEY)
            else:
                raise EncryptionError(
                    "ENCRYPTION_KEY must be set in production. "
                    "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )

        # Support multiple keys for rotation (comma-separated)
        keys = [k.strip() for k in encryption_key.split(",") if k.strip()]

        if len(keys) == 1:
            self._fernet = Fernet(keys[0].encode() if isinstance(keys[0], str) else keys[0])
        else:
            # MultiFernet allows decryption with any key but encrypts with the first
            fernets = [Fernet(k.encode() if isinstance(k, str) else k) for k in keys]
            self._fernet = MultiFernet(fernets)

        logger.info(f"Field encryption initialized with {len(keys)} key(s)")

    def _derive_key_from_secret(self, secret: str) -> str:
        """Derive a Fernet key from the SECRET_KEY using PBKDF2."""
        # Use a fixed salt for development (in production, use ENCRYPTION_KEY directly)
        salt = b"churnvision_dev_salt_v1"
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(secret.encode()))
        return key.decode()

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a string value.

        Args:
            plaintext: The string to encrypt

        Returns:
            Base64-encoded encrypted string

        Raises:
            EncryptionError: If encryption fails
        """
        if not plaintext:
            return plaintext

        try:
            encrypted = self._fernet.encrypt(plaintext.encode())
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise EncryptionError(f"Failed to encrypt data: {e}")

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt an encrypted string value.

        Args:
            ciphertext: The encrypted string to decrypt

        Returns:
            Original plaintext string

        Raises:
            EncryptionError: If decryption fails
        """
        if not ciphertext:
            return ciphertext

        try:
            decrypted = self._fernet.decrypt(ciphertext.encode())
            return decrypted.decode()
        except InvalidToken:
            logger.error("Decryption failed: Invalid token (wrong key or corrupted data)")
            raise EncryptionError("Failed to decrypt data: Invalid encryption key or corrupted data")
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise EncryptionError(f"Failed to decrypt data: {e}")

    def encrypt_float(self, value: float) -> str:
        """Encrypt a float value (e.g., salary)."""
        return self.encrypt(str(value))

    def decrypt_float(self, ciphertext: str) -> float:
        """Decrypt to a float value."""
        return float(self.decrypt(ciphertext))

    def is_encrypted(self, value: str) -> bool:
        """
        Check if a value appears to be encrypted.
        Fernet tokens have a specific format starting with 'gAAAAA'.
        """
        if not value or len(value) < 10:
            return False
        return value.startswith("gAAAAA")

    @staticmethod
    def generate_key() -> str:
        """Generate a new Fernet encryption key."""
        return Fernet.generate_key().decode()


# Global encryptor instance
_encryptor: Optional[FieldEncryptor] = None


def get_encryptor() -> FieldEncryptor:
    """Get the global field encryptor instance."""
    global _encryptor
    if _encryptor is None:
        _encryptor = FieldEncryptor()
    return _encryptor


def encrypt_field(value: str) -> str:
    """Convenience function to encrypt a field value."""
    return get_encryptor().encrypt(value)


def decrypt_field(value: str) -> str:
    """Convenience function to decrypt a field value."""
    return get_encryptor().decrypt(value)


# SQLAlchemy type for encrypted fields
from sqlalchemy import TypeDecorator, String


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy type that automatically encrypts/decrypts string values.

    Usage:
        class Employee(Base):
            salary = Column(EncryptedString(255))  # Automatically encrypted
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int = 500, *args, **kwargs):
        # Encrypted values are longer than plain text
        super().__init__(length, *args, **kwargs)

    def process_bind_param(self, value, dialect):
        """Encrypt value before storing in database."""
        if value is not None:
            return get_encryptor().encrypt(str(value))
        return value

    def process_result_value(self, value, dialect):
        """Decrypt value when reading from database."""
        if value is not None:
            try:
                return get_encryptor().decrypt(value)
            except EncryptionError:
                # Return encrypted value if decryption fails (key mismatch)
                logger.warning("Failed to decrypt field value, returning encrypted data")
                return value
        return value


class EncryptedFloat(TypeDecorator):
    """
    SQLAlchemy type that automatically encrypts/decrypts float values.

    Usage:
        class Employee(Base):
            salary = Column(EncryptedFloat())  # Stores encrypted, returns float
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int = 500, *args, **kwargs):
        super().__init__(length, *args, **kwargs)

    def process_bind_param(self, value, dialect):
        """Encrypt float value before storing in database."""
        if value is not None:
            return get_encryptor().encrypt(str(float(value)))
        return value

    def process_result_value(self, value, dialect):
        """Decrypt and convert to float when reading from database."""
        if value is not None:
            try:
                decrypted = get_encryptor().decrypt(value)
                return float(decrypted)
            except (EncryptionError, ValueError):
                # If it's not encrypted (legacy data), try to return as-is
                try:
                    return float(value)
                except ValueError:
                    logger.warning(f"Cannot convert field value to float: {value[:20]}...")
                    return None
        return value
