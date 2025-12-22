"""
Base Connector Interface

Abstract base class and supporting types for all HRIS/HCM connectors.
All connector implementations must inherit from HRConnectorBase.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Type
from enum import Enum
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class AuthType(str, Enum):
    """Authentication types supported by connectors"""
    OAUTH2 = "oauth2"
    API_KEY = "api_key"
    BASIC = "basic"
    TOKEN = "token"


class ConnectorCategory(str, Enum):
    """Categories of connector platforms"""
    HRIS = "hris"
    HCM = "hcm"
    PAYROLL = "payroll"
    COLLABORATION = "collaboration"
    ATS = "ats"


class SyncStatus(str, Enum):
    """Status of sync operations"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


@dataclass
class ConnectorCredentials:
    """Credentials for connector authentication"""
    connector_type: str
    auth_type: AuthType

    # OAuth2 credentials
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None

    # API Key credentials
    api_key: Optional[str] = None

    # Basic auth credentials
    username: Optional[str] = None
    password: Optional[str] = None

    # Connection details
    api_endpoint: Optional[str] = None
    tenant_id: Optional[str] = None

    # Additional provider-specific fields
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectionTestResult:
    """Result of testing a connector's connection"""
    success: bool
    message: str
    latency_ms: Optional[float] = None
    api_version: Optional[str] = None
    permissions: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    tested_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class FieldMapping:
    """Mapping between source field and ChurnVision field"""
    source_field: str
    target_field: str
    transform: Optional[str] = None  # Optional transformation function name
    required: bool = False
    default_value: Any = None


@dataclass
class SyncResult:
    """Result of a data sync operation"""
    success: bool
    status: SyncStatus
    records_fetched: int = 0
    records_created: int = 0
    records_updated: int = 0
    records_failed: int = 0
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration_seconds: float = 0


@dataclass
class ConnectorCapability:
    """Describes a connector's capabilities"""
    connector_type: str
    display_name: str
    category: ConnectorCategory
    auth_type: AuthType
    description: str

    # Features
    supports_incremental_sync: bool = False
    supports_webhooks: bool = False
    supports_custom_fields: bool = False
    supports_org_chart: bool = False

    # Required scopes (for OAuth2)
    required_scopes: List[str] = field(default_factory=list)

    # Field mappings available
    available_fields: List[str] = field(default_factory=list)

    # Setup requirements
    setup_instructions: Optional[str] = None
    documentation_url: Optional[str] = None

    # Status
    is_enabled: bool = True
    is_beta: bool = False


class HRConnectorBase(ABC):
    """
    Abstract base class for all HRIS/HCM connectors.

    Each connector implementation must implement all abstract methods
    to provide a consistent interface for data synchronization.
    """

    # Class-level connector metadata
    CONNECTOR_TYPE: str = "base"
    DISPLAY_NAME: str = "Base Connector"
    CATEGORY: ConnectorCategory = ConnectorCategory.HRIS
    AUTH_TYPE: AuthType = AuthType.API_KEY
    DESCRIPTION: str = "Base connector class"

    def __init__(self, credentials: ConnectorCredentials):
        """
        Initialize the connector with credentials.

        Args:
            credentials: Authentication credentials for the platform
        """
        self.credentials = credentials
        self._is_authenticated = False
        self._last_auth_time: Optional[datetime] = None

    @property
    def is_authenticated(self) -> bool:
        """Check if the connector is currently authenticated."""
        return self._is_authenticated

    @abstractmethod
    async def authenticate(self) -> bool:
        """
        Authenticate with the platform.

        Returns:
            True if authentication successful, False otherwise
        """
        pass

    @abstractmethod
    async def refresh_auth(self) -> bool:
        """
        Refresh authentication tokens if needed.

        Returns:
            True if refresh successful or not needed, False on failure
        """
        pass

    @abstractmethod
    async def test_connection(self) -> ConnectionTestResult:
        """
        Test the connection to the platform.

        Returns:
            ConnectionTestResult with success status and details
        """
        pass

    @abstractmethod
    async def fetch_employees(
        self,
        filters: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[List[FieldMapping]] = None,
        incremental_since: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch employee data from the platform.

        Args:
            filters: Optional filters to apply (e.g., department, status)
            field_mapping: Optional custom field mappings
            incremental_since: For incremental sync, fetch only changes since this time

        Returns:
            List of employee records in ChurnVision format
        """
        pass

    @abstractmethod
    async def get_schema(self) -> Dict[str, Any]:
        """
        Get the available fields/schema from the platform.

        Returns:
            Dictionary describing available fields and their types
        """
        pass

    @abstractmethod
    def get_required_scopes(self) -> List[str]:
        """
        Get the required OAuth2 scopes for this connector.

        Returns:
            List of scope strings
        """
        pass

    def get_capability(self) -> ConnectorCapability:
        """
        Get the capability description for this connector.

        Returns:
            ConnectorCapability describing features and requirements
        """
        return ConnectorCapability(
            connector_type=self.CONNECTOR_TYPE,
            display_name=self.DISPLAY_NAME,
            category=self.CATEGORY,
            auth_type=self.AUTH_TYPE,
            description=self.DESCRIPTION,
            required_scopes=self.get_required_scopes()
        )

    def get_default_field_mapping(self) -> List[FieldMapping]:
        """
        Get the default field mapping for this connector.

        Returns:
            List of default FieldMapping objects
        """
        return [
            FieldMapping(source_field="id", target_field="hr_code", required=True),
            FieldMapping(source_field="full_name", target_field="full_name"),
            FieldMapping(source_field="department", target_field="structure_name"),
            FieldMapping(source_field="job_title", target_field="position"),
            FieldMapping(source_field="employment_status", target_field="status"),
            FieldMapping(source_field="hire_date", target_field="tenure", transform="date_to_tenure"),
            FieldMapping(source_field="annual_salary", target_field="employee_cost"),
            FieldMapping(source_field="manager_id", target_field="manager_id"),
            FieldMapping(source_field="termination_date", target_field="termination_date"),
        ]

    async def sync(
        self,
        field_mapping: Optional[List[FieldMapping]] = None,
        incremental: bool = False,
        last_sync_time: Optional[datetime] = None
    ) -> SyncResult:
        """
        Perform a full sync operation.

        Args:
            field_mapping: Custom field mappings (uses default if None)
            incremental: Whether to do incremental sync
            last_sync_time: For incremental sync, the last successful sync time

        Returns:
            SyncResult with sync statistics
        """
        result = SyncResult(success=False, status=SyncStatus.IN_PROGRESS)

        try:
            # Ensure authentication
            if not self.is_authenticated:
                if not await self.authenticate():
                    result.status = SyncStatus.FAILED
                    result.errors.append("Authentication failed")
                    return result

            # Fetch employees
            incremental_since = last_sync_time if incremental else None
            employees = await self.fetch_employees(
                field_mapping=field_mapping or self.get_default_field_mapping(),
                incremental_since=incremental_since
            )

            result.records_fetched = len(employees)
            result.success = True
            result.status = SyncStatus.COMPLETED
            result.completed_at = datetime.utcnow()
            result.duration_seconds = (result.completed_at - result.started_at).total_seconds()

        except Exception as e:
            logger.error(f"Sync failed for {self.CONNECTOR_TYPE}: {e}")
            result.status = SyncStatus.FAILED
            result.errors.append(str(e))
            result.completed_at = datetime.utcnow()

        return result


class ConnectorRegistry:
    """
    Registry of available connector implementations.

    Use this to discover and instantiate connectors dynamically.
    """

    _connectors: Dict[str, Type[HRConnectorBase]] = {}

    @classmethod
    def register(cls, connector_class: Type[HRConnectorBase]) -> Type[HRConnectorBase]:
        """
        Register a connector class.

        Can be used as a decorator:
            @ConnectorRegistry.register
            class MyConnector(HRConnectorBase):
                ...
        """
        cls._connectors[connector_class.CONNECTOR_TYPE] = connector_class
        logger.info(f"Registered connector: {connector_class.CONNECTOR_TYPE}")
        return connector_class

    @classmethod
    def get(cls, connector_type: str) -> Optional[Type[HRConnectorBase]]:
        """Get a connector class by type."""
        return cls._connectors.get(connector_type)

    @classmethod
    def list_all(cls) -> List[str]:
        """List all registered connector types."""
        return list(cls._connectors.keys())

    @classmethod
    def get_all_capabilities(cls) -> List[ConnectorCapability]:
        """Get capabilities for all registered connectors."""
        capabilities = []
        for connector_type, connector_class in cls._connectors.items():
            # Create a dummy instance to get capability
            # In practice, you'd cache this
            try:
                dummy_creds = ConnectorCredentials(
                    connector_type=connector_type,
                    auth_type=connector_class.AUTH_TYPE
                )
                instance = connector_class(dummy_creds)
                capabilities.append(instance.get_capability())
            except Exception as e:
                logger.warning(f"Could not get capability for {connector_type}: {e}")
        return capabilities

    @classmethod
    def create(
        cls,
        connector_type: str,
        credentials: ConnectorCredentials
    ) -> Optional[HRConnectorBase]:
        """
        Create an instance of a connector.

        Args:
            connector_type: The type of connector to create
            credentials: Authentication credentials

        Returns:
            Connector instance or None if type not found
        """
        connector_class = cls.get(connector_type)
        if connector_class is None:
            logger.error(f"Unknown connector type: {connector_type}")
            return None

        return connector_class(credentials)


# Pre-defined connector metadata for UI display (before implementation)
AVAILABLE_CONNECTORS = [
    {
        "connector_type": "workday",
        "display_name": "Workday",
        "category": "hcm",
        "auth_type": "oauth2",
        "description": "Connect to Workday HCM for employee data synchronization",
        "priority": "P1",
        "status": "planned"
    },
    {
        "connector_type": "sap_successfactors",
        "display_name": "SAP SuccessFactors",
        "category": "hcm",
        "auth_type": "oauth2",
        "description": "Connect to SAP SuccessFactors Employee Central",
        "priority": "P1",
        "status": "planned"
    },
    {
        "connector_type": "oracle_hcm",
        "display_name": "Oracle HCM Cloud",
        "category": "hcm",
        "auth_type": "oauth2",
        "description": "Connect to Oracle HCM Cloud for workforce data",
        "priority": "P1",
        "status": "planned"
    },
    {
        "connector_type": "adp_workforce",
        "display_name": "ADP Workforce Now",
        "category": "hris",
        "auth_type": "oauth2",
        "description": "Connect to ADP Workforce Now for HR and payroll data",
        "priority": "P1",
        "status": "planned"
    },
    {
        "connector_type": "bamboohr",
        "display_name": "BambooHR",
        "category": "hris",
        "auth_type": "api_key",
        "description": "Connect to BambooHR for employee management data",
        "priority": "P2",
        "status": "available"
    },
    {
        "connector_type": "paychex",
        "display_name": "Paychex Flex",
        "category": "payroll",
        "auth_type": "oauth2",
        "description": "Connect to Paychex Flex for payroll and HR data",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "paylocity",
        "display_name": "Paylocity",
        "category": "payroll",
        "auth_type": "oauth2",
        "description": "Connect to Paylocity for workforce management",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "gusto",
        "display_name": "Gusto",
        "category": "payroll",
        "auth_type": "oauth2",
        "description": "Connect to Gusto for HR, payroll, and benefits",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "rippling",
        "display_name": "Rippling",
        "category": "hris",
        "auth_type": "oauth2",
        "description": "Connect to Rippling for unified HR platform",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "ceridian_dayforce",
        "display_name": "Ceridian Dayforce",
        "category": "hcm",
        "auth_type": "oauth2",
        "description": "Connect to Ceridian Dayforce HCM",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "ukg_pro",
        "display_name": "UKG Pro",
        "category": "hcm",
        "auth_type": "oauth2",
        "description": "Connect to UKG Pro (Ultimate Kronos Group)",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "personio",
        "display_name": "Personio",
        "category": "hris",
        "auth_type": "api_key",
        "description": "Connect to Personio for HR management (EU-focused)",
        "priority": "P3",
        "status": "planned"
    },
    {
        "connector_type": "hibob",
        "display_name": "HiBob",
        "category": "hris",
        "auth_type": "token",
        "description": "Connect to HiBob for modern HR platform",
        "priority": "P3",
        "status": "planned"
    },
    {
        "connector_type": "namely",
        "display_name": "Namely",
        "category": "hris",
        "auth_type": "oauth2",
        "description": "Connect to Namely for HR, payroll, and benefits",
        "priority": "P3",
        "status": "planned"
    },
    {
        "connector_type": "zenefits",
        "display_name": "Zenefits",
        "category": "hris",
        "auth_type": "oauth2",
        "description": "Connect to Zenefits for people operations",
        "priority": "P3",
        "status": "planned"
    },
    {
        "connector_type": "deel",
        "display_name": "Deel",
        "category": "hris",
        "auth_type": "api_key",
        "description": "Connect to Deel for global hiring and payroll",
        "priority": "P3",
        "status": "planned"
    },
    {
        "connector_type": "remote",
        "display_name": "Remote.com",
        "category": "hris",
        "auth_type": "oauth2",
        "description": "Connect to Remote for global employment",
        "priority": "P3",
        "status": "planned"
    },
    # Collaboration platforms
    {
        "connector_type": "slack",
        "display_name": "Slack (Metadata)",
        "category": "collaboration",
        "auth_type": "oauth2",
        "description": "Fetch behavioral metadata from Slack (no message content)",
        "priority": "P2",
        "status": "planned"
    },
    {
        "connector_type": "microsoft_teams",
        "display_name": "Microsoft Teams (Metadata)",
        "category": "collaboration",
        "auth_type": "oauth2",
        "description": "Fetch behavioral metadata from Teams (no message content)",
        "priority": "P2",
        "status": "planned"
    },
]
