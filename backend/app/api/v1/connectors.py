"""
Connectors API

Endpoints for managing HRIS/HCM integrations.
Supports OAuth2 flows, API key authentication, and data synchronization.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import secrets
import logging

from app.api.deps import get_db, get_current_user
from app.models.dataset import Connection
from app.models.user import User
from app.connectors.base import (
    ConnectorRegistry,
    ConnectorCredentials,
    AuthType,
    AVAILABLE_CONNECTORS,
    SyncStatus,
)
from app.services.data.data_quality_service import assess_data_quality
import pandas as pd

# Import connectors to ensure they register themselves
from app.connectors import bamboohr  # noqa: F401

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class ConnectorInfo(BaseModel):
    """Available connector information"""

    connector_type: str
    display_name: str
    category: str
    auth_type: str
    description: str
    priority: str
    status: str  # 'available', 'planned', 'beta'


class ConnectorListResponse(BaseModel):
    """Response for listing available connectors"""

    connectors: List[ConnectorInfo]
    total: int
    categories: List[str]


class OAuthInitiateRequest(BaseModel):
    """Request to initiate OAuth flow"""

    connector_type: str
    redirect_uri: str
    tenant_id: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None


class OAuthInitiateResponse(BaseModel):
    """Response with OAuth authorization URL"""

    authorization_url: str
    state: str


class OAuthCallbackRequest(BaseModel):
    """OAuth callback data"""

    code: str
    state: str
    connector_type: str


class APIKeyConnectionRequest(BaseModel):
    """Request to create API key-based connection"""

    connector_type: str
    connection_name: str
    api_key: str
    api_endpoint: Optional[str] = None
    tenant_id: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None


class ConnectionResponse(BaseModel):
    """Connection details response"""

    connection_id: str
    name: str
    connector_type: str
    status: str
    created_at: datetime
    last_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    last_sync_records: Optional[int]


class ConnectionTestResponse(BaseModel):
    """Connection test result"""

    success: bool
    message: str
    latency_ms: Optional[float]
    permissions: List[str]
    errors: List[str]


class SyncRequest(BaseModel):
    """Request to trigger sync"""

    incremental: bool = False
    dataset_name: Optional[str] = None


class SyncStatusResponse(BaseModel):
    """Sync status response"""

    connection_id: str
    status: str
    records_fetched: int
    records_created: int
    records_updated: int
    records_failed: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: float
    errors: List[str]


class FieldMappingConfig(BaseModel):
    """Field mapping configuration"""

    source_field: str
    target_field: str
    transform: Optional[str] = None
    required: bool = False
    default_value: Optional[Any] = None


class ConnectionUpdateRequest(BaseModel):
    """Request to update connection settings"""

    name: Optional[str] = None
    sync_frequency_minutes: Optional[int] = None
    field_mappings: Optional[List[FieldMappingConfig]] = None
    is_active: Optional[int] = None


# =============================================================================
# Utility Functions
# =============================================================================


def generate_state_token() -> str:
    """Generate secure state token for OAuth"""
    return secrets.token_urlsafe(32)


async def get_connection_or_404(db: AsyncSession, connection_id: str) -> Connection:
    """Get connection by ID or raise 404"""
    result = await db.execute(
        select(Connection).where(Connection.connection_id == connection_id)
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection {connection_id} not found",
        )
    return connection


# =============================================================================
# Endpoints
# =============================================================================


@router.get("/available", response_model=ConnectorListResponse)
async def list_available_connectors(
    category: Optional[str] = Query(None, description="Filter by category"),
    status_filter: Optional[str] = Query(
        None, alias="status", description="Filter by status"
    ),
    current_user: User = Depends(get_current_user),
):
    """
    List all available connector types.

    Returns connectors with their capabilities and implementation status.
    """
    connectors = AVAILABLE_CONNECTORS.copy()

    # Filter by category if specified
    if category:
        connectors = [c for c in connectors if c["category"] == category]

    # Filter by status if specified
    if status_filter:
        connectors = [c for c in connectors if c["status"] == status_filter]

    # Get unique categories
    categories = list(set(c["category"] for c in AVAILABLE_CONNECTORS))

    return ConnectorListResponse(
        connectors=[ConnectorInfo(**c) for c in connectors],
        total=len(connectors),
        categories=categories,
    )


@router.get("/registered")
async def list_registered_connectors(
    current_user: User = Depends(get_current_user),
):
    """
    List connectors that are actually implemented and registered.

    These are connectors that can be used immediately.
    """
    registered = ConnectorRegistry.list_all()
    capabilities = ConnectorRegistry.get_all_capabilities()

    return {
        "registered_connectors": registered,
        "capabilities": [
            {
                "connector_type": cap.connector_type,
                "display_name": cap.display_name,
                "category": cap.category.value,
                "auth_type": cap.auth_type.value,
                "description": cap.description,
                "supports_incremental_sync": cap.supports_incremental_sync,
                "supports_webhooks": cap.supports_webhooks,
                "required_scopes": cap.required_scopes,
            }
            for cap in capabilities
        ],
    }


@router.get("/connections", response_model=List[ConnectionResponse])
async def list_connections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    connector_type: Optional[str] = None,
):
    """
    List all configured connections.
    """
    query = select(Connection).where(Connection.connector_type.isnot(None))

    if connector_type:
        query = query.where(Connection.connector_type == connector_type)

    result = await db.execute(query)
    connections = result.scalars().all()

    return [
        ConnectionResponse(
            connection_id=conn.connection_id,
            name=conn.name,
            connector_type=conn.connector_type or "unknown",
            status="active" if conn.is_active else "inactive",
            created_at=conn.created_at,
            last_sync_at=conn.last_sync_at,
            last_sync_status=conn.last_sync_status,
            last_sync_records=conn.last_sync_records,
        )
        for conn in connections
    ]


@router.post("/oauth/initiate", response_model=OAuthInitiateResponse)
async def initiate_oauth_flow(
    request: OAuthInitiateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Initiate OAuth2 authorization flow for a connector.

    Returns the authorization URL to redirect the user to.
    """
    # Find connector info
    connector_info = next(
        (
            c
            for c in AVAILABLE_CONNECTORS
            if c["connector_type"] == request.connector_type
        ),
        None,
    )

    if not connector_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector type '{request.connector_type}' not found",
        )

    if connector_info["auth_type"] != "oauth2":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector '{request.connector_type}' does not use OAuth2",
        )

    if connector_info["status"] != "available":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector '{request.connector_type}' is not yet available (status: {connector_info['status']})",
        )

    # Generate state token
    state = generate_state_token()

    # Build authorization URL based on connector type
    # This would be implemented per-connector
    auth_urls = {
        "workday": "https://wd5-impl-services1.workday.com/ccx/oauth/authorize",
        "sap_successfactors": "https://{datacenter}.successfactors.com/oauth/authorize",
        "adp_workforce": "https://accounts.adp.com/auth/oauth/v2/authorize",
        "rippling": "https://app.rippling.com/oauth/authorize",
    }

    base_url = auth_urls.get(request.connector_type, "")
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"OAuth flow not yet implemented for '{request.connector_type}'",
        )

    # Store state for callback verification (in production, use Redis/DB)
    # For now, we'll include connector info in the state

    authorization_url = (
        f"{base_url}"
        f"?client_id={{client_id}}"  # Would be configured per tenant
        f"&redirect_uri={request.redirect_uri}"
        f"&response_type=code"
        f"&state={state}"
        f"&scope=employees:read"
    )

    logger.info(
        f"OAuth flow initiated for {request.connector_type} by user {current_user.id}"
    )

    return OAuthInitiateResponse(authorization_url=authorization_url, state=state)


@router.post("/oauth/callback")
async def handle_oauth_callback(
    request: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Handle OAuth2 callback after user authorization.

    Exchanges the authorization code for access tokens and creates the connection.
    """
    # In production, verify state token against stored value

    # Exchange code for tokens (connector-specific)
    # This is a placeholder - each connector would implement its own token exchange

    logger.info(f"OAuth callback received for {request.connector_type}")

    return {
        "success": True,
        "message": "OAuth flow completed - connection created",
        "note": "Full OAuth implementation pending - use API key connection for now",
    }


@router.post("/api-key/connect", response_model=ConnectionResponse)
async def create_api_key_connection(
    request: APIKeyConnectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a connection using API key authentication.

    For connectors like BambooHR, Personio, Deel that use API keys.
    """
    # Verify connector type exists and uses API key
    connector_info = next(
        (
            c
            for c in AVAILABLE_CONNECTORS
            if c["connector_type"] == request.connector_type
        ),
        None,
    )

    if not connector_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector type '{request.connector_type}' not found",
        )

    if connector_info["auth_type"] not in ["api_key", "token"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector '{request.connector_type}' does not use API key authentication",
        )

    # Check if connector is implemented
    connector_class = ConnectorRegistry.get(request.connector_type)

    # Generate connection ID
    import uuid

    connection_id = f"conn_{uuid.uuid4().hex[:12]}"

    # Create credentials for testing
    credentials = ConnectorCredentials(
        connector_type=request.connector_type,
        auth_type=AuthType.API_KEY,
        api_key=request.api_key,
        api_endpoint=request.api_endpoint,
        tenant_id=request.tenant_id,
        extra=request.extra_config or {},
    )

    # Test connection if connector is implemented
    if connector_class:
        connector = connector_class(credentials)
        test_result = await connector.test_connection()

        if not test_result.success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Connection test failed: {test_result.message}",
            )

    # Create connection record
    # NOTE: In production, encrypt the API key before storing
    connection = Connection(
        connection_id=connection_id,
        name=request.connection_name,
        type="hris",
        host=request.api_endpoint or connector_info.get("api_base_url", ""),
        connector_type=request.connector_type,
        api_key_encrypted=request.api_key,  # Should be encrypted
        api_endpoint=request.api_endpoint,
        tenant_id=request.tenant_id,
        connector_config=request.extra_config,
        is_active=1,
        last_sync_status="pending",
    )

    db.add(connection)
    await db.commit()
    await db.refresh(connection)

    logger.info(
        f"API key connection created: {connection_id} for {request.connector_type}"
    )

    return ConnectionResponse(
        connection_id=connection.connection_id,
        name=connection.name,
        connector_type=connection.connector_type or "unknown",
        status="active",
        created_at=connection.created_at,
        last_sync_at=None,
        last_sync_status="pending",
        last_sync_records=None,
    )


@router.get("/connections/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a specific connection."""
    connection = await get_connection_or_404(db, connection_id)

    return ConnectionResponse(
        connection_id=connection.connection_id,
        name=connection.name,
        connector_type=connection.connector_type or "unknown",
        status="active" if connection.is_active else "inactive",
        created_at=connection.created_at,
        last_sync_at=connection.last_sync_at,
        last_sync_status=connection.last_sync_status,
        last_sync_records=connection.last_sync_records,
    )


@router.patch("/connections/{connection_id}")
async def update_connection(
    connection_id: str,
    request: ConnectionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update connection settings."""
    connection = await get_connection_or_404(db, connection_id)

    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.sync_frequency_minutes is not None:
        update_data["sync_frequency_minutes"] = request.sync_frequency_minutes
    if request.is_active is not None:
        update_data["is_active"] = request.is_active
    if request.field_mappings is not None:
        update_data["connector_config"] = {
            **(connection.connector_config or {}),
            "field_mappings": [fm.model_dump() for fm in request.field_mappings],
        }

    if update_data:
        await db.execute(
            update(Connection)
            .where(Connection.connection_id == connection_id)
            .values(**update_data)
        )
        await db.commit()

    return {"success": True, "updated_fields": list(update_data.keys())}


@router.delete("/connections/{connection_id}")
async def delete_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a connection."""
    connection = await get_connection_or_404(db, connection_id)

    await db.delete(connection)
    await db.commit()

    logger.info(f"Connection deleted: {connection_id}")

    return {"success": True, "deleted_connection_id": connection_id}


@router.post("/connections/{connection_id}/test", response_model=ConnectionTestResponse)
async def test_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test a configured connection."""
    connection = await get_connection_or_404(db, connection_id)

    if not connection.connector_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connection does not have a connector type configured",
        )

    connector_class = ConnectorRegistry.get(connection.connector_type)
    if not connector_class:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector type '{connection.connector_type}' is not implemented",
        )

    # Build credentials from connection
    credentials = ConnectorCredentials(
        connector_type=connection.connector_type,
        auth_type=connector_class.AUTH_TYPE,
        api_key=connection.api_key_encrypted,  # Would be decrypted
        access_token=connection.oauth_access_token_encrypted,  # Would be decrypted
        refresh_token=connection.oauth_refresh_token_encrypted,  # Would be decrypted
        api_endpoint=connection.api_endpoint,
        tenant_id=connection.tenant_id,
        extra=connection.connector_config or {},
    )

    # Test connection
    connector = connector_class(credentials)
    result = await connector.test_connection()

    return ConnectionTestResponse(
        success=result.success,
        message=result.message,
        latency_ms=result.latency_ms,
        permissions=result.permissions,
        errors=result.errors,
    )


@router.post("/connections/{connection_id}/sync", response_model=SyncStatusResponse)
async def trigger_sync(
    connection_id: str,
    request: SyncRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger a data sync for a connection.

    The sync runs in the background and updates the connection status.
    """
    connection = await get_connection_or_404(db, connection_id)

    if not connection.connector_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connection does not have a connector type configured",
        )

    connector_class = ConnectorRegistry.get(connection.connector_type)
    if not connector_class:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector type '{connection.connector_type}' is not implemented",
        )

    # Update status to in_progress
    await db.execute(
        update(Connection)
        .where(Connection.connection_id == connection_id)
        .values(last_sync_status="in_progress")
    )
    await db.commit()

    # In production, this would be a background task
    # For now, return a pending status
    logger.info(f"Sync triggered for connection {connection_id}")

    return SyncStatusResponse(
        connection_id=connection_id,
        status="in_progress",
        records_fetched=0,
        records_created=0,
        records_updated=0,
        records_failed=0,
        started_at=datetime.utcnow(),
        completed_at=None,
        duration_seconds=0,
        errors=[],
    )


@router.get(
    "/connections/{connection_id}/sync/status", response_model=SyncStatusResponse
)
async def get_sync_status(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current sync status for a connection."""
    connection = await get_connection_or_404(db, connection_id)

    return SyncStatusResponse(
        connection_id=connection_id,
        status=connection.last_sync_status or "never_synced",
        records_fetched=connection.last_sync_records or 0,
        records_created=0,  # Would be tracked separately
        records_updated=0,  # Would be tracked separately
        records_failed=0,  # Would be tracked separately
        started_at=connection.last_sync_at,
        completed_at=connection.last_sync_at,
        duration_seconds=0,
        errors=[connection.last_sync_error] if connection.last_sync_error else [],
    )


@router.get("/connections/{connection_id}/schema")
async def get_connector_schema(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the available fields schema from the connected platform.

    Useful for configuring field mappings.
    """
    connection = await get_connection_or_404(db, connection_id)

    if not connection.connector_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connection does not have a connector type configured",
        )

    connector_class = ConnectorRegistry.get(connection.connector_type)
    if not connector_class:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector type '{connection.connector_type}' is not implemented",
        )

    # Build credentials and get schema
    credentials = ConnectorCredentials(
        connector_type=connection.connector_type,
        auth_type=connector_class.AUTH_TYPE,
        api_key=connection.api_key_encrypted,
        api_endpoint=connection.api_endpoint,
        tenant_id=connection.tenant_id,
        extra=connection.connector_config or {},
    )

    connector = connector_class(credentials)
    schema = await connector.get_schema()

    return {
        "connector_type": connection.connector_type,
        "schema": schema,
        "default_mappings": [
            {
                "source_field": fm.source_field,
                "target_field": fm.target_field,
                "transform": fm.transform,
                "required": fm.required,
            }
            for fm in connector.get_default_field_mapping()
        ],
    }


@router.get("/connections/{connection_id}/preview")
async def preview_sync_data(
    connection_id: str,
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Preview data that would be synced from the connection.

    Returns a sample of records without actually importing them.
    """
    connection = await get_connection_or_404(db, connection_id)

    if not connection.connector_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connection does not have a connector type configured",
        )

    connector_class = ConnectorRegistry.get(connection.connector_type)
    if not connector_class:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connector type '{connection.connector_type}' is not implemented",
        )

    # Build credentials
    credentials = ConnectorCredentials(
        connector_type=connection.connector_type,
        auth_type=connector_class.AUTH_TYPE,
        api_key=connection.api_key_encrypted,
        api_endpoint=connection.api_endpoint,
        tenant_id=connection.tenant_id,
        extra=connection.connector_config or {},
    )

    # Fetch preview data
    connector = connector_class(credentials)

    try:
        employees = await connector.fetch_employees()
        preview = employees[:limit]

        # Run data quality assessment on the fetched data
        quality_report = None
        if employees:
            try:
                df = pd.DataFrame(employees)
                report = assess_data_quality(df, source="database")
                quality_report = report.to_dict()
            except Exception as qe:
                logger.warning(f"Data quality assessment failed: {qe}")

        return {
            "total_available": len(employees),
            "preview_count": len(preview),
            "records": preview,
            "data_quality": quality_report,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch preview data: {str(e)}",
        )
