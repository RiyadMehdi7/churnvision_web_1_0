"""
Tests for Recommendation API Endpoints

Tests the treatment recommendation system including:
- Generate recommendations for individual employees
- List pending recommendations with filters
- Approve/reject workflow
- Bulk recommendation generation
- Recommendation statistics
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db_session():
    """Mock async database session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.username = "hr_manager"
    user.email = "hr@example.com"
    user.role = "admin"
    user.is_active = True
    return user


@pytest.fixture
def mock_recommendation_result():
    """Mock recommendation result from service."""
    result = MagicMock()
    result.recommendation_id = 101
    result.employee_id = "EMP001"
    result.employee_name = "John Smith"
    result.current_risk_level = "High"
    result.churn_probability = 0.78
    result.recommended_treatment_id = 5
    result.recommended_treatment_name = "Salary Increase 10%"
    result.treatment_cost = 5000.0
    result.projected_churn_reduction = 0.35
    result.projected_eltv_gain = 25000.0
    result.projected_roi = 4.0
    result.reasoning = "High churn probability with strong ROI on salary adjustment"
    result.priority_score = 0.85
    result.expires_date = datetime.utcnow() + timedelta(days=30)
    return result


@pytest.fixture
def mock_pending_recommendations():
    """Mock list of pending recommendations."""
    return [
        {
            "recommendation_id": 101,
            "employee_id": "EMP001",
            "employee_name": "John Smith",
            "department": "Engineering",
            "position": "Senior Developer",
            "risk_level": "High",
            "churn_probability": 0.78,
            "recommended_treatments": [
                {"id": 5, "name": "Salary Increase 10%", "cost": 5000.0, "roi": 4.0}
            ],
            "priority_score": 0.85,
            "estimated_impact": 0.35,
            "estimated_cost": 5000.0,
            "estimated_roi": 4.0,
            "reasoning": "High churn risk, salary below market",
            "recommendation_date": "2026-01-01T10:00:00",
            "expires_date": "2026-01-31T10:00:00",
            "status": "pending"
        },
        {
            "recommendation_id": 102,
            "employee_id": "EMP002",
            "employee_name": "Jane Doe",
            "department": "Sales",
            "position": "Account Executive",
            "risk_level": "High",
            "churn_probability": 0.72,
            "recommended_treatments": [
                {"id": 3, "name": "Career Development Program", "cost": 2000.0, "roi": 6.5}
            ],
            "priority_score": 0.80,
            "estimated_impact": 0.30,
            "estimated_cost": 2000.0,
            "estimated_roi": 6.5,
            "reasoning": "Career stagnation detected",
            "recommendation_date": "2026-01-01T11:00:00",
            "expires_date": "2026-01-31T11:00:00",
            "status": "pending"
        }
    ]


@pytest.fixture
def mock_approval_result():
    """Mock result from approving a recommendation."""
    return {
        "recommendation_id": 101,
        "status": "approved",
        "approved_by": "hr_manager",
        "approved_at": "2026-01-10T15:00:00",
        "treatment_application_id": 501
    }


@pytest.fixture
def mock_rejection_result():
    """Mock result from rejecting a recommendation."""
    return {
        "recommendation_id": 101,
        "status": "rejected",
        "rejected_by": "hr_manager",
        "rejected_at": "2026-01-10T15:00:00",
        "rejection_reason": "Budget constraints this quarter"
    }


# =============================================================================
# Generate Recommendation Tests
# =============================================================================

class TestGenerateRecommendation:
    """Tests for POST /recommendations/generate endpoint."""

    @pytest.mark.asyncio
    async def test_generate_recommendation_success(
        self, mock_db_session, mock_user, mock_recommendation_result
    ):
        """Test successful recommendation generation."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest

        request = GenerateRecommendationRequest(
            employee_id="EMP001",
            use_ml_model=True
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                return_value=mock_recommendation_result
            )

            result = await generate_recommendation(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result.recommendation_id == 101
        assert result.employee_id == "EMP001"
        assert result.employee_name == "John Smith"
        assert result.current_risk_level == "High"
        assert result.churn_probability == 0.78
        assert result.recommended_treatment_id == 5
        assert result.recommended_treatment_name == "Salary Increase 10%"
        assert result.projected_roi == 4.0
        assert result.priority_score == 0.85
        mock_service.generate_recommendation.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_recommendation_with_specific_treatment(
        self, mock_db_session, mock_user, mock_recommendation_result
    ):
        """Test recommendation generation with specific treatment ID."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest

        request = GenerateRecommendationRequest(
            employee_id="EMP001",
            treatment_id=5,
            use_ml_model=True
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                return_value=mock_recommendation_result
            )

            result = await generate_recommendation(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        # Verify treatment_id was passed to service
        call_kwargs = mock_service.generate_recommendation.call_args.kwargs
        assert call_kwargs["treatment_id"] == 5

    @pytest.mark.asyncio
    async def test_generate_recommendation_with_reasoning_override(
        self, mock_db_session, mock_user, mock_recommendation_result
    ):
        """Test recommendation with custom reasoning text."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest

        custom_reasoning = "Manual override: Employee requested career change"
        request = GenerateRecommendationRequest(
            employee_id="EMP001",
            reasoning_override=custom_reasoning
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                return_value=mock_recommendation_result
            )

            await generate_recommendation(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.generate_recommendation.call_args.kwargs
        assert call_kwargs["reasoning_override"] == custom_reasoning

    @pytest.mark.asyncio
    async def test_generate_recommendation_without_ml_model(
        self, mock_db_session, mock_user, mock_recommendation_result
    ):
        """Test recommendation using heuristics instead of ML model."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest

        request = GenerateRecommendationRequest(
            employee_id="EMP001",
            use_ml_model=False
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                return_value=mock_recommendation_result
            )

            await generate_recommendation(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.generate_recommendation.call_args.kwargs
        assert call_kwargs["use_ml_model"] is False

    @pytest.mark.asyncio
    async def test_generate_recommendation_employee_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when employee doesn't exist."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest
        from fastapi import HTTPException

        request = GenerateRecommendationRequest(employee_id="INVALID")

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                side_effect=ValueError("Employee not found: INVALID")
            )

            with pytest.raises(HTTPException) as exc_info:
                await generate_recommendation(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404
        assert "Employee not found" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_generate_recommendation_service_error(
        self, mock_db_session, mock_user
    ):
        """Test 500 when service encounters an error."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest
        from fastapi import HTTPException

        request = GenerateRecommendationRequest(employee_id="EMP001")

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(
                side_effect=Exception("Database connection failed")
            )

            with pytest.raises(HTTPException) as exc_info:
                await generate_recommendation(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 500
        assert "Error generating recommendation" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_generate_recommendation_roi_clamping(
        self, mock_db_session, mock_user
    ):
        """Test that extreme ROI values are clamped to [-999.99, 999.99]."""
        from app.api.v1.recommendations import generate_recommendation, GenerateRecommendationRequest

        # Create result with extreme ROI
        extreme_result = MagicMock()
        extreme_result.recommendation_id = 101
        extreme_result.employee_id = "EMP001"
        extreme_result.employee_name = "John Smith"
        extreme_result.current_risk_level = "High"
        extreme_result.churn_probability = 0.78
        extreme_result.recommended_treatment_id = 5
        extreme_result.recommended_treatment_name = "Free Lunch"
        extreme_result.treatment_cost = 100.0
        extreme_result.projected_churn_reduction = 0.50
        extreme_result.projected_eltv_gain = 500000.0
        extreme_result.projected_roi = 5000.0  # Extreme positive ROI
        extreme_result.reasoning = "Low cost, high impact"
        extreme_result.priority_score = 0.95
        extreme_result.expires_date = datetime.utcnow() + timedelta(days=30)

        request = GenerateRecommendationRequest(employee_id="EMP001")

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_recommendation = AsyncMock(return_value=extreme_result)

            result = await generate_recommendation(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        # ROI should be clamped to 999.99
        assert result.projected_roi == 999.99


# =============================================================================
# Pending Recommendations Tests
# =============================================================================

class TestGetPendingRecommendations:
    """Tests for GET /recommendations/pending endpoint."""

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_success(
        self, mock_db_session, mock_user, mock_pending_recommendations
    ):
        """Test retrieving pending recommendations."""
        from app.api.v1.recommendations import get_pending_recommendations

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(
                return_value=mock_pending_recommendations
            )

            result = await get_pending_recommendations(
                department=None,
                risk_level=None,
                limit=50,
                current_user=mock_user,
                db=mock_db_session
            )

        assert len(result) == 2
        assert result[0].recommendation_id == 101
        assert result[0].employee_name == "John Smith"
        assert result[1].recommendation_id == 102
        assert result[1].department == "Sales"

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_filter_by_department(
        self, mock_db_session, mock_user, mock_pending_recommendations
    ):
        """Test filtering pending recommendations by department."""
        from app.api.v1.recommendations import get_pending_recommendations

        filtered_recs = [r for r in mock_pending_recommendations if r["department"] == "Engineering"]

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(return_value=filtered_recs)

            result = await get_pending_recommendations(
                department="Engineering",
                risk_level=None,
                limit=50,
                current_user=mock_user,
                db=mock_db_session
            )

        assert len(result) == 1
        assert result[0].department == "Engineering"

        # Verify filter was passed to service
        call_kwargs = mock_service.get_pending_recommendations.call_args.kwargs
        assert call_kwargs["department_filter"] == "Engineering"

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_filter_by_risk_level(
        self, mock_db_session, mock_user, mock_pending_recommendations
    ):
        """Test filtering pending recommendations by risk level."""
        from app.api.v1.recommendations import get_pending_recommendations

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(
                return_value=mock_pending_recommendations
            )

            await get_pending_recommendations(
                department=None,
                risk_level="High",
                limit=50,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.get_pending_recommendations.call_args.kwargs
        assert call_kwargs["risk_level_filter"] == "High"

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_with_limit(
        self, mock_db_session, mock_user
    ):
        """Test limiting number of pending recommendations."""
        from app.api.v1.recommendations import get_pending_recommendations

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(return_value=[])

            await get_pending_recommendations(
                department=None,
                risk_level=None,
                limit=10,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.get_pending_recommendations.call_args.kwargs
        assert call_kwargs["limit"] == 10

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_empty_list(
        self, mock_db_session, mock_user
    ):
        """Test when no pending recommendations exist."""
        from app.api.v1.recommendations import get_pending_recommendations

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(return_value=[])

            result = await get_pending_recommendations(
                department=None,
                risk_level=None,
                limit=50,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_get_pending_recommendations_service_error(
        self, mock_db_session, mock_user
    ):
        """Test 500 when service encounters an error."""
        from app.api.v1.recommendations import get_pending_recommendations
        from fastapi import HTTPException

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.get_pending_recommendations = AsyncMock(
                side_effect=Exception("Query timeout")
            )

            with pytest.raises(HTTPException) as exc_info:
                await get_pending_recommendations(
                    department=None,
                    risk_level=None,
                    limit=50,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 500


# =============================================================================
# Approve Recommendation Tests
# =============================================================================

class TestApproveRecommendation:
    """Tests for POST /recommendations/{id}/approve endpoint."""

    @pytest.mark.asyncio
    async def test_approve_recommendation_success(
        self, mock_db_session, mock_user, mock_approval_result
    ):
        """Test successful recommendation approval."""
        from app.api.v1.recommendations import approve_recommendation, ApproveRecommendationRequest

        request = ApproveRecommendationRequest(notes="Approved for Q1 budget")

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.approve_recommendation = AsyncMock(
                return_value=mock_approval_result
            )

            result = await approve_recommendation(
                recommendation_id=101,
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result["success"] is True
        assert "approved" in result["message"]
        assert result["details"]["status"] == "approved"
        mock_service.approve_recommendation.assert_called_once()

    @pytest.mark.asyncio
    async def test_approve_recommendation_without_notes(
        self, mock_db_session, mock_user, mock_approval_result
    ):
        """Test approval without optional notes."""
        from app.api.v1.recommendations import approve_recommendation, ApproveRecommendationRequest

        request = ApproveRecommendationRequest()

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.approve_recommendation = AsyncMock(
                return_value=mock_approval_result
            )

            result = await approve_recommendation(
                recommendation_id=101,
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result["success"] is True
        call_kwargs = mock_service.approve_recommendation.call_args.kwargs
        assert call_kwargs["notes"] is None

    @pytest.mark.asyncio
    async def test_approve_recommendation_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when recommendation doesn't exist."""
        from app.api.v1.recommendations import approve_recommendation, ApproveRecommendationRequest
        from fastapi import HTTPException

        request = ApproveRecommendationRequest()

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.approve_recommendation = AsyncMock(
                side_effect=ValueError("Recommendation not found: 999")
            )

            with pytest.raises(HTTPException) as exc_info:
                await approve_recommendation(
                    recommendation_id=999,
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_approve_recommendation_tracks_approver(
        self, mock_db_session, mock_user, mock_approval_result
    ):
        """Test that approver username is recorded."""
        from app.api.v1.recommendations import approve_recommendation, ApproveRecommendationRequest

        request = ApproveRecommendationRequest()

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.approve_recommendation = AsyncMock(
                return_value=mock_approval_result
            )

            await approve_recommendation(
                recommendation_id=101,
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.approve_recommendation.call_args.kwargs
        assert call_kwargs["approved_by"] == "hr_manager"


# =============================================================================
# Reject Recommendation Tests
# =============================================================================

class TestRejectRecommendation:
    """Tests for POST /recommendations/{id}/reject endpoint."""

    @pytest.mark.asyncio
    async def test_reject_recommendation_success(
        self, mock_db_session, mock_user, mock_rejection_result
    ):
        """Test successful recommendation rejection."""
        from app.api.v1.recommendations import reject_recommendation, RejectRecommendationRequest

        request = RejectRecommendationRequest(
            rejection_reason="Budget constraints this quarter"
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.reject_recommendation = AsyncMock(
                return_value=mock_rejection_result
            )

            result = await reject_recommendation(
                recommendation_id=101,
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result["success"] is True
        assert "rejected" in result["message"]
        assert result["details"]["status"] == "rejected"
        mock_service.reject_recommendation.assert_called_once()

    @pytest.mark.asyncio
    async def test_reject_recommendation_reason_required(self):
        """Test that rejection reason is required field."""
        from app.api.v1.recommendations import RejectRecommendationRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            RejectRecommendationRequest()  # Missing required field

    @pytest.mark.asyncio
    async def test_reject_recommendation_not_found(
        self, mock_db_session, mock_user
    ):
        """Test 404 when recommendation doesn't exist."""
        from app.api.v1.recommendations import reject_recommendation, RejectRecommendationRequest
        from fastapi import HTTPException

        request = RejectRecommendationRequest(rejection_reason="Not applicable")

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.reject_recommendation = AsyncMock(
                side_effect=ValueError("Recommendation not found: 999")
            )

            with pytest.raises(HTTPException) as exc_info:
                await reject_recommendation(
                    recommendation_id=999,
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_reject_recommendation_tracks_rejector(
        self, mock_db_session, mock_user, mock_rejection_result
    ):
        """Test that rejector username and reason are recorded."""
        from app.api.v1.recommendations import reject_recommendation, RejectRecommendationRequest

        request = RejectRecommendationRequest(
            rejection_reason="Employee resigned"
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.reject_recommendation = AsyncMock(
                return_value=mock_rejection_result
            )

            await reject_recommendation(
                recommendation_id=101,
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.reject_recommendation.call_args.kwargs
        assert call_kwargs["rejected_by"] == "hr_manager"
        assert call_kwargs["rejection_reason"] == "Employee resigned"


# =============================================================================
# Bulk Generate Recommendations Tests
# =============================================================================

class TestBulkGenerateRecommendations:
    """Tests for POST /recommendations/bulk-generate endpoint."""

    @pytest.mark.asyncio
    async def test_bulk_generate_success(
        self, mock_db_session, mock_user, mock_recommendation_result
    ):
        """Test successful bulk recommendation generation."""
        from app.api.v1.recommendations import (
            generate_bulk_recommendations,
            BulkRecommendationRequest
        )

        # Create multiple recommendation results
        result2 = MagicMock()
        result2.recommendation_id = 102
        result2.employee_id = "EMP002"
        result2.employee_name = "Jane Doe"
        result2.current_risk_level = "High"
        result2.churn_probability = 0.72
        result2.recommended_treatment_id = 3
        result2.recommended_treatment_name = "Career Development"
        result2.treatment_cost = 2000.0
        result2.projected_churn_reduction = 0.30
        result2.projected_eltv_gain = 15000.0
        result2.projected_roi = 6.5
        result2.reasoning = "Career stagnation"
        result2.priority_score = 0.80
        result2.expires_date = datetime.utcnow() + timedelta(days=30)

        request = BulkRecommendationRequest(
            risk_level_filter="High",
            max_recommendations=20
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_bulk_recommendations = AsyncMock(
                return_value=[mock_recommendation_result, result2]
            )

            result = await generate_bulk_recommendations(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert len(result) == 2
        assert result[0].recommendation_id == 101
        assert result[1].recommendation_id == 102

    @pytest.mark.asyncio
    async def test_bulk_generate_with_department_filter(
        self, mock_db_session, mock_user
    ):
        """Test bulk generation with department filter."""
        from app.api.v1.recommendations import (
            generate_bulk_recommendations,
            BulkRecommendationRequest
        )

        request = BulkRecommendationRequest(
            risk_level_filter="High",
            department_filter="Engineering",
            max_recommendations=10
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_bulk_recommendations = AsyncMock(return_value=[])

            await generate_bulk_recommendations(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.generate_bulk_recommendations.call_args.kwargs
        assert call_kwargs["department_filter"] == "Engineering"
        assert call_kwargs["risk_level_filter"] == "High"

    @pytest.mark.asyncio
    async def test_bulk_generate_empty_result(
        self, mock_db_session, mock_user
    ):
        """Test bulk generation when no employees match criteria."""
        from app.api.v1.recommendations import (
            generate_bulk_recommendations,
            BulkRecommendationRequest
        )

        request = BulkRecommendationRequest(
            risk_level_filter="Low",
            max_recommendations=5
        )

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_bulk_recommendations = AsyncMock(return_value=[])

            result = await generate_bulk_recommendations(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        assert result == []

    @pytest.mark.asyncio
    async def test_bulk_generate_respects_max_limit(
        self, mock_db_session, mock_user
    ):
        """Test that max_recommendations parameter is respected."""
        from app.api.v1.recommendations import (
            generate_bulk_recommendations,
            BulkRecommendationRequest
        )

        request = BulkRecommendationRequest(max_recommendations=5)

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_bulk_recommendations = AsyncMock(return_value=[])

            await generate_bulk_recommendations(
                request=request,
                current_user=mock_user,
                db=mock_db_session
            )

        call_kwargs = mock_service.generate_bulk_recommendations.call_args.kwargs
        assert call_kwargs["max_recommendations"] == 5

    @pytest.mark.asyncio
    async def test_bulk_generate_service_error(
        self, mock_db_session, mock_user
    ):
        """Test 500 when bulk generation fails."""
        from app.api.v1.recommendations import (
            generate_bulk_recommendations,
            BulkRecommendationRequest
        )
        from fastapi import HTTPException

        request = BulkRecommendationRequest()

        with patch("app.api.v1.recommendations.recommendation_service") as mock_service:
            mock_service.generate_bulk_recommendations = AsyncMock(
                side_effect=Exception("Bulk operation failed")
            )

            with pytest.raises(HTTPException) as exc_info:
                await generate_bulk_recommendations(
                    request=request,
                    current_user=mock_user,
                    db=mock_db_session
                )

        assert exc_info.value.status_code == 500

    def test_bulk_request_validation_max_recommendations(self):
        """Test validation of max_recommendations bounds."""
        from app.api.v1.recommendations import BulkRecommendationRequest
        from pydantic import ValidationError

        # Valid: within bounds
        valid_request = BulkRecommendationRequest(max_recommendations=50)
        assert valid_request.max_recommendations == 50

        # Invalid: below minimum
        with pytest.raises(ValidationError):
            BulkRecommendationRequest(max_recommendations=0)

        # Invalid: above maximum
        with pytest.raises(ValidationError):
            BulkRecommendationRequest(max_recommendations=101)


# =============================================================================
# Recommendation Statistics Tests
# =============================================================================

class TestRecommendationStats:
    """Tests for GET /recommendations/stats endpoint."""

    @pytest.mark.asyncio
    async def test_get_recommendation_stats_success(
        self, mock_db_session, mock_user
    ):
        """Test retrieving recommendation statistics."""
        from app.api.v1.recommendations import get_recommendation_stats

        # Mock the database execute results
        status_result = MagicMock()
        status_result.all.return_value = [
            ("pending", 15),
            ("approved", 45),
            ("rejected", 10),
            ("expired", 5)
        ]

        risk_result = MagicMock()
        risk_result.all.return_value = [
            ("High", 8),
            ("Medium", 5),
            ("Low", 2)
        ]

        mock_db_session.execute = AsyncMock(
            side_effect=[status_result, risk_result]
        )

        result = await get_recommendation_stats(
            current_user=mock_user,
            db=mock_db_session
        )

        assert result["total_recommendations"] == 75  # 15+45+10+5
        assert result["by_status"]["pending"] == 15
        assert result["by_status"]["approved"] == 45
        assert result["by_status"]["rejected"] == 10
        assert result["by_status"]["expired"] == 5
        assert result["pending_by_risk_level"]["High"] == 8
        assert result["pending_by_risk_level"]["Medium"] == 5
        assert result["pending_by_risk_level"]["Low"] == 2

    @pytest.mark.asyncio
    async def test_get_recommendation_stats_empty(
        self, mock_db_session, mock_user
    ):
        """Test statistics when no recommendations exist."""
        from app.api.v1.recommendations import get_recommendation_stats

        status_result = MagicMock()
        status_result.all.return_value = []

        risk_result = MagicMock()
        risk_result.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[status_result, risk_result]
        )

        result = await get_recommendation_stats(
            current_user=mock_user,
            db=mock_db_session
        )

        assert result["total_recommendations"] == 0
        assert result["by_status"]["pending"] == 0
        assert result["by_status"]["approved"] == 0
        assert result["pending_by_risk_level"]["High"] == 0

    @pytest.mark.asyncio
    async def test_get_recommendation_stats_database_error(
        self, mock_db_session, mock_user
    ):
        """Test 500 when database query fails."""
        from app.api.v1.recommendations import get_recommendation_stats
        from fastapi import HTTPException

        mock_db_session.execute = AsyncMock(
            side_effect=Exception("Database connection lost")
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_recommendation_stats(
                current_user=mock_user,
                db=mock_db_session
            )

        assert exc_info.value.status_code == 500
        assert "Error retrieving recommendation stats" in str(exc_info.value.detail)


# =============================================================================
# Request Schema Validation Tests
# =============================================================================

class TestRequestSchemaValidation:
    """Tests for Pydantic request schema validation."""

    def test_generate_request_minimal(self):
        """Test GenerateRecommendationRequest with minimal fields."""
        from app.api.v1.recommendations import GenerateRecommendationRequest

        request = GenerateRecommendationRequest(employee_id="EMP001")
        assert request.employee_id == "EMP001"
        assert request.treatment_id is None
        assert request.use_ml_model is True  # Default
        assert request.reasoning_override is None

    def test_generate_request_all_fields(self):
        """Test GenerateRecommendationRequest with all fields."""
        from app.api.v1.recommendations import GenerateRecommendationRequest

        request = GenerateRecommendationRequest(
            employee_id="EMP001",
            treatment_id=5,
            use_ml_model=False,
            reasoning_override="Custom reason"
        )
        assert request.treatment_id == 5
        assert request.use_ml_model is False
        assert request.reasoning_override == "Custom reason"

    def test_bulk_request_defaults(self):
        """Test BulkRecommendationRequest default values."""
        from app.api.v1.recommendations import BulkRecommendationRequest

        request = BulkRecommendationRequest()
        assert request.risk_level_filter == "High"  # Default
        assert request.department_filter is None
        assert request.max_recommendations == 20  # Default

    def test_approval_request_optional_notes(self):
        """Test ApproveRecommendationRequest optional notes."""
        from app.api.v1.recommendations import ApproveRecommendationRequest

        request = ApproveRecommendationRequest()
        assert request.notes is None

        request_with_notes = ApproveRecommendationRequest(notes="Approved by VP")
        assert request_with_notes.notes == "Approved by VP"
