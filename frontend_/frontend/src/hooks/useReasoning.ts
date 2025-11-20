import { useState, useEffect, useCallback, useMemo } from 'react';
import reasoningService from '../services/reasoning';
import {
  ChurnReasoning,
  BusinessRule,
  BehavioralStage,
  ReasoningSummary,
  LLMStatus
} from '../types/reasoning';

interface UseReasoningState {
  reasoning: ChurnReasoning | null;
  isLoading: boolean;
  error: string | null;
}

interface UseReasoningBatchState {
  reasoningData: ChurnReasoning[];
  isLoading: boolean;
  error: string | null;
}

interface UseRulesState {
  rules: BusinessRule[];
  isLoading: boolean;
  error: string | null;
}

interface UseStagesState {
  stages: BehavioralStage[];
  isLoading: boolean;
  error: string | null;
}

interface UseSummaryState {
  summary: ReasoningSummary | null;
  isLoading: boolean;
  error: string | null;
}

interface UseLLMState {
  status: LLMStatus | null;
  isLoading: boolean;
  error: string | null;
}

// Hook for individual employee reasoning
export function useEmployeeReasoning(hrCode: string | null) {
  const [state, setState] = useState<UseReasoningState>({
    reasoning: null,
    isLoading: false,
    error: null
  });

  const fetchReasoning = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const reasoning = await reasoningService.getEmployeeReasoning(code);
      setState({ reasoning, isLoading: false, error: null });
    } catch (error: any) {
      setState({ reasoning: null, isLoading: false, error: error.message });
    }
  }, []);

  const refreshReasoning = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const reasoning = await reasoningService.refreshEmployeeReasoning(code);
      setState({ reasoning, isLoading: false, error: null });
    } catch (error: any) {
      setState({ reasoning: null, isLoading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    if (hrCode) {
      fetchReasoning(hrCode);
    } else {
      setState({ reasoning: null, isLoading: false, error: null });
    }
  }, [hrCode, fetchReasoning]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    refetch: hrCode ? () => fetchReasoning(hrCode) : undefined,
    refresh: hrCode ? () => refreshReasoning(hrCode) : undefined
  }), [state, hrCode, fetchReasoning, refreshReasoning]);
}

// Hook for batch reasoning with progress tracking
export function useBatchReasoning() {
  const [state, setState] = useState<UseReasoningBatchState>({
    reasoningData: [],
    isLoading: false,
    error: null
  });
  
  // Progress tracking state
  const [batchProgress, setBatchProgress] = useState({
    total: 0,
    processed: 0,
    currentItem: '',
    isProcessing: false
  });

  const fetchBatchReasoning = useCallback(async (hrCodes: string[]) => {
    if (hrCodes.length === 0) {
      setState({ reasoningData: [], isLoading: false, error: null });
      setBatchProgress({ total: 0, processed: 0, currentItem: '', isProcessing: false });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setBatchProgress({
      total: hrCodes.length,
      processed: 0,
      currentItem: '',
      isProcessing: true
    });

    try {
      // Set up progress tracking if available
      if ((window as any).electronApi?.reasoning?.onBatchProgress) {
        const unsubscribe = (window as any).electronApi.reasoning.onBatchProgress((progress: {
          total: number;
          processed: number;
          currentItem: string;
        }) => {
          setBatchProgress(prev => ({
            ...prev,
            processed: progress.processed,
            currentItem: progress.currentItem
          }));
        });

        // Clean up listener when component unmounts or request completes
        const cleanup = () => {
          unsubscribe?.();
        };

        try {
          const reasoningData = await reasoningService.getBatchReasoning(hrCodes);
          setState({ reasoningData, isLoading: false, error: null });
          setBatchProgress(prev => ({
            ...prev,
            processed: prev.total,
            currentItem: '',
            isProcessing: false
          }));
        } finally {
          cleanup();
        }
      } else {
        // Fallback without progress tracking
        const reasoningData = await reasoningService.getBatchReasoning(hrCodes);
        setState({ reasoningData, isLoading: false, error: null });
        setBatchProgress({
          total: hrCodes.length,
          processed: hrCodes.length,
          currentItem: '',
          isProcessing: false
        });
      }
    } catch (error: any) {
      setState({ reasoningData: [], isLoading: false, error: error.message });
      setBatchProgress(prev => ({
        ...prev,
        isProcessing: false,
        currentItem: ''
      }));
    }
  }, []);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    batchProgress,
    fetchBatchReasoning
  }), [state, batchProgress, fetchBatchReasoning]);
}

// Hook for business rules management
export function useBusinessRules() {
  const [state, setState] = useState<UseRulesState>({
    rules: [],
    isLoading: false,
    error: null
  });

  const fetchRules = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const rules = await reasoningService.getAllRules();
      setState({ rules, isLoading: false, error: null });
    } catch (error: any) {
      setState({ rules: [], isLoading: false, error: error.message });
    }
  }, []);

  const createRule = useCallback(async (ruleData: {
    name: string;
    description?: string;
    condition: string;
    adjustmentLogic: string;
    priority?: number;
  }) => {
    try {
      await reasoningService.createRule(ruleData);
      await fetchRules(); // Refresh the list
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, [fetchRules]);

  const updateRule = useCallback(async (ruleId: number, updates: any) => {
    try {
      await reasoningService.updateRule(ruleId, updates);
      await fetchRules(); // Refresh the list
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, [fetchRules]);

  const deleteRule = useCallback(async (ruleId: number) => {
    try {
      await reasoningService.deleteRule(ruleId);
      await fetchRules(); // Refresh the list
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, [fetchRules]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    refetch: fetchRules,
    createRule,
    updateRule,
    deleteRule
  }), [state, fetchRules, createRule, updateRule, deleteRule]);
}

// Hook for behavioral stages management
export function useBehavioralStages() {
  const [state, setState] = useState<UseStagesState>({
    stages: [],
    isLoading: false,
    error: null
  });

  const fetchStages = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const stages = await reasoningService.getAllStages();
      setState({ stages, isLoading: false, error: null });
    } catch (error: any) {
      setState({ stages: [], isLoading: false, error: error.message });
    }
  }, []);

  const createStage = useCallback(async (stageData: {
    name: string;
    description?: string;
    minTenure: number;
    maxTenure?: number | null;
    indicators?: string[];
    baseRiskScore: number;
  }) => {
    try {
      await reasoningService.createStage(stageData);
      await fetchStages(); // Refresh the list
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, [fetchStages]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    refetch: fetchStages,
    createStage
  }), [state, fetchStages, createStage]);
}

// Hook for reasoning summary
export function useReasoningSummary(limit: number = 100) {
  const [state, setState] = useState<UseSummaryState>({
    summary: null,
    isLoading: false,
    error: null
  });

  const fetchSummary = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const summary = await reasoningService.getReasoningSummary(limit);
      setState({ summary, isLoading: false, error: null });
    } catch (error: any) {
      setState({ summary: null, isLoading: false, error: error.message });
    }
  }, [limit]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    refetch: fetchSummary
  }), [state, fetchSummary]);
}

// Hook for LLM status
export function useLLMStatus() {
  const [state, setState] = useState<UseLLMState>({
    status: null,
    isLoading: false,
    error: null
  });

  const fetchStatus = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const status = await reasoningService.getLLMStatus();
      setState({ status, isLoading: false, error: null });
    } catch (error: any) {
      setState({ status: null, isLoading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    ...state,
    refetch: fetchStatus
  }), [state, fetchStatus]);
}

// Hook for asking LLM questions
export function useLLMQuestion() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = useCallback(async (question: string, hrCode: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await reasoningService.askLLMQuestion({ question, hrCode });
      setIsLoading(false);
      return response;
    } catch (error: any) {
      setError(error.message);
      setIsLoading(false);
      throw error;
    }
  }, []);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    askQuestion,
    isLoading,
    error
  }), [askQuestion, isLoading, error]);
}

// Hook for cache management
export function useReasoningCache() {
  const invalidateEmployeeCache = useCallback(async (hrCode: string) => {
    try {
      await reasoningService.invalidateEmployeeCache(hrCode);
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, []);

  const invalidateAllCache = useCallback(async () => {
    try {
      await reasoningService.invalidateAllCache();
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, []);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(() => ({
    invalidateEmployeeCache,
    invalidateAllCache
  }), [invalidateEmployeeCache, invalidateAllCache]);
} 