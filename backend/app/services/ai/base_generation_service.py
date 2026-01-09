"""
Base AI Generation Service

Abstract base class for AI-powered generation services that share common functionality:
- Database session management
- ChatbotService integration
- Employee context gathering
- Risk threshold calculations
- JSON response parsing

Subclasses: TreatmentGenerationService, ActionGenerationService
"""

import json
import logging
from abc import ABC
from typing import Dict, Any, Optional, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.chatbot_service import ChatbotService
from app.services.ai.llm_config import resolve_llm_provider_and_model
from app.services.utils.risk_helpers import (
    get_risk_thresholds,
    get_risk_level,
    get_priority_from_risk,
    get_urgency_and_focus,
)
from app.services.utils.json_helpers import (
    parse_json_response,
    safe_json_loads,
)
from app.services.utils.employee_helpers import (
    get_employee_by_hr_code,
    get_churn_data_by_hr_code,
    get_churn_reasoning_by_hr_code,
    get_eltv_data_by_hr_code,
    get_interview_data_by_hr_code,
    get_treatment_history_by_hr_code,
)

logger = logging.getLogger(__name__)


class BaseAIGenerationService(ABC):
    """
    Base class for AI-powered generation services.

    Provides common functionality for:
    - Employee data fetching
    - Risk calculations using data-driven thresholds
    - JSON response parsing
    - Context building for LLM prompts
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize the base service.

        Args:
            db: Async database session
        """
        self.db = db
        self.chatbot_service = ChatbotService(db)

    async def _get_configured_model(self) -> str:
        """Get the model configured in app settings."""
        _, _, model = await resolve_llm_provider_and_model(self.db)
        return model

    # =========================================================================
    # Risk Calculation Methods (delegated to shared utilities)
    # =========================================================================

    def _get_risk_thresholds(self, dataset_id: Optional[str] = None) -> tuple:
        """Get data-driven risk thresholds (high, medium)."""
        return get_risk_thresholds(dataset_id)

    def _get_risk_level(
        self,
        risk_score: float,
        dataset_id: Optional[str] = None,
        include_critical: bool = False
    ) -> str:
        """Determine risk level using data-driven thresholds."""
        return get_risk_level(risk_score, dataset_id, include_critical)

    def _get_priority(self, risk_score: float, dataset_id: Optional[str] = None) -> str:
        """Get priority level based on risk score."""
        return get_priority_from_risk(risk_score, dataset_id)

    def _get_urgency_and_focus(
        self,
        risk_score: float,
        dataset_id: Optional[str] = None
    ) -> tuple:
        """Get urgency level and treatment focus based on risk score."""
        return get_urgency_and_focus(risk_score, dataset_id)

    # =========================================================================
    # Employee Data Fetching Methods
    # =========================================================================

    async def _get_employee_data(self, hr_code: str):
        """Get the most recent employee data by HR code."""
        return await get_employee_by_hr_code(self.db, hr_code)

    async def _get_churn_data(self, hr_code: str):
        """Get the most recent churn prediction data by HR code."""
        return await get_churn_data_by_hr_code(self.db, hr_code)

    async def _get_churn_reasoning(self, hr_code: str):
        """Get the most recent churn reasoning by HR code."""
        return await get_churn_reasoning_by_hr_code(self.db, hr_code)

    async def _get_eltv_data(self, hr_code: str):
        """Get Employee Lifetime Value data by HR code."""
        return await get_eltv_data_by_hr_code(self.db, hr_code)

    async def _get_interview_data(self, hr_code: str, limit: int = 5) -> List:
        """Get interview history for employee."""
        return await get_interview_data_by_hr_code(self.db, hr_code, limit)

    async def _get_treatment_history(self, hr_code: str, limit: int = 10) -> List:
        """Get treatment application history for employee."""
        return await get_treatment_history_by_hr_code(self.db, hr_code, limit)

    # =========================================================================
    # JSON Parsing Methods
    # =========================================================================

    def _parse_json_response(self, response_text: str, expect_type: str = "object") -> Any:
        """Parse JSON from LLM response."""
        return parse_json_response(response_text, expect_type)

    def _safe_json_loads(self, text: str, default: Any = None) -> Any:
        """Safely parse JSON with fallback to default value."""
        return safe_json_loads(text, default)

    # =========================================================================
    # Context Building Methods
    # =========================================================================

    async def _get_comprehensive_employee_context(self, hr_code: str) -> Dict[str, Any]:
        """
        Gather all available data about an employee for personalized generation.

        Args:
            hr_code: Employee HR code

        Returns:
            Comprehensive context dictionary with employee, churn, reasoning,
            eltv, interviews, and treatments data
        """
        context = {
            "employee": None,
            "churn": None,
            "reasoning": None,
            "eltv": None,
            "interviews": [],
            "treatments": [],
            "additional_data": {}
        }

        # 1. Basic employee data
        employee = await self._get_employee_data(hr_code)
        if not employee:
            return context

        context["employee"] = {
            "hr_code": employee.hr_code,
            "full_name": employee.full_name,
            "position": employee.position,
            "department": employee.structure_name,
            "status": employee.status,
            "tenure_years": float(employee.tenure) if employee.tenure else 0,
            "employee_cost": float(employee.employee_cost) if employee.employee_cost else None,
            "manager_id": employee.manager_id,
            "dataset_id": employee.dataset_id,
        }

        # Parse additional_data JSON if available
        if employee.additional_data:
            try:
                add_data = self._safe_json_loads(employee.additional_data, {})
                context["additional_data"] = add_data
                context["employee"].update({
                    "age": add_data.get("age"),
                    "gender": add_data.get("gender"),
                    "education": add_data.get("education"),
                    "marital_status": add_data.get("marital_status"),
                    "performance_rating": add_data.get("performance_rating"),
                    "job_satisfaction": add_data.get("job_satisfaction"),
                    "work_life_balance": add_data.get("work_life_balance"),
                    "years_at_company": add_data.get("years_at_company"),
                    "years_in_role": add_data.get("years_in_current_role"),
                    "years_since_promotion": add_data.get("years_since_last_promotion"),
                    "training_times_last_year": add_data.get("training_times_last_year"),
                    "salary_hike_percent": add_data.get("percent_salary_hike"),
                    "overtime": add_data.get("over_time"),
                    "business_travel": add_data.get("business_travel"),
                    "distance_from_home": add_data.get("distance_from_home"),
                    "num_companies_worked": add_data.get("num_companies_worked"),
                    "stock_option_level": add_data.get("stock_option_level"),
                    "job_involvement": add_data.get("job_involvement"),
                    "environment_satisfaction": add_data.get("environment_satisfaction"),
                    "relationship_satisfaction": add_data.get("relationship_satisfaction"),
                })
            except Exception as e:
                logger.warning(f"Error parsing additional_data: {type(e).__name__}: {e}")

        # 2. Churn prediction data
        churn_data = await self._get_churn_data(hr_code)
        if churn_data:
            context["churn"] = {
                "risk_score": float(churn_data.resign_proba) if churn_data.resign_proba else 0.5,
                "confidence": float(churn_data.confidence_score) if churn_data.confidence_score else 70,
                "model_version": churn_data.model_version,
                "prediction_date": str(churn_data.prediction_date) if churn_data.prediction_date else None,
            }
            # Parse SHAP values for feature importance
            if churn_data.shap_values:
                try:
                    shap = self._safe_json_loads(churn_data.shap_values, {})
                    if isinstance(shap, dict):
                        sorted_features = sorted(
                            shap.items(),
                            key=lambda x: abs(float(x[1]) if x[1] else 0),
                            reverse=True
                        )[:5]
                        context["churn"]["top_risk_drivers"] = [
                            {"feature": f[0].replace("_", " ").title(), "impact": float(f[1]) if f[1] else 0}
                            for f in sorted_features
                        ]
                except Exception as e:
                    logger.debug(f"Error parsing SHAP values: {e}")

        # 3. Churn reasoning (detailed analysis)
        reasoning = await self._get_churn_reasoning(hr_code)
        if reasoning:
            context["reasoning"] = {
                "stage": reasoning.stage,
                "stage_score": float(reasoning.stage_score) if reasoning.stage_score else 0,
                "ml_score": float(reasoning.ml_score) if reasoning.ml_score else 0,
                "heuristic_score": float(reasoning.heuristic_score) if reasoning.heuristic_score else 0,
                "confidence_level": float(reasoning.confidence_level) if reasoning.confidence_level else 0.7,
            }
            # Parse ML contributors
            if reasoning.ml_contributors:
                contributors = self._safe_json_loads(reasoning.ml_contributors, [])
                context["reasoning"]["ml_contributors"] = contributors[:5] if isinstance(contributors, list) else []
            # Parse heuristic alerts
            if reasoning.heuristic_alerts:
                alerts = self._safe_json_loads(reasoning.heuristic_alerts, [])
                context["reasoning"]["alerts"] = alerts[:5] if isinstance(alerts, list) else []
            # Parse recommendations
            if reasoning.recommendations:
                recs = self._safe_json_loads(reasoning.recommendations, None)
                if isinstance(recs, list):
                    context["reasoning"]["recommendations"] = recs[:3]
                elif recs is None:
                    context["reasoning"]["recommendations_text"] = reasoning.recommendations

        # 4. ELTV data
        eltv = await self._get_eltv_data(hr_code)
        if eltv:
            context["eltv"] = {
                "pre_treatment_value": float(eltv.eltv_pre_treatment) if eltv.eltv_pre_treatment else None,
                "post_treatment_value": float(eltv.eltv_post_treatment) if eltv.eltv_post_treatment else None,
                "treatment_effect": float(eltv.treatment_effect) if eltv.treatment_effect else None,
            }

        # 5. Interview data
        interviews = await self._get_interview_data(hr_code, limit=3)
        context["interviews"] = [
            {
                "date": str(i.interview_date),
                "type": i.interview_type,
                "notes": i.notes[:500] if i.notes else None,
                "sentiment": float(i.sentiment_score) if i.sentiment_score else None,
                "insights": i.processed_insights[:300] if i.processed_insights else None,
            }
            for i in interviews
        ]

        # 6. Treatment history
        treatments = await self._get_treatment_history(hr_code, limit=5)
        context["treatments"] = [
            {
                "treatment_name": t.treatment_name,
                "treatment_type": t.treatment_type,
                "status": t.status,
                "applied_date": str(t.applied_date) if t.applied_date else None,
                "success": t.success_indicator,
                "churn_reduction": float(t.predicted_churn_reduction) if t.predicted_churn_reduction else None,
                "roi": float(t.roi) if t.roi else None,
            }
            for t in treatments
        ]

        return context

    def _build_employee_profile_prompt(self, ctx: Dict[str, Any]) -> str:
        """Build a comprehensive employee profile section for LLM prompts."""
        emp = ctx.get("employee", {})
        if not emp:
            return "Employee data not available."

        lines = [
            "=== EMPLOYEE PROFILE ===",
            f"Name: {emp.get('full_name', 'Unknown')}",
            f"Position: {emp.get('position', 'Unknown')}",
            f"Department: {emp.get('department', 'Unknown')}",
            f"Tenure: {emp.get('tenure_years', 0):.1f} years",
        ]

        # Add optional details
        optional_fields = [
            ("age", "Age"),
            ("education", "Education"),
            ("performance_rating", "Performance Rating", "/5"),
            ("job_satisfaction", "Job Satisfaction", "/4"),
            ("work_life_balance", "Work-Life Balance", "/4"),
            ("years_in_role", "Years in Current Role"),
            ("years_since_promotion", "Years Since Last Promotion"),
            ("training_times_last_year", "Training Sessions Last Year"),
            ("overtime", "Works Overtime"),
            ("business_travel", "Business Travel"),
            ("environment_satisfaction", "Environment Satisfaction", "/4"),
            ("relationship_satisfaction", "Relationship Satisfaction", "/4"),
        ]

        for field_info in optional_fields:
            field = field_info[0]
            label = field_info[1]
            suffix = field_info[2] if len(field_info) > 2 else ""
            if emp.get(field) is not None:
                lines.append(f"{label}: {emp[field]}{suffix}")

        return "\n".join(lines)

    def _build_risk_context_prompt(self, ctx: Dict[str, Any]) -> str:
        """Build risk analysis section for LLM prompts."""
        lines = ["\n=== RISK ANALYSIS ==="]

        churn = ctx.get("churn", {})
        if churn:
            risk_score = churn.get("risk_score", 0.5)
            dataset_id = ctx.get("employee", {}).get("dataset_id")
            risk_level = self._get_risk_level(risk_score, dataset_id)
            lines.append(f"Churn Risk: {risk_level} ({risk_score:.0%})")
            lines.append(f"Prediction Confidence: {churn.get('confidence', 70):.0f}%")

            if churn.get("top_risk_drivers"):
                lines.append("Top Risk Factors:")
                for driver in churn["top_risk_drivers"][:3]:
                    impact_dir = "↑" if driver["impact"] > 0 else "↓"
                    lines.append(f"  • {driver['feature']} {impact_dir}")

        reasoning = ctx.get("reasoning", {})
        if reasoning:
            lines.append(f"Behavioral Stage: {reasoning.get('stage', 'Unknown')}")

            if reasoning.get("alerts"):
                lines.append("Active Alerts:")
                for alert in reasoning["alerts"][:3]:
                    msg = alert.get("message", str(alert)) if isinstance(alert, dict) else str(alert)
                    lines.append(f"  ⚠ {msg[:80]}")

            if reasoning.get("recommendations"):
                lines.append("AI Recommendations:")
                for rec in reasoning["recommendations"][:2]:
                    rec_text = rec.get("recommendation", str(rec)) if isinstance(rec, dict) else str(rec)
                    lines.append(f"  → {rec_text[:80]}")

        return "\n".join(lines)

    def _build_history_context_prompt(self, ctx: Dict[str, Any]) -> str:
        """Build interview and treatment history section for LLM prompts."""
        lines = []

        # Interview history
        interviews = ctx.get("interviews", [])
        if interviews:
            lines.append("\n=== RECENT INTERVIEWS ===")
            for interview in interviews[:2]:
                lines.append(f"• {interview['type'].title()} Interview ({interview['date']})")
                if interview.get("sentiment"):
                    sentiment_val = interview["sentiment"]
                    sentiment_label = "Positive" if sentiment_val > 0.6 else "Neutral" if sentiment_val > 0.4 else "Negative"
                    lines.append(f"  Sentiment: {sentiment_label}")
                if interview.get("insights"):
                    lines.append(f"  Key Insights: {interview['insights'][:150]}...")
                elif interview.get("notes"):
                    lines.append(f"  Notes: {interview['notes'][:150]}...")

        # Treatment history
        treatments = ctx.get("treatments", [])
        if treatments:
            lines.append("\n=== PAST INTERVENTIONS ===")
            for t in treatments[:3]:
                status_icon = "✓" if t.get("success") == "successful" else "→" if t.get("status") == "active" else "○"
                lines.append(f"{status_icon} {t['treatment_name']} ({t.get('status', 'unknown')}, {t.get('success', 'pending')})")
                if t.get("churn_reduction"):
                    lines.append(f"  Churn Reduction: {t['churn_reduction']:.1%}")
                if t.get("roi"):
                    lines.append(f"  ROI: {t['roi']:.1f}x")

        # ELTV context
        eltv = ctx.get("eltv", {})
        if eltv and eltv.get("pre_treatment_value"):
            lines.append("\n=== EMPLOYEE VALUE ===")
            lines.append(f"Current ELTV: ${eltv['pre_treatment_value']:,.0f}")
            if eltv.get("treatment_effect"):
                lines.append(f"Potential Value with Intervention: +${eltv['treatment_effect']:,.0f}")

        return "\n".join(lines) if lines else ""

    def _extract_risk_factors(self, reasoning) -> List[str]:
        """Extract key risk factors from reasoning data."""
        factors = []
        if not reasoning:
            return factors

        try:
            if reasoning.ml_contributors:
                contributors = self._safe_json_loads(reasoning.ml_contributors, [])
                if isinstance(contributors, list):
                    factors.extend([c.get('feature', '').replace('_', ' ') for c in contributors[:3]])

            if reasoning.heuristic_alerts:
                alerts = self._safe_json_loads(reasoning.heuristic_alerts, [])
                if isinstance(alerts, list):
                    for a in alerts[:2]:
                        if isinstance(a, dict):
                            factors.append(a.get('message', '')[:50])
                        else:
                            factors.append(str(a)[:50])
        except Exception as e:
            logger.debug(f"Error extracting risk factors: {e}")

        return factors
