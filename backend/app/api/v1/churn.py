import io
import json
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.audit import AuditLogger
from app.models.dataset import Dataset as DatasetModel
from app.models.user import User
from app.schemas.churn import (
    ChurnPredictionRequest,
    ChurnPredictionResponse,
    BatchChurnPredictionRequest,
    BatchChurnPredictionResponse,
    ModelTrainingRequest,
    ModelTrainingResponse,
    ModelMetricsResponse,
)
from app.services.churn_prediction import ChurnPredictionService
from app.services.project_service import get_active_project, ensure_default_project

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


async def _get_active_dataset_for_project(db: AsyncSession) -> DatasetModel:
    """Return the active dataset row for the active project."""
    await ensure_default_project(db)
    active_project = await get_active_project(db)
    dataset = await db.scalar(
        select(DatasetModel).where(
            DatasetModel.project_id == active_project.id,
            DatasetModel.is_active == 1,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active dataset for project")

    if not dataset.file_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active dataset missing file path")

    if not Path(dataset.file_path).exists():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active dataset file not found on disk")

    return dataset


async def _load_active_dataset_with_mapping(db: AsyncSession) -> tuple[pd.DataFrame, Optional[Dict[str, Any]]]:
    """Load the active dataset CSV and return it with any stored column mapping."""
    dataset = await _get_active_dataset_for_project(db)
    mapping = dataset.column_mapping
    df = pd.read_csv(dataset.file_path)
    return df, mapping


def _normalize_value(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _build_training_frame(df: pd.DataFrame, mapping: Optional[Dict[str, Any]]) -> pd.DataFrame:
    """
    Convert arbitrary HR dataset into the feature set expected by the churn model.
    Uses Data Management column mapping when provided; otherwise falls back to best-effort defaults.
    """

    # Apply column mapping to create canonical columns
    canonical_map = {
        "identifier": "hr_code",
        "name": "full_name",
        "department": "department",
        "position": "position",
        "cost": "employee_cost",
        "status": "status",
        "manager_id": "manager_id",
        "tenure": "tenure",
        "termination_date": "termination_date",
        "performance_rating_latest": "performance_rating_latest",
    }

    if mapping and isinstance(mapping, dict):
        for key, canonical in canonical_map.items():
            mapped_col = mapping.get(key)
            if mapped_col and mapped_col in df.columns and canonical not in df.columns:
                df = df.rename(columns={mapped_col: canonical})

    # Derive feature columns expected by churn model
    # satisfaction_level: use performance_rating_latest if available (scale 0-5 -> 0-1)
    if "performance_rating_latest" in df.columns:
        df["satisfaction_level"] = df["performance_rating_latest"].apply(lambda v: min(max(_normalize_value(v) / 5.0, 0), 1))
    else:
        df["satisfaction_level"] = 0.5

    # last_evaluation: mirror satisfaction_level unless a better column exists
    df["last_evaluation"] = df.get("satisfaction_level", pd.Series([0.5] * len(df)))

    # number_project: fall back to 3 if missing
    df["number_project"] = 3

    # average_monthly_hours: fall back to 160 if missing
    df["average_monthly_hours"] = 160

    # time_spend_company: use tenure if present, else 3
    if "tenure" in df.columns:
        df["time_spend_company"] = df["tenure"].apply(_normalize_value)
    else:
        df["time_spend_company"] = 3

    # work_accident and promotion_last_5years: default to 0
    df["work_accident"] = 0
    df["promotion_last_5years"] = 0

    # department: use mapped department if present, else placeholder
    if "department" in df.columns:
        df["department"] = df["department"].fillna("unknown")
    else:
        df["department"] = "general"

    # salary_level: derive from employee_cost quantiles if available, else medium
    if "employee_cost" in df.columns:
        cost_series = df["employee_cost"].apply(_normalize_value)
        if len(cost_series) > 0:
            thresholds = np.quantile(cost_series, [0.33, 0.66])

            def bucket(cost: float) -> str:
                if cost <= thresholds[0]:
                    return "low"
                if cost <= thresholds[1]:
                    return "medium"
                return "high"

            df["salary_level"] = cost_series.apply(bucket)
        else:
            df["salary_level"] = "medium"
    else:
        df["salary_level"] = "medium"

    # left: derive from status if available, else 0
    if "status" in df.columns:
        def status_to_left(val: Any) -> int:
            sval = str(val).strip().lower()
            if any(k in sval for k in ["resign", "terminated", "left", "inactive", "exit"]):
                return 1
            return 0
        df["left"] = df["status"].apply(status_to_left)
    else:
        df["left"] = 0

    # Ensure required columns exist
    required_columns = [
        'satisfaction_level', 'last_evaluation', 'number_project',
        'average_monthly_hours', 'time_spend_company', 'work_accident',
        'promotion_last_5years', 'department', 'salary_level', 'left'
    ]

    missing_after_enrichment = [c for c in required_columns if c not in df.columns]
    if missing_after_enrichment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to build training features, missing: {missing_after_enrichment}"
        )

    return df[required_columns]


@router.post("/train")
async def train_churn_model(
    file: UploadFile | None = File(None),
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
        # Determine data source: uploaded file takes precedence, otherwise use active dataset + mapping
        if file is not None:
            if not file.filename.endswith('.csv'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only CSV files are supported"
                )
            contents = await file.read()
            df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
            mapping = None
        else:
            df, mapping = await _load_active_dataset_with_mapping(db)

        # Build feature frame using mapping/enrichment so any dataset with the DM-required columns can train
        df_features = _build_training_frame(df, mapping)

        # Train model
        training_request = ModelTrainingRequest(
            model_type=model_type,
            use_existing_data=False
        )

        result = await churn_service.train_model(training_request, df_features)

        # Cache metrics so status checks reflect the trained model
        churn_service.model_metrics = {
            "accuracy": result.accuracy,
            "precision": result.precision,
            "recall": result.recall,
            "f1_score": result.f1_score,
            "trained_at": result.trained_at,
            "predictions_made": 0,
        }
        churn_service.feature_importance = result.feature_importance

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
            samples_count=len(df_features)
        )

        # Return shape expected by frontend (success/status)
        return {
            "success": True,
            "status": "complete",
            "metrics": result
        }

    except HTTPException as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail))
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
            detail=f"Training failed: {str(e)}"
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
        model_type = type(churn_service.model).__name__ if churn_service.model else "untrained"

        # Return cached metrics or safe defaults
        metrics = churn_service.model_metrics or {}

        if not churn_service.model or not metrics or not metrics.get('trained_at'):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not trained")

        return ModelMetricsResponse(
            model_id="current",
            model_type=model_type,
            accuracy=metrics.get('accuracy', 0.0),
            precision=metrics.get('precision', 0.0),
            recall=metrics.get('recall', 0.0),
            f1_score=metrics.get('f1_score', 0.0),
            last_trained=metrics.get('trained_at'),
            predictions_made=metrics.get('predictions_made', 0),
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
