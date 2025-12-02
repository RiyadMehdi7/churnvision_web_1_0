"""
License Key Validation System for ChurnVision Enterprise

This module handles on-premise license validation using JWT-signed keys.
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings

class LicenseInfo(BaseModel):
    """License information model"""
    company_name: str
    license_type: str  # "trial", "standard", "enterprise"
    max_employees: int
    issued_at: datetime
    expires_at: datetime
    features: list[str]
    hardware_id: Optional[str] = None


class LicenseValidator:
    """
    License validation service for on-premise deployments.

    Dev Mode: Uses dummy validation
    Prod Mode: Validates signed JWT from /etc/churnvision/license.key
    """

    # Secret key for signing licenses (should be kept secure in production)
    SECRET_KEY = os.getenv("LICENSE_SECRET_KEY", settings.LICENSE_SECRET_KEY)
    ALGORITHM = "HS256"
    ENV_LICENSE_KEY = os.getenv("LICENSE_KEY")
    CUSTOM_LICENSE_PATH = os.getenv("CHURNVISION_LICENSE_PATH")

    # License file paths
    PROD_LICENSE_PATH = Path("/etc/churnvision/license.key")
    DEV_LICENSE_PATH = Path("./license.key")

    # Environment
    IS_DEV_MODE = os.getenv("ENVIRONMENT", "development") == "development"

    @classmethod
    def get_license_path(cls) -> Path:
        """Get the appropriate license file path based on environment"""
        if cls.CUSTOM_LICENSE_PATH:
            return Path(cls.CUSTOM_LICENSE_PATH)
        if cls.IS_DEV_MODE:
            return cls.DEV_LICENSE_PATH
        return cls.PROD_LICENSE_PATH

    @classmethod
    def load_license(cls) -> Optional[str]:
        """Load license key from file"""
        # Highest priority: environment variable
        if cls.ENV_LICENSE_KEY:
            return cls.ENV_LICENSE_KEY.strip()

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
            # Decode JWT
            payload = jwt.decode(
                license_key,
                cls.SECRET_KEY,
                algorithms=[cls.ALGORITHM]
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

            # Create LicenseInfo object
            license_info = LicenseInfo(
                company_name=payload["company_name"],
                license_type=payload["license_type"],
                max_employees=payload["max_employees"],
                issued_at=issued_at,
                expires_at=expires_at,
                features=payload.get("features", []),
                hardware_id=payload.get("hardware_id")
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
        if cls.IS_DEV_MODE and (not license_key or license_key.strip() == "dev-license-key"):
            return LicenseInfo(
                company_name="Development Mode",
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

        # Decode and validate
        return cls.decode_license(license_key)

    @classmethod
    def generate_license(
        cls,
        company_name: str,
        license_type: str,
        max_employees: int,
        validity_days: int = 365,
        features: Optional[list[str]] = None,
        hardware_id: Optional[str] = None
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

        Returns:
            JWT license key string
        """
        now = datetime.utcnow()
        expires_at = now + timedelta(days=validity_days)

        payload = {
            "company_name": company_name,
            "license_type": license_type,
            "max_employees": max_employees,
            "issued_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "features": features or ["all"],
            "hardware_id": hardware_id
        }

        license_key = jwt.encode(payload, cls.SECRET_KEY, algorithm=cls.ALGORITHM)
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
                "features": license_info.features
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
