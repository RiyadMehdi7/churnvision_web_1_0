"""
Audit Logging System for ChurnVision Enterprise

Tracks all sensitive operations for compliance and security.
"""

import json
from datetime import datetime
from typing import Optional, Any, Dict
from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base_class import Base


class AuditLog(Base):
    """Audit log model for tracking user actions"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_id = Column(Integer, index=True)
    username = Column(String, index=True)
    tenant_id = Column(String, index=True)
    action = Column(String, nullable=False, index=True)  # e.g., "predict", "train", "upload"
    resource_type = Column(String, index=True)  # e.g., "employee", "model", "dataset"
    resource_id = Column(String, index=True)  # ID of the affected resource
    method = Column(String)  # HTTP method
    endpoint = Column(String)  # API endpoint
    ip_address = Column(String)
    user_agent = Column(String)
    status_code = Column(Integer)
    duration_ms = Column(Integer)  # Request duration in milliseconds
    log_metadata = Column("metadata", Text)  # JSON metadata (scores, counts, etc.)
    error_message = Column(Text)  # Error details if failed

    __table_args__ = (
        Index('idx_audit_user_action', 'user_id', 'action'),
        Index('idx_audit_tenant_timestamp', 'tenant_id', 'timestamp'),
        Index('idx_audit_resource', 'resource_type', 'resource_id'),
    )

    def __repr__(self):
        return f"<AuditLog {self.id}: {self.username} - {self.action}>"


class AuditLogger:
    """Service for creating audit log entries"""

    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        tenant_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        method: Optional[str] = None,
        endpoint: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status_code: Optional[int] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None
    ) -> AuditLog:
        """
        Create an audit log entry

        Args:
            db: Database session
            action: Action performed (e.g., "predict_churn", "upload_data")
            user_id: ID of the user performing the action
            username: Username of the user
            tenant_id: Tenant ID for multi-tenancy
            resource_type: Type of resource affected
            resource_id: ID of the affected resource
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint
            ip_address: Client IP address
            user_agent: Client user agent
            status_code: HTTP status code
            duration_ms: Request duration in milliseconds
            metadata: Additional metadata as dictionary
            error_message: Error message if action failed

        Returns:
            Created AuditLog instance
        """
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            method=method,
            endpoint=endpoint,
            ip_address=ip_address,
            user_agent=user_agent,
            status_code=status_code,
            duration_ms=duration_ms,
            log_metadata=json.dumps(metadata) if metadata else None,
            error_message=error_message
        )

        try:
            db.add(log_entry)
            await db.commit()
            await db.refresh(log_entry)
        except SQLAlchemyError as exc:
            # Schema may lag in dev; avoid breaking main flows due to audit writes
            await db.rollback()
            print(f"Audit log write skipped due to DB error: {exc}")

        return log_entry

    @staticmethod
    async def log_prediction(
        db: AsyncSession,
        user_id: int,
        username: str,
        tenant_id: Optional[str],
        employee_id: str,
        risk_score: float,
        risk_level: str,
        duration_ms: int
    ) -> AuditLog:
        """
        Log a churn prediction action

        Args:
            db: Database session
            user_id: User ID
            username: Username
            tenant_id: Tenant ID
            employee_id: Employee ID
            risk_score: Predicted risk score
            risk_level: Risk level (HIGH, MEDIUM, LOW)
            duration_ms: Prediction duration

        Returns:
            Created AuditLog instance
        """
        return await AuditLogger.log(
            db=db,
            action="predict_churn",
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            resource_type="employee",
            resource_id=employee_id,
            status_code=200,
            duration_ms=duration_ms,
            metadata={
                "risk_score": risk_score,
                "risk_level": risk_level
            }
        )

    @staticmethod
    async def log_model_training(
        db: AsyncSession,
        user_id: int,
        username: str,
        tenant_id: Optional[str],
        model_type: str,
        accuracy: Optional[float],
        duration_ms: int,
        samples_count: int
    ) -> AuditLog:
        """
        Log a model training action

        Args:
            db: Database session
            user_id: User ID
            username: Username
            tenant_id: Tenant ID
            model_type: Type of model trained
            accuracy: Model accuracy
            duration_ms: Training duration
            samples_count: Number of training samples

        Returns:
            Created AuditLog instance
        """
        return await AuditLogger.log(
            db=db,
            action="train_model",
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            resource_type="model",
            resource_id=model_type,
            status_code=200,
            duration_ms=duration_ms,
            metadata={
                "model_type": model_type,
                "accuracy": accuracy,
                "samples_count": samples_count
            }
        )

    @staticmethod
    async def log_data_upload(
        db: AsyncSession,
        user_id: int,
        username: str,
        tenant_id: Optional[str],
        dataset_type: str,
        records_count: int,
        duration_ms: int,
        file_name: Optional[str] = None
    ) -> AuditLog:
        """
        Log a data upload action

        Args:
            db: Database session
            user_id: User ID
            username: Username
            tenant_id: Tenant ID
            dataset_type: Type of dataset (employee, engagement, interview)
            records_count: Number of records uploaded
            duration_ms: Upload duration
            file_name: Original file name

        Returns:
            Created AuditLog instance
        """
        return await AuditLogger.log(
            db=db,
            action="upload_data",
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            resource_type="dataset",
            resource_id=dataset_type,
            status_code=200,
            duration_ms=duration_ms,
            metadata={
                "dataset_type": dataset_type,
                "records_count": records_count,
                "file_name": file_name
            }
        )

    @staticmethod
    async def log_llm_query(
        db: AsyncSession,
        user_id: int,
        username: str,
        tenant_id: Optional[str],
        query_type: str,
        duration_ms: int,
        tokens_used: Optional[int] = None
    ) -> AuditLog:
        """
        Log an LLM query action

        Args:
            db: Database session
            user_id: User ID
            username: Username
            tenant_id: Tenant ID
            query_type: Type of LLM query
            duration_ms: Query duration
            tokens_used: Number of tokens used

        Returns:
            Created AuditLog instance
        """
        return await AuditLogger.log(
            db=db,
            action="llm_query",
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            resource_type="llm",
            resource_id=query_type,
            status_code=200,
            duration_ms=duration_ms,
            metadata={
                "query_type": query_type,
                "tokens_used": tokens_used
            }
        )

    @staticmethod
    async def log_error(
        db: AsyncSession,
        action: str,
        user_id: Optional[int],
        username: Optional[str],
        tenant_id: Optional[str],
        error_message: str,
        endpoint: Optional[str] = None,
        status_code: int = 500
    ) -> AuditLog:
        """
        Log an error action

        Args:
            db: Database session
            action: Action that failed
            user_id: User ID
            username: Username
            tenant_id: Tenant ID
            error_message: Error message
            endpoint: API endpoint
            status_code: HTTP status code

        Returns:
            Created AuditLog instance
        """
        return await AuditLogger.log(
            db=db,
            action=f"{action}_error",
            user_id=user_id,
            username=username,
            tenant_id=tenant_id,
            endpoint=endpoint,
            status_code=status_code,
            error_message=error_message
        )


# Convenience function for use in route dependencies
async def audit_log(
    db: AsyncSession,
    action: str,
    user: Any,
    **kwargs
) -> AuditLog:
    """
    Simplified audit logging function for use in routes

    Usage:
        await audit_log(db, "predict", user=current_user, score=0.85)
    """
    return await AuditLogger.log(
        db=db,
        action=action,
        user_id=getattr(user, "id", None),
        username=getattr(user, "username", None),
        tenant_id=getattr(user, "tenant_id", None),
        **kwargs
    )
