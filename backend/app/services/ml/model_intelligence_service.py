"""
Model Intelligence Service
Provides backtesting, prediction tracking, departure timeline, and cohort analysis.

Risk thresholds are data-driven, computed from user's actual data distribution.
"""
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import json
import math
import logging

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.churn import ChurnOutput, ChurnModel, ChurnReasoning
from app.models.treatment import RetentionValidation, TreatmentApplication
from app.models.hr_data import HRDataInput
from app.models.monitoring import ModelPerformance
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service
from app.services.utils.risk_helpers import get_risk_thresholds


@dataclass
class BacktestingResult:
    """Result of backtesting analysis"""
    period: str
    total_predictions: int
    high_risk_flagged: int
    actual_churns: int
    correct_predictions: int
    precision: float
    recall: float
    accuracy: float


@dataclass
class PredictionOutcome:
    """Individual prediction outcome tracking"""
    hr_code: str
    full_name: str
    department: str
    predicted_risk: float
    prediction_date: str
    actual_outcome: str  # 'stayed', 'left', 'pending'
    outcome_date: Optional[str]
    was_correct: Optional[bool]
    days_to_outcome: Optional[int]


@dataclass
class DepartureTimeline:
    """Departure timeline prediction for an employee"""
    hr_code: str
    current_risk: float
    predicted_departure_window: str  # e.g., "30-60 days"
    probability_30d: float
    probability_60d: float
    probability_90d: float
    probability_180d: float
    urgency: str  # 'critical', 'high', 'medium', 'low'
    confidence: float


@dataclass
class CohortMember:
    """Member of a cohort comparison"""
    hr_code: str
    full_name: str
    department: str
    position: str
    tenure: float
    risk_score: float
    outcome: str  # 'stayed', 'left', 'active'
    similarity_score: float
    key_factors: List[str]


@dataclass
class CohortAnalysis:
    """Cohort comparison analysis result"""
    target_employee: Dict[str, Any]
    similar_who_left: List[CohortMember]
    similar_who_stayed: List[CohortMember]
    common_risk_factors: List[str]
    retention_insights: List[str]
    recommended_actions: List[str]


class ModelIntelligenceService:
    """Service for model intelligence features with data-driven thresholds."""

    def __init__(self):
        self.thresholds_service = data_driven_thresholds_service

    def _get_risk_thresholds(self, dataset_id: Optional[str] = None) -> Tuple[float, float]:
        """Get data-driven risk thresholds (high, medium). Delegates to shared utility."""
        return get_risk_thresholds(dataset_id)

    def _get_classification_threshold(self, dataset_id: Optional[str] = None) -> float:
        """Get optimal classification threshold for binary classification."""
        return self.thresholds_service.get_classification_threshold(dataset_id)

    async def get_backtesting_results(
        self,
        db: AsyncSession,
        dataset_id: str,
        periods: int = 6
    ) -> Dict[str, Any]:
        """
        Get backtesting results showing historical prediction accuracy.
        Analyzes how well past predictions matched actual outcomes.
        """
        results = []

        # Get all predictions with outcomes from retention_validation
        validations = await db.execute(
            select(RetentionValidation)
            .order_by(desc(RetentionValidation.validation_date))
            .limit(1000)
        )
        validation_records = validations.scalars().all()

        # Get model performance history
        perf_results = await db.execute(
            select(ModelPerformance)
            .order_by(desc(ModelPerformance.evaluation_date))
            .limit(periods)
        )
        perf_records = perf_results.scalars().all()

        # Get data-driven risk threshold
        high_thresh, _ = self._get_risk_thresholds(dataset_id)

        # Calculate backtesting metrics from validation data
        if validation_records:
            # Group by month
            monthly_data: Dict[str, Dict[str, Any]] = {}
            for v in validation_records:
                month_key = v.validation_date.strftime("%Y-%m") if v.validation_date else "unknown"
                if month_key not in monthly_data:
                    monthly_data[month_key] = {
                        "total": 0,
                        "high_risk": 0,
                        "churned": 0,
                        "correct": 0
                    }

                monthly_data[month_key]["total"] += 1
                is_high_risk = float(v.baseline_churn_prob or 0) > high_thresh
                if is_high_risk:
                    monthly_data[month_key]["high_risk"] += 1

                if not v.still_employed:
                    monthly_data[month_key]["churned"] += 1
                    if is_high_risk:
                        monthly_data[month_key]["correct"] += 1
                elif v.still_employed and not is_high_risk:
                    monthly_data[month_key]["correct"] += 1

            # Build results
            for month, data in sorted(monthly_data.items(), reverse=True)[:periods]:
                total = data["total"]
                if total > 0:
                    precision = data["correct"] / data["high_risk"] if data["high_risk"] > 0 else 0
                    recall = data["correct"] / data["churned"] if data["churned"] > 0 else 0
                    accuracy = data["correct"] / total

                    results.append(BacktestingResult(
                        period=month,
                        total_predictions=total,
                        high_risk_flagged=data["high_risk"],
                        actual_churns=data["churned"],
                        correct_predictions=data["correct"],
                        precision=round(precision, 3),
                        recall=round(recall, 3),
                        accuracy=round(accuracy, 3)
                    ))

        # If no validation data, use model performance records
        if not results and perf_records:
            for perf in perf_records:
                results.append(BacktestingResult(
                    period=perf.evaluation_date.strftime("%Y-%m") if perf.evaluation_date else "unknown",
                    total_predictions=perf.total_predictions or 0,
                    high_risk_flagged=perf.total_predictions // 3 if perf.total_predictions else 0,
                    actual_churns=perf.correct_predictions or 0,
                    correct_predictions=perf.correct_predictions or 0,
                    precision=float(perf.precision_score or 0),
                    recall=float(perf.recall_score or 0),
                    accuracy=float(perf.accuracy or 0)
                ))

        # Calculate aggregate stats
        if results:
            total_predictions = sum(r.total_predictions for r in results)
            total_flagged = sum(r.high_risk_flagged for r in results)
            total_churns = sum(r.actual_churns for r in results)
            total_correct = sum(r.correct_predictions for r in results)

            aggregate = {
                "total_predictions_analyzed": total_predictions,
                "total_high_risk_flagged": total_flagged,
                "total_actual_churns": total_churns,
                "total_correct_predictions": total_correct,
                "overall_precision": round(total_correct / total_flagged, 3) if total_flagged > 0 else 0,
                "overall_recall": round(total_correct / total_churns, 3) if total_churns > 0 else 0,
                "overall_accuracy": round(total_correct / total_predictions, 3) if total_predictions > 0 else 0,
                "catch_rate_message": f"We caught {round((total_correct / total_churns) * 100) if total_churns > 0 else 0}% of employees who left"
            }
        else:
            aggregate = {
                "total_predictions_analyzed": 0,
                "total_high_risk_flagged": 0,
                "total_actual_churns": 0,
                "total_correct_predictions": 0,
                "overall_precision": 0,
                "overall_recall": 0,
                "overall_accuracy": 0,
                "catch_rate_message": "No historical data available yet"
            }

        return {
            "periods": [asdict(r) for r in results],
            "aggregate": aggregate,
            "generated_at": datetime.utcnow().isoformat()
        }

    async def get_prediction_outcomes(
        self,
        db: AsyncSession,
        dataset_id: str,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get individual prediction outcomes - what we predicted vs what happened.
        """
        outcomes = []

        # Get predictions with validation outcomes
        # Use DISTINCT ON to avoid duplicates when hr_data_input has multiple rows per hr_code
        # We pick the most recent HRDataInput entry per hr_code
        subquery = (
            select(
                HRDataInput.hr_code,
                HRDataInput.full_name,
                HRDataInput.structure_name,
                HRDataInput.status,
                HRDataInput.termination_date,
                func.row_number().over(
                    partition_by=HRDataInput.hr_code,
                    order_by=desc(HRDataInput.id)
                ).label('rn')
            )
            .subquery()
        )

        query = (
            select(
                ChurnOutput.hr_code,
                ChurnOutput.resign_proba,
                ChurnOutput.generated_at,
                subquery.c.full_name,
                subquery.c.structure_name,
                subquery.c.status,
                subquery.c.termination_date
            )
            .join(subquery, and_(
                ChurnOutput.hr_code == subquery.c.hr_code,
                subquery.c.rn == 1
            ))
            .where(ChurnOutput.dataset_id == dataset_id)
            .order_by(desc(ChurnOutput.resign_proba))
            .limit(limit)
        )

        result = await db.execute(query)
        records = result.all()

        # Get optimal classification threshold (data-driven)
        classification_threshold = self._get_classification_threshold(dataset_id)

        for r in records:
            status_lower = (r.status or "").lower()
            is_left = any(k in status_lower for k in ["resign", "terminated", "left", "inactive", "exit"])

            if is_left:
                actual_outcome = "left"
                # Use data-driven threshold instead of hardcoded 0.5
                was_correct = float(r.resign_proba or 0) >= classification_threshold
            else:
                actual_outcome = "stayed"
                was_correct = float(r.resign_proba or 0) < classification_threshold

            prediction_date = r.generated_at.strftime("%Y-%m-%d") if r.generated_at else None
            outcome_date = r.termination_date if is_left else None

            # Calculate days to outcome if applicable
            days_to_outcome = None
            if is_left and r.generated_at and r.termination_date:
                try:
                    term_date = datetime.strptime(str(r.termination_date), "%Y-%m-%d") if isinstance(r.termination_date, str) else r.termination_date
                    days_to_outcome = (term_date - r.generated_at).days
                except (ValueError, TypeError, AttributeError) as e:
                    logger.debug(f"Could not calculate days to outcome for {r.hr_code}: {e}")

            outcomes.append(PredictionOutcome(
                hr_code=r.hr_code,
                full_name=r.full_name or "Unknown",
                department=r.structure_name or "Unknown",
                predicted_risk=round(float(r.resign_proba or 0), 3),
                prediction_date=prediction_date,
                actual_outcome=actual_outcome,
                outcome_date=str(outcome_date) if outcome_date else None,
                was_correct=was_correct,
                days_to_outcome=days_to_outcome
            ))

        # Calculate summary stats using data-driven threshold
        high_thresh, _ = self._get_risk_thresholds(dataset_id)
        total = len(outcomes)
        correct = sum(1 for o in outcomes if o.was_correct)
        left = sum(1 for o in outcomes if o.actual_outcome == "left")
        high_risk_left = sum(1 for o in outcomes if o.actual_outcome == "left" and o.predicted_risk > high_thresh)

        return {
            "outcomes": [asdict(o) for o in outcomes],
            "summary": {
                "total_tracked": total,
                "correct_predictions": correct,
                "accuracy": round(correct / total, 3) if total > 0 else 0,
                "employees_who_left": left,
                "high_risk_who_left": high_risk_left,
                "prediction_fulfilled_rate": round(high_risk_left / left, 3) if left > 0 else 0
            },
            "generated_at": datetime.utcnow().isoformat()
        }

    async def get_departure_timeline(
        self,
        db: AsyncSession,
        hr_code: str,
        dataset_id: str
    ) -> Optional[DepartureTimeline]:
        """
        Predict when an employee is likely to leave using survival analysis.

        Uses the SurvivalAnalysisService for proper Cox PH model predictions
        when available, with fallback to risk-based approximation.
        """
        from app.services.ml.survival_analysis_service import survival_service

        # Try to get prediction from survival model
        try:
            survival_pred = await survival_service.predict_survival(db, hr_code, dataset_id)

            if survival_pred:
                # Also get current risk score for reference
                result = await db.execute(
                    select(ChurnOutput.resign_proba)
                    .where(
                        ChurnOutput.hr_code == hr_code,
                        ChurnOutput.dataset_id == dataset_id
                    )
                )
                risk_row = result.scalar_one_or_none()
                current_risk = float(risk_row) if risk_row else survival_pred.prob_90_days

                return DepartureTimeline(
                    hr_code=hr_code,
                    current_risk=round(current_risk, 3),
                    predicted_departure_window=survival_pred.departure_window,
                    probability_30d=survival_pred.prob_30_days,
                    probability_60d=survival_pred.prob_60_days,
                    probability_90d=survival_pred.prob_90_days,
                    probability_180d=survival_pred.prob_180_days,
                    urgency=survival_pred.urgency,
                    confidence=survival_pred.confidence
                )
        except Exception as e:
            # Log and fall through to legacy method
            import logging
            logging.getLogger(__name__).warning(f"Survival prediction failed: {e}")

        # Fallback: Legacy risk-based estimation
        result = await db.execute(
            select(ChurnOutput)
            .where(
                ChurnOutput.hr_code == hr_code,
                ChurnOutput.dataset_id == dataset_id
            )
        )
        prediction = result.scalar_one_or_none()

        if not prediction:
            return None

        current_risk = float(prediction.resign_proba or 0)
        confidence = float(prediction.confidence_score or 70) / 100

        # Exponential decay model: P(leave by time t) = 1 - exp(-lambda * t)
        hazard_rate = current_risk * 0.1

        prob_30d = 1 - math.exp(-hazard_rate * 1)
        prob_60d = 1 - math.exp(-hazard_rate * 2)
        prob_90d = 1 - math.exp(-hazard_rate * 3)
        prob_180d = 1 - math.exp(-hazard_rate * 6)

        # Get data-driven thresholds for urgency classification
        high_thresh, medium_thresh = self._get_risk_thresholds(dataset_id)
        critical_thresh = min(0.9, high_thresh + 0.2)

        # Determine departure window based on probabilities (statistical, not data-specific)
        if prob_30d >= 0.5:
            window = "< 30 days"
            urgency = "critical"
        elif prob_60d >= 0.5:
            window = "30-60 days"
            urgency = "high"
        elif prob_90d >= 0.5:
            window = "60-90 days"
            urgency = "high"
        elif prob_180d >= 0.5:
            window = "3-6 months"
            urgency = "medium"
        else:
            window = "6+ months"
            urgency = "low"

        # Override urgency based on data-driven risk thresholds
        if current_risk >= critical_thresh:
            urgency = "critical"
        elif current_risk >= high_thresh:
            urgency = "high" if urgency not in ["critical"] else urgency

        return DepartureTimeline(
            hr_code=hr_code,
            current_risk=round(current_risk, 3),
            predicted_departure_window=window,
            probability_30d=round(min(prob_30d, 0.99), 3),
            probability_60d=round(min(prob_60d, 0.99), 3),
            probability_90d=round(min(prob_90d, 0.99), 3),
            probability_180d=round(min(prob_180d, 0.99), 3),
            urgency=urgency,
            confidence=round(confidence, 3)
        )

    async def get_batch_departure_timelines(
        self,
        db: AsyncSession,
        dataset_id: str,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """Get departure timelines for ALL employees (sorted by risk)."""
        # Get all employees with predictions, sorted by risk
        result = await db.execute(
            select(ChurnOutput.hr_code)
            .where(ChurnOutput.dataset_id == dataset_id)
            .order_by(desc(ChurnOutput.resign_proba))
            .limit(limit)
        )
        hr_codes = [r[0] for r in result.all()]

        timelines = []
        for hr_code in hr_codes:
            timeline = await self.get_departure_timeline(db, hr_code, dataset_id)
            if timeline:
                timelines.append(asdict(timeline))

        return timelines

    async def get_cohort_analysis(
        self,
        db: AsyncSession,
        hr_code: str,
        dataset_id: str
    ) -> Optional[CohortAnalysis]:
        """
        Get cohort comparison analysis - find similar employees and their outcomes.
        """
        # Get target employee data
        target_result = await db.execute(
            select(HRDataInput, ChurnOutput)
            .join(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
            .where(
                HRDataInput.hr_code == hr_code,
                ChurnOutput.dataset_id == dataset_id
            )
        )
        target_data = target_result.first()

        if not target_data:
            return None

        target_emp, target_churn = target_data
        target_dept = target_emp.structure_name
        target_position = target_emp.position
        target_tenure = float(target_emp.tenure or 0)
        target_risk = float(target_churn.resign_proba or 0)

        # Find similar employees (same department or similar tenure)
        similar_query = (
            select(HRDataInput, ChurnOutput)
            .join(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
            .where(
                ChurnOutput.dataset_id == dataset_id,
                HRDataInput.hr_code != hr_code,
                or_(
                    HRDataInput.structure_name == target_dept,
                    HRDataInput.position == target_position
                )
            )
            .limit(50)
        )

        similar_result = await db.execute(similar_query)
        similar_records = similar_result.all()

        similar_who_left = []
        similar_who_stayed = []

        for emp, churn in similar_records:
            status_lower = (emp.status or "").lower()
            is_left = any(k in status_lower for k in ["resign", "terminated", "left", "inactive", "exit"])

            # Calculate similarity score
            similarity = 0.0
            key_factors = []

            if emp.structure_name == target_dept:
                similarity += 0.4
                key_factors.append("Same department")
            if emp.position == target_position:
                similarity += 0.3
                key_factors.append("Same position")

            tenure_diff = abs(float(emp.tenure or 0) - target_tenure)
            if tenure_diff <= 1:
                similarity += 0.2
                key_factors.append("Similar tenure")
            elif tenure_diff <= 2:
                similarity += 0.1
                key_factors.append("Close tenure")

            risk_diff = abs(float(churn.resign_proba or 0) - target_risk)
            if risk_diff <= 0.1:
                similarity += 0.1
                key_factors.append("Similar risk profile")

            member = CohortMember(
                hr_code=emp.hr_code,
                full_name=emp.full_name or "Unknown",
                department=emp.structure_name or "Unknown",
                position=emp.position or "Unknown",
                tenure=float(emp.tenure or 0),
                risk_score=round(float(churn.resign_proba or 0), 3),
                outcome="left" if is_left else "stayed",
                similarity_score=round(similarity, 2),
                key_factors=key_factors
            )

            if is_left:
                similar_who_left.append(member)
            else:
                similar_who_stayed.append(member)

        # Sort by similarity
        similar_who_left.sort(key=lambda x: x.similarity_score, reverse=True)
        similar_who_stayed.sort(key=lambda x: x.similarity_score, reverse=True)

        # Identify common risk factors using data-driven thresholds
        high_thresh, _ = self._get_risk_thresholds(dataset_id)
        common_risk_factors = []
        if similar_who_left:
            avg_risk_left = sum(m.risk_score for m in similar_who_left) / len(similar_who_left)
            if avg_risk_left > high_thresh:
                common_risk_factors.append("High risk scores common among those who left")

            dept_count = sum(1 for m in similar_who_left if m.department == target_dept)
            if dept_count > len(similar_who_left) * 0.5:
                common_risk_factors.append(f"High turnover in {target_dept} department")

        # Generate insights
        retention_insights = []
        if similar_who_stayed:
            avg_tenure_stayed = sum(m.tenure for m in similar_who_stayed) / len(similar_who_stayed)
            retention_insights.append(f"Similar employees who stayed have avg tenure of {avg_tenure_stayed:.1f} years")

        if len(similar_who_left) > len(similar_who_stayed):
            retention_insights.append("More similar employees have left than stayed - elevated risk")
        else:
            retention_insights.append("More similar employees have stayed - positive sign")

        # Generate recommended actions using data-driven threshold
        recommended_actions = []
        if target_risk > high_thresh:
            recommended_actions.append("Schedule immediate retention conversation")
        if similar_who_left:
            recommended_actions.append("Review what differentiated those who stayed")
        recommended_actions.append("Consider targeted development opportunities")

        return CohortAnalysis(
            target_employee={
                "hr_code": hr_code,
                "full_name": target_emp.full_name,
                "department": target_dept,
                "position": target_position,
                "tenure": target_tenure,
                "risk_score": round(target_risk, 3)
            },
            similar_who_left=[asdict(m) for m in similar_who_left[:5]],
            similar_who_stayed=[asdict(m) for m in similar_who_stayed[:5]],
            common_risk_factors=common_risk_factors,
            retention_insights=retention_insights,
            recommended_actions=recommended_actions
        )

    async def get_cohort_overview(
        self,
        db: AsyncSession,
        dataset_id: str
    ) -> Dict[str, Any]:
        """Get an overview of cohorts for the dashboard."""
        # Get department-level cohort stats
        dept_query = (
            select(
                HRDataInput.structure_name,
                func.count(HRDataInput.hr_code).label('total'),
                func.avg(ChurnOutput.resign_proba).label('avg_risk')
            )
            .join(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
            .where(ChurnOutput.dataset_id == dataset_id)
            .group_by(HRDataInput.structure_name)
            .order_by(desc('avg_risk'))
        )

        dept_result = await db.execute(dept_query)
        dept_stats = dept_result.all()

        # Get tenure cohort stats
        tenure_cohorts = []
        tenure_ranges = [(0, 1, "0-1 years"), (1, 3, "1-3 years"), (3, 5, "3-5 years"), (5, 100, "5+ years")]

        for min_t, max_t, label in tenure_ranges:
            tenure_query = (
                select(
                    func.count(HRDataInput.hr_code).label('total'),
                    func.avg(ChurnOutput.resign_proba).label('avg_risk')
                )
                .join(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
                .where(
                    ChurnOutput.dataset_id == dataset_id,
                    HRDataInput.tenure >= min_t,
                    HRDataInput.tenure < max_t
                )
            )
            result = await db.execute(tenure_query)
            row = result.first()
            if row and row.total:
                tenure_cohorts.append({
                    "range": label,
                    "total": row.total,
                    "avg_risk": round(float(row.avg_risk or 0), 3)
                })

        return {
            "department_cohorts": [
                {
                    "department": d.structure_name or "Unknown",
                    "total": d.total,
                    "avg_risk": round(float(d.avg_risk or 0), 3)
                }
                for d in dept_stats[:10]
            ],
            "tenure_cohorts": tenure_cohorts,
            "generated_at": datetime.utcnow().isoformat()
        }


# Singleton instance
model_intelligence_service = ModelIntelligenceService()
