"""
Data retention enforcement for GDPR compliance.
Automatically cleans up old data based on configured retention policies.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import delete, select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session_maker

logger = logging.getLogger("churnvision.data_retention")


class RetentionPolicy:
    """Configuration for data retention periods."""

    # Audit logs - keep for compliance
    AUDIT_LOGS_DAYS: int = 90

    # Prediction history - for model accuracy tracking
    PREDICTION_HISTORY_DAYS: int = 365

    # Chat/session history
    CHAT_HISTORY_DAYS: int = 30

    # Temporary uploads
    TEMP_UPLOADS_DAYS: int = 7

    # Inactive user sessions
    INACTIVE_SESSIONS_DAYS: int = 7

    # Failed login attempts
    FAILED_LOGIN_DAYS: int = 30

    # Anonymization period for departed employees
    DEPARTED_EMPLOYEE_ANONYMIZE_DAYS: int = 90


class DataRetentionService:
    """
    Service for enforcing data retention policies.

    This service:
    - Deletes old audit logs beyond retention period
    - Cleans up expired sessions
    - Removes old chat history
    - Anonymizes departed employee data
    - Generates compliance reports
    """

    def __init__(self, policy: Optional[RetentionPolicy] = None):
        self.policy = policy or RetentionPolicy()
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def cleanup_audit_logs(self, db: AsyncSession) -> int:
        """Delete audit logs older than retention period."""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.AUDIT_LOGS_DAYS)

            # Check if AuditLog model exists
            try:
                from app.models.audit import AuditLog
                result = await db.execute(
                    delete(AuditLog).where(AuditLog.timestamp < cutoff_date)
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} audit logs older than {self.policy.AUDIT_LOGS_DAYS} days")
                return deleted_count
            except ImportError:
                logger.debug("AuditLog model not found, skipping audit log cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup audit logs: {e}")
            await db.rollback()
            return 0

    async def cleanup_expired_sessions(self, db: AsyncSession) -> int:
        """Delete expired user sessions."""
        try:
            try:
                from app.models.session import UserSession
                result = await db.execute(
                    delete(UserSession).where(UserSession.expires_at < datetime.utcnow())
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} expired sessions")
                return deleted_count
            except ImportError:
                logger.debug("UserSession model not found, skipping session cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup expired sessions: {e}")
            await db.rollback()
            return 0

    async def cleanup_chat_history(self, db: AsyncSession) -> int:
        """Delete old chat history."""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.CHAT_HISTORY_DAYS)

            # Try multiple possible chat history tables
            deleted_total = 0

            for table_name in ["chat_messages", "chat_history", "agent_memory"]:
                try:
                    result = await db.execute(
                        text(f"DELETE FROM {table_name} WHERE created_at < :cutoff"),
                        {"cutoff": cutoff_date}
                    )
                    deleted_total += result.rowcount
                except Exception:
                    pass  # Table doesn't exist or different schema

            if deleted_total > 0:
                await db.commit()
                logger.info(f"Deleted {deleted_total} old chat messages")

            return deleted_total

        except Exception as e:
            logger.error(f"Failed to cleanup chat history: {e}")
            await db.rollback()
            return 0

    async def anonymize_departed_employees(self, db: AsyncSession) -> int:
        """
        Anonymize data for employees who left beyond retention period.
        Preserves aggregate statistics while removing PII.
        """
        try:
            try:
                from app.models.employee import Employee

                cutoff_date = datetime.utcnow() - timedelta(
                    days=self.policy.DEPARTED_EMPLOYEE_ANONYMIZE_DAYS
                )

                # Find employees to anonymize
                result = await db.execute(
                    select(Employee).where(
                        Employee.is_active == False,
                        Employee.updated_at < cutoff_date,
                        Employee.full_name.notlike("ANONYMIZED_%")  # Not already anonymized
                    )
                )
                employees = result.scalars().all()

                anonymized_count = 0
                for emp in employees:
                    # Generate anonymous identifier
                    anon_id = f"ANONYMIZED_{emp.id}"

                    # Clear PII fields
                    emp.full_name = anon_id
                    emp.email = None if hasattr(emp, "email") else None

                    # Keep aggregate data for analytics
                    # (department, role, tenure, etc. are preserved)

                    anonymized_count += 1

                if anonymized_count > 0:
                    await db.commit()
                    logger.info(f"Anonymized {anonymized_count} departed employee records")

                return anonymized_count

            except ImportError:
                logger.debug("Employee model not found, skipping anonymization")
                return 0

        except Exception as e:
            logger.error(f"Failed to anonymize departed employees: {e}")
            await db.rollback()
            return 0

    async def cleanup_failed_logins(self, db: AsyncSession) -> int:
        """Delete old failed login attempt records."""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.FAILED_LOGIN_DAYS)

            try:
                from app.models.user import FailedLoginAttempt
                result = await db.execute(
                    delete(FailedLoginAttempt).where(
                        FailedLoginAttempt.attempted_at < cutoff_date
                    )
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} old failed login records")
                return deleted_count
            except ImportError:
                logger.debug("FailedLoginAttempt model not found, skipping cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup failed logins: {e}")
            await db.rollback()
            return 0

    async def run_all_cleanups(self) -> dict:
        """Run all retention cleanup tasks."""
        logger.info("Starting data retention cleanup...")

        results = {
            "audit_logs": 0,
            "sessions": 0,
            "chat_history": 0,
            "departed_employees": 0,
            "failed_logins": 0,
            "timestamp": datetime.utcnow().isoformat(),
            "success": True,
        }

        async with async_session_maker() as db:
            try:
                results["audit_logs"] = await self.cleanup_audit_logs(db)
                results["sessions"] = await self.cleanup_expired_sessions(db)
                results["chat_history"] = await self.cleanup_chat_history(db)
                results["departed_employees"] = await self.anonymize_departed_employees(db)
                results["failed_logins"] = await self.cleanup_failed_logins(db)
            except Exception as e:
                logger.error(f"Data retention cleanup failed: {e}")
                results["success"] = False
                results["error"] = str(e)

        total_deleted = sum(
            v for k, v in results.items()
            if isinstance(v, int)
        )
        logger.info(f"Data retention cleanup complete. Total records processed: {total_deleted}")

        return results

    async def generate_retention_report(self) -> dict:
        """Generate a report of data subject to retention policies."""
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "policies": {
                "audit_logs_retention_days": self.policy.AUDIT_LOGS_DAYS,
                "chat_history_retention_days": self.policy.CHAT_HISTORY_DAYS,
                "departed_employee_anonymize_days": self.policy.DEPARTED_EMPLOYEE_ANONYMIZE_DAYS,
            },
            "pending_cleanup": {},
        }

        async with async_session_maker() as db:
            # Count records pending cleanup
            try:
                from app.models.audit import AuditLog
                cutoff = datetime.utcnow() - timedelta(days=self.policy.AUDIT_LOGS_DAYS)
                result = await db.execute(
                    select(func.count()).select_from(AuditLog).where(
                        AuditLog.timestamp < cutoff
                    )
                )
                report["pending_cleanup"]["audit_logs"] = result.scalar() or 0
            except Exception:
                pass

        return report

    def start_scheduled_cleanup(self, interval_hours: int = 24) -> None:
        """Start background scheduled cleanup task."""
        if self._running:
            logger.warning("Scheduled cleanup already running")
            return

        async def cleanup_loop():
            self._running = True
            while self._running:
                try:
                    await self.run_all_cleanups()
                except Exception as e:
                    logger.error(f"Scheduled cleanup error: {e}")

                # Wait for next interval
                await asyncio.sleep(interval_hours * 3600)

        self._task = asyncio.create_task(cleanup_loop())
        logger.info(f"Data retention cleanup scheduled every {interval_hours} hours")

    def stop_scheduled_cleanup(self) -> None:
        """Stop the scheduled cleanup task."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Data retention cleanup stopped")


# Global service instance
_retention_service: Optional[DataRetentionService] = None


def get_retention_service() -> DataRetentionService:
    """Get the global data retention service."""
    global _retention_service
    if _retention_service is None:
        _retention_service = DataRetentionService()
    return _retention_service
