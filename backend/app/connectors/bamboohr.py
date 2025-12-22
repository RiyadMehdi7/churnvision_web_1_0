"""
BambooHR Connector

Connects to BambooHR for employee data synchronization.
Uses API Key authentication (simpler than OAuth2).

API Documentation: https://documentation.bamboohr.com/reference
"""

import httpx
import base64
from datetime import datetime
from typing import Dict, List, Any, Optional
import logging

from app.connectors.base import (
    HRConnectorBase,
    ConnectorCredentials,
    ConnectionTestResult,
    FieldMapping,
    AuthType,
    ConnectorCategory,
    ConnectorRegistry
)

logger = logging.getLogger(__name__)


@ConnectorRegistry.register
class BambooHRConnector(HRConnectorBase):
    """
    BambooHR HRIS Connector

    BambooHR uses API key authentication with the key as the username
    and 'x' as the password in Basic Auth format.
    """

    CONNECTOR_TYPE = "bamboohr"
    DISPLAY_NAME = "BambooHR"
    CATEGORY = ConnectorCategory.HRIS
    AUTH_TYPE = AuthType.API_KEY
    DESCRIPTION = "Connect to BambooHR for employee management data"

    # BambooHR API base URL template
    API_BASE_URL = "https://api.bamboohr.com/api/gateway.php/{company_domain}/v1"

    # Standard employee fields available in BambooHR
    AVAILABLE_FIELDS = [
        "id", "displayName", "firstName", "lastName", "jobTitle",
        "department", "division", "location", "status", "employmentStatus",
        "employeeNumber", "hireDate", "terminationDate", "workEmail",
        "supervisor", "supervisorId", "payRate", "payType", "payPer"
    ]

    def __init__(self, credentials: ConnectorCredentials):
        super().__init__(credentials)

        # BambooHR-specific configuration
        self.company_domain = credentials.extra.get("company_domain", "")
        self.api_key = credentials.api_key or ""

        if not self.company_domain:
            logger.warning("BambooHR connector initialized without company_domain")

        # Build base URL
        self.base_url = self.API_BASE_URL.format(company_domain=self.company_domain)

        # HTTP client with auth header
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client with authentication."""
        if self._client is None or self._client.is_closed:
            # BambooHR uses API key as username with 'x' as password
            auth_string = f"{self.api_key}:x"
            auth_bytes = base64.b64encode(auth_string.encode()).decode()

            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Basic {auth_bytes}",
                    "Accept": "application/json",
                },
                timeout=30.0
            )
        return self._client

    async def authenticate(self) -> bool:
        """
        Authenticate with BambooHR.

        For API key auth, we simply verify the key works by making a test request.
        """
        try:
            test_result = await self.test_connection()
            self._is_authenticated = test_result.success
            self._last_auth_time = datetime.utcnow() if test_result.success else None
            return test_result.success
        except Exception as e:
            logger.error(f"BambooHR authentication failed: {e}")
            self._is_authenticated = False
            return False

    async def refresh_auth(self) -> bool:
        """
        Refresh authentication.

        API key auth doesn't expire, so this is a no-op.
        """
        return True

    async def test_connection(self) -> ConnectionTestResult:
        """
        Test the connection to BambooHR.

        Uses the 'meta/fields' endpoint to verify connectivity.
        """
        start_time = datetime.utcnow()

        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/meta/fields")

            latency = (datetime.utcnow() - start_time).total_seconds() * 1000

            if response.status_code == 200:
                return ConnectionTestResult(
                    success=True,
                    message="Successfully connected to BambooHR",
                    latency_ms=latency,
                    api_version="v1",
                    permissions=["read:employees", "read:fields"]
                )
            elif response.status_code == 401:
                return ConnectionTestResult(
                    success=False,
                    message="Authentication failed - invalid API key",
                    latency_ms=latency,
                    errors=["Invalid API key or company domain"]
                )
            elif response.status_code == 403:
                return ConnectionTestResult(
                    success=False,
                    message="Access denied - insufficient permissions",
                    latency_ms=latency,
                    errors=["API key does not have required permissions"]
                )
            else:
                return ConnectionTestResult(
                    success=False,
                    message=f"Connection failed with status {response.status_code}",
                    latency_ms=latency,
                    errors=[f"HTTP {response.status_code}: {response.text[:200]}"]
                )

        except httpx.TimeoutException:
            return ConnectionTestResult(
                success=False,
                message="Connection timed out",
                errors=["Request timed out after 30 seconds"]
            )
        except Exception as e:
            return ConnectionTestResult(
                success=False,
                message=f"Connection error: {str(e)}",
                errors=[str(e)]
            )

    async def fetch_employees(
        self,
        filters: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[List[FieldMapping]] = None,
        incremental_since: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch employee data from BambooHR.

        Uses the Employee Directory API for bulk fetching.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()

        # Determine which fields to fetch
        fields = self.AVAILABLE_FIELDS
        if field_mapping:
            fields = list(set(fm.source_field for fm in field_mapping))

        # Build field list for API request
        fields_param = ",".join(fields)

        # Fetch all employees with specified fields
        # BambooHR uses POST to /reports/custom for custom field selection
        report_fields = [{"id": f} for f in fields]

        try:
            response = await client.post(
                f"{self.base_url}/reports/custom",
                params={"format": "JSON", "onlyCurrent": "true"},
                json={"fields": report_fields}
            )

            if response.status_code != 200:
                logger.error(f"Failed to fetch employees: {response.status_code}")
                return []

            data = response.json()
            employees = data.get("employees", [])

            # Apply field mapping transformation
            mapping = field_mapping or self.get_default_field_mapping()
            transformed = []

            for emp in employees:
                record = self._transform_employee(emp, mapping)

                # Apply filters if provided
                if filters:
                    if not self._matches_filters(record, filters):
                        continue

                # Apply incremental filter
                if incremental_since and record.get("updated_at"):
                    updated = datetime.fromisoformat(record["updated_at"])
                    if updated < incremental_since:
                        continue

                transformed.append(record)

            logger.info(f"Fetched {len(transformed)} employees from BambooHR")
            return transformed

        except Exception as e:
            logger.error(f"Error fetching employees from BambooHR: {e}")
            raise

    def _transform_employee(
        self,
        raw_employee: Dict[str, Any],
        mapping: List[FieldMapping]
    ) -> Dict[str, Any]:
        """Transform raw BambooHR employee data to ChurnVision format."""
        result = {}

        for fm in mapping:
            source_value = raw_employee.get(fm.source_field)

            if source_value is None:
                if fm.default_value is not None:
                    result[fm.target_field] = fm.default_value
                continue

            # Apply transformation if specified
            if fm.transform == "date_to_tenure":
                result[fm.target_field] = self._date_to_tenure(source_value)
            elif fm.transform == "status_normalize":
                result[fm.target_field] = self._normalize_status(source_value)
            else:
                result[fm.target_field] = source_value

        return result

    def _date_to_tenure(self, date_str: str) -> float:
        """Convert hire date to tenure in years."""
        try:
            hire_date = datetime.strptime(date_str, "%Y-%m-%d")
            tenure = (datetime.utcnow() - hire_date).days / 365.25
            return round(tenure, 2)
        except (ValueError, TypeError):
            return 0.0

    def _normalize_status(self, status: str) -> str:
        """Normalize employment status to ChurnVision format."""
        status_lower = status.lower()
        if "active" in status_lower:
            return "Active"
        elif "terminated" in status_lower or "inactive" in status_lower:
            return "Resigned"
        elif "leave" in status_lower:
            return "On Leave"
        return status

    def _matches_filters(
        self,
        record: Dict[str, Any],
        filters: Dict[str, Any]
    ) -> bool:
        """Check if a record matches the provided filters."""
        for key, value in filters.items():
            record_value = record.get(key)
            if isinstance(value, list):
                if record_value not in value:
                    return False
            elif record_value != value:
                return False
        return True

    async def get_schema(self) -> Dict[str, Any]:
        """Get the available fields schema from BambooHR."""
        client = await self._get_client()

        try:
            response = await client.get(f"{self.base_url}/meta/fields")

            if response.status_code != 200:
                return {"fields": [], "error": f"HTTP {response.status_code}"}

            data = response.json()
            return {
                "fields": data,
                "available_fields": self.AVAILABLE_FIELDS
            }
        except Exception as e:
            return {"fields": [], "error": str(e)}

    def get_required_scopes(self) -> List[str]:
        """BambooHR doesn't use OAuth2 scopes."""
        return []

    def get_default_field_mapping(self) -> List[FieldMapping]:
        """Get BambooHR-specific field mapping."""
        return [
            FieldMapping(source_field="id", target_field="hr_code", required=True),
            FieldMapping(source_field="displayName", target_field="full_name"),
            FieldMapping(source_field="department", target_field="structure_name"),
            FieldMapping(source_field="jobTitle", target_field="position"),
            FieldMapping(source_field="employmentStatus", target_field="status", transform="status_normalize"),
            FieldMapping(source_field="hireDate", target_field="tenure", transform="date_to_tenure"),
            FieldMapping(source_field="payRate", target_field="employee_cost"),
            FieldMapping(source_field="supervisorId", target_field="manager_id"),
            FieldMapping(source_field="terminationDate", target_field="termination_date"),
            FieldMapping(source_field="workEmail", target_field="email"),
        ]

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - close the client."""
        if self._client:
            await self._client.aclose()
            self._client = None
