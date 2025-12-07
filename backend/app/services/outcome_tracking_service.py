"""
Outcome Tracking Service

Tracks predictions vs actual outcomes to validate model accuracy over time.
This is critical for understanding if the churn predictions are actually useful.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import logging

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.hr_data import HRDataInput


logger = logging.getLogger(__name__)


@dataclass
class PredictionOutcome:
    """Tracks a single prediction's outcome"""
    hr_code: str
    full_name: str
    department: str
    predicted_risk: float
    prediction_date: str
    risk_level: str  # 'high', 'medium', 'low'
    actual_outcome: str  # 'left', 'stayed', 'pending'
    outcome_date: Optional[str]
    prediction_correct: Optional[bool]
    days_to_outcome: Optional[int]


@dataclass
class RealizedMetrics:
    """Realized accuracy metrics from outcome tracking"""
    total_predictions: int
    verified_predictions: int

    # Of employees flagged high-risk, how many actually left?
    high_risk_flagged: int
    high_risk_left: int
    realized_precision: float  # high_risk_left / high_risk_flagged

    # Of employees who left, how many were flagged high-risk?
    total_left: int
    flagged_before_leaving: int
    realized_recall: float  # flagged_before_leaving / total_left

    # Overall accuracy
    correct_predictions: int
    accuracy: float

    # Time-based metrics
    avg_days_to_departure: Optional[float]
    predictions_within_90_days: int


class OutcomeTrackingService:
    """
    Service for tracking prediction outcomes and calculating realized accuracy.

    This answers the critical question: "Did our predictions actually come true?"
    """

    def __init__(self):
        self.high_risk_threshold = 0.60
        self.medium_risk_threshold = 0.30

    async def verify_predictions(
        self,
        db: AsyncSession,
        dataset_id: str,
        lookback_days: int = 90
    ) -> Dict[str, Any]:
        """
        Verify past predictions against actual outcomes.

        Looks at predictions made N days ago and checks if they came true.
        """
        cutoff_date = datetime.utcnow() - timedelta(days=lookback_days)

        # Get all predictions made before the cutoff
        query = (
            select(
                ChurnOutput.hr_code,
                ChurnOutput.resign_proba,
                ChurnOutput.generated_at,
                ChurnOutput.confidence_score,
                HRDataInput.full_name,
                HRDataInput.structure_name,
                HRDataInput.status,
                HRDataInput.termination_date
            )
            .join(HRDataInput, and_(
                ChurnOutput.hr_code == HRDataInput.hr_code,
                ChurnOutput.dataset_id == HRDataInput.dataset_id
            ))
            .where(
                ChurnOutput.dataset_id == dataset_id,
                ChurnOutput.generated_at <= cutoff_date
            )
        )

        result = await db.execute(query)
        predictions = result.all()

        outcomes = []
        for p in predictions:
            risk_score = float(p.resign_proba or 0)
            status_lower = (p.status or '').lower()

            # Determine if employee left
            left_indicators = ['left', 'resigned', 'terminated', 'exit', 'departed', 'inactive']
            actually_left = any(ind in status_lower for ind in left_indicators)

            # Determine risk level at prediction time
            if risk_score >= self.high_risk_threshold:
                risk_level = 'high'
            elif risk_score >= self.medium_risk_threshold:
                risk_level = 'medium'
            else:
                risk_level = 'low'

            # Determine if prediction was correct
            if actually_left:
                actual_outcome = 'left'
                prediction_correct = risk_score >= 0.5  # Predicted would leave
            else:
                actual_outcome = 'stayed'
                prediction_correct = risk_score < 0.5  # Predicted would stay

            # Calculate days to outcome
            days_to_outcome = None
            outcome_date = None
            if actually_left and p.termination_date and p.generated_at:
                try:
                    term_date = p.termination_date
                    if isinstance(term_date, str):
                        term_date = datetime.strptime(term_date, '%Y-%m-%d').date()
                    pred_date = p.generated_at.date() if hasattr(p.generated_at, 'date') else p.generated_at
                    days_to_outcome = (term_date - pred_date).days
                    outcome_date = str(term_date)
                except:
                    pass

            outcomes.append(PredictionOutcome(
                hr_code=p.hr_code,
                full_name=p.full_name or 'Unknown',
                department=p.structure_name or 'Unknown',
                predicted_risk=round(risk_score, 3),
                prediction_date=p.generated_at.strftime('%Y-%m-%d') if p.generated_at else None,
                risk_level=risk_level,
                actual_outcome=actual_outcome,
                outcome_date=outcome_date,
                prediction_correct=prediction_correct,
                days_to_outcome=days_to_outcome
            ))

        return {
            'outcomes': [asdict(o) for o in outcomes],
            'count': len(outcomes),
            'lookback_days': lookback_days,
            'cutoff_date': cutoff_date.isoformat()
        }

    async def calculate_realized_metrics(
        self,
        db: AsyncSession,
        dataset_id: str
    ) -> RealizedMetrics:
        """
        Calculate realized accuracy metrics based on actual outcomes.

        This is the key metric for model validation - how well did we predict?
        """
        # Get all predictions with current employee status
        query = (
            select(
                ChurnOutput.hr_code,
                ChurnOutput.resign_proba,
                ChurnOutput.generated_at,
                HRDataInput.status,
                HRDataInput.termination_date
            )
            .join(HRDataInput, and_(
                ChurnOutput.hr_code == HRDataInput.hr_code,
                ChurnOutput.dataset_id == HRDataInput.dataset_id
            ))
            .where(ChurnOutput.dataset_id == dataset_id)
        )

        result = await db.execute(query)
        predictions = result.all()

        total_predictions = len(predictions)
        high_risk_flagged = 0
        high_risk_left = 0
        total_left = 0
        flagged_before_leaving = 0
        correct_predictions = 0
        days_list = []
        predictions_within_90 = 0

        for p in predictions:
            risk_score = float(p.resign_proba or 0)
            status_lower = (p.status or '').lower()

            left_indicators = ['left', 'resigned', 'terminated', 'exit', 'departed', 'inactive']
            actually_left = any(ind in status_lower for ind in left_indicators)

            is_high_risk = risk_score >= self.high_risk_threshold

            if is_high_risk:
                high_risk_flagged += 1
                if actually_left:
                    high_risk_left += 1

            if actually_left:
                total_left += 1
                if risk_score >= 0.5:
                    flagged_before_leaving += 1

                # Calculate days to departure
                if p.termination_date and p.generated_at:
                    try:
                        term_date = p.termination_date
                        if isinstance(term_date, str):
                            term_date = datetime.strptime(term_date, '%Y-%m-%d').date()
                        pred_date = p.generated_at.date() if hasattr(p.generated_at, 'date') else p.generated_at
                        days = (term_date - pred_date).days
                        if days >= 0:
                            days_list.append(days)
                            if days <= 90:
                                predictions_within_90 += 1
                    except:
                        pass

            # Count correct predictions
            if actually_left and risk_score >= 0.5:
                correct_predictions += 1
            elif not actually_left and risk_score < 0.5:
                correct_predictions += 1

        # Calculate metrics
        realized_precision = high_risk_left / high_risk_flagged if high_risk_flagged > 0 else 0
        realized_recall = flagged_before_leaving / total_left if total_left > 0 else 0
        accuracy = correct_predictions / total_predictions if total_predictions > 0 else 0
        avg_days = sum(days_list) / len(days_list) if days_list else None

        return RealizedMetrics(
            total_predictions=total_predictions,
            verified_predictions=total_predictions,  # All have final status
            high_risk_flagged=high_risk_flagged,
            high_risk_left=high_risk_left,
            realized_precision=round(realized_precision, 3),
            total_left=total_left,
            flagged_before_leaving=flagged_before_leaving,
            realized_recall=round(realized_recall, 3),
            correct_predictions=correct_predictions,
            accuracy=round(accuracy, 3),
            avg_days_to_departure=round(avg_days, 1) if avg_days else None,
            predictions_within_90_days=predictions_within_90
        )

    async def get_accuracy_by_cohort(
        self,
        db: AsyncSession,
        dataset_id: str
    ) -> Dict[str, Any]:
        """
        Get accuracy metrics broken down by risk cohort and time.
        """
        metrics = await self.calculate_realized_metrics(db, dataset_id)

        # Get department-level breakdown
        dept_query = (
            select(
                HRDataInput.structure_name,
                func.count(ChurnOutput.hr_code).label('total'),
                func.avg(ChurnOutput.resign_proba).label('avg_risk')
            )
            .join(HRDataInput, and_(
                ChurnOutput.hr_code == HRDataInput.hr_code,
                ChurnOutput.dataset_id == HRDataInput.dataset_id
            ))
            .where(ChurnOutput.dataset_id == dataset_id)
            .group_by(HRDataInput.structure_name)
        )

        dept_result = await db.execute(dept_query)
        dept_stats = dept_result.all()

        return {
            'overall': asdict(metrics),
            'by_department': [
                {
                    'department': d.structure_name or 'Unknown',
                    'predictions': d.total,
                    'avg_risk': round(float(d.avg_risk or 0), 3)
                }
                for d in dept_stats
            ],
            'interpretation': self._interpret_metrics(metrics),
            'generated_at': datetime.utcnow().isoformat()
        }

    def _interpret_metrics(self, metrics: RealizedMetrics) -> Dict[str, str]:
        """Generate human-readable interpretation of metrics."""
        interpretations = {}

        # Precision interpretation
        if metrics.realized_precision >= 0.7:
            interpretations['precision'] = f"Excellent: {metrics.realized_precision:.0%} of high-risk flags resulted in actual departures"
        elif metrics.realized_precision >= 0.5:
            interpretations['precision'] = f"Good: {metrics.realized_precision:.0%} of high-risk flags were correct"
        elif metrics.realized_precision >= 0.3:
            interpretations['precision'] = f"Moderate: Only {metrics.realized_precision:.0%} of high-risk flags were correct - may have too many false positives"
        else:
            interpretations['precision'] = f"Poor: {metrics.realized_precision:.0%} precision - model is flagging too many false positives"

        # Recall interpretation
        if metrics.realized_recall >= 0.7:
            interpretations['recall'] = f"Excellent: Caught {metrics.realized_recall:.0%} of employees who actually left"
        elif metrics.realized_recall >= 0.5:
            interpretations['recall'] = f"Good: Caught {metrics.realized_recall:.0%} of departures"
        elif metrics.realized_recall >= 0.3:
            interpretations['recall'] = f"Moderate: Only caught {metrics.realized_recall:.0%} of departures - many were missed"
        else:
            interpretations['recall'] = f"Poor: Only caught {metrics.realized_recall:.0%} of departures - model is missing most at-risk employees"

        # Overall assessment
        if metrics.realized_precision >= 0.6 and metrics.realized_recall >= 0.6:
            interpretations['overall'] = "Model is performing well - predictions are reliable"
        elif metrics.realized_precision >= 0.5 or metrics.realized_recall >= 0.5:
            interpretations['overall'] = "Model shows promise but needs improvement"
        else:
            interpretations['overall'] = "Model needs retraining or more/better data"

        return interpretations


# Singleton instance
outcome_tracking_service = OutcomeTrackingService()
