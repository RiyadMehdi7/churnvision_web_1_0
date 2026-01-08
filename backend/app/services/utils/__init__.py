# Shared Utilities Package
# Common helper functions used across multiple services

from app.services.utils.risk_helpers import (
    get_risk_thresholds,
    get_risk_level,
    get_priority_from_risk,
    get_urgency_and_focus,
    RiskLevel,
)
from app.services.utils.json_helpers import (
    parse_json_response,
    clean_json_string,
    safe_json_loads,
    parse_json_field,
)
from app.services.utils.employee_helpers import (
    get_employee_by_hr_code,
    get_churn_data_by_hr_code,
    get_churn_reasoning_by_hr_code,
    get_eltv_data_by_hr_code,
    get_interview_data_by_hr_code,
    get_treatment_history_by_hr_code,
)

__all__ = [
    # Risk helpers
    "get_risk_thresholds",
    "get_risk_level",
    "get_priority_from_risk",
    "get_urgency_and_focus",
    "RiskLevel",
    # JSON helpers
    "parse_json_response",
    "clean_json_string",
    "safe_json_loads",
    "parse_json_field",
    # Employee helpers
    "get_employee_by_hr_code",
    "get_churn_data_by_hr_code",
    "get_churn_reasoning_by_hr_code",
    "get_eltv_data_by_hr_code",
    "get_interview_data_by_hr_code",
    "get_treatment_history_by_hr_code",
]
