"""
ROI Dashboard Service

Provides real data aggregation for the executive ROI dashboard.
Queries actual treatment applications, effectiveness metrics, and outcome validations
instead of using hardcoded assumptions.
"""

from typing import Dict, Set, Optional, Any
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.treatment import TreatmentApplication, TreatmentEffectiveness, RetentionValidation


@dataclass
class TreatmentDataSummary:
    """Summary of treatment application data"""
    total_applied: int
    pending_count: int
    successful_count: int
    failed_count: int
    ongoing_count: int
    total_cost: float
    total_eltv_preserved: float
    avg_churn_reduction: float


@dataclass
class ActualROIMetrics:
    """Actual ROI metrics from treatment data"""
    total_cost: float
    total_eltv_preserved: float
    net_benefit: float
    roi_percentage: float


class ROIDashboardService:
    """
    Service for aggregating real treatment data for the ROI dashboard.

    Replaces hardcoded assumptions with actual database queries.
    """

    async def get_treatment_summary(
        self,
        db: AsyncSession,
        department_filter: Optional[list] = None
    ) -> TreatmentDataSummary:
        """
        Get summary of all real (non-simulation) treatment applications.

        Returns counts, costs, and effectiveness metrics.
        """
        # Base query for real treatments only
        base_conditions = [TreatmentApplication.is_simulation == False]

        # Build the aggregate query
        query = select(
            func.count(TreatmentApplication.id).label('total_applied'),
            func.count().filter(
                TreatmentApplication.success_indicator == 'pending'
            ).label('pending_count'),
            func.count().filter(
                TreatmentApplication.success_indicator == 'successful'
            ).label('successful_count'),
            func.count().filter(
                TreatmentApplication.success_indicator == 'failed'
            ).label('failed_count'),
            func.count().filter(
                TreatmentApplication.success_indicator == 'ongoing'
            ).label('ongoing_count'),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        TreatmentApplication.actual_cost,
                        TreatmentApplication.cost
                    )
                ),
                0
            ).label('total_cost'),
            func.coalesce(
                func.sum(
                    TreatmentApplication.post_eltv - TreatmentApplication.pre_eltv
                ),
                0
            ).label('total_eltv_preserved'),
            func.coalesce(
                func.avg(
                    TreatmentApplication.pre_churn_probability -
                    TreatmentApplication.post_churn_probability
                ),
                0
            ).label('avg_churn_reduction')
        ).where(and_(*base_conditions))

        result = await db.execute(query)
        row = result.one()

        return TreatmentDataSummary(
            total_applied=row.total_applied or 0,
            pending_count=row.pending_count or 0,
            successful_count=row.successful_count or 0,
            failed_count=row.failed_count or 0,
            ongoing_count=row.ongoing_count or 0,
            total_cost=float(row.total_cost or 0),
            total_eltv_preserved=float(row.total_eltv_preserved or 0),
            avg_churn_reduction=float(row.avg_churn_reduction or 0)
        )

    async def get_treatments_by_type(
        self,
        db: AsyncSession
    ) -> Dict[str, int]:
        """
        Get count of treatments grouped by treatment name/type.

        Only includes real (non-simulation) treatments.
        """
        query = select(
            TreatmentApplication.treatment_name,
            func.count(TreatmentApplication.id).label('count')
        ).where(
            TreatmentApplication.is_simulation == False
        ).group_by(
            TreatmentApplication.treatment_name
        )

        result = await db.execute(query)
        rows = result.all()

        return {row.treatment_name: row.count for row in rows if row.treatment_name}

    async def get_average_treatment_cost(
        self,
        db: AsyncSession
    ) -> Optional[float]:
        """
        Get average treatment cost from real applications.

        Uses actual_cost if available, otherwise falls back to predicted cost.
        Returns None if no treatments exist.
        """
        query = select(
            func.avg(
                func.coalesce(
                    TreatmentApplication.actual_cost,
                    TreatmentApplication.cost
                )
            ).label('avg_cost')
        ).where(
            TreatmentApplication.is_simulation == False
        )

        result = await db.execute(query)
        row = result.one()

        if row.avg_cost is None:
            return None
        return float(row.avg_cost)

    async def get_realized_effectiveness(
        self,
        db: AsyncSession
    ) -> Optional[float]:
        """
        Get average treatment effectiveness from retention validations.

        This is the actual measured effectiveness, not projected.
        Returns None if no validation data exists.
        """
        # First try to get from RetentionValidation
        query = select(
            func.avg(RetentionValidation.effectiveness_score).label('avg_effectiveness')
        ).where(
            RetentionValidation.treatment_applied == True,
            RetentionValidation.effectiveness_score.isnot(None)
        )

        result = await db.execute(query)
        row = result.one()

        if row.avg_effectiveness is not None:
            return float(row.avg_effectiveness)

        # Fallback: Calculate from successful treatment applications
        # Effectiveness = (pre_churn - post_churn) / pre_churn
        query = select(
            func.avg(
                (TreatmentApplication.pre_churn_probability -
                 TreatmentApplication.post_churn_probability) /
                func.nullif(TreatmentApplication.pre_churn_probability, 0)
            ).label('calculated_effectiveness')
        ).where(
            TreatmentApplication.is_simulation == False,
            TreatmentApplication.success_indicator.in_(['successful', 'ongoing']),
            TreatmentApplication.pre_churn_probability > 0
        )

        result = await db.execute(query)
        row = result.one()

        if row.calculated_effectiveness is not None:
            return float(row.calculated_effectiveness)

        return None

    async def get_treated_hr_codes(
        self,
        db: AsyncSession
    ) -> Set[str]:
        """
        Get set of HR codes that have received real treatments.

        Used to determine which high-risk employees still need treatment.
        """
        query = select(
            TreatmentApplication.hr_code
        ).where(
            TreatmentApplication.is_simulation == False
        ).distinct()

        result = await db.execute(query)
        rows = result.all()

        return {row.hr_code for row in rows if row.hr_code}

    async def calculate_actual_roi(
        self,
        db: AsyncSession
    ) -> ActualROIMetrics:
        """
        Calculate actual ROI from treatment applications.

        ROI = (ELTV Preserved - Treatment Cost) / Treatment Cost * 100

        Only considers real (non-simulation) treatments.
        For ELTV preserved, uses successful treatments only.
        """
        # Get total cost (all real treatments)
        cost_query = select(
            func.coalesce(
                func.sum(
                    func.coalesce(
                        TreatmentApplication.actual_cost,
                        TreatmentApplication.cost
                    )
                ),
                0
            ).label('total_cost')
        ).where(
            TreatmentApplication.is_simulation == False
        )

        cost_result = await db.execute(cost_query)
        total_cost = float(cost_result.scalar() or 0)

        # Get ELTV preserved (successful and ongoing treatments only)
        eltv_query = select(
            func.coalesce(
                func.sum(
                    TreatmentApplication.post_eltv - TreatmentApplication.pre_eltv
                ),
                0
            ).label('total_eltv_preserved')
        ).where(
            TreatmentApplication.is_simulation == False,
            TreatmentApplication.success_indicator.in_(['successful', 'ongoing', 'pending'])
        )

        eltv_result = await db.execute(eltv_query)
        total_eltv_preserved = float(eltv_result.scalar() or 0)

        # Calculate net benefit and ROI
        net_benefit = total_eltv_preserved - total_cost
        roi_percentage = (net_benefit / total_cost * 100) if total_cost > 0 else 0

        return ActualROIMetrics(
            total_cost=round(total_cost, 2),
            total_eltv_preserved=round(total_eltv_preserved, 2),
            net_benefit=round(net_benefit, 2),
            roi_percentage=round(roi_percentage, 2)
        )

    async def get_department_treatment_stats(
        self,
        db: AsyncSession,
        department: str
    ) -> Dict[str, Any]:
        """
        Get treatment statistics for a specific department.

        Returns count, cost, and effectiveness for the department.
        """
        from app.models.hr_data import HRDataInput

        query = select(
            func.count(TreatmentApplication.id).label('treatment_count'),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        TreatmentApplication.actual_cost,
                        TreatmentApplication.cost
                    )
                ),
                0
            ).label('total_cost'),
            func.avg(
                TreatmentApplication.pre_churn_probability -
                TreatmentApplication.post_churn_probability
            ).label('avg_churn_reduction')
        ).join(
            HRDataInput,
            TreatmentApplication.hr_code == HRDataInput.hr_code
        ).where(
            TreatmentApplication.is_simulation == False,
            HRDataInput.structure_name == department
        )

        result = await db.execute(query)
        row = result.one()

        return {
            'treatment_count': row.treatment_count or 0,
            'total_cost': float(row.total_cost or 0),
            'avg_churn_reduction': float(row.avg_churn_reduction or 0)
        }

    async def get_effectiveness_by_treatment_type(
        self,
        db: AsyncSession
    ) -> Dict[str, float]:
        """
        Get effectiveness rates grouped by treatment type.

        Uses TreatmentEffectiveness table if available,
        otherwise calculates from TreatmentApplication data.
        """
        # First try TreatmentEffectiveness table
        query = select(
            TreatmentEffectiveness.treatment_name,
            TreatmentEffectiveness.effectiveness_rate
        ).order_by(
            TreatmentEffectiveness.last_updated.desc()
        )

        result = await db.execute(query)
        rows = result.all()

        if rows:
            return {row.treatment_name: float(row.effectiveness_rate) for row in rows}

        # Fallback: Calculate from applications
        query = select(
            TreatmentApplication.treatment_name,
            func.avg(
                (TreatmentApplication.pre_churn_probability -
                 TreatmentApplication.post_churn_probability) /
                func.nullif(TreatmentApplication.pre_churn_probability, 0)
            ).label('effectiveness')
        ).where(
            TreatmentApplication.is_simulation == False,
            TreatmentApplication.pre_churn_probability > 0
        ).group_by(
            TreatmentApplication.treatment_name
        )

        result = await db.execute(query)
        rows = result.all()

        return {
            row.treatment_name: float(row.effectiveness or 0)
            for row in rows if row.treatment_name
        }


# Singleton instance
roi_dashboard_service = ROIDashboardService()
