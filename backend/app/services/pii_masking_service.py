"""
PII Masking Service for Cloud LLM Privacy Protection

Masks personally identifiable information (PII) before sending to cloud LLM providers.
Supports reversible masking for response post-processing.

GDPR/Privacy Compliance:
- Names → [EMPLOYEE_001], [EMPLOYEE_002], etc.
- HR Codes → [ID_001], [ID_002], etc.
- Salaries → Percentile-based categories (BOTTOM_20%, 20-40%, etc.)
- Departments → Generic labels if configured
- Interview notes → Sanitized summaries
"""

import re
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field


@dataclass
class SalaryPercentiles:
    """
    Salary percentile thresholds calculated from actual employee data.

    Percentiles:
    - p20: Bottom 20%
    - p40: 20-40%
    - p60: 40-60%
    - p80: 60-80%
    - Above p80: Top 20%
    """
    p20: float = 0.0
    p40: float = 0.0
    p60: float = 0.0
    p80: float = 0.0
    min_salary: float = 0.0
    max_salary: float = 0.0
    employee_count: int = 0

    def get_percentile_label(self, salary: float) -> str:
        """Get percentile label for a salary amount."""
        if not salary or self.employee_count == 0:
            return "SALARY_RANGE_UNKNOWN"

        if salary <= self.p20:
            return "BOTTOM_20_PERCENT"
        elif salary <= self.p40:
            return "20_TO_40_PERCENTILE"
        elif salary <= self.p60:
            return "40_TO_60_PERCENTILE"
        elif salary <= self.p80:
            return "60_TO_80_PERCENTILE"
        else:
            return "TOP_20_PERCENT"


@dataclass
class MaskingContext:
    """Stores masking mappings for a single request (reversible)."""
    name_map: Dict[str, str] = field(default_factory=dict)  # "John Smith" → "[EMPLOYEE_001]"
    id_map: Dict[str, str] = field(default_factory=dict)    # "EMP000123" → "[ID_001]"
    reverse_name_map: Dict[str, str] = field(default_factory=dict)  # "[EMPLOYEE_001]" → "John Smith"
    reverse_id_map: Dict[str, str] = field(default_factory=dict)    # "[ID_001]" → "EMP000123"
    name_counter: int = 0
    id_counter: int = 0


class PIIMaskingService:
    """
    Service for masking PII data before sending to cloud LLM providers.

    Usage:
        masker = PIIMaskingService()
        context = MaskingContext()

        # Mask before sending to LLM
        masked_text = masker.mask_text(original_text, context)

        # Send to LLM...
        llm_response = await call_llm(masked_text)

        # Unmask the response
        final_response = masker.unmask_text(llm_response, context)
    """

    # Patterns for detecting PII
    HR_CODE_PATTERN = re.compile(r'\b([A-Z]{2,4}[0-9]{4,8})\b')  # EMP000123, CV000185
    EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    PHONE_PATTERN = re.compile(r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b')
    SSN_PATTERN = re.compile(r'\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b')

    # Salary detection pattern
    SALARY_PATTERN = re.compile(r'\$[\d,]+(?:\.\d{2})?(?:/year|/yr|/month|/mo)?|\b\d{2,3}[kK]\b')

    def __init__(
        self,
        mask_departments: bool = False,
        mask_positions: bool = False,
        salary_percentiles: Optional[SalaryPercentiles] = None
    ):
        """
        Initialize masking service.

        Args:
            mask_departments: If True, mask department names
            mask_positions: If True, mask position/job titles
            salary_percentiles: Pre-calculated salary percentiles from employee data
        """
        self.mask_departments = mask_departments
        self.mask_positions = mask_positions
        self.salary_percentiles = salary_percentiles

    def mask_employee_data(
        self,
        employee: Dict[str, Any],
        context: MaskingContext
    ) -> Dict[str, Any]:
        """
        Mask PII fields in employee data dictionary.

        Args:
            employee: Employee data dict with full_name, hr_code, employee_cost, etc.
            context: MaskingContext to store mappings

        Returns:
            Masked employee data
        """
        if not employee:
            return employee

        masked = employee.copy()

        # Mask full name
        if 'full_name' in masked and masked['full_name']:
            original_name = masked['full_name']
            if original_name not in context.name_map:
                context.name_counter += 1
                masked_name = f"[EMPLOYEE_{context.name_counter:03d}]"
                context.name_map[original_name] = masked_name
                context.reverse_name_map[masked_name] = original_name
            masked['full_name'] = context.name_map[original_name]

        # Mask HR code
        if 'hr_code' in masked and masked['hr_code']:
            original_id = masked['hr_code']
            if original_id not in context.id_map:
                context.id_counter += 1
                masked_id = f"[ID_{context.id_counter:03d}]"
                context.id_map[original_id] = masked_id
                context.reverse_id_map[masked_id] = original_id
            masked['hr_code'] = context.id_map[original_id]

        # Mask salary/employee cost → range category
        if 'employee_cost' in masked and masked['employee_cost']:
            masked['employee_cost'] = self._categorize_salary(masked['employee_cost'])
            masked['_salary_masked'] = True

        if 'salary' in masked and masked['salary']:
            masked['salary'] = self._categorize_salary(masked['salary'])
            masked['_salary_masked'] = True

        return masked

    def mask_text(
        self,
        text: str,
        context: MaskingContext,
        additional_names: Optional[List[str]] = None
    ) -> str:
        """
        Mask PII in free-form text.

        Args:
            text: Original text containing PII
            context: MaskingContext with existing mappings
            additional_names: Extra names to mask (e.g., from employee list)

        Returns:
            Masked text
        """
        if not text:
            return text

        masked_text = text

        # Mask known names from context
        for original_name, masked_name in context.name_map.items():
            # Case-insensitive replacement
            pattern = re.compile(re.escape(original_name), re.IGNORECASE)
            masked_text = pattern.sub(masked_name, masked_text)

            # Also mask first name only
            first_name = original_name.split()[0] if ' ' in original_name else None
            if first_name and len(first_name) > 2:
                # Only replace if it looks like a standalone name (not part of another word)
                first_name_pattern = re.compile(r'\b' + re.escape(first_name) + r'\b', re.IGNORECASE)
                masked_text = first_name_pattern.sub(masked_name, masked_text)

        # Mask known HR codes from context
        for original_id, masked_id in context.id_map.items():
            masked_text = masked_text.replace(original_id, masked_id)

        # Mask additional names if provided
        if additional_names:
            for name in additional_names:
                if name and name not in context.name_map:
                    context.name_counter += 1
                    masked_name = f"[EMPLOYEE_{context.name_counter:03d}]"
                    context.name_map[name] = masked_name
                    context.reverse_name_map[masked_name] = name
                if name in context.name_map:
                    pattern = re.compile(re.escape(name), re.IGNORECASE)
                    masked_text = pattern.sub(context.name_map[name], masked_text)

        # Mask HR codes not yet in context
        for match in self.HR_CODE_PATTERN.finditer(masked_text):
            hr_code = match.group(1)
            if hr_code not in context.id_map:
                context.id_counter += 1
                masked_id = f"[ID_{context.id_counter:03d}]"
                context.id_map[hr_code] = masked_id
                context.reverse_id_map[masked_id] = hr_code
            masked_text = masked_text.replace(hr_code, context.id_map[hr_code])

        # Mask email addresses
        masked_text = self.EMAIL_PATTERN.sub('[EMAIL_REDACTED]', masked_text)

        # Mask phone numbers
        masked_text = self.PHONE_PATTERN.sub('[PHONE_REDACTED]', masked_text)

        # Mask SSN
        masked_text = self.SSN_PATTERN.sub('[SSN_REDACTED]', masked_text)

        # Mask salary amounts → keep ranges but remove exact amounts
        def replace_salary(match):
            try:
                amount_str = match.group(0).replace('$', '').replace(',', '').replace('/year', '').replace('/yr', '').replace('/month', '').replace('/mo', '').lower().replace('k', '000')
                amount = float(amount_str)
                return f"[{self._categorize_salary(amount)}]"
            except:
                return '[SALARY_REDACTED]'

        masked_text = self.SALARY_PATTERN.sub(replace_salary, masked_text)

        return masked_text

    def unmask_text(self, text: str, context: MaskingContext) -> str:
        """
        Restore original PII in LLM response.

        Args:
            text: Masked text from LLM
            context: MaskingContext with mappings

        Returns:
            Text with original names/IDs restored
        """
        if not text:
            return text

        unmasked_text = text

        # Restore names
        for masked_name, original_name in context.reverse_name_map.items():
            unmasked_text = unmasked_text.replace(masked_name, original_name)

        # Restore HR codes
        for masked_id, original_id in context.reverse_id_map.items():
            unmasked_text = unmasked_text.replace(masked_id, original_id)

        return unmasked_text

    def mask_context_for_llm(
        self,
        context_dict: Dict[str, Any],
        masking_context: MaskingContext
    ) -> Tuple[Dict[str, Any], List[str]]:
        """
        Mask all PII in the full context dictionary before LLM call.

        Args:
            context_dict: Full context with employee, churn, similar_employees, etc.
            masking_context: MaskingContext to store mappings

        Returns:
            (masked_context, list_of_all_names) for additional text masking
        """
        masked_context = {}
        all_names = []

        # Mask main employee
        if 'employee' in context_dict and context_dict['employee']:
            masked_context['employee'] = self.mask_employee_data(
                context_dict['employee'],
                masking_context
            )
            if context_dict['employee'].get('full_name'):
                all_names.append(context_dict['employee']['full_name'])

        # Mask similar employees
        if 'similar_employees' in context_dict:
            masked_context['similar_employees'] = []
            for emp in context_dict.get('similar_employees', []):
                if isinstance(emp, dict):
                    masked_context['similar_employees'].append(
                        self.mask_employee_data(emp, masking_context)
                    )
                    if emp.get('full_name'):
                        all_names.append(emp['full_name'])
                    if emp.get('name'):
                        all_names.append(emp['name'])

        # Copy other non-PII data
        safe_keys = [
            'churn', 'reasoning', 'eltv_data', 'company_overview',
            'workforce_stats', 'department_snapshot', 'stage_details',
            'rag_context', 'available_treatments', 'exit_interview_patterns'
        ]
        for key in safe_keys:
            if key in context_dict:
                masked_context[key] = context_dict[key]

        # Mask treatment history (may contain names in notes)
        if 'treatment_history' in context_dict:
            masked_context['treatment_history'] = []
            for treatment in context_dict.get('treatment_history', []):
                if isinstance(treatment, dict):
                    masked_treatment = treatment.copy()
                    if 'notes' in masked_treatment and masked_treatment['notes']:
                        masked_treatment['notes'] = self.mask_text(
                            masked_treatment['notes'],
                            masking_context,
                            all_names
                        )
                    masked_context['treatment_history'].append(masked_treatment)

        # Mask interviews (may contain sensitive notes)
        if 'interviews' in context_dict:
            masked_context['interviews'] = []
            for interview in context_dict.get('interviews', []):
                if isinstance(interview, dict):
                    masked_interview = interview.copy()
                    if 'notes' in masked_interview and masked_interview['notes']:
                        masked_interview['notes'] = self.mask_text(
                            masked_interview['notes'],
                            masking_context,
                            all_names
                        )
                    masked_context['interviews'].append(masked_interview)

        # Mask manager team info
        if 'manager_team' in context_dict:
            masked_context['manager_team'] = context_dict['manager_team']
            # Team members names if present
            if isinstance(context_dict['manager_team'], dict):
                if 'members' in context_dict['manager_team']:
                    masked_members = []
                    for member in context_dict['manager_team'].get('members', []):
                        if isinstance(member, dict):
                            masked_members.append(
                                self.mask_employee_data(member, masking_context)
                            )
                            if member.get('full_name'):
                                all_names.append(member['full_name'])
                    masked_context['manager_team']['members'] = masked_members

        return masked_context, all_names

    def _categorize_salary(self, amount: float) -> str:
        """Categorize salary into privacy-preserving percentile range."""
        if not amount:
            return "SALARY_RANGE_UNKNOWN"

        # Use percentiles if available
        if self.salary_percentiles and self.salary_percentiles.employee_count > 0:
            return self.salary_percentiles.get_percentile_label(amount)

        # Fallback to generic ranges if no percentiles available
        # These are just placeholders when actual data isn't loaded
        return "SALARY_RANGE_UNDETERMINED"

    def get_masking_summary(self, context: MaskingContext) -> Dict[str, Any]:
        """Get summary of what was masked (for audit logging)."""
        return {
            "names_masked": len(context.name_map),
            "ids_masked": len(context.id_map),
            "name_tokens": list(context.name_map.values()),
            "id_tokens": list(context.id_map.values()),
        }

    def set_salary_percentiles(self, percentiles: SalaryPercentiles) -> None:
        """Update salary percentiles (call this when employee data changes)."""
        self.salary_percentiles = percentiles

    def has_salary_percentiles(self) -> bool:
        """Check if salary percentiles are loaded."""
        return (
            self.salary_percentiles is not None
            and self.salary_percentiles.employee_count > 0
        )


# Singleton instance for convenience
_default_masking_service: Optional[PIIMaskingService] = None


def get_pii_masking_service(
    mask_departments: bool = False,
    mask_positions: bool = False,
    salary_percentiles: Optional[SalaryPercentiles] = None
) -> PIIMaskingService:
    """Get or create the default PII masking service."""
    global _default_masking_service
    if _default_masking_service is None:
        _default_masking_service = PIIMaskingService(
            mask_departments=mask_departments,
            mask_positions=mask_positions,
            salary_percentiles=salary_percentiles
        )
    elif salary_percentiles is not None:
        # Update percentiles if provided
        _default_masking_service.set_salary_percentiles(salary_percentiles)
    return _default_masking_service


async def calculate_salary_percentiles_from_db(db) -> SalaryPercentiles:
    """
    Calculate salary percentiles from actual employee data in the database.

    Args:
        db: AsyncSession database connection

    Returns:
        SalaryPercentiles with p20, p40, p60, p80 thresholds
    """
    from sqlalchemy import select, func
    from sqlalchemy.sql import text

    try:
        # Import here to avoid circular imports
        from app.models.hr_data import HRDataInput

        # Get all non-null employee costs
        query = select(HRDataInput.employee_cost).where(
            HRDataInput.employee_cost.isnot(None),
            HRDataInput.employee_cost > 0
        ).order_by(HRDataInput.employee_cost)

        result = await db.execute(query)
        salaries = [float(row[0]) for row in result.fetchall()]

        if not salaries:
            return SalaryPercentiles()

        # Calculate percentiles
        n = len(salaries)

        def percentile(data: List[float], p: float) -> float:
            """Calculate percentile value."""
            if not data:
                return 0.0
            k = (len(data) - 1) * (p / 100)
            f = int(k)
            c = f + 1 if f + 1 < len(data) else f
            return data[f] + (k - f) * (data[c] - data[f]) if f != c else data[f]

        return SalaryPercentiles(
            p20=percentile(salaries, 20),
            p40=percentile(salaries, 40),
            p60=percentile(salaries, 60),
            p80=percentile(salaries, 80),
            min_salary=salaries[0],
            max_salary=salaries[-1],
            employee_count=n
        )

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to calculate salary percentiles: {e}")
        return SalaryPercentiles()
