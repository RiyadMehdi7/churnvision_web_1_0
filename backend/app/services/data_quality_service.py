"""
Data Quality Assessment Service

Automatically evaluates uploaded data or database connections to determine
if the data is suitable for churn prediction modeling.

Provides:
- ML readiness score (0-100)
- Specific issues and warnings
- Actionable recommendations
- Feature availability mapping
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class IssueSeverity(str, Enum):
    """Severity levels for data quality issues."""

    CRITICAL = "critical"  # Blocks ML training entirely
    WARNING = "warning"  # Reduces model quality
    INFO = "info"  # Suggestions for improvement


@dataclass
class DataQualityIssue:
    """A single data quality issue."""

    severity: IssueSeverity
    category: str
    message: str
    recommendation: str
    affected_column: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@dataclass
class FeatureAvailability:
    """Tracks which ML features are available in the data."""

    feature_name: str
    required: bool
    found: bool
    mapped_column: Optional[str] = None
    quality_score: float = 0.0  # 0-1, how good is this feature's data
    issues: List[str] = field(default_factory=list)


@dataclass
class DataQualityReport:
    """Complete data quality assessment report."""

    # Overall scores
    ml_readiness_score: int  # 0-100
    can_train_model: bool
    confidence_level: str  # "high", "medium", "low", "insufficient"

    # Counts
    total_rows: int
    total_columns: int
    churn_events: int
    churn_rate: float

    # Issues
    critical_issues: List[DataQualityIssue]
    warnings: List[DataQualityIssue]
    info: List[DataQualityIssue]

    # Feature mapping
    features: List[FeatureAvailability]
    missing_required_features: List[str]
    missing_optional_features: List[str]

    # Recommendations
    top_recommendations: List[str]

    # Metadata
    assessed_at: datetime = field(default_factory=datetime.utcnow)
    data_source: str = "upload"  # "upload", "database", "api"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "ml_readiness_score": self.ml_readiness_score,
            "can_train_model": self.can_train_model,
            "confidence_level": self.confidence_level,
            "total_rows": self.total_rows,
            "total_columns": self.total_columns,
            "churn_events": self.churn_events,
            "churn_rate": round(self.churn_rate * 100, 2),
            "critical_issues": [
                {
                    "severity": i.severity.value,
                    "category": i.category,
                    "message": i.message,
                    "recommendation": i.recommendation,
                    "affected_column": i.affected_column,
                }
                for i in self.critical_issues
            ],
            "warnings": [
                {
                    "severity": i.severity.value,
                    "category": i.category,
                    "message": i.message,
                    "recommendation": i.recommendation,
                    "affected_column": i.affected_column,
                }
                for i in self.warnings
            ],
            "info": [
                {
                    "severity": i.severity.value,
                    "category": i.category,
                    "message": i.message,
                    "recommendation": i.recommendation,
                }
                for i in self.info
            ],
            "features": [
                {
                    "feature_name": f.feature_name,
                    "required": f.required,
                    "found": f.found,
                    "mapped_column": f.mapped_column,
                    "quality_score": round(f.quality_score * 100, 1),
                    "issues": f.issues,
                }
                for f in self.features
            ],
            "missing_required_features": self.missing_required_features,
            "missing_optional_features": self.missing_optional_features,
            "top_recommendations": self.top_recommendations,
            "assessed_at": self.assessed_at.isoformat(),
            "data_source": self.data_source,
        }


class DataQualityService:
    """
    Service for assessing data quality before ML training.

    Checks for:
    - Target variable (churn/left column)
    - Minimum sample size
    - Class balance
    - Required features
    - Data types and ranges
    - Missing values
    - Outliers
    - Duplicates
    """

    # Feature definitions for churn prediction
    # Target column can be:
    # 1. Direct binary column: 'left', 'churn', 'churned', 'attrition', etc.
    # 2. Status column that we can derive churn from (matching ML model logic)
    REQUIRED_FEATURES = {
        "target": {
            "aliases": [
                "left",
                "churn",
                "churned",
                "attrition",
                "terminated",
                "resigned",
                "turnover",
            ],
            "type": "binary",
            "description": "Whether employee left (1) or stayed (0)",
        },
    }

    # Status column aliases - used to derive target if no direct target column found
    STATUS_COLUMN_ALIASES = [
        "status",
        "employment_status",
        "emp_status",
        "employee_status",
        "work_status",
        "current_status",
    ]

    # Values in status column that indicate employee left (matching ML model logic)
    LEFT_STATUS_INDICATORS = [
        "resign",
        "terminated",
        "left",
        "inactive",
        "exit",
        "departed",
        "quit",
        "dismissed",
        "separated",
    ]

    IMPORTANT_FEATURES = {
        "satisfaction_level": {
            "aliases": [
                "satisfaction",
                "satisfaction_score",
                "job_satisfaction",
                "employee_satisfaction",
                "sat_level",
            ],
            "type": "numeric",
            "range": (0, 1),
            "description": "Employee satisfaction score",
        },
        "last_evaluation": {
            "aliases": [
                "evaluation",
                "performance",
                "performance_score",
                "last_review",
                "review_score",
                "perf_score",
            ],
            "type": "numeric",
            "range": (0, 1),
            "description": "Last performance evaluation score",
        },
        "time_spend_company": {
            "aliases": [
                "tenure",
                "years_at_company",
                "service_years",
                "employment_length",
                "years_employed",
                "tenure_years",
            ],
            "type": "numeric",
            "range": (0, 50),
            "description": "Years at company",
        },
        "average_monthly_hours": {
            "aliases": [
                "monthly_hours",
                "avg_hours",
                "hours_worked",
                "work_hours",
                "avg_monthly_hours",
            ],
            "type": "numeric",
            "range": (50, 350),
            "description": "Average monthly working hours",
        },
        "number_project": {
            "aliases": ["projects", "num_projects", "project_count", "n_projects"],
            "type": "numeric",
            "range": (1, 20),
            "description": "Number of projects assigned",
        },
    }

    OPTIONAL_FEATURES = {
        "department": {
            "aliases": ["dept", "division", "team", "business_unit", "org_unit"],
            "type": "categorical",
            "description": "Department name",
        },
        "salary_level": {
            "aliases": [
                "salary",
                "salary_tier",
                "compensation_level",
                "pay_grade",
                "income_level",
            ],
            "type": "categorical",
            "description": "Salary tier (low/medium/high)",
        },
        "work_accident": {
            "aliases": ["accident", "has_accident", "workplace_accident", "injury"],
            "type": "binary",
            "description": "Had workplace accident",
        },
        "promotion_last_5years": {
            "aliases": ["promoted", "promotion", "recent_promotion", "was_promoted"],
            "type": "binary",
            "description": "Promoted in last 5 years",
        },
    }

    # Thresholds
    MIN_ROWS = 100
    MIN_CHURN_EVENTS = 30
    IDEAL_ROWS = 500
    IDEAL_CHURN_EVENTS = 100
    MAX_MISSING_RATIO = 0.3  # 30% missing is too much
    MIN_CHURN_RATE = 0.02  # Less than 2% churn is problematic
    MAX_CHURN_RATE = 0.50  # More than 50% churn is suspicious

    def __init__(self):
        self._column_cache: Dict[str, str] = {}

    def assess_dataframe(
        self, df: pd.DataFrame, data_source: str = "upload"
    ) -> DataQualityReport:
        """
        Perform comprehensive data quality assessment.

        Args:
            df: DataFrame to assess
            data_source: Source of data ("upload", "database", "api")

        Returns:
            DataQualityReport with findings
        """
        logger.info(
            f"Starting data quality assessment: {len(df)} rows, {len(df.columns)} columns"
        )

        issues: List[DataQualityIssue] = []
        features: List[FeatureAvailability] = []

        # Basic stats
        total_rows = len(df)
        total_columns = len(df.columns)

        # Check for empty data
        if total_rows == 0:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.CRITICAL,
                    category="data_size",
                    message="Dataset is empty",
                    recommendation="Upload a dataset with employee records",
                )
            )
            return self._build_report(
                issues, features, total_rows, total_columns, 0, 0.0, data_source
            )

        # 1. Find and validate target column
        target_col, target_issues, derived_target = self._find_target_column(df)
        issues.extend(target_issues)

        churn_events = 0
        churn_rate = 0.0

        if target_col:
            # Use derived target if available (from status column), otherwise use column directly
            if derived_target is not None:
                # Target was derived from status column
                target_series = derived_target
                quality_score = 0.9  # Slightly lower since it's derived
            else:
                # Direct target column
                try:
                    target_series = pd.to_numeric(
                        df[target_col], errors="coerce"
                    ).fillna(0)
                except Exception:
                    target_series = df[target_col].apply(
                        lambda x: 1
                        if str(x).lower() in ["1", "yes", "true", "left"]
                        else 0
                    )
                quality_score = 1.0

            # Reduce quality score if there were issues
            if any(i.severity == IssueSeverity.WARNING for i in target_issues):
                quality_score *= 0.7

            features.append(
                FeatureAvailability(
                    feature_name="target",
                    required=True,
                    found=True,
                    mapped_column=target_col,
                    quality_score=quality_score,
                )
            )
            churn_events = int(target_series.sum())
            churn_rate = churn_events / total_rows if total_rows > 0 else 0

            # Check class balance
            issues.extend(
                self._check_class_balance(churn_events, total_rows, churn_rate)
            )
        else:
            features.append(
                FeatureAvailability(
                    feature_name="target",
                    required=True,
                    found=False,
                    quality_score=0.0,
                    issues=["No churn/left or status column found"],
                )
            )

        # 2. Check sample size
        issues.extend(self._check_sample_size(total_rows, churn_events))

        # 3. Find and validate important features
        for feature_name, feature_def in self.IMPORTANT_FEATURES.items():
            fa, feature_issues = self._find_and_validate_feature(
                df, feature_name, feature_def, required=True
            )
            features.append(fa)
            issues.extend(feature_issues)

        # 4. Find and validate optional features
        for feature_name, feature_def in self.OPTIONAL_FEATURES.items():
            fa, feature_issues = self._find_and_validate_feature(
                df, feature_name, feature_def, required=False
            )
            features.append(fa)
            issues.extend(feature_issues)

        # 5. Check for duplicates
        issues.extend(self._check_duplicates(df))

        # 6. Check data types
        issues.extend(self._check_data_types(df))

        # 7. General data quality checks
        issues.extend(self._check_general_quality(df))

        return self._build_report(
            issues,
            features,
            total_rows,
            total_columns,
            churn_events,
            churn_rate,
            data_source,
        )

    def _find_target_column(
        self, df: pd.DataFrame
    ) -> Tuple[Optional[str], List[DataQualityIssue], Optional[pd.Series]]:
        """
        Find the churn/left target column.

        This matches the ML model's logic which:
        1. First looks for a direct 'left' or 'churn' column (binary 0/1)
        2. Falls back to deriving from 'status' column using keyword matching

        Returns:
            - target_col: Name of the target column (or 'status' if derived)
            - issues: List of any issues found
            - derived_target: If target was derived from status, the binary Series
        """
        issues = []
        columns_lower = {col.lower().strip(): col for col in df.columns}

        # === STEP 1: Look for direct binary target columns ===
        # Try exact matches first (left, churn, churned, attrition, etc.)
        for alias in self.REQUIRED_FEATURES["target"]["aliases"]:
            if alias in columns_lower:
                col = columns_lower[alias]
                unique_vals = df[col].dropna().unique()
                if len(unique_vals) <= 2:
                    # Check if values are binary-like (0/1, yes/no, true/false)
                    try:
                        # Try to convert to numeric
                        numeric_vals = pd.to_numeric(df[col], errors="coerce")
                        if numeric_vals.dropna().isin([0, 1]).all():
                            return col, issues, None
                    except Exception:
                        pass
                    # Still return if it looks binary
                    return col, issues, None
                else:
                    issues.append(
                        DataQualityIssue(
                            severity=IssueSeverity.WARNING,
                            category="target",
                            message=f"Column '{col}' has {len(unique_vals)} unique values, expected binary (0/1)",
                            recommendation="Ensure the target column only contains 0 (stayed) and 1 (left)",
                            affected_column=col,
                        )
                    )
                    return col, issues, None

        # Try fuzzy matching for direct target columns
        for col_lower, col in columns_lower.items():
            for alias in self.REQUIRED_FEATURES["target"]["aliases"]:
                if alias in col_lower or col_lower in alias:
                    unique_vals = df[col].dropna().unique()
                    if len(unique_vals) <= 2:
                        issues.append(
                            DataQualityIssue(
                                severity=IssueSeverity.INFO,
                                category="target",
                                message=f"Using '{col}' as target column (fuzzy match)",
                                recommendation="Confirm this is the correct churn indicator column",
                                affected_column=col,
                            )
                        )
                        return col, issues, None

        # === STEP 2: Try to derive target from 'status' column ===
        # This matches the ML model's logic in churn.py
        status_col = None
        for alias in self.STATUS_COLUMN_ALIASES:
            if alias in columns_lower:
                status_col = columns_lower[alias]
                break

        # Also try fuzzy match for status
        if not status_col:
            for col_lower, col in columns_lower.items():
                if "status" in col_lower:
                    status_col = col
                    break

        if status_col:
            # Derive 'left' from status using same logic as ML model
            def status_to_left(val) -> int:
                sval = str(val).strip().lower()
                if any(k in sval for k in self.LEFT_STATUS_INDICATORS):
                    return 1
                return 0

            derived_target = df[status_col].apply(status_to_left)
            churn_count = derived_target.sum()

            if churn_count > 0:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.INFO,
                        category="target",
                        message=f"Deriving churn target from '{status_col}' column (found {churn_count} churned employees)",
                        recommendation=f"Churn detected from status values containing: {', '.join(self.LEFT_STATUS_INDICATORS[:5])}",
                        affected_column=status_col,
                    )
                )
                return status_col, issues, derived_target
            else:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.WARNING,
                        category="target",
                        message=f"Found '{status_col}' column but no churned employees detected",
                        recommendation=f"Ensure status values for departed employees contain words like: {', '.join(self.LEFT_STATUS_INDICATORS[:5])}",
                        affected_column=status_col,
                        details={"unique_values": list(df[status_col].unique()[:10])},
                    )
                )
                return status_col, issues, derived_target

        # === STEP 3: Not found ===
        issues.append(
            DataQualityIssue(
                severity=IssueSeverity.CRITICAL,
                category="target",
                message="No churn/attrition target column found",
                recommendation="Add a 'status' column with employee status (e.g., 'Active', 'Resigned', 'Terminated') or a 'left' column with 0/1 values",
                details={
                    "searched_target_aliases": self.REQUIRED_FEATURES["target"][
                        "aliases"
                    ],
                    "searched_status_aliases": self.STATUS_COLUMN_ALIASES,
                },
            )
        )
        return None, issues, None

    def _check_class_balance(
        self, churn_events: int, total_rows: int, churn_rate: float
    ) -> List[DataQualityIssue]:
        """Check if churn classes are reasonably balanced."""
        issues = []

        if churn_rate < self.MIN_CHURN_RATE:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.WARNING,
                    category="class_balance",
                    message=f"Very low churn rate ({churn_rate:.1%}) - only {churn_events} churn events",
                    recommendation="Model may struggle with extreme class imbalance. Consider collecting more historical data with churn events.",
                    details={"churn_rate": churn_rate, "churn_events": churn_events},
                )
            )
        elif churn_rate > self.MAX_CHURN_RATE:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.WARNING,
                    category="class_balance",
                    message=f"Unusually high churn rate ({churn_rate:.1%})",
                    recommendation="Verify this data is representative. A 50%+ churn rate is uncommon.",
                    details={"churn_rate": churn_rate},
                )
            )

        return issues

    def _check_sample_size(
        self, total_rows: int, churn_events: int
    ) -> List[DataQualityIssue]:
        """Check if sample size is sufficient for ML."""
        issues = []

        if total_rows < self.MIN_ROWS:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.CRITICAL,
                    category="sample_size",
                    message=f"Dataset too small ({total_rows} rows). Minimum {self.MIN_ROWS} required.",
                    recommendation=f"Add more employee records. Ideal size is {self.IDEAL_ROWS}+ rows.",
                    details={
                        "current": total_rows,
                        "minimum": self.MIN_ROWS,
                        "ideal": self.IDEAL_ROWS,
                    },
                )
            )
        elif total_rows < self.IDEAL_ROWS:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.WARNING,
                    category="sample_size",
                    message=f"Dataset is small ({total_rows} rows). Model accuracy may be limited.",
                    recommendation=f"For better results, aim for {self.IDEAL_ROWS}+ employee records.",
                    details={"current": total_rows, "ideal": self.IDEAL_ROWS},
                )
            )

        if churn_events < self.MIN_CHURN_EVENTS:
            severity = (
                IssueSeverity.CRITICAL if churn_events < 10 else IssueSeverity.WARNING
            )
            issues.append(
                DataQualityIssue(
                    severity=severity,
                    category="churn_events",
                    message=f"Too few churn events ({churn_events}). Need {self.MIN_CHURN_EVENTS}+ for reliable predictions.",
                    recommendation="Include more historical data with employees who have left.",
                    details={
                        "current": churn_events,
                        "minimum": self.MIN_CHURN_EVENTS,
                        "ideal": self.IDEAL_CHURN_EVENTS,
                    },
                )
            )

        return issues

    def _find_and_validate_feature(
        self, df: pd.DataFrame, feature_name: str, feature_def: Dict, required: bool
    ) -> Tuple[FeatureAvailability, List[DataQualityIssue]]:
        """Find a feature column and validate its data quality."""
        issues = []
        columns_lower = {
            col.lower().strip().replace(" ", "_"): col for col in df.columns
        }

        # Try to find column
        found_col = None
        for alias in feature_def["aliases"]:
            alias_normalized = alias.lower().replace(" ", "_")
            if alias_normalized in columns_lower:
                found_col = columns_lower[alias_normalized]
                break
            # Fuzzy match
            for col_lower, col in columns_lower.items():
                if alias_normalized in col_lower or col_lower in alias_normalized:
                    found_col = col
                    break
            if found_col:
                break

        if not found_col:
            fa = FeatureAvailability(
                feature_name=feature_name,
                required=required,
                found=False,
                quality_score=0.0,
                issues=[
                    f"Column not found (searched: {', '.join(feature_def['aliases'][:3])})"
                ],
            )
            if required:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.WARNING,
                        category="missing_feature",
                        message=f"Important feature '{feature_name}' not found",
                        recommendation=f"Add a column for {feature_def['description']}",
                        details={"aliases": feature_def["aliases"]},
                    )
                )
            return fa, issues

        # Validate the column
        quality_score, col_issues = self._validate_column(
            df, found_col, feature_def["type"], feature_def.get("range")
        )

        fa = FeatureAvailability(
            feature_name=feature_name,
            required=required,
            found=True,
            mapped_column=found_col,
            quality_score=quality_score,
            issues=col_issues,
        )

        # Add issues if quality is poor
        if quality_score < 0.5 and required:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.WARNING,
                    category="feature_quality",
                    message=f"Feature '{feature_name}' has quality issues",
                    recommendation=f"Review column '{found_col}': {', '.join(col_issues[:2])}",
                    affected_column=found_col,
                )
            )

        return fa, issues

    def _validate_column(
        self,
        df: pd.DataFrame,
        col: str,
        expected_type: str,
        expected_range: Optional[Tuple[float, float]] = None,
    ) -> Tuple[float, List[str]]:
        """Validate a column's data quality. Returns (score, issues)."""
        issues = []
        score = 1.0

        series = df[col]

        # Check missing values
        missing_ratio = series.isna().mean()
        if missing_ratio > 0.5:
            issues.append(f"{missing_ratio:.0%} missing values")
            score -= 0.4
        elif missing_ratio > 0.2:
            issues.append(f"{missing_ratio:.0%} missing values")
            score -= 0.2
        elif missing_ratio > 0:
            issues.append(f"{missing_ratio:.0%} missing values")
            score -= 0.1

        # Type-specific validation
        if expected_type == "numeric":
            # Check if actually numeric
            if not pd.api.types.is_numeric_dtype(series):
                # Try to convert
                try:
                    numeric_series = pd.to_numeric(series, errors="coerce")
                    coerced_missing = numeric_series.isna().mean() - missing_ratio
                    if coerced_missing > 0.1:
                        issues.append(f"Non-numeric values present")
                        score -= 0.3
                except Exception:
                    issues.append("Column is not numeric")
                    score -= 0.5

            # Check range
            if expected_range:
                numeric_vals = pd.to_numeric(series, errors="coerce").dropna()
                if len(numeric_vals) > 0:
                    min_val, max_val = numeric_vals.min(), numeric_vals.max()
                    if (
                        min_val < expected_range[0] * 0.5
                        or max_val > expected_range[1] * 2
                    ):
                        issues.append(
                            f"Values outside expected range [{expected_range[0]}-{expected_range[1]}]"
                        )
                        score -= 0.1

        elif expected_type == "categorical":
            unique_count = series.nunique()
            if unique_count > 100:
                issues.append(f"Too many categories ({unique_count})")
                score -= 0.2
            elif unique_count == 1:
                issues.append("Only one category (no variance)")
                score -= 0.3

        elif expected_type == "binary":
            unique_vals = series.dropna().unique()
            if len(unique_vals) > 2:
                issues.append(f"Expected binary, found {len(unique_vals)} values")
                score -= 0.3

        return max(0, score), issues

    def _check_duplicates(self, df: pd.DataFrame) -> List[DataQualityIssue]:
        """Check for duplicate rows."""
        issues = []

        dup_count = df.duplicated().sum()
        if dup_count > 0:
            dup_ratio = dup_count / len(df)
            if dup_ratio > 0.1:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.WARNING,
                        category="duplicates",
                        message=f"{dup_count} duplicate rows ({dup_ratio:.1%} of data)",
                        recommendation="Remove duplicate records before training",
                    )
                )
            else:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.INFO,
                        category="duplicates",
                        message=f"{dup_count} duplicate rows found",
                        recommendation="Consider removing duplicates",
                    )
                )

        return issues

    def _check_data_types(self, df: pd.DataFrame) -> List[DataQualityIssue]:
        """Check for data type issues."""
        issues = []

        # Check for object columns that should be numeric
        for col in df.columns:
            if df[col].dtype == "object":
                # Try to detect if it should be numeric
                try:
                    numeric = pd.to_numeric(df[col], errors="coerce")
                    valid_ratio = numeric.notna().mean()
                    if valid_ratio > 0.8:
                        issues.append(
                            DataQualityIssue(
                                severity=IssueSeverity.INFO,
                                category="data_type",
                                message=f"Column '{col}' appears numeric but stored as text",
                                recommendation="Convert to numeric type for better model performance",
                                affected_column=col,
                            )
                        )
                except Exception:
                    pass

        return issues

    def _check_general_quality(self, df: pd.DataFrame) -> List[DataQualityIssue]:
        """General data quality checks."""
        issues = []

        # Check for columns with all same values
        for col in df.columns:
            if df[col].nunique() == 1:
                issues.append(
                    DataQualityIssue(
                        severity=IssueSeverity.INFO,
                        category="zero_variance",
                        message=f"Column '{col}' has only one unique value",
                        recommendation="This column won't help prediction and can be removed",
                        affected_column=col,
                    )
                )

        # Check for very high missing ratio across all columns
        overall_missing = df.isna().mean().mean()
        if overall_missing > 0.3:
            issues.append(
                DataQualityIssue(
                    severity=IssueSeverity.WARNING,
                    category="missing_data",
                    message=f"High overall missing data rate ({overall_missing:.1%})",
                    recommendation="Fill missing values or collect more complete data",
                )
            )

        return issues

    def _build_report(
        self,
        issues: List[DataQualityIssue],
        features: List[FeatureAvailability],
        total_rows: int,
        total_columns: int,
        churn_events: int,
        churn_rate: float,
        data_source: str,
    ) -> DataQualityReport:
        """Build the final quality report."""

        # Separate issues by severity
        critical = [i for i in issues if i.severity == IssueSeverity.CRITICAL]
        warnings = [i for i in issues if i.severity == IssueSeverity.WARNING]
        info = [i for i in issues if i.severity == IssueSeverity.INFO]

        # Calculate ML readiness score
        score = 100

        # Critical issues are severe penalties
        score -= len(critical) * 30

        # Warnings are moderate penalties
        score -= len(warnings) * 10

        # Feature availability bonus/penalty
        required_found = sum(1 for f in features if f.required and f.found)
        required_total = sum(1 for f in features if f.required)
        if required_total > 0:
            feature_ratio = required_found / required_total
            if feature_ratio < 0.5:
                score -= 20
            elif feature_ratio < 1.0:
                score -= 10

        # Sample size adjustment
        if total_rows >= self.IDEAL_ROWS:
            score += 5
        elif total_rows < self.MIN_ROWS:
            score -= 20

        # Churn events adjustment
        if churn_events >= self.IDEAL_CHURN_EVENTS:
            score += 5
        elif churn_events < self.MIN_CHURN_EVENTS:
            score -= 15

        # Clamp score
        score = max(0, min(100, score))

        # Determine if can train
        can_train = len(critical) == 0 and score >= 30

        # Confidence level
        if score >= 80:
            confidence = "high"
        elif score >= 60:
            confidence = "medium"
        elif score >= 40:
            confidence = "low"
        else:
            confidence = "insufficient"

        # Missing features
        missing_required = [
            f.feature_name for f in features if f.required and not f.found
        ]
        missing_optional = [
            f.feature_name for f in features if not f.required and not f.found
        ]

        # Top recommendations
        recommendations = []
        for issue in critical[:3]:
            recommendations.append(issue.recommendation)
        for issue in warnings[:2]:
            if issue.recommendation not in recommendations:
                recommendations.append(issue.recommendation)

        if not recommendations:
            if score >= 80:
                recommendations.append(
                    "Data looks good! You can proceed with model training."
                )
            else:
                recommendations.append(
                    "Consider addressing the warnings above for better model performance."
                )

        return DataQualityReport(
            ml_readiness_score=score,
            can_train_model=can_train,
            confidence_level=confidence,
            total_rows=total_rows,
            total_columns=total_columns,
            churn_events=churn_events,
            churn_rate=churn_rate,
            critical_issues=critical,
            warnings=warnings,
            info=info,
            features=features,
            missing_required_features=missing_required,
            missing_optional_features=missing_optional,
            top_recommendations=recommendations[:5],
            data_source=data_source,
        )


# Singleton instance
data_quality_service = DataQualityService()


def assess_data_quality(df: pd.DataFrame, source: str = "upload") -> DataQualityReport:
    """Convenience function for data quality assessment."""
    return data_quality_service.assess_dataframe(df, source)
