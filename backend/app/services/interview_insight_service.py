"""
Interview Insight Service

Analyzes interview data (stay interviews, exit interviews) to extract
risk signals and sentiment that contribute to churn prediction.

Uses:
- Keyword-based sentiment analysis
- Pattern matching for risk indicators
- LLM integration for deeper analysis (optional)
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import re

from app.models.hr_data import InterviewData


@dataclass
class InterviewInsight:
    """Insight extracted from a single interview"""
    interview_id: int
    interview_type: str  # 'stay' or 'exit'
    interview_date: datetime
    sentiment_score: float  # -1 (negative) to 1 (positive)
    risk_signals: List[str]
    positive_signals: List[str]
    key_themes: List[str]
    risk_adjustment: float  # How this interview affects risk (-0.3 to +0.3)


@dataclass
class InterviewAnalysisResult:
    """Combined analysis of all interviews for an employee"""
    total_interviews: int
    recent_interviews: int  # Within last 12 months
    average_sentiment: float
    risk_adjustment: float  # Combined risk adjustment
    confidence: float
    insights: List[InterviewInsight]
    summary: str
    recommendations: List[str]


class InterviewInsightService:
    """
    Service for analyzing interview data to extract churn risk signals.
    """

    # Keywords for sentiment analysis
    NEGATIVE_KEYWORDS = {
        'high_risk': [
            'leaving', 'quit', 'resign', 'frustrated', 'unhappy', 'unfair',
            'toxic', 'burnout', 'overworked', 'underpaid', 'no growth',
            'looking elsewhere', 'job hunting', 'better opportunity',
            'not valued', 'micromanaged', 'disrespected'
        ],
        'moderate_risk': [
            'concerned', 'worried', 'stressed', 'unclear', 'confused',
            'uncertain', 'disappointed', 'overlooked', 'stuck', 'bored',
            'monotonous', 'repetitive', 'underutilized', 'no challenge'
        ],
        'low_risk': [
            'okay', 'fine', 'managing', 'coping', 'getting by',
            'acceptable', 'tolerable', 'adequate'
        ]
    }

    POSITIVE_KEYWORDS = {
        'high_positive': [
            'love', 'excellent', 'amazing', 'fantastic', 'thriving',
            'valued', 'appreciated', 'growth', 'promoted', 'recognized',
            'great team', 'supportive manager', 'career development',
            'meaningful work', 'proud', 'committed', 'engaged'
        ],
        'moderate_positive': [
            'good', 'enjoy', 'like', 'satisfied', 'happy', 'comfortable',
            'supported', 'learning', 'developing', 'improving',
            'interesting', 'challenging'
        ]
    }

    # Risk signal patterns
    RISK_PATTERNS = [
        (r'looking for (new|other|different) (job|role|opportunity)', 0.25, 'Actively job searching'),
        (r'(resume|cv|linkedin) (updated|ready)', 0.20, 'Resume preparation'),
        (r'(interview|offer) (scheduled|received|considering)', 0.30, 'External interview activity'),
        (r'(salary|pay|compensation) (below|lower|unfair|market)', 0.15, 'Compensation concerns'),
        (r'(no|lack of|limited) (growth|promotion|advancement)', 0.15, 'Career stagnation'),
        (r'(manager|leadership|management) (problem|issue|conflict)', 0.12, 'Management issues'),
        (r'work.{0,10}life.{0,10}balance', 0.10, 'Work-life balance concerns'),
        (r'(burnout|exhausted|overwhelmed)', 0.15, 'Burnout indicators'),
        (r'(team|culture|environment).{0,10}(toxic|hostile|negative)', 0.18, 'Toxic environment'),
    ]

    # Positive signal patterns
    POSITIVE_PATTERNS = [
        (r'(love|enjoy|passionate about).{0,10}(job|work|role|team)', -0.10, 'Job satisfaction'),
        (r'(great|excellent|supportive).{0,10}manager', -0.08, 'Good management'),
        (r'(growth|learning|development).{0,10}opportunit', -0.08, 'Growth opportunities'),
        (r'(valued|appreciated|recognized)', -0.07, 'Feeling valued'),
        (r'(work.{0,10}life|flexibility)', -0.05, 'Work-life balance'),
        (r'(competitive|fair|good).{0,10}(salary|pay|compensation)', -0.06, 'Fair compensation'),
        (r'(excited|motivated|engaged)', -0.08, 'High engagement'),
    ]

    def __init__(self):
        self._interview_cache: Dict[str, List[InterviewData]] = {}
        self._cache_ttl_minutes = 30

    async def _get_interviews(
        self,
        hr_code: str,
        db: AsyncSession,
        months_lookback: int = 24
    ) -> List[InterviewData]:
        """Get interviews for an employee from database"""
        try:
            cutoff_date = datetime.utcnow().date() - timedelta(days=months_lookback * 30)

            query = select(InterviewData).where(
                InterviewData.hr_code == hr_code,
                InterviewData.interview_date >= cutoff_date
            ).order_by(desc(InterviewData.interview_date))

            result = await db.execute(query)
            return list(result.scalars().all())

        except Exception as e:
            print(f"Error fetching interviews: {e}")
            return []

    def _analyze_sentiment(self, text: str) -> Tuple[float, List[str], List[str]]:
        """
        Analyze sentiment of interview text.

        Returns:
            Tuple of (sentiment_score, negative_signals, positive_signals)
        """
        if not text:
            return 0.0, [], []

        text_lower = text.lower()
        negative_signals = []
        positive_signals = []
        score = 0.0

        # Check negative keywords
        for risk_level, keywords in self.NEGATIVE_KEYWORDS.items():
            weight = {'high_risk': -0.3, 'moderate_risk': -0.15, 'low_risk': -0.05}[risk_level]
            for keyword in keywords:
                if keyword in text_lower:
                    score += weight
                    negative_signals.append(keyword)

        # Check positive keywords
        for pos_level, keywords in self.POSITIVE_KEYWORDS.items():
            weight = {'high_positive': 0.25, 'moderate_positive': 0.12}[pos_level]
            for keyword in keywords:
                if keyword in text_lower:
                    score += weight
                    positive_signals.append(keyword)

        # Normalize to -1 to 1
        score = max(-1.0, min(1.0, score))

        return score, list(set(negative_signals))[:5], list(set(positive_signals))[:5]

    def _extract_risk_signals(self, text: str) -> Tuple[float, List[str]]:
        """
        Extract specific risk signals using pattern matching.

        Returns:
            Tuple of (risk_adjustment, list of signals)
        """
        if not text:
            return 0.0, []

        text_lower = text.lower()
        total_adjustment = 0.0
        signals = []

        # Check risk patterns
        for pattern, adjustment, signal_name in self.RISK_PATTERNS:
            if re.search(pattern, text_lower):
                total_adjustment += adjustment
                signals.append(signal_name)

        # Check positive patterns
        for pattern, adjustment, signal_name in self.POSITIVE_PATTERNS:
            if re.search(pattern, text_lower):
                total_adjustment += adjustment
                signals.append(f"(+) {signal_name}")

        # Cap total adjustment
        total_adjustment = max(-0.3, min(0.3, total_adjustment))

        return total_adjustment, signals

    def _extract_themes(self, text: str) -> List[str]:
        """Extract key themes from interview text"""
        if not text:
            return []

        text_lower = text.lower()
        themes = []

        theme_patterns = [
            (r'(career|growth|promotion|advancement)', 'Career Development'),
            (r'(salary|pay|compensation|bonus)', 'Compensation'),
            (r'(manager|leadership|supervisor|boss)', 'Management'),
            (r'(team|colleague|coworker)', 'Team Dynamics'),
            (r'(work.{0,5}life|balance|flexibility|remote)', 'Work-Life Balance'),
            (r'(culture|environment|atmosphere)', 'Company Culture'),
            (r'(training|learning|skill|development)', 'Learning & Development'),
            (r'(recognition|appreciation|value)', 'Recognition'),
            (r'(workload|hours|overtime|stress)', 'Workload'),
            (r'(benefit|perk|insurance|vacation)', 'Benefits'),
        ]

        for pattern, theme in theme_patterns:
            if re.search(pattern, text_lower):
                themes.append(theme)

        return themes[:5]  # Top 5 themes

    def _analyze_single_interview(self, interview: InterviewData) -> InterviewInsight:
        """Analyze a single interview"""
        notes = interview.notes or ''

        # Get sentiment
        sentiment, neg_signals, pos_signals = self._analyze_sentiment(notes)

        # Get risk signals
        risk_adjustment, risk_signals = self._extract_risk_signals(notes)

        # Get themes
        themes = self._extract_themes(notes)

        # Use stored sentiment if available
        if interview.sentiment_score is not None:
            sentiment = float(interview.sentiment_score)

        # Adjust risk based on interview type
        if interview.interview_type == 'exit':
            # Exit interviews indicate the person has already decided to leave
            risk_adjustment = min(0.3, risk_adjustment + 0.15)

        return InterviewInsight(
            interview_id=interview.id,
            interview_type=interview.interview_type,
            interview_date=interview.interview_date,
            sentiment_score=sentiment,
            risk_signals=neg_signals + [s for s in risk_signals if not s.startswith('(+)')],
            positive_signals=pos_signals + [s.replace('(+) ', '') for s in risk_signals if s.startswith('(+)')],
            key_themes=themes,
            risk_adjustment=risk_adjustment
        )

    def _generate_summary(self, insights: List[InterviewInsight]) -> str:
        """Generate summary text from insights"""
        if not insights:
            return "No interview data available for analysis."

        recent = [i for i in insights if
                  (datetime.utcnow().date() - i.interview_date).days < 365]

        if not recent:
            return "No recent interviews (within 12 months). Historical data suggests need for check-in."

        avg_sentiment = sum(i.sentiment_score for i in recent) / len(recent)
        all_risks = []
        for i in recent:
            all_risks.extend(i.risk_signals)

        if avg_sentiment < -0.3:
            sentiment_desc = "predominantly negative"
        elif avg_sentiment < 0:
            sentiment_desc = "slightly negative"
        elif avg_sentiment < 0.3:
            sentiment_desc = "neutral to slightly positive"
        else:
            sentiment_desc = "positive"

        summary = f"Based on {len(recent)} recent interview(s), overall sentiment is {sentiment_desc}. "

        if all_risks:
            top_risks = list(set(all_risks))[:3]
            summary += f"Key concerns: {', '.join(top_risks)}. "

        return summary

    def _generate_recommendations(self, insights: List[InterviewInsight]) -> List[str]:
        """Generate recommendations based on insights"""
        recommendations = []

        if not insights:
            recommendations.append("Schedule a stay interview to assess employee sentiment")
            return recommendations

        all_themes = []
        all_risks = []
        avg_sentiment = 0.0

        for insight in insights:
            all_themes.extend(insight.key_themes)
            all_risks.extend(insight.risk_signals)
            avg_sentiment += insight.sentiment_score

        avg_sentiment /= len(insights)
        theme_counts = {}
        for theme in all_themes:
            theme_counts[theme] = theme_counts.get(theme, 0) + 1

        # Theme-based recommendations
        if theme_counts.get('Career Development', 0) > 0:
            recommendations.append("Discuss career path and promotion timeline")

        if theme_counts.get('Compensation', 0) > 0:
            recommendations.append("Review compensation against market rates")

        if theme_counts.get('Management', 0) > 0:
            recommendations.append("Address manager relationship concerns")

        if theme_counts.get('Work-Life Balance', 0) > 0:
            recommendations.append("Explore flexible work arrangements")

        if theme_counts.get('Workload', 0) > 0:
            recommendations.append("Review workload distribution and priorities")

        # Risk-based recommendations
        if 'Actively job searching' in all_risks or 'External interview activity' in all_risks:
            recommendations.insert(0, "URGENT: Immediate retention conversation needed")

        if 'Burnout indicators' in all_risks:
            recommendations.append("Consider reduced workload or time off")

        # Sentiment-based recommendations
        if avg_sentiment < -0.2:
            recommendations.append("Schedule follow-up meeting to address concerns")

        if not recommendations:
            recommendations.append("Continue regular check-ins to maintain engagement")

        return recommendations[:5]

    async def analyze_employee(
        self,
        hr_code: str,
        db: AsyncSession,
        months_lookback: int = 24
    ) -> InterviewAnalysisResult:
        """
        Analyze all interviews for an employee.

        Args:
            hr_code: Employee identifier
            db: Database session
            months_lookback: How many months of history to consider

        Returns:
            InterviewAnalysisResult with combined analysis
        """
        # Get interviews
        interviews = await self._get_interviews(hr_code, db, months_lookback)

        if not interviews:
            return InterviewAnalysisResult(
                total_interviews=0,
                recent_interviews=0,
                average_sentiment=0.0,
                risk_adjustment=0.0,
                confidence=0.2,  # Low confidence without data
                insights=[],
                summary="No interview data available. Consider scheduling a stay interview.",
                recommendations=["Schedule a stay interview to assess employee sentiment"]
            )

        # Analyze each interview
        insights = [self._analyze_single_interview(i) for i in interviews]

        # Calculate recent (within 12 months)
        cutoff = datetime.utcnow().date() - timedelta(days=365)
        recent_insights = [i for i in insights if i.interview_date >= cutoff]

        # Calculate averages
        if recent_insights:
            avg_sentiment = sum(i.sentiment_score for i in recent_insights) / len(recent_insights)
            # Weight more recent interviews higher
            total_adjustment = 0.0
            total_weight = 0.0
            for idx, insight in enumerate(recent_insights):
                weight = 1.0 / (idx + 1)  # More recent = higher weight
                total_adjustment += insight.risk_adjustment * weight
                total_weight += weight
            risk_adjustment = total_adjustment / total_weight if total_weight > 0 else 0.0
        else:
            avg_sentiment = sum(i.sentiment_score for i in insights) / len(insights)
            risk_adjustment = sum(i.risk_adjustment for i in insights) / len(insights) * 0.5  # Discount old data

        # Calculate confidence
        recency_factor = len(recent_insights) / max(len(insights), 1)
        data_factor = min(1.0, len(insights) / 3)  # More interviews = more confidence
        confidence = 0.3 + (recency_factor * 0.4) + (data_factor * 0.3)

        # Generate summary and recommendations
        summary = self._generate_summary(insights)
        recommendations = self._generate_recommendations(insights)

        return InterviewAnalysisResult(
            total_interviews=len(interviews),
            recent_interviews=len(recent_insights),
            average_sentiment=avg_sentiment,
            risk_adjustment=risk_adjustment,
            confidence=confidence,
            insights=insights,
            summary=summary,
            recommendations=recommendations
        )

    async def analyze_batch(
        self,
        hr_codes: List[str],
        db: AsyncSession
    ) -> Dict[str, InterviewAnalysisResult]:
        """Analyze interviews for multiple employees"""
        results = {}
        for hr_code in hr_codes:
            results[hr_code] = await self.analyze_employee(hr_code, db)
        return results


# Singleton instance
interview_insight_service = InterviewInsightService()
