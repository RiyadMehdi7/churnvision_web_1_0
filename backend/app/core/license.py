"""
License Key Validation System for ChurnVision Enterprise

This module handles on-premise license validation using JWT-signed keys.
Includes hardware fingerprinting to prevent license sharing.
"""

import hmac
import json
import os
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.hardware_fingerprint import HardwareFingerprint
from app.core.installation import get_installation_id

class LicenseInfo(BaseModel):
    """License information model"""
    company_name: str
    license_type: str  # "trial", "standard", "enterprise"
    max_employees: int
    issued_at: datetime
    expires_at: datetime
    features: list[str]
    license_id: Optional[str] = None
    installation_id: Optional[str] = None
    hardware_id: Optional[str] = None
    enforce_hardware: bool = True  # Whether to enforce hardware binding


class LicenseValidator:
    """
    License validation service for on-premise deployments.

    Dev Mode: Uses dummy validation
    Prod Mode: Validates signed JWT from /etc/churnvision/license.key
    """

    _cache_ttl_seconds = int(os.getenv("LICENSE_CACHE_TTL_SECONDS", settings.LICENSE_CACHE_TTL_SECONDS))
    _cached_info: Optional[LicenseInfo] = None
    _cached_at: Optional[datetime] = None
    _cached_license_hash: Optional[str] = None

    # License file paths
    PROD_LICENSE_PATH = Path("/etc/churnvision/license.key")
    DEV_LICENSE_PATH = Path("./license.key")

    @classmethod
    def _is_dev_mode(cls) -> bool:
        """
        Determine if we are running in development.

        Uses the app settings (preferred) and falls back to ENVIRONMENT env var so
        local/dev containers that may not export ENVIRONMENT still get dev behavior.
        """
        try:
            return settings.ENVIRONMENT.lower() == "development" or settings.DEBUG
        except Exception:
            return os.getenv("ENVIRONMENT", "development") == "development"

    @classmethod
    def get_license_path(cls) -> Path:
        """Get the appropriate license file path based on environment."""
        custom_path = os.getenv("CHURNVISION_LICENSE_PATH")
        if custom_path:
            return Path(custom_path)
        if cls._is_dev_mode():
            return cls.DEV_LICENSE_PATH
        return cls.PROD_LICENSE_PATH

    @classmethod
    def load_license(cls) -> Optional[str]:
        """Load license key from file"""
        # Highest priority: environment variable
        env_license_key = os.getenv("LICENSE_KEY")
        if env_license_key:
            return env_license_key.strip()

        license_path = cls.get_license_path()

        if not license_path.exists():
            return None

        try:
            return license_path.read_text().strip()
        except Exception as e:
            print(f"Error reading license file: {e}")
            return None

    @classmethod
    def save_license(cls, license_key: str) -> None:
        """Persist a license key to the active license path."""
        license_path = cls.get_license_path()
        try:
            license_path.parent.mkdir(parents=True, exist_ok=True)
            license_path.write_text(license_key.strip())
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist license key: {e}"
            )

    @classmethod
    def _signing_alg(cls) -> str:
        alg = os.getenv("LICENSE_SIGNING_ALG", settings.LICENSE_SIGNING_ALG)
        return (alg or "HS256").upper()

    @classmethod
    def _normalize_public_key(cls, key: str) -> str:
        return key.replace("\\n", "\n").strip()

    @classmethod
    def _get_public_key(cls) -> str:
        key = os.getenv("LICENSE_PUBLIC_KEY") or settings.LICENSE_PUBLIC_KEY
        if key:
            return cls._normalize_public_key(key)
        key_path = os.getenv("LICENSE_PUBLIC_KEY_PATH") or settings.LICENSE_PUBLIC_KEY_PATH
        if key_path:
            try:
                return cls._normalize_public_key(Path(key_path).read_text())
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to read LICENSE_PUBLIC_KEY_PATH: {exc}"
                )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing LICENSE_PUBLIC_KEY for RS256 license validation."
        )

    @classmethod
    def _get_verification_key(cls, signing_alg: str) -> str:
        if signing_alg == "RS256":
            return cls._get_public_key()
        secret = os.getenv("LICENSE_SECRET_KEY") or settings.LICENSE_SECRET_KEY
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing LICENSE_SECRET_KEY for HS256 license validation."
            )
        return secret

    @classmethod
    def _license_state_path(cls) -> Path:
        path = os.getenv("LICENSE_STATE_PATH", settings.LICENSE_STATE_PATH)
        return Path(path)

    @classmethod
    def _license_hash(cls, license_key: str) -> str:
        return hashlib.sha256(license_key.encode()).hexdigest()

    @classmethod
    def _state_signing_key(cls, license_key: str, installation_id: str) -> bytes:
        fingerprint = HardwareFingerprint.generate()
        raw = f"{license_key}|{installation_id}|{fingerprint}".encode()
        return hashlib.sha256(raw).digest()

    @classmethod
    def _sign_state(cls, state: Dict[str, Any], key: bytes) -> str:
        payload = json.dumps(state, sort_keys=True, separators=(",", ":")).encode()
        return hmac.new(key, payload, hashlib.sha256).hexdigest()

    @classmethod
    def _load_license_state(cls) -> Optional[Dict[str, Any]]:
        path = cls._license_state_path()
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except Exception:
            return None

    @classmethod
    def _persist_license_state(cls, state: Dict[str, Any]) -> None:
        path = cls._license_state_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(state, sort_keys=True))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist license state: {exc}"
            )

    @classmethod
    def _enforce_license_state(cls, license_key: str, installation_id: str) -> None:
        """Detect clock rollback or tampering using a signed state file."""
        is_prod = settings.ENVIRONMENT.lower() == "production"
        if not is_prod:
            return

        now = datetime.utcnow()
        existing = cls._load_license_state()
        license_hash = cls._license_hash(license_key)
        key = cls._state_signing_key(license_key, installation_id)

        if existing:
            signature = existing.pop("signature", None)
            expected = cls._sign_state(existing, key)
            if signature != expected:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="License state tampering detected. Please reinstall."
                )

            last_seen_raw = existing.get("last_validated_at")
            if last_seen_raw:
                try:
                    last_seen = datetime.fromisoformat(last_seen_raw)
                    skew = settings.LICENSE_MAX_CLOCK_SKEW_SECONDS
                    if now.timestamp() + skew < last_seen.timestamp():
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="System clock rollback detected. License validation failed."
                        )
                except ValueError:
                    pass

            if existing.get("license_hash") != license_hash:
                existing = None

        state = {
            "license_hash": license_hash,
            "last_validated_at": now.isoformat(),
        }
        state["signature"] = cls._sign_state(state, key)
        cls._persist_license_state(state)

    @classmethod
    def decode_license(cls, license_key: str) -> LicenseInfo:
        """
        Decode and validate a JWT license key

        Args:
            license_key: The JWT license key string

        Returns:
            LicenseInfo object with decoded license information

        Raises:
            HTTPException: If license is invalid or expired
        """
        try:
            signing_alg = cls._signing_alg()
            verification_key = cls._get_verification_key(signing_alg)

            # Decode JWT
            payload = jwt.decode(
                license_key,
                verification_key,
                algorithms=[signing_alg]
            )

            # Parse dates
            issued_at = datetime.fromisoformat(payload["issued_at"])
            expires_at = datetime.fromisoformat(payload["expires_at"])

            # Check expiration
            if datetime.utcnow() > expires_at:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="License has expired. Please contact support."
                )

            is_prod = settings.ENVIRONMENT.lower() == "production"
            license_installation_id = payload.get("installation_id")
            license_hardware_id = payload.get("hardware_id")
            enforce_hardware = payload.get("enforce_hardware", True)
            enforce_installation = payload.get("enforce_installation", True)

            if is_prod and settings.LICENSE_REQUIRE_INSTALLATION_ID and not license_installation_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="License is missing installation binding."
                )
            if is_prod and settings.LICENSE_REQUIRE_HARDWARE and not license_hardware_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="License is missing hardware binding."
                )
            if is_prod and settings.LICENSE_REQUIRE_HARDWARE and not enforce_hardware:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Hardware binding is required in production."
                )
            if is_prod and settings.LICENSE_REQUIRE_INSTALLATION_ID and not enforce_installation:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Installation binding is required in production."
                )

            if enforce_installation and license_installation_id:
                current_installation_id = get_installation_id()
                if current_installation_id != license_installation_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="License is bound to a different installation."
                    )

            if enforce_hardware and license_hardware_id:
                current_fingerprint = HardwareFingerprint.generate()
                if not HardwareFingerprint.verify(license_hardware_id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            "License is bound to a different machine. "
                            f"Expected: {license_hardware_id[:16]}..., "
                            f"Current: {current_fingerprint[:16]}..."
                        )
                    )

            # Create LicenseInfo object
            license_info = LicenseInfo(
                company_name=payload["company_name"],
                license_type=payload["license_type"],
                max_employees=payload["max_employees"],
                issued_at=issued_at,
                expires_at=expires_at,
                features=payload.get("features", []),
                license_id=payload.get("license_id"),
                installation_id=license_installation_id,
                hardware_id=license_hardware_id,
                enforce_hardware=enforce_hardware
            )

            return license_info

        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="License has expired"
            )
        except jwt.InvalidTokenError as e:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Invalid license key: {str(e)}"
            )
        except KeyError as e:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Malformed license key: missing {str(e)}"
            )

    @classmethod
    def validate_license(cls) -> LicenseInfo:
        """
        Validate the current license

        Returns:
            LicenseInfo object if valid

        Raises:
            HTTPException: If license is missing, invalid, or expired
        """
        # Load license from file if present
        license_key = cls.load_license()

        # In dev mode, allow running without a signed key or with the placeholder dev key
        if cls._is_dev_mode() and (not license_key or license_key.strip() == "dev-license-key"):
            return LicenseInfo(
                company_name="Development Admin",
                license_type="enterprise",
                max_employees=999999,
                issued_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=365),
                features=["all"]
            )

        if not license_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No license key found. Please install a valid license."
            )

        license_hash = cls._license_hash(license_key)
        if cls._cached_info and cls._cached_at and cls._cached_license_hash == license_hash:
            age = (datetime.utcnow() - cls._cached_at).total_seconds()
            if age < cls._cache_ttl_seconds:
                return cls._cached_info

        license_info = cls.decode_license(license_key)
        installation_id = license_info.installation_id or get_installation_id()
        cls._enforce_license_state(license_key, installation_id)

        cls._cached_info = license_info
        cls._cached_at = datetime.utcnow()
        cls._cached_license_hash = license_hash
        return license_info

    @classmethod
    def generate_license(
        cls,
        company_name: str,
        license_type: str,
        max_employees: int,
        validity_days: int = 365,
        features: Optional[list[str]] = None,
        hardware_id: Optional[str] = None,
        installation_id: Optional[str] = None,
        license_id: Optional[str] = None,
        enforce_hardware: bool = True,
        enforce_installation: bool = True,
        signing_alg: Optional[str] = None
    ) -> str:
        """
        Generate a new license key (for internal use only)

        Args:
            company_name: Name of the licensed company
            license_type: Type of license (trial, standard, enterprise)
            max_employees: Maximum number of employees allowed
            validity_days: Number of days the license is valid
            features: List of enabled features
            hardware_id: Optional hardware fingerprint
            installation_id: Optional installation binding
            license_id: Optional license identifier
            enforce_hardware: Whether to require hardware binding
            enforce_installation: Whether to require installation binding
            signing_alg: Override signing algorithm (HS256/RS256)

        Returns:
            JWT license key string
        """
        now = datetime.utcnow()
        expires_at = now + timedelta(days=validity_days)
        alg = (signing_alg or cls._signing_alg()).upper()

        if alg == "RS256":
            signing_key = os.getenv("LICENSE_PRIVATE_KEY")
            if not signing_key:
                key_path = os.getenv("LICENSE_PRIVATE_KEY_PATH")
                if key_path and Path(key_path).exists():
                    signing_key = Path(key_path).read_text()
            if not signing_key:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Missing LICENSE_PRIVATE_KEY for RS256 license generation."
                )
            signing_key = cls._normalize_public_key(signing_key)
        else:
            signing_key = os.getenv("LICENSE_SECRET_KEY") or settings.LICENSE_SECRET_KEY

        payload = {
            "license_id": license_id or hashlib.sha256(f"{company_name}-{now.isoformat()}".encode()).hexdigest()[:16],
            "company_name": company_name,
            "license_type": license_type,
            "max_employees": max_employees,
            "issued_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "features": features or ["all"],
            "hardware_id": hardware_id,
            "installation_id": installation_id,
            "enforce_hardware": enforce_hardware,
            "enforce_installation": enforce_installation,
        }

        license_key = jwt.encode(payload, signing_key, algorithm=alg)
        return license_key

    @classmethod
    def check_feature(cls, feature_name: str) -> bool:
        """
        Check if a specific feature is enabled in the license

        Args:
            feature_name: Name of the feature to check

        Returns:
            True if feature is enabled, False otherwise
        """
        try:
            license_info = cls.validate_license()

            # "all" grants access to everything
            if "all" in license_info.features:
                return True

            return feature_name in license_info.features

        except HTTPException:
            return False

    @classmethod
    def get_license_info_dict(cls) -> Dict[str, Any]:
        """
        Get license information as a dictionary (for API responses)

        Returns:
            Dictionary with license information or error
        """
        try:
            license_info = cls.validate_license()
            return {
                "valid": True,
                "company_name": license_info.company_name,
                "license_type": license_info.license_type,
                "max_employees": license_info.max_employees,
                "expires_at": license_info.expires_at.isoformat(),
                "days_remaining": (license_info.expires_at - datetime.utcnow()).days,
                "features": license_info.features,
                "license_id": license_info.license_id,
                "installation_id": license_info.installation_id,
            }
        except HTTPException as e:
            return {
                "valid": False,
                "error": e.detail
            }


# Convenience function for dependency injection
def get_current_license() -> LicenseInfo:
    """
    FastAPI dependency for license validation

    Usage:
        @router.get("/protected")
        async def protected_endpoint(
            license: LicenseInfo = Depends(get_current_license)
        ):
            return {"message": f"Welcome {license.company_name}"}
    """
    return LicenseValidator.validate_license()


def require_license_tier(required_tier: str):
    """Dependency that enforces a minimum license tier."""
    tier_order = {"starter": 0, "pro": 1, "enterprise": 2}

    async def dependency(license_info: LicenseInfo = Depends(get_current_license)) -> LicenseInfo:
        tier = license_info.license_type.lower()
        if tier_order.get(tier, 0) < tier_order.get(required_tier, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{required_tier.title()} license required for this feature"
            )
        return license_info

    return dependency
