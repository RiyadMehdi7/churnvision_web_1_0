"""
Recommendation Service

Generates, stores, and manages formal treatment recommendations.
This bridges the gap between treatment simulations and actionable recommendations
that HR can review and approve.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, date, timedelta
import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, func

from app.models.treatment import (
    TreatmentDefinition,
    TreatmentApplication,
    TreatmentRecommendation
)
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput
from app.services.treatment_service import treatment_validation_service
from app.services.treatment_mapping_service import treatment_mapping_service
from app.services.eltv_service import eltv_service

logger = logging.getLogger(__name__)


@dataclass
class RecommendationResult:
    """Result of generating a recommendation"""
    recommendation_id: int
    employee_id: str
    employee_name: str
    current_risk_level: str
    churn_probability: float
    recommended_treatment_id: int
    recommended_treatment_name: str
    treatment_cost: float
    projected_churn_reduction: float
    projected_eltv_gain: float
    projected_roi: float
    reasoning: str
    priority_score: float
    expires_date: date


class RecommendationService:
    """
    Service for generating and managing formal treatment recommendations.

    This service:
    1. Generates ranked treatment recommendations using ML model predictions
    2. Stores recommendations in the database for HR review
    3. Tracks recommendation lifecycle (pending, approved, rejected, expired)
    4. Provides bulk recommendation generation for high-risk employees
    """

    # Risk level thresholds
    HIGH_RISK_THRESHOLD = 0.7
    MEDIUM_RISK_THRESHOLD = 0.4

    # Recommendation validity period (days)
    DEFAULT_EXPIRY_DAYS = 30

    def __init__(self):
        pass

    def get_risk_level(self, churn_probability: float) -> str:
        """Determine risk level from churn probability"""
        if churn_probability >= self.HIGH_RISK_THRESHOLD:
            return "High"
        elif churn_probability >= self.MEDIUM_RISK_THRESHOLD:
            return "Medium"
        return "Low"

    async def generate_recommendation(
        self,
        db: AsyncSession,
        employee_hr_code: str,
        treatment_id: Optional[int] = None,
        use_ml_model: bool = True,
        created_by: str = "system",
        reasoning_override: Optional[str] = None
    ) -> RecommendationResult:
        """
        Generate a formal treatment recommendation for an employee.

        If treatment_id is not provided, automatically selects the best treatment
        based on ROI analysis.

        Args:
            db: Database session
            employee_hr_code: Employee HR code
            treatment_id: Optional specific treatment ID (auto-selects if None)
            use_ml_model: Whether to use ML model for simulation
            created_by: Who created the recommendation
            reasoning_override: Optional custom reasoning text

        Returns:
            RecommendationResult with details of the created recommendation
        """
        # Import here to avoid circular dependency
        from app.services.churn_prediction_service import churn_prediction_service

        # 1. Get employee data
        query = select(HRDataInput).where(
            HRDataInput.hr_code == employee_hr_code
        ).order_by(desc(HRDataInput.report_date)).limit(1)
        result = await db.execute(query)
        employee = result.scalar_one_or_none()

        if not employee:
            raise ValueError(f"Employee {employee_hr_code} not found")

        # 2. Get current churn probability
        query = select(ChurnOutput).where(
            ChurnOutput.hr_code == employee_hr_code
        ).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await db.execute(query)
        churn_data = result.scalar_one_or_none()

        current_churn = float(churn_data.resign_proba) if churn_data else 0.5
        risk_level = self.get_risk_level(current_churn)

        # 3. If no treatment specified, find the best one
        if treatment_id is None:
            best_treatment = await self._find_best_treatment(
                db=db,
                employee_hr_code=employee_hr_code,
                employee=employee,
                current_churn=current_churn,
                use_ml_model=use_ml_model
            )
            treatment_id = best_treatment['treatment_id']
            simulation_result = best_treatment['simulation']
        else:
            # Simulate the specified treatment
            if use_ml_model:
                simulation_result = await treatment_validation_service.apply_treatment_simulation_ml(
                    db=db,
                    employee_hr_code=employee_hr_code,
                    treatment_id=treatment_id
                )
            else:
                simulation_result = await treatment_validation_service.apply_treatment_simulation(
                    db=db,
                    employee_hr_code=employee_hr_code,
                    treatment_id=treatment_id
                )

        # 4. Calculate priority score
        priority_score = self._calculate_priority_score(
            churn_probability=current_churn,
            projected_roi=simulation_result['roi'],
            eltv_gain=simulation_result['treatment_effect_eltv']
        )

        # 5. Generate reasoning
        reasoning = reasoning_override or self._generate_reasoning(
            employee=employee,
            current_churn=current_churn,
            simulation_result=simulation_result,
            risk_level=risk_level
        )

        # 6. Create recommendation record
        salary = float(employee.employee_cost) if employee.employee_cost else 50000

        recommendation = TreatmentRecommendation(
            employee_id=employee_hr_code,
            hr_code=employee_hr_code,
            recommendation_date=date.today(),
            churn_probability=current_churn,
            risk_level=risk_level,
            recommended_treatments=json.dumps([{
                'treatment_id': treatment_id,
                'treatment_name': simulation_result['treatment_name'],
                'cost': simulation_result['treatment_cost'],
                'projected_churn_reduction': simulation_result['pre_churn_probability'] - simulation_result['post_churn_probability'],
                'projected_roi': simulation_result['roi']
            }]),
            reasoning=reasoning,
            priority_score=priority_score,
            estimated_impact=simulation_result['pre_churn_probability'] - simulation_result['post_churn_probability'],
            estimated_cost=simulation_result['treatment_cost'],
            estimated_roi=simulation_result['roi'],
            recommendation_status='pending',
            expires_date=date.today() + timedelta(days=self.DEFAULT_EXPIRY_DAYS),
            model_version="ml_counterfactual_v1" if use_ml_model else "heuristic_v1"
        )

        db.add(recommendation)
        await db.commit()
        await db.refresh(recommendation)

        return RecommendationResult(
            recommendation_id=recommendation.id,
            employee_id=employee_hr_code,
            employee_name=employee.full_name or employee_hr_code,
            current_risk_level=risk_level,
            churn_probability=current_churn,
            recommended_treatment_id=treatment_id,
            recommended_treatment_name=simulation_result['treatment_name'],
            treatment_cost=simulation_result['treatment_cost'],
            projected_churn_reduction=simulation_result['pre_churn_probability'] - simulation_result['post_churn_probability'],
            projected_eltv_gain=simulation_result['treatment_effect_eltv'],
            projected_roi=simulation_result['roi'],
            reasoning=reasoning,
            priority_score=priority_score,
            expires_date=recommendation.expires_date
        )

    async def _find_best_treatment(
        self,
        db: AsyncSession,
        employee_hr_code: str,
        employee: HRDataInput,
        current_churn: float,
        use_ml_model: bool
    ) -> Dict[str, Any]:
        """Find the best treatment for an employee based on ROI"""
        # Get all active treatments
        query = select(TreatmentDefinition).where(TreatmentDefinition.is_active == 1)
        result = await db.execute(query)
        treatments = result.scalars().all()

        best_treatment = None
        best_roi = float('-inf')

        for treatment in treatments:
            try:
                if use_ml_model:
                    simulation = await treatment_validation_service.apply_treatment_simulation_ml(
                        db=db,
                        employee_hr_code=employee_hr_code,
                        treatment_id=treatment.id
                    )
                else:
                    simulation = await treatment_validation_service.apply_treatment_simulation(
                        db=db,
                        employee_hr_code=employee_hr_code,
                        treatment_id=treatment.id
                    )

                roi = simulation['roi'] if isinstance(simulation['roi'], (int, float)) else 0

                if roi > best_roi:
                    best_roi = roi
                    best_treatment = {
                        'treatment_id': treatment.id,
                        'treatment_name': treatment.name,
                        'simulation': simulation
                    }

            except Exception as e:
                logger.warning(f"Failed to simulate treatment {treatment.id}: {e}")
                continue

        if not best_treatment:
            raise ValueError("No suitable treatment found for employee")

        return best_treatment

    def _calculate_priority_score(
        self,
        churn_probability: float,
        projected_roi: float,
        eltv_gain: float
    ) -> float:
        """
        Calculate priority score for recommendation ranking.

        Higher score = more urgent/impactful recommendation.
        """
        # Normalize ROI (cap at 500%)
        roi_normalized = min(projected_roi, 500) / 500

        # Risk urgency weight
        if churn_probability >= 0.7:
            risk_weight = 1.0
        elif churn_probability >= 0.4:
            risk_weight = 0.7
        else:
            risk_weight = 0.4

        # ELTV impact weight (normalize by typical salary ~$60k)
        eltv_weight = min(eltv_gain / 60000, 1.0)

        # Composite score (0-1 scale)
        priority = (
            risk_weight * 0.4 +
            roi_normalized * 0.35 +
            eltv_weight * 0.25
        )

        return round(priority, 2)

    def _generate_reasoning(
        self,
        employee: HRDataInput,
        current_churn: float,
        simulation_result: Dict[str, Any],
        risk_level: str
    ) -> str:
        """Generate human-readable reasoning for the recommendation"""
        churn_reduction = simulation_result['pre_churn_probability'] - simulation_result['post_churn_probability']
        roi = simulation_result['roi']

        reasoning_parts = []

        # Risk context
        if risk_level == "High":
            reasoning_parts.append(
                f"{employee.full_name} is at HIGH risk of leaving with a {current_churn*100:.0f}% churn probability."
            )
        elif risk_level == "Medium":
            reasoning_parts.append(
                f"{employee.full_name} has MODERATE churn risk ({current_churn*100:.0f}%)."
            )

        # Treatment impact
        reasoning_parts.append(
            f"Applying '{simulation_result['treatment_name']}' is projected to reduce "
            f"churn risk by {churn_reduction*100:.1f} percentage points."
        )

        # ROI justification
        if roi > 100:
            reasoning_parts.append(
                f"This intervention shows strong ROI of {roi:.0f}%, making it a financially sound decision."
            )
        elif roi > 0:
            reasoning_parts.append(
                f"The projected ROI of {roi:.0f}% indicates a positive return on this investment."
            )

        # ELTV impact
        eltv_gain = simulation_result['treatment_effect_eltv']
        if eltv_gain > 10000:
            reasoning_parts.append(
                f"Expected ELTV increase of ${eltv_gain:,.0f} justifies the treatment cost."
            )

        return " ".join(reasoning_parts)

    async def get_pending_recommendations(
        self,
        db: AsyncSession,
        department_filter: Optional[str] = None,
        risk_level_filter: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get all pending recommendations for review"""
        query = select(TreatmentRecommendation).where(
            TreatmentRecommendation.recommendation_status == 'pending'
        )

        if risk_level_filter:
            query = query.where(TreatmentRecommendation.risk_level == risk_level_filter)

        query = query.order_by(
            desc(TreatmentRecommendation.priority_score)
        ).limit(limit)

        result = await db.execute(query)
        recommendations = result.scalars().all()

        # Enrich with employee data
        enriched = []
        for rec in recommendations:
            # Get employee info
            emp_query = select(HRDataInput).where(
                HRDataInput.hr_code == rec.hr_code
            ).order_by(desc(HRDataInput.report_date)).limit(1)
            emp_result = await db.execute(emp_query)
            employee = emp_result.scalar_one_or_none()

            if department_filter and employee:
                if employee.structure_name != department_filter:
                    continue

            treatments = json.loads(rec.recommended_treatments) if rec.recommended_treatments else []

            enriched.append({
                'recommendation_id': rec.id,
                'employee_id': rec.employee_id,
                'employee_name': employee.full_name if employee else rec.employee_id,
                'department': employee.structure_name if employee else 'Unknown',
                'position': employee.position if employee else 'Unknown',
                'risk_level': rec.risk_level,
                'churn_probability': float(rec.churn_probability),
                'recommended_treatments': treatments,
                'priority_score': float(rec.priority_score),
                'estimated_impact': float(rec.estimated_impact) if rec.estimated_impact else 0,
                'estimated_cost': float(rec.estimated_cost) if rec.estimated_cost else 0,
                'estimated_roi': float(rec.estimated_roi) if rec.estimated_roi else 0,
                'reasoning': rec.reasoning,
                'recommendation_date': rec.recommendation_date.isoformat(),
                'expires_date': rec.expires_date.isoformat() if rec.expires_date else None,
                'status': rec.recommendation_status
            })

        return enriched

    async def approve_recommendation(
        self,
        db: AsyncSession,
        recommendation_id: int,
        approved_by: str,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve a recommendation and create a treatment application.
        """
        # Get recommendation
        query = select(TreatmentRecommendation).where(
            TreatmentRecommendation.id == recommendation_id
        )
        result = await db.execute(query)
        recommendation = result.scalar_one_or_none()

        if not recommendation:
            raise ValueError(f"Recommendation {recommendation_id} not found")

        if recommendation.recommendation_status != 'pending':
            raise ValueError(f"Recommendation is already {recommendation.recommendation_status}")

        # Parse recommended treatment
        treatments = json.loads(recommendation.recommended_treatments)
        if not treatments:
            raise ValueError("No treatment in recommendation")

        treatment_info = treatments[0]
        treatment_id = treatment_info['treatment_id']

        # Run final simulation and create application
        simulation_result = await treatment_validation_service.apply_treatment_simulation_ml(
            db=db,
            employee_hr_code=recommendation.hr_code,
            treatment_id=treatment_id
        )

        # Record the treatment application
        application = await treatment_validation_service.record_treatment_application(
            db=db,
            employee_hr_code=recommendation.hr_code,
            treatment_id=treatment_id,
            simulation_results=simulation_result,
            is_simulation=False,
            applied_by=approved_by,
            notes=notes or f"Approved recommendation #{recommendation_id}"
        )

        # Update recommendation status
        recommendation.recommendation_status = 'approved'
        recommendation.applied_treatment_id = application.id
        await db.commit()

        return {
            'recommendation_id': recommendation_id,
            'status': 'approved',
            'application_id': application.id,
            'employee_id': recommendation.hr_code,
            'treatment_name': simulation_result['treatment_name'],
            'approved_by': approved_by
        }

    async def reject_recommendation(
        self,
        db: AsyncSession,
        recommendation_id: int,
        rejection_reason: str,
        rejected_by: str
    ) -> Dict[str, Any]:
        """Reject a recommendation with a reason"""
        query = select(TreatmentRecommendation).where(
            TreatmentRecommendation.id == recommendation_id
        )
        result = await db.execute(query)
        recommendation = result.scalar_one_or_none()

        if not recommendation:
            raise ValueError(f"Recommendation {recommendation_id} not found")

        recommendation.recommendation_status = 'rejected'
        recommendation.rejection_reason = rejection_reason
        await db.commit()

        return {
            'recommendation_id': recommendation_id,
            'status': 'rejected',
            'rejection_reason': rejection_reason,
            'rejected_by': rejected_by
        }

    async def generate_bulk_recommendations(
        self,
        db: AsyncSession,
        risk_level_filter: Optional[str] = "High",
        department_filter: Optional[str] = None,
        max_recommendations: int = 20
    ) -> List[RecommendationResult]:
        """
        Generate recommendations for multiple high-risk employees at once.

        This is useful for batch processing and proactive retention campaigns.
        """
        # Build query for employees
        query = select(HRDataInput, ChurnOutput).join(
            ChurnOutput,
            HRDataInput.hr_code == ChurnOutput.hr_code
        ).where(
            HRDataInput.status != 'Resigned'
        )

        if department_filter:
            query = query.where(HRDataInput.structure_name == department_filter)

        if risk_level_filter == "High":
            query = query.where(ChurnOutput.resign_proba >= self.HIGH_RISK_THRESHOLD)
        elif risk_level_filter == "Medium":
            query = query.where(
                and_(
                    ChurnOutput.resign_proba >= self.MEDIUM_RISK_THRESHOLD,
                    ChurnOutput.resign_proba < self.HIGH_RISK_THRESHOLD
                )
            )

        query = query.order_by(desc(ChurnOutput.resign_proba)).limit(max_recommendations)

        result = await db.execute(query)
        employees_with_churn = result.all()

        recommendations = []
        for employee, churn_output in employees_with_churn:
            try:
                # Check if there's already a pending recommendation
                existing_query = select(TreatmentRecommendation).where(
                    and_(
                        TreatmentRecommendation.hr_code == employee.hr_code,
                        TreatmentRecommendation.recommendation_status == 'pending'
                    )
                )
                existing_result = await db.execute(existing_query)
                if existing_result.scalar_one_or_none():
                    continue  # Skip if already has pending recommendation

                rec = await self.generate_recommendation(
                    db=db,
                    employee_hr_code=employee.hr_code,
                    use_ml_model=True
                )
                recommendations.append(rec)

            except Exception as e:
                logger.warning(f"Failed to generate recommendation for {employee.hr_code}: {e}")
                continue

        return recommendations


# Singleton instance
recommendation_service = RecommendationService()
