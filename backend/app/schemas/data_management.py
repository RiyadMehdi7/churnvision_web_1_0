from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class Project(BaseModel):
    name: str
    path: str
    dbPath: str
    exists: bool = True

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
