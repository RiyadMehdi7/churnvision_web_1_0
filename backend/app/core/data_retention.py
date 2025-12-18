"""
Data retention enforcement for GDPR compliance.
Automatically cleans up old data based on configured retention policies.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy import delete, select, func, text, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal

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

    # Refresh tokens - keep revoked/expired for audit trail then delete
    REFRESH_TOKEN_DAYS: int = 30

    # Agent insights - organizational learning data
    AGENT_INSIGHTS_DAYS: int = 180


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

            # Allowlist of valid table names to prevent SQL injection
            ALLOWED_CHAT_TABLES = frozenset({"chat_messages", "chat_history", "agent_memory"})

            for table_name in ALLOWED_CHAT_TABLES:
                try:
                    # Use identifier quoting for additional safety (though allowlist is primary defense)
                    from sqlalchemy import text as sql_text
                    result = await db.execute(
                        sql_text(f'DELETE FROM "{table_name}" WHERE created_at < :cutoff'),
                        {"cutoff": cutoff_date}
                    )
                    deleted_total += result.rowcount
                except Exception as e:
                    # Log the error but continue - table may not exist or have different schema
                    logger.debug(f"Could not clean up table {table_name}: {e}")

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

    async def cleanup_refresh_tokens(self, db: AsyncSession) -> int:
        """
        Delete expired and revoked refresh tokens beyond retention period.

        Tokens are kept briefly after expiration/revocation for:
        - Security auditing (detecting token reuse attacks)
        - Debugging authentication issues
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.REFRESH_TOKEN_DAYS)

            try:
                from app.models.refresh_token import RefreshToken

                # Delete tokens that are both old AND (expired OR revoked)
                result = await db.execute(
                    delete(RefreshToken).where(
                        RefreshToken.created_at < cutoff_date,
                        or_(
                            RefreshToken.expires_at < datetime.utcnow(),
                            RefreshToken.revoked_at.isnot(None)
                        )
                    )
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} expired/revoked refresh tokens")
                return deleted_count
            except ImportError:
                logger.debug("RefreshToken model not found, skipping cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup refresh tokens: {e}")
            await db.rollback()
            return 0

    async def cleanup_prediction_history(self, db: AsyncSession) -> int:
        """
        Delete old churn prediction records beyond retention period.

        Preserves recent predictions for:
        - Model accuracy tracking
        - Trend analysis
        - Audit compliance
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.PREDICTION_HISTORY_DAYS)

            try:
                from app.models.churn import ChurnOutput

                result = await db.execute(
                    delete(ChurnOutput).where(ChurnOutput.generated_at < cutoff_date)
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} old prediction records")
                return deleted_count
            except ImportError:
                logger.debug("ChurnOutput model not found, skipping prediction cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup prediction history: {e}")
            await db.rollback()
            return 0

    async def cleanup_temp_uploads(self) -> int:
        """
        Delete orphaned temporary upload files beyond retention period.

        Cleans up files from:
        - RAG document uploads that failed processing
        - Abandoned file uploads
        - Temporary analysis files
        """
        deleted_count = 0
        cutoff_time = datetime.utcnow() - timedelta(days=self.policy.TEMP_UPLOADS_DAYS)

        # Directories to clean
        upload_paths = [
            getattr(settings, 'RAG_UPLOAD_PATH', './churnvision_data/uploads/rag'),
        ]

        for upload_dir in upload_paths:
            upload_path = Path(upload_dir)
            if not upload_path.exists():
                continue

            try:
                for file_path in upload_path.iterdir():
                    if not file_path.is_file():
                        continue

                    # Check file modification time
                    try:
                        mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if mtime < cutoff_time:
                            file_path.unlink()
                            deleted_count += 1
                            logger.debug(f"Deleted old temp file: {file_path.name}")
                    except OSError as e:
                        logger.warning(f"Could not delete temp file {file_path}: {e}")

            except Exception as e:
                logger.error(f"Error scanning upload directory {upload_dir}: {e}")

        if deleted_count > 0:
            logger.info(f"Deleted {deleted_count} orphaned temporary files")

        return deleted_count

    async def cleanup_agent_insights(self, db: AsyncSession) -> int:
        """
        Delete old agent insights beyond retention period.

        Preserves organizational learning patterns while removing
        stale conversational insights.
        """
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.policy.AGENT_INSIGHTS_DAYS)

            try:
                from app.models.agent_memory import AgentInsight

                result = await db.execute(
                    delete(AgentInsight).where(AgentInsight.created_at < cutoff_date)
                )
                deleted_count = result.rowcount
                await db.commit()
                logger.info(f"Deleted {deleted_count} old agent insights")
                return deleted_count
            except ImportError:
                logger.debug("AgentInsight model not found, skipping cleanup")
                return 0

        except Exception as e:
            logger.error(f"Failed to cleanup agent insights: {e}")
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
            "refresh_tokens": 0,
            "prediction_history": 0,
            "temp_uploads": 0,
            "agent_insights": 0,
            "timestamp": datetime.utcnow().isoformat(),
            "success": True,
        }

        # Database cleanup tasks
        async with AsyncSessionLocal() as db:
            try:
                results["audit_logs"] = await self.cleanup_audit_logs(db)
                results["sessions"] = await self.cleanup_expired_sessions(db)
                results["chat_history"] = await self.cleanup_chat_history(db)
                results["departed_employees"] = await self.anonymize_departed_employees(db)
                results["failed_logins"] = await self.cleanup_failed_logins(db)
                results["refresh_tokens"] = await self.cleanup_refresh_tokens(db)
                results["prediction_history"] = await self.cleanup_prediction_history(db)
                results["agent_insights"] = await self.cleanup_agent_insights(db)
            except Exception as e:
                logger.error(f"Data retention cleanup failed: {e}")
                results["success"] = False
                results["error"] = str(e)

        # File system cleanup tasks (no DB session needed)
        try:
            results["temp_uploads"] = await self.cleanup_temp_uploads()
        except Exception as e:
            logger.error(f"Temp uploads cleanup failed: {e}")
            results["success"] = False
            results["error"] = results.get("error", "") + f"; Temp uploads: {e}"

        total_deleted = sum(
            v for k, v in results.items()
            if isinstance(v, int)
        )
        logger.info(f"Data retention cleanup complete. Total records processed: {total_deleted}")

        return results

    async def generate_retention_report(self) -> dict:
        """
        Generate a comprehensive report of data subject to retention policies.

        Returns:
            Report containing:
            - Current policy settings
            - Counts of records pending cleanup for each data type
            - Storage usage for temp files
            - Compliance status
        """
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "policies": {
                "audit_logs_retention_days": self.policy.AUDIT_LOGS_DAYS,
                "chat_history_retention_days": self.policy.CHAT_HISTORY_DAYS,
                "departed_employee_anonymize_days": self.policy.DEPARTED_EMPLOYEE_ANONYMIZE_DAYS,
                "prediction_history_retention_days": self.policy.PREDICTION_HISTORY_DAYS,
                "refresh_token_retention_days": self.policy.REFRESH_TOKEN_DAYS,
                "temp_uploads_retention_days": self.policy.TEMP_UPLOADS_DAYS,
                "agent_insights_retention_days": self.policy.AGENT_INSIGHTS_DAYS,
            },
            "pending_cleanup": {},
            "storage": {},
            "compliance_status": "compliant",
        }

        async with AsyncSessionLocal() as db:
            # Count audit logs pending cleanup
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
                report["pending_cleanup"]["audit_logs"] = "unavailable"

            # Count refresh tokens pending cleanup
            try:
                from app.models.refresh_token import RefreshToken
                cutoff = datetime.utcnow() - timedelta(days=self.policy.REFRESH_TOKEN_DAYS)
                result = await db.execute(
                    select(func.count()).select_from(RefreshToken).where(
                        RefreshToken.created_at < cutoff,
                        or_(
                            RefreshToken.expires_at < datetime.utcnow(),
                            RefreshToken.revoked_at.isnot(None)
                        )
                    )
                )
                report["pending_cleanup"]["refresh_tokens"] = result.scalar() or 0
            except Exception:
                report["pending_cleanup"]["refresh_tokens"] = "unavailable"

            # Count prediction records pending cleanup
            try:
                from app.models.churn import ChurnOutput
                cutoff = datetime.utcnow() - timedelta(days=self.policy.PREDICTION_HISTORY_DAYS)
                result = await db.execute(
                    select(func.count()).select_from(ChurnOutput).where(
                        ChurnOutput.generated_at < cutoff
                    )
                )
                report["pending_cleanup"]["prediction_history"] = result.scalar() or 0
            except Exception:
                report["pending_cleanup"]["prediction_history"] = "unavailable"

            # Count agent insights pending cleanup
            try:
                from app.models.agent_memory import AgentInsight
                cutoff = datetime.utcnow() - timedelta(days=self.policy.AGENT_INSIGHTS_DAYS)
                result = await db.execute(
                    select(func.count()).select_from(AgentInsight).where(
                        AgentInsight.created_at < cutoff
                    )
                )
                report["pending_cleanup"]["agent_insights"] = result.scalar() or 0
            except Exception:
                report["pending_cleanup"]["agent_insights"] = "unavailable"

        # Check temp upload storage
        try:
            upload_path = Path(getattr(settings, 'RAG_UPLOAD_PATH', './churnvision_data/uploads/rag'))
            if upload_path.exists():
                cutoff_time = datetime.utcnow() - timedelta(days=self.policy.TEMP_UPLOADS_DAYS)
                total_size = 0
                stale_count = 0
                stale_size = 0

                for file_path in upload_path.iterdir():
                    if file_path.is_file():
                        size = file_path.stat().st_size
                        total_size += size
                        mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if mtime < cutoff_time:
                            stale_count += 1
                            stale_size += size

                report["storage"]["temp_uploads"] = {
                    "total_files": sum(1 for _ in upload_path.iterdir() if _.is_file()),
                    "total_size_mb": round(total_size / (1024 * 1024), 2),
                    "stale_files": stale_count,
                    "stale_size_mb": round(stale_size / (1024 * 1024), 2),
                }
                report["pending_cleanup"]["temp_uploads"] = stale_count
            else:
                report["storage"]["temp_uploads"] = {"status": "directory_not_found"}
                report["pending_cleanup"]["temp_uploads"] = 0
        except Exception as e:
            report["storage"]["temp_uploads"] = {"error": str(e)}
            report["pending_cleanup"]["temp_uploads"] = "unavailable"

        # Determine compliance status
        total_pending = sum(
            v for v in report["pending_cleanup"].values()
            if isinstance(v, int)
        )
        if total_pending > 1000:
            report["compliance_status"] = "action_required"
        elif total_pending > 100:
            report["compliance_status"] = "review_recommended"

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
