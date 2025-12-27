"""
Tests for PII Masking Service

Verifies that employee data is properly masked before sending to cloud LLMs.
"""

import pytest
from app.services.pii_masking_service import (
    PIIMaskingService,
    MaskingContext,
    SalaryPercentiles
)


# Sample percentiles based on typical salary distribution
SAMPLE_PERCENTILES = SalaryPercentiles(
    p20=45000.0,
    p40=65000.0,
    p60=90000.0,
    p80=130000.0,
    min_salary=30000.0,
    max_salary=300000.0,
    employee_count=100
)


class TestPIIMasking:
    """Test PII masking functionality."""

    def setup_method(self):
        """Setup test fixtures."""
        self.masker = PIIMaskingService(salary_percentiles=SAMPLE_PERCENTILES)
        self.context = MaskingContext()

    def test_mask_employee_name(self):
        """Test that employee names are masked."""
        employee = {
            "full_name": "John Smith",
            "hr_code": "EMP000123",
            "position": "Senior Engineer",
            "structure_name": "Engineering",
            "employee_cost": 85000.0
        }

        masked = self.masker.mask_employee_data(employee, self.context)

        assert masked["full_name"] == "[EMPLOYEE_001]"
        assert masked["hr_code"] == "[ID_001]"
        assert masked["position"] == "Senior Engineer"  # Not masked by default
        assert masked["structure_name"] == "Engineering"  # Not masked by default
        # 85000 is between p60 (90000) and p40 (65000), so 40-60 percentile
        assert masked["employee_cost"] == "40_TO_60_PERCENTILE"

    def test_mask_multiple_employees(self):
        """Test masking multiple employees with consistent tokens."""
        emp1 = {"full_name": "John Smith", "hr_code": "EMP001"}
        emp2 = {"full_name": "Jane Doe", "hr_code": "EMP002"}
        emp3 = {"full_name": "John Smith", "hr_code": "EMP001"}  # Same as emp1

        masked1 = self.masker.mask_employee_data(emp1, self.context)
        masked2 = self.masker.mask_employee_data(emp2, self.context)
        masked3 = self.masker.mask_employee_data(emp3, self.context)

        # Same person should get same token
        assert masked1["full_name"] == masked3["full_name"]
        assert masked1["hr_code"] == masked3["hr_code"]

        # Different people get different tokens
        assert masked1["full_name"] != masked2["full_name"]
        assert masked1["hr_code"] != masked2["hr_code"]

    def test_mask_text_with_names(self):
        """Test masking names in free-form text."""
        # First, register the name by masking employee data
        employee = {"full_name": "John Smith", "hr_code": "EMP000123"}
        self.masker.mask_employee_data(employee, self.context)

        text = "John Smith is at high risk. We should meet with John about his concerns."

        masked_text = self.masker.mask_text(text, self.context)

        assert "John Smith" not in masked_text
        assert "John" not in masked_text
        assert "[EMPLOYEE_001]" in masked_text

    def test_mask_hr_codes_in_text(self):
        """Test masking HR codes in text."""
        text = "Employee EMP000123 and CV000456 need attention."

        masked_text = self.masker.mask_text(text, self.context)

        assert "EMP000123" not in masked_text
        assert "CV000456" not in masked_text
        assert "[ID_" in masked_text

    def test_mask_salary_amounts(self):
        """Test masking salary/cost amounts."""
        text = "Employee earns $85,000/year which is above average. The 150k salary is high."

        masked_text = self.masker.mask_text(text, self.context)

        assert "$85,000" not in masked_text
        assert "150k" not in masked_text
        # Should contain percentile-based categories
        assert "PERCENTILE]" in masked_text or "PERCENT]" in masked_text

    def test_mask_email_addresses(self):
        """Test masking email addresses."""
        text = "Contact john.smith@company.com for more info."

        masked_text = self.masker.mask_text(text, self.context)

        assert "john.smith@company.com" not in masked_text
        assert "[EMAIL_REDACTED]" in masked_text

    def test_mask_phone_numbers(self):
        """Test masking phone numbers."""
        text = "Call 555-123-4567 or (555) 123-4567 for support."

        masked_text = self.masker.mask_text(text, self.context)

        assert "555-123-4567" not in masked_text
        assert "[PHONE_REDACTED]" in masked_text

    def test_unmask_text(self):
        """Test unmasking restores original names."""
        # Mask employee
        employee = {"full_name": "John Smith", "hr_code": "EMP000123"}
        self.masker.mask_employee_data(employee, self.context)

        # Simulate LLM response with masked tokens
        llm_response = "[EMPLOYEE_001] has a high churn risk. Employee [ID_001] needs immediate attention."

        unmasked = self.masker.unmask_text(llm_response, self.context)

        assert "John Smith" in unmasked
        assert "EMP000123" in unmasked
        assert "[EMPLOYEE_001]" not in unmasked
        assert "[ID_001]" not in unmasked

    def test_salary_categorization(self):
        """Test salary percentile-based categorization."""
        # Using SAMPLE_PERCENTILES: p20=45k, p40=65k, p60=90k, p80=130k
        test_cases = [
            (35000, "BOTTOM_20_PERCENT"),      # Below p20 (45k)
            (50000, "20_TO_40_PERCENTILE"),    # Between p20 (45k) and p40 (65k)
            (80000, "40_TO_60_PERCENTILE"),    # Between p40 (65k) and p60 (90k)
            (120000, "60_TO_80_PERCENTILE"),   # Between p60 (90k) and p80 (130k)
            (200000, "TOP_20_PERCENT"),        # Above p80 (130k)
            (300000, "TOP_20_PERCENT"),        # Way above p80
        ]

        for salary, expected_range in test_cases:
            employee = {"full_name": "Test", "employee_cost": salary}
            masked = self.masker.mask_employee_data(employee, MaskingContext())
            assert masked["employee_cost"] == expected_range, f"Salary {salary} should be {expected_range}, got {masked['employee_cost']}"

    def test_mask_context_for_llm(self):
        """Test masking full context dictionary."""
        context = {
            "employee": {
                "full_name": "John Smith",
                "hr_code": "EMP001",
                "employee_cost": 90000
            },
            "similar_employees": [
                {"full_name": "Jane Doe", "hr_code": "EMP002"},
                {"full_name": "Bob Wilson", "hr_code": "EMP003"},
            ],
            "churn": {"resign_proba": 0.75},
            "treatment_history": [
                {"treatment_name": "Salary Review", "notes": "Discussed with John Smith about raise"}
            ]
        }

        masked_context, all_names = self.masker.mask_context_for_llm(context, self.context)

        # Main employee masked
        assert masked_context["employee"]["full_name"].startswith("[EMPLOYEE_")
        assert masked_context["employee"]["hr_code"].startswith("[ID_")

        # Similar employees masked
        for emp in masked_context["similar_employees"]:
            assert emp["full_name"].startswith("[EMPLOYEE_")

        # Treatment notes should have name masked
        assert "John Smith" not in masked_context["treatment_history"][0]["notes"]

        # Non-PII data preserved
        assert masked_context["churn"]["resign_proba"] == 0.75

    def test_masking_summary(self):
        """Test getting masking summary for audit logging."""
        employee = {"full_name": "John Smith", "hr_code": "EMP001"}
        self.masker.mask_employee_data(employee, self.context)

        summary = self.masker.get_masking_summary(self.context)

        assert summary["names_masked"] == 1
        assert summary["ids_masked"] == 1
        assert "[EMPLOYEE_001]" in summary["name_tokens"]
        assert "[ID_001]" in summary["id_tokens"]

    def test_empty_data_handling(self):
        """Test handling of empty/None data."""
        assert self.masker.mask_text("", self.context) == ""
        assert self.masker.mask_text(None, self.context) is None
        assert self.masker.mask_employee_data({}, self.context) == {}
        assert self.masker.mask_employee_data(None, self.context) is None
        assert self.masker.unmask_text("", self.context) == ""
        assert self.masker.unmask_text(None, self.context) is None


class TestSalaryRanges:
    """Test salary range edge cases with percentiles."""

    def setup_method(self):
        # Use sample percentiles: p20=45k, p40=65k, p60=90k, p80=130k
        self.masker = PIIMaskingService(salary_percentiles=SAMPLE_PERCENTILES)

    def test_salary_boundary_values(self):
        """Test salary categorization at percentile boundary values."""
        # Based on SAMPLE_PERCENTILES: p20=45k, p40=65k, p60=90k, p80=130k
        boundaries = [
            (44999, "BOTTOM_20_PERCENT"),      # Just below p20
            (45000, "BOTTOM_20_PERCENT"),      # Exactly p20 (<=)
            (45001, "20_TO_40_PERCENTILE"),    # Just above p20
            (65000, "20_TO_40_PERCENTILE"),    # Exactly p40 (<=)
            (65001, "40_TO_60_PERCENTILE"),    # Just above p40
            (90000, "40_TO_60_PERCENTILE"),    # Exactly p60 (<=)
            (90001, "60_TO_80_PERCENTILE"),    # Just above p60
            (130000, "60_TO_80_PERCENTILE"),   # Exactly p80 (<=)
            (130001, "TOP_20_PERCENT"),        # Just above p80
            (500000, "TOP_20_PERCENT"),        # Well above p80
        ]

        for salary, expected in boundaries:
            result = self.masker._categorize_salary(salary)
            assert result == expected, f"Salary ${salary} should be {expected}, got {result}"

    def test_no_percentiles_fallback(self):
        """Test behavior when no percentiles are loaded."""
        masker_no_percentiles = PIIMaskingService()
        result = masker_no_percentiles._categorize_salary(100000)
        assert result == "SALARY_RANGE_UNDETERMINED"

    def test_empty_percentiles(self):
        """Test behavior with empty percentiles (no employees)."""
        empty_percentiles = SalaryPercentiles()  # employee_count = 0
        masker = PIIMaskingService(salary_percentiles=empty_percentiles)
        result = masker._categorize_salary(100000)
        assert result == "SALARY_RANGE_UNDETERMINED"

    def test_percentile_info(self):
        """Test that percentile info is accessible."""
        assert self.masker.has_salary_percentiles() is True
        assert self.masker.salary_percentiles.employee_count == 100
        assert self.masker.salary_percentiles.min_salary == 30000.0
        assert self.masker.salary_percentiles.max_salary == 300000.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
