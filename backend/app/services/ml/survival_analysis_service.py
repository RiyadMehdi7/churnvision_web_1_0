"""
Survival Analysis Service
Provides time-to-departure predictions using Cox Proportional Hazards model.

Uses the lifelines library for survival analysis:
- Cox PH model for hazard estimation
- Kaplan-Meier for survival curves
- Predicts probability of departure at various time horizons
"""
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
import logging
import numpy as np
import pandas as pd

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput
from app.services.analytics.data_driven_thresholds_service import data_driven_thresholds_service

logger = logging.getLogger(__name__)


@dataclass
class SurvivalPrediction:
    """Survival prediction for an employee"""
    hr_code: str
    current_tenure: float  # years

    # Probability of departure within time horizon
    prob_30_days: float
    prob_60_days: float
    prob_90_days: float
    prob_180_days: float
    prob_365_days: float

    # Median survival time (50% probability of departure)
    median_survival_days: Optional[float]

    # Expected departure window
    departure_window: str  # e.g., "30-60 days", "90-180 days", "1+ year"

    # Urgency based on survival prediction
    urgency: str  # 'critical', 'high', 'medium', 'low'

    # Confidence in the prediction
    confidence: float

    # Risk factors that affect survival
    hazard_ratio: float  # relative risk compared to baseline


@dataclass
class SurvivalModelMetrics:
    """Metrics for the survival model"""
    concordance_index: float  # C-index, 0.5 = random, 1.0 = perfect
    total_employees: int
    events_observed: int  # employees who left
    censored: int  # employees still active
    median_tenure_leavers: float
    median_tenure_active: float


class SurvivalAnalysisService:
    """
    Service for survival analysis and time-to-departure predictions.

    Uses Cox Proportional Hazards model to estimate:
    - Hazard function: risk of departure at any given time
    - Survival function: probability of staying employed over time
    - Time-to-event: when an employee is likely to leave

    Base hazard rate is computed from actual turnover data.
    """

    def __init__(self):
        self._model = None
        self._model_fitted = False
        self._baseline_survival = None
        self._feature_columns = []
        self.thresholds_service = data_driven_thresholds_service

    async def fit_survival_model(
        self,
        db: AsyncSession,
        dataset_id: str
    ) -> SurvivalModelMetrics:
        """
        Fit the Cox Proportional Hazards model on employee data.

        Uses:
        - tenure: duration (T) in years
        - status: event indicator (E) - 1 if left, 0 if active (censored)
        - covariates: department, salary level, churn risk score, etc.
        """
        try:
            from lifelines import CoxPHFitter
            from lifelines.utils import concordance_index
        except ImportError:
            logger.warning("lifelines not installed, using fallback predictions")
            return self._get_fallback_metrics()

        # Fetch employee data with churn predictions
        result = await db.execute(
            select(
                HRDataInput.hr_code,
                HRDataInput.tenure,
                HRDataInput.status,
                HRDataInput.structure_name,
                HRDataInput.position,
                ChurnOutput.resign_proba
            )
            .outerjoin(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
            .where(HRDataInput.dataset_id == dataset_id)
        )
        rows = result.all()

        if len(rows) < 10:
            logger.warning("Not enough data for survival model fitting")
            return self._get_fallback_metrics()

        # Prepare DataFrame
        data = []
        for row in rows:
            tenure = row.tenure if row.tenure and row.tenure > 0 else 0.1
            status_str = (row.status or '').lower()

            # Event indicator: 1 if left/terminated, 0 if active (censored)
            event = 1 if status_str in ['left', 'terminated', 'resigned', 'departed'] else 0

            # Risk score from churn model (if available)
            risk_score = row.resign_proba if row.resign_proba else 0.5

            data.append({
                'hr_code': row.hr_code,
                'duration': tenure,  # T: time in years
                'event': event,  # E: 1=left, 0=censored
                'risk_score': risk_score,
                'department': row.structure_name or 'Unknown',
                'position': row.position or 'Unknown'
            })

        df = pd.DataFrame(data)

        # Encode categorical variables
        df['dept_encoded'] = pd.factorize(df['department'])[0]

        # Prepare features for Cox model
        cox_df = df[['duration', 'event', 'risk_score', 'dept_encoded']].copy()
        cox_df = cox_df.dropna()

        if len(cox_df) < 10:
            return self._get_fallback_metrics()

        # Fit Cox PH model
        self._model = CoxPHFitter()
        try:
            self._model.fit(
                cox_df,
                duration_col='duration',
                event_col='event',
                show_progress=False
            )
            self._model_fitted = True
            self._feature_columns = ['risk_score', 'dept_encoded']

            # Store baseline survival function
            self._baseline_survival = self._model.baseline_survival_

            # Calculate metrics
            c_index = concordance_index(
                cox_df['duration'],
                -self._model.predict_partial_hazard(cox_df),
                cox_df['event']
            )

            events_observed = int(cox_df['event'].sum())
            censored = len(cox_df) - events_observed

            leavers = df[df['event'] == 1]
            active = df[df['event'] == 0]

            return SurvivalModelMetrics(
                concordance_index=round(c_index, 3),
                total_employees=len(df),
                events_observed=events_observed,
                censored=censored,
                median_tenure_leavers=round(leavers['duration'].median(), 2) if len(leavers) > 0 else 0,
                median_tenure_active=round(active['duration'].median(), 2) if len(active) > 0 else 0
            )

        except Exception as e:
            logger.error(f"Error fitting Cox model: {e}")
            return self._get_fallback_metrics()

    def _get_fallback_metrics(self) -> SurvivalModelMetrics:
        """Return default metrics when model can't be fitted"""
        return SurvivalModelMetrics(
            concordance_index=0.5,
            total_employees=0,
            events_observed=0,
            censored=0,
            median_tenure_leavers=0,
            median_tenure_active=0
        )

    async def predict_survival(
        self,
        db: AsyncSession,
        hr_code: str,
        dataset_id: str
    ) -> Optional[SurvivalPrediction]:
        """
        Predict time-to-departure for a specific employee.

        Returns probabilities of departure at various time horizons
        and expected departure window.
        """
        # Get employee data
        result = await db.execute(
            select(
                HRDataInput.hr_code,
                HRDataInput.tenure,
                HRDataInput.status,
                HRDataInput.structure_name,
                ChurnOutput.resign_proba
            )
            .outerjoin(ChurnOutput, HRDataInput.hr_code == ChurnOutput.hr_code)
            .where(
                and_(
                    HRDataInput.dataset_id == dataset_id,
                    HRDataInput.hr_code == hr_code
                )
            )
        )
        row = result.first()

        if not row:
            return None

        tenure = row.tenure if row.tenure and row.tenure > 0 else 0.1
        risk_score = row.resign_proba if row.resign_proba else 0.5

        # If model is fitted, use it; otherwise use risk-based approximation
        if self._model_fitted and self._model is not None:
            try:
                return self._predict_with_cox_model(
                    hr_code=hr_code,
                    tenure=tenure,
                    risk_score=risk_score,
                    department=row.structure_name or 'Unknown'
                )
            except Exception as e:
                logger.warning(f"Cox prediction failed, using fallback: {e}")

        # Fallback: use churn probability to approximate survival
        return self._predict_with_risk_approximation(
            hr_code=hr_code,
            tenure=tenure,
            risk_score=risk_score
        )

    def _predict_with_cox_model(
        self,
        hr_code: str,
        tenure: float,
        risk_score: float,
        department: str
    ) -> SurvivalPrediction:
        """Use fitted Cox model for predictions"""
        import pandas as pd

        # Create feature vector
        features = pd.DataFrame([{
            'risk_score': risk_score,
            'dept_encoded': 0  # Default encoding
        }])

        # Get survival function for this employee
        surv_func = self._model.predict_survival_function(features)

        # Convert tenure years to days for time horizons
        days_per_year = 365.25

        # Time points in years
        t_30d = 30 / days_per_year
        t_60d = 60 / days_per_year
        t_90d = 90 / days_per_year
        t_180d = 180 / days_per_year
        t_365d = 1.0

        # Get survival probabilities (probability of NOT leaving)
        # Then convert to probability of leaving = 1 - survival
        times = [t_30d, t_60d, t_90d, t_180d, t_365d]

        # Interpolate survival function at our time points
        probs = []
        for t in times:
            # Find closest time in survival function
            idx = (surv_func.index - (tenure + t)).abs().argmin()
            surv_prob = float(surv_func.iloc[idx, 0])
            departure_prob = 1 - surv_prob
            probs.append(min(max(departure_prob, 0), 1))

        prob_30, prob_60, prob_90, prob_180, prob_365 = probs

        # Get median survival time
        try:
            median_surv = self._model.predict_median(features)
            median_days = float(median_surv.iloc[0]) * days_per_year
        except (ValueError, IndexError, AttributeError) as e:
            logger.debug(f"Could not calculate median survival time: {e}")
            median_days = None
        except Exception as e:
            logger.warning(f"Unexpected error calculating median survival: {type(e).__name__}: {e}")
            median_days = None

        # Determine departure window and urgency
        departure_window, urgency = self._determine_window_and_urgency(
            prob_30, prob_60, prob_90, prob_180, risk_score
        )

        # Hazard ratio (relative risk)
        hazard = float(self._model.predict_partial_hazard(features).iloc[0])

        # Confidence based on model quality and data availability
        confidence = min(0.95, self._model.concordance_index_ * 1.1)

        return SurvivalPrediction(
            hr_code=hr_code,
            current_tenure=round(tenure, 2),
            prob_30_days=round(prob_30, 3),
            prob_60_days=round(prob_60, 3),
            prob_90_days=round(prob_90, 3),
            prob_180_days=round(prob_180, 3),
            prob_365_days=round(prob_365, 3),
            median_survival_days=round(median_days, 0) if median_days else None,
            departure_window=departure_window,
            urgency=urgency,
            confidence=round(confidence, 2),
            hazard_ratio=round(hazard, 2)
        )

    def _predict_with_risk_approximation(
        self,
        hr_code: str,
        tenure: float,
        risk_score: float,
        dataset_id: Optional[str] = None
    ) -> SurvivalPrediction:
        """
        Approximate survival predictions using churn probability.

        Uses exponential decay model where hazard is proportional to risk score.
        Base hazard rate is computed from actual turnover data, not hardcoded.
        """
        # Base hazard rate (probability of leaving per year)
        # Computed from actual turnover data
        base_hazard = self.thresholds_service.get_base_hazard_rate(dataset_id)
        hazard_rate = base_hazard + (risk_score * 0.5)  # Risk amplifies hazard

        # Survival function: S(t) = exp(-hazard * t)
        # Departure probability: F(t) = 1 - S(t)
        def departure_prob(days):
            t = days / 365.25
            return 1 - np.exp(-hazard_rate * t)

        prob_30 = departure_prob(30)
        prob_60 = departure_prob(60)
        prob_90 = departure_prob(90)
        prob_180 = departure_prob(180)
        prob_365 = departure_prob(365)

        # Median survival: solve for t where S(t) = 0.5
        # 0.5 = exp(-hazard * t) => t = ln(2) / hazard
        if hazard_rate > 0:
            median_days = (np.log(2) / hazard_rate) * 365.25
        else:
            median_days = None

        departure_window, urgency = self._determine_window_and_urgency(
            prob_30, prob_60, prob_90, prob_180, risk_score, dataset_id
        )

        return SurvivalPrediction(
            hr_code=hr_code,
            current_tenure=round(tenure, 2),
            prob_30_days=round(prob_30, 3),
            prob_60_days=round(prob_60, 3),
            prob_90_days=round(prob_90, 3),
            prob_180_days=round(prob_180, 3),
            prob_365_days=round(prob_365, 3),
            median_survival_days=round(median_days, 0) if median_days else None,
            departure_window=departure_window,
            urgency=urgency,
            confidence=0.6,  # Lower confidence for approximation
            hazard_ratio=round(hazard_rate / base_hazard, 2) if base_hazard > 0 else 1.0
        )

    def _determine_window_and_urgency(
        self,
        prob_30: float,
        prob_60: float,
        prob_90: float,
        prob_180: float,
        risk_score: float,
        dataset_id: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Determine departure window and urgency from probabilities.

        Uses the risk level from data-driven thresholds to determine urgency.
        """
        # Get risk level using data-driven thresholds
        risk_level = self.thresholds_service.get_risk_level(risk_score, dataset_id)

        # Determine departure window based on probability thresholds
        # Note: probability thresholds (0.5, 0.3) are statistical, not data-specific
        if prob_30 >= 0.5:
            window = "< 30 days"
            urgency = "critical"
        elif prob_60 >= 0.5:
            window = "30-60 days"
            urgency = "critical" if risk_level == 'high' else "high"
        elif prob_90 >= 0.5:
            window = "60-90 days"
            urgency = "high"
        elif prob_180 >= 0.5:
            window = "3-6 months"
            urgency = "medium"
        elif prob_180 >= 0.3:
            window = "6-12 months"
            urgency = "low"
        else:
            window = "1+ year"
            urgency = "low"

        return window, urgency

    async def get_batch_predictions(
        self,
        db: AsyncSession,
        dataset_id: str,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """Get survival predictions for multiple employees"""

        # Get all employees with churn predictions
        result = await db.execute(
            select(HRDataInput.hr_code)
            .where(HRDataInput.dataset_id == dataset_id)
            .limit(limit)
        )
        hr_codes = [r[0] for r in result.all()]

        predictions = []
        for hr_code in hr_codes:
            pred = await self.predict_survival(db, hr_code, dataset_id)
            if pred:
                predictions.append(asdict(pred))

        # Sort by urgency then probability
        urgency_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        predictions.sort(
            key=lambda x: (urgency_order.get(x['urgency'], 4), -x['prob_90_days'])
        )

        return predictions


# Singleton instance
survival_service = SurvivalAnalysisService()
