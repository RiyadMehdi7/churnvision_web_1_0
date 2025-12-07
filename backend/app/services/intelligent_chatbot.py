"""
Intelligent Chatbot Service

Provides context-aware AI responses for ChurnVision-specific queries.
Returns structured JSON data that matches frontend renderer expectations.
"""

from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, case
from sqlalchemy.orm import selectinload
import re
import json

from app.core.config import settings
from app.models.chatbot import ChatMessage
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.treatment import TreatmentDefinition, TreatmentApplication
from app.services.chatbot import ChatbotService
from app.models.dataset import Dataset
from app.services.project_service import ensure_default_project, get_active_project


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

                # Get churn prediction
                churn_data = await self._get_churn_data(employee.hr_code, dataset_id)
                if churn_data:
                    context["churn"] = {
                        "resign_proba": float(churn_data.resign_proba),
                        "shap_values": churn_data.shap_values or {},
                        "confidence_score": float(churn_data.confidence_score) if churn_data.confidence_score else 0.8,
                        "model_version": churn_data.model_version
                    }

                # Get churn reasoning
                reasoning = await self._get_churn_reasoning(employee.hr_code, dataset_id)
                if reasoning:
                    # Parse ml_contributors and heuristic_alerts from JSON strings
                    ml_contributors = []
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

                # Get treatments for retention plans
                if pattern_type == PatternType.RETENTION_PLAN:
                    treatments = await self._get_available_treatments()
                    context["treatments"] = treatments

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

    async def _get_churn_data(self, hr_code: str, dataset_id: str) -> Optional[ChurnOutput]:
        """Fetch churn prediction data"""
        query = select(ChurnOutput).where(
            ChurnOutput.hr_code == hr_code,
            ChurnOutput.dataset_id == dataset_id
        ).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

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

    async def _get_available_treatments(self) -> List[Dict[str, Any]]:
        """Get all active treatment definitions"""
        query = select(TreatmentDefinition).where(TreatmentDefinition.is_active == 1)
        result = await self.db.execute(query)
        treatments = result.scalars().all()

        return [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "base_cost": float(t.base_cost) if t.base_cost else 0,
                "base_effect_size": float(t.base_effect_size) if t.base_effect_size else 0.1,
                "time_to_effect": t.time_to_effect or "3 months",
            }
            for t in treatments
        ]

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
        """Get comprehensive workforce statistics"""
        # Get all active employees with reasoning data
        # Use case-insensitive comparison for status
        query = select(HRDataInput, ChurnReasoning).outerjoin(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(func.lower(HRDataInput.status) == "active")
        query = query.where(HRDataInput.dataset_id == dataset_id)

        result = await self.db.execute(query)
        employees = result.all()

        total = len(employees)
        # Use standard thresholds (0.6/0.3) matching frontend and churn_prediction.py
        high_risk = sum(1 for e, r in employees if r and r.churn_risk and r.churn_risk >= 0.6)
        medium_risk = sum(1 for e, r in employees if r and r.churn_risk and 0.3 <= r.churn_risk < 0.6)
        low_risk = total - high_risk - medium_risk

        # Department breakdown
        dept_stats = {}
        for e, r in employees:
            dept = e.structure_name or "Unknown"
            if dept not in dept_stats:
                dept_stats[dept] = {"count": 0, "risks": [], "ml_scores": [], "stage_scores": [], "confidences": []}
            dept_stats[dept]["count"] += 1
            if r and r.churn_risk:
                dept_stats[dept]["risks"].append(float(r.churn_risk))
            if r and r.ml_score:
                dept_stats[dept]["ml_scores"].append(float(r.ml_score))
            if r and r.stage_score:
                dept_stats[dept]["stage_scores"].append(float(r.stage_score))
            if r and r.confidence_level:
                dept_stats[dept]["confidences"].append(float(r.confidence_level))

        department_risks = []
        for dept, stats in dept_stats.items():
            risks = stats["risks"]
            department_risks.append({
                "department": dept,
                "count": stats["count"],
                "avgRisk": sum(risks) / len(risks) if risks else 0,
                "highRiskCount": sum(1 for r in risks if r >= 0.6),
                "avgMLScore": sum(stats["ml_scores"]) / len(stats["ml_scores"]) if stats["ml_scores"] else 0,
                "avgStageScore": sum(stats["stage_scores"]) / len(stats["stage_scores"]) if stats["stage_scores"] else 0,
                "avgConfidence": sum(stats["confidences"]) / len(stats["confidences"]) if stats["confidences"] else 0
            })

        # Stage distribution
        stage_counts = {}
        for e, r in employees:
            stage = r.stage if r and r.stage else "Unknown"
            if stage not in stage_counts:
                stage_counts[stage] = {"count": 0, "risks": []}
            stage_counts[stage]["count"] += 1
            if r and r.churn_risk:
                stage_counts[stage]["risks"].append(float(r.churn_risk))

        stage_distribution = [
            {
                "stage": stage,
                "count": data["count"],
                "avgRisk": sum(data["risks"]) / len(data["risks"]) if data["risks"] else 0
            }
            for stage, data in stage_counts.items()
        ]

        return {
            "totalEmployees": total,
            "highRisk": high_risk,
            "mediumRisk": medium_risk,
            "lowRisk": low_risk,
            "departmentRisks": sorted(department_risks, key=lambda x: x["avgRisk"], reverse=True),
            "stageDistribution": stage_distribution,
            "riskTrends": {
                "criticalEmployees": high_risk,
                "atRiskDepartments": sum(1 for d in department_risks if d["avgRisk"] >= 0.5),
                "averageConfidence": sum(d["avgConfidence"] for d in department_risks) / len(department_risks) if department_risks else 0,
                "totalWithReasoningData": sum(1 for e, r in employees if r is not None)
            }
        }

    async def _get_company_overview(self, dataset_id: str) -> Dict[str, Any]:
        """Aggregate company-level metrics scoped to dataset."""
        stats_query = select(
            func.count().label("total_employees"),
            func.sum(case((func.lower(HRDataInput.status) == "active", 1), else_=0)).label("active_employees"),
            func.avg(HRDataInput.tenure).label("avg_tenure"),
            func.avg(HRDataInput.employee_cost).label("avg_cost"),
            func.avg(ChurnOutput.resign_proba).label("avg_risk"),
            func.sum(case((ChurnOutput.resign_proba >= 0.6, 1), else_=0)).label("high_risk"),
            func.sum(case(((ChurnOutput.resign_proba >= 0.3) & (ChurnOutput.resign_proba < 0.6), 1), else_=0)).label("medium_risk"),
            func.sum(case((ChurnOutput.resign_proba < 0.3, 1), else_=0)).label("low_risk"),
        ).select_from(HRDataInput).outerjoin(
            ChurnOutput,
            and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
        ).where(HRDataInput.dataset_id == dataset_id)

        result = await self.db.execute(stats_query)
        row = result.fetchone()
        if not row:
            return {}

        return {
            "totalEmployees": row.total_employees or 0,
            "activeEmployees": row.active_employees or 0,
            "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
            "avgCost": float(row.avg_cost) if row.avg_cost else 0,
            "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
            "riskDistribution": {
                "high": int(row.high_risk or 0),
                "medium": int(row.medium_risk or 0),
                "low": int(row.low_risk or 0),
            }
        }

    async def _get_manager_team_summary(self, manager_id: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Summarize team under a manager with risk/cost/tenure aggregates."""
        if not manager_id:
            return None

        query = select(
            func.count().label("team_size"),
            func.avg(HRDataInput.tenure).label("avg_tenure"),
            func.avg(HRDataInput.employee_cost).label("avg_cost"),
            func.avg(ChurnOutput.resign_proba).label("avg_risk"),
            func.sum(case((ChurnOutput.resign_proba >= 0.6, 1), else_=0)).label("high_risk"),
        ).select_from(HRDataInput).outerjoin(
            ChurnOutput,
            and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
        ).where(
            HRDataInput.manager_id == manager_id,
            HRDataInput.dataset_id == dataset_id
        )

        result = await self.db.execute(query)
        row = result.fetchone()
        if not row or not row.team_size:
            return None

        return {
            "managerId": manager_id,
            "teamSize": int(row.team_size or 0),
            "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
            "avgCost": float(row.avg_cost) if row.avg_cost else 0,
            "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
            "highRiskCount": int(row.high_risk or 0),
        }

    async def _get_department_snapshot(self, department: str, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Return key stats for a department to enrich responses."""
        if not department:
            return None

        query = select(
            func.count().label("headcount"),
            func.avg(HRDataInput.tenure).label("avg_tenure"),
            func.avg(HRDataInput.employee_cost).label("avg_cost"),
            func.avg(ChurnOutput.resign_proba).label("avg_risk"),
            func.sum(case((ChurnOutput.resign_proba >= 0.6, 1), else_=0)).label("high_risk"),
        ).select_from(HRDataInput).outerjoin(
            ChurnOutput,
            and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
        ).where(
            HRDataInput.dataset_id == dataset_id,
            HRDataInput.structure_name.ilike(f"%{department}%")
        )

        result = await self.db.execute(query)
        row = result.fetchone()
        if not row or not row.headcount:
            return None

        return {
            "department": department,
            "headcount": int(row.headcount or 0),
            "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
            "avgCost": float(row.avg_cost) if row.avg_cost else 0,
            "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
            "highRiskCount": int(row.high_risk or 0),
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
        """Generate general response using LLM with comprehensive employee context"""
        print(f"[GENERAL_RESPONSE] === Generating general LLM response ===", flush=True)

        # Build context-aware prompt
        employee = context.get("employee")
        churn = context.get("churn", {})
        reasoning = context.get("reasoning", {})
        additional_data = context.get("additional_data", {})
        company_overview = context.get("company_overview", {})

        print(f"[GENERAL_RESPONSE] Employee present: {employee is not None}", flush=True)
        if employee:
            print(f"[GENERAL_RESPONSE] Employee details: {employee.get('full_name')}, risk: {churn.get('resign_proba', reasoning.get('churn_risk', 'N/A'))}", flush=True)

        employee_context = ""
        if employee:
            risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
            risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"

            # Basic employee info (employee is a dict from context)
            employee_context = f"""
=== SELECTED EMPLOYEE ===
Name: {employee.get('full_name', 'Unknown')}
HR Code: {employee.get('hr_code', 'N/A')}
Position: {employee.get('position', 'N/A')}
Department: {employee.get('structure_name', 'N/A')}
Tenure: {employee.get('tenure', 0):.1f} years
Status: {employee.get('status', 'Active')}

=== CHURN RISK ASSESSMENT ===
Overall Risk: {risk:.1%} ({risk_level})
Behavioral Stage: {reasoning.get('stage', 'Unknown')}
ML Score: {reasoning.get('ml_score', 0):.2f}
Heuristic Score: {reasoning.get('heuristic_score', 0):.2f}
Confidence Level: {reasoning.get('confidence_level', 0.7):.0%}
"""

            # Add ML risk factors
            ml_contributors = reasoning.get('ml_contributors', [])
            if ml_contributors and isinstance(ml_contributors, list):
                employee_context += "\n=== TOP RISK FACTORS (ML Model) ===\n"
                for contrib in ml_contributors[:5]:
                    if isinstance(contrib, dict):
                        feature = contrib.get('feature', 'Unknown')
                        importance = contrib.get('importance', 0)
                        value = contrib.get('value', 'N/A')
                        employee_context += f"- {feature}: {value} (impact: {importance:.2f})\n"

            # Add heuristic alerts
            heuristic_alerts = reasoning.get('heuristic_alerts', [])
            if heuristic_alerts and isinstance(heuristic_alerts, list):
                employee_context += "\n=== BEHAVIORAL ALERTS ===\n"
                for alert in heuristic_alerts[:5]:
                    if isinstance(alert, dict):
                        msg = alert.get('message', alert.get('rule_name', 'Alert'))
                        employee_context += f"⚠ {msg}\n"

            # Add recommendations if available
            recommendations = reasoning.get('recommendations', [])
            if recommendations:
                employee_context += "\n=== AI RECOMMENDATIONS ===\n"
                if isinstance(recommendations, list):
                    for rec in recommendations[:3]:
                        rec_text = rec.get('recommendation', str(rec)) if isinstance(rec, dict) else str(rec)
                        employee_context += f"→ {rec_text}\n"
                elif isinstance(recommendations, str):
                    employee_context += f"→ {recommendations}\n"

            # Add additional employee data if available
            if additional_data:
                employee_context += "\n=== EMPLOYEE DETAILS ===\n"
                if additional_data.get('age'):
                    employee_context += f"Age: {additional_data['age']}\n"
                if additional_data.get('education'):
                    employee_context += f"Education: {additional_data['education']}\n"
                if additional_data.get('performance_rating'):
                    employee_context += f"Performance Rating: {additional_data['performance_rating']}/5\n"
                if additional_data.get('job_satisfaction'):
                    employee_context += f"Job Satisfaction: {additional_data['job_satisfaction']}/4\n"
                if additional_data.get('work_life_balance'):
                    employee_context += f"Work-Life Balance: {additional_data['work_life_balance']}/4\n"
                if additional_data.get('environment_satisfaction'):
                    employee_context += f"Environment Satisfaction: {additional_data['environment_satisfaction']}/4\n"
                if additional_data.get('relationship_satisfaction'):
                    employee_context += f"Relationship Satisfaction: {additional_data['relationship_satisfaction']}/4\n"
                if additional_data.get('years_since_last_promotion'):
                    employee_context += f"Years Since Last Promotion: {additional_data['years_since_last_promotion']}\n"
                if additional_data.get('years_in_current_role'):
                    employee_context += f"Years in Current Role: {additional_data['years_in_current_role']}\n"
                if additional_data.get('training_times_last_year'):
                    employee_context += f"Training Sessions (Last Year): {additional_data['training_times_last_year']}\n"
                if additional_data.get('over_time'):
                    employee_context += f"Works Overtime: {additional_data['over_time']}\n"
                if additional_data.get('business_travel'):
                    employee_context += f"Business Travel: {additional_data['business_travel']}\n"

        # Add company context for comparison
        company_context = ""
        if company_overview:
            company_context = f"""
=== COMPANY OVERVIEW ===
Total Employees: {company_overview.get('total_employees', 'N/A')}
High Risk: {company_overview.get('high_risk_count', 'N/A')}
Average Risk: {company_overview.get('avg_risk', 0):.1%}
"""

        # Build messages with context - include employee data in user message for better model compliance
        system_prompt = f"""{settings.CHATBOT_SYSTEM_PROMPT}

You are ChurnVision AI Assistant for HR professionals. You help analyze employee churn risk.
NEVER ask for clarification. ALWAYS answer based on the employee data provided.
Keep responses concise and actionable.
"""

        if employee:
            # Include employee context in user message - models handle this better
            user_message_with_context = f"""Here is the employee data you must use to answer:

{employee_context}
{company_context}

User question: {message}

Answer the question using ONLY the employee data above. Do not ask for clarification."""
        else:
            user_message_with_context = f"""{company_context}

User question: {message}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message_with_context}
        ]

        # Determine model based on DEFAULT_LLM_PROVIDER
        # Default to Ollama (qwen3:4b) for local, privacy-focused inference
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
            # Default to local Ollama
            model = settings.OLLAMA_MODEL

        print(f"[GENERAL_RESPONSE] Using provider: {provider}, model: {model}", flush=True)
        print(f"[GENERAL_RESPONSE] System prompt length: {len(system_prompt)} chars, has employee_context: {len(employee_context) > 0}", flush=True)

        try:
            response, _ = await self.chatbot_service._get_llm_response(
                messages=messages,
                model=model,
                temperature=0.7
            )
            print(f"[GENERAL_RESPONSE] LLM response length: {len(response) if response else 0}", flush=True)
            # Check for empty response
            if response and response.strip():
                return response
            # Fallback if LLM returned empty
            raise ValueError("LLM returned empty response")
        except Exception as e:
            print(f"[GENERAL_RESPONSE] LLM call failed: {e}", flush=True)

            # Return employee-specific fallback if employee is selected
            if employee:
                risk = churn.get("resign_proba", reasoning.get("churn_risk", 0))
                risk_level = "High" if risk >= 0.6 else "Medium" if risk >= 0.3 else "Low"
                return (
                    f"I'm analyzing {employee.get('full_name', 'this employee')} ({employee.get('hr_code', 'N/A')}). "
                    f"They have a {risk:.0%} churn risk ({risk_level} priority) "
                    f"and have been with the company for {employee.get('tenure', 0):.1f} years. "
                    "What would you like to know about this employee?"
                )

            # Generic fallback
            stats = context.get("workforce_stats", {}) or {}
            total = stats.get("totalEmployees", 0)
            high = stats.get("highRisk", 0)
            medium = stats.get("mediumRisk", 0)
            return (
                f"Hi! I'm your ChurnVision AI Assistant. "
                f"Currently tracking {total} employees ({high} high risk, {medium} medium risk). "
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

        # Build entities from employee_id
        entities = {"hr_code": employee_id} if employee_id else {}

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
