"""
Slack Metadata Connector

Fetches behavioral metadata from Slack WITHOUT reading message content.
Privacy-compliant integration using only metadata signals.

Required Scopes (NO message reading):
- users:read - List users
- users:read.email - Get user emails for matching
- channels:read - Channel membership counts
- team:read - Workspace info

NOT included (privacy protection):
- channels:history - We don't read messages
- im:history - We don't read DMs
- mpim:history - We don't read group DMs
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
class SlackMetadataConnector(HRConnectorBase):
    """
    Slack Behavioral Metadata Connector

    Collects ONLY metadata signals - no message content is ever accessed.
    Designed for privacy-compliant behavioral analysis.
    """

    CONNECTOR_TYPE = "slack"
    DISPLAY_NAME = "Slack (Metadata)"
    CATEGORY = ConnectorCategory.COLLABORATION
    AUTH_TYPE = AuthType.OAUTH2
    DESCRIPTION = "Fetch behavioral metadata from Slack (no message content)"

    # Slack API base URL
    API_BASE_URL = "https://slack.com/api"

    # Required OAuth scopes - NOTE: No message reading scopes
    REQUIRED_SCOPES = [
        "users:read",
        "users:read.email",
        "channels:read",
        "team:read",
    ]

    # Metadata fields we collect
    AVAILABLE_FIELDS = [
        "user_id",
        "email",
        "display_name",
        "status_text",
        "status_emoji",
        "is_active",
        "tz",
        "updated",
        "channel_count",
        "is_admin",
        "is_owner",
    ]

    def __init__(self, credentials: ConnectorCredentials):
        super().__init__(credentials)
        self.access_token = credentials.access_token or ""
        self.workspace_id = credentials.extra.get("workspace_id", "")
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client with authentication."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json; charset=utf-8",
                },
                timeout=30.0
            )
        return self._client

    async def authenticate(self) -> bool:
        """
        Verify OAuth token is valid.

        For Slack, tokens don't expire but can be revoked.
        """
        try:
            test_result = await self.test_connection()
            self._is_authenticated = test_result.success
            self._last_auth_time = datetime.utcnow() if test_result.success else None
            return test_result.success
        except Exception as e:
            logger.error(f"Slack authentication failed: {e}")
            self._is_authenticated = False
            return False

    async def refresh_auth(self) -> bool:
        """
        Refresh authentication.

        Slack OAuth tokens don't expire, so this is a no-op.
        If using token rotation, implement refresh logic here.
        """
        return True

    async def test_connection(self) -> ConnectionTestResult:
        """
        Test the connection to Slack.

        Uses the auth.test endpoint to verify token validity.
        """
        start_time = datetime.utcnow()

        try:
            client = await self._get_client()
            response = await client.post(f"{self.API_BASE_URL}/auth.test")

            latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            data = response.json()

            if data.get("ok"):
                return ConnectionTestResult(
                    success=True,
                    message=f"Connected to workspace: {data.get('team', 'Unknown')}",
                    latency_ms=latency,
                    permissions=self.REQUIRED_SCOPES,
                    api_version="Web API"
                )
            else:
                error = data.get("error", "unknown_error")
                return ConnectionTestResult(
                    success=False,
                    message=f"Authentication failed: {error}",
                    latency_ms=latency,
                    errors=[error]
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
        Fetch user metadata from Slack.

        Returns behavioral metadata only - no message content.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()
        users_metadata = []

        try:
            # Fetch users list
            cursor = None
            while True:
                params = {"limit": 200}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self.API_BASE_URL}/users.list",
                    params=params
                )
                data = response.json()

                if not data.get("ok"):
                    logger.error(f"Failed to fetch users: {data.get('error')}")
                    break

                members = data.get("members", [])
                for member in members:
                    # Skip bots and deleted users
                    if member.get("is_bot") or member.get("deleted"):
                        continue

                    metadata = await self._extract_user_metadata(member)
                    users_metadata.append(metadata)

                # Pagination
                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

            # Enrich with channel membership counts
            await self._enrich_channel_counts(client, users_metadata)

            logger.info(f"Fetched metadata for {len(users_metadata)} Slack users")
            return users_metadata

        except Exception as e:
            logger.error(f"Error fetching Slack user metadata: {e}")
            raise

    async def _extract_user_metadata(self, member: Dict[str, Any]) -> Dict[str, Any]:
        """Extract metadata from a Slack user object."""
        profile = member.get("profile", {})

        return {
            "slack_user_id": member.get("id"),
            "email": profile.get("email"),
            "display_name": profile.get("display_name") or profile.get("real_name"),
            "status_text": profile.get("status_text", ""),
            "status_emoji": profile.get("status_emoji", ""),
            "is_active": not member.get("deleted", False),
            "timezone": member.get("tz"),
            "tz_offset": member.get("tz_offset"),
            "updated_at": datetime.fromtimestamp(member.get("updated", 0)),
            "is_admin": member.get("is_admin", False),
            "is_owner": member.get("is_owner", False),
            "is_primary_owner": member.get("is_primary_owner", False),
            "has_2fa": member.get("has_2fa", False),
            # Note: We don't have message activity data without reading messages
            # These fields would come from a separate analytics integration
            "channel_count": 0,  # Will be enriched
        }

    async def _enrich_channel_counts(
        self,
        client: httpx.AsyncClient,
        users: List[Dict[str, Any]]
    ):
        """
        Enrich user data with channel membership counts.

        This uses channels.list which doesn't read message content.
        """
        try:
            # Get all channels
            channels = []
            cursor = None

            while True:
                params = {"limit": 200, "types": "public_channel,private_channel"}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{self.API_BASE_URL}/conversations.list",
                    params=params
                )
                data = response.json()

                if not data.get("ok"):
                    break

                channels.extend(data.get("channels", []))

                cursor = data.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

            # Count channels per user (using num_members if available)
            # Note: Getting exact per-user counts requires conversations.members
            # which might hit rate limits - we use channel count as proxy

            channel_count = len(channels)
            for user in users:
                # Approximate: assume active users are in ~20-50% of channels
                # In production, you'd call conversations.members per user
                user["workspace_channel_count"] = channel_count

        except Exception as e:
            logger.warning(f"Could not enrich channel counts: {e}")

    async def get_behavioral_signals(
        self,
        user_email: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get behavioral signals for a specific user by email.

        These are aggregate/computed signals that don't reveal message content.
        """
        if not self.is_authenticated:
            await self.authenticate()

        client = await self._get_client()

        try:
            # Find user by email
            response = await client.get(
                f"{self.API_BASE_URL}/users.lookupByEmail",
                params={"email": user_email}
            )
            data = response.json()

            if not data.get("ok"):
                return None

            user = data.get("user", {})

            # Build behavioral signals from available metadata
            signals = {
                "slack_user_id": user.get("id"),
                "email": user_email,
                "timezone": user.get("tz"),
                "is_active": not user.get("deleted", False),
                "has_custom_status": bool(user.get("profile", {}).get("status_text")),
                "is_admin": user.get("is_admin", False),
                "profile_completeness": self._calculate_profile_completeness(user),
                # Activity indicators (from presence, not messages)
                "last_updated": datetime.fromtimestamp(user.get("updated", 0)),
            }

            return signals

        except Exception as e:
            logger.error(f"Error fetching behavioral signals for {user_email}: {e}")
            return None

    def _calculate_profile_completeness(self, user: Dict[str, Any]) -> float:
        """Calculate how complete a user's profile is (0-1)."""
        profile = user.get("profile", {})

        fields_to_check = [
            "display_name",
            "real_name",
            "title",
            "phone",
            "image_original",
            "status_text",
        ]

        filled = sum(1 for f in fields_to_check if profile.get(f))
        return round(filled / len(fields_to_check), 2)

    async def get_schema(self) -> Dict[str, Any]:
        """Get available metadata fields from Slack."""
        return {
            "fields": self.AVAILABLE_FIELDS,
            "scopes_required": self.REQUIRED_SCOPES,
            "privacy_note": "This connector only accesses metadata - NO message content is read",
            "data_types": {
                "user_id": "string",
                "email": "string",
                "display_name": "string",
                "status_text": "string",
                "is_active": "boolean",
                "channel_count": "integer",
                "timezone": "string",
            }
        }

    def get_required_scopes(self) -> List[str]:
        """Get required OAuth2 scopes."""
        return self.REQUIRED_SCOPES

    def get_default_field_mapping(self) -> List[FieldMapping]:
        """Get Slack-specific field mapping."""
        return [
            FieldMapping(source_field="email", target_field="email", required=True),
            FieldMapping(source_field="display_name", target_field="full_name"),
            FieldMapping(source_field="slack_user_id", target_field="slack_id"),
            FieldMapping(source_field="timezone", target_field="timezone"),
            FieldMapping(source_field="is_active", target_field="is_active"),
            FieldMapping(source_field="channel_count", target_field="channels_active"),
        ]

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - close the client."""
        if self._client:
            await self._client.aclose()
            self._client = None
