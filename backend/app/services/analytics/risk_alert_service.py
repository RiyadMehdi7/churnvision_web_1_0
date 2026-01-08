"""
Risk Alert Service
Detects and manages risk change alerts for employees.

Alert thresholds are data-driven, computed from historical risk change distribution.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import uuid
import json

from sqlalchemy import select, func, and_, or_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.hr_data import HRDataInput
from app.models.monitoring import ModelAlert
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service


@dataclass
class RiskAlert:
    """Risk alert for an employee"""
    id: str
    hr_code: str
    full_name: str
    department: str
    alert_type: str  # 'risk_increase', 'entered_high_risk', 'critical_risk', 'new_high_risk'
    severity: str  # 'critical', 'high', 'medium', 'low'
    previous_risk: float
    current_risk: float
    change_amount: float
    change_percent: float
    message: str
    context: str  # What might have triggered this
    recommended_action: str
    created_at: str
    is_read: bool


class RiskAlertService:
    """
    Service for detecting and managing risk alerts.

    Thresholds are data-driven:
    - Risk level thresholds come from prediction distribution (percentile-based)
    - Risk change thresholds come from historical change distribution (std-based)
    """

    # Fallback thresholds (only used if no data-driven thresholds available)
    DEFAULT_SIGNIFICANT_INCREASE_THRESHOLD = 0.15
    DEFAULT_HIGH_RISK_THRESHOLD = 0.6
    DEFAULT_CRITICAL_RISK_THRESHOLD = 0.8

    def __init__(self):
        self.thresholds_service = data_driven_thresholds_service

    def _get_risk_thresholds(self, dataset_id: Optional[str] = None) -> tuple:
        """Get data-driven risk thresholds (critical, high, significant_change)."""
        thresholds = self.thresholds_service.get_cached_thresholds(dataset_id)

        if thresholds and thresholds.risk_high_threshold > 0:
            high = thresholds.risk_high_threshold
            # Critical is top tier - use p95 or high + 20%
            critical = min(0.9, high + 0.2)
        else:
            high = self.DEFAULT_HIGH_RISK_THRESHOLD
            critical = self.DEFAULT_CRITICAL_RISK_THRESHOLD

        # Get change thresholds
        change_thresholds = self.thresholds_service.get_risk_change_thresholds(dataset_id)
        significant_change = change_thresholds.get("significant", self.DEFAULT_SIGNIFICANT_INCREASE_THRESHOLD)
        moderate_change = change_thresholds.get("moderate", 0.1)

        return critical, high, significant_change, moderate_change

    async def detect_risk_changes(
        self,
        db: AsyncSession,
        dataset_id: str,
        comparison_hours: int = 24
    ) -> List[RiskAlert]:
        """
        Detect employees whose risk has changed significantly.
        Compares current predictions with historical data.
        Uses data-driven thresholds for alert generation.
        """
        alerts = []
        cutoff_time = datetime.utcnow() - timedelta(hours=comparison_hours)

        # Get data-driven thresholds for this dataset
        critical_thresh, high_thresh, significant_change, moderate_change = self._get_risk_thresholds(dataset_id)

        # Get current predictions
        current_result = await db.execute(
            select(
                ChurnOutput.hr_code,
                ChurnOutput.resign_proba,
                ChurnOutput.generated_at,
                HRDataInput.full_name,
                HRDataInput.structure_name,
                HRDataInput.position
            )
            .join(HRDataInput, ChurnOutput.hr_code == HRDataInput.hr_code)
            .where(ChurnOutput.dataset_id == dataset_id)
        )
        current_predictions = {r.hr_code: r for r in current_result.all()}

        # Get reasoning data which might have older risk scores
        reasoning_result = await db.execute(
            select(ChurnReasoning)
            .where(ChurnReasoning.updated_at < cutoff_time)
        )
        old_reasoning = {r.hr_code: r for r in reasoning_result.scalars().all()}

        # Detect changes
        for hr_code, current in current_predictions.items():
            current_risk = float(current.resign_proba or 0)

            # Get previous risk from reasoning or estimate
            previous_risk = 0.0
            if hr_code in old_reasoning:
                previous_risk = float(old_reasoning[hr_code].churn_risk or 0)
            else:
                # If no old data, check if this is a new high-risk entry
                if current_risk >= high_thresh:
                    alert = self._create_alert(
                        hr_code=hr_code,
                        full_name=current.full_name or "Unknown",
                        department=current.structure_name or "Unknown",
                        alert_type="new_high_risk",
                        previous_risk=0,
                        current_risk=current_risk,
                        dataset_id=dataset_id
                    )
                    alerts.append(alert)
                continue

            change = current_risk - previous_risk

            # Check for significant increase (using data-driven threshold)
            if change >= significant_change:
                alert_type = "risk_increase"
                if current_risk >= critical_thresh:
                    alert_type = "critical_risk"
                elif current_risk >= high_thresh and previous_risk < high_thresh:
                    alert_type = "entered_high_risk"

                alert = self._create_alert(
                    hr_code=hr_code,
                    full_name=current.full_name or "Unknown",
                    department=current.structure_name or "Unknown",
                    alert_type=alert_type,
                    previous_risk=previous_risk,
                    current_risk=current_risk,
                    dataset_id=dataset_id
                )
                alerts.append(alert)

        # Sort by severity and change amount
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        alerts.sort(key=lambda a: (severity_order.get(a.severity, 4), -a.change_amount))

        return alerts

    def _create_alert(
        self,
        hr_code: str,
        full_name: str,
        department: str,
        alert_type: str,
        previous_risk: float,
        current_risk: float,
        dataset_id: Optional[str] = None
    ) -> RiskAlert:
        """Create a risk alert with appropriate messaging using data-driven thresholds."""
        change = current_risk - previous_risk
        change_pct = (change / previous_risk * 100) if previous_risk > 0 else 100

        # Get data-driven thresholds
        critical_thresh, high_thresh, significant_change, moderate_change = self._get_risk_thresholds(dataset_id)

        # Determine severity using data-driven thresholds
        if current_risk >= critical_thresh:
            severity = "critical"
        elif current_risk >= high_thresh:
            severity = "high"
        elif change >= significant_change:
            severity = "high"
        elif change >= moderate_change:
            severity = "medium"
        else:
            severity = "low"

        # Generate message based on alert type
        if alert_type == "critical_risk":
            message = f"{full_name}'s risk reached critical level ({current_risk:.0%})"
            context = "Risk score is now in the critical zone requiring immediate attention"
            action = "Schedule urgent 1:1 meeting within 48 hours"
        elif alert_type == "entered_high_risk":
            message = f"{full_name} entered high-risk zone ({previous_risk:.0%} → {current_risk:.0%})"
            context = "Employee crossed the high-risk threshold"
            action = "Review recent changes and schedule retention conversation"
        elif alert_type == "new_high_risk":
            message = f"{full_name} identified as high-risk ({current_risk:.0%})"
            context = "Newly identified high-risk employee"
            action = "Add to priority monitoring list and assess retention options"
        else:
            message = f"{full_name}'s risk increased significantly ({previous_risk:.0%} → {current_risk:.0%})"
            context = f"Risk increased by {change:.0%} points"
            action = "Monitor closely and consider proactive engagement"

        return RiskAlert(
            id=str(uuid.uuid4()),
            hr_code=hr_code,
            full_name=full_name,
            department=department,
            alert_type=alert_type,
            severity=severity,
            previous_risk=round(previous_risk, 3),
            current_risk=round(current_risk, 3),
            change_amount=round(change, 3),
            change_percent=round(change_pct, 1),
            message=message,
            context=context,
            recommended_action=action,
            created_at=datetime.utcnow().isoformat(),
            is_read=False
        )

    async def get_recent_alerts(
        self,
        db: AsyncSession,
        dataset_id: str,
        limit: int = 20,
        include_read: bool = False
    ) -> Dict[str, Any]:
        """Get recent alerts, optionally filtering out read ones."""
        # First detect current alerts
        alerts = await self.detect_risk_changes(db, dataset_id)

        # Also get persisted alerts from database
        query = select(ModelAlert).order_by(desc(ModelAlert.created_at)).limit(limit)
        if not include_read:
            query = query.where(ModelAlert.resolved == 0)

        db_result = await db.execute(query)
        db_alerts = db_result.scalars().all()

        # Convert DB alerts to RiskAlert format
        for db_alert in db_alerts:
            try:
                details = json.loads(db_alert.details) if db_alert.details else {}
                alert = RiskAlert(
                    id=db_alert.id,
                    hr_code=details.get("hr_code", ""),
                    full_name=details.get("full_name", "Unknown"),
                    department=details.get("department", "Unknown"),
                    alert_type=db_alert.alert_type,
                    severity=db_alert.severity,
                    previous_risk=details.get("previous_risk", 0),
                    current_risk=details.get("current_risk", 0),
                    change_amount=details.get("change_amount", 0),
                    change_percent=details.get("change_percent", 0),
                    message=db_alert.message,
                    context=details.get("context", ""),
                    recommended_action=details.get("recommended_action", ""),
                    created_at=db_alert.created_at.isoformat() if db_alert.created_at else "",
                    is_read=db_alert.resolved == 1
                )
                # Avoid duplicates
                if not any(a.hr_code == alert.hr_code and a.alert_type == alert.alert_type for a in alerts):
                    alerts.append(alert)
            except (KeyError, TypeError, AttributeError) as e:
                logger.debug(f"Could not parse alert {db_alert.id}: {e}")
                continue
            except Exception as e:
                logger.warning(f"Unexpected error parsing alert {db_alert.id}: {type(e).__name__}: {e}")
                continue

        # Sort and limit
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        alerts.sort(key=lambda a: (severity_order.get(a.severity, 4), a.created_at), reverse=False)
        alerts = alerts[:limit]

        # Count by severity
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for alert in alerts:
            if alert.severity in severity_counts:
                severity_counts[alert.severity] += 1

        unread_count = sum(1 for a in alerts if not a.is_read)

        return {
            "alerts": [asdict(a) for a in alerts],
            "total_count": len(alerts),
            "unread_count": unread_count,
            "severity_counts": severity_counts,
            "generated_at": datetime.utcnow().isoformat()
        }

    async def mark_alert_read(
        self,
        db: AsyncSession,
        alert_id: str
    ) -> bool:
        """Mark an alert as read."""
        await db.execute(
            update(ModelAlert)
            .where(ModelAlert.id == alert_id)
            .values(resolved=1, resolved_at=datetime.utcnow())
        )
        await db.commit()
        return True

    async def mark_all_read(
        self,
        db: AsyncSession
    ) -> int:
        """Mark all alerts as read."""
        result = await db.execute(
            update(ModelAlert)
            .where(ModelAlert.resolved == 0)
            .values(resolved=1, resolved_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount

    async def persist_alert(
        self,
        db: AsyncSession,
        alert: RiskAlert
    ) -> str:
        """Persist an alert to the database."""
        db_alert = ModelAlert(
            id=alert.id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            message=alert.message,
            details=json.dumps({
                "hr_code": alert.hr_code,
                "full_name": alert.full_name,
                "department": alert.department,
                "previous_risk": alert.previous_risk,
                "current_risk": alert.current_risk,
                "change_amount": alert.change_amount,
                "change_percent": alert.change_percent,
                "context": alert.context,
                "recommended_action": alert.recommended_action
            }),
            resolved=0
        )
        db.add(db_alert)
        await db.commit()
        return alert.id


# Singleton instance
risk_alert_service = RiskAlertService()
