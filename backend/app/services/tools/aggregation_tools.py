"""
Aggregation Tools - Tools for counting and aggregating employee data

These tools provide aggregate views of workforce data:
- Count employees with filters
- Calculate averages, sums, min/max
- Group by department, position, etc.
- Get company and department overviews
"""

from typing import Dict, Any, Optional, List, Literal
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.sql import expression

from app.services.tools.schema import ToolSchema, ToolDefinition, ToolCategory
from app.services.tools.registry import tool_registry
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Definitions
# =============================================================================

COUNT_EMPLOYEES_SCHEMA = ToolSchema(
    name="count_employees",
    description="""Count employees matching specific criteria.
Use this for questions like:
- "How many employees are in Engineering?"
- "Count high-risk employees"
- "How many people have tenure > 5 years?"
Returns the count and a breakdown if group_by is specified.""",
    parameters={
        "type": "object",
        "properties": {
            "department": {
                "type": "string",
                "description": "Filter by department name (partial match supported)"
            },
            "position": {
                "type": "string",
                "description": "Filter by position/job title (partial match supported)"
            },
            "status": {
                "type": "string",
                "enum": ["active", "terminated", "all"],
                "description": "Filter by employment status (default: active)"
            },
            "tenure_min": {
                "type": "number",
                "description": "Minimum tenure in years"
            },
            "tenure_max": {
                "type": "number",
                "description": "Maximum tenure in years"
            },
            "salary_min": {
                "type": "number",
                "description": "Minimum salary/employee cost"
            },
            "salary_max": {
                "type": "number",
                "description": "Maximum salary/employee cost"
            },
            "risk_level": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "Filter by churn risk level"
            },
            "group_by": {
                "type": "string",
                "enum": ["department", "position", "status", "risk_level"],
                "description": "Group results by this field"
            }
        },
        "required": []
    }
)

COUNT_EMPLOYEES_DEF = ToolDefinition(
    tool_schema=COUNT_EMPLOYEES_SCHEMA,
    category=ToolCategory.AGGREGATION,
    requires_dataset=True
)


AGGREGATE_METRICS_SCHEMA = ToolSchema(
    name="aggregate_metrics",
    description="""Calculate statistics (average, sum, count, min, max) for employee metrics.
Use this for questions like:
- "What is the average salary in Engineering?"
- "Total cost of high-risk employees"
- "Maximum tenure in Sales"
Returns the calculated value and optional grouping.""",
    parameters={
        "type": "object",
        "properties": {
            "metric": {
                "type": "string",
                "enum": ["salary", "tenure", "risk_score", "employee_count"],
                "description": "The metric to aggregate"
            },
            "aggregation": {
                "type": "string",
                "enum": ["average", "sum", "count", "min", "max"],
                "description": "Type of aggregation to perform"
            },
            "department": {
                "type": "string",
                "description": "Filter by department"
            },
            "position": {
                "type": "string",
                "description": "Filter by position"
            },
            "status": {
                "type": "string",
                "enum": ["active", "terminated", "all"],
                "description": "Filter by status (default: active)"
            },
            "risk_level": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "Filter by risk level"
            },
            "group_by": {
                "type": "string",
                "enum": ["department", "position", "risk_level"],
                "description": "Group results by this field"
            }
        },
        "required": ["metric", "aggregation"]
    }
)

AGGREGATE_METRICS_DEF = ToolDefinition(
    tool_schema=AGGREGATE_METRICS_SCHEMA,
    category=ToolCategory.AGGREGATION,
    requires_dataset=True
)


GET_COMPANY_OVERVIEW_SCHEMA = ToolSchema(
    name="get_company_overview",
    description="""Get a high-level overview of the entire company/workforce.
Returns: total employees, active count, average tenure, average salary,
risk distribution, and department breakdown.
Use this for general company-wide questions.""",
    parameters={
        "type": "object",
        "properties": {},
        "required": []
    }
)

GET_COMPANY_OVERVIEW_DEF = ToolDefinition(
    tool_schema=GET_COMPANY_OVERVIEW_SCHEMA,
    category=ToolCategory.AGGREGATION,
    requires_dataset=True,
    cacheable=True,
    cache_ttl_seconds=60
)


GET_DEPARTMENT_STATS_SCHEMA = ToolSchema(
    name="get_department_stats",
    description="""Get detailed statistics for a specific department.
Returns: headcount, average tenure, average salary, risk distribution,
top positions, and comparison to company averages.
Use this for department-specific questions.""",
    parameters={
        "type": "object",
        "properties": {
            "department": {
                "type": "string",
                "description": "Department name (required)"
            }
        },
        "required": ["department"]
    }
)

GET_DEPARTMENT_STATS_DEF = ToolDefinition(
    tool_schema=GET_DEPARTMENT_STATS_SCHEMA,
    category=ToolCategory.AGGREGATION,
    requires_dataset=True
)


# =============================================================================
# Tool Handlers
# =============================================================================

@tool_registry.register(COUNT_EMPLOYEES_DEF)
async def count_employees(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    department: Optional[str] = None,
    position: Optional[str] = None,
    status: Optional[str] = "active",
    tenure_min: Optional[float] = None,
    tenure_max: Optional[float] = None,
    salary_min: Optional[float] = None,
    salary_max: Optional[float] = None,
    risk_level: Optional[str] = None,
    group_by: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Count employees with optional filters and grouping.
    """
    # Base query
    conditions = [HRDataInput.dataset_id == dataset_id]

    # Status filter
    if status and status != "all":
        if status.lower() == "active":
            conditions.append(HRDataInput.status.ilike("%active%"))
        elif status.lower() == "terminated":
            conditions.append(HRDataInput.status.ilike("%terminated%"))

    # Department filter
    if department:
        conditions.append(HRDataInput.structure_name.ilike(f"%{department}%"))

    # Position filter
    if position:
        conditions.append(HRDataInput.position.ilike(f"%{position}%"))

    # Tenure filters
    if tenure_min is not None:
        conditions.append(HRDataInput.tenure >= tenure_min)
    if tenure_max is not None:
        conditions.append(HRDataInput.tenure <= tenure_max)

    # Salary filters
    if salary_min is not None:
        conditions.append(HRDataInput.employee_cost >= salary_min)
    if salary_max is not None:
        conditions.append(HRDataInput.employee_cost <= salary_max)

    # Risk level filter (requires join with ChurnOutput)
    if risk_level:
        # Subquery to get hr_codes matching risk level
        risk_thresholds = {"high": 0.7, "medium": 0.4, "low": 0.0}
        risk_upper = {"high": 1.0, "medium": 0.7, "low": 0.4}

        risk_subquery = select(ChurnOutput.hr_code).where(
            ChurnOutput.dataset_id == dataset_id,
            ChurnOutput.resign_proba >= risk_thresholds.get(risk_level, 0),
            ChurnOutput.resign_proba < risk_upper.get(risk_level, 1.0)
        ).scalar_subquery()

        conditions.append(HRDataInput.hr_code.in_(risk_subquery))

    # Build query based on grouping
    if group_by:
        group_column = _get_group_column(group_by)
        if group_column is None:
            return {"error": f"Invalid group_by field: {group_by}"}

        query = select(
            group_column.label("group"),
            func.count().label("count")
        ).where(and_(*conditions)).group_by(group_column)

        result = await db.execute(query)
        rows = result.all()

        groups = {str(row.group): row.count for row in rows}
        total = sum(groups.values())

        return {
            "total_count": total,
            "grouped_by": group_by,
            "breakdown": groups,
            "filters_applied": _describe_filters(
                department, position, status, tenure_min, tenure_max,
                salary_min, salary_max, risk_level
            )
        }
    else:
        query = select(func.count()).select_from(HRDataInput).where(and_(*conditions))
        result = await db.execute(query)
        count = result.scalar() or 0

        return {
            "count": count,
            "filters_applied": _describe_filters(
                department, position, status, tenure_min, tenure_max,
                salary_min, salary_max, risk_level
            )
        }


@tool_registry.register(AGGREGATE_METRICS_DEF)
async def aggregate_metrics(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    metric: str = "salary",
    aggregation: str = "average",
    department: Optional[str] = None,
    position: Optional[str] = None,
    status: Optional[str] = "active",
    risk_level: Optional[str] = None,
    group_by: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Calculate aggregate statistics for employee metrics.
    """
    # Get the metric column
    metric_column = _get_metric_column(metric)
    if metric_column is None:
        return {"error": f"Invalid metric: {metric}"}

    # Get the aggregation function
    agg_func = _get_agg_function(aggregation, metric_column)
    if agg_func is None:
        return {"error": f"Invalid aggregation: {aggregation}"}

    # Build conditions
    conditions = [HRDataInput.dataset_id == dataset_id]

    if status and status != "all":
        if status.lower() == "active":
            conditions.append(HRDataInput.status.ilike("%active%"))
        elif status.lower() == "terminated":
            conditions.append(HRDataInput.status.ilike("%terminated%"))

    if department:
        conditions.append(HRDataInput.structure_name.ilike(f"%{department}%"))

    if position:
        conditions.append(HRDataInput.position.ilike(f"%{position}%"))

    # Risk level filter
    if risk_level:
        risk_thresholds = {"high": 0.7, "medium": 0.4, "low": 0.0}
        risk_upper = {"high": 1.0, "medium": 0.7, "low": 0.4}

        risk_subquery = select(ChurnOutput.hr_code).where(
            ChurnOutput.dataset_id == dataset_id,
            ChurnOutput.resign_proba >= risk_thresholds.get(risk_level, 0),
            ChurnOutput.resign_proba < risk_upper.get(risk_level, 1.0)
        ).scalar_subquery()

        conditions.append(HRDataInput.hr_code.in_(risk_subquery))

    # Build query based on grouping
    if group_by:
        group_column = _get_group_column(group_by)
        if group_column is None:
            return {"error": f"Invalid group_by field: {group_by}"}

        query = select(
            group_column.label("group"),
            agg_func.label("value")
        ).where(and_(*conditions)).group_by(group_column)

        result = await db.execute(query)
        rows = result.all()

        groups = {
            str(row.group): round(float(row.value), 2) if row.value else 0
            for row in rows
        }

        return {
            "metric": metric,
            "aggregation": aggregation,
            "grouped_by": group_by,
            "results": groups
        }
    else:
        query = select(agg_func).select_from(HRDataInput).where(and_(*conditions))
        result = await db.execute(query)
        value = result.scalar()

        return {
            "metric": metric,
            "aggregation": aggregation,
            "value": round(float(value), 2) if value else 0,
            "filters_applied": _describe_filters(
                department, position, status, None, None, None, None, risk_level
            )
        }


@tool_registry.register(GET_COMPANY_OVERVIEW_DEF)
async def get_company_overview(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Get a comprehensive company overview.
    """
    # Total employees
    total_query = select(func.count()).select_from(HRDataInput).where(
        HRDataInput.dataset_id == dataset_id
    )
    total_result = await db.execute(total_query)
    total_employees = total_result.scalar() or 0

    # Active employees
    active_query = select(func.count()).select_from(HRDataInput).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.status.ilike("%active%")
    )
    active_result = await db.execute(active_query)
    active_employees = active_result.scalar() or 0

    # Average metrics
    avg_query = select(
        func.avg(HRDataInput.tenure).label("avg_tenure"),
        func.avg(HRDataInput.employee_cost).label("avg_salary"),
        func.sum(HRDataInput.employee_cost).label("total_cost")
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.status.ilike("%active%")
    )
    avg_result = await db.execute(avg_query)
    avg_row = avg_result.one()

    # Department breakdown
    dept_query = select(
        HRDataInput.structure_name,
        func.count().label("count")
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.status.ilike("%active%")
    ).group_by(HRDataInput.structure_name).order_by(func.count().desc())

    dept_result = await db.execute(dept_query)
    departments = {row.structure_name: row.count for row in dept_result.all()}

    # Risk distribution
    risk_query = select(
        func.count().label("total"),
        func.sum(case((ChurnOutput.resign_proba >= 0.7, 1), else_=0)).label("high_risk"),
        func.sum(case((and_(ChurnOutput.resign_proba >= 0.4, ChurnOutput.resign_proba < 0.7), 1), else_=0)).label("medium_risk"),
        func.sum(case((ChurnOutput.resign_proba < 0.4, 1), else_=0)).label("low_risk")
    ).select_from(ChurnOutput).where(ChurnOutput.dataset_id == dataset_id)

    risk_result = await db.execute(risk_query)
    risk_row = risk_result.one()

    return {
        "total_employees": total_employees,
        "active_employees": active_employees,
        "terminated_employees": total_employees - active_employees,
        "average_tenure_years": round(float(avg_row.avg_tenure or 0), 1),
        "average_salary": round(float(avg_row.avg_salary or 0), 2),
        "total_payroll_cost": round(float(avg_row.total_cost or 0), 2),
        "departments": departments,
        "department_count": len(departments),
        "risk_distribution": {
            "high_risk": risk_row.high_risk or 0,
            "medium_risk": risk_row.medium_risk or 0,
            "low_risk": risk_row.low_risk or 0
        }
    }


@tool_registry.register(GET_DEPARTMENT_STATS_DEF)
async def get_department_stats(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    department: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Get detailed statistics for a specific department.
    """
    if not department:
        return {"error": "Department name is required"}

    # Basic stats
    stats_query = select(
        func.count().label("headcount"),
        func.avg(HRDataInput.tenure).label("avg_tenure"),
        func.avg(HRDataInput.employee_cost).label("avg_salary"),
        func.sum(HRDataInput.employee_cost).label("total_cost"),
        func.min(HRDataInput.tenure).label("min_tenure"),
        func.max(HRDataInput.tenure).label("max_tenure")
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.structure_name.ilike(f"%{department}%"),
        HRDataInput.status.ilike("%active%")
    )

    stats_result = await db.execute(stats_query)
    stats = stats_result.one()

    if not stats.headcount:
        return {"error": f"Department '{department}' not found or has no active employees"}

    # Position breakdown
    position_query = select(
        HRDataInput.position,
        func.count().label("count")
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.structure_name.ilike(f"%{department}%"),
        HRDataInput.status.ilike("%active%")
    ).group_by(HRDataInput.position).order_by(func.count().desc()).limit(10)

    position_result = await db.execute(position_query)
    positions = {row.position: row.count for row in position_result.all()}

    # Risk in department
    risk_subquery = select(ChurnOutput.hr_code, ChurnOutput.resign_proba).where(
        ChurnOutput.dataset_id == dataset_id
    ).subquery()

    risk_query = select(
        func.count().label("total"),
        func.avg(risk_subquery.c.resign_proba).label("avg_risk"),
        func.sum(case((risk_subquery.c.resign_proba >= 0.7, 1), else_=0)).label("high_risk")
    ).select_from(HRDataInput).join(
        risk_subquery,
        HRDataInput.hr_code == risk_subquery.c.hr_code
    ).where(
        HRDataInput.dataset_id == dataset_id,
        HRDataInput.structure_name.ilike(f"%{department}%"),
        HRDataInput.status.ilike("%active%")
    )

    risk_result = await db.execute(risk_query)
    risk_stats = risk_result.one()

    return {
        "department": department,
        "headcount": stats.headcount,
        "average_tenure_years": round(float(stats.avg_tenure or 0), 1),
        "tenure_range": {
            "min": round(float(stats.min_tenure or 0), 1),
            "max": round(float(stats.max_tenure or 0), 1)
        },
        "average_salary": round(float(stats.avg_salary or 0), 2),
        "total_department_cost": round(float(stats.total_cost or 0), 2),
        "positions": positions,
        "risk_metrics": {
            "average_risk_score_percent": round(float(risk_stats.avg_risk or 0) * 100, 1),
            "high_risk_count": risk_stats.high_risk or 0,
            "high_risk_percent": round((risk_stats.high_risk or 0) / stats.headcount * 100, 1) if stats.headcount else 0
        }
    }


# =============================================================================
# Helper Functions
# =============================================================================

def _get_group_column(group_by: str):
    """Get the SQLAlchemy column for grouping"""
    columns = {
        "department": HRDataInput.structure_name,
        "position": HRDataInput.position,
        "status": HRDataInput.status,
    }
    return columns.get(group_by)


def _get_metric_column(metric: str):
    """Get the SQLAlchemy column for the metric"""
    columns = {
        "salary": HRDataInput.employee_cost,
        "tenure": HRDataInput.tenure,
        "employee_count": expression.literal(1),
    }
    return columns.get(metric)


def _get_agg_function(aggregation: str, column):
    """Get the SQLAlchemy aggregation function"""
    functions = {
        "average": func.avg(column),
        "sum": func.sum(column),
        "count": func.count(column),
        "min": func.min(column),
        "max": func.max(column),
    }
    return functions.get(aggregation)


def _describe_filters(
    department: Optional[str],
    position: Optional[str],
    status: Optional[str],
    tenure_min: Optional[float],
    tenure_max: Optional[float],
    salary_min: Optional[float],
    salary_max: Optional[float],
    risk_level: Optional[str]
) -> Dict[str, Any]:
    """Create a description of applied filters"""
    filters = {}
    if department:
        filters["department"] = department
    if position:
        filters["position"] = position
    if status and status != "all":
        filters["status"] = status
    if tenure_min is not None:
        filters["tenure_min"] = tenure_min
    if tenure_max is not None:
        filters["tenure_max"] = tenure_max
    if salary_min is not None:
        filters["salary_min"] = salary_min
    if salary_max is not None:
        filters["salary_max"] = salary_max
    if risk_level:
        filters["risk_level"] = risk_level
    return filters if filters else {"none": "No filters applied"}
