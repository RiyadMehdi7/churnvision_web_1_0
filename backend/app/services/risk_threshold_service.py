"""
Dynamic Risk Threshold Service

Calculates risk thresholds dynamically based on the distribution of active employees'
churn probabilities. Uses percentile-based approach to ensure consistent distribution
across High/Medium/Low risk categories.
"""

from typing import Dict, Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
import numpy as np

from app.models.churn import ChurnOutput
from app.models.hr_data import HRDataInput


# Target distribution for risk categories (percentages)
TARGET_DISTRIBUTION = {
    'high': 15,    # Top 15% are High Risk
    'medium': 25,  # Next 25% are Medium Risk
    'low': 60      # Bottom 60% are Low Risk
}

# Fallback thresholds when insufficient data
FALLBACK_THRESHOLDS = {
    'highRisk': 0.60,
    'mediumRisk': 0.30
}

# Minimum sample size required for dynamic calculation
MIN_SAMPLE_SIZE = 10


class RiskThresholdService:
    """Service for calculating and managing dynamic risk thresholds."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_employee_probabilities(
        self,
        dataset_id: Optional[str] = None
    ) -> List[float]:
        """
        Fetch churn probabilities for all active employees.

        Args:
            dataset_id: Optional dataset ID to filter by

        Returns:
            List of churn probabilities (0-1 range)
        """
        # Build query to get churn probabilities for active employees
        query = (
            select(ChurnOutput.resign_proba)
            .join(HRDataInput, ChurnOutput.hr_code == HRDataInput.hr_code)
            .where(HRDataInput.status == 'Active')
        )

        if dataset_id:
            query = query.where(ChurnOutput.dataset_id == dataset_id)

        result = await self.db.execute(query)
        rows = result.scalars().all()

        # Convert Decimal to float and filter valid probabilities
        probabilities = []
        for prob in rows:
            if prob is not None:
                float_prob = float(prob) if isinstance(prob, Decimal) else prob
                if 0 <= float_prob <= 1:
                    probabilities.append(float_prob)

        return probabilities

    def calculate_thresholds_from_distribution(
        self,
        probabilities: List[float],
        target_high_pct: float = TARGET_DISTRIBUTION['high'],
        target_medium_pct: float = TARGET_DISTRIBUTION['medium']
    ) -> Dict[str, float]:
        """
        Calculate thresholds based on percentile distribution.

        Args:
            probabilities: List of churn probabilities
            target_high_pct: Target percentage for high risk (top X%)
            target_medium_pct: Target percentage for medium risk (next Y%)

        Returns:
            Dict with 'highRisk' and 'mediumRisk' thresholds
        """
        if len(probabilities) < MIN_SAMPLE_SIZE:
            return FALLBACK_THRESHOLDS.copy()

        # Convert to numpy for percentile calculation
        probs = np.array(probabilities)

        # Calculate percentiles
        # High risk threshold: top X% (e.g., top 15%)
        # This means 85th percentile is the cutoff for high risk
        high_percentile = 100 - target_high_pct
        high_threshold = float(np.percentile(probs, high_percentile))

        # Medium risk threshold: next Y% (e.g., next 25%)
        # This means 60th percentile is the cutoff for medium risk (100 - 15 - 25 = 60)
        medium_percentile = 100 - target_high_pct - target_medium_pct
        medium_threshold = float(np.percentile(probs, medium_percentile))

        # Ensure logical ordering and bounds
        high_threshold = max(0.1, min(0.95, high_threshold))
        medium_threshold = max(0.05, min(high_threshold - 0.05, medium_threshold))

        return {
            'highRisk': round(high_threshold, 3),
            'mediumRisk': round(medium_threshold, 3)
        }

    async def calculate_dynamic_thresholds(
        self,
        dataset_id: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Calculate dynamic risk thresholds based on active employee distribution.

        Args:
            dataset_id: Optional dataset ID to filter by

        Returns:
            Dict containing thresholds and metadata
        """
        probabilities = await self.get_active_employee_probabilities(dataset_id)

        if len(probabilities) < MIN_SAMPLE_SIZE:
            return {
                'thresholds': FALLBACK_THRESHOLDS.copy(),
                'source': 'fallback',
                'reason': f'Insufficient data ({len(probabilities)} employees, need {MIN_SAMPLE_SIZE})',
                'sampleSize': len(probabilities),
                'distribution': None
            }

        thresholds = self.calculate_thresholds_from_distribution(probabilities)

        # Calculate actual distribution with these thresholds
        distribution = self._calculate_distribution(probabilities, thresholds)

        return {
            'thresholds': thresholds,
            'source': 'dynamic',
            'reason': f'Calculated from {len(probabilities)} active employees',
            'sampleSize': len(probabilities),
            'distribution': distribution,
            'statistics': self._calculate_statistics(probabilities)
        }

    def _calculate_distribution(
        self,
        probabilities: List[float],
        thresholds: Dict[str, float]
    ) -> Dict[str, Dict[str, any]]:
        """Calculate the actual distribution of employees in each risk category."""
        total = len(probabilities)
        if total == 0:
            return None

        high_count = sum(1 for p in probabilities if p >= thresholds['highRisk'])
        medium_count = sum(1 for p in probabilities if thresholds['mediumRisk'] <= p < thresholds['highRisk'])
        low_count = sum(1 for p in probabilities if p < thresholds['mediumRisk'])

        return {
            'high': {
                'count': high_count,
                'percentage': round(high_count / total * 100, 1)
            },
            'medium': {
                'count': medium_count,
                'percentage': round(medium_count / total * 100, 1)
            },
            'low': {
                'count': low_count,
                'percentage': round(low_count / total * 100, 1)
            }
        }

    def _calculate_statistics(self, probabilities: List[float]) -> Dict[str, float]:
        """Calculate statistics about the probability distribution."""
        if not probabilities:
            return None

        probs = np.array(probabilities)
        return {
            'mean': round(float(np.mean(probs)), 3),
            'median': round(float(np.median(probs)), 3),
            'std': round(float(np.std(probs)), 3),
            'min': round(float(np.min(probs)), 3),
            'max': round(float(np.max(probs)), 3),
            'p25': round(float(np.percentile(probs, 25)), 3),
            'p75': round(float(np.percentile(probs, 75)), 3)
        }

    async def get_risk_level(
        self,
        probability: float,
        dataset_id: Optional[str] = None
    ) -> str:
        """
        Get risk level for a given probability using dynamic thresholds.

        Args:
            probability: Churn probability (0-1)
            dataset_id: Optional dataset ID

        Returns:
            Risk level: 'High', 'Medium', or 'Low'
        """
        result = await self.calculate_dynamic_thresholds(dataset_id)
        thresholds = result['thresholds']

        if probability >= thresholds['highRisk']:
            return 'High'
        elif probability >= thresholds['mediumRisk']:
            return 'Medium'
        else:
            return 'Low'


# Singleton-style function for quick access
async def get_dynamic_thresholds(
    db: AsyncSession,
    dataset_id: Optional[str] = None
) -> Dict[str, any]:
    """
    Quick access function to get dynamic thresholds.

    Args:
        db: Database session
        dataset_id: Optional dataset ID

    Returns:
        Dict with thresholds and metadata
    """
    service = RiskThresholdService(db)
    return await service.calculate_dynamic_thresholds(dataset_id)
