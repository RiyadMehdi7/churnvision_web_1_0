"""
Treatment Generation Service

Generates personalized treatment suggestions for employees using AI.
"""

import json
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
                    {"role": "system", "content": "You are an expert HR strategist and retention specialist."},
                    {"role": "user", "content": prompt}
                ],
                model=model,
                temperature=0.7,
                max_tokens=1024
            )
            
            # 4. Parse Response
            treatments = self._parse_response(response_text)
            return treatments

        except Exception as e:
            # Fallback or re-raise
            print(f"Error generating treatments: {e}")
            raise Exception(f"Failed to generate treatments: {str(e)}")

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

    def _parse_response(self, response_text: str) -> List[Dict[str, Any]]:
        try:
            # Clean up potential markdown code blocks
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]
            
            treatments = json.loads(cleaned_text.strip())
            
            if not isinstance(treatments, list):
                raise ValueError("Response is not a list")
                
            # Validate structure
            valid_treatments = []
            for t in treatments:
                if all(k in t for k in ["name", "type", "description"]):
                    valid_treatments.append(t)
            
            return valid_treatments[:5]
            
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails - try to extract list items manually or return error
            print(f"Failed to parse JSON: {response_text}")
            # Return a generic fallback if parsing fails completely
            return [
                {
                    "name": "Stay Interview",
                    "type": "non-material",
                    "description": "Conduct a structured stay interview to understand specific concerns.",
                    "estimated_cost": 0,
                    "implementation_timeline": "Immediate",
                    "expected_impact": "Medium"
                }
            ]
