"""
Behavioral Stage Service

Classifies employees into behavioral stages based on tenure and other factors,
and calculates stage-specific risk contributions.

Stages:
- Onboarding (0-6 months): High turnover risk, adjustment period
- Early Career (6-24 months): Building skills, seeking growth
- Established (2-5 years): Stable, looking for advancement
- Senior (5-10 years): Experienced, may seek new challenges
- Veteran (10+ years): Loyal, institutional knowledge holders
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.churn import BehavioralStage
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service


@dataclass
class StageResult:
    """Result of behavioral stage classification"""
    stage_name: str
    stage_score: float  # Risk contribution from stage (0-1)
    confidence: float  # Confidence in stage classification (0-1)
    indicators: List[str]  # Why this stage was assigned
    risk_factors: List[str]  # Stage-specific risk factors
    recommendations: List[str]  # Stage-specific recommendations


class BehavioralStageService:
    """
    Service for classifying employees into behavioral stages
    and calculating stage-specific risk contributions.

    Stage tenure thresholds are computed from data percentiles (quintiles).
    """

    # Stage metadata (descriptions, indicators, etc.)
    # Tenure thresholds are computed dynamically from data
    STAGE_METADATA = {
        'onboarding': {
            'base_risk': 0.35,
            'description': 'New employee in adjustment period',
            'indicators': [
                'Recently hired',
                'Learning organizational culture',
                'Building relationships'
            ],
            'risk_factors': [
                'High early turnover risk',
                'Unmet expectations',
                'Poor onboarding experience'
            ],
            'recommendations': [
                'Ensure strong onboarding program',
                'Assign mentor or buddy',
                'Regular check-ins with manager',
                'Clear role expectations'
            ]
        },
        'early_career': {
            'base_risk': 0.25,
            'description': 'Building skills and seeking growth opportunities',
            'indicators': [
                'Developing core competencies',
                'Seeking learning opportunities',
                'Building professional network'
            ],
            'risk_factors': [
                'Limited growth opportunities',
                'Compensation below market',
                'Lack of challenging work'
            ],
            'recommendations': [
                'Provide skill development opportunities',
                'Discuss career path',
                'Consider stretch assignments',
                'Review compensation competitiveness'
            ]
        },
        'established': {
            'base_risk': 0.15,
            'description': 'Stable contributor looking for advancement',
            'indicators': [
                'Solid performer',
                'Institutional knowledge',
                'May mentor others'
            ],
            'risk_factors': [
                'Career plateau',
                'Lack of recognition',
                'Better external opportunities'
            ],
            'recommendations': [
                'Discuss promotion timeline',
                'Provide leadership opportunities',
                'Recognize contributions publicly',
                'Competitive compensation review'
            ]
        },
        'senior': {
            'base_risk': 0.20,
            'description': 'Experienced professional, may seek new challenges',
            'indicators': [
                'Deep expertise',
                'Key knowledge holder',
                'Potential flight risk if unchallenged'
            ],
            'risk_factors': [
                'Burnout from sustained performance',
                'Desire for new challenges',
                'Executive poaching'
            ],
            'recommendations': [
                'Offer strategic projects',
                'Consider role expansion',
                'Sabbatical or development leave',
                'Executive retention package'
            ]
        },
        'veteran': {
            'base_risk': 0.10,
            'description': 'Loyal employee with deep institutional knowledge',
            'indicators': [
                'Organizational memory',
                'Culture carrier',
                'Trusted advisor'
            ],
            'risk_factors': [
                'Retirement planning',
                'Health considerations',
                'Major life changes'
            ],
            'recommendations': [
                'Knowledge transfer planning',
                'Flexible work arrangements',
                'Legacy project opportunities',
                'Succession planning involvement'
            ]
        }
    }

    def __init__(self):
        self._stages_cache: Optional[Dict[str, Dict]] = None
        self._cache_loaded_at: Optional[datetime] = None
        self._cache_ttl_hours = 1  # Refresh cache every hour
        self.thresholds_service = data_driven_thresholds_service

    @property
    def DEFAULT_STAGES(self) -> Dict[str, Dict]:
        """Backward compatibility property - returns STAGE_METADATA."""
        return self.STAGE_METADATA

    async def _load_stages_from_db(self, db: AsyncSession) -> Dict[str, Dict]:
        """Load stage definitions from database"""
        try:
            query = select(BehavioralStage).where(BehavioralStage.is_active == 1)
            result = await db.execute(query)
            db_stages = result.scalars().all()

            if not db_stages:
                return self.DEFAULT_STAGES

            stages = {}
            for stage in db_stages:
                stage_key = stage.stage_name.lower().replace(' ', '_')
                stages[stage_key] = {
                    'min_tenure': float(stage.min_tenure) if stage.min_tenure else 0,
                    'max_tenure': float(stage.max_tenure) if stage.max_tenure else None,
                    'base_risk': float(stage.base_risk_score) if stage.base_risk_score else 0.2,
                    'description': stage.stage_description or '',
                    'indicators': stage.stage_indicators.split('|') if stage.stage_indicators else [],
                    'risk_factors': [],
                    'recommendations': []
                }

            return stages if stages else self.DEFAULT_STAGES

        except Exception as e:
            print(f"Error loading stages from DB: {e}")
            return self.DEFAULT_STAGES

    async def _get_stages(self, db: Optional[AsyncSession] = None) -> Dict[str, Dict]:
        """Get stages with caching"""
        now = datetime.utcnow()

        # Check if cache is valid
        if (self._stages_cache is not None and
            self._cache_loaded_at is not None and
            (now - self._cache_loaded_at).total_seconds() < self._cache_ttl_hours * 3600):
            return self._stages_cache

        # Load from DB if session provided
        if db:
            self._stages_cache = await self._load_stages_from_db(db)
            self._cache_loaded_at = now
            return self._stages_cache

        # Return default if no DB and no cache
        return self.DEFAULT_STAGES

    def _classify_stage(
        self,
        tenure_years: float,
        stages: Dict[str, Dict],
        dataset_id: Optional[str] = None
    ) -> Tuple[str, Dict]:
        """
        Classify employee into a stage based on tenure.

        Uses data-driven tenure thresholds (quintiles) when available.
        """
        # Use data-driven stage classification
        stage_name = self.thresholds_service.get_tenure_stage(tenure_years, dataset_id)

        # Get the stage definition (from DB cache or metadata)
        if stage_name in stages:
            stage_def = stages[stage_name]
        elif stage_name in self.STAGE_METADATA:
            stage_def = self.STAGE_METADATA[stage_name]
        else:
            stage_def = self.STAGE_METADATA['established']

        return stage_name, stage_def

    def _calculate_stage_score(
        self,
        stage_def: Dict,
        employee_data: Dict[str, Any],
        churn_probability: float,
        dataset_id: Optional[str] = None
    ) -> Tuple[float, float, List[str]]:
        """
        Calculate stage-specific risk score and confidence.

        Uses percentile-based adjustments for tenure and salary.

        Returns:
            Tuple of (score, confidence, indicators)
        """
        base_risk = stage_def.get('base_risk', 0.2)
        indicators = []
        adjustments = 0.0

        tenure = employee_data.get('tenure', 0)
        salary = employee_data.get('employee_cost', 0)
        position = employee_data.get('position', '').lower()
        status = employee_data.get('status', '').lower()

        # Tenure-based adjustments using percentiles
        tenure_percentile = self.thresholds_service.get_feature_percentile(
            'time_spend_company', float(tenure), dataset_id
        )
        if tenure_percentile < 20:  # Bottom 20% tenure
            adjustments += 0.1
            indicators.append(f'New employee (bottom {tenure_percentile:.0f}% tenure)')
        elif tenure_percentile > 80:  # Top 20% tenure
            adjustments -= 0.05
            indicators.append(f'Long tenure (top {100-tenure_percentile:.0f}%) indicates stability')

        # Position-based adjustments (titles are universal)
        if 'manager' in position or 'director' in position or 'lead' in position:
            adjustments -= 0.05
            indicators.append('Leadership position increases retention')
        elif 'intern' in position or 'junior' in position:
            adjustments += 0.05
            indicators.append('Entry-level position has higher mobility')

        # Salary considerations using percentiles
        if salary:
            salary_percentile = self.thresholds_service.get_feature_percentile(
                'employee_cost', float(salary), dataset_id
            )
            if salary_percentile >= 75:  # Top 25%
                adjustments -= 0.03
                indicators.append(f'Competitive compensation (top {100-salary_percentile:.0f}%)')
            elif salary_percentile < 25:  # Bottom 25%
                adjustments += 0.05
                indicators.append(f'Below-average compensation (bottom {salary_percentile:.0f}%)')

        # Status-based adjustments (categorical, not percentile-based)
        if 'probation' in status:
            adjustments += 0.1
            indicators.append('Probationary status')
        elif 'terminated' in status or 'resigned' in status:
            adjustments += 0.3
            indicators.append('Already in exit process')

        # Calculate final score
        final_score = max(0.0, min(1.0, base_risk + adjustments))

        # Calculate confidence based on data completeness
        data_points = sum([
            1 if tenure > 0 else 0,
            1 if salary and salary > 0 else 0,
            1 if position else 0,
            1 if status else 0
        ])
        confidence = min(1.0, 0.5 + (data_points * 0.125))

        return final_score, confidence, indicators

    async def classify_employee(
        self,
        employee_data: Dict[str, Any],
        churn_probability: float = 0.0,
        db: Optional[AsyncSession] = None
    ) -> StageResult:
        """
        Classify an employee into a behavioral stage and calculate risk contribution.

        Args:
            employee_data: Dictionary containing employee attributes
            churn_probability: Current ML-predicted churn probability
            db: Optional database session for loading custom stages

        Returns:
            StageResult with classification and risk score
        """
        # Get stage definitions
        stages = await self._get_stages(db)

        # Extract tenure
        tenure = float(employee_data.get('tenure', 0))

        # Classify into stage
        stage_name, stage_def = self._classify_stage(tenure, stages)

        # Calculate score
        score, confidence, dynamic_indicators = self._calculate_stage_score(
            stage_def, employee_data, churn_probability
        )

        # Combine static and dynamic indicators
        all_indicators = stage_def.get('indicators', []) + dynamic_indicators

        return StageResult(
            stage_name=stage_name.replace('_', ' ').title(),
            stage_score=score,
            confidence=confidence,
            indicators=all_indicators[:5],  # Top 5 indicators
            risk_factors=stage_def.get('risk_factors', []),
            recommendations=stage_def.get('recommendations', [])
        )

    async def classify_batch(
        self,
        employees: List[Dict[str, Any]],
        db: Optional[AsyncSession] = None
    ) -> List[StageResult]:
        """Classify multiple employees efficiently"""
        # Load stages once
        stages = await self._get_stages(db)

        results = []
        for emp in employees:
            tenure = float(emp.get('tenure', 0))
            stage_name, stage_def = self._classify_stage(tenure, stages)
            score, confidence, indicators = self._calculate_stage_score(
                stage_def, emp, emp.get('churn_probability', 0.0)
            )

            results.append(StageResult(
                stage_name=stage_name.replace('_', ' ').title(),
                stage_score=score,
                confidence=confidence,
                indicators=stage_def.get('indicators', []) + indicators,
                risk_factors=stage_def.get('risk_factors', []),
                recommendations=stage_def.get('recommendations', [])
            ))

        return results

    def get_stage_distribution(self, employees: List[Dict[str, Any]]) -> Dict[str, int]:
        """Get distribution of employees across stages"""
        distribution = {
            'Onboarding': 0,
            'Early Career': 0,
            'Established': 0,
            'Senior': 0,
            'Veteran': 0
        }

        for emp in employees:
            tenure = float(emp.get('tenure', 0))
            stage_name, _ = self._classify_stage(tenure, self.DEFAULT_STAGES)
            formatted_name = stage_name.replace('_', ' ').title()
            if formatted_name in distribution:
                distribution[formatted_name] += 1

        return distribution


# Singleton instance
behavioral_stage_service = BehavioralStageService()
