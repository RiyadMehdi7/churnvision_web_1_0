"""
Intelligent Chatbot Service

Provides context-aware AI responses for ChurnVision-specific queries.
Returns structured JSON data that matches frontend renderer expectations.
"""

from typing import List, Optional, Dict, Any, Tuple, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, case
from sqlalchemy.orm import selectinload
import re
import json

from app.core.config import settings
from app.models.chatbot import ChatMessage
from app.models.hr_data import HRDataInput, InterviewData
from app.models.churn import ChurnOutput, ChurnReasoning, ELTVOutput, BehavioralStage
from app.models.treatment import TreatmentDefinition, TreatmentApplication
from app.models.rag import KnowledgeBaseSettings, CustomHRRule
from app.services.chatbot_service import ChatbotService
from app.models.dataset import Dataset
from app.services.project_service import ensure_default_project, get_active_project
from app.services.cached_queries_service import (
    get_cached_company_overview,
    get_cached_workforce_statistics,
    get_cached_department_snapshot,
    get_cached_manager_team_summary,
)
from app.services.rag_service import RAGService


class PatternType:
    """Pattern types for intelligent routing"""
    CHURN_RISK_DIAGNOSIS = "churn_risk_diagnosis"
    RETENTION_PLAN = "retention_plan"
    EMPLOYEE_COMPARISON = "employee_comparison"
    EMPLOYEE_COMPARISON_STAYED = "employee_comparison_stayed"
    EXIT_PATTERN_MINING = "exit_pattern_mining"
    SHAP_EXPLANATION = "shap_explanation"
    WORKFORCE_TRENDS = "workforce_trends"
    DEPARTMENT_ANALYSIS = "department_analysis"
    EMAIL_ACTION = "email_action"  # For composing emails to employees
    MEETING_ACTION = "meeting_action"  # For scheduling meetings with employees
    EMPLOYEE_INFO = "employee_info"  # For general "tell me about" employee queries
    GENERAL_CHAT = "general_chat"


class IntelligentChatbotService:
    """
    Intelligent chatbot service that understands ChurnVision-specific queries
    and provides context-aware responses using employee data, churn predictions,
    and treatment recommendations.

    Returns structured JSON data for frontend renderers.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.chatbot_service = ChatbotService(db)
        self.rag_service = RAGService(db)

    async def detect_pattern(self, message: str, employee_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Detect the intent pattern from user message.
        Returns (pattern_type, extracted_entities)
        """
        message_lower = message.lower()
        entities = {}

        # If employee_id provided, use it
        if employee_id:
            entities["hr_code"] = employee_id

        # Pattern: Email Action (must check early - higher priority)
        # "Write email to John", "Send mail to him", "Draft an email about meeting"
        if any(keyword in message_lower for keyword in [
            "write email", "send email", "draft email", "compose email",
            "write mail", "send mail", "draft mail", "compose mail",
            "email to", "mail to", "email about", "mail about",
            "write a message", "send a message"
        ]):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            # Extract email context/topic
            entities["email_context"] = self._extract_email_context(message)
            return PatternType.EMAIL_ACTION, entities

        # Pattern: Meeting Action
        # "Schedule a meeting with John", "Set up a call", "Book a meeting"
        if any(keyword in message_lower for keyword in [
            "schedule meeting", "set up meeting", "book meeting", "arrange meeting",
            "schedule a call", "set up a call", "meeting with", "call with",
            "one on one", "1:1", "check-in meeting", "sync with"
        ]):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            entities["meeting_context"] = self._extract_meeting_context(message)
            return PatternType.MEETING_ACTION, entities

        # Pattern: Employee Info (general questions about a selected employee)
        # "Tell me about James", "What do you know about this employee", "Who is James Scott"
        if employee_id and any(keyword in message_lower for keyword in [
            "tell me about", "what about", "who is", "info about", "information about",
            "what do you know", "details about", "profile", "summary of"
        ]):
            return PatternType.EMPLOYEE_INFO, entities

        # Pattern: Workforce Trends / Overall Analysis
        # "Show overall churn trends", "What are the workforce trends?"
        if any(keyword in message_lower for keyword in [
            "workforce trend", "overall trend", "churn trend", "organization trend",
            "company trend", "overall analysis", "workforce analysis", "overall risk"
        ]):
            return PatternType.WORKFORCE_TRENDS, entities

        # Pattern: Department Analysis
        # "Analyze Sales department", "How is Engineering doing?"
        if any(keyword in message_lower for keyword in [
            "department", "team analysis", "analyze team", "department risk"
        ]):
            entities["department"] = self._extract_department(message)
            return PatternType.DEPARTMENT_ANALYSIS, entities

        # Pattern: Churn Risk Diagnosis
        # "Why is John Smith at high risk?", "Diagnose risk for employee CV001"
        # Also catches casual questions about employee problems/issues when employee is selected
        risk_keywords = [
            "why is", "at risk", "churn risk", "risk score", "explain risk",
            "diagnose", "risk diagnosis", "analyze risk", "risk analysis",
            "high risk", "medium risk", "low risk", "leaving", "quit", "resign"
        ]
        # When employee is selected, also catch casual questions about problems/issues
        if employee_id:
            risk_keywords.extend([
                "problem", "issue", "concern", "wrong", "matter", "happening",
                "going on", "situation", "status", "what's up", "whats up",
                "why", "reason", "cause", "explain", "understand"
            ])
        if any(keyword in message_lower for keyword in risk_keywords):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.CHURN_RISK_DIAGNOSIS, entities

        # Pattern: Retention Plan Generation
        # "Create a retention plan for Mike Chen"
        if any(keyword in message_lower for keyword in [
            "retention plan", "retention strategy", "create plan", "generate plan",
            "retention playbook", "keep employee", "prevent churn"
        ]):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.RETENTION_PLAN, entities

        # Pattern: Employee Comparison (Stayed)
        # "Compare with employees who stayed", "Similar employees who are retained"
        if any(keyword in message_lower for keyword in ["stayed", "retained", "still here", "not resigned"]):
            if "compare" in message_lower or "similar" in message_lower:
                if not entities.get("hr_code"):
                    entities["employee_name"] = self._extract_employee_name(message)
                    entities["hr_code"] = self._extract_hr_code(message)
                return PatternType.EMPLOYEE_COMPARISON_STAYED, entities

        # Pattern: Employee Comparison (Resigned)
        # "Compare Sarah with similar resigned employees"
        if any(keyword in message_lower for keyword in [
            "compare", "similar", "resigned employees", "like", "peers"
        ]):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.EMPLOYEE_COMPARISON, entities

        # Pattern: Exit Pattern Mining
        # "Show common exit patterns", "Why do employees leave?"
        if any(keyword in message_lower for keyword in [
            "exit pattern", "resignation pattern", "common exit", "why do employees leave",
            "departure pattern", "turnover pattern", "attrition pattern"
        ]):
            return PatternType.EXIT_PATTERN_MINING, entities

        # Pattern: SHAP Explanation
        # "What factors contribute to John's risk?"
        if any(keyword in message_lower for keyword in [
            "shap", "factors", "contributors", "what affects", "risk factors",
            "contributing factors", "why high risk"
        ]):
            if not entities.get("hr_code"):
                entities["employee_name"] = self._extract_employee_name(message)
                entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.SHAP_EXPLANATION, entities

        # Default: General Chat
        return PatternType.GENERAL_CHAT, entities

    def _extract_employee_name(self, message: str) -> Optional[str]:
        """Extract employee name from message using pattern matching"""
        patterns = [
            r"(?:for|is|about|analyze|diagnose)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
            r"employee\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
            r"([A-Z][a-z]+\s+[A-Z][a-z]+)(?:'s|\s+risk|\s+churn)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message)
            if match:
                return match.group(1)
        return None

    def _extract_hr_code(self, message: str) -> Optional[str]:
        """Extract HR code from message"""
        patterns = [
            r"(?:hr_code|hr code|employee|id|code)[:\s]+([A-Z]{2,}[0-9]+)",
            r"\b([A-Z]{2}[0-9]{4,})\b",  # e.g., CV000123
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1).upper()
        return None

    def _extract_department(self, message: str) -> Optional[str]:
        """Extract department name from message"""
        patterns = [
            r"(?:analyze|check|show|how is)\s+(?:the\s+)?([A-Za-z]+)\s+(?:department|team)",
            r"([A-Za-z]+)\s+department",
            r"department[:\s]+([A-Za-z]+)",
            r"(?:the\s+)?([A-Za-z]+)\s+(?:team|group|division)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def _extract_email_context(self, message: str) -> Optional[str]:
        """Extract email context/topic from message"""
        patterns = [
            r"(?:email|mail|message)\s+(?:about|regarding|concerning|for)\s+(.+?)(?:\.|$)",
            r"(?:about|regarding|concerning)\s+(?:a\s+)?(.+?)(?:\s+to\s+|\s+for\s+|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    def _extract_meeting_context(self, message: str) -> Optional[str]:
        """Extract meeting context/topic from message"""
        patterns = [
            r"(?:meeting|call|sync)\s+(?:about|regarding|concerning|for)\s+(.+?)(?:\.|$)",
            r"(?:to discuss|discussing)\s+(.+?)(?:\.|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    async def _resolve_dataset_id(self, dataset_id: Optional[str]) -> str:
        """Resolve the active dataset id, defaulting to the active project dataset."""
        if dataset_id:
            result = await self.db.execute(select(Dataset).where(Dataset.dataset_id == dataset_id))
            if result.scalar_one_or_none():
                return dataset_id
            raise ValueError("Dataset not found. Please select a valid dataset and try again.")

        # Use active project dataset
        await ensure_default_project(self.db)
        active_project = await get_active_project(self.db)
        result = await self.db.execute(
            select(Dataset).where(Dataset.project_id == active_project.id, Dataset.is_active == 1).limit(1)
        )
        dataset = result.scalar_one_or_none()
        if not dataset:
            raise ValueError("No active dataset found for the current project")
        return dataset.dataset_id

    def _parse_additional_data(self, raw: Any) -> Dict[str, Any]:
        """Best-effort parse of additional_data field into a dict."""
        if not raw:
            return {}
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}

    async def gather_context(
        self,
        pattern_type: str,
        entities: Dict[str, Any],
        dataset_id: str
    ) -> Dict[str, Any]:
        """Gather relevant context from database based on pattern type"""
        context = {"pattern": pattern_type, "dataset_id": dataset_id}

        # Always include company-level overview so general/company queries are grounded
        context["company_overview"] = await self._get_company_overview(dataset_id)

        # Include company context from Knowledge Base settings (for AI personalization)
        context["company_context"] = await self._get_company_context()

        # Employee-specific patterns OR when employee_id is provided (user selected an employee)
        # Always fetch employee context when employee is selected, regardless of pattern
        needs_employee_context = pattern_type in [
            PatternType.CHURN_RISK_DIAGNOSIS,
            PatternType.RETENTION_PLAN,
            PatternType.SHAP_EXPLANATION,
            PatternType.EMPLOYEE_COMPARISON,
            PatternType.EMPLOYEE_COMPARISON_STAYED,
            PatternType.EMAIL_ACTION,
            PatternType.MEETING_ACTION,
            PatternType.EMPLOYEE_INFO
        ] or entities.get("hr_code")  # Also fetch if employee is selected

        if needs_employee_context:
            employee = await self._get_employee_data(
                hr_code=entities.get("hr_code"),
                full_name=entities.get("employee_name"),
                dataset_id=dataset_id
            )

            if employee:
                additional_data = self._parse_additional_data(getattr(employee, "additional_data", None))

                context["employee"] = {
                    "hr_code": employee.hr_code,
                    "full_name": employee.full_name,
                    "position": employee.position,
                    "structure_name": employee.structure_name,
                    "tenure": float(employee.tenure) if employee.tenure else 0,
                    "status": employee.status,
                    "employee_cost": float(employee.employee_cost) if employee.employee_cost else 50000,
                    "report_date": str(employee.report_date) if employee.report_date else None,
                    "termination_date": str(employee.termination_date) if getattr(employee, "termination_date", None) else None,
                    "manager_id": employee.manager_id,
                    "additional_data": additional_data,
                    "performance_rating_latest": additional_data.get("performance_rating_latest") or additional_data.get("performance_rating")
                }

                # Also add additional_data at top level for easier LLM context access
                context["additional_data"] = additional_data

                # Manager/team and department rollups for richer context
                if employee.manager_id:
                    context["manager_team"] = await self._get_manager_team_summary(employee.manager_id, dataset_id)

                if employee.structure_name:
                    context["department_snapshot"] = await self._get_department_snapshot(employee.structure_name, dataset_id)

                # Get churn prediction (now returns dict with counterfactuals/uncertainty)
                churn_data = await self._get_churn_data(employee.hr_code, dataset_id)
                if churn_data:
                    context["churn"] = churn_data  # Already a dict with all fields

                # Get churn reasoning
                reasoning = await self._get_churn_reasoning(employee.hr_code, dataset_id)
                ml_contributors = []
                if reasoning:
                    # Parse ml_contributors and heuristic_alerts from JSON strings
                    heuristic_alerts = []
                    if reasoning.ml_contributors:
                        try:
                            ml_contributors = json.loads(reasoning.ml_contributors) if isinstance(reasoning.ml_contributors, str) else reasoning.ml_contributors
                        except (json.JSONDecodeError, TypeError):
                            ml_contributors = []
                    if reasoning.heuristic_alerts:
                        try:
                            heuristic_alerts = json.loads(reasoning.heuristic_alerts) if isinstance(reasoning.heuristic_alerts, str) else reasoning.heuristic_alerts
                        except (json.JSONDecodeError, TypeError):
                            heuristic_alerts = []

                    context["reasoning"] = {
                        "churn_risk": float(reasoning.churn_risk) if reasoning.churn_risk else 0,
                        "stage": reasoning.stage or "Unknown",
                        "stage_score": float(reasoning.stage_score) if reasoning.stage_score else 0,
                        "ml_score": float(reasoning.ml_score) if reasoning.ml_score else 0,
                        "heuristic_score": float(reasoning.heuristic_score) if reasoning.heuristic_score else 0,
                        "ml_contributors": ml_contributors,
                        "heuristic_alerts": heuristic_alerts,
                        "reasoning": reasoning.reasoning or "",
                        "recommendations": reasoning.recommendations or "",
                        "confidence_level": float(reasoning.confidence_level) if reasoning.confidence_level else 0.7,
                        "calculation_breakdown": reasoning.calculation_breakdown
                    }

                    # Get behavioral stage details if stage is known
                    if reasoning.stage:
                        stage_details = await self._get_behavioral_stage_details(reasoning.stage)
                        if stage_details:
                            context["stage_details"] = stage_details

                # ===== NEW: COMPREHENSIVE CONTEXT GATHERING =====

                # Get ELTV (Employee Lifetime Value) for business impact
                eltv_data = await self._get_eltv_data(employee.hr_code)
                if eltv_data:
                    context["eltv"] = eltv_data

                # Get interview insights for this employee
                interviews = await self._get_interview_insights(employee.hr_code, dataset_id)
                if interviews:
                    context["interviews"] = interviews

                # Get exit interview patterns from similar employees
                if employee.position and employee.structure_name:
                    interview_patterns = await self._get_similar_employee_interview_patterns(
                        employee.position, employee.structure_name, dataset_id
                    )
                    if interview_patterns.get("total_analyzed", 0) > 0:
                        context["exit_interview_patterns"] = interview_patterns

                # Get treatment history for this employee
                treatment_history = await self._get_treatment_history(employee.hr_code)
                if treatment_history:
                    context["treatment_history"] = treatment_history

                # Extract employee risk factors for treatment matching
                employee_risk_factors = []
                if ml_contributors and isinstance(ml_contributors, list):
                    employee_risk_factors = [c.get("feature", "") for c in ml_contributors if isinstance(c, dict)]

                # Get treatments for retention plans (with relevance scoring)
                if pattern_type == PatternType.RETENTION_PLAN:
                    treatments = await self._get_available_treatments(employee_risk_factors)
                    context["treatments"] = treatments
                else:
                    # Still fetch treatments for general context but without deep matching
                    treatments = await self._get_available_treatments()
                    context["available_treatments"] = treatments[:5]  # Top 5 for reference

                # Get similar employees for comparison
                if pattern_type == PatternType.EMPLOYEE_COMPARISON:
                    similar = await self._get_similar_employees(employee, dataset_id, resigned=True)
                    context["similar_employees"] = similar
                elif pattern_type == PatternType.EMPLOYEE_COMPARISON_STAYED:
                    similar = await self._get_similar_employees(employee, dataset_id, resigned=False)
                    context["similar_employees"] = similar

                # Pass through email/meeting context for action patterns
                if pattern_type == PatternType.EMAIL_ACTION:
                    context["email_context"] = entities.get("email_context")
                elif pattern_type == PatternType.MEETING_ACTION:
                    context["meeting_context"] = entities.get("meeting_context")

        # ===== RAG CONTEXT: Fetch documents and custom rules =====
        # Retrieve RAG context for all patterns that might benefit from company policies
        if pattern_type in [
            PatternType.GENERAL_CHAT,
            PatternType.RETENTION_PLAN,
            PatternType.CHURN_RISK_DIAGNOSIS,
            PatternType.EMPLOYEE_INFO
        ]:
            rag_context = await self._get_rag_context(
                entities.get("original_message", "employee retention policies benefits"),
                context.get("employee")
            )
            if rag_context.get("documents") or rag_context.get("custom_rules"):
                context["rag_context"] = rag_context

        # Workforce trends
        if pattern_type == PatternType.WORKFORCE_TRENDS:
            context["workforce_stats"] = await self._get_workforce_statistics(dataset_id)

        # Department analysis
        if pattern_type == PatternType.DEPARTMENT_ANALYSIS:
            dept = entities.get("department")
            if dept:
                context["department_data"] = await self._get_department_analysis(dept, dataset_id)
            else:
                context["departments"] = await self._get_all_departments_overview(dataset_id)

        # Exit pattern mining
        if pattern_type == PatternType.EXIT_PATTERN_MINING:
            context["exit_data"] = await self._analyze_exit_patterns_enhanced(dataset_id)

        # For general chat we still want lightweight org stats for grounded responses
        if pattern_type == PatternType.GENERAL_CHAT and "workforce_stats" not in context:
            context["workforce_stats"] = await self._get_workforce_statistics(dataset_id)

        return context

    # ===== Database Query Methods =====

    async def _get_employee_data(
        self,
        hr_code: Optional[str],
        full_name: Optional[str],
        dataset_id: str
    ) -> Optional[HRDataInput]:
        """Fetch employee data from database"""
        query = select(HRDataInput).where(HRDataInput.dataset_id == dataset_id)

        if hr_code:
            query = query.where(HRDataInput.hr_code == hr_code)
        elif full_name:
            query = query.where(HRDataInput.full_name.ilike(f"%{full_name}%"))
        else:
            return None

        query = query.order_by(desc(HRDataInput.report_date)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_churn_data(self, hr_code: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Fetch churn prediction data including counterfactuals and uncertainty."""
        query = select(ChurnOutput).where(
            ChurnOutput.hr_code == hr_code,
            ChurnOutput.dataset_id == dataset_id
        ).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await self.db.execute(query)
        churn = result.scalar_one_or_none()

        if not churn:
            return None

        # Parse counterfactuals if available
        counterfactuals = []
        if churn.counterfactuals:
            try:
                counterfactuals = json.loads(churn.counterfactuals) if isinstance(churn.counterfactuals, str) else churn.counterfactuals
            except (json.JSONDecodeError, TypeError):
                counterfactuals = []

        return {
            "resign_proba": float(churn.resign_proba) if churn.resign_proba else 0,
            "shap_values": churn.shap_values or {},
            "confidence_score": float(churn.confidence_score) if churn.confidence_score else 0.8,
            "model_version": churn.model_version,
            "uncertainty_range": churn.uncertainty_range,
            "counterfactuals": counterfactuals,
            "prediction_date": churn.prediction_date
        }

    async def _get_churn_reasoning(self, hr_code: str, dataset_id: str) -> Optional[ChurnReasoning]:
        """Fetch churn reasoning data scoped to dataset via HR data join."""
        query = select(ChurnReasoning).join(
            HRDataInput, HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(
            ChurnReasoning.hr_code == hr_code,
            HRDataInput.dataset_id == dataset_id
        ).order_by(desc(ChurnReasoning.updated_at)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_available_treatments(self, employee_risk_factors: List[str] = None) -> List[Dict[str, Any]]:
        """Get all active treatment definitions with full metadata for context-aware matching."""
        query = select(TreatmentDefinition).where(TreatmentDefinition.is_active == 1)
        result = await self.db.execute(query)
        treatments = result.scalars().all()

        treatment_list = []
        for t in treatments:
            # Parse JSON fields
            targeted_variables = []
            best_for = []
            risk_levels = []
            impact_factors = []

            if t.targeted_variables_json:
                try:
                    targeted_variables = json.loads(t.targeted_variables_json) if isinstance(t.targeted_variables_json, str) else t.targeted_variables_json
                except (json.JSONDecodeError, TypeError):
                    targeted_variables = []

            if t.best_for_json:
                try:
                    best_for = json.loads(t.best_for_json) if isinstance(t.best_for_json, str) else t.best_for_json
                except (json.JSONDecodeError, TypeError):
                    best_for = []

            if t.risk_levels_json:
                try:
                    risk_levels = json.loads(t.risk_levels_json) if isinstance(t.risk_levels_json, str) else t.risk_levels_json
                except (json.JSONDecodeError, TypeError):
                    risk_levels = []

            if t.impact_factors_json:
                try:
                    impact_factors = json.loads(t.impact_factors_json) if isinstance(t.impact_factors_json, str) else t.impact_factors_json
                except (json.JSONDecodeError, TypeError):
                    impact_factors = []

            # Calculate relevance score if employee risk factors provided
            relevance_score = 0
            if employee_risk_factors and targeted_variables:
                matching_factors = set(str(v).lower() for v in targeted_variables) & set(str(f).lower() for f in employee_risk_factors)
                relevance_score = len(matching_factors) / max(len(employee_risk_factors), 1)

            treatment_list.append({
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "base_cost": float(t.base_cost) if t.base_cost else 0,
                "base_effect_size": float(t.base_effect_size) if t.base_effect_size else 0.1,
                "time_to_effect": t.time_to_effect or "3 months",
                "targeted_variables": targeted_variables,
                "best_for": best_for,
                "risk_levels": risk_levels,
                "impact_factors": impact_factors,
                "llm_prompt": t.llm_prompt,
                "llm_reasoning": t.llm_reasoning,
                "is_custom": t.is_custom == 1,
                "relevance_score": relevance_score
            })

        # Sort by relevance score if employee context provided
        if employee_risk_factors:
            treatment_list.sort(key=lambda x: x["relevance_score"], reverse=True)

        return treatment_list

    async def _get_similar_employees(
        self,
        employee: HRDataInput,
        dataset_id: str,
        resigned: bool = True,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Find similar employees (resigned or active)"""
        # Match "Terminated" for resigned and "Active" for active (case-insensitive)
        status_filter = "terminated" if resigned else "active"

        # Get employees with same position and similar tenure
        query = select(HRDataInput, ChurnReasoning).outerjoin(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(
            and_(
                func.lower(HRDataInput.status) == status_filter,
                HRDataInput.dataset_id == dataset_id,
                HRDataInput.hr_code != employee.hr_code,
                or_(
                    HRDataInput.position == employee.position,
                    HRDataInput.structure_name == employee.structure_name
                )
            )
        ).limit(limit)

        result = await self.db.execute(query)
        similar = result.all()

        return [
            {
                "hr_code": e.hr_code,
                "full_name": e.full_name,
                "position": e.position,
                "department": e.structure_name,
                "tenure": float(e.tenure) if e.tenure else 0,
                "termination_date": str(e.termination_date) if e.termination_date else None,
                "churn_risk": float(r.churn_risk) if r and r.churn_risk else 0,
                "stage": r.stage if r else "Unknown",
                "ml_score": float(r.ml_score) if r and r.ml_score else 0,
                "heuristic_score": float(r.heuristic_score) if r and r.heuristic_score else 0,
                "reasoning": r.reasoning if r else None
            }
            for e, r in similar
        ]

    async def _get_workforce_statistics(self, dataset_id: str) -> Dict[str, Any]:
        """Get comprehensive workforce statistics (cached)."""
        return await get_cached_workforce_statistics(self.db, dataset_id)

    async def _get_company_overview(self, dataset_id: str) -> Dict[str, Any]:
        """Aggregate company-level metrics scoped to dataset (cached)."""
        return await get_cached_company_overview(self.db, dataset_id)

    async def _get_manager_team_summary(self, manager_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Summarize team under a manager with risk/cost/tenure aggregates (cached)."""
        return await get_cached_manager_team_summary(self.db, dataset_id, manager_id)

    async def _get_department_snapshot(self, department: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Return key stats for a department to enrich responses (cached)."""
        return await get_cached_department_snapshot(self.db, dataset_id, department)

    async def _get_eltv_data(self, hr_code: str) -> Optional[Dict[str, Any]]:
        """Fetch ELTV (Employee Lifetime Value) data for business impact context."""
        query = select(ELTVOutput).where(ELTVOutput.hr_code == hr_code)
        result = await self.db.execute(query)
        eltv = result.scalar_one_or_none()

        if not eltv:
            return None

        return {
            "eltv_pre_treatment": float(eltv.eltv_pre_treatment) if eltv.eltv_pre_treatment else 0,
            "eltv_post_treatment": float(eltv.eltv_post_treatment) if eltv.eltv_post_treatment else 0,
            "treatment_effect": float(eltv.treatment_effect) if eltv.treatment_effect else 0,
            "survival_probabilities": eltv.survival_probabilities or {},
            "model_version": eltv.model_version
        }

    async def _get_interview_insights(self, hr_code: str, dataset_id: str) -> List[Dict[str, Any]]:
        """Fetch interview data (exit/stay interviews) for this employee."""
        query = select(InterviewData).where(
            InterviewData.hr_code == hr_code
        ).order_by(desc(InterviewData.interview_date)).limit(5)
        result = await self.db.execute(query)
        interviews = result.scalars().all()

        return [
            {
                "interview_date": str(i.interview_date) if i.interview_date else None,
                "interview_type": i.interview_type,
                "notes": i.notes[:500] if i.notes else None,  # Truncate for context
                "sentiment_score": float(i.sentiment_score) if i.sentiment_score else None,
                "processed_insights": i.processed_insights
            }
            for i in interviews
        ]

    async def _get_similar_employee_interview_patterns(self, position: str, department: str, dataset_id: str) -> Dict[str, Any]:
        """Analyze exit interview patterns from similar employees who left."""
        # Get exit interviews from terminated employees in same position/department
        query = select(InterviewData, HRDataInput).join(
            HRDataInput, InterviewData.hr_code == HRDataInput.hr_code
        ).where(
            and_(
                func.lower(HRDataInput.status) == "terminated",
                HRDataInput.dataset_id == dataset_id,
                InterviewData.interview_type == "exit",
                or_(
                    HRDataInput.position.ilike(f"%{position}%"),
                    HRDataInput.structure_name.ilike(f"%{department}%")
                )
            )
        ).limit(20)

        result = await self.db.execute(query)
        interviews = result.all()

        if not interviews:
            return {"patterns": [], "common_themes": [], "total_analyzed": 0}

        # Extract common themes from notes
        theme_counts = {}
        all_notes = []
        for interview, emp in interviews:
            if interview.notes:
                all_notes.append(interview.notes.lower())

        # Simple keyword extraction for common themes
        common_keywords = [
            "compensation", "salary", "pay", "growth", "career", "promotion",
            "management", "manager", "leadership", "work-life", "balance",
            "culture", "environment", "stress", "workload", "recognition",
            "communication", "opportunity", "development", "training"
        ]

        for keyword in common_keywords:
            count = sum(1 for notes in all_notes if keyword in notes)
            if count > 0:
                theme_counts[keyword] = count

        # Sort by frequency
        common_themes = sorted(theme_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "patterns": [{"theme": t, "frequency": c} for t, c in common_themes],
            "common_themes": [t for t, c in common_themes],
            "total_analyzed": len(interviews)
        }

    async def _get_treatment_history(self, hr_code: str) -> List[Dict[str, Any]]:
        """Fetch treatment application history for this employee."""
        query = select(TreatmentApplication).where(
            TreatmentApplication.hr_code == hr_code
        ).order_by(desc(TreatmentApplication.applied_date)).limit(10)
        result = await self.db.execute(query)
        treatments = result.scalars().all()

        return [
            {
                "treatment_name": t.treatment_name,
                "treatment_type": t.treatment_type,
                "applied_date": str(t.applied_date) if t.applied_date else None,
                "cost": float(t.cost) if t.cost else 0,
                "pre_churn_probability": float(t.pre_churn_probability) if t.pre_churn_probability else 0,
                "post_churn_probability": float(t.post_churn_probability) if t.post_churn_probability else 0,
                "roi": float(t.roi) if t.roi else 0,
                "status": t.status,
                "success_indicator": t.success_indicator,
                "notes": t.notes
            }
            for t in treatments
        ]

    async def _get_rag_context(self, query: str, employee: Optional[Dict] = None) -> Dict[str, Any]:
        """Retrieve RAG context (documents + custom rules) relevant to the query."""
        try:
            # Build query with employee context if available
            search_query = query
            if employee:
                search_query = f"{query} {employee.get('position', '')} {employee.get('structure_name', '')}"

            # Retrieve from RAG service
            rag_context = await self.rag_service.retrieve_context(
                query=search_query,
                include_custom_rules=True,
                document_types=["policy", "benefit", "rule", "general"],
                top_k=5
            )

            return rag_context
        except Exception as e:
            print(f"[RAG] Error retrieving context: {e}", flush=True)
            return {"documents": [], "custom_rules": [], "sources": []}

    async def _get_behavioral_stage_details(self, stage_name: str) -> Optional[Dict[str, Any]]:
        """Get detailed behavioral stage information."""
        query = select(BehavioralStage).where(
            BehavioralStage.stage_name == stage_name,
            BehavioralStage.is_active == 1
        )
        result = await self.db.execute(query)
        stage = result.scalar_one_or_none()

        if not stage:
            return None

        return {
            "stage_name": stage.stage_name,
            "stage_description": stage.stage_description,
            "min_tenure": float(stage.min_tenure) if stage.min_tenure else 0,
            "max_tenure": float(stage.max_tenure) if stage.max_tenure else None,
            "stage_indicators": stage.stage_indicators,
            "base_risk_score": float(stage.base_risk_score) if stage.base_risk_score else 0
        }

    async def _get_company_context(self) -> Optional[Dict[str, Any]]:
        """Fetch company context from KnowledgeBaseSettings for AI personalization."""
        query = select(KnowledgeBaseSettings).limit(1)
        result = await self.db.execute(query)
        settings_record = result.scalar_one_or_none()

        if not settings_record:
            return None

        # Only return if at least one company field is set
        if not any([
            settings_record.company_name,
            settings_record.industry,
            settings_record.company_size,
            settings_record.company_description
        ]):
            return None

        return {
            "company_name": settings_record.company_name,
            "industry": settings_record.industry,
            "company_size": settings_record.company_size,
            "company_description": settings_record.company_description,
        }

    async def _get_department_analysis(self, department: str, dataset_id: str) -> Dict[str, Any]:
        """Get detailed analysis for a specific department"""
        query = select(HRDataInput, ChurnReasoning).outerjoin(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(
            and_(
                func.lower(HRDataInput.status) == "active",
                HRDataInput.structure_name.ilike(f"%{department}%"),
                HRDataInput.dataset_id == dataset_id
            )
        )

        result = await self.db.execute(query)
        employees = result.all()

        if not employees:
            return None

        total = len(employees)
        risks = [float(r.churn_risk) for e, r in employees if r and r.churn_risk]
        high_risk_employees = [
            {
                "full_name": e.full_name,
                "hr_code": e.hr_code,
                "position": e.position,
                "tenure": float(e.tenure) if e.tenure else 0,
                "churn_risk": float(r.churn_risk) if r else 0,
                "stage": r.stage if r else "Unknown",
                "reasoning": r.reasoning if r else None
            }
            for e, r in employees if r and r.churn_risk and r.churn_risk >= 0.6
        ]

        return {
            "departmentName": department,
            "totalEmployees": total,
            "highRisk": sum(1 for r in risks if r >= 0.6),
            "mediumRisk": sum(1 for r in risks if 0.3 <= r < 0.6),
            "lowRisk": sum(1 for r in risks if r < 0.3),
            "avgRisk": sum(risks) / len(risks) if risks else 0,
            "highRiskEmployees": high_risk_employees[:5],
            "avgTenure": sum(float(e.tenure) for e, r in employees if e.tenure) / total if total else 0,
            "avgCost": sum(float(e.employee_cost) for e, r in employees if e.employee_cost) / total if total else 0
        }

    async def _get_all_departments_overview(self, dataset_id: str) -> List[Dict[str, Any]]:
        """Get overview of all departments"""
        query = select(HRDataInput, ChurnReasoning).outerjoin(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(func.lower(HRDataInput.status) == "active")
        query = query.where(HRDataInput.dataset_id == dataset_id)

        result = await self.db.execute(query)
        employees = result.all()

        dept_data = {}
        for e, r in employees:
            dept = e.structure_name or "Unknown"
            if dept not in dept_data:
                dept_data[dept] = {"employees": [], "risks": []}
            dept_data[dept]["employees"].append((e, r))
            if r and r.churn_risk:
                dept_data[dept]["risks"].append(float(r.churn_risk))

        departments = []
        for dept, data in dept_data.items():
            risks = data["risks"]
            departments.append({
                "department": dept,
                "totalEmployees": len(data["employees"]),
                "highRisk": sum(1 for r in risks if r >= 0.6),
                "mediumRisk": sum(1 for r in risks if 0.3 <= r < 0.6),
                "lowRisk": sum(1 for r in risks if r < 0.3),
                "avgRisk": sum(risks) / len(risks) if risks else 0
            })

        return sorted(departments, key=lambda x: x["avgRisk"], reverse=True)

    async def _analyze_exit_patterns_enhanced(self, dataset_id: str) -> Dict[str, Any]:
        """Comprehensive exit pattern analysis"""
        # Get terminated employees with reasoning (case-insensitive)
        query = select(HRDataInput, ChurnReasoning).outerjoin(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(func.lower(HRDataInput.status) == "terminated")
        query = query.where(HRDataInput.dataset_id == dataset_id)

        result = await self.db.execute(query)
        resigned = result.all()

        total = len(resigned)
        if total == 0:
            return {"totalResignations": 0, "message": "No resignation data available"}

        # Department patterns
        dept_patterns = {}
        for e, r in resigned:
            dept = e.structure_name or "Unknown"
            if dept not in dept_patterns:
                dept_patterns[dept] = {"count": 0, "tenures": [], "early": 0, "mid": 0, "senior": 0}
            dept_patterns[dept]["count"] += 1
            tenure = float(e.tenure) if e.tenure else 0
            dept_patterns[dept]["tenures"].append(tenure)
            if tenure < 1:
                dept_patterns[dept]["early"] += 1
            elif tenure < 3:
                dept_patterns[dept]["mid"] += 1
            else:
                dept_patterns[dept]["senior"] += 1

        department_patterns = [
            {
                "department": dept,
                "resignation_count": data["count"],
                "avg_tenure": sum(data["tenures"]) / len(data["tenures"]) if data["tenures"] else 0,
                "early_exits": data["early"],
                "mid_tenure_exits": data["mid"],
                "senior_exits": data["senior"]
            }
            for dept, data in dept_patterns.items()
        ]

        # Position patterns
        pos_patterns = {}
        for e, r in resigned:
            pos = e.position or "Unknown"
            if pos not in pos_patterns:
                pos_patterns[pos] = {"count": 0, "tenures": [], "early": 0, "mid": 0, "senior": 0}
            pos_patterns[pos]["count"] += 1
            tenure = float(e.tenure) if e.tenure else 0
            pos_patterns[pos]["tenures"].append(tenure)
            if tenure < 1:
                pos_patterns[pos]["early"] += 1
            elif tenure < 3:
                pos_patterns[pos]["mid"] += 1
            else:
                pos_patterns[pos]["senior"] += 1

        position_patterns = [
            {
                "position": pos,
                "resignation_count": data["count"],
                "avg_tenure": sum(data["tenures"]) / len(data["tenures"]) if data["tenures"] else 0,
                "early_exits": data["early"],
                "mid_tenure_exits": data["mid"],
                "senior_exits": data["senior"]
            }
            for pos, data in pos_patterns.items()
        ]

        # Tenure patterns
        tenure_ranges = {"0-1 years": [], "1-3 years": [], "3-5 years": [], "5+ years": []}
        for e, r in resigned:
            tenure = float(e.tenure) if e.tenure else 0
            if tenure < 1:
                tenure_ranges["0-1 years"].append(tenure)
            elif tenure < 3:
                tenure_ranges["1-3 years"].append(tenure)
            elif tenure < 5:
                tenure_ranges["3-5 years"].append(tenure)
            else:
                tenure_ranges["5+ years"].append(tenure)

        tenure_patterns = [
            {
                "tenure_range": range_name,
                "resignation_count": len(tenures),
                "avg_tenure_in_range": sum(tenures) / len(tenures) if tenures else 0
            }
            for range_name, tenures in tenure_ranges.items()
        ]

        # Common risk factors from ML contributors
        risk_factors = {}
        for e, r in resigned:
            if r and r.ml_contributors:
                contributors = r.ml_contributors if isinstance(r.ml_contributors, list) else []
                for contrib in contributors:
                    if isinstance(contrib, dict):
                        feature = contrib.get("feature", "Unknown")
                        importance = contrib.get("importance", 0)
                        if feature not in risk_factors:
                            risk_factors[feature] = {"frequency": 0, "total_importance": 0, "examples": []}
                        risk_factors[feature]["frequency"] += 1
                        risk_factors[feature]["total_importance"] += importance
                        if len(risk_factors[feature]["examples"]) < 3:
                            risk_factors[feature]["examples"].append(e.full_name)

        common_risk_factors = [
            {
                "factor": factor,
                "frequency": data["frequency"],
                "avgImpact": data["total_importance"] / data["frequency"] if data["frequency"] else 0,
                "type": "ml_factor",
                "examples": data["examples"]
            }
            for factor, data in sorted(risk_factors.items(), key=lambda x: x[1]["frequency"], reverse=True)[:10]
        ]

        return {
            "totalResignations": total,
            "departmentPatterns": sorted(department_patterns, key=lambda x: x["resignation_count"], reverse=True),
            "positionPatterns": sorted(position_patterns, key=lambda x: x["resignation_count"], reverse=True)[:10],
            "tenurePatterns": tenure_patterns,
            "commonRiskFactors": common_risk_factors
        }

    # ===== Structured Response Generators =====

    async def _generate_enhanced_risk_diagnosis(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate EnhancedChurnRiskDiagnosisData for frontend renderer"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})

        risk_level = "High" if churn.get("resign_proba", 0) >= 0.6 else "Medium" if churn.get("resign_proba", 0) >= 0.3 else "Low"

        # Format ML contributors
        ml_contributors = []
        raw_contributors = reasoning.get("ml_contributors", [])
        if isinstance(raw_contributors, list):
            for contrib in raw_contributors:
                if isinstance(contrib, dict):
                    ml_contributors.append({
                        "feature": contrib.get("feature", "Unknown"),
                        "value": contrib.get("value"),
                        "importance": float(contrib.get("importance", 0)),
                        "impact": "negative" if float(contrib.get("importance", 0)) > 0 else "positive"
                    })

        # Format heuristic alerts
        heuristic_alerts = []
        raw_alerts = reasoning.get("heuristic_alerts", [])
        if isinstance(raw_alerts, list):
            for alert in raw_alerts:
                if isinstance(alert, dict):
                    heuristic_alerts.append({
                        "rule_name": alert.get("rule_name", "Unknown"),
                        "impact": float(alert.get("impact", 0)),
                        "reason": alert.get("reason", ""),
                        "message": alert.get("message", ""),
                        "priority": alert.get("priority", 2)
                    })

        # Generate recommendations list
        recommendations_text = reasoning.get("recommendations", "")
        recommendations = []
        if isinstance(recommendations_text, str):
            recommendations = [r.strip() for r in recommendations_text.split('\n') if r.strip()]
        elif isinstance(recommendations_text, list):
            recommendations = recommendations_text

        return {
            "type": "enhancedChurnRiskDiagnosis",
            "targetEmployeeName": emp["full_name"],
            "targetHrCode": emp["hr_code"],
            "overallRisk": churn.get("resign_proba", reasoning.get("churn_risk", 0)),
            "mlScore": reasoning.get("ml_score", 0),
            "heuristicScore": reasoning.get("heuristic_score", 0),
            "stageScore": reasoning.get("stage_score", 0),
            "stage": reasoning.get("stage", "Unknown"),
            "confidenceLevel": reasoning.get("confidence_level", 0.7),
            "mlContributors": ml_contributors[:5],
            "heuristicAlerts": heuristic_alerts,
            "calculationBreakdown": reasoning.get("calculation_breakdown"),
            "reasoning": reasoning.get("reasoning", f"Employee shows {risk_level.lower()} churn risk based on analysis."),
            "recommendations": recommendations[:5] if recommendations else ["Monitor employee engagement", "Schedule 1-on-1 meeting"],
            "explanation": f"Analysis complete for {emp['full_name']}",
            "personalProfile": {
                "department": emp.get("structure_name", ""),
                "position": emp.get("position", ""),
                "tenure": emp.get("tenure"),
                "employeeCost": emp.get("employee_cost"),
                "reportDate": emp.get("report_date")
            },
            "keyFindings": [
                f"Risk Level: {risk_level}",
                f"Behavioral Stage: {reasoning.get('stage', 'Unknown')}",
                f"ML Confidence: {reasoning.get('confidence_level', 0.7):.0%}"
            ],
            "comparativeInsights": {},
            "urgencyLevel": "critical" if risk_level == "High" else "moderate" if risk_level == "Medium" else "low"
        }

    async def _generate_enhanced_retention_playbook(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate EnhancedRetentionPlaybookData for frontend renderer"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})
        treatments = context.get("treatments", [])

        risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
        risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

        # Generate action plan from treatments
        action_plan = []
        for i, t in enumerate(treatments[:6], 1):
            effect = t.get("base_effect_size", 0.1)
            cost = t.get("base_cost", 0)
            time_frame = t.get("time_to_effect", "3 months")

            category = "immediate" if i <= 2 else "short_term" if i <= 4 else "long_term"
            priority = "critical" if risk >= 0.6 and i <= 2 else "high" if i <= 3 else "medium"

            action_plan.append({
                "step": i,
                "category": category,
                "action": t.get("name", "Treatment"),
                "rationale": t.get("description", "Targeted intervention"),
                "expectedImpact": f"{effect:.0%} risk reduction",
                "timeframe": time_frame,
                "priority": priority,
                "owner": "HR Manager",
                "cost": f"${cost:,.0f}",
                "riskReduction": effect * risk
            })

        # Calculate budget
        total_cost = sum(t.get("base_cost", 0) for t in treatments[:3])
        replacement_cost = emp.get("employee_cost", 50000) * 1.5

        return {
            "type": "enhancedRetentionPlaybook",
            "targetEmployeeName": emp["full_name"],
            "targetHrCode": emp["hr_code"],
            "currentRisk": risk,
            "stage": reasoning.get("stage", "Unknown"),
            "riskLevel": risk_level,
            "personalProfile": {
                "department": emp.get("structure_name", ""),
                "position": emp.get("position", ""),
                "tenure": emp.get("tenure", 0),
                "employeeCost": emp.get("employee_cost", 50000),
                "reportDate": emp.get("report_date", "")
            },
            "primaryRiskFactors": [c.get("feature", "") for c in reasoning.get("ml_contributors", [])[:3] if isinstance(c, dict)],
            "actionPlan": action_plan,
            "timelineOverview": {
                "immediate": {
                    "timeframe": "0-2 weeks",
                    "actionCount": len([a for a in action_plan if a["category"] == "immediate"]),
                    "focus": "Quick wins and urgent interventions",
                    "expectedRiskReduction": 0.1
                },
                "shortTerm": {
                    "timeframe": "2-8 weeks",
                    "actionCount": len([a for a in action_plan if a["category"] == "short_term"]),
                    "focus": "Structured development and support",
                    "expectedRiskReduction": 0.15
                },
                "longTerm": {
                    "timeframe": "2-6 months",
                    "actionCount": len([a for a in action_plan if a["category"] == "long_term"]),
                    "focus": "Career growth and engagement",
                    "expectedRiskReduction": 0.1
                }
            },
            "successExamples": [],
            "monitoringMetrics": [
                "Weekly engagement check-ins",
                "Monthly performance reviews",
                "Quarterly satisfaction surveys"
            ],
            "successIndicators": [
                "Increased engagement scores",
                "Reduced absenteeism",
                "Positive feedback in 1-on-1s"
            ],
            "budgetConsiderations": {
                "estimatedRetentionCost": total_cost,
                "replacementCost": replacement_cost,
                "netSavings": replacement_cost - total_cost,
                "roi": f"{(replacement_cost - total_cost) / max(total_cost, 1):.1f}x",
                "breakdown": {
                    "immediate": sum(t.get("base_cost", 0) for t in treatments[:2]),
                    "shortTerm": sum(t.get("base_cost", 0) for t in treatments[2:4]),
                    "longTerm": sum(t.get("base_cost", 0) for t in treatments[4:6])
                }
            },
            "riskMitigation": [],
            "summary": f"Retention plan for {emp['full_name']} with {len(action_plan)} recommended actions.",
            "expectedOutcomes": {
                "currentRisk": f"{risk:.0%}",
                "projectedRisk": f"{max(0, risk - 0.35):.0%}",
                "riskReduction": "Up to 35%",
                "timeline": "6 months",
                "confidenceLevel": "Medium-High"
            }
        }

    async def _generate_enhanced_similarity_analysis(
        self,
        context: Dict[str, Any],
        comparison_type: str = "resigned"
    ) -> Dict[str, Any]:
        """Generate EnhancedSimilarityAnalysisData for frontend renderer"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        reasoning = context.get("reasoning", {})
        similar = context.get("similar_employees", [])

        # Format similar employees
        similar_employees = []
        for s in similar:
            similar_employees.append({
                "name": s.get("full_name", ""),
                "hrCode": s.get("hr_code", ""),
                "department": s.get("department", ""),
                "position": s.get("position", ""),
                "tenure": s.get("tenure", 0),
                "risk": s.get("churn_risk", 0),
                "stage": s.get("stage", "Unknown"),
                "similarityScore": 0.8,  # Simplified
                "commonPatterns": ["Same position", "Similar tenure"],
                "mlScore": s.get("ml_score", 0),
                "heuristicScore": s.get("heuristic_score", 0),
                "reasoning": s.get("reasoning", "")
            })

        # Calculate pattern distributions
        dept_dist = {}
        pos_dist = {}
        tenure_dist = {"low": 0, "medium": 0, "high": 0}
        risk_dist = {"low": 0, "medium": 0, "high": 0}

        for s in similar:
            dept = s.get("department", "Unknown")
            dept_dist[dept] = dept_dist.get(dept, 0) + 1

            pos = s.get("position", "Unknown")
            pos_dist[pos] = pos_dist.get(pos, 0) + 1

            tenure = s.get("tenure", 0)
            if tenure < 1:
                tenure_dist["low"] += 1
            elif tenure < 3:
                tenure_dist["medium"] += 1
            else:
                tenure_dist["high"] += 1

            risk = s.get("churn_risk", 0)
            if risk < 0.4:
                risk_dist["low"] += 1
            elif risk < 0.7:
                risk_dist["medium"] += 1
            else:
                risk_dist["high"] += 1

        return {
            "type": "enhancedSimilarityAnalysis",
            "targetEmployee": {
                "name": emp["full_name"],
                "hrCode": emp["hr_code"],
                "department": emp.get("structure_name", ""),
                "position": emp.get("position", ""),
                "tenure": emp.get("tenure", 0),
                "risk": reasoning.get("churn_risk", 0),
                "stage": reasoning.get("stage", "Unknown"),
                "mlScore": reasoning.get("ml_score", 0),
                "heuristicScore": reasoning.get("heuristic_score", 0),
                "confidenceLevel": reasoning.get("confidence_level", 0.7)
            },
            "comparisonType": comparison_type,
            "similarEmployees": similar_employees,
            "patterns": {
                "departmentDistribution": dept_dist,
                "positionDistribution": pos_dist,
                "tenureDistribution": tenure_dist,
                "riskDistribution": risk_dist,
                "stageDistribution": {},
                "totalSimilar": len(similar),
                "averageSimilarity": 0.8
            },
            "insights": {
                "commonFactors": ["Position alignment", "Department similarity"],
                "differentiatingFactors": ["Tenure differences", "Performance variations"],
                "riskPatterns": [f"Similar {comparison_type} employees show common risk patterns"],
                "recommendations": ["Monitor engagement levels", "Review career development"],
                "keyFindings": [f"Found {len(similar)} similar {comparison_type} employees"],
                "summary": f"Comparison with {len(similar)} {comparison_type} employees in similar roles."
            },
            "analysis": f"Employee comparison analysis for {emp['full_name']}",
            "confidence": "High" if len(similar) >= 3 else "Medium",
            "summary": f"Analyzed {len(similar)} similar {comparison_type} employees."
        }

    async def _generate_exit_pattern_mining(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate EnhancedExitPatternMiningData for frontend renderer"""
        exit_data = context.get("exit_data", {})

        if exit_data.get("totalResignations", 0) == 0:
            return {
                "type": "exit_pattern_mining",
                "error": "no_data",
                "message": "No resignation data available for analysis.",
                "summary": "Unable to analyze exit patterns."
            }

        # Find key insights
        dept_patterns = exit_data.get("departmentPatterns", [])
        tenure_patterns = exit_data.get("tenurePatterns", [])
        risk_factors = exit_data.get("commonRiskFactors", [])

        most_affected_dept = dept_patterns[0]["department"] if dept_patterns else "Unknown"
        most_common_tenure = max(tenure_patterns, key=lambda x: x["resignation_count"])["tenure_range"] if tenure_patterns else "Unknown"
        top_risk_factor = risk_factors[0]["factor"] if risk_factors else "Unknown"

        return {
            "type": "exit_pattern_mining",
            "exitData": {
                "totalResignations": exit_data.get("totalResignations", 0),
                "departmentPatterns": dept_patterns[:5],
                "positionPatterns": exit_data.get("positionPatterns", [])[:5],
                "tenurePatterns": tenure_patterns,
                "commonRiskFactors": risk_factors[:5],
                "seasonalPatterns": [],
                "riskFactorData": []
            },
            "insights": {
                "detailedAnalysis": f"Analysis of {exit_data.get('totalResignations', 0)} resignations reveals key patterns.",
                "keyPatterns": [
                    f"Most exits from: {most_affected_dept}",
                    f"Most common exit tenure: {most_common_tenure}",
                    f"Top risk factor: {top_risk_factor}"
                ],
                "riskIndicators": [f["factor"] for f in risk_factors[:3]],
                "preventiveStrategies": [
                    "Implement early warning systems",
                    "Focus retention on high-risk departments",
                    "Address common risk factors proactively"
                ],
                "departmentInsights": [f"{d['department']}: {d['resignation_count']} exits" for d in dept_patterns[:3]],
                "patternSummary": {
                    "mostAffectedDepartment": most_affected_dept,
                    "mostCommonTenureExit": most_common_tenure,
                    "topRiskFactor": top_risk_factor,
                    "totalPatterns": len(dept_patterns) + len(tenure_patterns)
                },
                "urgencyLevel": "high" if exit_data.get("totalResignations", 0) > 20 else "moderate",
                "trends": {
                    "departmentTrend": "Stable",
                    "tenureTrend": "Early exits prevalent",
                    "riskFactorTrend": "Consistent"
                }
            },
            "summary": f"Analyzed {exit_data.get('totalResignations', 0)} resignations across {len(dept_patterns)} departments."
        }

    async def _generate_workforce_trends(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate WorkforceTrendsAnalysisData for frontend renderer"""
        stats = context.get("workforce_stats", {})

        return {
            "type": "churn_trends_analysis",
            "statistics": {
                "totalEmployees": stats.get("totalEmployees", 0),
                "highRisk": stats.get("highRisk", 0),
                "mediumRisk": stats.get("mediumRisk", 0),
                "lowRisk": stats.get("lowRisk", 0),
                "departmentRisks": stats.get("departmentRisks", []),
                "positionRisks": [],
                "stageDistribution": stats.get("stageDistribution", []),
                "confidenceDistribution": {"high": 0, "medium": 0, "low": 0},
                "riskTrends": stats.get("riskTrends", {})
            },
            "insights": {
                "detailedAnalysis": f"Workforce analysis of {stats.get('totalEmployees', 0)} employees.",
                "strategicRecommendations": [
                    "Focus retention efforts on high-risk departments",
                    "Implement targeted interventions",
                    "Monitor early-stage risk indicators"
                ],
                "urgentActions": [
                    f"Address {stats.get('highRisk', 0)} high-risk employees immediately"
                ] if stats.get("highRisk", 0) > 0 else [],
                "trendAnalysis": {
                    "riskTrend": "Stable",
                    "departmentTrends": [],
                    "stageTrends": [],
                    "confidenceTrends": "High confidence in predictions"
                },
                "organizationalHealth": {
                    "overallScore": 100 - (stats.get("highRisk", 0) / max(stats.get("totalEmployees", 1), 1) * 100),
                    "riskLevel": "High" if stats.get("highRisk", 0) > stats.get("totalEmployees", 0) * 0.2 else "Moderate",
                    "confidenceLevel": "High",
                    "priorityAreas": [d["department"] for d in stats.get("departmentRisks", [])[:3]]
                }
            },
            "analysis": f"Comprehensive workforce analysis covering {stats.get('totalEmployees', 0)} employees.",
            "summary": f"{stats.get('highRisk', 0)} high-risk, {stats.get('mediumRisk', 0)} medium-risk employees identified."
        }

    async def _generate_department_analysis(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate DepartmentAnalysisData for frontend renderer"""
        dept_data = context.get("department_data")
        departments = context.get("departments", [])

        if dept_data:
            # Specific department analysis
            return {
                "type": "department_analysis",
                "analysisType": "specific",
                "targetDepartment": dept_data.get("departmentName", ""),
                "departmentData": dept_data,
                "insights": {
                    "detailedAnalysis": f"Analysis of {dept_data.get('departmentName', 'department')}",
                    "strategicRecommendations": [
                        "Review workload distribution",
                        "Implement team engagement initiatives"
                    ],
                    "urgentActions": [
                        f"Address {dept_data.get('highRisk', 0)} high-risk employees"
                    ] if dept_data.get("highRisk", 0) > 0 else [],
                    "retentionStrategies": ["Career development programs", "Regular feedback sessions"],
                    "healthScore": 100 - (dept_data.get("avgRisk", 0) * 100),
                    "riskLevel": "High" if dept_data.get("avgRisk", 0) >= 0.5 else "Moderate",
                    "priorityActions": ["Monitor high-risk employees", "Schedule team reviews"]
                },
                "summary": f"Department has {dept_data.get('totalEmployees', 0)} employees with {dept_data.get('avgRisk', 0):.0%} average risk."
            }
        else:
            # Overview of all departments
            return {
                "type": "department_analysis",
                "analysisType": "overview",
                "departments": departments,
                "insights": {
                    "summary": f"Overview of {len(departments)} departments",
                    "highestRisk": departments[0] if departments else None,
                    "departmentRanking": departments[:5],
                    "organizationalInsights": [
                        f"Highest risk department: {departments[0]['department']}" if departments else "No data"
                    ]
                },
                "summary": f"Analyzed {len(departments)} departments across the organization.",
                "availableDepartments": [d["department"] for d in departments]
            }

    async def _generate_email_action(self, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate email action data for EmailComposer component"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})
        email_context = context.get("email_context", "")

        risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
        risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

        # Generate appropriate email subject and body based on context
        if email_context and "meeting" in email_context.lower():
            subject = f"Meeting Request - Let's Connect"
            body = f"""Hi {emp['full_name'].split()[0]},

I hope this message finds you well. I'd like to schedule some time to catch up and discuss how things are going.

Would you be available for a brief meeting this week? Please let me know what works best for your schedule.

Looking forward to connecting,
[Your Name]"""
        elif email_context and any(word in email_context.lower() for word in ["check", "follow"]):
            subject = f"Quick Check-in"
            body = f"""Hi {emp['full_name'].split()[0]},

I wanted to reach out and see how things are going for you. It's been a while since we connected, and I'd love to hear how your projects are progressing.

Is there anything you need support with, or any topics you'd like to discuss?

Best,
[Your Name]"""
        else:
            # Default professional check-in
            subject = f"Let's Connect"
            body = f"""Hi {emp['full_name'].split()[0]},

I wanted to reach out and schedule some time to connect. I'd love to hear about how things are going with your work and discuss any support you might need.

Please let me know your availability this week.

Best regards,
[Your Name]"""

        return {
            "type": "email_action",
            "targetEmployeeName": emp["full_name"],
            "targetHrCode": emp["hr_code"],
            "emailData": {
                "to": [emp["full_name"]],
                "cc": [],
                "subject": subject,
                "body": body
            },
            "employeeContext": {
                "position": emp.get("position"),
                "department": emp.get("structure_name"),
                "tenure": emp.get("tenure"),
                "riskLevel": risk_level,
                "riskScore": risk
            },
            "suggestedContext": email_context
        }

    async def _generate_meeting_action(self, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate meeting action data for meeting composer"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})
        meeting_context = context.get("meeting_context", "")

        risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
        risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

        # Generate appropriate meeting details
        title = f"1:1 with {emp['full_name']}"
        agenda = """• Check-in on current projects and workload
• Discuss any challenges or concerns
• Career development and goals
• Open discussion"""

        if meeting_context:
            title = f"Meeting: {meeting_context.title()}"

        return {
            "type": "meeting_action",
            "targetEmployeeName": emp["full_name"],
            "targetHrCode": emp["hr_code"],
            "meetingData": {
                "title": title,
                "attendees": [emp["full_name"], "You"],
                "duration": 30,
                "agenda": agenda
            },
            "employeeContext": {
                "position": emp.get("position"),
                "department": emp.get("structure_name"),
                "tenure": emp.get("tenure"),
                "riskLevel": risk_level,
                "riskScore": risk
            },
            "suggestedContext": meeting_context
        }

    async def _generate_employee_info(self, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate employee info summary"""
        if "employee" not in context:
            return None

        emp = context["employee"]
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})

        risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
        risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

        # Format ML contributors
        ml_contributors = []
        raw_contributors = reasoning.get("ml_contributors", [])
        if isinstance(raw_contributors, list):
            for contrib in raw_contributors[:3]:
                if isinstance(contrib, dict):
                    ml_contributors.append(contrib.get("feature", "Unknown"))

        return {
            "type": "employee_info",
            "targetEmployeeName": emp["full_name"],
            "targetHrCode": emp["hr_code"],
            "profile": {
                "fullName": emp["full_name"],
                "hrCode": emp["hr_code"],
                "position": emp.get("position"),
                "department": emp.get("structure_name"),
                "tenure": emp.get("tenure"),
                "status": emp.get("status"),
                "employeeCost": emp.get("employee_cost")
            },
            "riskAssessment": {
                "overallRisk": risk,
                "riskLevel": risk_level,
                "stage": reasoning.get("stage", "Unknown"),
                "mlScore": reasoning.get("ml_score", 0),
                "heuristicScore": reasoning.get("heuristic_score", 0),
                "confidenceLevel": reasoning.get("confidence_level", 0.7),
                "topRiskFactors": ml_contributors
            },
            "summary": f"{emp['full_name']} is a {emp.get('position', 'employee')} in {emp.get('structure_name', 'the organization')} with {emp.get('tenure', 0):.1f} years of tenure. Current churn risk: {risk_level} ({risk:.0%})."
        }

    # ===== Main Chat Method =====

    async def generate_response(
        self,
        pattern_type: str,
        context: Dict[str, Any],
        original_message: str
    ) -> Dict[str, Any]:
        """Generate response with both text and structured data"""

        structured_data = None
        text_response = ""

        if pattern_type == PatternType.CHURN_RISK_DIAGNOSIS:
            structured_data = await self._generate_enhanced_risk_diagnosis(context)
            if structured_data:
                text_response = f"Risk analysis for {structured_data.get('targetEmployeeName', 'employee')} - {structured_data.get('urgencyLevel', 'moderate')} urgency."
            else:
                text_response = "Unable to find employee data. Please provide a valid employee name or HR code."

        elif pattern_type == PatternType.RETENTION_PLAN:
            structured_data = await self._generate_enhanced_retention_playbook(context)
            if structured_data:
                text_response = f"Retention plan generated for {structured_data.get('targetEmployeeName', 'employee')}."
            else:
                text_response = "Unable to generate retention plan. Please provide a valid employee."

        elif pattern_type == PatternType.EMPLOYEE_COMPARISON:
            structured_data = await self._generate_enhanced_similarity_analysis(context, "resigned")
            if structured_data:
                text_response = f"Comparison analysis with {len(structured_data.get('similarEmployees', []))} resigned employees."
            else:
                text_response = "Unable to find comparison data."

        elif pattern_type == PatternType.EMPLOYEE_COMPARISON_STAYED:
            structured_data = await self._generate_enhanced_similarity_analysis(context, "stayed")
            if structured_data:
                text_response = f"Comparison analysis with {len(structured_data.get('similarEmployees', []))} retained employees."
            else:
                text_response = "Unable to find comparison data."

        elif pattern_type == PatternType.EXIT_PATTERN_MINING:
            structured_data = await self._generate_exit_pattern_mining(context)
            text_response = structured_data.get("summary", "Exit pattern analysis complete.")

        elif pattern_type == PatternType.WORKFORCE_TRENDS:
            structured_data = await self._generate_workforce_trends(context)
            text_response = structured_data.get("summary", "Workforce trends analysis complete.")

        elif pattern_type == PatternType.DEPARTMENT_ANALYSIS:
            structured_data = await self._generate_department_analysis(context)
            text_response = structured_data.get("summary", "Department analysis complete.")

        elif pattern_type == PatternType.SHAP_EXPLANATION:
            # SHAP uses the risk diagnosis structure
            structured_data = await self._generate_enhanced_risk_diagnosis(context)
            if structured_data:
                text_response = f"Risk factors analyzed for {structured_data.get('targetEmployeeName', 'employee')}."
            else:
                text_response = "Unable to find SHAP values for this employee."

        elif pattern_type == PatternType.EMAIL_ACTION:
            # Generate email action data for EmailComposer
            structured_data = await self._generate_email_action(context)
            if structured_data:
                text_response = f"I've prepared an email draft for {structured_data.get('targetEmployeeName', 'the employee')}. You can review and customize it before sending."
            else:
                text_response = "I couldn't generate an email. Please select an employee first."

        elif pattern_type == PatternType.MEETING_ACTION:
            # Generate meeting action data
            structured_data = await self._generate_meeting_action(context)
            if structured_data:
                text_response = f"I've prepared a meeting request for {structured_data.get('targetEmployeeName', 'the employee')}. You can review and schedule it."
            else:
                text_response = "I couldn't generate a meeting request. Please select an employee first."

        elif pattern_type == PatternType.EMPLOYEE_INFO:
            # Generate employee info response
            structured_data = await self._generate_employee_info(context)
            if structured_data:
                text_response = f"Here's what I know about {structured_data.get('targetEmployeeName', 'this employee')}."
            else:
                text_response = "I couldn't find information about this employee."

        else:
            # General chat - use LLM
            text_response = await self._generate_general_response(original_message, context)

        return {
            "response": text_response,
            "pattern_detected": pattern_type,
            "structured_data": structured_data
        }

    async def _generate_general_response(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> str:
        """Generate general response using LLM with COMPREHENSIVE context from ALL sources."""
        print(f"[GENERAL_RESPONSE] === Generating general LLM response with FULL context ===", flush=True)

        # Extract all context sources
        employee = context.get("employee")
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})
        additional_data = context.get("additional_data", {})
        company_overview = context.get("company_overview", {})
        company_context_data = context.get("company_context")

        # NEW: Additional context sources
        eltv_data = context.get("eltv", {})
        manager_team = context.get("manager_team", {})
        department_snapshot = context.get("department_snapshot", {})
        stage_details = context.get("stage_details", {})
        treatment_history = context.get("treatment_history", [])
        interviews = context.get("interviews", [])
        exit_interview_patterns = context.get("exit_interview_patterns", {})
        rag_context = context.get("rag_context", {})
        available_treatments = context.get("available_treatments", [])

        print(f"[GENERAL_RESPONSE] Employee: {employee is not None}, ELTV: {bool(eltv_data)}, RAG: {bool(rag_context.get('documents') or rag_context.get('custom_rules'))}", flush=True)

        # ===== BUILD COMPREHENSIVE EMPLOYEE CONTEXT =====
        employee_context = ""
        if employee:
            risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
            risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

            # Basic employee info
            employee_context = f"""
=== SELECTED EMPLOYEE ===
Name: {employee.get('full_name', 'Unknown')}
HR Code: {employee.get('hr_code', 'N/A')}
Position: {employee.get('position', 'N/A')}
Department: {employee.get('structure_name', 'N/A')}
Tenure: {employee.get('tenure', 0):.1f} years
Status: {employee.get('status', 'Active')}
Employee Cost: ${employee.get('employee_cost', 50000):,.0f}/year

=== CHURN RISK ASSESSMENT ===
Overall Risk: {risk:.1%} ({risk_level})
Behavioral Stage: {reasoning.get('stage', 'Unknown')}
ML Score: {reasoning.get('ml_score', 0):.2f}
Heuristic Score: {reasoning.get('heuristic_score', 0):.2f}
Confidence Level: {reasoning.get('confidence_level', 0.7):.0%}"""

            # Add uncertainty range if available
            if churn.get('uncertainty_range'):
                employee_context += f"\nUncertainty Range: {churn['uncertainty_range']}"

            # Add ML risk factors
            ml_contributors = reasoning.get('ml_contributors', [])
            if ml_contributors and isinstance(ml_contributors, list):
                employee_context += "\n\n=== TOP RISK FACTORS (ML Model) ===\n"
                for contrib in ml_contributors[:5]:
                    if isinstance(contrib, dict):
                        feature = contrib.get('feature', 'Unknown')
                        importance = contrib.get('importance', 0)
                        value = contrib.get('value', 'N/A')
                        employee_context += f"• {feature}: {value} (impact: {importance:.2f})\n"

            # Add heuristic alerts
            heuristic_alerts = reasoning.get('heuristic_alerts', [])
            if heuristic_alerts and isinstance(heuristic_alerts, list):
                employee_context += "\n=== BEHAVIORAL ALERTS ===\n"
                for alert in heuristic_alerts[:5]:
                    if isinstance(alert, dict):
                        msg = alert.get('message', alert.get('rule_name', 'Alert'))
                        employee_context += f"⚠ {msg}\n"

            # Add counterfactuals (What-If Analysis)
            counterfactuals = churn.get('counterfactuals', [])
            if counterfactuals and isinstance(counterfactuals, list):
                employee_context += "\n=== WHAT-IF ANALYSIS (Counterfactuals) ===\n"
                for cf in counterfactuals[:3]:
                    if isinstance(cf, dict):
                        change = cf.get('change', cf.get('description', 'Change'))
                        new_risk = cf.get('new_risk', cf.get('projected_risk', 'N/A'))
                        employee_context += f"• If {change} → Risk would be {new_risk}\n"
                    elif isinstance(cf, str):
                        employee_context += f"• {cf}\n"

            # Add behavioral stage details
            if stage_details:
                employee_context += f"\n=== BEHAVIORAL STAGE DETAILS ===\n"
                employee_context += f"Stage: {stage_details.get('stage_name', 'Unknown')}\n"
                if stage_details.get('stage_description'):
                    employee_context += f"Description: {stage_details['stage_description']}\n"
                if stage_details.get('stage_indicators'):
                    employee_context += f"Key Indicators: {stage_details['stage_indicators']}\n"

            # Add ELTV Business Impact
            if eltv_data:
                employee_context += f"\n=== BUSINESS IMPACT (ELTV) ===\n"
                employee_context += f"Employee Lifetime Value: ${eltv_data.get('eltv_pre_treatment', 0):,.0f}\n"
                employee_context += f"Value After Treatment: ${eltv_data.get('eltv_post_treatment', 0):,.0f}\n"
                treatment_effect = eltv_data.get('treatment_effect', 0)
                if treatment_effect:
                    employee_context += f"Potential Value Recovery: ${treatment_effect:,.0f}\n"
                # Calculate replacement cost estimate
                replacement_cost = employee.get('employee_cost', 50000) * 1.5
                employee_context += f"Estimated Replacement Cost: ${replacement_cost:,.0f}\n"

            # Add Team Context (Manager's perspective)
            if manager_team:
                employee_context += f"\n=== MANAGER'S TEAM CONTEXT ===\n"
                employee_context += f"Team Size: {manager_team.get('team_size', 'N/A')} direct reports\n"
                employee_context += f"Team Avg Tenure: {manager_team.get('avg_tenure', 0):.1f} years\n"
                employee_context += f"Team Avg Risk: {manager_team.get('avg_risk', 0):.1%}\n"
                employee_context += f"High-Risk Team Members: {manager_team.get('high_risk_count', 0)}\n"

            # Add Department Comparative Context
            if department_snapshot:
                dept_avg_risk = department_snapshot.get('avg_risk', 0)
                company_avg = company_overview.get('avg_risk', 0) if company_overview else 0
                relative = "above" if risk > dept_avg_risk else "below"
                employee_context += f"\n=== DEPARTMENT COMPARISON ===\n"
                employee_context += f"Department: {employee.get('structure_name', 'N/A')}\n"
                employee_context += f"Dept Headcount: {department_snapshot.get('headcount', 'N/A')}\n"
                employee_context += f"Dept Avg Risk: {dept_avg_risk:.1%}\n"
                employee_context += f"Company Avg Risk: {company_avg:.1%}\n"
                employee_context += f"Employee is {relative} department average risk\n"
                if dept_avg_risk > company_avg * 1.2:
                    employee_context += f"⚠ Department risk is {((dept_avg_risk/company_avg)-1)*100:.0f}% above company average\n"

            # Add Treatment History
            if treatment_history:
                employee_context += f"\n=== TREATMENT HISTORY ===\n"
                for t in treatment_history[:3]:
                    status_icon = "✓" if t.get('success_indicator') == 'successful' else "○" if t.get('success_indicator') == 'pending' else "✗"
                    employee_context += f"{status_icon} {t.get('treatment_name', 'Treatment')} ({t.get('applied_date', 'N/A')[:10] if t.get('applied_date') else 'N/A'})\n"
                    employee_context += f"   Status: {t.get('success_indicator', 'unknown')}, ROI: {t.get('roi', 0):.1f}x\n"

            # Add Interview Insights for this employee
            if interviews:
                employee_context += f"\n=== EMPLOYEE INTERVIEWS ===\n"
                for interview in interviews[:2]:
                    employee_context += f"• {interview.get('interview_type', 'interview').title()} Interview ({interview.get('interview_date', 'N/A')})\n"
                    if interview.get('sentiment_score'):
                        employee_context += f"  Sentiment: {interview['sentiment_score']:.2f}\n"
                    if interview.get('notes'):
                        employee_context += f"  Notes: {interview['notes'][:200]}...\n"

            # Add Exit Interview Patterns from Similar Employees
            if exit_interview_patterns and exit_interview_patterns.get('common_themes'):
                employee_context += f"\n=== EXIT PATTERNS FROM SIMILAR EMPLOYEES ===\n"
                employee_context += f"Analyzed: {exit_interview_patterns.get('total_analyzed', 0)} exit interviews\n"
                employee_context += "Common reasons for leaving:\n"
                for theme in exit_interview_patterns.get('common_themes', [])[:5]:
                    employee_context += f"• {theme}\n"

            # Add additional employee data if available
            if additional_data:
                employee_context += "\n=== EMPLOYEE DETAILS ===\n"
                detail_fields = [
                    ('age', 'Age'),
                    ('education', 'Education'),
                    ('performance_rating', 'Performance Rating', '/5'),
                    ('job_satisfaction', 'Job Satisfaction', '/4'),
                    ('work_life_balance', 'Work-Life Balance', '/4'),
                    ('environment_satisfaction', 'Environment Satisfaction', '/4'),
                    ('relationship_satisfaction', 'Relationship Satisfaction', '/4'),
                    ('years_since_last_promotion', 'Years Since Last Promotion'),
                    ('years_in_current_role', 'Years in Current Role'),
                    ('training_times_last_year', 'Training Sessions (Last Year)'),
                    ('over_time', 'Works Overtime'),
                    ('business_travel', 'Business Travel'),
                    ('average_monthly_hours', 'Avg Monthly Hours'),
                    ('number_project', 'Number of Projects')
                ]
                for field_info in detail_fields:
                    key = field_info[0]
                    label = field_info[1]
                    suffix = field_info[2] if len(field_info) > 2 else ''
                    if additional_data.get(key):
                        employee_context += f"{label}: {additional_data[key]}{suffix}\n"

            # Add AI Recommendations
            recommendations = reasoning.get('recommendations', [])
            if recommendations:
                employee_context += "\n=== AI RECOMMENDATIONS ===\n"
                if isinstance(recommendations, list):
                    for rec in recommendations[:3]:
                        rec_text = rec.get('recommendation', str(rec)) if isinstance(rec, dict) else str(rec)
                        employee_context += f"→ {rec_text}\n"
                elif isinstance(recommendations, str):
                    for line in recommendations.split('\n')[:3]:
                        if line.strip():
                            employee_context += f"→ {line.strip()}\n"

        # ===== BUILD COMPANY CONTEXT =====
        company_context = ""
        if company_overview:
            company_context = f"""
=== COMPANY OVERVIEW ===
Total Employees: {company_overview.get('total_employees', 'N/A')}
Active Employees: {company_overview.get('active_employees', 'N/A')}
High Risk Count: {company_overview.get('high_risk_count', 'N/A')}
Average Risk: {company_overview.get('avg_risk', 0):.1%}
Average Tenure: {company_overview.get('avg_tenure', 0):.1f} years
"""

        # Add company profile context from Knowledge Base settings
        company_profile_context = ""
        if company_context_data:
            parts = []
            if company_context_data.get("company_name"):
                parts.append(f"Company: {company_context_data['company_name']}")
            if company_context_data.get("industry"):
                parts.append(f"Industry: {company_context_data['industry']}")
            if company_context_data.get("company_size"):
                parts.append(f"Size: {company_context_data['company_size']}")
            if parts:
                company_profile_context = f"\n=== COMPANY PROFILE ===\n" + " | ".join(parts)
            if company_context_data.get("company_description"):
                company_profile_context += f"\nContext: {company_context_data['company_description']}"

        # ===== BUILD RAG CONTEXT (Documents + Rules) =====
        rag_formatted = ""
        if rag_context:
            docs = rag_context.get('documents', [])
            rules = rag_context.get('custom_rules', [])

            if docs:
                rag_formatted += "\n=== COMPANY POLICIES & DOCUMENTS ===\n"
                for i, doc in enumerate(docs[:3], 1):
                    rag_formatted += f"[{i}] {doc.get('source', 'Policy')} (Relevance: {doc.get('similarity', 0):.0%})\n"
                    content = doc.get('content', '')[:300]
                    rag_formatted += f"   {content}...\n\n"

            if rules:
                rag_formatted += "\n=== COMPANY HR RULES (Must Comply) ===\n"
                for rule in rules[:5]:
                    priority = rule.get('priority', 5)
                    category = rule.get('category', 'general').upper()
                    rag_formatted += f"[{category}] Priority {priority}: {rule.get('name', 'Rule')}\n"
                    rag_formatted += f"   {rule.get('rule_text', '')[:200]}\n"

        # ===== BUILD AVAILABLE TREATMENTS CONTEXT =====
        treatments_context = ""
        if available_treatments:
            treatments_context = "\n=== AVAILABLE RETENTION TREATMENTS ===\n"
            for t in available_treatments[:5]:
                treatments_context += f"• {t.get('name', 'Treatment')}: ${t.get('base_cost', 0):,.0f}, {t.get('time_to_effect', '3 months')}\n"
                if t.get('targeted_variables'):
                    treatments_context += f"  Targets: {', '.join(str(v) for v in t['targeted_variables'][:3])}\n"

        # ===== BUILD ENHANCED SYSTEM PROMPT =====
        system_prompt = """You are ChurnVision AI - an expert HR analytics advisor with access to comprehensive employee data, company policies, and business intelligence.

Your capabilities:
- Analyze employee churn risk with data-driven insights
- Explain the "why" behind risk factors using ML model outputs and behavioral analysis
- Provide actionable, personalized recommendations based on company policies
- Calculate business impact (ELTV, replacement costs, ROI)
- Reference historical treatments and their effectiveness
- Cite relevant company policies and rules

Guidelines:
- Be thorough (2-3 paragraphs minimum)
- Always reference specific data points from the context provided
- If company policies/rules are provided, ensure recommendations comply with them
- Quantify business impact where possible (dollars, percentages)
- Consider the employee's treatment history when making recommendations
- Compare employee metrics to team/department averages for context
- Never ask for clarification - use all provided data

Remember: You have access to comprehensive context including ML risk factors, behavioral analysis, ELTV calculations, interview insights, company policies, and treatment history."""

        # ===== ASSEMBLE USER MESSAGE =====
        if employee:
            user_message_with_context = f"""{company_profile_context}
{company_context}

{employee_context}

{rag_formatted}

{treatments_context}

User Question: {message}

Provide a comprehensive response (2-3 paragraphs) that:
1. Directly addresses the question using the data provided
2. References specific metrics, risk factors, and insights
3. Considers company policies and rules if relevant
4. Includes actionable recommendations with business justification"""
        else:
            user_message_with_context = f"""{company_profile_context}
{company_context}
{rag_formatted}

User question: {message}

Provide a helpful response using the company and workforce data available."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message_with_context}
        ]

        # Determine model based on DEFAULT_LLM_PROVIDER
        provider = settings.DEFAULT_LLM_PROVIDER.lower()
        if provider == "openai" and settings.OPENAI_API_KEY:
            model = settings.OPENAI_MODEL
        elif provider == "azure" and settings.AZURE_OPENAI_API_KEY:
            model = f"azure-{settings.AZURE_OPENAI_MODEL}"
        elif provider == "qwen" and settings.QWEN_API_KEY:
            model = settings.QWEN_MODEL
        elif provider == "mistral" and settings.MISTRAL_API_KEY:
            model = settings.MISTRAL_MODEL
        elif provider == "ibm" and settings.IBM_API_KEY:
            model = settings.IBM_MODEL
        else:
            model = settings.OLLAMA_MODEL

        print(f"[GENERAL_RESPONSE] Provider: {provider}, Model: {model}", flush=True)
        print(f"[GENERAL_RESPONSE] Context size: {len(user_message_with_context)} chars", flush=True)
        print(f"[GENERAL_RESPONSE] Has RAG: {bool(rag_formatted)}, Has ELTV: {bool(eltv_data)}, Has Treatments: {bool(treatments_context)}", flush=True)

        try:
            response, _ = await self.chatbot_service._get_llm_response(
                messages=messages,
                model=model,
                temperature=0.7  # Slightly lower for more consistent, data-grounded responses
            )
            print(f"[GENERAL_RESPONSE] LLM response length: {len(response) if response else 0}", flush=True)
            if response and response.strip():
                return response
            raise ValueError("LLM returned empty response")
        except Exception as e:
            print(f"[GENERAL_RESPONSE] LLM call failed: {e}", flush=True)

            # Return comprehensive fallback with available data
            if employee:
                risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
                risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"
                fallback = (
                    f"**{employee.get('full_name', 'Employee')}** ({employee.get('hr_code', 'N/A')})\n\n"
                    f"**Risk Assessment:** {risk:.0%} churn probability ({risk_level} priority)\n"
                    f"**Position:** {employee.get('position', 'N/A')} in {employee.get('structure_name', 'N/A')}\n"
                    f"**Tenure:** {employee.get('tenure', 0):.1f} years\n\n"
                )
                if eltv_data:
                    fallback += f"**Business Impact:** ${eltv_data.get('eltv_pre_treatment', 0):,.0f} employee lifetime value\n\n"
                if ml_contributors:
                    fallback += "**Top Risk Factors:**\n"
                    for contrib in ml_contributors[:3]:
                        if isinstance(contrib, dict):
                            fallback += f"- {contrib.get('feature', 'Unknown')}: {contrib.get('value', 'N/A')}\n"
                return fallback

            # Generic fallback
            stats = context.get("workforce_stats", {}) or {}
            return (
                f"Hi! I'm your ChurnVision AI Assistant with comprehensive analytics capabilities.\n\n"
                f"**Workforce Overview:**\n"
                f"- Total Employees: {stats.get('totalEmployees', 0)}\n"
                f"- High Risk: {stats.get('highRisk', 0)}\n"
                f"- Medium Risk: {stats.get('mediumRisk', 0)}\n\n"
                "How can I help you with employee retention today?"
            )

    async def chat(
        self,
        message: str,
        session_id: str,
        employee_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
        action_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Main chat method with two modes:
        1. Quick Action (action_type provided): Returns structured data cards
        2. Chat (no action_type): Uses LLM with full employee context
        """
        print(f"[CHAT] === CHAT REQUEST START ===", flush=True)
        print(f"[CHAT] message: '{message}', employee_id: {employee_id}, action_type: {action_type}", flush=True)

        # Resolve dataset context first
        dataset_id = await self._resolve_dataset_id(dataset_id)

        # Build entities from employee_id and include original message for RAG
        entities = {"hr_code": employee_id, "original_message": message} if employee_id else {"original_message": message}

        # Map action_type to pattern_type for structured responses
        action_to_pattern = {
            "diagnose": PatternType.CHURN_RISK_DIAGNOSIS,
            "retention_plan": PatternType.RETENTION_PLAN,
            "compare_resigned": PatternType.EMPLOYEE_COMPARISON,
            "compare_stayed": PatternType.EMPLOYEE_COMPARISON_STAYED,
            "exit_patterns": PatternType.EXIT_PATTERN_MINING,
            "workforce_trends": PatternType.WORKFORCE_TRENDS,
            "department_analysis": PatternType.DEPARTMENT_ANALYSIS,
            "shap": PatternType.SHAP_EXPLANATION,
            "email": PatternType.EMAIL_ACTION,
            "meeting": PatternType.MEETING_ACTION,
            "employee_info": PatternType.EMPLOYEE_INFO,
        }

        if action_type and action_type in action_to_pattern:
            # Quick action mode: Return structured data
            pattern_type = action_to_pattern[action_type]
            print(f"[CHAT] Quick action mode: {action_type} -> {pattern_type}", flush=True)
        else:
            # Chat mode: Always use LLM
            pattern_type = PatternType.GENERAL_CHAT
            print(f"[CHAT] Chat mode: Using LLM with context", flush=True)

        # Gather context based on pattern
        context = await self.gather_context(pattern_type, entities, dataset_id)
        print(f"[CHAT] Context - employee: {context.get('employee', {}).get('full_name', 'None')}, has_churn: {context.get('churn') is not None}", flush=True)

        # Generate response
        result = await self.generate_response(pattern_type, context, message)
        print(f"[CHAT] Response - pattern: {result.get('pattern_detected')}, structured: {result.get('structured_data') is not None}", flush=True)
        print(f"[CHAT] === CHAT REQUEST END ===", flush=True)

        # Save to database
        await self._save_message(session_id, employee_id, message, "user")
        await self._save_message(session_id, employee_id, result["response"], "assistant")

        return result

    async def _save_message(
        self,
        session_id: str,
        employee_id: Optional[str],
        message: str,
        role: str
    ):
        """Save message to chat_messages table"""
        chat_message = ChatMessage(
            session_id=session_id,
            employee_id=employee_id,
            message=message,
            role=role
        )
        self.db.add(chat_message)
        await self.db.commit()

    async def stream_chat(
        self,
        message: str,
        session_id: str,
        employee_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat response token by token for WebSocket delivery.

        This method wraps the standard chat method and simulates streaming
        by yielding words from the full response. For true token-level streaming,
        the underlying LLM provider would need to support streaming APIs.
        """
        import re

        # Get the full response using the standard chat method
        result = await self.chat(
            message=message,
            session_id=session_id,
            employee_id=employee_id,
            dataset_id=dataset_id,
            action_type=None  # Always use LLM mode for streaming
        )

        response_text = result.get("response", "")

        if not response_text:
            yield "I'm sorry, I couldn't generate a response."
            return

        # Split by words and markdown elements to provide natural streaming
        # This regex splits on spaces while preserving markdown formatting
        tokens = re.split(r'(\s+|(?<=[.!?])\s+)', response_text)

        for token in tokens:
            if token:  # Skip empty tokens
                yield token
