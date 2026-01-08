"""
Flexible Query Tool - Ad-hoc data analysis for any question

This is the most powerful tool in the toolkit - it allows the LLM to
construct custom queries with filtering, grouping, and aggregation.

Security is enforced through:
- Whitelist of allowed fields
- Whitelist of allowed operators
- Result limits
- No raw SQL execution
"""

from typing import Dict, Any, Optional, List
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_, or_, desc, asc
from sqlalchemy.sql.expression import ColumnElement

from app.services.tools.schema import ToolSchema, ToolDefinition, ToolCategory
from app.services.tools.registry import tool_registry
from app.models.hr_data import HRDataInput
from app.models.churn import ChurnOutput

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Definition
# =============================================================================

FLEXIBLE_QUERY_SCHEMA = ToolSchema(
    name="flexible_data_query",
    description="""Execute a flexible data query on employee data with custom filters, grouping, and aggregation.
This is the most powerful analysis tool - use it for complex questions that don't fit other tools.

Examples:
- "List top 5 highest paid employees in Engineering who are high risk"
- "Average salary by department for employees with tenure > 5 years"
- "Count employees grouped by risk level and department"

The query is built from:
- select_fields: Which data fields to return
- filters: Conditions to filter employees
- aggregation: Optional calculation (count, avg, sum, min, max)
- group_by: Optional grouping field
- order_by: How to sort results
- limit: Maximum results to return""",
    parameters={
        "type": "object",
        "properties": {
            "select_fields": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Fields to return: full_name, hr_code, position, department, tenure, salary, risk_score, risk_level, status"
            },
            "filters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "operator": {"type": "string", "enum": ["=", "!=", ">", "<", ">=", "<=", "contains", "in"]},
                        "value": {}
                    },
                    "required": ["field", "operator", "value"]
                },
                "description": "Filter conditions. Each filter has field, operator, and value."
            },
            "aggregation": {
                "type": "object",
                "properties": {
                    "function": {"type": "string", "enum": ["count", "avg", "sum", "min", "max"]},
                    "field": {"type": "string", "description": "Field to aggregate (use '*' for count)"}
                },
                "description": "Aggregation to apply"
            },
            "group_by": {
                "type": "string",
                "description": "Field to group results by (department, position, risk_level, status)"
            },
            "order_by": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "direction": {"type": "string", "enum": ["asc", "desc"]}
                },
                "description": "How to sort results"
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results (default 10, max 100)"
            }
        },
        "required": []
    }
)

FLEXIBLE_QUERY_DEF = ToolDefinition(
    tool_schema=FLEXIBLE_QUERY_SCHEMA,
    category=ToolCategory.ANALYSIS,
    requires_dataset=True,
    max_execution_time_ms=30000
)


# =============================================================================
# Field Mapping
# =============================================================================

# Map user-friendly field names to SQLAlchemy columns
FIELD_MAPPING = {
    "full_name": lambda: HRDataInput.full_name,
    "hr_code": lambda: HRDataInput.hr_code,
    "position": lambda: HRDataInput.position,
    "department": lambda: HRDataInput.structure_name,
    "structure_name": lambda: HRDataInput.structure_name,
    "tenure": lambda: HRDataInput.tenure,
    "salary": lambda: HRDataInput.employee_cost,
    "employee_cost": lambda: HRDataInput.employee_cost,
    "status": lambda: HRDataInput.status,
    "manager_id": lambda: HRDataInput.manager_id,
    "report_date": lambda: HRDataInput.report_date,
    "termination_date": lambda: HRDataInput.termination_date,
}

# Fields that require join with ChurnOutput
CHURN_FIELDS = {"risk_score", "resign_proba", "risk_level"}

# Valid operators
VALID_OPERATORS = {"=", "!=", ">", "<", ">=", "<=", "contains", "in", "not_in"}

# Maximum results
MAX_LIMIT = 100
DEFAULT_LIMIT = 10


# =============================================================================
# Tool Handler
# =============================================================================

@tool_registry.register(FLEXIBLE_QUERY_DEF)
async def flexible_data_query(
    db: AsyncSession,
    dataset_id: str,
    employee_context: Optional[Dict[str, Any]] = None,
    select_fields: Optional[List[str]] = None,
    filters: Optional[List[Dict[str, Any]]] = None,
    aggregation: Optional[Dict[str, str]] = None,
    group_by: Optional[str] = None,
    order_by: Optional[Dict[str, str]] = None,
    limit: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Execute a flexible query on employee data.

    This function builds a dynamic SQLAlchemy query based on the parameters.
    """
    # Set defaults
    select_fields = select_fields or ["full_name", "department", "position"]
    filters = filters or []
    limit = min(limit or DEFAULT_LIMIT, MAX_LIMIT)

    # Check if we need to join with ChurnOutput
    needs_churn_join = _needs_churn_join(select_fields, filters, group_by, aggregation)

    try:
        if aggregation:
            return await _execute_aggregation_query(
                db, dataset_id, filters, aggregation, group_by, needs_churn_join
            )
        else:
            return await _execute_select_query(
                db, dataset_id, select_fields, filters, order_by, limit, needs_churn_join
            )
    except Exception as e:
        logger.exception(f"Flexible query failed: {e}")
        return {"error": str(e)}


async def _execute_select_query(
    db: AsyncSession,
    dataset_id: str,
    select_fields: List[str],
    filters: List[Dict[str, Any]],
    order_by: Optional[Dict[str, str]],
    limit: int,
    needs_churn_join: bool
) -> Dict[str, Any]:
    """Execute a SELECT query returning individual records"""

    # Build select columns
    columns = []
    column_names = []

    for field in select_fields:
        col = _get_column(field)
        if col is not None:
            columns.append(col.label(field))
            column_names.append(field)
        elif field == "risk_score":
            # Will be added from join
            column_names.append("risk_score")
        elif field == "risk_level":
            column_names.append("risk_level")

    # Start building query
    if needs_churn_join:
        # Create subquery for churn data
        churn_subquery = select(
            ChurnOutput.hr_code,
            ChurnOutput.resign_proba.label("risk_score")
        ).where(
            ChurnOutput.dataset_id == dataset_id
        ).distinct(ChurnOutput.hr_code).subquery()

        # Build main query with join
        query = select(*columns).select_from(HRDataInput).outerjoin(
            churn_subquery,
            HRDataInput.hr_code == churn_subquery.c.hr_code
        )

        if "risk_score" in column_names:
            columns.append(churn_subquery.c.risk_score.label("risk_score"))
    else:
        query = select(*columns).select_from(HRDataInput)

    # Add dataset filter
    query = query.where(HRDataInput.dataset_id == dataset_id)

    # Apply filters
    conditions = _build_filter_conditions(filters, dataset_id)
    if conditions:
        query = query.where(and_(*conditions))

    # Apply ordering
    if order_by:
        order_col = _get_column(order_by.get("field", ""))
        if order_col is not None:
            direction = order_by.get("direction", "asc")
            if direction == "desc":
                query = query.order_by(desc(order_col))
            else:
                query = query.order_by(asc(order_col))

    # Apply limit
    query = query.limit(limit)

    # Execute
    result = await db.execute(query)
    rows = result.all()

    # Format results
    records = []
    for row in rows:
        record = {}
        for i, name in enumerate(column_names):
            if i < len(row):
                value = row[i]
                # Format values
                if name in ("salary", "employee_cost"):
                    record[name] = float(value) if value else 0
                elif name in ("tenure",):
                    record[name] = round(float(value), 1) if value else 0
                elif name == "risk_score":
                    record[name] = round(float(value) * 100, 1) if value else None
                    # Also add risk level
                    if value:
                        if value >= 0.7:
                            record["risk_level"] = "high"
                        elif value >= 0.4:
                            record["risk_level"] = "medium"
                        else:
                            record["risk_level"] = "low"
                else:
                    record[name] = str(value) if value else None
        records.append(record)

    return {
        "results": records,
        "count": len(records),
        "limit": limit,
        "fields": column_names
    }


async def _execute_aggregation_query(
    db: AsyncSession,
    dataset_id: str,
    filters: List[Dict[str, Any]],
    aggregation: Dict[str, str],
    group_by: Optional[str],
    needs_churn_join: bool
) -> Dict[str, Any]:
    """Execute an aggregation query"""

    agg_function = aggregation.get("function", "count")
    agg_field = aggregation.get("field", "*")

    # Get aggregation function
    if agg_function == "count":
        agg_col = func.count()
    else:
        field_col = _get_column(agg_field)
        if field_col is None:
            return {"error": f"Invalid aggregation field: {agg_field}"}

        agg_funcs = {
            "avg": func.avg,
            "sum": func.sum,
            "min": func.min,
            "max": func.max
        }
        agg_col = agg_funcs[agg_function](field_col)

    # Build query
    if group_by:
        group_col = _get_column(group_by)
        if group_col is None:
            return {"error": f"Invalid group_by field: {group_by}"}

        query = select(
            group_col.label("group"),
            agg_col.label("value")
        ).select_from(HRDataInput)
    else:
        query = select(agg_col.label("value")).select_from(HRDataInput)

    # Add dataset filter
    query = query.where(HRDataInput.dataset_id == dataset_id)

    # Apply filters
    conditions = _build_filter_conditions(filters, dataset_id)
    if conditions:
        query = query.where(and_(*conditions))

    # Add grouping
    if group_by:
        group_col = _get_column(group_by)
        query = query.group_by(group_col)

    # Execute
    result = await db.execute(query)

    if group_by:
        rows = result.all()
        grouped_results = {}
        for row in rows:
            key = str(row.group) if row.group else "Unknown"
            value = row.value
            if value is not None:
                if agg_function in ("avg", "sum"):
                    value = round(float(value), 2)
                else:
                    value = int(value) if agg_function == "count" else float(value)
            grouped_results[key] = value

        return {
            "aggregation": agg_function,
            "field": agg_field,
            "grouped_by": group_by,
            "results": grouped_results,
            "total_groups": len(grouped_results)
        }
    else:
        row = result.one()
        value = row.value
        if value is not None:
            if agg_function in ("avg", "sum"):
                value = round(float(value), 2)
            else:
                value = int(value) if agg_function == "count" else float(value)

        return {
            "aggregation": agg_function,
            "field": agg_field,
            "value": value
        }


def _needs_churn_join(
    select_fields: Optional[List[str]],
    filters: Optional[List[Dict[str, Any]]],
    group_by: Optional[str],
    aggregation: Optional[Dict[str, str]]
) -> bool:
    """Check if query needs to join with ChurnOutput"""
    # Check select fields
    if select_fields:
        for field in select_fields:
            if field in CHURN_FIELDS:
                return True

    # Check filters
    if filters:
        for f in filters:
            if f.get("field") in CHURN_FIELDS:
                return True

    # Check group_by
    if group_by in CHURN_FIELDS:
        return True

    # Check aggregation
    if aggregation and aggregation.get("field") in CHURN_FIELDS:
        return True

    return False


def _get_column(field_name: str) -> Optional[ColumnElement]:
    """Get SQLAlchemy column for a field name"""
    if field_name in FIELD_MAPPING:
        return FIELD_MAPPING[field_name]()
    return None


def _build_filter_conditions(
    filters: List[Dict[str, Any]],
    dataset_id: str
) -> List:
    """Build SQLAlchemy filter conditions from filter specs"""
    conditions = []

    for f in filters:
        field = f.get("field", "")
        operator = f.get("operator", "=")
        value = f.get("value")

        if not field or operator not in VALID_OPERATORS:
            continue

        # Handle special fields
        if field == "risk_level":
            # Convert risk_level to risk_score filter
            risk_ranges = {
                "high": (0.7, 1.0),
                "medium": (0.4, 0.7),
                "low": (0.0, 0.4)
            }
            if value in risk_ranges:
                low, high = risk_ranges[value]
                # This requires a subquery
                risk_subquery = select(ChurnOutput.hr_code).where(
                    ChurnOutput.dataset_id == dataset_id,
                    ChurnOutput.resign_proba >= low,
                    ChurnOutput.resign_proba < high
                ).scalar_subquery()
                conditions.append(HRDataInput.hr_code.in_(risk_subquery))
            continue

        # Get column
        col = _get_column(field)
        if col is None:
            continue

        # Build condition based on operator
        if operator == "=":
            if isinstance(value, str):
                conditions.append(col.ilike(f"%{value}%"))
            else:
                conditions.append(col == value)
        elif operator == "!=":
            conditions.append(col != value)
        elif operator == ">":
            conditions.append(col > value)
        elif operator == "<":
            conditions.append(col < value)
        elif operator == ">=":
            conditions.append(col >= value)
        elif operator == "<=":
            conditions.append(col <= value)
        elif operator == "contains":
            conditions.append(col.ilike(f"%{value}%"))
        elif operator == "in":
            if isinstance(value, list):
                conditions.append(col.in_(value))

    return conditions
