/**
 * Actions Service
 *
 * Handles AI-generated action proposals (emails, meetings, tasks)
 * and their execution workflow.
 */

import api from '@/services/api';
import type { ActionProposal, ActionType } from '@/types/agent';
import { v4 as uuidv4 } from 'uuid';

// API response types
interface ActionProposalResponse {
  id?: string;
  type: string;
  status: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

interface ActionExecuteResponse {
  success: boolean;
  message: string;
  executedAt?: string;
}

// Convert API response to frontend ActionProposal type
function mapToActionProposal(response: ActionProposalResponse): ActionProposal {
  return {
    id: response.id || uuidv4(),
    type: response.type as ActionType,
    title: response.title,
    description: response.description,
    status: response.status as 'pending' | 'approved' | 'rejected' | 'executed',
    createdAt: new Date(response.createdAt),
    metadata: {
      to: response.metadata.to,
      cc: response.metadata.cc,
      subject: response.metadata.subject,
      body: response.metadata.body,
      attendees: response.metadata.attendees,
      proposedTime: response.metadata.proposedTime ? new Date(response.metadata.proposedTime) : undefined,
      duration: response.metadata.duration,
      agenda: response.metadata.agenda,
      assignee: response.metadata.assignee,
      dueDate: response.metadata.dueDate ? new Date(response.metadata.dueDate) : undefined,
      priority: response.metadata.priority,
      targetEmployee: response.metadata.targetEmployee,
    },
  };
}

class ActionsService {
  /**
   * Generate an email draft for an employee
   */
  async generateEmail(
    hrCode: string,
    emailType: 'check_in' | 'career_discussion' | 'recognition' | 'stay_interview' = 'check_in'
  ): Promise<ActionProposal> {
    const response = await api.post<ActionProposalResponse>(
      `/actions/generate/email?hr_code=${hrCode}&email_type=${emailType}`
    );
    return mapToActionProposal(response.data);
  }

  /**
   * Generate a meeting proposal for an employee
   */
  async generateMeeting(
    hrCode: string,
    meetingType: 'one_on_one' | 'skip_level' | 'career_planning' | 'team_sync' = 'one_on_one'
  ): Promise<ActionProposal> {
    const response = await api.post<ActionProposalResponse>(
      `/actions/generate/meeting?hr_code=${hrCode}&meeting_type=${meetingType}`
    );
    return mapToActionProposal(response.data);
  }

  /**
   * Generate a task for an employee
   */
  async generateTask(
    hrCode: string,
    taskType: 'follow_up' | 'review_compensation' | 'training_enrollment' | 'recognition' = 'follow_up'
  ): Promise<ActionProposal> {
    const response = await api.post<ActionProposalResponse>(
      `/actions/generate/task?hr_code=${hrCode}&task_type=${taskType}`
    );
    return mapToActionProposal(response.data);
  }

  /**
   * Generate a suite of recommended actions for an employee
   */
  async generateActionSuite(hrCode: string): Promise<ActionProposal[]> {
    const response = await api.post<ActionProposalResponse[]>(
      `/actions/generate/suite?hr_code=${hrCode}`
    );
    return response.data.map(mapToActionProposal);
  }

  /**
   * Execute an approved action
   */
  async executeAction(proposal: ActionProposal): Promise<ActionExecuteResponse> {
    const response = await api.post<ActionExecuteResponse>('/actions/execute', {
      action_id: proposal.id,
      action_type: proposal.type,
      metadata: proposal.metadata,
    });
    return response.data;
  }

  /**
   * Reject an action proposal
   */
  async rejectAction(actionId: string, reason?: string): Promise<void> {
    await api.post('/actions/reject', null, {
      params: { action_id: actionId, reason },
    });
  }
}

export const actionsService = new ActionsService();
export default actionsService;
