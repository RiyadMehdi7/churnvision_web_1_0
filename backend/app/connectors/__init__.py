"""
HRIS/HCM Connectors Package

This package provides a connector framework for integrating with external
HR Information Systems (HRIS) and Human Capital Management (HCM) platforms.

Supported Platforms (by priority):
- P1 (Enterprise): Workday, SAP SuccessFactors, Oracle HCM, ADP Workforce Now
- P2 (Mid-Market): BambooHR, Paychex, Paylocity, Gusto, Rippling, Ceridian, UKG
- P3 (SMB/Other): Personio, HiBob, Namely, Zenefits, Deel, Remote.com
- Collaboration: Slack (Metadata), Microsoft Teams (Metadata)
"""

from app.connectors.base import (
    HRConnectorBase,
    ConnectorCredentials,
    ConnectionTestResult,
    SyncResult,
    FieldMapping,
    ConnectorCapability,
    ConnectorRegistry
)

# Import concrete implementations (they auto-register via decorator)
from app.connectors.bamboohr import BambooHRConnector
from app.connectors.slack_metadata import SlackMetadataConnector
from app.connectors.teams_metadata import TeamsMetadataConnector

__all__ = [
    # Base classes
    "HRConnectorBase",
    "ConnectorCredentials",
    "ConnectionTestResult",
    "SyncResult",
    "FieldMapping",
    "ConnectorCapability",
    "ConnectorRegistry",
    # Concrete implementations
    "BambooHRConnector",
    "SlackMetadataConnector",
    "TeamsMetadataConnector",
]
