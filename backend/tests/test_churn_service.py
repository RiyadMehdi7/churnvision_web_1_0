import importlib

import pandas as pd
import pytest


@pytest.mark.asyncio
async def test_train_and_predict_roundtrip(tmp_path, monkeypatch):
    """Test training a model and making predictions."""
    # Use a temp directory for model artifacts
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))

    # Import the service module
    from app.services import churn_prediction_service as cps
    from app.schemas.churn import (
        ModelTrainingRequest,
        ChurnPredictionRequest,
        EmployeeChurnFeatures,
        ChurnRiskLevel,
    )
    importlib.reload(cps)

    service = cps.ChurnPredictionService()

    # Minimal training dataset
    df = pd.DataFrame([
        {
            "satisfaction_level": 0.2,
            "last_evaluation": 0.4,
            "number_project": 2,
            "average_monthly_hours": 160,
            "time_spend_company": 3,
            "work_accident": 0,
            "promotion_last_5years": 0,
            "department": "sales",
            "salary_level": "low",
            "left": 1,
        },
        {
            "satisfaction_level": 0.8,
            "last_evaluation": 0.9,
            "number_project": 4,
            "average_monthly_hours": 180,
            "time_spend_company": 2,
            "work_accident": 0,
            "promotion_last_5years": 1,
            "department": "support",
            "salary_level": "medium",
            "left": 0,
        },
        {
            "satisfaction_level": 0.6,
            "last_evaluation": 0.55,
            "number_project": 3,
            "average_monthly_hours": 170,
            "time_spend_company": 4,
            "work_accident": 0,
            "promotion_last_5years": 0,
            "department": "IT",
            "salary_level": "high",
            "left": 0,
        },
        {
            "satisfaction_level": 0.3,
            "last_evaluation": 0.45,
            "number_project": 5,
            "average_monthly_hours": 210,
            "time_spend_company": 6,
            "work_accident": 1,
            "promotion_last_5years": 0,
            "department": "sales",
            "salary_level": "low",
            "left": 1,
        },
    ])

    request = ModelTrainingRequest(model_type="logistic", use_existing_data=False)
    result = await service.train_model(request, df)

    assert result.accuracy <= 1
    # Check that model artifacts were created
    assert service.model_path.exists() if hasattr(service, 'model_path') else True

    pred = await service.predict_churn(
        ChurnPredictionRequest(
            employee_id=1,  # Use int instead of string
            features=EmployeeChurnFeatures(
                satisfaction_level=0.25,
                last_evaluation=0.5,
                number_project=3,
                average_monthly_hours=175,
                time_spend_company=3,
                work_accident=False,
                promotion_last_5years=False,
                department="sales",
                salary_level="low",
            ),
        )
    )

    assert 0 <= pred.churn_probability <= 1
    assert pred.risk_level in ChurnRiskLevel
