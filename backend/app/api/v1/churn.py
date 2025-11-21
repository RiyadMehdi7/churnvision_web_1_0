from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import pandas as pd
import io
import time

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.churn_prediction import ChurnPredictionService
from app.core.audit import AuditLogger
from app.schemas.churn import (
    ChurnPredictionRequest,
    ChurnPredictionResponse,
    BatchChurnPredictionRequest,
    BatchChurnPredictionResponse,
    ModelTrainingRequest,
    ModelTrainingResponse,
    ModelMetricsResponse
)

router = APIRouter()

# Initialize churn prediction service (singleton)
churn_service = ChurnPredictionService()


@router.post("/predict", response_model=ChurnPredictionResponse)
async def predict_employee_churn(
    request: ChurnPredictionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict churn probability for a single employee

    Analyzes employee features and returns:
    - Churn probability (0-1)
    - Risk level (low, medium, high, critical)
    - Contributing factors
    - Actionable recommendations
    """
    start_time = time.time()

    try:
        prediction = await churn_service.predict_churn(request)

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Log to audit trail
        await AuditLogger.log_prediction(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            tenant_id=getattr(current_user, 'tenant_id', None),
            employee_id=request.employee_id or "unknown",
            risk_score=prediction.churn_probability,
            risk_level=prediction.risk_level,
            duration_ms=duration_ms
        )

        return prediction

    except Exception as e:
        # Log error to audit trail
        await AuditLogger.log_error(
            db=db,
            action="predict_churn",
            user_id=current_user.id,
            username=current_user.username,
            tenant_id=getattr(current_user, 'tenant_id', None),
            error_message=str(e),
            endpoint="/api/v1/churn/predict",
            status_code=500
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )


@router.post("/predict/batch", response_model=BatchChurnPredictionResponse)
async def predict_batch_churn(
    request: BatchChurnPredictionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Predict churn for multiple employees in batch

    Processes multiple employee predictions and returns:
    - Individual predictions for each employee
    - Aggregated statistics (total, high/medium/low risk counts)
    """
    try:
        predictions = await churn_service.predict_batch(request)
        return predictions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch prediction failed: {str(e)}"
        )


@router.post("/train", response_model=ModelTrainingResponse)
async def train_churn_model(
    file: UploadFile = File(...),
    model_type: str = "xgboost",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Train a new churn prediction model with uploaded data

    Upload a CSV file with the following columns:
    - satisfaction_level (0-1)
    - last_evaluation (0-1)
    - number_project (integer)
    - average_monthly_hours (float)
    - time_spend_company (integer, years)
    - work_accident (0 or 1)
    - promotion_last_5years (0 or 1)
    - department (string)
    - salary_level (low, medium, high)
    - left (0 or 1, target variable)

    Returns model performance metrics and feature importance.
    """
    start_time = time.time()

    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are supported"
            )

        # Read CSV file
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))

        # Validate required columns
        required_columns = [
            'satisfaction_level', 'last_evaluation', 'number_project',
            'average_monthly_hours', 'time_spend_company', 'work_accident',
            'promotion_last_5years', 'department', 'salary_level', 'left'
        ]

        missing_columns = set(required_columns) - set(df.columns)
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required columns: {missing_columns}"
            )

        # Train model
        training_request = ModelTrainingRequest(
            model_type=model_type,
            use_existing_data=False
        )

        result = await churn_service.train_model(training_request, df)

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Log model training to audit trail
        await AuditLogger.log_model_training(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            tenant_id=getattr(current_user, 'tenant_id', None),
            model_type=model_type,
            accuracy=result.accuracy,
            duration_ms=duration_ms,
            samples_count=len(df)
        )

        return result

    except pd.errors.EmptyDataError:
        await AuditLogger.log_error(
            db=db,
            action="train_model",
            user_id=current_user.id,
            username=current_user.username,
            tenant_id=getattr(current_user, 'tenant_id', None),
            error_message="Uploaded CSV file is empty",
            endpoint="/api/v1/churn/train",
            status_code=400
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is empty"
        )
    except Exception as e:
        await AuditLogger.log_error(
            db=db,
            action="train_model",
            user_id=current_user.id,
            username=current_user.username,
            tenant_id=getattr(current_user, 'tenant_id', None),
            error_message=str(e),
            endpoint="/api/v1/churn/train",
            status_code=500
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model training failed: {str(e)}"
        )


@router.get("/model/metrics", response_model=ModelMetricsResponse)
async def get_model_metrics(
    current_user: User = Depends(get_current_user)
):
    """
    Get current model performance metrics and feature importance

    Returns:
    - Model type and ID
    - Performance metrics (accuracy, precision, recall, F1)
    - Feature importance scores
    - Last training date
    - Number of predictions made
    """
    try:
        if churn_service.model is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No trained model available. Please train a model first."
            )

        # Get model info
        model_type = type(churn_service.model).__name__

        # Return cached metrics or defaults
        metrics = churn_service.model_metrics or {
            'accuracy': 0.0,
            'precision': 0.0,
            'recall': 0.0,
            'f1_score': 0.0
        }

        return ModelMetricsResponse(
            model_id="current",
            model_type=model_type,
            accuracy=metrics.get('accuracy', 0.0),
            precision=metrics.get('precision', 0.0),
            recall=metrics.get('recall', 0.0),
            f1_score=metrics.get('f1_score', 0.0),
            last_trained=churn_service.model_metrics.get('trained_at', None) if churn_service.model_metrics else None,
            predictions_made=0,
            feature_importance=churn_service.feature_importance or {}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve model metrics: {str(e)}"
        )


@router.post("/model/reset")
async def reset_model(
    current_user: User = Depends(get_current_user)
):
    """
    Reset to default model

    Reinitializes the churn prediction service with default model parameters.
    Use this if you want to start fresh or the current model has issues.
    """
    try:
        churn_service._initialize_default_model()
        return {
            "status": "success",
            "message": "Model reset to default configuration"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model reset failed: {str(e)}"
        )


@router.get("/health")
async def churn_service_health():
    """
    Health check endpoint for churn prediction service

    Returns service status and model availability.
    """
    return {
        "status": "healthy",
        "service": "churn-prediction",
        "model_loaded": churn_service.model is not None,
        "model_type": type(churn_service.model).__name__ if churn_service.model else "None"
    }
