"""
Cached query helpers for ChurnVision Enterprise.

Provides cached versions of expensive aggregation queries used by the chatbot
and other services. Uses Redis when available, falls back to in-memory cache.

All risk thresholds are retrieved from the data-driven thresholds service,
computed from user's actual data distribution - no hardcoded values.
"""

import hashlib
import json
import logging
from typing import Dict, Any, Optional, List, Tuple

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache, CacheTTL
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput, ChurnReasoning
from app.services.data_driven_thresholds_service import data_driven_thresholds_service

logger = logging.getLogger("churnvision.cached_queries")


def _get_risk_thresholds(dataset_id: str) -> Tuple[float, float]:
    """
    Get data-driven risk thresholds for the dataset.

    Returns (high_threshold, medium_threshold) computed from data percentiles.
    """
    thresholds = data_driven_thresholds_service.get_cached_thresholds(dataset_id)
    if thresholds and thresholds.risk_high_threshold > 0:
        return (thresholds.risk_high_threshold, thresholds.risk_medium_threshold)
    # Fallback only if no data has been processed yet
    return (0.6, 0.3)


def _make_cache_key(prefix: str, *args) -> str:
    """Generate a cache key from prefix and arguments."""
    key_data = json.dumps(args, sort_keys=True, default=str)
    hash_suffix = hashlib.md5(key_data.encode()).hexdigest()[:12]
    return f"{prefix}:{hash_suffix}"


async def get_cached_company_overview(
    db: AsyncSession,
    dataset_id: str,
    ttl: int = CacheTTL.SHORT
) -> Dict[str, Any]:
    """
    Get cached company-level metrics scoped to dataset.
    Cache TTL: 60 seconds (SHORT)
    """
    cache = await get_cache()
    cache_key = _make_cache_key("company_overview", dataset_id)

    # Try cache first
    cached = await cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass

    # Get data-driven risk thresholds
    high_thresh, medium_thresh = _get_risk_thresholds(dataset_id)

    # Execute query with data-driven thresholds
    stats_query = select(
        func.count().label("total_employees"),
        func.sum(case((func.lower(HRDataInput.status) == "active", 1), else_=0)).label("active_employees"),
        func.avg(HRDataInput.tenure).label("avg_tenure"),
        func.avg(HRDataInput.employee_cost).label("avg_cost"),
        func.avg(ChurnOutput.resign_proba).label("avg_risk"),
        func.sum(case((ChurnOutput.resign_proba >= high_thresh, 1), else_=0)).label("high_risk"),
        func.sum(case(((ChurnOutput.resign_proba >= medium_thresh) & (ChurnOutput.resign_proba < high_thresh), 1), else_=0)).label("medium_risk"),
        func.sum(case((ChurnOutput.resign_proba < medium_thresh, 1), else_=0)).label("low_risk"),
    ).select_from(HRDataInput).outerjoin(
        ChurnOutput,
        and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
    ).where(HRDataInput.dataset_id == dataset_id)

    result = await db.execute(stats_query)
    row = result.fetchone()

    if not row:
        return {}

    overview = {
        "totalEmployees": row.total_employees or 0,
        "activeEmployees": row.active_employees or 0,
        "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
        "avgCost": float(row.avg_cost) if row.avg_cost else 0,
        "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
        "riskDistribution": {
            "high": int(row.high_risk or 0),
            "medium": int(row.medium_risk or 0),
            "low": int(row.low_risk or 0),
        }
    }

    # Cache the result
    await cache.set(cache_key, json.dumps(overview), ttl)
    logger.debug(f"Cached company overview for dataset {dataset_id}")

    return overview


async def get_cached_workforce_statistics(
    db: AsyncSession,
    dataset_id: str,
    ttl: int = CacheTTL.SHORT
) -> Dict[str, Any]:
    """
    Get cached comprehensive workforce statistics.
    Cache TTL: 60 seconds (SHORT)
    """
    cache = await get_cache()
    cache_key = _make_cache_key("workforce_stats", dataset_id)

    # Try cache first
    cached = await cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass

    # Execute query - get all active employees with reasoning data
    query = select(HRDataInput, ChurnReasoning).outerjoin(
        ChurnReasoning,
        HRDataInput.hr_code == ChurnReasoning.hr_code
    ).where(
        func.lower(HRDataInput.status) == "active",
        HRDataInput.dataset_id == dataset_id
    )

    result = await db.execute(query)
    employees = result.all()

    # Get data-driven risk thresholds
    high_thresh, medium_thresh = _get_risk_thresholds(dataset_id)

    total = len(employees)
    high_risk = sum(1 for e, r in employees if r and r.churn_risk and r.churn_risk >= high_thresh)
    medium_risk = sum(1 for e, r in employees if r and r.churn_risk and medium_thresh <= r.churn_risk < high_thresh)
    low_risk = total - high_risk - medium_risk

    # Department breakdown
    dept_stats = {}
    for e, r in employees:
        dept = e.structure_name or "Unknown"
        if dept not in dept_stats:
            dept_stats[dept] = {"count": 0, "risks": [], "ml_scores": [], "stage_scores": [], "confidences": []}
        dept_stats[dept]["count"] += 1
        if r and r.churn_risk:
            dept_stats[dept]["risks"].append(float(r.churn_risk))
        if r and r.ml_score:
            dept_stats[dept]["ml_scores"].append(float(r.ml_score))
        if r and r.stage_score:
            dept_stats[dept]["stage_scores"].append(float(r.stage_score))
        if r and r.confidence_level:
            dept_stats[dept]["confidences"].append(float(r.confidence_level))

    department_risks = []
    for dept, stats in dept_stats.items():
        risks = stats["risks"]
        department_risks.append({
            "department": dept,
            "count": stats["count"],
            "avgRisk": sum(risks) / len(risks) if risks else 0,
            "highRiskCount": sum(1 for r in risks if r >= high_thresh),
            "avgMLScore": sum(stats["ml_scores"]) / len(stats["ml_scores"]) if stats["ml_scores"] else 0,
            "avgStageScore": sum(stats["stage_scores"]) / len(stats["stage_scores"]) if stats["stage_scores"] else 0,
            "avgConfidence": sum(stats["confidences"]) / len(stats["confidences"]) if stats["confidences"] else 0
        })

    # Stage distribution
    stage_counts = {}
    for e, r in employees:
        stage = r.stage if r and r.stage else "Unknown"
        if stage not in stage_counts:
            stage_counts[stage] = {"count": 0, "risks": []}
        stage_counts[stage]["count"] += 1
        if r and r.churn_risk:
            stage_counts[stage]["risks"].append(float(r.churn_risk))

    stage_distribution = [
        {
            "stage": stage,
            "count": data["count"],
            "avgRisk": sum(data["risks"]) / len(data["risks"]) if data["risks"] else 0
        }
        for stage, data in stage_counts.items()
    ]

    stats_result = {
        "totalEmployees": total,
        "highRisk": high_risk,
        "mediumRisk": medium_risk,
        "lowRisk": low_risk,
        "departmentRisks": sorted(department_risks, key=lambda x: x["avgRisk"], reverse=True),
        "stageDistribution": stage_distribution,
        "riskTrends": {
            "criticalEmployees": high_risk,
            "atRiskDepartments": sum(1 for d in department_risks if d["avgRisk"] >= medium_thresh),
            "averageConfidence": sum(d["avgConfidence"] for d in department_risks) / len(department_risks) if department_risks else 0,
            "totalWithReasoningData": sum(1 for e, r in employees if r is not None)
        }
    }

    # Cache the result
    await cache.set(cache_key, json.dumps(stats_result), ttl)
    logger.debug(f"Cached workforce statistics for dataset {dataset_id}")

    return stats_result


async def get_cached_department_snapshot(
    db: AsyncSession,
    dataset_id: str,
    department: str,
    ttl: int = CacheTTL.SHORT
) -> Optional[Dict[str, Any]]:
    """
    Get cached department snapshot.
    Cache TTL: 60 seconds (SHORT)
    """
    if not department:
        return None

    cache = await get_cache()
    cache_key = _make_cache_key("dept_snapshot", dataset_id, department)

    # Try cache first
    cached = await cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass

    # Get data-driven risk thresholds
    high_thresh, _ = _get_risk_thresholds(dataset_id)

    # Execute query with data-driven thresholds
    query = select(
        func.count().label("headcount"),
        func.avg(HRDataInput.tenure).label("avg_tenure"),
        func.avg(HRDataInput.employee_cost).label("avg_cost"),
        func.avg(ChurnOutput.resign_proba).label("avg_risk"),
        func.sum(case((ChurnOutput.resign_proba >= high_thresh, 1), else_=0)).label("high_risk"),
    ).select_from(HRDataInput).outerjoin(
        ChurnOutput,
        and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.structure_name.ilike(f"%{department}%")
    )

    result = await db.execute(query)
    row = result.fetchone()

    if not row or not row.headcount:
        return None

    snapshot = {
        "department": department,
        "headcount": int(row.headcount or 0),
        "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
        "avgCost": float(row.avg_cost) if row.avg_cost else 0,
        "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
        "highRiskCount": int(row.high_risk or 0),
    }

    # Cache the result
    await cache.set(cache_key, json.dumps(snapshot), ttl)
    logger.debug(f"Cached department snapshot for {department} in dataset {dataset_id}")

    return snapshot


async def get_cached_manager_team_summary(
    db: AsyncSession,
    dataset_id: str,
    manager_id: str,
    ttl: int = CacheTTL.SHORT
) -> Optional[Dict[str, Any]]:
    """
    Get cached manager team summary.
    Cache TTL: 60 seconds (SHORT)
    """
    if not manager_id:
        return None

    cache = await get_cache()
    cache_key = _make_cache_key("manager_team", dataset_id, manager_id)

    # Try cache first
    cached = await cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached)
        except json.JSONDecodeError:
            pass

    # Get data-driven risk thresholds
    high_thresh, _ = _get_risk_thresholds(dataset_id)

    # Execute query with data-driven thresholds
    query = select(
        func.count().label("team_size"),
        func.avg(HRDataInput.tenure).label("avg_tenure"),
        func.avg(HRDataInput.employee_cost).label("avg_cost"),
        func.avg(ChurnOutput.resign_proba).label("avg_risk"),
        func.sum(case((ChurnOutput.resign_proba >= high_thresh, 1), else_=0)).label("high_risk"),
    ).select_from(HRDataInput).outerjoin(
        ChurnOutput,
        and_(ChurnOutput.hr_code == HRDataInput.hr_code, ChurnOutput.dataset_id == dataset_id)
    ).where(
        HRDataInput.manager_id == manager_id,
        HRDataInput.dataset_id == dataset_id
    )

    result = await db.execute(query)
    row = result.fetchone()

    if not row or not row.team_size:
        return None

    summary = {
        "managerId": manager_id,
        "teamSize": int(row.team_size or 0),
        "avgTenure": float(row.avg_tenure) if row.avg_tenure else 0,
        "avgCost": float(row.avg_cost) if row.avg_cost else 0,
        "avgRisk": float(row.avg_risk) if row.avg_risk else 0,
        "highRiskCount": int(row.high_risk or 0),
    }

    # Cache the result
    await cache.set(cache_key, json.dumps(summary), ttl)
    logger.debug(f"Cached manager team summary for {manager_id} in dataset {dataset_id}")

    return summary


async def invalidate_dataset_cache(dataset_id: str) -> int:
    """Invalidate all cached data for a dataset."""
    cache = await get_cache()
    patterns = [
        f"company_overview:*{dataset_id}*",
        f"workforce_stats:*{dataset_id}*",
        f"dept_snapshot:*{dataset_id}*",
        f"manager_team:*{dataset_id}*",
    ]
    total = 0
    for pattern in patterns:
        total += await cache.clear_pattern(pattern)
    logger.info(f"Invalidated {total} cache entries for dataset {dataset_id}")
    return total
