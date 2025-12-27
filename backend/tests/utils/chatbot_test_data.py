"""
Test Data for AI Chatbot Comprehensive Testing

Defines test messages for each of the 12 pattern types with expected behaviors.
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any


@dataclass
class PatternTestCase:
    """Test case for a specific pattern."""
    name: str
    pattern_type: str
    message: str
    action_type: Optional[str]  # For quick action mode
    requires_employee: bool
    expected_fields: List[str]  # Fields expected in structured_data
    description: str


# Pattern type constants (matching backend PatternType class)
PATTERN_CHURN_RISK_DIAGNOSIS = "churn_risk_diagnosis"
PATTERN_RETENTION_PLAN = "retention_plan"
PATTERN_EMPLOYEE_COMPARISON = "employee_comparison"
PATTERN_EMPLOYEE_COMPARISON_STAYED = "employee_comparison_stayed"
PATTERN_EXIT_PATTERN_MINING = "exit_pattern_mining"
PATTERN_WORKFORCE_TRENDS = "workforce_trends"
PATTERN_DEPARTMENT_ANALYSIS = "department_analysis"
PATTERN_SHAP_EXPLANATION = "shap_explanation"
PATTERN_EMAIL_ACTION = "email_action"
PATTERN_MEETING_ACTION = "meeting_action"
PATTERN_EMPLOYEE_INFO = "employee_info"
PATTERN_GENERAL_CHAT = "general_chat"


# Test cases for each pattern
PATTERN_TEST_CASES: List[PatternTestCase] = [
    PatternTestCase(
        name="Churn Risk Diagnosis",
        pattern_type=PATTERN_CHURN_RISK_DIAGNOSIS,
        message="Why is this employee at high risk of leaving?",
        action_type="diagnose",
        requires_employee=True,
        expected_fields=["type", "employee"],
        description="Analyzes why an employee is at risk of churning"
    ),
    PatternTestCase(
        name="Retention Plan",
        pattern_type=PATTERN_RETENTION_PLAN,
        message="Create a retention plan for this employee",
        action_type="retention_plan",
        requires_employee=True,
        expected_fields=["type", "employee"],
        description="Generates a personalized retention strategy"
    ),
    PatternTestCase(
        name="Compare with Resigned",
        pattern_type=PATTERN_EMPLOYEE_COMPARISON,
        message="Compare this employee with similar resigned employees",
        action_type="compare_resigned",
        requires_employee=True,
        expected_fields=["type"],
        description="Compares employee with those who left"
    ),
    PatternTestCase(
        name="Compare with Stayed",
        pattern_type=PATTERN_EMPLOYEE_COMPARISON_STAYED,
        message="Compare with employees who stayed and are retained",
        action_type="compare_stayed",
        requires_employee=True,
        expected_fields=["type"],
        description="Compares employee with those who stayed"
    ),
    PatternTestCase(
        name="Exit Pattern Mining",
        pattern_type=PATTERN_EXIT_PATTERN_MINING,
        message="Show me the common exit patterns in the organization",
        action_type="exit_patterns",
        requires_employee=False,
        expected_fields=["type"],
        description="Analyzes organizational exit trends"
    ),
    PatternTestCase(
        name="Workforce Trends",
        pattern_type=PATTERN_WORKFORCE_TRENDS,
        message="What are the workforce trends in our organization?",
        action_type="workforce_trends",
        requires_employee=False,
        expected_fields=["type"],
        description="Shows overall workforce statistics"
    ),
    PatternTestCase(
        name="Department Analysis",
        pattern_type=PATTERN_DEPARTMENT_ANALYSIS,
        message="Analyze the Sales department risk levels",
        action_type="department_analysis",
        requires_employee=False,
        expected_fields=["type"],
        description="Department-specific risk analysis"
    ),
    PatternTestCase(
        name="SHAP Explanation",
        pattern_type=PATTERN_SHAP_EXPLANATION,
        message="What factors contribute to this employee's risk score?",
        action_type="shap",
        requires_employee=True,
        expected_fields=["type"],
        description="Explains feature contributions to risk"
    ),
    PatternTestCase(
        name="Email Action",
        pattern_type=PATTERN_EMAIL_ACTION,
        message="Write an email to this employee about their performance review",
        action_type="email",
        requires_employee=True,
        expected_fields=["type"],
        description="Generates email draft for employee"
    ),
    PatternTestCase(
        name="Meeting Action",
        pattern_type=PATTERN_MEETING_ACTION,
        message="Schedule a one-on-one meeting with this employee",
        action_type="meeting",
        requires_employee=True,
        expected_fields=["type"],
        description="Creates meeting request"
    ),
    PatternTestCase(
        name="Employee Info",
        pattern_type=PATTERN_EMPLOYEE_INFO,
        message="Tell me about this employee",
        action_type="employee_info",
        requires_employee=True,
        expected_fields=["type"],
        description="Returns employee profile summary"
    ),
    PatternTestCase(
        name="General Chat",
        pattern_type=PATTERN_GENERAL_CHAT,
        message="What is employee churn and why does it matter?",
        action_type=None,  # No action type - uses LLM
        requires_employee=False,
        expected_fields=[],  # General chat returns text, not structured data
        description="Free-form LLM-powered response"
    ),
]


# Additional test messages for pattern detection validation
PATTERN_DETECTION_TESTS: Dict[str, List[str]] = {
    PATTERN_CHURN_RISK_DIAGNOSIS: [
        "Why is John at risk?",
        "Explain the risk for this employee",
        "What's causing the high churn probability?",
        "Diagnose risk factors",
    ],
    PATTERN_RETENTION_PLAN: [
        "Generate a retention plan",
        "How can we keep this employee?",
        "Create a strategy to prevent churn",
        "Retention playbook please",
    ],
    PATTERN_EMPLOYEE_COMPARISON: [
        "Compare with similar employees who left",
        "Show me resigned peers",
        "Who else left that was like this employee?",
    ],
    PATTERN_EMPLOYEE_COMPARISON_STAYED: [
        "Compare with retained employees",
        "Show similar employees who stayed",
        "Who's like this employee but didn't leave?",
    ],
    PATTERN_EXIT_PATTERN_MINING: [
        "Why do employees leave?",
        "Show exit patterns",
        "Common departure reasons",
        "Turnover patterns analysis",
    ],
    PATTERN_WORKFORCE_TRENDS: [
        "Overall churn trends",
        "Workforce analytics",
        "Organization-wide risk levels",
        "Company turnover statistics",
    ],
    PATTERN_DEPARTMENT_ANALYSIS: [
        "How is Engineering doing?",
        "Analyze the Finance team",
        "Department risk breakdown",
        "Team churn analysis",
    ],
    PATTERN_EMAIL_ACTION: [
        "Write an email to schedule a check-in",
        "Draft a message about career development",
        "Send an email about the performance review",
    ],
    PATTERN_MEETING_ACTION: [
        "Set up a 1:1 meeting",
        "Book a call with this employee",
        "Schedule a sync",
        "Arrange a check-in meeting",
    ],
    PATTERN_EMPLOYEE_INFO: [
        "Who is this person?",
        "Tell me about James",
        "Employee profile summary",
        "What do you know about this employee?",
    ],
}


# Edge case test messages
EDGE_CASE_TESTS: List[Dict[str, Any]] = [
    {
        "name": "Empty message",
        "message": "",
        "expected_error": True,
    },
    {
        "name": "Very long message",
        "message": "Please analyze " + "the employee risk factors " * 100,
        "expected_error": False,
    },
    {
        "name": "Special characters",
        "message": "What's the risk for employee 'John O'Brien' <script>alert('xss')</script>?",
        "expected_error": False,
    },
    {
        "name": "Unicode characters",
        "message": "Analyze risk for employee 田中太郎",
        "expected_error": False,
    },
    {
        "name": "SQL injection attempt",
        "message": "Tell me about employee'; DROP TABLE users; --",
        "expected_error": False,
    },
]


# Stress test configuration
STRESS_TEST_CONFIG = {
    "sequential_count": 10,  # Number of sequential requests
    "concurrent_count": 5,   # Number of concurrent requests
    "test_message": "What are the workforce trends?",  # Quick response expected
    "action_type": "workforce_trends",
}
