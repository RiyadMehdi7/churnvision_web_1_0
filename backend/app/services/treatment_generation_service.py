"""
Treatment Generation Service

Generates personalized treatment suggestions for employees using AI.
"""

import json
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.chatbot import ChatbotService
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.core.config import settings


class TreatmentGenerationService:
    """
    Service for generating personalized treatments using AI.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.chatbot_service = ChatbotService(db)

    async def generate_personalized_treatments(
        self,
        hr_code: str,
        model: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate personalized treatments for an employee.
        """
        # 1. Fetch Employee Context
        employee = await self._get_employee_data(hr_code)
        if not employee:
            raise ValueError(f"Employee {hr_code} not found")

        churn_data = await self._get_churn_data(hr_code)
        reasoning = await self._get_churn_reasoning(hr_code)

        # 2. Construct Prompt
        prompt = self._construct_prompt(employee, churn_data, reasoning)

        # 3. Call AI
        try:
            response_text = await self.chatbot_service.generate_response(
                messages=[
                    {"role": "system", "content": "You are an expert HR strategist and retention specialist. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                model=model,
                temperature=0.7,
                max_tokens=1024
            )

            # 4. Parse Response (pass employee context for fallback)
            treatments = self._parse_response(response_text, employee, churn_data)
            return treatments

        except Exception as e:
            # Fallback to contextual treatments instead of failing
            print(f"Error generating treatments via AI: {e}")
            return self._generate_fallback_treatments(employee, churn_data)

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
        
        # Format ML contributors if available
        ml_factors = ""
        if reasoning and reasoning.ml_contributors:
            try:
                contributors = json.loads(reasoning.ml_contributors) if isinstance(reasoning.ml_contributors, str) else reasoning.ml_contributors
                if isinstance(contributors, list):
                    top_factors = [f"- {c.get('feature', 'Unknown')}: {c.get('importance', 0)}" for c in contributors[:3]]
                    ml_factors = "\n".join(top_factors)
            except:
                pass

        prompt = f"""
        Generate 5 personalized retention treatments for the following employee.
        
        Employee Profile:
        - Name: {employee.full_name}
        - Position: {employee.position}
        - Department: {employee.structure_name}
        - Tenure: {employee.tenure} years
        - Salary: ${employee.employee_cost}
        
        Risk Analysis:
        - Churn Risk: {risk_level} ({risk_score:.2f})
        - Key Risk Factors:
        {ml_factors}
        - Analysis: {reasoning_text}
        
        Requirements:
        1. Generate exactly 5 treatments.
        2. Include both material (e.g., bonus, raise) and non-material (e.g., mentorship, flexibility) treatments.
        3. Each treatment must be personalized to the employee's specific situation and risk factors.
        4. Return the result ONLY as a valid JSON array of objects. Do not include markdown formatting or explanations outside the JSON.
        
        JSON Structure:
        [
            {{
                "name": "Treatment Name",
                "type": "material" or "non-material",
                "description": "Detailed description of the treatment and why it fits this employee.",
                "estimated_cost": 1000 (numeric value, 0 for non-material),
                "implementation_timeline": "Immediate" or "1 month",
                "expected_impact": "High" or "Medium" or "Low"
            }}
        ]
        """
        return prompt

    def _parse_response(self, response_text: str, employee: Optional[HRDataInput] = None, churn_data: Optional[ChurnOutput] = None) -> List[Dict[str, Any]]:
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

            if valid_treatments:
                return valid_treatments[:5]
            else:
                raise ValueError("No valid treatments in response")

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
