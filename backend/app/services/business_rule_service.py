"""
Business Rule Evaluation Service

Evaluates business rules against employee data to calculate heuristic risk adjustments.
Rules are stored in the database and can be customized per organization.

Rule Conditions use a simple expression language:
- Comparisons: tenure > 5, salary < 50000
- Boolean: is_manager == true
- Contains: department in ['IT', 'Engineering']
- Compound: tenure > 5 AND salary < 50000
- Percentile-based: comp_percentile < 25 (below P25 for peer group)
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from datetime import datetime
import re
import operator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.churn import BusinessRule
from app.services.peer_statistics_service import peer_statistics_service, PeerComparison


@dataclass
class RuleEvaluationResult:
    """Result of evaluating a single rule"""
    rule_id: int
    rule_name: str
    matched: bool
    adjustment: float  # Risk adjustment (-1 to 1)
    reason: str
    priority: int


@dataclass
class HeuristicResult:
    """Combined result of all heuristic rule evaluations"""
    heuristic_score: float  # Final heuristic-based risk (0-1)
    confidence: float  # Confidence in heuristic assessment (0-1)
    coverage: float  # What percentage of rules could be evaluated (0-1)
    triggered_rules: List[RuleEvaluationResult]
    alerts: List[str]  # High-priority alerts
    total_rules_evaluated: int
    adjustments_applied: List[Dict[str, Any]]


class BusinessRuleEvaluationService:
    """
    Service for evaluating business rules and calculating heuristic risk scores.
    """

    # Default rules (used if DB is empty)
    # NOTE: ALL rules use percentile-based comparisons for both compensation and tenure.
    # This is language-agnostic and adapts to any organization's data distribution.
    # Percentile fields (comp_percentile, tenure_percentile) are calculated dynamically.
    DEFAULT_RULES = [
        {
            'rule_id': 1,
            'rule_name': 'Below P25 Compensation',
            'rule_description': 'Compensation in bottom 25% of peer group increases risk',
            'rule_condition': 'comp_percentile < 25 AND tenure_percentile > 10',
            'adjustment_logic': '+0.15',
            'priority': 1,
            'alert_message': 'Compensation below P25 for peer group',
            'uses_percentile': True
        },
        {
            'rule_id': 2,
            'rule_name': 'Above P75 Compensation Stability',
            'rule_description': 'Top 25% compensated employees are more stable',
            'rule_condition': 'comp_percentile > 75',
            'adjustment_logic': '-0.10',
            'priority': 2,
            'uses_percentile': True
        },
        {
            'rule_id': 3,
            'rule_name': 'Mid-Tenure Transition Risk',
            'rule_description': 'Employees at P25-P50 tenure mark often reconsider career',
            'rule_condition': 'tenure_percentile >= 25 AND tenure_percentile <= 50',
            'adjustment_logic': '+0.08',
            'priority': 2,
            'uses_percentile': True
        },
        {
            'rule_id': 4,
            'rule_name': 'New Employee Risk',
            'rule_description': 'Bottom 10% tenure (newest employees) have highest turnover',
            'rule_condition': 'tenure_percentile < 10',
            'adjustment_logic': '+0.12',
            'priority': 1,
            'alert_message': 'New employee in critical adjustment period',
            'uses_percentile': True
        },
        {
            'rule_id': 5,
            'rule_name': 'Veteran Stability',
            'rule_description': 'Top 10% tenured employees are generally stable',
            'rule_condition': 'tenure_percentile > 90',
            'adjustment_logic': '-0.15',
            'priority': 2,
            'uses_percentile': True
        },
        {
            'rule_id': 6,
            'rule_name': 'Low Tenure High Cost Risk',
            'rule_description': 'New hires (bottom P25 tenure) in top P75 compensation are flight risks',
            'rule_condition': 'tenure_percentile < 25 AND comp_percentile > 75',
            'adjustment_logic': '+0.12',
            'priority': 1,
            'alert_message': 'High-cost new hire at risk',
            'uses_percentile': True
        },
        {
            'rule_id': 7,
            'rule_name': 'Experienced Underpaid Risk',
            'rule_description': 'Above median tenure but bottom quartile compensation are at risk',
            'rule_condition': 'tenure_percentile > 50 AND comp_percentile < 25',
            'adjustment_logic': '+0.15',
            'priority': 1,
            'alert_message': 'Experienced employee with below-P25 compensation',
            'uses_percentile': True
        },
        {
            'rule_id': 8,
            'rule_name': 'Early Tenure Stability',
            'rule_description': 'Employees past initial adjustment (P10-P25 tenure) are more stable',
            'rule_condition': 'tenure_percentile >= 10 AND tenure_percentile < 25',
            'adjustment_logic': '-0.05',
            'priority': 3,
            'uses_percentile': True
        },
        {
            'rule_id': 9,
            'rule_name': 'Senior Well-Compensated Stability',
            'rule_description': 'Top quartile tenure with above-median compensation are stable',
            'rule_condition': 'tenure_percentile > 75 AND comp_percentile > 50',
            'adjustment_logic': '-0.12',
            'priority': 2,
            'uses_percentile': True
        },
        {
            'rule_id': 10,
            'rule_name': 'Median Compensation Moderate Tenure Risk',
            'rule_description': 'Mid-range compensation (P25-P50) with moderate tenure (P25-P50) shows some risk',
            'rule_condition': 'comp_percentile >= 25 AND comp_percentile <= 50 AND tenure_percentile >= 25 AND tenure_percentile <= 50',
            'adjustment_logic': '+0.05',
            'priority': 3,
            'uses_percentile': True
        }
    ]

    # Operators for condition evaluation
    OPERATORS = {
        '==': operator.eq,
        '!=': operator.ne,
        '>': operator.gt,
        '>=': operator.ge,
        '<': operator.lt,
        '<=': operator.le,
    }

    def __init__(self):
        self._rules_cache: Optional[List[Dict]] = None
        self._cache_loaded_at: Optional[datetime] = None
        self._cache_ttl_hours = 1

    async def _load_rules_from_db(self, db: AsyncSession) -> List[Dict]:
        """Load rules from database"""
        try:
            query = select(BusinessRule).where(
                BusinessRule.is_active == 1
            ).order_by(BusinessRule.priority)
            result = await db.execute(query)
            db_rules = result.scalars().all()

            if not db_rules:
                return self.DEFAULT_RULES

            rules = []
            for rule in db_rules:
                rules.append({
                    'rule_id': rule.rule_id,
                    'rule_name': rule.rule_name,
                    'rule_description': rule.rule_description or '',
                    'rule_condition': rule.rule_condition,
                    'adjustment_logic': rule.adjustment_logic or '+0.0',
                    'priority': rule.priority or 1,
                    'is_custom': rule.is_custom == 1
                })

            return rules if rules else self.DEFAULT_RULES

        except Exception as e:
            print(f"Error loading rules from DB: {e}")
            return self.DEFAULT_RULES

    async def _get_rules(self, db: Optional[AsyncSession] = None) -> List[Dict]:
        """Get rules with caching"""
        now = datetime.utcnow()

        if (self._rules_cache is not None and
            self._cache_loaded_at is not None and
            (now - self._cache_loaded_at).total_seconds() < self._cache_ttl_hours * 3600):
            return self._rules_cache

        if db:
            self._rules_cache = await self._load_rules_from_db(db)
            self._cache_loaded_at = now
            return self._rules_cache

        return self.DEFAULT_RULES

    def _parse_value(self, value_str: str, employee_data: Dict[str, Any]) -> Any:
        """Parse a value from condition string"""
        value_str = value_str.strip()

        # Check if it's a field reference
        if value_str in employee_data:
            return employee_data[value_str]

        # Check for string literal
        if (value_str.startswith('"') and value_str.endswith('"')) or \
           (value_str.startswith("'") and value_str.endswith("'")):
            return value_str[1:-1].lower()

        # Check for boolean
        if value_str.lower() == 'true':
            return True
        if value_str.lower() == 'false':
            return False

        # Check for number
        try:
            if '.' in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass

        # Return as field reference
        return employee_data.get(value_str.lower(), None)

    def _evaluate_simple_condition(
        self,
        condition: str,
        employee_data: Dict[str, Any]
    ) -> Tuple[bool, bool]:
        """
        Evaluate a simple condition (single comparison).

        Returns:
            Tuple of (result, could_evaluate)
        """
        condition = condition.strip()

        # Handle CONTAINS operator
        if ' CONTAINS ' in condition.upper():
            parts = re.split(r'\s+CONTAINS\s+', condition, flags=re.IGNORECASE)
            if len(parts) == 2:
                field = parts[0].strip().lower()
                search_value = self._parse_value(parts[1], employee_data)

                field_value = employee_data.get(field)
                if field_value is None:
                    return False, False

                field_str = str(field_value).lower()
                search_str = str(search_value).lower()
                return search_str in field_str, True

        # Handle IN operator
        if ' IN ' in condition.upper():
            parts = re.split(r'\s+IN\s+', condition, flags=re.IGNORECASE)
            if len(parts) == 2:
                field = parts[0].strip().lower()
                list_str = parts[1].strip()

                field_value = employee_data.get(field)
                if field_value is None:
                    return False, False

                # Parse list
                list_values = re.findall(r"'([^']*)'|\"([^\"]*)\"|(\w+)", list_str)
                values = [v[0] or v[1] or v[2] for v in list_values if any(v)]

                return str(field_value).lower() in [v.lower() for v in values], True

        # Handle comparison operators
        for op_str, op_func in self.OPERATORS.items():
            if op_str in condition:
                parts = condition.split(op_str)
                if len(parts) == 2:
                    field = parts[0].strip().lower()
                    compare_value = self._parse_value(parts[1], employee_data)

                    field_value = employee_data.get(field)
                    if field_value is None:
                        return False, False

                    try:
                        # Convert to same types for comparison
                        if isinstance(compare_value, (int, float)):
                            field_value = float(field_value) if field_value else 0
                        elif isinstance(compare_value, str):
                            field_value = str(field_value).lower()
                            compare_value = compare_value.lower()

                        return op_func(field_value, compare_value), True
                    except (TypeError, ValueError):
                        return False, False

        return False, False

    def _evaluate_condition(
        self,
        condition: str,
        employee_data: Dict[str, Any]
    ) -> Tuple[bool, bool]:
        """
        Evaluate a compound condition with AND/OR logic.

        Returns:
            Tuple of (result, could_evaluate)
        """
        condition = condition.strip()

        # Handle OR conditions
        if ' OR ' in condition.upper():
            parts = re.split(r'\s+OR\s+', condition, flags=re.IGNORECASE)
            any_true = False
            all_evaluated = True

            for part in parts:
                result, evaluated = self._evaluate_condition(part, employee_data)
                if not evaluated:
                    all_evaluated = False
                if result:
                    any_true = True

            return any_true, all_evaluated or any_true

        # Handle AND conditions
        if ' AND ' in condition.upper():
            parts = re.split(r'\s+AND\s+', condition, flags=re.IGNORECASE)
            all_true = True
            all_evaluated = True

            for part in parts:
                result, evaluated = self._evaluate_condition(part, employee_data)
                if not evaluated:
                    all_evaluated = False
                    all_true = False
                elif not result:
                    all_true = False

            return all_true, all_evaluated

        # Simple condition
        return self._evaluate_simple_condition(condition, employee_data)

    def _parse_adjustment(self, adjustment_logic: str) -> float:
        """Parse adjustment value from logic string"""
        try:
            # Handle formats like "+0.15", "-0.10", "0.05"
            adjustment_str = adjustment_logic.strip()
            return float(adjustment_str)
        except ValueError:
            return 0.0

    def _evaluate_rule(
        self,
        rule: Dict,
        employee_data: Dict[str, Any]
    ) -> RuleEvaluationResult:
        """Evaluate a single rule against employee data"""
        condition = rule.get('rule_condition', '')
        matched, could_evaluate = self._evaluate_condition(condition, employee_data)

        adjustment = 0.0
        reason = ''

        if matched:
            adjustment = self._parse_adjustment(rule.get('adjustment_logic', '+0.0'))
            reason = rule.get('alert_message', rule.get('rule_description', 'Rule triggered'))
        elif not could_evaluate:
            reason = 'Insufficient data to evaluate'

        return RuleEvaluationResult(
            rule_id=rule.get('rule_id', 0),
            rule_name=rule.get('rule_name', 'Unknown Rule'),
            matched=matched,
            adjustment=adjustment if matched else 0.0,
            reason=reason,
            priority=rule.get('priority', 1)
        )

    async def _enrich_with_percentiles(
        self,
        employee_data: Dict[str, Any],
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Enrich employee data with peer comparison percentiles.

        Adds:
        - comp_percentile: Compensation percentile vs department peers
        - tenure_percentile: Tenure percentile vs department peers
        """
        enriched = employee_data.copy()

        try:
            # Get compensation percentile vs department peers
            comp_comparison = await peer_statistics_service.compare_to_peers(
                db, employee_data, 'employee_cost', ['department']
            )
            enriched['comp_percentile'] = comp_comparison.percentile
            enriched['comp_is_below_p25'] = comp_comparison.is_below_p25
            enriched['comp_is_above_p75'] = comp_comparison.is_above_p75
            enriched['comp_peer_count'] = comp_comparison.peer_count

            # Get tenure percentile vs department peers
            tenure_comparison = await peer_statistics_service.compare_to_peers(
                db, employee_data, 'tenure', ['department']
            )
            enriched['tenure_percentile'] = tenure_comparison.percentile
            enriched['tenure_is_below_p25'] = tenure_comparison.is_below_p25
            enriched['tenure_is_above_p75'] = tenure_comparison.is_above_p75
            enriched['tenure_peer_count'] = tenure_comparison.peer_count

        except Exception as e:
            print(f"Error calculating percentiles: {e}")
            # Set default percentiles if calculation fails
            enriched['comp_percentile'] = 50.0
            enriched['tenure_percentile'] = 50.0
            enriched['comp_is_below_p25'] = False
            enriched['comp_is_above_p75'] = False
            enriched['tenure_is_below_p25'] = False
            enriched['tenure_is_above_p75'] = False
            enriched['comp_peer_count'] = 0
            enriched['tenure_peer_count'] = 0

        return enriched

    async def evaluate_employee(
        self,
        employee_data: Dict[str, Any],
        db: Optional[AsyncSession] = None,
        base_risk: float = 0.3
    ) -> HeuristicResult:
        """
        Evaluate all business rules for an employee.

        Args:
            employee_data: Employee attributes (lowercase keys)
            db: Database session (required for percentile calculations)
            base_risk: Starting risk level before adjustments (default 0.3)

        Returns:
            HeuristicResult with combined heuristic score
        """
        # Normalize employee data keys to lowercase
        normalized_data = {k.lower(): v for k, v in employee_data.items()}

        # Enrich with peer percentiles if db is available
        if db:
            normalized_data = await self._enrich_with_percentiles(normalized_data, db)

        # Get rules
        rules = await self._get_rules(db)

        # Evaluate all rules
        results = []
        triggered = []
        alerts = []
        total_adjustment = 0.0
        rules_evaluated = 0
        adjustments = []

        for rule in rules:
            # Skip percentile-based rules if we couldn't calculate percentiles
            if rule.get('uses_percentile') and 'comp_percentile' not in normalized_data:
                continue

            eval_result = self._evaluate_rule(rule, normalized_data)
            results.append(eval_result)

            if eval_result.matched:
                triggered.append(eval_result)
                total_adjustment += eval_result.adjustment
                adjustments.append({
                    'rule': eval_result.rule_name,
                    'adjustment': eval_result.adjustment
                })

                # Add to alerts if high priority
                if eval_result.priority == 1 and eval_result.reason:
                    alerts.append(eval_result.reason)

            if eval_result.reason != 'Insufficient data to evaluate':
                rules_evaluated += 1

        # Calculate final score
        final_score = max(0.0, min(1.0, base_risk + total_adjustment))

        # Calculate coverage
        coverage = rules_evaluated / len(rules) if rules else 0.0

        # Calculate confidence based on coverage and number of triggered rules
        # Higher confidence when we have peer comparison data
        has_peer_data = 'comp_percentile' in normalized_data and normalized_data.get('comp_peer_count', 0) > 5
        peer_bonus = 0.1 if has_peer_data else 0.0
        confidence = min(1.0, 0.4 + (coverage * 0.4) + (len(triggered) * 0.05) + peer_bonus)

        return HeuristicResult(
            heuristic_score=final_score,
            confidence=confidence,
            coverage=coverage,
            triggered_rules=triggered,
            alerts=alerts[:5],  # Top 5 alerts
            total_rules_evaluated=rules_evaluated,
            adjustments_applied=adjustments
        )

    async def evaluate_batch(
        self,
        employees: List[Dict[str, Any]],
        db: Optional[AsyncSession] = None,
        base_risk: float = 0.3
    ) -> List[HeuristicResult]:
        """Evaluate rules for multiple employees"""
        # Load rules once
        rules = await self._get_rules(db)

        results = []
        for emp in employees:
            # Use cached rules
            self._rules_cache = rules
            result = await self.evaluate_employee(emp, db, base_risk)
            results.append(result)

        return results

    def get_rule_summary(self, rules: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Get summary of available rules"""
        rules = rules or self.DEFAULT_RULES

        return {
            'total_rules': len(rules),
            'rules_by_priority': {
                'high': sum(1 for r in rules if r.get('priority', 3) == 1),
                'medium': sum(1 for r in rules if r.get('priority', 3) == 2),
                'low': sum(1 for r in rules if r.get('priority', 3) == 3)
            },
            'rule_names': [r.get('rule_name') for r in rules]
        }


# Singleton instance
business_rule_service = BusinessRuleEvaluationService()
