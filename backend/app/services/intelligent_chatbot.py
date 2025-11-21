from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import selectinload
import re
import json

from app.core.config import settings
from app.models.chatbot import ChatMessage
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.treatment import TreatmentDefinition, TreatmentApplication
from app.services.chatbot import ChatbotService


class PatternType:
    CHURN_RISK_DIAGNOSIS = "churn_risk_diagnosis"
    RETENTION_PLAN = "retention_plan"
    EMPLOYEE_COMPARISON = "employee_comparison"
    EXIT_PATTERN_MINING = "exit_pattern_mining"
    SHAP_EXPLANATION = "shap_explanation"
    GENERAL_CHAT = "general_chat"


class IntelligentChatbotService:
    """
    Intelligent chatbot service that understands ChurnVision-specific queries
    and provides context-aware responses using employee data, churn predictions,
    and treatment recommendations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.chatbot_service = ChatbotService(db)

    async def detect_pattern(self, message: str) -> Tuple[str, Dict[str, Any]]:
        """
        Detect the intent pattern from user message.
        Returns (pattern_type, extracted_entities)
        """
        message_lower = message.lower()
        entities = {}

        # Pattern 1: Churn Risk Diagnosis
        # "Why is John Smith at high risk?"
        # "Explain the churn risk for employee 12345"
        if any(keyword in message_lower for keyword in ["why is", "at risk", "churn risk", "risk score", "explain"]):
            entities["employee_name"] = self._extract_employee_name(message)
            entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.CHURN_RISK_DIAGNOSIS, entities

        # Pattern 2: Retention Plan Generation
        # "Create a retention plan for Mike Chen"
        # "Generate retention strategy for employee 54321"
        if any(keyword in message_lower for keyword in ["retention plan", "retention strategy", "create plan", "generate plan"]):
            entities["employee_name"] = self._extract_employee_name(message)
            entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.RETENTION_PLAN, entities

        # Pattern 3: Employee Comparison
        # "Compare Sarah Johnson with similar resigned employees"
        # "Find employees similar to hr_code 12345 who resigned"
        if any(keyword in message_lower for keyword in ["compare", "similar", "resigned employees", "like"]):
            entities["employee_name"] = self._extract_employee_name(message)
            entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.EMPLOYEE_COMPARISON, entities

        # Pattern 4: Exit Pattern Mining
        # "Show common exit patterns"
        # "What are the main reasons for resignations?"
        if any(keyword in message_lower for keyword in ["exit pattern", "resignation pattern", "common exit", "why do employees leave"]):
            return PatternType.EXIT_PATTERN_MINING, entities

        # Pattern 5: SHAP Explanation
        # "What factors contribute to John's risk?"
        # "Show me the SHAP values for employee 12345"
        if any(keyword in message_lower for keyword in ["shap", "factors", "contributors", "what affects"]):
            entities["employee_name"] = self._extract_employee_name(message)
            entities["hr_code"] = self._extract_hr_code(message)
            return PatternType.SHAP_EXPLANATION, entities

        # Default: General Chat
        return PatternType.GENERAL_CHAT, entities

    def _extract_employee_name(self, message: str) -> Optional[str]:
        """Extract employee name from message using pattern matching"""
        # Look for capitalized names after common keywords
        patterns = [
            r"(?:for|is|about)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
            r"employee\s+([A-Z][a-z]+\s+[A-Z][a-z]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message)
            if match:
                return match.group(1)
        return None

    def _extract_hr_code(self, message: str) -> Optional[str]:
        """Extract HR code from message"""
        # Look for hr_code or employee ID patterns
        patterns = [
            r"hr_code[:\s]+([A-Z0-9-]+)",
            r"employee[:\s]+([A-Z0-9-]+)",
            r"id[:\s]+([A-Z0-9-]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    async def gather_context(
        self,
        pattern_type: str,
        entities: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Gather relevant context from database based on pattern type
        """
        context = {"pattern": pattern_type}

        if pattern_type in [
            PatternType.CHURN_RISK_DIAGNOSIS,
            PatternType.RETENTION_PLAN,
            PatternType.SHAP_EXPLANATION,
            PatternType.EMPLOYEE_COMPARISON
        ]:
            # Get employee data
            employee = await self._get_employee_data(
                hr_code=entities.get("hr_code"),
                full_name=entities.get("employee_name")
            )

            if employee:
                context["employee"] = {
                    "hr_code": employee.hr_code,
                    "full_name": employee.full_name,
                    "position": employee.position,
                    "structure_name": employee.structure_name,
                    "tenure": float(employee.tenure),
                    "status": employee.status,
                    "employee_cost": float(employee.employee_cost) if employee.employee_cost else None
                }

                # Get churn prediction
                churn_data = await self._get_churn_data(employee.hr_code)
                if churn_data:
                    context["churn"] = {
                        "resign_proba": float(churn_data.resign_proba),
                        "shap_values": churn_data.shap_values,
                        "confidence_score": float(churn_data.confidence_score) if churn_data.confidence_score else None,
                        "model_version": churn_data.model_version
                    }

                # Get churn reasoning
                reasoning = await self._get_churn_reasoning(employee.hr_code)
                if reasoning:
                    context["reasoning"] = {
                        "churn_risk": float(reasoning.churn_risk),
                        "stage": reasoning.stage,
                        "ml_score": float(reasoning.ml_score) if reasoning.ml_score else None,
                        "heuristic_score": float(reasoning.heuristic_score) if reasoning.heuristic_score else None,
                        "ml_contributors": reasoning.ml_contributors,
                        "heuristic_alerts": reasoning.heuristic_alerts,
                        "reasoning": reasoning.reasoning,
                        "recommendations": reasoning.recommendations
                    }

                # Get available treatments for retention plans
                if pattern_type == PatternType.RETENTION_PLAN:
                    treatments = await self._get_available_treatments()
                    context["treatments"] = treatments

                # Get similar resigned employees for comparison
                if pattern_type == PatternType.EMPLOYEE_COMPARISON:
                    similar = await self._get_similar_resigned_employees(employee)
                    context["similar_employees"] = similar

        # For exit pattern mining, get aggregate statistics
        if pattern_type == PatternType.EXIT_PATTERN_MINING:
            patterns = await self._analyze_exit_patterns()
            context["exit_patterns"] = patterns

        return context

    async def _get_employee_data(
        self,
        hr_code: Optional[str] = None,
        full_name: Optional[str] = None
    ) -> Optional[HRDataInput]:
        """Fetch employee data from database"""
        query = select(HRDataInput)

        if hr_code:
            query = query.where(HRDataInput.hr_code == hr_code)
        elif full_name:
            query = query.where(HRDataInput.full_name.ilike(f"%{full_name}%"))
        else:
            return None

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_churn_data(self, hr_code: str) -> Optional[ChurnOutput]:
        """Fetch churn prediction data"""
        query = select(ChurnOutput).where(ChurnOutput.hr_code == hr_code).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_churn_reasoning(self, hr_code: str) -> Optional[ChurnReasoning]:
        """Fetch churn reasoning data"""
        query = select(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code)
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
                "base_cost": float(t.base_cost),
                "base_effect_size": float(t.base_effect_size) if t.base_effect_size else None,
                "time_to_effect": t.time_to_effect,
            }
            for t in treatments
        ]

    async def _get_similar_resigned_employees(self, employee: HRDataInput) -> List[Dict[str, Any]]:
        """Find similar employees who have resigned"""
        query = select(HRDataInput).where(
            and_(
                HRDataInput.status == "resigned",
                HRDataInput.position == employee.position,
                HRDataInput.hr_code != employee.hr_code
            )
        ).limit(5)

        result = await self.db.execute(query)
        similar = result.scalars().all()

        return [
            {
                "hr_code": e.hr_code,
                "full_name": e.full_name,
                "position": e.position,
                "tenure": float(e.tenure),
                "termination_date": str(e.termination_date) if e.termination_date else None
            }
            for e in similar
        ]

    async def _analyze_exit_patterns(self) -> Dict[str, Any]:
        """Analyze common patterns in employee exits"""
        # Get resigned employees with churn reasoning
        query = select(HRDataInput, ChurnReasoning).join(
            ChurnReasoning,
            HRDataInput.hr_code == ChurnReasoning.hr_code
        ).where(HRDataInput.status == "resigned")

        result = await self.db.execute(query)
        resigned_data = result.all()

        # Analyze patterns
        stages = {}
        avg_tenure = 0
        total_count = len(resigned_data)

        for hr_data, reasoning in resigned_data:
            # Count by stage
            stage = reasoning.stage if reasoning else "Unknown"
            stages[stage] = stages.get(stage, 0) + 1
            avg_tenure += float(hr_data.tenure)

        if total_count > 0:
            avg_tenure /= total_count

        return {
            "total_resignations": total_count,
            "average_tenure": round(avg_tenure, 2),
            "stages": stages,
            "common_stages": sorted(stages.items(), key=lambda x: x[1], reverse=True)[:3]
        }

    async def generate_response(
        self,
        pattern_type: str,
        context: Dict[str, Any],
        original_message: str
    ) -> str:
        """
        Generate context-aware response based on pattern type and gathered context
        """
        if pattern_type == PatternType.CHURN_RISK_DIAGNOSIS:
            return await self._generate_risk_diagnosis(context)

        elif pattern_type == PatternType.RETENTION_PLAN:
            return await self._generate_retention_plan(context)

        elif pattern_type == PatternType.EMPLOYEE_COMPARISON:
            return await self._generate_comparison(context)

        elif pattern_type == PatternType.EXIT_PATTERN_MINING:
            return await self._generate_exit_patterns(context)

        elif pattern_type == PatternType.SHAP_EXPLANATION:
            return await self._generate_shap_explanation(context)

        else:
            # General chat - use LLM with ChurnVision context
            return await self._generate_general_response(original_message, context)

    async def _generate_risk_diagnosis(self, context: Dict[str, Any]) -> str:
        """Generate risk diagnosis response"""
        if "employee" not in context or "churn" not in context:
            return "I couldn't find the employee data or churn prediction. Please provide a valid employee name or HR code."

        emp = context["employee"]
        churn = context["churn"]
        reasoning = context.get("reasoning", {})

        risk_level = "HIGH" if churn["resign_proba"] >= 0.7 else "MEDIUM" if churn["resign_proba"] >= 0.4 else "LOW"

        response = f"""**Churn Risk Analysis for {emp['full_name']}**

**Risk Level:** {risk_level} ({churn['resign_proba']:.1%})
**Position:** {emp['position']}
**Department:** {emp['structure_name']}
**Tenure:** {emp['tenure']:.1f} years

"""

        if reasoning:
            response += f"""**Risk Breakdown:**
- ML Model Score: {reasoning.get('ml_score', 0):.1%}
- Heuristic Score: {reasoning.get('heuristic_score', 0):.1%}
- Behavioral Stage: {reasoning.get('stage', 'Unknown')}

"""

            if reasoning.get('ml_contributors'):
                response += f"""**Top Risk Factors:**
{reasoning['ml_contributors']}

"""

            if reasoning.get('reasoning'):
                response += f"""**Analysis:**
{reasoning['reasoning']}

"""

            if reasoning.get('recommendations'):
                response += f"""**Recommendations:**
{reasoning['recommendations']}
"""

        return response

    async def _generate_retention_plan(self, context: Dict[str, Any]) -> str:
        """Generate retention plan with treatment recommendations"""
        if "employee" not in context or "churn" not in context:
            return "I couldn't find the employee data. Please provide a valid employee name or HR code."

        emp = context["employee"]
        churn = context["churn"]
        treatments = context.get("treatments", [])

        risk_proba = churn["resign_proba"]

        # Filter treatments based on risk level
        suitable_treatments = []
        if risk_proba >= 0.7:  # High risk
            suitable_treatments = [t for t in treatments if t["base_effect_size"] and t["base_effect_size"] >= 0.15]
        elif risk_proba >= 0.4:  # Medium risk
            suitable_treatments = [t for t in treatments if t["base_effect_size"] and t["base_effect_size"] >= 0.10]
        else:  # Low risk
            suitable_treatments = [t for t in treatments if t["base_cost"] < 2000]

        # Sort by effectiveness/cost ratio
        suitable_treatments = sorted(
            suitable_treatments[:3],
            key=lambda x: (x.get("base_effect_size", 0) or 0) / max(float(x["base_cost"]), 1),
            reverse=True
        )

        response = f"""**Retention Strategy for {emp['full_name']}**

**Current Risk:** {risk_proba:.1%}
**Position:** {emp['position']}
**Estimated Replacement Cost:** ${emp.get('employee_cost', 0):,.0f}

**Recommended Treatment Plan:**

"""

        for i, treatment in enumerate(suitable_treatments[:3], 1):
            effect = treatment.get("base_effect_size", 0) or 0
            cost = float(treatment["base_cost"])
            time_frame = treatment.get("time_to_effect", "Unknown")

            response += f"""{i}. **{treatment['name']}** ({time_frame})
   - Cost: ${cost:,.0f}
   - Expected Risk Reduction: {effect:.1%}
   - Description: {treatment.get('description', 'N/A')}

"""

        if suitable_treatments:
            total_cost = sum(float(t["base_cost"]) for t in suitable_treatments[:3])
            total_effect = sum((t.get("base_effect_size", 0) or 0) for t in suitable_treatments[:3])
            roi = (emp.get("employee_cost", 0) * total_effect) / max(total_cost, 1) if total_cost > 0 else 0

            response += f"""**Summary:**
- Total Investment: ${total_cost:,.0f}
- Expected Risk Reduction: {total_effect:.1%}
- Estimated ROI: {roi:.1f}:1
"""

        return response

    async def _generate_comparison(self, context: Dict[str, Any]) -> str:
        """Generate employee comparison with resigned employees"""
        if "employee" not in context:
            return "I couldn't find the employee data."

        emp = context["employee"]
        similar = context.get("similar_employees", [])

        response = f"""**Comparison: {emp['full_name']} vs Similar Resigned Employees**

**Target Employee:**
- Position: {emp['position']}
- Tenure: {emp['tenure']:.1f} years
- Status: {emp['status']}

"""

        if similar:
            response += "**Similar Resigned Employees:**\n\n"
            for s in similar:
                response += f"""- **{s['full_name']}**
  - Position: {s['position']}
  - Tenure at Exit: {s['tenure']:.1f} years
  - Termination: {s.get('termination_date', 'Unknown')}

"""

            response += f"\n**Insight:** Found {len(similar)} similar employees who resigned from the same position. Common pattern analysis suggests monitoring for similar risk factors.\n"
        else:
            response += "No similar resigned employees found with the same position.\n"

        return response

    async def _generate_exit_patterns(self, context: Dict[str, Any]) -> str:
        """Generate exit pattern analysis"""
        patterns = context.get("exit_patterns", {})

        response = """**Exit Pattern Analysis**

"""

        total = patterns.get("total_resignations", 0)
        avg_tenure = patterns.get("average_tenure", 0)

        response += f"""**Overview:**
- Total Resignations Analyzed: {total}
- Average Tenure at Exit: {avg_tenure:.1f} years

"""

        common_stages = patterns.get("common_stages", [])
        if common_stages:
            response += "**Most Common Exit Stages:**\n\n"
            for stage, count in common_stages:
                percentage = (count / total * 100) if total > 0 else 0
                response += f"- {stage}: {count} employees ({percentage:.1f}%)\n"

        response += "\n**Actionable Insights:**\n"
        response += "- Monitor employees entering high-risk stages\n"
        response += "- Implement targeted interventions based on stage patterns\n"
        response += "- Review tenure milestones for preventive actions\n"

        return response

    async def _generate_shap_explanation(self, context: Dict[str, Any]) -> str:
        """Generate SHAP values explanation"""
        if "employee" not in context or "churn" not in context:
            return "I couldn't find the employee data or SHAP values."

        emp = context["employee"]
        churn = context["churn"]
        shap_values = churn.get("shap_values")

        response = f"""**Risk Factor Analysis for {emp['full_name']}**

**Overall Risk Score:** {churn['resign_proba']:.1%}

"""

        if shap_values:
            response += "**Top Contributing Factors:**\n\n"
            if isinstance(shap_values, dict):
                sorted_factors = sorted(
                    shap_values.items(),
                    key=lambda x: abs(float(x[1]) if isinstance(x[1], (int, float)) else 0),
                    reverse=True
                )[:5]

                for factor, value in sorted_factors:
                    direction = "increases" if float(value) > 0 else "decreases"
                    response += f"- **{factor}**: {direction} risk by {abs(float(value)):.3f}\n"
            else:
                response += f"SHAP values: {shap_values}\n"
        else:
            response += "SHAP values not available for this employee.\n"

        return response

    async def _generate_general_response(
        self,
        message: str,
        context: Dict[str, Any]
    ) -> str:
        """Generate general response using LLM with ChurnVision context"""
        # Build context-aware prompt
        system_prompt = f"""{settings.CHATBOT_SYSTEM_PROMPT}

You have access to ChurnVision data and should provide insights about employee churn, retention strategies, and HR analytics.
"""

        # Use the underlying chatbot service for LLM response
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ]

        try:
            response, _ = await self.chatbot_service._get_llm_response(
                messages=messages,
                model=settings.OPENAI_MODEL if settings.DEFAULT_LLM_PROVIDER == "openai" else settings.OLLAMA_MODEL,
                temperature=0.7
            )
            return response
        except Exception as e:
            return f"I apologize, but I encountered an error: {str(e)}"

    async def chat(
        self,
        message: str,
        session_id: str,
        employee_id: Optional[str] = None
    ) -> str:
        """
        Main chat method that processes messages with intelligence
        """
        # Detect pattern
        pattern_type, entities = await self.detect_pattern(message)

        # Gather context
        context = await self.gather_context(pattern_type, entities)

        # Generate response
        response = await self.generate_response(pattern_type, context, message)

        # Save to database
        await self._save_message(session_id, employee_id, message, "user")
        await self._save_message(session_id, employee_id, response, "assistant")

        return response

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
