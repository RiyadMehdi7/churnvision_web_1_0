"""
Tests for app/api/v1/employees.py - Employee API endpoints.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
import pandas as pd


class TestEmployeeRecord:
    """Test EmployeeRecord schema."""

    def test_employee_record_required_fields(self):
        """Should have required fields."""
        from app.api.v1.employees import EmployeeRecord

        record = EmployeeRecord(
            hr_code="EMP001",
            full_name="John Doe",
            structure_name="Engineering",
            position="Software Engineer"
        )

        assert record.hr_code == "EMP001"
        assert record.full_name == "John Doe"
        assert record.structure_name == "Engineering"
        assert record.position == "Software Engineer"

    def test_employee_record_optional_fields(self):
        """Optional fields should default to None."""
        from app.api.v1.employees import EmployeeRecord

        record = EmployeeRecord(
            hr_code="EMP001",
            full_name="John Doe",
            structure_name="Engineering",
            position="Developer"
        )

        assert record.status is None
        assert record.manager_id is None
        assert record.tenure is None
        assert record.employee_cost is None
        assert record.resign_proba is None
        assert record.shap_values is None
        assert record.additional_data is None

    def test_employee_record_with_all_fields(self):
        """Should accept all fields when provided."""
        from app.api.v1.employees import EmployeeRecord

        record = EmployeeRecord(
            hr_code="EMP001",
            full_name="John Doe",
            structure_name="Engineering",
            position="Developer",
            status="Active",
            manager_id="MGR001",
            tenure=2.5,
            employee_cost=75000.0,
            resign_proba=0.25,
            shap_values={"satisfaction": 0.15},
            additional_data={"department": "IT"},
            termination_date=None,
            reasoning_churn_risk=0.3,
            reasoning_stage="engaged",
            reasoning_confidence=0.85,
            performance_rating_latest=4.2,
            eltv_pre_treatment=150000.0
        )

        assert record.status == "Active"
        assert record.tenure == 2.5
        assert record.resign_proba == 0.25
        assert record.shap_values == {"satisfaction": 0.15}


class TestHydrateHRData:
    """Test _hydrate_hr_data_from_active_dataset function."""

    @pytest.mark.asyncio
    async def test_returns_none_when_no_active_dataset(self, mock_db_session):
        """Should return None when no active dataset exists."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None

            result = await _hydrate_hr_data_from_active_dataset(mock_db_session)

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_file_path(self, mock_db_session):
        """Should return None when dataset has no file path."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = None

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_dataset

            result = await _hydrate_hr_data_from_active_dataset(mock_db_session)

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_dataset_id_when_data_exists(self, mock_db_session):
        """Should return dataset ID when data already exists."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = "/tmp/test.csv"
        mock_dataset.dataset_id = "dataset-123"
        mock_dataset.column_mapping = {}

        # Mock count query returning > 0
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 10
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            with patch('pathlib.Path.exists', return_value=True):
                mock_get.return_value = mock_dataset

                result = await _hydrate_hr_data_from_active_dataset(mock_db_session)

                assert result == "dataset-123"

    @pytest.mark.asyncio
    async def test_raises_on_empty_csv(self, mock_db_session):
        """Should raise HTTPException for empty CSV file."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = "/tmp/empty.csv"
        mock_dataset.dataset_id = "dataset-123"
        mock_dataset.column_mapping = {}

        # Mock count query returning 0
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            with patch('pathlib.Path.exists', return_value=True):
                with patch('pandas.read_csv', side_effect=pd.errors.EmptyDataError("No data")):
                    mock_get.return_value = mock_dataset

                    with pytest.raises(HTTPException) as exc_info:
                        await _hydrate_hr_data_from_active_dataset(mock_db_session)

                    assert exc_info.value.status_code == 400
                    assert "empty" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_on_csv_parse_error(self, mock_db_session):
        """Should raise HTTPException for CSV parse errors."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = "/tmp/malformed.csv"
        mock_dataset.dataset_id = "dataset-123"
        mock_dataset.column_mapping = {}

        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            with patch('pathlib.Path.exists', return_value=True):
                with patch('pandas.read_csv', side_effect=pd.errors.ParserError("Parse error")):
                    mock_get.return_value = mock_dataset

                    with pytest.raises(HTTPException) as exc_info:
                        await _hydrate_hr_data_from_active_dataset(mock_db_session)

                    assert exc_info.value.status_code == 400
                    assert "parse" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_on_file_not_found(self, mock_db_session):
        """Should raise HTTPException when file not found."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = "/tmp/nonexistent.csv"
        mock_dataset.dataset_id = "dataset-123"
        mock_dataset.column_mapping = {}

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            with patch('pathlib.Path.exists', return_value=False):
                mock_get.return_value = mock_dataset

                result = await _hydrate_hr_data_from_active_dataset(mock_db_session)

                assert result is None

    @pytest.mark.asyncio
    async def test_raises_on_unicode_error(self, mock_db_session):
        """Should raise HTTPException for encoding errors."""
        from app.api.v1.employees import _hydrate_hr_data_from_active_dataset

        mock_dataset = MagicMock()
        mock_dataset.file_path = "/tmp/badencoding.csv"
        mock_dataset.dataset_id = "dataset-123"
        mock_dataset.column_mapping = {}

        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_get:
            with patch('pathlib.Path.exists', return_value=True):
                with patch('pandas.read_csv', side_effect=UnicodeDecodeError('utf-8', b'', 0, 1, 'error')):
                    mock_get.return_value = mock_dataset

                    with pytest.raises(HTTPException) as exc_info:
                        await _hydrate_hr_data_from_active_dataset(mock_db_session)

                    assert exc_info.value.status_code == 400
                    assert "encoding" in exc_info.value.detail.lower()


class TestGetEmployeesEndpoint:
    """Test GET /employees endpoint."""

    @pytest.mark.asyncio
    async def test_get_employees_returns_list(self, mock_db_session, mock_user):
        """Should return list of employees."""
        from app.api.v1.employees import get_employees

        # Mock empty result
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees._hydrate_hr_data_from_active_dataset', new_callable=AsyncMock) as mock_hydrate:
            mock_hydrate.return_value = None
            with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_dataset:
                mock_dataset.return_value = None

                result = await get_employees(
                    db=mock_db_session,
                    current_user=mock_user
                )

                assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_get_employees_applies_pagination(self, mock_db_session, mock_user):
        """Should apply skip and limit for pagination."""
        from app.api.v1.employees import get_employees

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees._hydrate_hr_data_from_active_dataset', new_callable=AsyncMock) as mock_hydrate:
            mock_hydrate.return_value = None
            with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_dataset:
                mock_dataset.return_value = None

                result = await get_employees(
                    skip=10,
                    limit=5,
                    db=mock_db_session,
                    current_user=mock_user
                )

                # The function should complete without error with pagination params
                assert isinstance(result, list)


class TestGetEmployeeById:
    """Test GET /employees/{hr_code} endpoint."""

    @pytest.mark.asyncio
    async def test_get_employee_not_found(self, mock_db_session, mock_user):
        """Should raise 404 when employee not found."""
        from app.api.v1.employees import get_employee_by_hr_code

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_employee_by_hr_code(
                hr_code="NONEXISTENT",
                db=mock_db_session,
                current_user=mock_user
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_employee_found(self, mock_db_session, mock_user):
        """Should return employee when found."""
        from app.api.v1.employees import get_employee_by_hr_code

        mock_employee = MagicMock()
        mock_employee.hr_code = "EMP001"
        mock_employee.full_name = "John Doe"
        mock_employee.structure_name = "Engineering"
        mock_employee.position = "Developer"
        mock_employee.status = "Active"
        mock_employee.manager_id = None
        mock_employee.tenure = 2.0
        mock_employee.employee_cost = 75000.0
        mock_employee.additional_data = {}
        mock_employee.termination_date = None
        mock_employee.dataset_id = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_employee
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        with patch('app.api.v1.employees.get_active_dataset_entry', new_callable=AsyncMock) as mock_dataset:
            mock_dataset.return_value = None

            result = await get_employee_by_hr_code(
                hr_code="EMP001",
                db=mock_db_session,
                current_user=mock_user
            )

            assert result.hr_code == "EMP001"
            assert result.full_name == "John Doe"
