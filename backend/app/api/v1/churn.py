import io
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db

logger = logging.getLogger("churnvision")
from app.core.audit import AuditLogger
from app.models.dataset import Dataset as DatasetModel
from app.models.churn import ChurnModel, ChurnOutput, ChurnReasoning
from app.models.hr_data import HRDataInput
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


async def _load_active_dataset_with_mapping(db: AsyncSession) -> tuple[pd.DataFrame, Optional[Dict[str, Any]], DatasetModel]:
    """Load the active dataset CSV and return it with any stored column mapping."""
    dataset = await _get_active_dataset_for_project(db)
    mapping = dataset.column_mapping
    df = pd.read_csv(dataset.file_path)
    return df, mapping, dataset


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
        dataset_used: Optional[DatasetModel] = None
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
            # Best effort: tie to active dataset if one exists
            try:
                dataset_used = await _get_active_dataset_for_project(db)
            except HTTPException:
                dataset_used = None
        else:
            df, mapping, dataset_used = await _load_active_dataset_with_mapping(db)

        # Build feature frame using mapping/enrichment so any dataset with the DM-required columns can train
        df_features = _build_training_frame(df, mapping)

        # Train model
        training_request = ModelTrainingRequest(
            model_type=model_type,
            use_existing_data=False
        )

        result = await churn_service.train_model(training_request, df_features)

        # Persist model metadata and mark active
        model_version = result.model_id
        await db.execute(
            update(ChurnModel).values(is_active=0)
        )
        db.add(ChurnModel(
            model_name=model_type,
            model_version=model_version,
            dataset_id=dataset_used.dataset_id if dataset_used else None,
            parameters=training_request.hyperparameters or {},
            training_data_info=f"rows={len(df_features)}",
            performance_metrics=None,
            metrics={
                "accuracy": result.accuracy,
                "precision": result.precision,
                "recall": result.recall,
                "f1_score": result.f1_score,
            },
            artifact_path=str(churn_service.model_path),
            scaler_path=str(churn_service.scaler_path),
            encoders_path=str(churn_service.encoders_path),
            trained_at=result.trained_at,
            is_active=1,
            pipeline_generated=1,
        ))
        await db.commit()

        # Cache metrics so status checks reflect the trained model
        churn_service.model_metrics = {
            "accuracy": result.accuracy,
            "precision": result.precision,
            "recall": result.recall,
            "f1_score": result.f1_score,
            "trained_at": result.trained_at,
            "model_version": model_version,
            "predictions_made": 0,
        }
        churn_service.feature_importance = result.feature_importance

        logger.info(f"[TRAINING] Model training complete. Accuracy: {result.accuracy:.2%}")

        # === AUTO-GENERATE PREDICTIONS AND REASONING FOR ALL EMPLOYEES ===
        logger.info("[TRAINING] Starting prediction generation for all employees...")
        predictions_made = 0
        reasoning_made = 0

        # Apply column mapping to get hr_code
        if mapping and isinstance(mapping, dict):
            id_col = mapping.get("identifier")
            if id_col and id_col in df.columns:
                df = df.rename(columns={id_col: "hr_code"})

        if "hr_code" in df.columns and dataset_used:
            total_employees = len(df)
            for idx, row in df.iterrows():
                hr_code = str(row.get("hr_code", ""))
                if not hr_code:
                    continue

                try:
                    # Build prediction request from row features
                    features = df_features.iloc[idx].to_dict() if idx < len(df_features) else {}

                    # Create prediction request with nested features
                    from app.schemas.churn import EmployeeChurnFeatures
                    employee_features = EmployeeChurnFeatures(
                        satisfaction_level=float(features.get("satisfaction_level", 0.5)),
                        last_evaluation=float(features.get("last_evaluation", 0.5)),
                        number_project=int(float(features.get("number_project", 3))),
                        average_monthly_hours=float(features.get("average_monthly_hours", 160)),
                        time_spend_company=int(float(features.get("time_spend_company", 3))),
                        work_accident=bool(int(float(features.get("work_accident", 0)))),
                        promotion_last_5years=bool(int(float(features.get("promotion_last_5years", 0)))),
                        department=str(features.get("department", "general")),
                        salary_level=str(features.get("salary_level", "medium")),
                    )
                    pred_request = ChurnPredictionRequest(
                        employee_id=None,
                        features=employee_features,
                    )

                    # Get prediction
                    prediction = await churn_service.predict_churn(pred_request)

                    # Build SHAP values dict from contributing factors
                    shap_dict = {}
                    if prediction.contributing_factors:
                        for factor in prediction.contributing_factors:
                            feature_name = factor.get("feature", "unknown")
                            impact_value = factor.get("impact", 0)
                            shap_dict[feature_name] = impact_value

                    # Upsert into churn_output
                    existing = await db.execute(
                        select(ChurnOutput).where(
                            ChurnOutput.hr_code == hr_code,
                            ChurnOutput.dataset_id == dataset_used.dataset_id
                        )
                    )
                    existing_row = existing.scalar_one_or_none()

                    if existing_row:
                        existing_row.resign_proba = prediction.churn_probability
                        existing_row.shap_values = shap_dict
                        existing_row.model_version = model_version
                        existing_row.generated_at = datetime.utcnow()
                        existing_row.confidence_score = getattr(prediction, 'confidence_score', None) or 70.0
                    else:
                        db.add(ChurnOutput(
                            hr_code=hr_code,
                            dataset_id=dataset_used.dataset_id,
                            resign_proba=prediction.churn_probability,
                            shap_values=shap_dict,
                            model_version=model_version,
                            confidence_score=getattr(prediction, 'confidence_score', None) or 70.0,
                        ))
                    predictions_made += 1

                    # Upsert into churn_reasoning
                    stage = _determine_stage(float(features.get("time_spend_company", 3)))

                    # Build reasoning text from factors
                    reasoning_parts = []
                    if prediction.contributing_factors:
                        for factor in prediction.contributing_factors[:3]:
                            feature_name = factor.get("feature", "unknown")
                            description = factor.get("description", factor.get("impact", ""))
                            reasoning_parts.append(f"{feature_name}: {description}")
                    reasoning_text = "; ".join(reasoning_parts) if reasoning_parts else "No significant factors identified."

                    # Build recommendations
                    recommendations = "; ".join(prediction.recommendations[:3]) if prediction.recommendations else ""

                    # Build ml_contributors as list of dicts (not JSON string)
                    ml_contributors_list = []
                    if prediction.contributing_factors:
                        for factor in prediction.contributing_factors:
                            ml_contributors_list.append({
                                "feature": factor.get("feature", "unknown"),
                                "value": factor.get("value"),
                                "importance": factor.get("impact", 0) if isinstance(factor.get("impact"), (int, float)) else 0.5,
                                "message": factor.get("message", "")
                            })

                    existing_reasoning = await db.execute(
                        select(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code)
                    )
                    existing_reasoning_row = existing_reasoning.scalar_one_or_none()

                    # Serialize lists to JSON strings for Text columns
                    ml_contributors_json = json.dumps(ml_contributors_list) if ml_contributors_list else "[]"
                    heuristic_alerts_json = "[]"

                    if existing_reasoning_row:
                        existing_reasoning_row.churn_risk = prediction.churn_probability
                        existing_reasoning_row.stage = stage
                        existing_reasoning_row.stage_score = 0.5  # Default stage score
                        existing_reasoning_row.ml_score = prediction.churn_probability
                        existing_reasoning_row.heuristic_score = 0.0
                        existing_reasoning_row.ml_contributors = ml_contributors_json
                        existing_reasoning_row.heuristic_alerts = heuristic_alerts_json
                        existing_reasoning_row.reasoning = reasoning_text
                        existing_reasoning_row.recommendations = recommendations
                        existing_reasoning_row.confidence_level = getattr(prediction, 'confidence_score', None) or 0.7
                    else:
                        db.add(ChurnReasoning(
                            hr_code=hr_code,
                            churn_risk=prediction.churn_probability,
                            stage=stage,
                            stage_score=0.5,
                            ml_score=prediction.churn_probability,
                            heuristic_score=0.0,
                            ml_contributors=ml_contributors_json,
                            heuristic_alerts=heuristic_alerts_json,
                            reasoning=reasoning_text,
                            recommendations=recommendations,
                            confidence_level=getattr(prediction, 'confidence_score', None) or 0.7,
                        ))
                    reasoning_made += 1

                    # Log progress every 50 employees
                    if predictions_made % 50 == 0:
                        logger.info(f"[TRAINING] Progress: {predictions_made}/{total_employees} predictions generated")

                except Exception as e:
                    logger.warning(f"[TRAINING] Error predicting for {hr_code}: {e}")
                    continue

            await db.commit()
            logger.info(f"[TRAINING] Completed: {predictions_made} predictions, {reasoning_made} reasoning records generated")

        # Update predictions count
        churn_service.model_metrics["predictions_made"] = predictions_made

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

        logger.info(f"[TRAINING] Total time: {duration_ms}ms")

        # Return shape expected by frontend (success/status)
        return {
            "success": True,
            "status": "complete",
            "metrics": result,
            "predictions_generated": predictions_made,
            "reasoning_generated": reasoning_made
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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
        model_type = type(churn_service.model).__name__ if churn_service.model else "xgboost"

        # Return cached metrics or load from database
        metrics = churn_service.model_metrics or {}

        # If no cached metrics, try to load from database
        if not metrics or not metrics.get('trained_at'):
            # Query the active model from database
            result = await db.execute(
                select(ChurnModel).where(ChurnModel.is_active == 1).order_by(ChurnModel.trained_at.desc()).limit(1)
            )
            active_model = result.scalar_one_or_none()

            if active_model:
                # Load metrics from database
                db_metrics = active_model.performance_metrics or active_model.metrics or {}
                metrics = {
                    'accuracy': db_metrics.get('accuracy', 0.0),
                    'precision': db_metrics.get('precision', 0.0),
                    'recall': db_metrics.get('recall', 0.0),
                    'f1_score': db_metrics.get('f1_score', 0.0),
                    'trained_at': active_model.trained_at,
                    'model_version': active_model.model_version,
                    'predictions_made': 0,
                }
                # Cache for future requests
                churn_service.model_metrics = metrics
                churn_service.feature_importance = db_metrics.get('feature_importance', {})
                model_type = active_model.model_name or "xgboost"

        if not metrics or not metrics.get('trained_at'):
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


@router.post("/predict/all")
async def predict_all_employees(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Run churn predictions for all employees in the active dataset and save results.

    This endpoint:
    1. Loads all employees from the active dataset
    2. Runs the trained model on each employee
    3. Saves predictions to churn_output table
    4. Generates reasoning and saves to churn_reasoning table

    Returns count of predictions made.
    """
    start_time = time.time()

    if not churn_service.model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model not trained. Please train the model first."
        )

    try:
        # Get active dataset
        dataset = await _get_active_dataset_for_project(db)
        df, mapping, _ = await _load_active_dataset_with_mapping(db)

        # Apply column mapping to get hr_code
        if mapping and isinstance(mapping, dict):
            id_col = mapping.get("identifier")
            if id_col and id_col in df.columns:
                df = df.rename(columns={id_col: "hr_code"})

        if "hr_code" not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset missing hr_code/identifier column"
            )

        # Build feature frame for predictions
        df_features = _build_training_frame(df, mapping)

        # Get model version
        model_version = churn_service.model_metrics.get("model_version", "unknown") if churn_service.model_metrics else "unknown"

        predictions_made = 0
        reasoning_made = 0

        for idx, row in df.iterrows():
            hr_code = str(row.get("hr_code", ""))
            if not hr_code:
                continue

            try:
                # Build prediction request from row features
                features = df_features.iloc[idx].to_dict() if idx < len(df_features) else {}

                # Create prediction request with nested features
                from app.schemas.churn import EmployeeChurnFeatures
                employee_features = EmployeeChurnFeatures(
                    satisfaction_level=float(features.get("satisfaction_level", 0.5)),
                    last_evaluation=float(features.get("last_evaluation", 0.5)),
                    number_project=int(float(features.get("number_project", 3))),
                    average_monthly_hours=float(features.get("average_monthly_hours", 160)),
                    time_spend_company=int(float(features.get("time_spend_company", 3))),
                    work_accident=bool(int(float(features.get("work_accident", 0)))),
                    promotion_last_5years=bool(int(float(features.get("promotion_last_5years", 0)))),
                    department=str(features.get("department", "general")),
                    salary_level=str(features.get("salary_level", "medium")),
                )
                pred_request = ChurnPredictionRequest(
                    employee_id=None,  # employee_id is Optional[int]
                    features=employee_features,
                )

                # Get prediction
                prediction = await churn_service.predict_churn(pred_request)

                # Build SHAP values dict from contributing factors
                shap_dict = {}
                if prediction.contributing_factors:
                    for factor in prediction.contributing_factors:
                        # contributing_factors is List[Dict[str, Any]]
                        feature_name = factor.get("feature", "unknown")
                        impact_value = factor.get("impact", 0)
                        shap_dict[feature_name] = impact_value

                # Upsert into churn_output
                existing = await db.execute(
                    select(ChurnOutput).where(
                        ChurnOutput.hr_code == hr_code,
                        ChurnOutput.dataset_id == dataset.dataset_id
                    )
                )
                existing_row = existing.scalar_one_or_none()

                if existing_row:
                    existing_row.resign_proba = prediction.churn_probability
                    existing_row.shap_values = shap_dict
                    existing_row.model_version = model_version
                    existing_row.generated_at = datetime.utcnow()
                    existing_row.confidence_score = getattr(prediction, 'confidence_score', None) or 70.0
                else:
                    db.add(ChurnOutput(
                        hr_code=hr_code,
                        dataset_id=dataset.dataset_id,
                        resign_proba=prediction.churn_probability,
                        shap_values=shap_dict,
                        model_version=model_version,
                        confidence_score=getattr(prediction, 'confidence_score', None) or 70.0,
                    ))
                predictions_made += 1

                # Upsert into churn_reasoning
                stage = _determine_stage(float(features.get("time_spend_company", 3)))

                # Build reasoning text from factors
                reasoning_parts = []
                if prediction.contributing_factors:
                    for factor in prediction.contributing_factors[:3]:
                        # contributing_factors is List[Dict[str, Any]]
                        feature_name = factor.get("feature", "unknown")
                        description = factor.get("description", factor.get("impact", ""))
                        reasoning_parts.append(f"{feature_name}: {description}")
                reasoning_text = "; ".join(reasoning_parts) if reasoning_parts else "No significant factors identified."

                # Build recommendations
                recommendations = "; ".join(prediction.recommendations[:3]) if prediction.recommendations else ""

                existing_reasoning = await db.execute(
                    select(ChurnReasoning).where(ChurnReasoning.hr_code == hr_code)
                )
                existing_reasoning_row = existing_reasoning.scalar_one_or_none()

                if existing_reasoning_row:
                    existing_reasoning_row.churn_risk = prediction.churn_probability
                    existing_reasoning_row.stage = stage
                    existing_reasoning_row.ml_score = prediction.churn_probability
                    existing_reasoning_row.ml_contributors = json.dumps(shap_dict) if shap_dict else None
                    existing_reasoning_row.reasoning = reasoning_text
                    existing_reasoning_row.recommendations = recommendations
                    existing_reasoning_row.confidence_level = getattr(prediction, 'confidence_score', None) or 70.0
                else:
                    db.add(ChurnReasoning(
                        hr_code=hr_code,
                        churn_risk=prediction.churn_probability,
                        stage=stage,
                        ml_score=prediction.churn_probability,
                        heuristic_score=0.0,
                        ml_contributors=json.dumps(shap_dict) if shap_dict else None,
                        reasoning=reasoning_text,
                        recommendations=recommendations,
                        confidence_level=getattr(prediction, 'confidence_score', None) or 70.0,
                    ))
                reasoning_made += 1

            except Exception as e:
                # Log but continue with other employees
                print(f"Error predicting for {hr_code}: {e}")
                continue

        await db.commit()

        duration_ms = int((time.time() - start_time) * 1000)

        return {
            "status": "success",
            "predictions_made": predictions_made,
            "reasoning_generated": reasoning_made,
            "dataset_id": dataset.dataset_id,
            "duration_ms": duration_ms
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate predictions: {str(e)}"
        )


def _determine_stage(tenure: float) -> str:
    """Determine behavioral stage based on tenure."""
    if tenure < 1:
        return "Onboarding"
    elif tenure < 2:
        return "Growth"
    elif tenure < 4:
        return "Established"
    elif tenure < 7:
        return "Senior"
    else:
        return "Veteran"
