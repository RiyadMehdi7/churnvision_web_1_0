"""
Churn Reasoning Orchestration Service

This is the main orchestrator that combines all scoring components:
1. ML Prediction (ChurnPredictionService)
2. Heuristic Rules (BusinessRuleEvaluationService)
3. Behavioral Stage (BehavioralStageService)
4. Interview Insights (InterviewInsightService)
5. Final Score Calculation with Dynamic Weighting

The final churn risk is calculated using confidence-based dynamic weighting:
    final_risk = w_ml * ml_score + w_heuristic * heuristic_score + w_stage * stage_score + interview_adjustment

Where weights are adjusted based on confidence levels of each component.
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.services.behavioral_stage_service import behavioral_stage_service, StageResult
from app.services.business_rule_service import business_rule_service, HeuristicResult
from app.services.interview_insight_service import interview_insight_service, InterviewAnalysisResult
from app.services.peer_statistics_service import peer_statistics_service, RiskThresholds


@dataclass
class MLScoreResult:
    """ML prediction result"""
    score: float  # Churn probability (0-1)
    confidence: float  # Model confidence (0-1)
    shap_values: Dict[str, float] = field(default_factory=dict)
    contributing_factors: List[str] = field(default_factory=list)


@dataclass
class ReasoningBreakdown:
    """Detailed breakdown of churn reasoning calculation"""
    # Individual scores
    ml_score: float
    ml_confidence: float
    ml_weight: float

    heuristic_score: float
    heuristic_confidence: float
    heuristic_weight: float

    stage_score: float
    stage_confidence: float
    stage_weight: float

    interview_adjustment: float
    interview_confidence: float

    # Final result
    final_score: float
    final_confidence: float

    # Calculation details
    calculation_formula: str
    weight_rationale: str


@dataclass
class ChurnReasoningResult:
    """Complete churn reasoning result"""
    hr_code: str
    final_churn_risk: float
    risk_level: str  # 'Low', 'Medium', 'High'
    confidence: float

    # Component results
    ml_result: MLScoreResult
    heuristic_result: HeuristicResult
    stage_result: StageResult
    interview_result: Optional[InterviewAnalysisResult]

    # Breakdown
    breakdown: ReasoningBreakdown

    # Actionable outputs
    reasoning_summary: str
    recommendations: List[str]
    alerts: List[str]

    # Metadata
    calculated_at: datetime
    cache_valid_until: datetime


class ChurnReasoningOrchestrator:
    """
    Main orchestrator for the 5-step churn reasoning pipeline.

    Combines ML predictions, business rules, behavioral stages, and
    interview insights into a unified churn risk assessment.
    """

    # Base weights (before confidence adjustment)
    BASE_WEIGHTS = {
        'ml': 0.50,
        'heuristic': 0.30,
        'stage': 0.20
    }

    # Default risk thresholds (used only when not enough data for dynamic calculation)
    DEFAULT_RISK_THRESHOLDS = {
        'high': 0.60,
        'medium': 0.30,
        'low': 0.0
    }

    # Cache settings
    CACHE_TTL_HOURS = 24

    def __init__(self):
        self.stage_service = behavioral_stage_service
        self.rule_service = business_rule_service
        self.interview_service = interview_insight_service
        self.peer_service = peer_statistics_service
        self._dynamic_thresholds: Optional[RiskThresholds] = None

    async def _get_risk_thresholds(self, db: AsyncSession) -> Dict[str, float]:
        """
        Get dynamic risk thresholds based on actual data distribution.
        Falls back to defaults if insufficient data.
        """
        try:
            thresholds = await self.peer_service.calculate_risk_thresholds(db)
            self._dynamic_thresholds = thresholds
            return {
                'high': thresholds.high_threshold,
                'medium': thresholds.medium_threshold,
                'low': 0.0
            }
        except Exception as e:
            print(f"Error calculating dynamic thresholds: {e}")
            return self.DEFAULT_RISK_THRESHOLDS

    async def _get_employee_data(
        self,
        hr_code: str,
        db: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """Fetch employee data from database"""
        try:
            query = select(HRDataInput).where(
                HRDataInput.hr_code == hr_code
            ).order_by(desc(HRDataInput.report_date)).limit(1)

            result = await db.execute(query)
            employee = result.scalar_one_or_none()

            if not employee:
                return None

            return {
                'hr_code': employee.hr_code,
                'full_name': employee.full_name,
                'structure_name': employee.structure_name,
                'position': employee.position,
                'status': employee.status,
                'tenure': float(employee.tenure) if employee.tenure else 0,
                'employee_cost': float(employee.employee_cost) if employee.employee_cost else 0,
                'report_date': employee.report_date,
                'manager_id': employee.manager_id,
                'additional_data': employee.additional_data or {}
            }
        except Exception as e:
            print(f"Error fetching employee data: {e}")
            return None

    async def _get_ml_score(
        self,
        hr_code: str,
        db: AsyncSession
    ) -> MLScoreResult:
        """Get ML prediction score from database"""
        try:
            query = select(ChurnOutput).where(
                ChurnOutput.hr_code == hr_code
            ).order_by(desc(ChurnOutput.generated_at)).limit(1)

            result = await db.execute(query)
            churn_data = result.scalar_one_or_none()

            if churn_data:
                confidence = float(churn_data.confidence_score) / 100 if churn_data.confidence_score else 0.7
                shap_values = churn_data.shap_values or {}

                # Extract contributing factors from SHAP values
                factors = []
                if shap_values:
                    sorted_shap = sorted(shap_values.items(), key=lambda x: abs(x[1]), reverse=True)
                    factors = [f"{k}: {'+' if v > 0 else ''}{v:.3f}" for k, v in sorted_shap[:5]]

                return MLScoreResult(
                    score=float(churn_data.resign_proba),
                    confidence=confidence,
                    shap_values=shap_values,
                    contributing_factors=factors
                )
            else:
                # No ML prediction available, return neutral
                return MLScoreResult(
                    score=0.3,  # Neutral default
                    confidence=0.3,  # Low confidence
                    shap_values={},
                    contributing_factors=['No ML prediction available']
                )

        except Exception as e:
            print(f"Error fetching ML score: {e}")
            return MLScoreResult(
                score=0.3,
                confidence=0.2,
                shap_values={},
                contributing_factors=[f'Error: {str(e)}']
            )

    def _calculate_dynamic_weights(
        self,
        ml_confidence: float,
        heuristic_confidence: float,
        stage_confidence: float
    ) -> Dict[str, float]:
        """
        Calculate dynamic weights based on component confidence levels.

        Higher confidence in a component = higher weight.
        Weights are normalized to sum to 1.0.
        """
        # Adjust base weights by confidence
        # Formula: adjusted_weight = base_weight * (0.5 + 0.5 * confidence)
        ml_adjusted = self.BASE_WEIGHTS['ml'] * (0.5 + 0.5 * ml_confidence)
        heuristic_adjusted = self.BASE_WEIGHTS['heuristic'] * (0.5 + 0.5 * heuristic_confidence)
        stage_adjusted = self.BASE_WEIGHTS['stage'] * (0.5 + 0.5 * stage_confidence)

        # Normalize to sum to 1.0
        total = ml_adjusted + heuristic_adjusted + stage_adjusted
        if total > 0:
            ml_weight = ml_adjusted / total
            heuristic_weight = heuristic_adjusted / total
            stage_weight = stage_adjusted / total
        else:
            # Fallback to equal weights
            ml_weight = heuristic_weight = stage_weight = 1/3

        return {
            'ml': ml_weight,
            'heuristic': heuristic_weight,
            'stage': stage_weight
        }

    def _calculate_final_score(
        self,
        ml_score: float,
        heuristic_score: float,
        stage_score: float,
        interview_adjustment: float,
        weights: Dict[str, float]
    ) -> float:
        """
        Calculate final churn risk score.

        final = (w_ml * ml + w_heuristic * heuristic + w_stage * stage) + interview_adj
        """
        weighted_sum = (
            weights['ml'] * ml_score +
            weights['heuristic'] * heuristic_score +
            weights['stage'] * stage_score
        )

        # Apply interview adjustment (capped at -0.3 to +0.3)
        final = weighted_sum + interview_adjustment

        # Clamp to 0-1 range
        return max(0.0, min(1.0, final))

    def _determine_risk_level(self, score: float, thresholds: Dict[str, float]) -> str:
        """
        Determine risk level from score using dynamic thresholds.
        Thresholds are based on actual data distribution (percentiles).
        """
        if score >= thresholds['high']:
            return 'High'
        elif score >= thresholds['medium']:
            return 'Medium'
        else:
            return 'Low'

    def _generate_reasoning_summary(
        self,
        ml_result: MLScoreResult,
        heuristic_result: HeuristicResult,
        stage_result: StageResult,
        interview_result: Optional[InterviewAnalysisResult],
        final_score: float,
        risk_level: str
    ) -> str:
        """Generate human-readable reasoning summary"""
        parts = []

        # Overall assessment
        parts.append(f"Overall churn risk is {risk_level} ({final_score:.1%}).")

        # ML component
        if ml_result.confidence > 0.5:
            parts.append(f"ML model predicts {ml_result.score:.1%} churn probability with {ml_result.confidence:.0%} confidence.")
        else:
            parts.append("ML prediction has limited confidence; relying more on heuristics.")

        # Stage assessment
        parts.append(f"Employee is in {stage_result.stage_name} stage (tenure-based risk: {stage_result.stage_score:.1%}).")

        # Heuristic triggers
        if heuristic_result.triggered_rules:
            rule_names = [r.rule_name for r in heuristic_result.triggered_rules[:3]]
            parts.append(f"Triggered rules: {', '.join(rule_names)}.")

        # Interview insights
        if interview_result and interview_result.total_interviews > 0:
            sentiment_desc = "positive" if interview_result.average_sentiment > 0.2 else \
                           "negative" if interview_result.average_sentiment < -0.2 else "neutral"
            parts.append(f"Interview data shows {sentiment_desc} sentiment (adjustment: {interview_result.risk_adjustment:+.2f}).")

        return " ".join(parts)

    def _consolidate_recommendations(
        self,
        stage_result: StageResult,
        heuristic_result: HeuristicResult,
        interview_result: Optional[InterviewAnalysisResult],
        risk_level: str
    ) -> List[str]:
        """Consolidate recommendations from all sources"""
        recommendations = []

        # Priority 1: Interview-based (most actionable)
        if interview_result and interview_result.recommendations:
            recommendations.extend(interview_result.recommendations[:2])

        # Priority 2: Heuristic alerts
        if heuristic_result.alerts:
            for alert in heuristic_result.alerts[:2]:
                rec = f"Address: {alert}"
                if rec not in recommendations:
                    recommendations.append(rec)

        # Priority 3: Stage-based recommendations
        if stage_result.recommendations:
            for rec in stage_result.recommendations[:2]:
                if rec not in recommendations:
                    recommendations.append(rec)

        # Add urgency prefix for high risk cases
        if risk_level == 'High' and recommendations:
            recommendations[0] = f"URGENT: {recommendations[0]}"

        return recommendations[:5]

    def _consolidate_alerts(
        self,
        heuristic_result: HeuristicResult,
        interview_result: Optional[InterviewAnalysisResult],
        risk_level: str
    ) -> List[str]:
        """Consolidate alerts from all sources"""
        alerts = []

        # Risk level alert
        if risk_level == 'High':
            alerts.append(f"{risk_level} churn risk detected")

        # Heuristic alerts
        alerts.extend(heuristic_result.alerts)

        # Interview-based alerts
        if interview_result:
            if interview_result.average_sentiment < -0.5:
                alerts.append("Very negative interview sentiment")
            if any('job searching' in s.lower() for insight in interview_result.insights
                   for s in insight.risk_signals):
                alerts.append("Employee may be actively job searching")

        return list(set(alerts))[:5]

    async def calculate_churn_reasoning(
        self,
        hr_code: str,
        db: AsyncSession,
        force_refresh: bool = False
    ) -> ChurnReasoningResult:
        """
        Main orchestration method: Calculate complete churn reasoning for an employee.

        This runs the full 5-step pipeline:
        1. Get employee data
        2. Get ML prediction
        3. Evaluate business rules (heuristics)
        4. Classify behavioral stage
        5. Analyze interviews
        6. Calculate final weighted score

        Args:
            hr_code: Employee identifier
            db: Database session
            force_refresh: If True, ignore cache

        Returns:
            ChurnReasoningResult with complete analysis
        """
        # Check cache first (unless force_refresh)
        if not force_refresh:
            cached = await self._check_cache(hr_code, db)
            if cached:
                return cached

        # Step 1: Get employee data
        employee_data = await self._get_employee_data(hr_code, db)
        if not employee_data:
            raise ValueError(f"Employee not found: {hr_code}")

        # Step 2-5: Run components in parallel for efficiency
        ml_task = asyncio.create_task(self._get_ml_score(hr_code, db))
        heuristic_task = asyncio.create_task(
            self.rule_service.evaluate_employee(employee_data, db)
        )
        stage_task = asyncio.create_task(
            self.stage_service.classify_employee(employee_data, 0.0, db)
        )
        interview_task = asyncio.create_task(
            self.interview_service.analyze_employee(hr_code, db)
        )
        thresholds_task = asyncio.create_task(self._get_risk_thresholds(db))

        # Wait for all components
        ml_result, heuristic_result, stage_result, interview_result, risk_thresholds = await asyncio.gather(
            ml_task, heuristic_task, stage_task, interview_task, thresholds_task
        )

        # Step 6: Calculate dynamic weights
        weights = self._calculate_dynamic_weights(
            ml_result.confidence,
            heuristic_result.confidence,
            stage_result.confidence
        )

        # Interview adjustment (capped)
        interview_adjustment = max(-0.3, min(0.3, interview_result.risk_adjustment))

        # Calculate final score
        final_score = self._calculate_final_score(
            ml_result.score,
            heuristic_result.heuristic_score,
            stage_result.stage_score,
            interview_adjustment,
            weights
        )

        # Determine risk level using dynamic thresholds
        risk_level = self._determine_risk_level(final_score, risk_thresholds)

        # Calculate overall confidence
        overall_confidence = (
            ml_result.confidence * weights['ml'] +
            heuristic_result.confidence * weights['heuristic'] +
            stage_result.confidence * weights['stage']
        )

        # Create breakdown
        breakdown = ReasoningBreakdown(
            ml_score=ml_result.score,
            ml_confidence=ml_result.confidence,
            ml_weight=weights['ml'],
            heuristic_score=heuristic_result.heuristic_score,
            heuristic_confidence=heuristic_result.confidence,
            heuristic_weight=weights['heuristic'],
            stage_score=stage_result.stage_score,
            stage_confidence=stage_result.confidence,
            stage_weight=weights['stage'],
            interview_adjustment=interview_adjustment,
            interview_confidence=interview_result.confidence,
            final_score=final_score,
            final_confidence=overall_confidence,
            calculation_formula=f"({weights['ml']:.2f} × {ml_result.score:.2f}) + "
                               f"({weights['heuristic']:.2f} × {heuristic_result.heuristic_score:.2f}) + "
                               f"({weights['stage']:.2f} × {stage_result.stage_score:.2f}) + "
                               f"({interview_adjustment:+.2f}) = {final_score:.2f}",
            weight_rationale=f"ML conf={ml_result.confidence:.0%}, "
                            f"Heuristic coverage={heuristic_result.coverage:.0%}, "
                            f"Stage conf={stage_result.confidence:.0%}"
        )

        # Generate outputs
        reasoning_summary = self._generate_reasoning_summary(
            ml_result, heuristic_result, stage_result, interview_result,
            final_score, risk_level
        )

        recommendations = self._consolidate_recommendations(
            stage_result, heuristic_result, interview_result, risk_level
        )

        alerts = self._consolidate_alerts(heuristic_result, interview_result, risk_level)

        now = datetime.utcnow()

        result = ChurnReasoningResult(
            hr_code=hr_code,
            final_churn_risk=final_score,
            risk_level=risk_level,
            confidence=overall_confidence,
            ml_result=ml_result,
            heuristic_result=heuristic_result,
            stage_result=stage_result,
            interview_result=interview_result,
            breakdown=breakdown,
            reasoning_summary=reasoning_summary,
            recommendations=recommendations,
            alerts=alerts,
            calculated_at=now,
            cache_valid_until=now + timedelta(hours=self.CACHE_TTL_HOURS)
        )

        # Save to cache/database
        await self._save_to_cache(result, db)

        return result

    async def _check_cache(
        self,
        hr_code: str,
        db: AsyncSession
    ) -> Optional[ChurnReasoningResult]:
        """Check if valid cached reasoning exists"""
        try:
            query = select(ChurnReasoning).where(
                ChurnReasoning.hr_code == hr_code
            )
            result = await db.execute(query)
            cached = result.scalar_one_or_none()

            if cached and cached.updated_at:
                # Check if cache is still valid (24 hours)
                cache_age = datetime.utcnow() - cached.updated_at.replace(tzinfo=None)
                if cache_age.total_seconds() < self.CACHE_TTL_HOURS * 3600:
                    # Return cached result (simplified - would need full reconstruction)
                    return None  # For now, always recalculate for full data

            return None

        except Exception:
            return None

    async def _save_to_cache(
        self,
        result: ChurnReasoningResult,
        db: AsyncSession
    ) -> None:
        """Save reasoning result to database cache"""
        try:
            # Check if record exists
            query = select(ChurnReasoning).where(
                ChurnReasoning.hr_code == result.hr_code
            )
            existing = await db.execute(query)
            reasoning = existing.scalar_one_or_none()

            if reasoning:
                # Update existing
                reasoning.churn_risk = result.final_churn_risk
                reasoning.stage = result.stage_result.stage_name
                reasoning.stage_score = result.stage_result.stage_score
                reasoning.ml_score = result.ml_result.score
                reasoning.heuristic_score = result.heuristic_result.heuristic_score
                reasoning.ml_contributors = "|".join(result.ml_result.contributing_factors)
                reasoning.heuristic_alerts = "|".join(result.alerts)
                reasoning.reasoning = result.reasoning_summary
                reasoning.recommendations = "|".join(result.recommendations)
                reasoning.confidence_level = result.confidence
                reasoning.calculation_breakdown = result.breakdown.calculation_formula
            else:
                # Create new
                reasoning = ChurnReasoning(
                    hr_code=result.hr_code,
                    churn_risk=result.final_churn_risk,
                    stage=result.stage_result.stage_name,
                    stage_score=result.stage_result.stage_score,
                    ml_score=result.ml_result.score,
                    heuristic_score=result.heuristic_result.heuristic_score,
                    ml_contributors="|".join(result.ml_result.contributing_factors),
                    heuristic_alerts="|".join(result.alerts),
                    reasoning=result.reasoning_summary,
                    recommendations="|".join(result.recommendations),
                    confidence_level=result.confidence,
                    calculation_breakdown=result.breakdown.calculation_formula
                )
                db.add(reasoning)

            await db.commit()

        except Exception as e:
            print(f"Error saving to cache: {e}")
            await db.rollback()

    async def calculate_batch(
        self,
        hr_codes: List[str],
        db: AsyncSession,
        max_parallel: int = 6,
        force_refresh: bool = False
    ) -> Dict[str, ChurnReasoningResult]:
        """
        Calculate churn reasoning for multiple employees in parallel.

        Args:
            hr_codes: List of employee identifiers
            db: Database session
            max_parallel: Maximum concurrent calculations
            force_refresh: If True, ignore cache

        Returns:
            Dictionary mapping hr_code to ChurnReasoningResult
        """
        results = {}

        # Process in batches to limit concurrency
        for i in range(0, len(hr_codes), max_parallel):
            batch = hr_codes[i:i + max_parallel]

            # Create tasks for batch
            tasks = [
                self.calculate_churn_reasoning(hr_code, db, force_refresh)
                for hr_code in batch
            ]

            # Wait for batch to complete
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            for hr_code, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    print(f"Error processing {hr_code}: {result}")
                else:
                    results[hr_code] = result

        return results


# Singleton instance
churn_reasoning_orchestrator = ChurnReasoningOrchestrator()
