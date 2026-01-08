"""
Peer Statistics Service

Calculates percentiles and statistics for peer comparison:
- Risk thresholds based on actual churn probability distribution
- Compensation percentiles by department, position, tenure cohort
- Tenure percentiles by department, position

This service focuses on peer comparisons and shares its risk threshold
calculations with the central DataDrivenThresholdsService.
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import statistics
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service


@dataclass
class DistributionStats:
    """Statistics for a distribution"""
    count: int
    min_val: float
    max_val: float
    mean: float
    median: float
    std_dev: float
    p10: float  # 10th percentile
    p25: float  # 25th percentile (Q1)
    p50: float  # 50th percentile (median)
    p75: float  # 75th percentile (Q3)
    p90: float  # 90th percentile


@dataclass
class RiskThresholds:
    """Dynamic risk thresholds based on distribution"""
    high_threshold: float  # Above this = High risk
    medium_threshold: float  # Above this = Medium risk
    # Below medium = Low risk
    calculation_method: str
    sample_size: int
    calculated_at: datetime


@dataclass
class PeerComparison:
    """Result of comparing an employee to peers"""
    employee_value: float
    peer_mean: float
    peer_median: float
    percentile: float  # What percentile is the employee at (0-100)
    peer_count: int
    comparison_group: str  # e.g., "Department: Engineering, Tenure: 2-5 years"
    is_below_p25: bool
    is_above_p75: bool


class PeerStatisticsService:
    """
    Service for calculating peer-based statistics and dynamic thresholds.
    """

    # Cache settings
    CACHE_TTL_HOURS = 6  # Recalculate stats every 6 hours

    def __init__(self):
        self._risk_thresholds_cache: Optional[RiskThresholds] = None
        self._distribution_cache: Dict[str, Tuple[DistributionStats, datetime]] = {}
        self._percentile_cache: Dict[str, Tuple[Dict, datetime]] = {}

    def _calculate_percentile(self, values: List[float], percentile: float) -> float:
        """Calculate percentile from a list of values"""
        if not values:
            return 0.0
        sorted_values = sorted(values)
        n = len(sorted_values)
        k = (n - 1) * (percentile / 100)
        f = int(k)
        c = k - f
        if f + 1 < n:
            return sorted_values[f] + c * (sorted_values[f + 1] - sorted_values[f])
        return sorted_values[f]

    def _calculate_stats(self, values: List[float]) -> DistributionStats:
        """Calculate distribution statistics from values"""
        if not values:
            return DistributionStats(
                count=0, min_val=0, max_val=0, mean=0, median=0,
                std_dev=0, p10=0, p25=0, p50=0, p75=0, p90=0
            )

        return DistributionStats(
            count=len(values),
            min_val=min(values),
            max_val=max(values),
            mean=statistics.mean(values),
            median=statistics.median(values),
            std_dev=statistics.stdev(values) if len(values) > 1 else 0,
            p10=self._calculate_percentile(values, 10),
            p25=self._calculate_percentile(values, 25),
            p50=self._calculate_percentile(values, 50),
            p75=self._calculate_percentile(values, 75),
            p90=self._calculate_percentile(values, 90)
        )

    def _get_value_percentile(self, value: float, all_values: List[float]) -> float:
        """Calculate what percentile a value falls at"""
        if not all_values:
            return 50.0
        below_count = sum(1 for v in all_values if v < value)
        equal_count = sum(1 for v in all_values if v == value)
        percentile = (below_count + equal_count / 2) / len(all_values) * 100
        return round(percentile, 1)

    async def calculate_risk_thresholds(
        self,
        db: AsyncSession,
        dataset_id: Optional[str] = None,
        force_refresh: bool = False
    ) -> RiskThresholds:
        """
        Calculate dynamic risk thresholds based on actual churn probability distribution.

        Uses percentile-based approach:
        - High risk: Top 25% of churn probabilities (P75+)
        - Medium risk: Middle 50% (P25 to P75)
        - Low risk: Bottom 25% (below P25)

        Also updates the shared DataDrivenThresholdsService cache.
        """
        # Check cache
        if not force_refresh and self._risk_thresholds_cache:
            cache_age = datetime.utcnow() - self._risk_thresholds_cache.calculated_at
            if cache_age.total_seconds() < self.CACHE_TTL_HOURS * 3600:
                return self._risk_thresholds_cache

        # Fetch all churn probabilities
        query = select(ChurnOutput.resign_proba)
        if dataset_id:
            query = query.where(ChurnOutput.dataset_id == dataset_id)
        result = await db.execute(query)
        probabilities = [float(row[0]) for row in result.fetchall() if row[0] is not None]

        if len(probabilities) < 10:
            # Not enough data, use sensible defaults
            thresholds = RiskThresholds(
                high_threshold=0.60,
                medium_threshold=0.30,
                calculation_method="default (insufficient data)",
                sample_size=len(probabilities),
                calculated_at=datetime.utcnow()
            )
        else:
            # Calculate percentile-based thresholds
            stats = self._calculate_stats(probabilities)

            thresholds = RiskThresholds(
                high_threshold=stats.p75,  # Top 25% = High
                medium_threshold=stats.p25,  # Bottom 25% = Low, rest = Medium
                calculation_method="percentile-based (P25/P75)",
                sample_size=len(probabilities),
                calculated_at=datetime.utcnow()
            )

            # Update the shared DataDrivenThresholdsService cache
            data_driven_thresholds_service.compute_risk_thresholds_from_predictions(
                probabilities,
                dataset_id=dataset_id,
                high_risk_percentile=75.0,
                medium_risk_percentile=25.0
            )

        self._risk_thresholds_cache = thresholds
        return thresholds

    async def get_compensation_percentiles(
        self,
        db: AsyncSession,
        department: Optional[str] = None,
        position: Optional[str] = None,
        tenure_min: Optional[float] = None,
        tenure_max: Optional[float] = None
    ) -> DistributionStats:
        """
        Get compensation distribution for a peer group.

        Peer group can be filtered by department, position, and/or tenure range.
        """
        cache_key = f"comp_{department}_{position}_{tenure_min}_{tenure_max}"

        # Check cache
        if cache_key in self._distribution_cache:
            stats, cached_at = self._distribution_cache[cache_key]
            if (datetime.utcnow() - cached_at).total_seconds() < self.CACHE_TTL_HOURS * 3600:
                return stats

        # Build query
        query = select(HRDataInput.employee_cost).where(
            HRDataInput.employee_cost.isnot(None),
            HRDataInput.employee_cost > 0
        )

        if department:
            query = query.where(HRDataInput.structure_name == department)
        if position:
            query = query.where(HRDataInput.position == position)
        if tenure_min is not None:
            query = query.where(HRDataInput.tenure >= tenure_min)
        if tenure_max is not None:
            query = query.where(HRDataInput.tenure < tenure_max)

        result = await db.execute(query)
        costs = [float(row[0]) for row in result.fetchall() if row[0]]

        stats = self._calculate_stats(costs)
        self._distribution_cache[cache_key] = (stats, datetime.utcnow())

        return stats

    async def get_tenure_percentiles(
        self,
        db: AsyncSession,
        department: Optional[str] = None,
        position: Optional[str] = None
    ) -> DistributionStats:
        """Get tenure distribution for a peer group."""
        cache_key = f"tenure_{department}_{position}"

        # Check cache
        if cache_key in self._distribution_cache:
            stats, cached_at = self._distribution_cache[cache_key]
            if (datetime.utcnow() - cached_at).total_seconds() < self.CACHE_TTL_HOURS * 3600:
                return stats

        # Build query
        query = select(HRDataInput.tenure).where(HRDataInput.tenure.isnot(None))

        if department:
            query = query.where(HRDataInput.structure_name == department)
        if position:
            query = query.where(HRDataInput.position == position)

        result = await db.execute(query)
        tenures = [float(row[0]) for row in result.fetchall() if row[0] is not None]

        stats = self._calculate_stats(tenures)
        self._distribution_cache[cache_key] = (stats, datetime.utcnow())

        return stats

    async def compare_to_peers(
        self,
        db: AsyncSession,
        employee_data: Dict[str, Any],
        comparison_field: str,  # 'employee_cost' or 'tenure'
        peer_by: List[str] = None  # ['department', 'position', 'tenure_cohort']
    ) -> PeerComparison:
        """
        Compare an employee's value to their peer group.

        peer_by options:
        - 'department': Same structure_name
        - 'position': Same position
        - 'tenure_cohort': Similar tenure (±2 years)
        """
        peer_by = peer_by or ['department']

        employee_value = float(employee_data.get(comparison_field, 0))

        # Build peer query
        query = select(getattr(HRDataInput, comparison_field)).where(
            getattr(HRDataInput, comparison_field).isnot(None)
        )

        comparison_parts = []

        if 'department' in peer_by and employee_data.get('structure_name'):
            query = query.where(HRDataInput.structure_name == employee_data['structure_name'])
            comparison_parts.append(f"Dept: {employee_data['structure_name']}")

        if 'position' in peer_by and employee_data.get('position'):
            query = query.where(HRDataInput.position == employee_data['position'])
            comparison_parts.append(f"Position: {employee_data['position']}")

        if 'tenure_cohort' in peer_by and employee_data.get('tenure') is not None:
            tenure = float(employee_data['tenure'])
            query = query.where(
                and_(
                    HRDataInput.tenure >= max(0, tenure - 2),
                    HRDataInput.tenure <= tenure + 2
                )
            )
            comparison_parts.append(f"Tenure: {max(0, tenure-2):.0f}-{tenure+2:.0f}y")

        # Exclude the employee themselves
        if employee_data.get('hr_code'):
            query = query.where(HRDataInput.hr_code != employee_data['hr_code'])

        result = await db.execute(query)
        peer_values = [float(row[0]) for row in result.fetchall() if row[0]]

        if not peer_values:
            return PeerComparison(
                employee_value=employee_value,
                peer_mean=employee_value,
                peer_median=employee_value,
                percentile=50.0,
                peer_count=0,
                comparison_group="No peers found",
                is_below_p25=False,
                is_above_p75=False
            )

        stats = self._calculate_stats(peer_values)
        percentile = self._get_value_percentile(employee_value, peer_values)

        return PeerComparison(
            employee_value=employee_value,
            peer_mean=stats.mean,
            peer_median=stats.median,
            percentile=percentile,
            peer_count=len(peer_values),
            comparison_group=", ".join(comparison_parts) if comparison_parts else "All employees",
            is_below_p25=employee_value < stats.p25,
            is_above_p75=employee_value > stats.p75
        )

    async def get_all_peer_comparisons(
        self,
        db: AsyncSession,
        employee_data: Dict[str, Any]
    ) -> Dict[str, PeerComparison]:
        """Get all relevant peer comparisons for an employee."""
        comparisons = {}

        # Compensation vs department peers
        comparisons['comp_vs_department'] = await self.compare_to_peers(
            db, employee_data, 'employee_cost', ['department']
        )

        # Compensation vs position peers
        comparisons['comp_vs_position'] = await self.compare_to_peers(
            db, employee_data, 'employee_cost', ['position']
        )

        # Compensation vs tenure cohort in same department
        comparisons['comp_vs_dept_tenure'] = await self.compare_to_peers(
            db, employee_data, 'employee_cost', ['department', 'tenure_cohort']
        )

        # Tenure vs department peers
        comparisons['tenure_vs_department'] = await self.compare_to_peers(
            db, employee_data, 'tenure', ['department']
        )

        # Tenure vs position peers
        comparisons['tenure_vs_position'] = await self.compare_to_peers(
            db, employee_data, 'tenure', ['position']
        )

        return comparisons

    async def get_churn_distribution(
        self,
        db: AsyncSession,
        department: Optional[str] = None
    ) -> DistributionStats:
        """Get churn probability distribution."""
        cache_key = f"churn_{department}"

        if cache_key in self._distribution_cache:
            stats, cached_at = self._distribution_cache[cache_key]
            if (datetime.utcnow() - cached_at).total_seconds() < self.CACHE_TTL_HOURS * 3600:
                return stats

        query = select(ChurnOutput.resign_proba)

        if department:
            # Join with HRDataInput to filter by department
            query = select(ChurnOutput.resign_proba).join(
                HRDataInput, ChurnOutput.hr_code == HRDataInput.hr_code
            ).where(HRDataInput.structure_name == department)

        result = await db.execute(query)
        probabilities = [float(row[0]) for row in result.fetchall() if row[0] is not None]

        stats = self._calculate_stats(probabilities)
        self._distribution_cache[cache_key] = (stats, datetime.utcnow())

        return stats

    def clear_cache(self):
        """Clear all cached statistics."""
        self._risk_thresholds_cache = None
        self._distribution_cache.clear()
        self._percentile_cache.clear()


# Singleton instance
peer_statistics_service = PeerStatisticsService()
