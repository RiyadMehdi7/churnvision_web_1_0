from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class Project(BaseModel):
    id: Optional[str] = None
    name: str
    path: str
    dbPath: str
    exists: bool = True
    active: bool = False


class Dataset(BaseModel):
    id: str
    name: str
    type: str
    size: int
    uploadedAt: datetime
    rowCount: Optional[int] = None
    active: bool
    isSnapshot: bool
    snapshotGroup: Optional[str] = None
    snapshotPairDatasetId: Optional[str] = None
    description: Optional[str] = None
    projectId: Optional[str] = None
    filePath: Optional[str] = None
    columnMapping: Optional[dict] = None


class Connection(BaseModel):
    id: str
    name: str
    type: str
    host: str
    port: Optional[int] = None
    username: Optional[str] = None
    databaseName: Optional[str] = None
    lastConnected: Optional[str] = None
    status: str


class CreateConnectionRequest(BaseModel):
    name: str
    type: str
    host: str
    port: int
    username: str
    password: str
    databaseName: str


class ImportFromDbRequest(BaseModel):
    connectionId: str
    tableName: str
    datasetName: str


class CreateProjectRequest(BaseModel):
    name: str


class SetActiveProjectRequest(BaseModel):
    dbPath: str


class OperationResult(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    project: Optional[Project] = None
    importedProject: Optional[Project] = None
    filePath: Optional[str] = None
    cancelled: Optional[bool] = None
    dataQuality: Optional[Dict[str, Any]] = None


class DataQualityResponse(BaseModel):
    """Response for data quality assessment endpoint."""

    ml_readiness_score: int
    can_train_model: bool
    confidence_level: str
    total_rows: int
    total_columns: int
    churn_events: int
    churn_rate: float
    critical_issues: List[Dict[str, Any]]
    warnings: List[Dict[str, Any]]
    info: List[Dict[str, Any]]
    features: List[Dict[str, Any]]
    missing_required_features: List[str]
    missing_optional_features: List[str]
    top_recommendations: List[str]
    assessed_at: str
    data_source: str
