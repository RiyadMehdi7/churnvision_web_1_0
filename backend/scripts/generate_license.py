#!/usr/bin/env python3
"""
ChurnVision Enterprise - License Generator

INTERNAL USE ONLY - Do not distribute with customer packages.

This script generates hardware-bound license keys for customers.

Usage:
    python generate_license.py \
        --company "ACME Corp" \
        --type enterprise \
        --employees 5000 \
        --days 365 \
        --hardware-id "abc123..." \
        --installation-id "inst-1234..." \
        --features all

    # To get a customer's hardware ID, have them run:
    # docker exec churnvision-backend python -c "from app.core.hardware_fingerprint import HardwareFingerprint; print(HardwareFingerprint.generate())"
"""

import argparse
import sys
import os
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import jwt


def generate_license(
    company_name: str,
    license_type: str,
    max_employees: int,
    validity_days: int,
    hardware_id: str = None,
    installation_id: str = None,
    features: list = None,
    admin_api_key: str = None,
    openai_api_key: str = None,
    anthropic_api_key: str = None,
    google_api_key: str = None,
    secret_key: str = None,
    private_key: str = None,
    enforce_hardware: bool = True,
    enforce_installation: bool = True,
    signing_alg: str = "RS256"
) -> str:
    """Generate a signed license key"""
    signing_alg = signing_alg.upper()
    if signing_alg == "RS256":
        if not private_key:
            private_key = os.getenv("LICENSE_PRIVATE_KEY")
            if not private_key:
                key_path = os.getenv("LICENSE_PRIVATE_KEY_PATH")
                if key_path and os.path.exists(key_path):
                    private_key = open(key_path, "r").read()
        if not private_key:
            raise RuntimeError("Missing LICENSE_PRIVATE_KEY for RS256 signing.")
        signing_key = private_key.replace("\\n", "\n")
    else:
        if not secret_key:
            secret_key = os.getenv(
                "LICENSE_SECRET_KEY",
                "churnvision-enterprise-secret-2024"
            )
        signing_key = secret_key

    now = datetime.utcnow()
    expires_at = now + timedelta(days=validity_days)

    payload = {
        "license_id": f"{company_name}-{now.strftime('%Y%m%d')}",
        "company_name": company_name,
        "license_type": license_type,
        "max_employees": max_employees,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "features": features or ["all"],
        "hardware_id": hardware_id,
        "enforce_hardware": enforce_hardware,
        "installation_id": installation_id,
        "enforce_installation": enforce_installation,
        # Additional metadata
        "version": "1.0",
        "issuer": "ChurnVision Enterprise",
    }

    llm_api_keys = {}
    if openai_api_key:
        llm_api_keys["openai"] = openai_api_key
    if anthropic_api_key:
        llm_api_keys["anthropic"] = anthropic_api_key
    if google_api_key:
        llm_api_keys["google"] = google_api_key
    if llm_api_keys:
        payload["llm_api_keys"] = llm_api_keys
    if admin_api_key:
        payload["admin_api_key"] = admin_api_key

    license_key = jwt.encode(payload, signing_key, algorithm=signing_alg)
    return license_key


def main():
    parser = argparse.ArgumentParser(
        description="Generate ChurnVision Enterprise license keys"
    )
    parser.add_argument(
        "--company", "-c",
        required=True,
        help="Customer company name"
    )
    parser.add_argument(
        "--type", "-t",
        choices=["trial", "starter", "pro", "enterprise"],
        default="enterprise",
        help="License type (default: enterprise)"
    )
    parser.add_argument(
        "--employees", "-e",
        type=int,
        default=10000,
        help="Maximum employees allowed (default: 10000)"
    )
    parser.add_argument(
        "--days", "-d",
        type=int,
        default=365,
        help="License validity in days (default: 365)"
    )
    parser.add_argument(
        "--hardware-id", "-hw",
        help="Hardware fingerprint to bind license to"
    )
    parser.add_argument(
        "--installation-id", "-i",
        help="Installation ID to bind license to"
    )
    parser.add_argument(
        "--no-hardware-lock",
        action="store_true",
        help="Don't enforce hardware binding (not recommended)"
    )
    parser.add_argument(
        "--no-installation-lock",
        action="store_true",
        help="Don't enforce installation binding (not recommended)"
    )
    parser.add_argument(
        "--features", "-f",
        nargs="+",
        default=["all"],
        help="Enabled features (default: all)"
    )
    parser.add_argument(
        "--admin-api-key",
        help="Admin Panel API key for this tenant (embedded in license)"
    )
    parser.add_argument(
        "--openai-key",
        help="OpenAI API key to embed in the license (optional)"
    )
    parser.add_argument(
        "--anthropic-key",
        help="Anthropic API key to embed in the license (optional)"
    )
    parser.add_argument(
        "--google-key",
        help="Google API key to embed in the license (optional)"
    )
    parser.add_argument(
        "--signing-alg", "-a",
        default="RS256",
        choices=["HS256", "RS256"],
        help="Signing algorithm (default: RS256)"
    )
    parser.add_argument(
        "--secret-key", "-s",
        help="Secret key for signing (uses env var if not provided)"
    )
    parser.add_argument(
        "--private-key", "-p",
        help="Private key for RS256 signing (uses env var if not provided)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Output file path (prints to stdout if not specified)"
    )

    args = parser.parse_args()

    # Validate
    if not args.no_hardware_lock and not args.hardware_id:
        print("WARNING: No hardware ID provided. License will work on any machine.")
        print("For production, get the customer's hardware ID first:")
        print('  docker exec churnvision-backend python -c "from app.core.hardware_fingerprint import HardwareFingerprint; print(HardwareFingerprint.generate())"')
        print()
        response = input("Continue without hardware binding? [y/N]: ")
        if response.lower() != "y":
            sys.exit(1)

    # Generate license
    license_key = generate_license(
        company_name=args.company,
        license_type=args.type,
        max_employees=args.employees,
        validity_days=args.days,
        hardware_id=args.hardware_id,
        installation_id=args.installation_id,
        features=args.features,
        admin_api_key=args.admin_api_key,
        openai_api_key=args.openai_key,
        anthropic_api_key=args.anthropic_key,
        google_api_key=args.google_key,
        secret_key=args.secret_key,
        private_key=args.private_key,
        enforce_hardware=not args.no_hardware_lock,
        enforce_installation=not args.no_installation_lock,
        signing_alg=args.signing_alg
    )

    # Output
    if args.output:
        with open(args.output, "w") as f:
            f.write(license_key)
        print(f"License saved to: {args.output}")
    else:
        print("\n" + "=" * 60)
        print("LICENSE KEY")
        print("=" * 60)
        print(license_key)
        print("=" * 60)

    # Print summary
    print(f"\nLicense Details:")
    print(f"  Company:      {args.company}")
    print(f"  Type:         {args.type}")
    print(f"  Max Employees:{args.employees}")
    print(f"  Valid For:    {args.days} days")
    print(f"  Features:     {', '.join(args.features)}")
    print(f"  Hardware Lock:{not args.no_hardware_lock}")
    if args.hardware_id:
        print(f"  Hardware ID:  {args.hardware_id[:16]}...")


if __name__ == "__main__":
    main()
