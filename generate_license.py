#!/usr/bin/env python3
"""
Generate an enterprise license key for ChurnVision
"""
import sys
import os
from datetime import datetime, timedelta

# Add the backend app to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.core.license import LicenseValidator

def main():
    # Generate an enterprise license
    license_key = LicenseValidator.generate_license(
        company_name="ChurnVision Development",
        license_type="enterprise",
        max_employees=999999,  # Unlimited
        validity_days=3650,  # 10 years
        features=["all"],  # All features enabled
        hardware_id=None  # No hardware lock
    )
    
    print("=" * 80)
    print("ChurnVision Enterprise License Generated")
    print("=" * 80)
    print(f"\nLicense Key:\n{license_key}\n")
    print("=" * 80)
    print("\nLicense Details:")
    print("  Company: ChurnVision Development")
    print("  Type: Enterprise")
    print("  Max Employees: Unlimited")
    print("  Valid For: 10 years")
    print("  Features: All features enabled")
    print("\n" + "=" * 80)
    print("\nTo use this license, set it as an environment variable:")
    print(f"  export LICENSE_KEY='{license_key}'")
    print("\nOr add it to your docker-compose.yml:")
    print(f"  - LICENSE_KEY={license_key}")
    print("=" * 80)
    
    return license_key

if __name__ == "__main__":
    main()
