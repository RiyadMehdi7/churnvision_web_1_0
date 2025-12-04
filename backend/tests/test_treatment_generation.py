import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.treatment_generation_service import TreatmentGenerationService
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning

@pytest.mark.asyncio
async def test_generate_personalized_treatments():
    # Mock dependencies
    mock_db = AsyncMock()
    
    # Mock ChatbotService
    mock_chatbot_service = AsyncMock()
    mock_chatbot_service.generate_response.return_value = """
    [
        {
            "name": "Retention Bonus",
            "type": "material",
            "description": "A one-time bonus.",
            "estimated_cost": 5000,
            "implementation_timeline": "Immediate",
            "expected_impact": "High"
        },
        {
            "name": "Mentorship",
            "type": "non-material",
            "description": "Pair with a senior mentor.",
            "estimated_cost": 0,
            "implementation_timeline": "1 month",
            "expected_impact": "Medium"
        }
    ]
    """
    
    # Initialize service with mocks
    service = TreatmentGenerationService(mock_db)
    service.chatbot_service = mock_chatbot_service
    
    # Mock DB results
    mock_employee = HRDataInput(
        hr_code="EMP001",
        full_name="John Doe",
        position="Developer",
        structure_name="Engineering",
        tenure=2.5,
        employee_cost=80000
    )
    
    mock_churn = ChurnOutput(
        hr_code="EMP001",
        resign_proba=0.8
    )
    
    mock_reasoning = ChurnReasoning(
        hr_code="EMP001",
        reasoning="High risk due to low salary.",
        ml_contributors='[{"feature": "salary", "importance": 0.5}]'
    )
    
    # Mock internal helper methods to avoid complex DB mocking
    service._get_employee_data = AsyncMock(return_value=mock_employee)
    service._get_churn_data = AsyncMock(return_value=mock_churn)
    service._get_churn_reasoning = AsyncMock(return_value=mock_reasoning)
    
    # Run method
    treatments = await service.generate_personalized_treatments("EMP001")
    
    # Verify results
    assert len(treatments) == 2
    assert treatments[0]["name"] == "Retention Bonus"
    assert treatments[0]["type"] == "material"
    assert treatments[1]["name"] == "Mentorship"
    assert treatments[1]["type"] == "non-material"
    
    # Verify LLM was called
    mock_chatbot_service.generate_response.assert_called_once()
    call_args = mock_chatbot_service.generate_response.call_args
    assert "John Doe" in call_args.kwargs['messages'][1]['content']
    assert "0.80" in call_args.kwargs['messages'][1]['content']

@pytest.mark.asyncio
async def test_generate_personalized_treatments_json_error():
    # Mock dependencies
    mock_db = AsyncMock()
    
    # Mock ChatbotService to return invalid JSON
    mock_chatbot_service = AsyncMock()
    mock_chatbot_service.generate_response.return_value = "This is not JSON"
    
    # Initialize service with mocks
    service = TreatmentGenerationService(mock_db)
    service.chatbot_service = mock_chatbot_service
    
    # Mock internal helper methods
    service._get_employee_data = AsyncMock(return_value=HRDataInput(hr_code="EMP001", full_name="John"))
    service._get_churn_data = AsyncMock(return_value=None)
    service._get_churn_reasoning = AsyncMock(return_value=None)
    
    # Run method
    treatments = await service.generate_personalized_treatments("EMP001")
    
    # Verify fallback
    assert len(treatments) == 1
    assert treatments[0]["name"] == "Stay Interview"
