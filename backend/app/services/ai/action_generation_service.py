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

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.base_generation_service import BaseAIGenerationService
from app.services.utils.json_helpers import parse_json_response
from app.models.hr_data import HRDataInput

logger = logging.getLogger(__name__)


class ActionGenerationService(BaseAIGenerationService):
    """
    Service for generating AI-powered action proposals.
    Uses all available employee data for maximum personalization.

    Inherits common functionality from BaseAIGenerationService:
    - Risk threshold calculations (data-driven)
    - Employee data fetching
    - Context building for prompts
    - JSON response parsing
    """

    def __init__(self, db: AsyncSession):
        super().__init__(db)

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
        # Get comprehensive employee context (from base class)
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

        # Build comprehensive prompt with all available data (from base class)
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
            # Use configured model from settings if not specified
            effective_model = model or await self._get_configured_model()
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": "You are an expert HR communications specialist who writes highly personalized, authentic emails. Never use generic templates. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                model=effective_model,
                temperature=0.7,
                max_tokens=700
            )

            email_data = parse_json_response(response_text, expect_type="object")

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
            logger.warning(f"Failed to generate AI email: {e}")
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
            # Use configured model from settings if not specified
            effective_model = model or await self._get_configured_model()
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": "You are an expert HR meeting facilitator who creates personalized, productive meeting agendas. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                model=effective_model,
                temperature=0.7,
                max_tokens=500
            )

            meeting_data = parse_json_response(response_text, expect_type="object")

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
            logger.warning(f"Failed to generate AI meeting proposal: {e}")
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

        # Determine priority based on data-driven risk thresholds (from base class)
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

        # Get threshold for urgent action (from base class)
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

        # Get data-driven thresholds (from base class)
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

    # --- Fallback Methods ---

    def _generate_fallback_email(
        self,
        employee: HRDataInput,
        email_type: str,
        hr_code: str
    ) -> Dict[str, Any]:
        """Generate template-based fallback email."""
        first_name = employee.full_name.split()[0] if employee.full_name else "there"

        templates = {
            "check_in": {
                "subject": "Quick Check-in",
                "body": f"""Hi {first_name},

I wanted to reach out and see how things are going for you. It's been a while since we connected, and I'd love to hear how your projects are progressing.

Is there anything you need support with, or any topics you'd like to discuss?

Let me know if you have a few minutes to chat this week.

Best,
[Your Name]"""
            },
            "career_discussion": {
                "subject": "Let's Talk About Your Growth",
                "body": f"""Hi {first_name},

I've been thinking about career development within our team, and I'd like to schedule some time to discuss your goals and growth opportunities.

Would you be available for a 30-minute chat sometime this week or next?

Looking forward to connecting,
[Your Name]"""
            },
            "recognition": {
                "subject": "Thank You for Your Great Work",
                "body": f"""Hi {first_name},

I wanted to take a moment to recognize your excellent contributions recently. Your work has made a real difference to the team.

I'd love to hear more about what you've been working on. Do you have time for a quick chat?

Best regards,
[Your Name]"""
            },
            "stay_interview": {
                "subject": "Would Love to Catch Up",
                "body": f"""Hi {first_name},

I hope you're doing well. I'd like to schedule some time to chat with you about your experience on the team and hear your thoughts on how things are going.

Would you be available for a brief conversation this week?

Best,
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

    def _generate_fallback_meeting(
        self,
        employee: HRDataInput,
        meeting_type: str,
        hr_code: str
    ) -> Dict[str, Any]:
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
