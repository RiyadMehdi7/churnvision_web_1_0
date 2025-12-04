/**
 * useActionProposals Hook
 *
 * Manages action proposals state and operations.
 */

import { useState, useCallback } from 'react';
import type { ActionProposal } from '@/types/agent';
import actionsService from '@/services/actions';

interface UseActionProposalsReturn {
  proposals: ActionProposal[];
  isGenerating: boolean;
  error: string | null;
  generateEmail: (hrCode: string, type?: string) => Promise<ActionProposal | null>;
  generateMeeting: (hrCode: string, type?: string) => Promise<ActionProposal | null>;
  generateTask: (hrCode: string, type?: string) => Promise<ActionProposal | null>;
  generateSuite: (hrCode: string) => Promise<ActionProposal[]>;
  approveAction: (proposal: ActionProposal) => Promise<boolean>;
  rejectAction: (proposal: ActionProposal) => Promise<void>;
  editAction: (proposal: ActionProposal) => void;
  clearProposals: () => void;
  addProposal: (proposal: ActionProposal) => void;
}

export function useActionProposals(): UseActionProposalsReturn {
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateEmail = useCallback(async (hrCode: string, type: string = 'check_in') => {
    setIsGenerating(true);
    setError(null);
    try {
      const proposal = await actionsService.generateEmail(
        hrCode,
        type as 'check_in' | 'career_discussion' | 'recognition' | 'stay_interview'
      );
      setProposals(prev => [...prev, proposal]);
      return proposal;
    } catch (err: any) {
      setError(err.message || 'Failed to generate email');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateMeeting = useCallback(async (hrCode: string, type: string = 'one_on_one') => {
    setIsGenerating(true);
    setError(null);
    try {
      const proposal = await actionsService.generateMeeting(
        hrCode,
        type as 'one_on_one' | 'skip_level' | 'career_planning' | 'team_sync'
      );
      setProposals(prev => [...prev, proposal]);
      return proposal;
    } catch (err: any) {
      setError(err.message || 'Failed to generate meeting');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateTask = useCallback(async (hrCode: string, type: string = 'follow_up') => {
    setIsGenerating(true);
    setError(null);
    try {
      const proposal = await actionsService.generateTask(
        hrCode,
        type as 'follow_up' | 'review_compensation' | 'training_enrollment' | 'recognition'
      );
      setProposals(prev => [...prev, proposal]);
      return proposal;
    } catch (err: any) {
      setError(err.message || 'Failed to generate task');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateSuite = useCallback(async (hrCode: string) => {
    setIsGenerating(true);
    setError(null);
    try {
      const newProposals = await actionsService.generateActionSuite(hrCode);
      setProposals(prev => [...prev, ...newProposals]);
      return newProposals;
    } catch (err: any) {
      setError(err.message || 'Failed to generate actions');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const approveAction = useCallback(async (proposal: ActionProposal) => {
    try {
      const result = await actionsService.executeAction(proposal);
      if (result.success) {
        setProposals(prev =>
          prev.map(p =>
            p.id === proposal.id
              ? { ...p, status: 'approved' as const, executedAt: new Date() }
              : p
          )
        );
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message || 'Failed to execute action');
      return false;
    }
  }, []);

  const rejectAction = useCallback(async (proposal: ActionProposal) => {
    try {
      await actionsService.rejectAction(proposal.id);
      setProposals(prev =>
        prev.map(p =>
          p.id === proposal.id ? { ...p, status: 'rejected' as const } : p
        )
      );
    } catch (err: any) {
      setError(err.message || 'Failed to reject action');
    }
  }, []);

  const editAction = useCallback((proposal: ActionProposal) => {
    setProposals(prev =>
      prev.map(p => (p.id === proposal.id ? proposal : p))
    );
  }, []);

  const clearProposals = useCallback(() => {
    setProposals([]);
    setError(null);
  }, []);

  const addProposal = useCallback((proposal: ActionProposal) => {
    setProposals(prev => [...prev, proposal]);
  }, []);

  return {
    proposals,
    isGenerating,
    error,
    generateEmail,
    generateMeeting,
    generateTask,
    generateSuite,
    approveAction,
    rejectAction,
    editAction,
    clearProposals,
    addProposal,
  };
}

export default useActionProposals;
