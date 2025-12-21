import asyncio
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
from app.db.session import AsyncSessionLocal
from app.core.security_utils import sanitize_error_message

logger = logging.getLogger("churnvision")
from app.core.audit import AuditLogger
from app.models.dataset import Dataset as DatasetModel
from app.models.churn import ChurnModel, ChurnOutput, ChurnReasoning, TrainingJob
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
    DatasetProfileResponse,
    ModelRoutingResponse,
    RoutingInfoResponse,
)
from app.services.churn_prediction_service import ChurnPredictionService
from app.services.dataset_service import get_active_dataset, get_active_dataset_id

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
        dataset = await get_active_dataset(db)
        prediction = await churn_service.predict_churn(request, dataset.dataset_id)

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
            detail=sanitize_error_message(e, "prediction"),
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
        dataset = await get_active_dataset(db)
        predictions = await churn_service.predict_batch(request, dataset.dataset_id)
        return predictions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "batch prediction"),
        )


async def _load_active_dataset_with_mapping(db: AsyncSession) -> tuple[pd.DataFrame, Optional[Dict[str, Any]], DatasetModel]:
    """Load the active dataset CSV and return it with any stored column mapping."""
    dataset = await get_active_dataset(db)
    mapping = dataset.column_mapping
    df = pd.read_csv(dataset.file_path)
    return df, mapping, dataset


def _normalize_value(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


async def _start_training_job(db: AsyncSession, dataset_id: str) -> TrainingJob:
    job = TrainingJob(dataset_id=dataset_id, status="in_progress")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def _complete_training_job(db: AsyncSession, job: TrainingJob, status: str = "complete", error_message: Optional[str] = None):
    await db.execute(
        update(TrainingJob)
        .where(TrainingJob.job_id == job.job_id)
        .values(status=status, finished_at=datetime.utcnow(), error_message=error_message)
    )
    await db.commit()


def _parse_additional_data_column(raw: Any) -> Dict[str, Any]:
    """Parse additional_data JSON field from a single row."""
    import json as json_module
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json_module.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except:
            return {}
    return {}


def _build_training_frame(df: pd.DataFrame, mapping: Optional[Dict[str, Any]]) -> pd.DataFrame:
    """
    Convert HR dataset into the feature set expected by the churn model.

    Data Model (HRDataInput):
    -------------------------
    REQUIRED direct columns (nullable=False):
      - hr_code: Employee identifier
      - full_name: Employee name
      - structure_name: Department/structure → maps to ML feature 'department'
      - position: Job position
      - status: Employment status → maps to ML target 'left'
      - tenure: Years at company → maps to ML feature 'time_spend_company'

    OPTIONAL direct columns (nullable=True):
      - employee_cost: Salary/cost → maps to ML feature 'salary_level'
      - termination_date: Date of departure
      - manager_id: Manager identifier

    OPTIONAL JSON field (additional_data):
      All other ML features come from this JSON field:
      - job_satisfaction → satisfaction_level
      - performance_rating / last_evaluation → last_evaluation
      - number_project / num_projects → number_project
      - average_monthly_hours / overtime → average_monthly_hours
      - work_accident → work_accident
      - years_since_last_promotion → promotion_last_5years

    Returns DataFrame with ML features and data_quality_score per row.
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

    # === PARSE additional_data JSON if present ===
    # This column contains user-provided optional fields
    if "additional_data" in df.columns:
        parsed_additional = df["additional_data"].apply(_parse_additional_data_column)

        # Extract known fields from additional_data
        additional_field_mappings = {
            # Satisfaction/engagement fields
            "job_satisfaction": ["job_satisfaction", "satisfaction", "engagement_score"],
            "work_life_balance": ["work_life_balance", "worklife_balance"],
            "environment_satisfaction": ["environment_satisfaction", "env_satisfaction"],
            "relationship_satisfaction": ["relationship_satisfaction", "rel_satisfaction"],
            # Performance fields
            "performance_rating": ["performance_rating_latest", "performance_rating", "last_evaluation", "perf_rating"],
            # Workload fields
            "average_monthly_hours": ["average_monthly_hours", "avg_monthly_hours", "monthly_hours"],
            "number_project": ["number_project", "num_projects", "project_count"],
            "overtime": ["overtime", "over_time"],
            # Career fields
            "years_since_last_promotion": ["years_since_last_promotion", "years_no_promotion"],
            "years_in_current_role": ["years_in_current_role", "years_current_role"],
            "training_times_last_year": ["training_times_last_year", "training_count"],
            # Other
            "work_accident": ["work_accident", "accident"],
        }

        for target_col, source_keys in additional_field_mappings.items():
            if target_col not in df.columns:
                def extract_field(add_data, keys=source_keys):
                    if not isinstance(add_data, dict):
                        return None
                    for key in keys:
                        if key in add_data and add_data[key] is not None:
                            return add_data[key]
                    return None
                extracted = parsed_additional.apply(extract_field)
                if extracted.notna().any():
                    df[target_col] = extracted

    # === Track data quality (which features are real vs defaulted) ===
    features_from_data = []
    features_defaulted = []

    # satisfaction_level: use job_satisfaction or performance_rating if available
    if "job_satisfaction" in df.columns and df["job_satisfaction"].notna().sum() > 0:
        # job_satisfaction typically 1-4 scale -> normalize to 0-1
        df["satisfaction_level"] = df["job_satisfaction"].apply(
            lambda v: min(max(_normalize_value(v) / 4.0, 0), 1) if pd.notna(v) else 0.5
        )
        features_from_data.append("satisfaction_level")
    elif "performance_rating" in df.columns and df["performance_rating"].notna().sum() > 0:
        df["satisfaction_level"] = df["performance_rating"].apply(
            lambda v: min(max(_normalize_value(v) / 5.0, 0), 1) if pd.notna(v) else 0.5
        )
        features_from_data.append("satisfaction_level")
    elif "performance_rating_latest" in df.columns and df["performance_rating_latest"].notna().sum() > 0:
        df["satisfaction_level"] = df["performance_rating_latest"].apply(
            lambda v: min(max(_normalize_value(v) / 5.0, 0), 1) if pd.notna(v) else 0.5
        )
        features_from_data.append("satisfaction_level")
    else:
        df["satisfaction_level"] = 0.5
        features_defaulted.append("satisfaction_level")

    # last_evaluation: use performance rating or mirror satisfaction
    if "performance_rating" in df.columns and df["performance_rating"].notna().sum() > 0:
        df["last_evaluation"] = df["performance_rating"].apply(
            lambda v: min(max(_normalize_value(v) / 5.0, 0), 1) if pd.notna(v) else 0.5
        )
        features_from_data.append("last_evaluation")
    else:
        df["last_evaluation"] = df["satisfaction_level"]
        if "satisfaction_level" in features_defaulted:
            features_defaulted.append("last_evaluation")
        else:
            features_from_data.append("last_evaluation")

    # number_project
    if "number_project" in df.columns and df["number_project"].notna().sum() > 0:
        df["number_project"] = df["number_project"].apply(lambda v: int(_normalize_value(v)) if pd.notna(v) else 3)
        features_from_data.append("number_project")
    else:
        df["number_project"] = 3
        features_defaulted.append("number_project")

    # average_monthly_hours
    if "average_monthly_hours" in df.columns and df["average_monthly_hours"].notna().sum() > 0:
        df["average_monthly_hours"] = df["average_monthly_hours"].apply(
            lambda v: _normalize_value(v) if pd.notna(v) else 160
        )
        features_from_data.append("average_monthly_hours")
    elif "overtime" in df.columns:
        # Derive from overtime flag: overtime=Yes -> 220 hours, No -> 160
        df["average_monthly_hours"] = df["overtime"].apply(
            lambda v: 220 if str(v).lower() in ["yes", "1", "true"] else 160
        )
        features_from_data.append("average_monthly_hours")
    else:
        df["average_monthly_hours"] = 160
        features_defaulted.append("average_monthly_hours")

    # time_spend_company (tenure)
    if "tenure" in df.columns and df["tenure"].notna().sum() > 0:
        df["time_spend_company"] = df["tenure"].apply(_normalize_value)
        features_from_data.append("time_spend_company")
    else:
        df["time_spend_company"] = 3
        features_defaulted.append("time_spend_company")

    # work_accident
    if "work_accident" in df.columns and df["work_accident"].notna().sum() > 0:
        df["work_accident"] = df["work_accident"].apply(
            lambda v: 1 if str(v).lower() in ["yes", "1", "true"] else 0
        )
        features_from_data.append("work_accident")
    else:
        df["work_accident"] = 0
        features_defaulted.append("work_accident")

    # promotion_last_5years: derive from years_since_last_promotion or default
    if "years_since_last_promotion" in df.columns and df["years_since_last_promotion"].notna().sum() > 0:
        df["promotion_last_5years"] = df["years_since_last_promotion"].apply(
            lambda v: 0 if pd.notna(v) and _normalize_value(v) > 5 else 1
        )
        features_from_data.append("promotion_last_5years")
    else:
        df["promotion_last_5years"] = 0
        features_defaulted.append("promotion_last_5years")

    # department
    if "department" in df.columns:
        df["department"] = df["department"].fillna("unknown")
        features_from_data.append("department")
    elif "structure_name" in df.columns:
        df["department"] = df["structure_name"].fillna("unknown")
        features_from_data.append("department")
    else:
        df["department"] = "general"
        features_defaulted.append("department")

    # salary_level: derive from employee_cost quantiles
    if "employee_cost" in df.columns and df["employee_cost"].notna().sum() > 0:
        cost_series = df["employee_cost"].apply(_normalize_value)
        valid_costs = cost_series[cost_series > 0]
        if len(valid_costs) > 0:
            thresholds = np.quantile(valid_costs, [0.33, 0.66])

            def bucket(cost: float) -> str:
                if cost <= 0:
                    return "medium"
                if cost <= thresholds[0]:
                    return "low"
                if cost <= thresholds[1]:
                    return "medium"
                return "high"

            df["salary_level"] = cost_series.apply(bucket)
            features_from_data.append("salary_level")
        else:
            df["salary_level"] = "medium"
            features_defaulted.append("salary_level")
    else:
        df["salary_level"] = "medium"
        features_defaulted.append("salary_level")

    # left: derive from status (the target variable)
    if "status" in df.columns:
        def status_to_left(val: Any) -> int:
            sval = str(val).strip().lower()
            if any(k in sval for k in ["resign", "terminated", "left", "inactive", "exit", "departed"]):
                return 1
            return 0
        df["left"] = df["status"].apply(status_to_left)
    else:
        df["left"] = 0

    # === Calculate per-row data quality score ===
    # Higher score = more features from actual data vs defaults
    total_features = len(features_from_data) + len(features_defaulted)
    data_quality_score = len(features_from_data) / total_features if total_features > 0 else 0.5
    df["_data_quality_score"] = data_quality_score
    df["_features_from_data"] = ",".join(features_from_data)
    df["_features_defaulted"] = ",".join(features_defaulted)

    # Log data quality info
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Training data quality: {data_quality_score:.1%} features from actual data")
    logger.info(f"  From data: {features_from_data}")
    logger.info(f"  Defaulted: {features_defaulted}")

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

    return df[required_columns + ['_data_quality_score', '_features_from_data', '_features_defaulted']]


async def _run_training_background(
    df: pd.DataFrame,
    mapping: Optional[Dict[str, Any]],
    dataset_id: str,
    job_id: int,
    user_id: int,
    username: str,
    tenant_id: Optional[str]
):
    """
    Run model training in the background with its own database session.
    This allows the /train endpoint to return immediately while training continues.
    """
    start_time = time.time()

    async with AsyncSessionLocal() as db:
        try:
            # Update status to in_progress
            churn_service.update_training_progress(dataset_id, "in_progress", 5, "Preparing data", job_id)
            await asyncio.sleep(0.1)  # Allow status to be polled

            # Build feature frame
            df_features = _build_training_frame(df, mapping)
            churn_service.update_training_progress(dataset_id, "in_progress", 15, "Features prepared", job_id)
            await asyncio.sleep(0.1)

            # Train model (model selection is now automatic via intelligent router)
            training_request = ModelTrainingRequest(
                use_existing_data=False
            )

            result = await churn_service.train_model(training_request, df_features, dataset_id)

            # Get the model type that was selected by the router
            model_type = result.selected_model or result.model_type
            churn_service.update_training_progress(dataset_id, "in_progress", 60, "Model trained, generating predictions", job_id)
            await asyncio.sleep(0.1)

            # Persist model metadata and mark active
            model_version = result.model_id
            await db.execute(
                update(ChurnModel)
                .where(ChurnModel.dataset_id == dataset_id)
                .values(is_active=0)
            )
            artifact_path, scaler_path, encoders_path = churn_service._artifact_paths(dataset_id)

            db.add(ChurnModel(
                model_name=model_type,
                model_version=model_version,
                dataset_id=dataset_id,
                parameters=training_request.hyperparameters or {},
                training_data_info=f"rows={len(df_features)}",
                performance_metrics=None,
                metrics={
                    "accuracy": result.accuracy,
                    "precision": result.precision,
                    "recall": result.recall,
                    "f1_score": result.f1_score,
                },
                artifact_path=str(artifact_path),
                scaler_path=str(scaler_path),
                encoders_path=str(encoders_path),
                trained_at=result.trained_at,
                is_active=1,
                pipeline_generated=1,
            ))
            await db.commit()

            # Cache metrics
            metrics_payload = {
                "accuracy": result.accuracy,
                "precision": result.precision,
                "recall": result.recall,
                "f1_score": result.f1_score,
                "trained_at": result.trained_at,
                "model_version": model_version,
                "predictions_made": 0,
                "dataset_id": dataset_id,
            }
            cache_key = dataset_id or "default"
            churn_service.model_metrics = metrics_payload
            churn_service.model_metrics_by_dataset[cache_key] = metrics_payload
            churn_service.feature_importance = result.feature_importance
            churn_service.feature_importance_by_dataset[cache_key] = result.feature_importance

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

            # Get dataset for predictions
            dataset_result = await db.execute(
                select(DatasetModel).where(DatasetModel.dataset_id == dataset_id)
            )
            dataset_used = dataset_result.scalar_one_or_none()

            if "hr_code" in df.columns and dataset_used:
                hr_codes_series = df["hr_code"].fillna("").astype(str)
                valid_mask = hr_codes_series != ""
                hr_codes_list = hr_codes_series[valid_mask].tolist()
                feature_frame = df_features.loc[valid_mask].reset_index(drop=True)

                total_employees = len(hr_codes_list)
                predictions = await churn_service.predict_frame_batch(
                    feature_frame=feature_frame,
                    dataset_id=dataset_id,
                    hr_codes=hr_codes_list,
                    batch_size=256,
                )

                # Preload existing rows to avoid per-row queries
                existing_outputs_result = await db.execute(
                    select(ChurnOutput).where(ChurnOutput.dataset_id == dataset_used.dataset_id)
                )
                existing_outputs = {row.hr_code: row for row in existing_outputs_result.scalars().all()}

                existing_reasonings: Dict[str, ChurnReasoning] = {}
                if hr_codes_list:
                    existing_reasonings_result = await db.execute(
                        select(ChurnReasoning).where(ChurnReasoning.hr_code.in_(hr_codes_list))
                    )
                    existing_reasonings = {row.hr_code: row for row in existing_reasonings_result.scalars().all()}

                to_add_outputs = []
                to_add_reasonings = []

                for idx, (hr_code, prediction) in enumerate(zip(hr_codes_list, predictions)):
                    try:
                        features = feature_frame.iloc[idx]
                        shap_dict = {}
                        if prediction.contributing_factors:
                            for factor in prediction.contributing_factors:
                                feature_name = factor.get("feature", "unknown")
                                impact_value = factor.get("impact", 0)
                                shap_dict[feature_name] = impact_value

                        confidence_pct = (prediction.confidence_score or 0) * 100
                        existing_output_row = existing_outputs.get(hr_code)

                        if existing_output_row:
                            existing_output_row.resign_proba = prediction.churn_probability
                            existing_output_row.shap_values = shap_dict
                            existing_output_row.model_version = model_version
                            existing_output_row.generated_at = datetime.utcnow()
                            existing_output_row.confidence_score = confidence_pct
                        else:
                            to_add_outputs.append(ChurnOutput(
                                hr_code=hr_code,
                                dataset_id=dataset_used.dataset_id,
                                resign_proba=prediction.churn_probability,
                                shap_values=shap_dict,
                                model_version=model_version,
                                confidence_score=confidence_pct,
                            ))
                        predictions_made += 1

                        stage = _determine_stage(float(features.get("time_spend_company", 3)))

                        reasoning_parts = []
                        if prediction.contributing_factors:
                            for factor in prediction.contributing_factors[:3]:
                                feature_name = factor.get("feature", "unknown")
                                description = factor.get("description", factor.get("impact", ""))
                                reasoning_parts.append(f"{feature_name}: {description}")
                        reasoning_text = "; ".join(reasoning_parts) if reasoning_parts else "No significant factors identified."

                        recommendations = "; ".join(prediction.recommendations[:3]) if prediction.recommendations else ""

                        ml_contributors_list = []
                        if prediction.contributing_factors:
                            for factor in prediction.contributing_factors:
                                ml_contributors_list.append({
                                    "feature": factor.get("feature", "unknown"),
                                    "value": factor.get("value"),
                                    "importance": factor.get("impact", 0) if isinstance(factor.get("impact"), (int, float)) else 0.5,
                                    "message": factor.get("message", "")
                                })

                        existing_reasoning_row = existing_reasonings.get(hr_code)
                        ml_contributors_json = json.dumps(ml_contributors_list) if ml_contributors_list else "[]"
                        heuristic_alerts_json = "[]"

                        if existing_reasoning_row:
                            existing_reasoning_row.churn_risk = prediction.churn_probability
                            existing_reasoning_row.stage = stage
                            existing_reasoning_row.stage_score = 0.5
                            existing_reasoning_row.ml_score = prediction.churn_probability
                            existing_reasoning_row.heuristic_score = 0.0
                            existing_reasoning_row.ml_contributors = ml_contributors_json
                            existing_reasoning_row.heuristic_alerts = heuristic_alerts_json
                            existing_reasoning_row.reasoning = reasoning_text
                            existing_reasoning_row.recommendations = recommendations
                            existing_reasoning_row.confidence_level = prediction.confidence_score
                        else:
                            to_add_reasonings.append(ChurnReasoning(
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
                                confidence_level=prediction.confidence_score,
                            ))
                        reasoning_made += 1

                        if predictions_made % 50 == 0 or predictions_made == total_employees:
                            progress_pct = 60 + int((predictions_made / max(total_employees, 1)) * 35)
                            churn_service.update_training_progress(
                                dataset_id,
                                "in_progress",
                                progress_pct,
                                f"Generating predictions ({predictions_made}/{total_employees})",
                                job_id,
                            )
                            await asyncio.sleep(0.01)

                    except Exception as e:
                        logger.warning(f"[TRAINING] Error predicting for {hr_code}: {e}")
                        continue

                if to_add_outputs:
                    db.add_all(to_add_outputs)
                if to_add_reasonings:
                    db.add_all(to_add_reasonings)

                await db.commit()
                logger.info(f"[TRAINING] Completed: {predictions_made} predictions, {reasoning_made} reasoning records generated")

            # Mark training as complete
            churn_service.update_training_progress(dataset_id, "complete", 100, "Training complete", job_id)

            # Update training job status
            await db.execute(
                update(TrainingJob)
                .where(TrainingJob.job_id == job_id)
                .values(status="complete", finished_at=datetime.utcnow())
            )
            await db.commit()

            # Update predictions count in metrics
            churn_service.model_metrics["predictions_made"] = predictions_made
            if cache_key in churn_service.model_metrics_by_dataset:
                churn_service.model_metrics_by_dataset[cache_key]["predictions_made"] = predictions_made

            duration_ms = int((time.time() - start_time) * 1000)

            # Log to audit trail
            await AuditLogger.log_model_training(
                db=db,
                user_id=user_id,
                username=username,
                tenant_id=tenant_id,
                model_type=model_type,
                accuracy=result.accuracy,
                duration_ms=duration_ms,
                samples_count=len(df_features)
            )

            logger.info(f"[TRAINING] Total time: {duration_ms}ms")

        except Exception as e:
            logger.error(f"[TRAINING] Background training failed: {e}")
            churn_service.update_training_progress(dataset_id, "error", 0, str(e), job_id)

            # Update training job with error
            await db.execute(
                update(TrainingJob)
                .where(TrainingJob.job_id == job_id)
                .values(status="error", finished_at=datetime.utcnow(), error_message=str(e))
            )
            await db.commit()

            # Log error to audit trail
            await AuditLogger.log_error(
                db=db,
                action="train_model",
                user_id=user_id,
                username=username,
                tenant_id=tenant_id,
                error_message=str(e),
                endpoint="/api/v1/churn/train",
                status_code=500
            )


@router.post("/train")
async def train_churn_model(
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Train a new churn prediction model with uploaded data.

    The model type is now automatically selected by the intelligent router based on
    dataset characteristics. The router analyzes:
    - Dataset size and feature count
    - Class imbalance
    - Missing data patterns
    - Categorical cardinality
    - Feature correlations

    Based on this analysis, it selects the optimal model:
    - TabPFN: For small datasets (<1000 samples, <100 features)
    - XGBoost: For larger datasets or imbalanced classes
    - Random Forest: For high-cardinality categoricals
    - Logistic Regression: For linear relationships
    - Auto-Ensemble: When multiple models score similarly

    Training runs asynchronously in the background. This endpoint returns immediately
    with status "queued". Poll /train/status to track progress.

    Returns immediately with job status. Use /train/status to track progress.
    """
    dataset_used: Optional[DatasetModel] = None
    dataset_id_for_training: Optional[str] = None
    training_job: Optional[TrainingJob] = None

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
            # Best effort: tie to active dataset if one exists
            try:
                dataset_used = await get_active_dataset(db)
            except HTTPException:
                dataset_used = None
        else:
            df, mapping, dataset_used = await _load_active_dataset_with_mapping(db)

        if not dataset_used:
            # Training must be tied to an active dataset so results stay isolated per upload
            dataset_used = await get_active_dataset(db)

        dataset_id_for_training = dataset_used.dataset_id

        # Create training job with "queued" status
        training_job = TrainingJob(dataset_id=dataset_id_for_training, status="queued")
        db.add(training_job)
        await db.commit()
        await db.refresh(training_job)

        # Set initial progress status
        churn_service.update_training_progress(
            dataset_id_for_training,
            "queued",
            0,
            "Training queued, starting soon...",
            training_job.job_id
        )

        # Start background training task (model selection is automatic via router)
        asyncio.create_task(
            _run_training_background(
                df=df,
                mapping=mapping,
                dataset_id=dataset_id_for_training,
                job_id=training_job.job_id,
                user_id=current_user.id,
                username=current_user.username,
                tenant_id=getattr(current_user, 'tenant_id', None)
            )
        )

        logger.info(f"[TRAINING] Background training task started for dataset {dataset_id_for_training}")

        # Return immediately with queued status
        return {
            "success": True,
            "status": "queued",
            "message": "Training started in background. Poll /train/status for progress.",
            "job_id": training_job.job_id,
            "dataset_id": dataset_id_for_training
        }

    except HTTPException as exc:
        if dataset_id_for_training:
            churn_service.update_training_progress(dataset_id_for_training, "error", 0, str(exc.detail), training_job.job_id if training_job else None)
        if training_job:
            await _complete_training_job(db, training_job, status="error", error_message=str(exc.detail))
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail))
    except pd.errors.EmptyDataError:
        if dataset_id_for_training:
            churn_service.update_training_progress(dataset_id_for_training, "error", 0, "Uploaded CSV file is empty", training_job.job_id if training_job else None)
        if training_job:
            await _complete_training_job(db, training_job, status="error", error_message="Uploaded CSV file is empty")
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
        if dataset_id_for_training:
            churn_service.update_training_progress(dataset_id_for_training, "error", 0, str(e), training_job.job_id if training_job else None)
        if training_job:
            await _complete_training_job(db, training_job, status="error", error_message=str(e))
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
            detail=sanitize_error_message(e, "model training"),
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
        dataset = await get_active_dataset(db)
        dataset_id = dataset.dataset_id
        cache_key = dataset_id or "default"

        model_type = type(churn_service.model).__name__ if churn_service.model else "xgboost"

        # Prefer cached, dataset-scoped metrics
        metrics = getattr(churn_service, "model_metrics_by_dataset", {}).get(cache_key, {}) or churn_service.model_metrics or {}

        # If no cached metrics, try to load from database for this dataset
        if not metrics or not metrics.get('trained_at'):
            result = await db.execute(
                select(ChurnModel)
                .where(ChurnModel.dataset_id == dataset_id)
                .where(ChurnModel.is_active == 1)
                .order_by(ChurnModel.trained_at.desc())
                .limit(1)
            )
            active_model = result.scalar_one_or_none()

            if not active_model:
                # Fallback to latest model for dataset even if not marked active
                result = await db.execute(
                    select(ChurnModel)
                    .where(ChurnModel.dataset_id == dataset_id)
                    .order_by(ChurnModel.trained_at.desc())
                    .limit(1)
                )
                active_model = result.scalar_one_or_none()

            if active_model:
                db_metrics = active_model.performance_metrics or active_model.metrics or {}
                metrics = {
                    'accuracy': db_metrics.get('accuracy', 0.0),
                    'precision': db_metrics.get('precision', 0.0),
                    'recall': db_metrics.get('recall', 0.0),
                    'f1_score': db_metrics.get('f1_score', 0.0),
                    'trained_at': active_model.trained_at,
                    'model_version': active_model.model_version,
                    'predictions_made': 0,
                    'dataset_id': dataset_id,
                }

                # Cache for future requests and ensure the right artifacts are loaded
                churn_service.model_metrics_by_dataset[cache_key] = metrics
                churn_service.model_metrics = metrics
                churn_service.feature_importance_by_dataset[cache_key] = db_metrics.get('feature_importance', {})
                churn_service.feature_importance = churn_service.feature_importance_by_dataset[cache_key]
                churn_service.ensure_model_for_dataset(dataset_id)
                model_type = active_model.model_name or "xgboost"

        if not metrics or not metrics.get('trained_at'):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not trained")

        return ModelMetricsResponse(
            model_id=metrics.get('model_version', 'current'),
            model_type=model_type,
            accuracy=metrics.get('accuracy', 0.0),
            precision=metrics.get('precision', 0.0),
            recall=metrics.get('recall', 0.0),
            f1_score=metrics.get('f1_score', 0.0),
            last_trained=metrics.get('trained_at'),
            predictions_made=metrics.get('predictions_made', 0),
            feature_importance=getattr(churn_service, 'feature_importance', {}) or {}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "model metrics retrieval"),
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
            detail=sanitize_error_message(e, "model reset"),
        )


@router.get("/train/status")
async def get_training_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return training status for the active dataset, including progress if available."""
    try:
        # Get dataset ID without requiring the file to exist on disk
        dataset_id = await get_active_dataset_id(db)
        if not dataset_id:
            return {
                "status": "idle",
                "progress": 0,
                "message": "No active dataset configured",
                "dataset_id": None,
            }
        cache_key = dataset_id or "default"

        # Prefer in-memory progress (live updates during training)
        cached = getattr(churn_service, "training_progress", {}).get(dataset_id)
        if cached:
            return {
                "status": cached.get("status", "in_progress"),
                "progress": cached.get("progress", 0),
                "message": cached.get("message", "Training in progress"),
                "dataset_id": dataset_id,
                "job_id": cached.get("job_id"),
                "updated_at": cached.get("updated_at"),
            }

        # Check latest training job for this dataset
        job_result = await db.execute(
            select(TrainingJob)
            .where(TrainingJob.dataset_id == dataset_id)
            .order_by(TrainingJob.started_at.desc())
            .limit(1)
        )
        job = job_result.scalar_one_or_none()

        if job:
            if job.status == "in_progress":
                return {
                    "status": "in_progress",
                    "progress": 10,
                    "message": "Training in progress",
                    "dataset_id": dataset_id,
                    "job_id": job.job_id,
                    "started_at": job.started_at,
                }
            if job.status == "error":
                return {
                    "status": "error",
                    "progress": 0,
                    "message": job.error_message or "Training failed",
                    "dataset_id": dataset_id,
                    "job_id": job.job_id,
                    "started_at": job.started_at,
                    "finished_at": job.finished_at,
                }

        # If we have a trained model cached or persisted, surface as complete
        metrics = getattr(churn_service, "model_metrics_by_dataset", {}).get(cache_key)
        if (not metrics or not metrics.get("trained_at")):
            db_model = await db.execute(
                select(ChurnModel)
                .where(ChurnModel.dataset_id == dataset_id)
                .order_by(ChurnModel.trained_at.desc())
                .limit(1)
            )
            active_model = db_model.scalar_one_or_none()
            if active_model:
                metrics = (active_model.performance_metrics or active_model.metrics or {})
                metrics.update({
                    "trained_at": active_model.trained_at,
                    "model_version": active_model.model_version,
                })
                churn_service.model_metrics_by_dataset[cache_key] = metrics

        if metrics and metrics.get("trained_at"):
            return {
                "status": "complete",
                "progress": 100,
                "message": "Model trained",
                "dataset_id": dataset_id,
                "model_version": metrics.get("model_version"),
                "trained_at": metrics.get("trained_at"),
            }

        return {
            "status": "idle",
            "progress": 0,
            "message": "No training started",
            "dataset_id": dataset_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch training status: {e}"
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
        dataset = await get_active_dataset(db)
        df, mapping, _ = await _load_active_dataset_with_mapping(db)
        churn_service.ensure_model_for_dataset(dataset.dataset_id)

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
        model_metrics = churn_service.model_metrics_by_dataset.get(dataset.dataset_id) if hasattr(churn_service, "model_metrics_by_dataset") else None
        if not model_metrics:
            model_metrics = churn_service.model_metrics
        model_version = model_metrics.get("model_version", "unknown") if model_metrics else "unknown"

        predictions_made = 0
        reasoning_made = 0

        hr_codes_series = df["hr_code"].fillna("").astype(str)
        valid_mask = hr_codes_series != ""
        hr_codes_list = hr_codes_series[valid_mask].tolist()
        feature_frame = df_features.loc[valid_mask].reset_index(drop=True)

        predictions = await churn_service.predict_frame_batch(
            feature_frame=feature_frame,
            dataset_id=dataset.dataset_id,
            hr_codes=hr_codes_list,
            batch_size=256,
        )

        existing_outputs_result = await db.execute(
            select(ChurnOutput).where(ChurnOutput.dataset_id == dataset.dataset_id)
        )
        existing_outputs = {row.hr_code: row for row in existing_outputs_result.scalars().all()}

        existing_reasonings: Dict[str, ChurnReasoning] = {}
        if hr_codes_list:
            existing_reasonings_result = await db.execute(
                select(ChurnReasoning).where(ChurnReasoning.hr_code.in_(hr_codes_list))
            )
            existing_reasonings = {row.hr_code: row for row in existing_reasonings_result.scalars().all()}

        to_add_outputs = []
        to_add_reasonings = []

        for idx, (hr_code, prediction) in enumerate(zip(hr_codes_list, predictions)):
            try:
                features = feature_frame.iloc[idx]
                shap_dict = {}
                if prediction.contributing_factors:
                    for factor in prediction.contributing_factors:
                        feature_name = factor.get("feature", "unknown")
                        impact_value = factor.get("impact", 0)
                        shap_dict[feature_name] = impact_value

                raw_confidence = getattr(prediction, 'confidence_score', None)
                confidence_score = (raw_confidence * 100 if raw_confidence is not None else 70.0)

                existing_row = existing_outputs.get(hr_code)
                if existing_row:
                    existing_row.resign_proba = prediction.churn_probability
                    existing_row.shap_values = shap_dict
                    existing_row.model_version = model_version
                    existing_row.generated_at = datetime.utcnow()
                    existing_row.confidence_score = confidence_score
                else:
                    to_add_outputs.append(ChurnOutput(
                        hr_code=hr_code,
                        dataset_id=dataset.dataset_id,
                        resign_proba=prediction.churn_probability,
                        shap_values=shap_dict,
                        model_version=model_version,
                        confidence_score=confidence_score,
                    ))
                predictions_made += 1

                stage = _determine_stage(float(features.get("time_spend_company", 3)))

                reasoning_parts = []
                if prediction.contributing_factors:
                    for factor in prediction.contributing_factors[:3]:
                        feature_name = factor.get("feature", "unknown")
                        description = factor.get("description", factor.get("impact", ""))
                        reasoning_parts.append(f"{feature_name}: {description}")
                reasoning_text = "; ".join(reasoning_parts) if reasoning_parts else "No significant factors identified."

                recommendations = "; ".join(prediction.recommendations[:3]) if prediction.recommendations else ""

                existing_reasoning_row = existing_reasonings.get(hr_code)
                if existing_reasoning_row:
                    existing_reasoning_row.churn_risk = prediction.churn_probability
                    existing_reasoning_row.stage = stage
                    existing_reasoning_row.ml_score = prediction.churn_probability
                    existing_reasoning_row.ml_contributors = json.dumps(shap_dict) if shap_dict else None
                    existing_reasoning_row.reasoning = reasoning_text
                    existing_reasoning_row.recommendations = recommendations
                    existing_reasoning_row.confidence_level = getattr(prediction, 'confidence_score', None) or 0.7
                else:
                    to_add_reasonings.append(ChurnReasoning(
                        hr_code=hr_code,
                        churn_risk=prediction.churn_probability,
                        stage=stage,
                        ml_score=prediction.churn_probability,
                        heuristic_score=0.0,
                        ml_contributors=json.dumps(shap_dict) if shap_dict else None,
                        reasoning=reasoning_text,
                        recommendations=recommendations,
                        confidence_level=getattr(prediction, 'confidence_score', None) or 0.7,
                    ))
                reasoning_made += 1

            except Exception as e:
                print(f"Error predicting for {hr_code}: {e}")
                continue

        if to_add_outputs:
            db.add_all(to_add_outputs)
        if to_add_reasonings:
            db.add_all(to_add_reasonings)

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
            detail=sanitize_error_message(e, "prediction generation")
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


# ============================================================================
# MODEL INTELLIGENCE ENDPOINTS
# ============================================================================

from app.services.model_intelligence_service import model_intelligence_service
from app.services.risk_alert_service import risk_alert_service


@router.get("/model/backtesting")
async def get_backtesting_results(
    periods: int = 6,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get backtesting results showing historical prediction accuracy.

    Returns:
    - Period-by-period accuracy metrics
    - Aggregate statistics (precision, recall, catch rate)
    - Historical trend data
    """
    try:
        dataset = await get_active_dataset(db)
        results = await model_intelligence_service.get_backtesting_results(
            db, dataset.dataset_id, periods
        )
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "backtesting results retrieval")
        )


@router.get("/model/prediction-outcomes")
async def get_prediction_outcomes(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get individual prediction outcomes - what we predicted vs what happened.

    Returns:
    - List of predictions with actual outcomes
    - Summary statistics
    """
    try:
        dataset = await get_active_dataset(db)
        results = await model_intelligence_service.get_prediction_outcomes(
            db, dataset.dataset_id, limit
        )
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "prediction outcomes retrieval")
        )


@router.get("/timeline/{hr_code}")
async def get_departure_timeline(
    hr_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get predicted departure timeline for an employee.

    Returns:
    - Probability of departure at different time horizons (30d, 60d, 90d, 180d)
    - Predicted departure window
    - Urgency level
    """
    try:
        dataset = await get_active_dataset(db)
        timeline = await model_intelligence_service.get_departure_timeline(
            db, hr_code, dataset.dataset_id
        )
        if not timeline:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {hr_code} not found"
            )
        return timeline.__dict__
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "departure timeline retrieval")
        )


@router.get("/timelines/batch")
async def get_batch_departure_timelines(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get departure timelines for multiple high-risk employees.
    """
    try:
        dataset = await get_active_dataset(db)
        timelines = await model_intelligence_service.get_batch_departure_timelines(
            db, dataset.dataset_id, limit
        )
        return {"timelines": timelines}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "batch timelines retrieval")
        )


@router.get("/cohort/{hr_code}")
async def get_cohort_analysis(
    hr_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get cohort comparison analysis for an employee.

    Returns:
    - Similar employees who left
    - Similar employees who stayed
    - Common risk factors
    - Retention insights
    """
    try:
        dataset = await get_active_dataset(db)
        analysis = await model_intelligence_service.get_cohort_analysis(
            db, hr_code, dataset.dataset_id
        )
        if not analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {hr_code} not found"
            )
        return {
            "target_employee": analysis.target_employee,
            "similar_who_left": analysis.similar_who_left,
            "similar_who_stayed": analysis.similar_who_stayed,
            "common_risk_factors": analysis.common_risk_factors,
            "retention_insights": analysis.retention_insights,
            "recommended_actions": analysis.recommended_actions
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "cohort analysis retrieval")
        )


@router.get("/cohorts/overview")
async def get_cohort_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get cohort overview for the dashboard.

    Returns:
    - Department cohort statistics
    - Tenure cohort statistics
    """
    try:
        dataset = await get_active_dataset(db)
        overview = await model_intelligence_service.get_cohort_overview(
            db, dataset.dataset_id
        )
        return overview
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "cohort overview retrieval")
        )


# ============================================================================
# ALERT ENDPOINTS
# ============================================================================


@router.get("/alerts")
async def get_risk_alerts(
    limit: int = 20,
    include_read: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent risk alerts.

    Returns:
    - List of alerts with severity and context
    - Unread count
    - Severity breakdown
    """
    try:
        dataset = await get_active_dataset(db)
        alerts = await risk_alert_service.get_recent_alerts(
            db, dataset.dataset_id, limit, include_read
        )
        return alerts
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "alerts retrieval")
        )


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a specific alert as read."""
    try:
        await risk_alert_service.mark_alert_read(db, alert_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "alert status update")
        )


@router.post("/alerts/read-all")
async def mark_all_alerts_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all alerts as read."""
    try:
        count = await risk_alert_service.mark_all_read(db)
        return {"success": True, "count": count}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "alerts status update")
        )


# ============================================================================
# SURVIVAL ANALYSIS ENDPOINTS
# ============================================================================

from app.services.survival_analysis_service import survival_service


@router.post("/survival/fit")
async def fit_survival_model(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Fit the survival analysis model on current employee data.

    Trains a Cox Proportional Hazards model using:
    - tenure: time employed (duration)
    - status: active/left (event indicator)
    - risk_score: from churn prediction model

    Returns model metrics including concordance index.
    """
    try:
        dataset = await get_active_dataset(db)
        metrics = await survival_service.fit_survival_model(db, dataset.dataset_id)

        return {
            "success": True,
            "metrics": {
                "concordance_index": metrics.concordance_index,
                "total_employees": metrics.total_employees,
                "events_observed": metrics.events_observed,
                "censored": metrics.censored,
                "median_tenure_leavers": metrics.median_tenure_leavers,
                "median_tenure_active": metrics.median_tenure_active
            },
            "message": f"Survival model fitted on {metrics.total_employees} employees"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "survival model training")
        )


@router.get("/survival/predict/{hr_code}")
async def get_survival_prediction(
    hr_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get survival prediction for a specific employee.

    Returns:
    - Probability of departure at various time horizons (30, 60, 90, 180, 365 days)
    - Expected departure window
    - Median survival time
    - Hazard ratio relative to baseline
    """
    try:
        dataset = await get_active_dataset(db)
        prediction = await survival_service.predict_survival(db, hr_code, dataset.dataset_id)

        if not prediction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No prediction available for employee {hr_code}"
            )

        from dataclasses import asdict
        return asdict(prediction)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "survival prediction")
        )


@router.get("/survival/batch")
async def get_batch_survival_predictions(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get survival predictions for multiple employees.

    Returns predictions sorted by urgency (critical first).
    """
    try:
        dataset = await get_active_dataset(db)
        predictions = await survival_service.get_batch_predictions(db, dataset.dataset_id, limit)

        return {
            "predictions": predictions,
            "count": len(predictions)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "batch survival predictions")
        )


# ============================================================================
# OUTCOME TRACKING ENDPOINTS (Model Validation)
# ============================================================================

from app.services.outcome_tracking_service import outcome_tracking_service


@router.get("/model/realized-metrics")
async def get_realized_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get realized accuracy metrics - how well did predictions actually perform?

    This is the key validation metric. Returns:
    - Realized precision: Of high-risk flagged, what % actually left?
    - Realized recall: Of those who left, what % were flagged beforehand?
    - Overall accuracy
    - Time-to-departure metrics

    These metrics prove (or disprove) that the model is useful.
    """
    try:
        dataset = await get_active_dataset(db)
        metrics = await outcome_tracking_service.calculate_realized_metrics(
            db, dataset.dataset_id
        )

        from dataclasses import asdict
        result = asdict(metrics)
        result['interpretation'] = outcome_tracking_service._interpret_metrics(metrics)
        result['dataset_id'] = dataset.dataset_id

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "realized metrics calculation")
        )


@router.get("/model/outcome-tracking")
async def get_outcome_tracking(
    lookback_days: int = 90,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Verify past predictions against actual outcomes.

    Returns individual predictions made N days ago with their actual outcomes.
    Use this to audit specific predictions and understand model behavior.
    """
    try:
        dataset = await get_active_dataset(db)
        outcomes = await outcome_tracking_service.verify_predictions(
            db, dataset.dataset_id, lookback_days
        )
        return outcomes
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "outcome tracking")
        )


@router.get("/model/accuracy-by-cohort")
async def get_accuracy_by_cohort(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get accuracy metrics broken down by department and other cohorts.

    Returns:
    - Overall realized metrics
    - Department-level breakdown
    - Human-readable interpretation
    """
    try:
        dataset = await get_active_dataset(db)
        results = await outcome_tracking_service.get_accuracy_by_cohort(
            db, dataset.dataset_id
        )
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "accuracy by cohort")
        )


# ============================================================================
# MODEL ROUTING INTROSPECTION ENDPOINTS
# ============================================================================

from app.models.churn import DatasetProfileDB, ModelRoutingDecision


@router.get("/model/routing-info", response_model=RoutingInfoResponse)
async def get_routing_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get dataset profile and model routing decision for the active dataset.

    Returns comprehensive analysis of the dataset and the intelligent router's
    decision about which model(s) to use, including:
    - Dataset characteristics (size, features, class balance, quality)
    - Model suitability scores
    - Selected model and reasoning
    - Ensemble configuration (if applicable)
    - Alternative model options
    """
    try:
        dataset = await get_active_dataset(db)

        # Get profile
        profile_result = await db.execute(
            select(DatasetProfileDB).where(DatasetProfileDB.dataset_id == dataset.dataset_id)
        )
        profile_db = profile_result.scalar_one_or_none()

        if not profile_db:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No dataset profile found. Train a model first to generate profile."
            )

        # Get latest routing decision
        routing_result = await db.execute(
            select(ModelRoutingDecision)
            .where(ModelRoutingDecision.dataset_id == dataset.dataset_id)
            .order_by(ModelRoutingDecision.decided_at.desc())
            .limit(1)
        )
        routing_db = routing_result.scalar_one_or_none()

        if not routing_db:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No routing decision found. Train a model first."
            )

        # Build response
        profile_response = DatasetProfileResponse(
            dataset_id=profile_db.dataset_id,
            n_samples=profile_db.n_samples,
            n_features=profile_db.n_features,
            n_numeric_features=profile_db.n_numeric_features or 0,
            n_categorical_features=profile_db.n_categorical_features or 0,
            n_classes=profile_db.n_classes or 2,
            class_balance_ratio=float(profile_db.class_balance_ratio or 1.0),
            is_severely_imbalanced=bool(profile_db.is_severely_imbalanced),
            missing_ratio=float(profile_db.missing_ratio or 0.0),
            has_outliers=bool(profile_db.has_outliers),
            outlier_ratio=float(profile_db.outlier_ratio or 0.0),
            overall_quality_score=float(profile_db.overall_quality_score or 0.0),
            tabpfn_suitability=float(profile_db.tabpfn_suitability or 0.0),
            tree_model_suitability=float(profile_db.tree_model_suitability or 0.0),
            linear_model_suitability=float(profile_db.linear_model_suitability or 0.0),
            created_at=profile_db.created_at
        )

        routing_response = ModelRoutingResponse(
            dataset_id=routing_db.dataset_id,
            selected_model=routing_db.selected_model,
            confidence=float(routing_db.confidence),
            reasoning=routing_db.reasoning or [],
            is_ensemble=bool(routing_db.is_ensemble),
            ensemble_models=routing_db.ensemble_models,
            ensemble_weights=routing_db.ensemble_weights,
            ensemble_method=routing_db.ensemble_method,
            alternatives=routing_db.alternative_models,
            model_scores=routing_db.model_scores,
            decided_at=routing_db.decided_at
        )

        return RoutingInfoResponse(
            profile=profile_response,
            routing=routing_response
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "routing info retrieval")
        )


@router.get("/model/dataset-profile/{dataset_id}", response_model=DatasetProfileResponse)
async def get_dataset_profile(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get comprehensive dataset analysis for a specific dataset.

    Returns detailed statistics about the dataset including:
    - Size metrics (samples, features)
    - Class distribution and balance
    - Missing data analysis
    - Outlier detection results
    - Model suitability scores for different algorithm types
    """
    try:
        profile_result = await db.execute(
            select(DatasetProfileDB).where(DatasetProfileDB.dataset_id == dataset_id)
        )
        profile_db = profile_result.scalar_one_or_none()

        if not profile_db:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No profile found for dataset {dataset_id}. Train a model first."
            )

        return DatasetProfileResponse(
            dataset_id=profile_db.dataset_id,
            n_samples=profile_db.n_samples,
            n_features=profile_db.n_features,
            n_numeric_features=profile_db.n_numeric_features or 0,
            n_categorical_features=profile_db.n_categorical_features or 0,
            n_classes=profile_db.n_classes or 2,
            class_balance_ratio=float(profile_db.class_balance_ratio or 1.0),
            is_severely_imbalanced=bool(profile_db.is_severely_imbalanced),
            missing_ratio=float(profile_db.missing_ratio or 0.0),
            has_outliers=bool(profile_db.has_outliers),
            outlier_ratio=float(profile_db.outlier_ratio or 0.0),
            overall_quality_score=float(profile_db.overall_quality_score or 0.0),
            tabpfn_suitability=float(profile_db.tabpfn_suitability or 0.0),
            tree_model_suitability=float(profile_db.tree_model_suitability or 0.0),
            linear_model_suitability=float(profile_db.linear_model_suitability or 0.0),
            created_at=profile_db.created_at
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "dataset profile retrieval")
        )


@router.get("/model/routing-history/{dataset_id}")
async def get_routing_history(
    dataset_id: str,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get history of model routing decisions for a dataset.

    Returns list of routing decisions showing how model selection has evolved
    across training runs. Useful for understanding model selection patterns.
    """
    try:
        result = await db.execute(
            select(ModelRoutingDecision)
            .where(ModelRoutingDecision.dataset_id == dataset_id)
            .order_by(ModelRoutingDecision.decided_at.desc())
            .limit(limit)
        )
        decisions = result.scalars().all()

        return {
            "dataset_id": dataset_id,
            "decisions": [
                {
                    "id": d.id,
                    "selected_model": d.selected_model,
                    "confidence": float(d.confidence),
                    "is_ensemble": bool(d.is_ensemble),
                    "ensemble_models": d.ensemble_models,
                    "reasoning": d.reasoning,
                    "model_scores": d.model_scores,
                    "decided_at": d.decided_at
                }
                for d in decisions
            ],
            "total": len(decisions)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error_message(e, "routing history retrieval")
        )


@router.get("/model/supported-models")
async def get_supported_models(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of all supported model types and their characteristics.

    Returns information about each model type including:
    - Model name and description
    - Ideal use cases
    - Constraints (if any)
    - Current availability status
    """
    from app.services.model_router_service import model_router
    from app.services.tabpfn_service import is_tabpfn_available

    tabpfn_available = is_tabpfn_available()

    return {
        "models": [
            {
                "name": "tabpfn",
                "display_name": "TabPFN (Pre-trained Transformer)",
                "description": "Pre-trained transformer for tabular data. Excels on small datasets without requiring training.",
                "ideal_for": [
                    "Small datasets (< 1000 samples)",
                    "Few features (< 100)",
                    "Clean data with minimal missing values",
                    "Binary or few-class classification"
                ],
                "constraints": {
                    "max_samples": 1000,
                    "max_features": 100,
                    "max_classes": 10
                },
                "available": tabpfn_available,
                "requires_gpu": False
            },
            {
                "name": "xgboost",
                "display_name": "XGBoost (Gradient Boosting)",
                "description": "Gradient boosting algorithm. Robust, handles imbalanced data and missing values well.",
                "ideal_for": [
                    "Medium to large datasets",
                    "Imbalanced classes",
                    "Data with missing values",
                    "Complex feature interactions"
                ],
                "constraints": None,
                "available": True,
                "requires_gpu": False
            },
            {
                "name": "random_forest",
                "display_name": "Random Forest",
                "description": "Ensemble of decision trees. Robust to outliers and provides good feature importance.",
                "ideal_for": [
                    "High-cardinality categorical features",
                    "Noisy data with outliers",
                    "When interpretability via feature importance matters",
                    "Medium-sized datasets"
                ],
                "constraints": None,
                "available": True,
                "requires_gpu": False
            },
            {
                "name": "logistic",
                "display_name": "Logistic Regression",
                "description": "Linear model. Fast, interpretable, works well when relationships are approximately linear.",
                "ideal_for": [
                    "Strong linear relationships in data",
                    "Need for highly interpretable model",
                    "Low feature count",
                    "Fast inference requirements"
                ],
                "constraints": None,
                "available": True,
                "requires_gpu": False
            }
        ],
        "ensemble_methods": [
            {
                "name": "weighted_voting",
                "description": "Combines predictions using weighted average based on cross-validation scores"
            },
            {
                "name": "stacking",
                "description": "Uses a meta-learner trained on base model predictions"
            }
        ],
        "active_models": model_router.get_supported_models()
    }
