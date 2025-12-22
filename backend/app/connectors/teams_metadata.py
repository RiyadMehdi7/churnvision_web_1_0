"""
Microsoft Teams Metadata Connector

Fetches behavioral metadata from Microsoft Teams WITHOUT reading message content.
Privacy-compliant integration using Microsoft Graph API.

Required Scopes (NO message reading):
- User.Read.All - List users and profiles
- TeamMember.Read.All - Team membership info
- Calendars.Read - Meeting load (optional)
- Presence.Read.All - Availability status

NOT included (privacy protection):
- ChannelMessage.Read.All - We don't read messages
- Chat.Read.All - We don't read chats
"""

import httpx
from datetime import datetime, timedelta
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
class TeamsMetadataConnector(HRConnectorBase):
    """
    Microsoft Teams Behavioral Metadata Connector

    Collects ONLY metadata signals using Microsoft Graph API.
    No message content is ever accessed.
    """

    CONNECTOR_TYPE = "microsoft_teams"
    DISPLAY_NAME = "Microsoft Teams (Metadata)"
    CATEGORY = ConnectorCategory.COLLABORATION
    AUTH_TYPE = AuthType.OAUTH2
    DESCRIPTION = "Fetch behavioral metadata from Teams (no message content)"

    # Microsoft Graph API base URL
    API_BASE_URL = "https://graph.microsoft.com/v1.0"
    BETA_API_URL = "https://graph.microsoft.com/beta"

    # OAuth endpoints
    AUTH_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
    TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

    # Required scopes - NOTE: No message reading scopes
    REQUIRED_SCOPES = [
        "User.Read.All",
        "TeamMember.Read.All",
        "Calendars.Read",
        "Presence.Read.All",
    ]

    # Metadata fields we collect
    AVAILABLE_FIELDS = [
        "user_id",
        "email",
        "display_name",
        "job_title",
        "department",
        "office_location",
        "presence_status",
        "teams_count",
        "meeting_hours_weekly",
    ]

    def __init__(self, credentials: ConnectorCredentials):
        super().__init__(credentials)
        self.access_token = credentials.access_token or ""
        self.refresh_token = credentials.refresh_token
        self.token_expires_at = credentials.token_expires_at
        self.tenant_id = credentials.tenant_id or "common"
        self.client_id = credentials.client_id
        self.client_secret = credentials.client_secret
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client with authentication."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0
            )
        return self._client

    async def authenticate(self) -> bool:
        """
        Verify or refresh OAuth token.
        """
        try:
            # Check if token needs refresh
            if self.token_expires_at and datetime.utcnow() >= self.token_expires_at:
                if not await self.refresh_auth():
                    return False

            test_result = await self.test_connection()
            self._is_authenticated = test_result.success
            self._last_auth_time = datetime.utcnow() if test_result.success else None
            return test_result.success

        except Exception as e:
            logger.error(f"Teams authentication failed: {e}")
            self._is_authenticated = False
            return False

    async def refresh_auth(self) -> bool:
        """
        Refresh the OAuth access token using refresh token.
        """
        if not self.refresh_token or not self.client_id:
            logger.error("Cannot refresh token: missing refresh_token or client_id")
            return False

        try:
            token_url = self.TOKEN_URL.format(tenant=self.tenant_id)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    token_url,
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "refresh_token": self.refresh_token,
                        "grant_type": "refresh_token",
                        "scope": " ".join(self.REQUIRED_SCOPES),
                    }
                )

            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                return False

            data = response.json()
            self.access_token = data["access_token"]
            self.refresh_token = data.get("refresh_token", self.refresh_token)
            expires_in = data.get("expires_in", 3600)
            self.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

            # Recreate client with new token
            if self._client:
                await self._client.aclose()
                self._client = None

            logger.info("Teams token refreshed successfully")
            return True

        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return False

    async def test_connection(self) -> ConnectionTestResult:
        """
        Test the connection to Microsoft Graph API.

        Uses the /me endpoint to verify token validity.
        """
        start_time = datetime.utcnow()

        try:
            client = await self._get_client()
            response = await client.get(f"{self.API_BASE_URL}/me")

            latency = (datetime.utcnow() - start_time).total_seconds() * 1000

            if response.status_code == 200:
                data = response.json()
                return ConnectionTestResult(
                    success=True,
                    message=f"Connected as: {data.get('displayName', 'Unknown')}",
                    latency_ms=latency,
                    permissions=self.REQUIRED_SCOPES,
                    api_version="v1.0"
                )
            elif response.status_code == 401:
                return ConnectionTestResult(
                    success=False,
                    message="Authentication failed - token invalid or expired",
                    latency_ms=latency,
                    errors=["Token invalid or expired"]
                )
            else:
                return ConnectionTestResult(
                    success=False,
                    message=f"API error: {response.status_code}",
                    latency_ms=latency,
                    errors=[response.text[:200]]
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
        Fetch user metadata from Microsoft Teams/Graph API.

        Returns behavioral metadata only - no message content.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()
        users_metadata = []

        try:
            # Fetch users list
            next_link = f"{self.API_BASE_URL}/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled"

            while next_link:
                response = await client.get(next_link)

                if response.status_code != 200:
                    logger.error(f"Failed to fetch users: {response.text}")
                    break

                data = response.json()
                users = data.get("value", [])

                for user in users:
                    # Skip disabled accounts if not requested
                    if filters and filters.get("active_only") and not user.get("accountEnabled"):
                        continue

                    metadata = self._extract_user_metadata(user)
                    users_metadata.append(metadata)

                next_link = data.get("@odata.nextLink")

            # Enrich with presence data if available
            await self._enrich_presence_data(client, users_metadata)

            # Enrich with team membership counts
            await self._enrich_team_counts(client, users_metadata)

            logger.info(f"Fetched metadata for {len(users_metadata)} Teams users")
            return users_metadata

        except Exception as e:
            logger.error(f"Error fetching Teams user metadata: {e}")
            raise

    def _extract_user_metadata(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Extract metadata from a Microsoft Graph user object."""
        return {
            "teams_user_id": user.get("id"),
            "email": user.get("mail") or user.get("userPrincipalName"),
            "display_name": user.get("displayName"),
            "job_title": user.get("jobTitle"),
            "department": user.get("department"),
            "office_location": user.get("officeLocation"),
            "is_active": user.get("accountEnabled", True),
            # Will be enriched
            "presence_status": None,
            "teams_count": 0,
            "meeting_hours_weekly": 0,
        }

    async def _enrich_presence_data(
        self,
        client: httpx.AsyncClient,
        users: List[Dict[str, Any]]
    ):
        """
        Enrich user data with presence information.

        Uses the /communications/presences endpoint.
        """
        try:
            user_ids = [u["teams_user_id"] for u in users if u.get("teams_user_id")]

            # Batch request for presence (max 650 users per request)
            batch_size = 650
            for i in range(0, len(user_ids), batch_size):
                batch_ids = user_ids[i:i + batch_size]

                response = await client.post(
                    f"{self.API_BASE_URL}/communications/getPresencesByUserId",
                    json={"ids": batch_ids}
                )

                if response.status_code != 200:
                    logger.warning(f"Presence fetch failed: {response.status_code}")
                    continue

                presences = response.json().get("value", [])

                # Create lookup map
                presence_map = {p["id"]: p for p in presences}

                # Update users
                for user in users:
                    user_id = user.get("teams_user_id")
                    if user_id in presence_map:
                        presence = presence_map[user_id]
                        user["presence_status"] = presence.get("availability")
                        user["presence_activity"] = presence.get("activity")

        except Exception as e:
            logger.warning(f"Could not enrich presence data: {e}")

    async def _enrich_team_counts(
        self,
        client: httpx.AsyncClient,
        users: List[Dict[str, Any]]
    ):
        """
        Enrich user data with team membership counts.

        Note: Getting per-user team counts requires iterating or using
        the beta API. Here we estimate based on joined teams.
        """
        try:
            # Get all teams in the organization
            response = await client.get(f"{self.API_BASE_URL}/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')")

            if response.status_code == 200:
                teams = response.json().get("value", [])
                org_team_count = len(teams)

                # For now, store org-wide count
                # Per-user counts would require iterating /users/{id}/joinedTeams
                for user in users:
                    user["org_team_count"] = org_team_count

        except Exception as e:
            logger.warning(f"Could not enrich team counts: {e}")

    async def get_meeting_load(
        self,
        user_email: str,
        days: int = 7
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate meeting load for a user over the past N days.

        Uses Calendar API - reads meeting times, not content.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()

        try:
            # Calculate date range
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days)

            # Fetch calendar view
            response = await client.get(
                f"{self.API_BASE_URL}/users/{user_email}/calendarView",
                params={
                    "startDateTime": start_date.isoformat() + "Z",
                    "endDateTime": end_date.isoformat() + "Z",
                    "$select": "start,end,isAllDay,isCancelled",
                }
            )

            if response.status_code != 200:
                logger.warning(f"Calendar fetch failed for {user_email}")
                return None

            events = response.json().get("value", [])

            # Calculate meeting hours
            total_minutes = 0
            meeting_count = 0

            for event in events:
                if event.get("isCancelled") or event.get("isAllDay"):
                    continue

                try:
                    start = datetime.fromisoformat(event["start"]["dateTime"].rstrip("Z"))
                    end = datetime.fromisoformat(event["end"]["dateTime"].rstrip("Z"))
                    duration = (end - start).total_seconds() / 60
                    total_minutes += duration
                    meeting_count += 1
                except (KeyError, ValueError):
                    continue

            # Calculate weekly average
            weekly_hours = (total_minutes / 60) / (days / 7) if days > 0 else 0

            return {
                "email": user_email,
                "period_days": days,
                "meeting_count": meeting_count,
                "total_meeting_minutes": total_minutes,
                "meeting_hours_weekly": round(weekly_hours, 1),
                "avg_meeting_duration_minutes": round(total_minutes / meeting_count, 1) if meeting_count > 0 else 0,
            }

        except Exception as e:
            logger.error(f"Error calculating meeting load for {user_email}: {e}")
            return None

    async def get_behavioral_signals(
        self,
        user_email: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get aggregated behavioral signals for a specific user.

        These signals don't reveal message content.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()

        try:
            # Get user profile
            response = await client.get(
                f"{self.API_BASE_URL}/users/{user_email}",
                params={
                    "$select": "id,displayName,mail,jobTitle,department,accountEnabled"
                }
            )

            if response.status_code != 200:
                return None

            user = response.json()
            user_id = user.get("id")

            # Get presence
            presence_response = await client.get(
                f"{self.API_BASE_URL}/users/{user_id}/presence"
            )
            presence = presence_response.json() if presence_response.status_code == 200 else {}

            # Get team count
            teams_response = await client.get(
                f"{self.API_BASE_URL}/users/{user_id}/joinedTeams"
            )
            teams = teams_response.json().get("value", []) if teams_response.status_code == 200 else []

            # Get meeting load
            meeting_data = await self.get_meeting_load(user_email, days=14)

            signals = {
                "teams_user_id": user_id,
                "email": user_email,
                "display_name": user.get("displayName"),
                "department": user.get("department"),
                "is_active": user.get("accountEnabled", True),
                "presence_status": presence.get("availability"),
                "presence_activity": presence.get("activity"),
                "teams_count": len(teams),
                "meeting_hours_weekly": meeting_data.get("meeting_hours_weekly", 0) if meeting_data else 0,
                "avg_meetings_per_week": (meeting_data.get("meeting_count", 0) / 2) if meeting_data else 0,
            }

            return signals

        except Exception as e:
            logger.error(f"Error fetching behavioral signals for {user_email}: {e}")
            return None

    async def get_schema(self) -> Dict[str, Any]:
        """Get available metadata fields from Teams/Graph."""
        return {
            "fields": self.AVAILABLE_FIELDS,
            "scopes_required": self.REQUIRED_SCOPES,
            "privacy_note": "This connector only accesses metadata - NO message content is read",
            "data_types": {
                "user_id": "string",
                "email": "string",
                "display_name": "string",
                "department": "string",
                "presence_status": "string (Available, Busy, Away, etc.)",
                "teams_count": "integer",
                "meeting_hours_weekly": "float",
            }
        }

    def get_required_scopes(self) -> List[str]:
        """Get required OAuth2 scopes."""
        return self.REQUIRED_SCOPES

    def get_default_field_mapping(self) -> List[FieldMapping]:
        """Get Teams-specific field mapping."""
        return [
            FieldMapping(source_field="email", target_field="email", required=True),
            FieldMapping(source_field="display_name", target_field="full_name"),
            FieldMapping(source_field="teams_user_id", target_field="teams_id"),
            FieldMapping(source_field="department", target_field="structure_name"),
            FieldMapping(source_field="job_title", target_field="position"),
            FieldMapping(source_field="is_active", target_field="is_active"),
            FieldMapping(source_field="teams_count", target_field="teams_active"),
            FieldMapping(source_field="meeting_hours_weekly", target_field="meeting_load_hours_weekly"),
        ]

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - close the client."""
        if self._client:
            await self._client.aclose()
            self._client = None
