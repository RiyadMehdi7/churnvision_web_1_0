"""
Action Generation Service

Generates actionable proposals for HR interventions:
- Draft retention emails
- Meeting requests
- Follow-up tasks

All actions require user approval before execution.
Uses comprehensive employee data for personalization.

Risk thresholds are data-driven, computed from user's actual data distribution.
"""

import json
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.chatbot_service import ChatbotService
from app.services.data_driven_thresholds_service import data_driven_thresholds_service
from app.models.hr_data import HRDataInput, InterviewData
from app.models.churn import ChurnOutput, ChurnReasoning, ELTVOutput
from app.models.treatment import TreatmentApplication


class ActionGenerationService:
    """
    Service for generating AI-powered action proposals.
    Uses all available employee data for maximum personalization.

    Risk thresholds are retrieved from data-driven thresholds service.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.chatbot_service = ChatbotService(db)
        self.thresholds_service = data_driven_thresholds_service

    def _get_risk_thresholds(self, dataset_id: Optional[str] = None) -> Tuple[float, float]:
        """Get data-driven risk thresholds (high, medium)."""
        thresholds = self.thresholds_service.get_cached_thresholds(dataset_id)
        if thresholds and thresholds.risk_high_threshold > 0:
            return (thresholds.risk_high_threshold, thresholds.risk_medium_threshold)
        return (0.6, 0.3)  # Fallback only if no data

    def _get_risk_level(self, risk_score: float, dataset_id: Optional[str] = None) -> str:
        """Determine risk level using data-driven thresholds."""
        high_thresh, medium_thresh = self._get_risk_thresholds(dataset_id)
        # Critical is top tier of high risk (score >= high + 0.2 typically)
        critical_thresh = min(0.9, high_thresh + 0.2)
        if risk_score >= critical_thresh:
            return "Critical"
        elif risk_score >= high_thresh:
            return "High"
        elif risk_score >= medium_thresh:
            return "Medium"
        return "Low"

    def _get_priority(self, risk_score: float, dataset_id: Optional[str] = None) -> str:
        """Determine priority using data-driven thresholds."""
        return self._get_risk_level(risk_score, dataset_id).lower()

    async def _get_comprehensive_employee_context(self, hr_code: str) -> Dict[str, Any]:
        """
        Gather all available data about an employee for personalized action generation.
        Returns a comprehensive context dictionary.
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
        }

        # Parse additional_data JSON if available
        if employee.additional_data:
            try:
                add_data = employee.additional_data if isinstance(employee.additional_data, dict) else json.loads(employee.additional_data)
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
            except:
                pass

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
                    shap = churn_data.shap_values if isinstance(churn_data.shap_values, dict) else json.loads(churn_data.shap_values)
                    # Get top 5 features driving the risk
                    if isinstance(shap, dict):
                        sorted_features = sorted(shap.items(), key=lambda x: abs(float(x[1]) if x[1] else 0), reverse=True)[:5]
                        context["churn"]["top_risk_drivers"] = [
                            {"feature": f[0].replace("_", " ").title(), "impact": float(f[1]) if f[1] else 0}
                            for f in sorted_features
                        ]
                except:
                    pass

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
                try:
                    contributors = json.loads(reasoning.ml_contributors) if isinstance(reasoning.ml_contributors, str) else reasoning.ml_contributors
                    context["reasoning"]["ml_contributors"] = contributors[:5] if isinstance(contributors, list) else []
                except:
                    pass
            # Parse heuristic alerts
            if reasoning.heuristic_alerts:
                try:
                    alerts = json.loads(reasoning.heuristic_alerts) if isinstance(reasoning.heuristic_alerts, str) else reasoning.heuristic_alerts
                    context["reasoning"]["alerts"] = alerts[:5] if isinstance(alerts, list) else []
                except:
                    pass
            # Parse recommendations
            if reasoning.recommendations:
                try:
                    recs = json.loads(reasoning.recommendations) if isinstance(reasoning.recommendations, str) else reasoning.recommendations
                    context["reasoning"]["recommendations"] = recs[:3] if isinstance(recs, list) else []
                except:
                    context["reasoning"]["recommendations_text"] = reasoning.recommendations

        # 4. ELTV data (Employee Lifetime Value)
        eltv = await self._get_eltv_data(hr_code)
        if eltv:
            context["eltv"] = {
                "pre_treatment_value": float(eltv.eltv_pre_treatment) if eltv.eltv_pre_treatment else None,
                "post_treatment_value": float(eltv.eltv_post_treatment) if eltv.eltv_post_treatment else None,
                "treatment_effect": float(eltv.treatment_effect) if eltv.treatment_effect else None,
            }

        # 5. Interview data (stay/exit interviews)
        interviews = await self._get_interview_data(hr_code)
        context["interviews"] = [
            {
                "date": str(i.interview_date),
                "type": i.interview_type,
                "notes": i.notes[:500] if i.notes else None,  # Limit notes length
                "sentiment": float(i.sentiment_score) if i.sentiment_score else None,
                "insights": i.processed_insights[:300] if i.processed_insights else None,
            }
            for i in interviews[:3]  # Last 3 interviews
        ]

        # 6. Treatment history
        treatments = await self._get_treatment_history(hr_code)
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
            for t in treatments[:5]  # Last 5 treatments
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

        # Add optional personal/professional details
        if emp.get("age"):
            lines.append(f"Age: {emp['age']}")
        if emp.get("education"):
            lines.append(f"Education: {emp['education']}")
        if emp.get("performance_rating"):
            lines.append(f"Performance Rating: {emp['performance_rating']}/5")
        if emp.get("job_satisfaction"):
            lines.append(f"Job Satisfaction: {emp['job_satisfaction']}/4")
        if emp.get("work_life_balance"):
            lines.append(f"Work-Life Balance: {emp['work_life_balance']}/4")
        if emp.get("years_in_role"):
            lines.append(f"Years in Current Role: {emp['years_in_role']}")
        if emp.get("years_since_promotion"):
            lines.append(f"Years Since Last Promotion: {emp['years_since_promotion']}")
        if emp.get("training_times_last_year"):
            lines.append(f"Training Sessions Last Year: {emp['training_times_last_year']}")
        if emp.get("overtime"):
            lines.append(f"Works Overtime: {emp['overtime']}")
        if emp.get("business_travel"):
            lines.append(f"Business Travel: {emp['business_travel']}")
        if emp.get("environment_satisfaction"):
            lines.append(f"Environment Satisfaction: {emp['environment_satisfaction']}/4")
        if emp.get("relationship_satisfaction"):
            lines.append(f"Relationship Satisfaction: {emp['relationship_satisfaction']}/4")

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
                    # Use data-driven sentiment thresholds
                    sentiment_label = self.thresholds_service.get_sentiment_label(
                        interview["sentiment"], dataset_id=ctx.get("dataset_id")
                    )
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
                status_icon = "✓" if t["success"] == "successful" else "→" if t["status"] == "active" else "○"
                lines.append(f"{status_icon} {t['treatment_name']} ({t['status']}, {t.get('success', 'pending')})")
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

    async def generate_retention_email(
        self,
        hr_code: str,
        email_type: str = "check_in",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a highly personalized retention email using all available employee data.

        Args:
            hr_code: Employee HR code
            email_type: Type of email (check_in, career_discussion, recognition, stay_interview)
            model: LLM model to use

        Returns:
            Email proposal with to, subject, body
        """
        # Get comprehensive employee context
        ctx = await self._get_comprehensive_employee_context(hr_code)
        if not ctx.get("employee"):
            raise ValueError(f"Employee {hr_code} not found")

        emp = ctx["employee"]

        email_templates = {
            "check_in": "casual check-in to see how they're doing and if they need any support",
            "career_discussion": "invite to discuss career growth opportunities and development path",
            "recognition": "express appreciation for their contributions and recent work",
            "stay_interview": "schedule an informal conversation to understand their job satisfaction"
        }

        # Build comprehensive prompt with all available data
        profile_section = self._build_employee_profile_prompt(ctx)
        risk_section = self._build_risk_context_prompt(ctx)
        history_section = self._build_history_context_prompt(ctx)

        prompt = f"""Generate a highly personalized retention email for this employee.

{profile_section}
{risk_section}
{history_section}

EMAIL PURPOSE: {email_templates.get(email_type, email_templates['check_in'])}

CRITICAL PERSONALIZATION REQUIREMENTS:
1. Reference specific details from their profile (tenure, role, department)
2. If they have low job satisfaction or work-life balance scores, address those concerns subtly
3. If they haven't been promoted recently, mention growth opportunities
4. If they work overtime frequently, acknowledge their dedication
5. If there are past interviews, reference themes from those conversations
6. If past treatments were applied, build on what worked or try new approaches
7. Write in a warm, authentic tone - NOT generic corporate speak
8. Don't mention "retention", "churn risk", or that this is AI-generated
9. Keep it concise (150-200 words)
10. Include a specific, actionable call to action

Return ONLY a JSON object:
{{
    "subject": "Personalized subject line referencing something specific",
    "body": "Full email with personal greeting and [Your Name] signature",
    "suggested_send_time": "morning/afternoon/end_of_week",
    "personalization_notes": "Brief note on what was personalized"
}}
"""

        try:
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": "You are an expert HR communications specialist who writes highly personalized, authentic emails. Never use generic templates. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                model=model,
                temperature=0.7,
                max_tokens=700
            )

            email_data = self._parse_json_response(response_text)

            return {
                "type": "email",
                "status": "pending",
                "title": f"Retention Email: {emp['full_name']}",
                "description": f"{email_type.replace('_', ' ').title()} email for {emp['full_name']}",
                "metadata": {
                    "to": [emp["full_name"]],
                    "subject": email_data.get("subject", f"Quick Check-in - {emp['full_name']}"),
                    "body": email_data.get("body", ""),
                    "targetEmployee": {
                        "hrCode": hr_code,
                        "name": emp["full_name"],
                        "position": emp.get("position"),
                        "department": emp.get("department"),
                        "tenure": emp.get("tenure_years"),
                    },
                    "emailType": email_type,
                    "suggestedSendTime": email_data.get("suggested_send_time", "morning"),
                    "personalizationNotes": email_data.get("personalization_notes"),
                    "riskContext": {
                        "score": ctx.get("churn", {}).get("risk_score"),
                        "stage": ctx.get("reasoning", {}).get("stage"),
                    }
                },
                "createdAt": datetime.utcnow().isoformat()
            }

        except Exception as e:
            # Fallback to template-based email
            employee = await self._get_employee_data(hr_code)
            return self._generate_fallback_email(employee, email_type, hr_code)

    async def generate_meeting_proposal(
        self,
        hr_code: str,
        meeting_type: str = "one_on_one",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a personalized meeting proposal using all available employee data.

        Args:
            hr_code: Employee HR code
            meeting_type: Type of meeting (one_on_one, skip_level, career_planning, team_sync)
            model: LLM model to use

        Returns:
            Meeting proposal with attendees, time, agenda
        """
        # Get comprehensive employee context
        ctx = await self._get_comprehensive_employee_context(hr_code)
        if not ctx.get("employee"):
            raise ValueError(f"Employee {hr_code} not found")

        emp = ctx["employee"]

        meeting_contexts = {
            "one_on_one": "regular 1:1 between employee and direct manager",
            "skip_level": "meeting with manager's manager for broader perspective",
            "career_planning": "focused discussion on career trajectory and growth",
            "team_sync": "informal team connection session"
        }

        # Build comprehensive prompt
        profile_section = self._build_employee_profile_prompt(ctx)
        risk_section = self._build_risk_context_prompt(ctx)
        history_section = self._build_history_context_prompt(ctx)

        prompt = f"""Generate a personalized meeting proposal for this employee.

{profile_section}
{risk_section}
{history_section}

MEETING TYPE: {meeting_contexts.get(meeting_type, meeting_contexts['one_on_one'])}

PERSONALIZATION REQUIREMENTS:
1. Create discussion points based on their specific situation:
   - If job satisfaction is low, include a topic about work experience
   - If no recent promotions, discuss career path
   - If working overtime, address workload balance
   - If there were past interviews, follow up on themes raised
   - If past treatments were applied, check on progress
2. Frame everything positively (growth-focused, not problem-focused)
3. Suggest appropriate duration based on topics (30-60 min)
4. Include 3-5 specific, personalized discussion points

Return ONLY a JSON object:
{{
    "title": "Personalized meeting title",
    "duration": 30,
    "agenda": "Bulleted agenda with personalized topics",
    "discussion_points": ["specific point based on their data", "another specific point"],
    "personalization_notes": "What was customized for this employee"
}}
"""

        try:
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": "You are an expert HR meeting facilitator who creates personalized, productive meeting agendas. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                model=model,
                temperature=0.7,
                max_tokens=500
            )

            meeting_data = self._parse_json_response(response_text)

            # Suggest time: next few business days
            suggested_time = datetime.now() + timedelta(days=2)
            if suggested_time.weekday() >= 5:  # Weekend
                suggested_time += timedelta(days=(7 - suggested_time.weekday()))
            suggested_time = suggested_time.replace(hour=10, minute=0, second=0, microsecond=0)

            return {
                "type": "meeting",
                "status": "pending",
                "title": meeting_data.get("title", f"1:1 with {emp['full_name']}"),
                "description": f"{meeting_type.replace('_', ' ').title()} meeting",
                "metadata": {
                    "attendees": [emp["full_name"], "You"],
                    "proposedTime": suggested_time.isoformat(),
                    "duration": meeting_data.get("duration", 30),
                    "agenda": meeting_data.get("agenda", ""),
                    "discussionPoints": meeting_data.get("discussion_points", []),
                    "targetEmployee": {
                        "hrCode": hr_code,
                        "name": emp["full_name"],
                        "position": emp.get("position"),
                        "department": emp.get("department"),
                        "tenure": emp.get("tenure_years"),
                    },
                    "meetingType": meeting_type,
                    "personalizationNotes": meeting_data.get("personalization_notes"),
                    "riskContext": {
                        "score": ctx.get("churn", {}).get("risk_score"),
                        "stage": ctx.get("reasoning", {}).get("stage"),
                    }
                },
                "createdAt": datetime.utcnow().isoformat()
            }

        except Exception as e:
            employee = await self._get_employee_data(hr_code)
            return self._generate_fallback_meeting(employee, meeting_type, hr_code)

    async def generate_task_proposal(
        self,
        hr_code: str,
        task_type: str = "follow_up",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a personalized task proposal using all available employee data.

        Args:
            hr_code: Employee HR code
            task_type: Type of task (follow_up, review_compensation, training_enrollment, recognition)
            model: LLM model to use

        Returns:
            Task proposal with description, assignee, due date
        """
        # Get comprehensive employee context
        ctx = await self._get_comprehensive_employee_context(hr_code)
        if not ctx.get("employee"):
            raise ValueError(f"Employee {hr_code} not found")

        emp = ctx["employee"]
        risk_score = ctx.get("churn", {}).get("risk_score", 0.5)
        dataset_id = emp.get("dataset_id")

        # Determine priority based on data-driven risk thresholds
        priority = self._get_priority(risk_score, dataset_id)

        # Build personalized task description based on context
        task_context = []
        if emp.get("years_since_promotion") and emp["years_since_promotion"] > 2:
            task_context.append(f"hasn't been promoted in {emp['years_since_promotion']} years")
        if emp.get("job_satisfaction") and emp["job_satisfaction"] <= 2:
            task_context.append("has low job satisfaction")
        if emp.get("work_life_balance") and emp["work_life_balance"] <= 2:
            task_context.append("struggles with work-life balance")
        if ctx.get("reasoning", {}).get("alerts"):
            task_context.append("has active risk alerts")

        context_str = ", ".join(task_context) if task_context else "requires attention"

        # Get threshold for urgent action
        high_thresh, _ = self._get_risk_thresholds(dataset_id)

        task_configs = {
            "follow_up": {
                "title": f"Priority Follow-up: {emp['full_name']}",
                "description": f"Follow up with {emp['full_name']} ({emp.get('position', 'Employee')}) who {context_str}. Schedule a check-in and address any concerns raised.",
                "days_until_due": 2 if risk_score >= high_thresh else 5
            },
            "review_compensation": {
                "title": f"Compensation Review: {emp['full_name']}",
                "description": f"Review compensation for {emp['full_name']} ({emp.get('position', '')}, {emp.get('tenure_years', 0):.1f} years tenure). Consider market rates, performance ({emp.get('performance_rating', 'N/A')}/5), and retention risk ({risk_score:.0%}).",
                "days_until_due": 5
            },
            "training_enrollment": {
                "title": f"Development Program: {emp['full_name']}",
                "description": f"Enroll {emp['full_name']} in career development programs. Focus areas: {context_str if task_context else 'skill enhancement and career growth'}. Training completed last year: {emp.get('training_times_last_year', 'Unknown')} sessions.",
                "days_until_due": 10
            },
            "recognition": {
                "title": f"Recognition: {emp['full_name']}",
                "description": f"Prepare formal recognition for {emp['full_name']} ({emp.get('department', '')}). Consider their tenure of {emp.get('tenure_years', 0):.1f} years and performance rating of {emp.get('performance_rating', 'N/A')}/5.",
                "days_until_due": 3
            }
        }

        config = task_configs.get(task_type, task_configs["follow_up"])
        due_date = datetime.now() + timedelta(days=config["days_until_due"])

        return {
            "type": "task",
            "status": "pending",
            "title": config["title"],
            "description": config["description"],
            "metadata": {
                "assignee": "HR Manager",
                "dueDate": due_date.isoformat(),
                "priority": priority,
                "targetEmployee": {
                    "hrCode": hr_code,
                    "name": emp["full_name"],
                    "position": emp.get("position"),
                    "department": emp.get("department"),
                    "tenure": emp.get("tenure_years"),
                },
                "taskType": task_type,
                "riskContext": {
                    "score": risk_score,
                    "stage": ctx.get("reasoning", {}).get("stage"),
                },
                "keyFactors": task_context[:3] if task_context else []
            },
            "createdAt": datetime.utcnow().isoformat()
        }

    async def generate_actions_for_employee(
        self,
        hr_code: str,
        model: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate a smart suite of recommended actions based on comprehensive employee data.

        Analyzes all available data to suggest the most appropriate interventions.
        """
        # Get comprehensive employee context
        ctx = await self._get_comprehensive_employee_context(hr_code)
        if not ctx.get("employee"):
            raise ValueError(f"Employee {hr_code} not found")

        emp = ctx["employee"]
        risk_score = ctx.get("churn", {}).get("risk_score", 0.5)
        dataset_id = emp.get("dataset_id")

        # Get data-driven thresholds
        high_thresh, medium_thresh = self._get_risk_thresholds(dataset_id)

        actions = []

        # Determine the best email type based on context
        email_type = "check_in"  # default
        if emp.get("years_since_promotion") and emp["years_since_promotion"] > 3:
            email_type = "career_discussion"
        elif emp.get("performance_rating") and emp["performance_rating"] >= 4:
            email_type = "recognition"
        elif risk_score >= high_thresh:
            email_type = "stay_interview"

        # Always suggest an email (most non-intrusive)
        email = await self.generate_retention_email(hr_code, email_type, model)
        actions.append(email)

        # Critical/High risk: full intervention suite
        if risk_score >= high_thresh:
            # Urgent 1:1 meeting
            meeting = await self.generate_meeting_proposal(hr_code, "one_on_one", model)
            actions.append(meeting)

            # Urgent follow-up task
            task = await self.generate_task_proposal(hr_code, "follow_up", model)
            actions.append(task)

            # If compensation might be an issue (low salary hike, long tenure)
            if emp.get("salary_hike_percent") and emp["salary_hike_percent"] < 12:
                comp_task = await self.generate_task_proposal(hr_code, "review_compensation", model)
                actions.append(comp_task)

        # Medium risk: targeted intervention
        elif risk_score >= medium_thresh:
            # Career-focused meeting
            meeting_type = "career_planning"
            if emp.get("years_in_role") and emp["years_in_role"] > 3:
                meeting_type = "career_planning"  # Stagnation concern
            meeting = await self.generate_meeting_proposal(hr_code, meeting_type, model)
            actions.append(meeting)

            # Training if low satisfaction
            if emp.get("job_satisfaction") and emp["job_satisfaction"] <= 2:
                task = await self.generate_task_proposal(hr_code, "training_enrollment", model)
                actions.append(task)

        # Low risk but worth attention
        else:
            # Recognition for good performers to maintain engagement
            if emp.get("performance_rating") and emp["performance_rating"] >= 4:
                task = await self.generate_task_proposal(hr_code, "recognition", model)
                actions.append(task)

        return actions

    # --- Helper Methods ---

    async def _get_employee_data(self, hr_code: str) -> Optional[HRDataInput]:
        query = select(HRDataInput).where(HRDataInput.hr_code == hr_code).order_by(desc(HRDataInput.report_date)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_churn_data(self, hr_code: str) -> Optional[ChurnOutput]:
        query = select(ChurnOutput).where(ChurnOutput.hr_code == hr_code).order_by(desc(ChurnOutput.generated_at)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_churn_reasoning(self, hr_code: str) -> Optional[ChurnReasoning]:
        query = select(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code).order_by(desc(ChurnReasoning.updated_at)).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_eltv_data(self, hr_code: str) -> Optional[ELTVOutput]:
        """Get Employee Lifetime Value data."""
        query = select(ELTVOutput).where(ELTVOutput.hr_code == hr_code).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_interview_data(self, hr_code: str) -> List[InterviewData]:
        """Get interview history for employee."""
        query = select(InterviewData).where(
            InterviewData.hr_code == hr_code
        ).order_by(desc(InterviewData.interview_date)).limit(5)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _get_treatment_history(self, hr_code: str) -> List[TreatmentApplication]:
        """Get treatment application history for employee."""
        query = select(TreatmentApplication).where(
            TreatmentApplication.hr_code == hr_code
        ).order_by(desc(TreatmentApplication.applied_date)).limit(10)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    def _extract_risk_factors(self, reasoning: Optional[ChurnReasoning]) -> List[str]:
        """Extract key risk factors from reasoning data."""
        factors = []
        if not reasoning:
            return factors

        try:
            if reasoning.ml_contributors:
                contributors = json.loads(reasoning.ml_contributors) if isinstance(reasoning.ml_contributors, str) else reasoning.ml_contributors
                if isinstance(contributors, list):
                    factors.extend([c.get('feature', '').replace('_', ' ') for c in contributors[:3]])

            if reasoning.heuristic_alerts:
                alerts = json.loads(reasoning.heuristic_alerts) if isinstance(reasoning.heuristic_alerts, str) else reasoning.heuristic_alerts
                if isinstance(alerts, list):
                    factors.extend([a.get('message', '')[:50] for a in alerts[:2]])
        except:
            pass

        return factors

    def _parse_json_response(self, response_text: str) -> Dict[str, Any]:
        """Parse JSON from LLM response."""
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        try:
            return json.loads(cleaned.strip())
        except json.JSONDecodeError:
            json_match = re.search(r'\{[\s\S]*\}', cleaned)
            if json_match:
                return json.loads(json_match.group())
            raise

    def _generate_fallback_email(self, employee: HRDataInput, email_type: str, hr_code: str) -> Dict[str, Any]:
        """Generate template-based fallback email."""
        templates = {
            "check_in": {
                "subject": f"Quick Check-in",
                "body": f"""Hi {employee.full_name.split()[0]},

I wanted to reach out and see how things are going for you. It's been a while since we connected, and I'd love to hear how your projects are progressing.

Is there anything you need support with, or any topics you'd like to discuss?

Let me know if you have a few minutes to chat this week.

Best,
[Your Name]"""
            },
            "career_discussion": {
                "subject": "Let's Talk About Your Growth",
                "body": f"""Hi {employee.full_name.split()[0]},

I've been thinking about career development within our team, and I'd like to schedule some time to discuss your goals and growth opportunities.

Would you be available for a 30-minute chat sometime this week or next?

Looking forward to connecting,
[Your Name]"""
            }
        }

        template = templates.get(email_type, templates["check_in"])

        return {
            "type": "email",
            "status": "pending",
            "title": f"Retention Email: {employee.full_name}",
            "description": f"{email_type.replace('_', ' ').title()} email",
            "metadata": {
                "to": [employee.full_name],
                "subject": template["subject"],
                "body": template["body"],
                "targetEmployee": {"hrCode": hr_code, "name": employee.full_name},
                "emailType": email_type
            },
            "createdAt": datetime.utcnow().isoformat()
        }

    def _generate_fallback_meeting(self, employee: HRDataInput, meeting_type: str, hr_code: str) -> Dict[str, Any]:
        """Generate template-based fallback meeting."""
        suggested_time = datetime.now() + timedelta(days=2)
        if suggested_time.weekday() >= 5:
            suggested_time += timedelta(days=(7 - suggested_time.weekday()))
        suggested_time = suggested_time.replace(hour=10, minute=0, second=0, microsecond=0)

        return {
            "type": "meeting",
            "status": "pending",
            "title": f"1:1 with {employee.full_name}",
            "description": f"{meeting_type.replace('_', ' ').title()} meeting",
            "metadata": {
                "attendees": [employee.full_name, "You"],
                "proposedTime": suggested_time.isoformat(),
                "duration": 30,
                "agenda": "• Check-in on current projects\n• Discuss any challenges\n• Career development goals\n• Open discussion",
                "targetEmployee": {"hrCode": hr_code, "name": employee.full_name},
                "meetingType": meeting_type
            },
            "createdAt": datetime.utcnow().isoformat()
        }
