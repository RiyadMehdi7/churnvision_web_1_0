from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Dict, Any

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.models.treatment import TreatmentDefinition
from app.schemas.playground import (
    PlaygroundEmployeeData,
    TreatmentSuggestion,
    ApplyTreatmentRequest,
    ApplyTreatmentResult,
    ManualSimulationRequest,
    ManualSimulationResponse
)
from app.services.churn_prediction import ChurnPredictionService

router = APIRouter()
churn_service = ChurnPredictionService()

@router.get("/data/{employee_id}", response_model=PlaygroundEmployeeData)
async def get_playground_data(
    employee_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive data for playground (employee + churn + reasoning)"""
    
    # 1. Get Employee Data
    query = select(HRDataInput).where(HRDataInput.hr_code == employee_id)
    result = await db.execute(query)
    employee = result.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    # 2. Get Churn Data
    query = select(ChurnOutput).where(ChurnOutput.hr_code == employee_id).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()
    
    # 3. Get Reasoning Data (optional)
    # query = select(ChurnReasoning).where(ChurnReasoning.hr_code == employee_id)
    # result = await db.execute(query)
    # reasoning = result.scalar_one_or_none()
    
    # Construct response
    current_features = {
        "hr_code": employee.hr_code,
        "full_name": employee.full_name,
        "structure_name": employee.structure_name,
        "position": employee.position,
        "status": employee.status,
        "tenure": float(employee.tenure),
        "employee_cost": float(employee.employee_cost) if employee.employee_cost else 0,
        "report_date": str(employee.report_date),
        "normalized_position_level": employee.position, # Placeholder
        "termination_date": str(employee.termination_date) if employee.termination_date else None
    }
    
    # Mock survival probabilities for now as they are not in DB
    survival_probs = {
        "12": 1.0 - (float(churn_data.resign_proba) if churn_data else 0.0),
        "24": (1.0 - (float(churn_data.resign_proba) if churn_data else 0.0)) * 0.9,
        "36": (1.0 - (float(churn_data.resign_proba) if churn_data else 0.0)) * 0.8
    }
    
    return PlaygroundEmployeeData(
        employee_id=employee.hr_code,
        current_features=current_features,
        current_churn_probability=float(churn_data.resign_proba) if churn_data else 0.0,
        current_eltv=float(employee.employee_cost) * 3 * (1.0 - (float(churn_data.resign_proba) if churn_data else 0.0)) if employee.employee_cost else 0.0, # Simple ELTV calc
        current_survival_probabilities=survival_probs,
        shap_values=churn_data.shap_values if churn_data and churn_data.shap_values else {},
        normalized_position_level=employee.position
    )

@router.get("/treatments/{employee_id}", response_model=List[TreatmentSuggestion])
async def get_treatment_suggestions(
    employee_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get treatment suggestions for an employee"""
    
    # Get employee and churn data to tailor suggestions
    query = select(HRDataInput).where(HRDataInput.hr_code == employee_id)
    result = await db.execute(query)
    employee = result.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    query = select(ChurnOutput).where(ChurnOutput.hr_code == employee_id).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()
    
    churn_prob = float(churn_data.resign_proba) if churn_data else 0.0
    
    # Get active treatments
    query = select(TreatmentDefinition).where(TreatmentDefinition.is_active == 1)
    result = await db.execute(query)
    treatments = result.scalars().all()
    
    suggestions = []
    for t in treatments:
        # Simple logic to determine applicability and impact
        base_effect = float(t.base_effect_size) if t.base_effect_size else 0.05
        
        # Adjust effect based on churn probability (higher risk = harder to retain?)
        # Or maybe higher risk = more room for improvement?
        # Let's assume constant effect for now
        
        projected_prob_change = -base_effect * churn_prob # Reduce probability
        new_prob = max(0, churn_prob + projected_prob_change)
        
        # Calculate ROI (simplified)
        cost = float(t.base_cost)
        salary = float(employee.employee_cost) if employee.employee_cost else 50000
        
        # ELTV gain = Salary * 3 years * (Prob_reduction)
        eltv_gain = salary * 3 * abs(projected_prob_change)
        roi_val = (eltv_gain - cost) / cost if cost > 0 else 0
        
        roi_label = "high" if roi_val > 3 else "medium" if roi_val > 1 else "low"
        
        suggestions.append(TreatmentSuggestion(
            id=t.id,
            name=t.name,
            description=t.description,
            cost=cost,
            effectSize=base_effect,
            timeToEffect=t.time_to_effect or "3 months",
            projected_churn_prob_change=projected_prob_change,
            projected_post_eltv=salary * 3 * (1 - new_prob),
            projected_roi=roi_label,
            riskLevels=["High", "Medium"] if base_effect > 0.1 else ["Low", "Medium"],
            explanation=[{"ruleId": "default", "reason": "Standard treatment recommendation"}]
        ))
        
    return suggestions

@router.post("/simulate", response_model=ApplyTreatmentResult)
async def apply_treatment(
    request: ApplyTreatmentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Simulate applying a treatment"""
    
    # Get employee
    query = select(HRDataInput).where(HRDataInput.hr_code == request.employee_id)
    result = await db.execute(query)
    employee = result.scalar_one_or_none()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    # Get treatment
    query = select(TreatmentDefinition).where(TreatmentDefinition.id == request.treatment_id)
    result = await db.execute(query)
    treatment = result.scalar_one_or_none()
    
    if not treatment:
        raise HTTPException(status_code=404, detail="Treatment not found")
        
    # Get current churn
    query = select(ChurnOutput).where(ChurnOutput.hr_code == request.employee_id).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()
    
    current_prob = float(churn_data.resign_proba) if churn_data else 0.0
    effect = float(treatment.base_effect_size) if treatment.base_effect_size else 0.05
    
    new_prob = max(0, current_prob * (1 - effect))
    prob_reduction = current_prob - new_prob
    
    salary = float(employee.employee_cost) if employee.employee_cost else 50000
    current_eltv = salary * 3 * (1 - current_prob)
    new_eltv = salary * 3 * (1 - new_prob)
    eltv_gain = new_eltv - current_eltv
    cost = float(treatment.base_cost)
    
    roi = (eltv_gain - cost) / cost if cost > 0 else 0
    
    return ApplyTreatmentResult(
        employee_id=request.employee_id,
        eltv_pre_treatment=current_eltv,
        eltv_post_treatment=new_eltv,
        treatment_effect_eltv=eltv_gain,
        treatment_cost=cost,
        roi=roi,
        pre_churn_probability=current_prob,
        post_churn_probability=new_prob,
        new_survival_probabilities={
            "12": 1.0 - new_prob,
            "24": (1.0 - new_prob) * 0.9,
            "36": (1.0 - new_prob) * 0.8
        },
        applied_treatment={
            "id": treatment.id,
            "name": treatment.name,
            "cost": cost,
            "effectSize": effect
        }
    )

@router.post("/manual-simulate", response_model=ManualSimulationResponse)
async def manual_simulate(
    request: ManualSimulationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Simulate churn with manual feature changes"""
    
    # In a real scenario, we would run the model prediction with changed features.
    # Here we will use a simplified heuristic or call the model if possible.
    
    # For now, let's use a simple heuristic based on known factors
    # e.g. increasing salary -> lower churn
    # increasing satisfaction -> lower churn
    
    # Get current churn
    query = select(ChurnOutput).where(ChurnOutput.hr_code == request.employee_id).order_by(desc(ChurnOutput.generated_at)).limit(1)
    result = await db.execute(query)
    churn_data = result.scalar_one_or_none()
    
    current_prob = float(churn_data.resign_proba) if churn_data else 0.5
    new_prob = current_prob
    
    changes = request.changed_features
    
    if 'satisfaction_level' in changes:
        # Higher satisfaction reduces churn
        # Assume linear relationship for simplicity
        # If satisfaction increases by 0.1, churn decreases by 0.05
        # We need the original value to know the delta, but we don't have it easily here without fetching employee again
        # Let's assume the client sends the absolute new value.
        # We'll just use the new value to estimate a modifier.
        
        # Actually, to do this properly, we should re-run the model.
        # But we need all features for that.
        pass

    # Mock logic:
    # If satisfaction_level > 0.8, reduce churn by 20%
    # If salary_level becomes 'high', reduce churn by 15%
    
    if changes.get('satisfaction_level', 0) > 0.8:
        new_prob *= 0.8
    if changes.get('salary_level') == 'high':
        new_prob *= 0.85
    if changes.get('promotion_last_5years') == 1:
        new_prob *= 0.9
        
    delta = new_prob - current_prob
    
    risk_level = "High" if new_prob > 0.7 else "Medium" if new_prob > 0.3 else "Low"
    
    return ManualSimulationResponse(
        new_churn_probability=new_prob,
        new_risk_level=risk_level,
        delta=delta
    )
