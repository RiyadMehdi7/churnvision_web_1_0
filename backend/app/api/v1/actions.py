"""
Action Proposals API

Endpoints for generating and managing AI-powered action proposals
for employee retention interventions.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.api.deps import get_current_user, get_db
from app.models.auth import UserAccount
from app.services.action_generation_service import ActionGenerationService

router = APIRouter()


# --- Request/Response Models ---

class ActionProposalRequest(BaseModel):
    hr_code: str = Field(..., description="Employee HR code")
    action_type: str = Field(..., description="Type of action: email, meeting, task")
    subtype: Optional[str] = Field(None, description="Subtype (e.g., check_in, one_on_one)")


class ActionProposalResponse(BaseModel):
    id: Optional[str] = None
    type: str
    status: str
    title: str
    description: str
    metadata: dict
    createdAt: str


class ActionExecuteRequest(BaseModel):
    action_id: str = Field(..., description="Action proposal ID")
    action_type: str = Field(..., description="Type of action")
    metadata: dict = Field(..., description="Action metadata for execution")


class ActionExecuteResponse(BaseModel):
    success: bool
    message: str
    executedAt: Optional[str] = None


# --- Endpoints ---

@router.post("/generate/email", response_model=ActionProposalResponse)
async def generate_email_proposal(
    hr_code: str,
    email_type: str = "check_in",
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a draft retention email for an employee.

    Email types:
    - check_in: Casual check-in email
    - career_discussion: Career growth discussion invite
    - recognition: Recognition and appreciation email
    - stay_interview: Stay interview invitation
    """
    service = ActionGenerationService(db)

    try:
        proposal = await service.generate_retention_email(hr_code, email_type)
        return ActionProposalResponse(**proposal)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate email: {str(e)}")


@router.post("/generate/meeting", response_model=ActionProposalResponse)
async def generate_meeting_proposal(
    hr_code: str,
    meeting_type: str = "one_on_one",
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a meeting proposal for an employee.

    Meeting types:
    - one_on_one: Regular 1:1 with direct manager
    - skip_level: Meeting with skip-level manager
    - career_planning: Focused career discussion
    - team_sync: Informal team connection
    """
    service = ActionGenerationService(db)

    try:
        proposal = await service.generate_meeting_proposal(hr_code, meeting_type)
        return ActionProposalResponse(**proposal)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate meeting: {str(e)}")


@router.post("/generate/task", response_model=ActionProposalResponse)
async def generate_task_proposal(
    hr_code: str,
    task_type: str = "follow_up",
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a follow-up task for an employee.

    Task types:
    - follow_up: General follow-up task
    - review_compensation: Compensation review task
    - training_enrollment: Training enrollment task
    - recognition: Recognition action task
    """
    service = ActionGenerationService(db)

    try:
        proposal = await service.generate_task_proposal(hr_code, task_type)
        return ActionProposalResponse(**proposal)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate task: {str(e)}")


@router.post("/generate/suite", response_model=List[ActionProposalResponse])
async def generate_action_suite(
    hr_code: str,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a suite of recommended actions for an employee based on their risk level.

    Returns multiple action proposals tailored to the employee's situation.
    """
    service = ActionGenerationService(db)

    try:
        proposals = await service.generate_actions_for_employee(hr_code)
        return [ActionProposalResponse(**p) for p in proposals]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate actions: {str(e)}")


@router.post("/execute", response_model=ActionExecuteResponse)
async def execute_action(
    request: ActionExecuteRequest,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Execute an approved action.

    Note: This is currently a mock implementation.
    In production, this would integrate with:
    - Email service (SMTP, SendGrid, etc.)
    - Calendar API (Google Calendar, Outlook, etc.)
    - Task management system (Jira, Asana, etc.)
    """
    # Mock implementation - in production, dispatch to appropriate service
    action_type = request.action_type

    if action_type == "email":
        # Mock: Log email send
        return ActionExecuteResponse(
            success=True,
            message=f"Email queued for delivery to {request.metadata.get('to', ['recipient'])}",
            executedAt=datetime.utcnow().isoformat()
        )

    elif action_type == "meeting":
        # Mock: Log meeting creation
        return ActionExecuteResponse(
            success=True,
            message=f"Meeting invite sent to {request.metadata.get('attendees', ['attendees'])}",
            executedAt=datetime.utcnow().isoformat()
        )

    elif action_type == "task":
        # Mock: Log task creation
        return ActionExecuteResponse(
            success=True,
            message=f"Task created and assigned to {request.metadata.get('assignee', 'assignee')}",
            executedAt=datetime.utcnow().isoformat()
        )

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action type: {action_type}")


@router.post("/reject")
async def reject_action(
    action_id: str,
    reason: Optional[str] = None,
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Reject an action proposal.

    This endpoint logs the rejection for analytics purposes.
    """
    # In production, store rejection in audit log
    return {
        "success": True,
        "message": "Action rejected",
        "actionId": action_id,
        "reason": reason
    }
