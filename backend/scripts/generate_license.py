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
    features: list = None,
    secret_key: str = None,
    enforce_hardware: bool = True
) -> str:
    """Generate a signed license key"""

    if not secret_key:
        secret_key = os.getenv(
            "LICENSE_SECRET_KEY",
            "churnvision-enterprise-secret-2024"
        )

    now = datetime.utcnow()
    expires_at = now + timedelta(days=validity_days)

    payload = {
        "company_name": company_name,
        "license_type": license_type,
        "max_employees": max_employees,
        "issued_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "features": features or ["all"],
        "hardware_id": hardware_id,
        "enforce_hardware": enforce_hardware,
        # Additional metadata
        "version": "1.0",
        "issuer": "ChurnVision Enterprise",
    }

    license_key = jwt.encode(payload, secret_key, algorithm="HS256")
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
        "--no-hardware-lock",
        action="store_true",
        help="Don't enforce hardware binding (not recommended)"
    )
    parser.add_argument(
        "--features", "-f",
        nargs="+",
        default=["all"],
        help="Enabled features (default: all)"
    )
    parser.add_argument(
        "--secret-key", "-s",
        help="Secret key for signing (uses env var if not provided)"
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
        features=args.features,
        secret_key=args.secret_key,
        enforce_hardware=not args.no_hardware_lock
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
