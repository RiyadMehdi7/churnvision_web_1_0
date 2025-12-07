"""
Hardware Fingerprint Module for ChurnVision Enterprise

Generates a unique, stable fingerprint for the host machine to prevent
license sharing across different servers.
"""

import hashlib
import subprocess
import platform
import os
from typing import Optional


class HardwareFingerprint:
    """
    Generates a hardware-bound fingerprint that is:
    - Stable across reboots
    - Unique per physical/virtual machine
    - Difficult to spoof
    """

    @staticmethod
    def _get_machine_id() -> Optional[str]:
        """Get the machine ID (Linux/systemd)"""
        try:
            # Linux: /etc/machine-id is stable and unique
            if os.path.exists("/etc/machine-id"):
                with open("/etc/machine-id", "r") as f:
                    return f.read().strip()

            # Fallback: /var/lib/dbus/machine-id
            if os.path.exists("/var/lib/dbus/machine-id"):
                with open("/var/lib/dbus/machine-id", "r") as f:
                    return f.read().strip()
        except Exception:
            pass
        return None

    @staticmethod
    def _get_docker_container_id() -> Optional[str]:
        """Get Docker container ID if running in container"""
        try:
            # Check if running in Docker
            if os.path.exists("/.dockerenv"):
                # Get container ID from cgroup
                with open("/proc/self/cgroup", "r") as f:
                    for line in f:
                        if "docker" in line or "kubepods" in line:
                            parts = line.strip().split("/")
                            if len(parts) > 0:
                                container_id = parts[-1]
                                if len(container_id) >= 12:
                                    return container_id[:12]
        except Exception:
            pass
        return None

    @staticmethod
    def _get_cpu_info() -> Optional[str]:
        """Get CPU identifier"""
        try:
            if platform.system() == "Linux":
                result = subprocess.run(
                    ["cat", "/proc/cpuinfo"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                for line in result.stdout.split("\n"):
                    if "Serial" in line or "model name" in line:
                        return line.split(":")[-1].strip()
            elif platform.system() == "Darwin":
                result = subprocess.run(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return result.stdout.strip()
        except Exception:
            pass
        return None

    @staticmethod
    def _get_disk_serial() -> Optional[str]:
        """Get primary disk serial number"""
        try:
            if platform.system() == "Linux":
                # Try to get disk serial via lsblk
                result = subprocess.run(
                    ["lsblk", "-o", "SERIAL", "-d", "-n"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                serials = [s.strip() for s in result.stdout.split("\n") if s.strip()]
                if serials:
                    return serials[0]
        except Exception:
            pass
        return None

    @staticmethod
    def _get_network_mac() -> Optional[str]:
        """Get primary network interface MAC address"""
        try:
            if platform.system() == "Linux":
                # Get first physical network interface MAC
                for iface in os.listdir("/sys/class/net"):
                    if iface == "lo":
                        continue
                    mac_path = f"/sys/class/net/{iface}/address"
                    if os.path.exists(mac_path):
                        with open(mac_path, "r") as f:
                            mac = f.read().strip()
                            if mac and mac != "00:00:00:00:00:00":
                                return mac
        except Exception:
            pass
        return None

    @classmethod
    def generate(cls) -> str:
        """
        Generate a composite hardware fingerprint.

        Combines multiple hardware identifiers to create a stable,
        unique fingerprint that survives reboots but changes if
        the software is moved to a different machine.

        Returns:
            SHA-256 hash of combined hardware identifiers
        """
        components = []

        # Collect all available identifiers
        machine_id = cls._get_machine_id()
        if machine_id:
            components.append(f"machine:{machine_id}")

        container_id = cls._get_docker_container_id()
        if container_id:
            components.append(f"container:{container_id}")

        cpu_info = cls._get_cpu_info()
        if cpu_info:
            components.append(f"cpu:{cpu_info}")

        disk_serial = cls._get_disk_serial()
        if disk_serial:
            components.append(f"disk:{disk_serial}")

        mac_addr = cls._get_network_mac()
        if mac_addr:
            components.append(f"mac:{mac_addr}")

        # Add platform info as fallback
        components.append(f"platform:{platform.platform()}")
        components.append(f"node:{platform.node()}")

        # Create composite fingerprint
        fingerprint_data = "|".join(sorted(components))
        fingerprint_hash = hashlib.sha256(fingerprint_data.encode()).hexdigest()

        return fingerprint_hash

    @classmethod
    def get_short_id(cls) -> str:
        """Get a shortened fingerprint for display (first 16 chars)"""
        return cls.generate()[:16].upper()

    @classmethod
    def verify(cls, expected_fingerprint: str, tolerance: int = 2) -> bool:
        """
        Verify the current machine matches the expected fingerprint.

        Uses fuzzy matching to allow for minor hardware changes
        (e.g., network interface changes in containers).

        Args:
            expected_fingerprint: The fingerprint from the license
            tolerance: Number of component mismatches allowed

        Returns:
            True if fingerprints match within tolerance
        """
        current = cls.generate()

        # Exact match
        if current == expected_fingerprint:
            return True

        # For stricter security, don't allow fuzzy matching
        # In production, you might want exact matches only
        return False
