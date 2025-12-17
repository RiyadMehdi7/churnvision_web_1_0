"""
Treatment Generation Service

Generates personalized treatment suggestions for employees using AI.
Integrates with RAG subsystem for company-policy-compliant recommendations.
"""

import json
import re
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.chatbot_service import ChatbotService
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.core.config import settings

logger = logging.getLogger(__name__)


class TreatmentGenerationService:
    """
    Service for generating personalized treatments using AI.

    Integrates with RAG subsystem to:
    - Ground treatments in company policies
    - Validate treatments against custom HR rules
    - Ensure compliance with documented constraints
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.chatbot_service = ChatbotService(db)
        self._rag_service = None

    @property
    def rag_service(self):
        """Lazy-load RAG service to avoid circular imports."""
        if self._rag_service is None:
            try:
                from app.services.rag_service import RAGService
                self._rag_service = RAGService(self.db)
            except Exception as e:
                logger.warning(f"Failed to initialize RAG service: {e}")
                self._rag_service = None
        return self._rag_service

    async def generate_personalized_treatments(
        self,
        hr_code: str,
        model: Optional[str] = None,
        use_rag: bool = True,
        project_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personalized treatments for an employee.

        Args:
            hr_code: Employee HR code
            model: LLM model to use
            use_rag: Whether to use RAG for policy-grounded generation
            project_id: Project ID for RAG context filtering

        Returns:
            List of treatment dictionaries
        """
        # 1. Fetch Employee Context
        employee = await self._get_employee_data(hr_code)
        if not employee:
            raise ValueError(f"Employee {hr_code} not found")

        churn_data = await self._get_churn_data(hr_code)
        reasoning = await self._get_churn_reasoning(hr_code)

        # 2. Fetch RAG context if enabled
        rag_context = None
        if use_rag and settings.RAG_ENABLED and self.rag_service:
            try:
                rag_context = await self.rag_service.retrieve_context(
                    query=f"retention policies benefits treatments for {employee.position} in {employee.structure_name}",
                    project_id=project_id,
                    include_custom_rules=True,
                    document_types=["policy", "benefit", "rule"],
                )
                logger.info(f"Retrieved RAG context: {rag_context.get('total_chunks', 0)} chunks, {rag_context.get('total_rules', 0)} rules")
            except Exception as e:
                logger.warning(f"Failed to retrieve RAG context: {e}")
                rag_context = None

        # 3. Construct Prompt (with or without RAG context)
        if rag_context and (rag_context.get("documents") or rag_context.get("custom_rules")):
            prompt = self._construct_rag_prompt(employee, churn_data, reasoning, rag_context)
            system_message = self._get_rag_system_message()
        else:
            prompt = self._construct_prompt(employee, churn_data, reasoning)
            system_message = self._get_default_system_message()

        # 4. Call AI
        try:
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt}
                ],
                model=model,
                temperature=0.7 if rag_context else 0.8,  # Lower temp with RAG for consistency
                max_tokens=2048
            )

            # 5. Parse Response
            treatments = self._parse_response(response_text, employee, churn_data)

            # 6. Validate treatments against policies if RAG is enabled
            if rag_context and self.rag_service:
                treatments = await self._validate_treatments_against_policies(
                    treatments, rag_context
                )

            return treatments

        except Exception as e:
            logger.error(f"Error generating treatments via AI: {e}")
            return self._generate_fallback_treatments(employee, churn_data)

    def _get_default_system_message(self) -> str:
        """Default system message without RAG context."""
        return """You are an elite HR strategist and employee retention expert with deep expertise in organizational psychology, compensation strategy, and talent management.

Your role is to design highly personalized, creative retention interventions that:
- Target the ROOT CAUSES of churn risk, not just symptoms
- Are tailored to the individual's career stage, role, and department context
- Balance immediate impact with long-term engagement
- Include innovative approaches beyond standard HR playbooks

You MUST respond with ONLY valid JSON - no markdown, no explanations, no text before or after the JSON array.
Generate exactly 5 diverse, actionable treatments with specific, creative names."""

    def _get_rag_system_message(self) -> str:
        """System message for RAG-grounded generation."""
        return """You are an elite HR strategist working within a specific company's HR framework and policies.

CRITICAL INSTRUCTIONS:
1. Your treatments MUST comply with the company policies and rules provided below
2. If a treatment type is not supported by company documentation, DO NOT recommend it
3. Adapt treatment costs and timelines to match company-documented constraints
4. For each treatment, cite which policy or rule supports it
5. If you cannot find policy support for a treatment, explicitly note "Requires policy review"

Your role is to design personalized retention interventions that:
- Target the ROOT CAUSES of churn risk
- Are tailored to the individual's context
- STRICTLY comply with company policies
- Reference specific rules or benefits when applicable

You MUST respond with ONLY valid JSON - no markdown, no explanations.
Generate exactly 5 treatments. Include a "policy_reference" field for each."""

    def _construct_rag_prompt(
        self,
        employee: HRDataInput,
        churn_data: Optional[ChurnOutput],
        reasoning: Optional[ChurnReasoning],
        rag_context: Dict[str, Any],
    ) -> str:
        """Construct prompt with RAG context for policy-grounded generation."""
        # Build policy context section
        policy_section = ""
        if rag_context.get("documents"):
            policy_section = "\nCOMPANY POLICIES & DOCUMENTATION:\n" + "=" * 40 + "\n"
            for i, doc in enumerate(rag_context["documents"][:5], 1):
                policy_section += f"\n[{i}] Source: {doc.get('source', 'Company Document')}\n"
                policy_section += f"Type: {doc.get('document_type', 'general')}\n"
                policy_section += f"{doc.get('content', '')}\n"

        # Build custom rules section
        rules_section = ""
        if rag_context.get("custom_rules"):
            rules_section = "\nMANDATORY HR RULES:\n" + "=" * 40 + "\n"
            for rule in rag_context["custom_rules"]:
                rules_section += f"\n[{rule.get('category', 'general').upper()}] {rule.get('name')}\n"
                rules_section += f"Priority: {rule.get('priority', 5)}/10\n"
                rules_section += f"{rule.get('rule_text')}\n"

        # Get base prompt
        base_prompt = self._construct_prompt(employee, churn_data, reasoning)

        # Combine with RAG context
        rag_prompt = f"""{policy_section}
{rules_section}

COMPLIANCE REQUIREMENTS:
========================
- All treatments MUST be feasible within the company's documented policies
- Costs must align with documented benefit limits
- Any treatment not explicitly supported by documentation should be flagged
- Reference specific policies in your recommendations

{base_prompt}

ADDITIONAL OUTPUT REQUIREMENT:
Add a "policy_reference" field to each treatment indicating which policy supports it.
If no specific policy applies, set to "General HR best practice - requires policy review".
"""
        return rag_prompt

    async def _validate_treatments_against_policies(
        self,
        treatments: List[Dict[str, Any]],
        rag_context: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Validate and annotate treatments with policy compliance information."""
        validated_treatments = []

        for treatment in treatments:
            try:
                validation = await self.rag_service.validate_treatment(
                    treatment=treatment,
                    context=rag_context,
                )

                if validation["is_valid"]:
                    # Treatment is valid, keep as-is
                    treatment["compliance_status"] = "compliant"
                    validated_treatments.append(treatment)
                elif validation.get("adapted_treatment"):
                    # Use adapted treatment
                    adapted = validation["adapted_treatment"]
                    adapted["compliance_status"] = "adapted"
                    adapted["adaptation_notes"] = validation.get("reasoning", "")
                    validated_treatments.append(adapted)
                else:
                    # Add compliance warning
                    treatment["compliance_status"] = "review_required"
                    treatment["compliance_warning"] = validation.get("reasoning", "May require policy review")
                    validated_treatments.append(treatment)

            except Exception as e:
                logger.warning(f"Failed to validate treatment: {e}")
                treatment["compliance_status"] = "unknown"
                validated_treatments.append(treatment)

        return validated_treatments

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

    def _construct_prompt(
        self,
        employee: HRDataInput,
        churn_data: Optional[ChurnOutput],
        reasoning: Optional[ChurnReasoning]
    ) -> str:

        risk_score = float(churn_data.resign_proba) if churn_data else 0.5
        risk_level = "High" if risk_score >= 0.7 else "Medium" if risk_score >= 0.4 else "Low"

        reasoning_text = reasoning.reasoning if reasoning else "No specific reasoning available."
        recommendations_text = reasoning.recommendations if reasoning and reasoning.recommendations else ""

        # Format ML contributors if available
        ml_factors = ""
        risk_factors_list = []
        if reasoning and reasoning.ml_contributors:
            try:
                contributors = json.loads(reasoning.ml_contributors) if isinstance(reasoning.ml_contributors, str) else reasoning.ml_contributors
                if isinstance(contributors, list):
                    for c in contributors[:5]:
                        feature = c.get('feature', 'Unknown')
                        importance = c.get('importance', 0)
                        risk_factors_list.append(feature)
                        ml_factors += f"  - {feature}: contributes {importance:.1%} to churn risk\n"
            except:
                pass

        # Format heuristic alerts if available
        alerts_text = ""
        if reasoning and reasoning.heuristic_alerts:
            try:
                alerts = json.loads(reasoning.heuristic_alerts) if isinstance(reasoning.heuristic_alerts, str) else reasoning.heuristic_alerts
                if isinstance(alerts, list) and alerts:
                    alerts_text = "Behavioral Alerts:\n" + "\n".join([f"  - {a}" for a in alerts[:3]])
            except:
                pass

        # Calculate salary context
        salary = float(employee.employee_cost) if employee.employee_cost else 50000
        tenure = float(employee.tenure) if employee.tenure else 1.0

        # Determine urgency and treatment focus based on risk
        if risk_score >= 0.7:
            urgency = "CRITICAL - Immediate intervention required"
            focus = "aggressive retention with significant investment"
        elif risk_score >= 0.4:
            urgency = "ELEVATED - Proactive engagement needed"
            focus = "engagement improvement and career development"
        else:
            urgency = "MODERATE - Preventive measures recommended"
            focus = "long-term engagement and growth opportunities"

        prompt = f"""You are an expert HR strategist specializing in employee retention. Generate 5 creative, personalized retention treatments for this specific employee.

EMPLOYEE CONTEXT:
================
Name: {employee.full_name}
Position: {employee.position}
Department: {employee.structure_name}
Tenure: {tenure:.1f} years
Annual Compensation: ${salary:,.0f}

RISK ASSESSMENT:
===============
Churn Probability: {risk_score:.0%} ({risk_level} Risk)
Urgency Level: {urgency}

Key Risk Drivers:
{ml_factors if ml_factors else "  - General engagement factors"}

{alerts_text}

AI Analysis: {reasoning_text}
{f"System Recommendations: {recommendations_text}" if recommendations_text else ""}

TREATMENT DESIGN GUIDELINES:
===========================
Focus Area: {focus}

Generate treatments that:
1. DIRECTLY ADDRESS the specific risk factors identified above
2. Are PERSONALIZED to {employee.full_name}'s role as {employee.position} in {employee.structure_name}
3. Consider their {tenure:.1f} years of tenure ({"new hire needing integration" if tenure < 1 else "experienced employee needing growth" if tenure < 3 else "senior employee needing recognition and challenge"})
4. Include a MIX of:
   - Material interventions (compensation, bonuses, benefits) - for immediate impact
   - Non-material interventions (career growth, flexibility, recognition) - for lasting engagement
5. Have CREATIVE, SPECIFIC names (not generic like "Retention Bonus" - be specific like "Q1 Performance Acceleration Bonus" or "{employee.structure_name} Leadership Fast-Track Program")

COST GUIDELINES:
- Material treatments: typically 5-15% of annual salary for high impact
- Training/development: $2,000-$10,000 range
- Non-material: $0 or minimal administrative cost

OUTPUT FORMAT:
Return ONLY a valid JSON array with exactly 5 treatment objects. No explanations before or after.

[
  {{
    "name": "Specific Creative Treatment Name",
    "type": "material" or "non-material",
    "description": "2-3 sentences explaining what this treatment involves and WHY it specifically addresses {employee.full_name}'s situation and risk factors.",
    "estimated_cost": 5000,
    "implementation_timeline": "Immediate" or "2 weeks" or "1 month" or "3 months",
    "expected_impact": "High" or "Medium" or "Low"
  }}
]"""
        return prompt

    def _parse_response(self, response_text: str, employee: Optional[HRDataInput] = None, churn_data: Optional[ChurnOutput] = None) -> List[Dict[str, Any]]:
        MIN_TREATMENTS = 3  # Minimum treatments required from AI before supplementing

        try:
            # Clean up potential markdown code blocks
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]

            # Try direct JSON parsing first
            try:
                treatments = json.loads(cleaned_text.strip())
            except json.JSONDecodeError:
                # Try to extract JSON array from mixed text using regex
                json_match = re.search(r'\[[\s\S]*\]', cleaned_text)
                if json_match:
                    treatments = json.loads(json_match.group())
                else:
                    raise json.JSONDecodeError("No JSON array found", cleaned_text, 0)

            if not isinstance(treatments, list):
                raise ValueError("Response is not a list")

            # Validate structure
            valid_treatments = []
            for t in treatments:
                if all(k in t for k in ["name", "type", "description"]):
                    valid_treatments.append(t)

            if not valid_treatments:
                raise ValueError("No valid treatments in response")

            # If AI returned fewer than minimum, supplement with fallback treatments
            if len(valid_treatments) < MIN_TREATMENTS:
                print(f"AI returned only {len(valid_treatments)} treatments, supplementing with fallback")
                fallback_treatments = self._generate_fallback_treatments(employee, churn_data)

                # Get names of AI-generated treatments for deduplication
                ai_treatment_names = {t.get("name", "").lower() for t in valid_treatments}

                # Add fallback treatments that aren't duplicates
                for fallback in fallback_treatments:
                    if fallback.get("name", "").lower() not in ai_treatment_names:
                        valid_treatments.append(fallback)
                        ai_treatment_names.add(fallback.get("name", "").lower())
                    if len(valid_treatments) >= 5:
                        break

            return valid_treatments[:5]

        except (json.JSONDecodeError, ValueError) as e:
            # Fallback if JSON parsing fails - generate contextual treatments
            print(f"Failed to parse JSON: {response_text}. Error: {e}")
            return self._generate_fallback_treatments(employee, churn_data)

    def _generate_fallback_treatments(self, employee: Optional[HRDataInput] = None, churn_data: Optional[ChurnOutput] = None) -> List[Dict[str, Any]]:
        """
        Generate contextual fallback treatments when AI fails.
        These are based on best practices for retention.
        """
        risk_score = float(churn_data.resign_proba) if churn_data else 0.5
        tenure = float(employee.tenure) if employee and employee.tenure else 1.0
        salary = float(employee.employee_cost) if employee and employee.employee_cost else 50000

        treatments = []

        # Always include stay interview for any risk level
        treatments.append({
            "name": "Stay Interview",
            "type": "non-material",
            "description": "Conduct a structured stay interview to understand specific concerns and motivations. Focus on career aspirations, work environment satisfaction, and any obstacles they're facing.",
            "estimated_cost": 0,
            "implementation_timeline": "Immediate",
            "expected_impact": "Medium"
        })

        # High risk employees need more aggressive interventions
        if risk_score >= 0.7:
            treatments.append({
                "name": "Retention Bonus",
                "type": "material",
                "description": "Offer a retention bonus contingent on staying for a defined period. This provides immediate financial incentive while allowing time for other retention efforts.",
                "estimated_cost": int(salary * 0.1),
                "implementation_timeline": "1 week",
                "expected_impact": "High"
            })
            treatments.append({
                "name": "Role Enrichment",
                "type": "non-material",
                "description": "Expand responsibilities with challenging projects or leadership opportunities that align with career goals. Increase autonomy and decision-making authority.",
                "estimated_cost": 0,
                "implementation_timeline": "2 weeks",
                "expected_impact": "High"
            })

        # Medium risk - focus on engagement
        if risk_score >= 0.4 and risk_score < 0.7:
            treatments.append({
                "name": "Career Development Plan",
                "type": "non-material",
                "description": "Create a structured 12-month development plan with clear milestones, mentorship assignments, and skill-building opportunities aligned with their aspirations.",
                "estimated_cost": 2000,
                "implementation_timeline": "2 weeks",
                "expected_impact": "Medium"
            })
            treatments.append({
                "name": "Flexible Work Arrangement",
                "type": "non-material",
                "description": "Offer enhanced flexibility in work schedule or location. This demonstrates trust and can significantly improve work-life balance satisfaction.",
                "estimated_cost": 0,
                "implementation_timeline": "Immediate",
                "expected_impact": "Medium"
            })

        # Tenure-based treatments
        if tenure < 1:
            treatments.append({
                "name": "Enhanced Onboarding Support",
                "type": "non-material",
                "description": "Assign a buddy mentor, schedule regular check-ins, and ensure clear expectations. New employees often leave due to unclear role fit.",
                "estimated_cost": 0,
                "implementation_timeline": "Immediate",
                "expected_impact": "Medium"
            })
        elif tenure >= 3:
            treatments.append({
                "name": "Salary Market Adjustment",
                "type": "material",
                "description": "Review compensation against market rates. Long-tenured employees may be underpaid relative to new hires or market rates.",
                "estimated_cost": int(salary * 0.08),
                "implementation_timeline": "1 month",
                "expected_impact": "High"
            })

        # Always include recognition
        treatments.append({
            "name": "Recognition Program Enrollment",
            "type": "non-material",
            "description": "Enroll in peer recognition program and ensure regular acknowledgment of contributions in team meetings and company communications.",
            "estimated_cost": 500,
            "implementation_timeline": "1 week",
            "expected_impact": "Medium"
        })

        return treatments[:5]
