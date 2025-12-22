/**
 * useAgentMemory Hook
 *
 * Comprehensive memory system for the AI agent:
 * - Session memory (employees discussed, insights)
 * - LocalStorage persistence
 * - Backend sync for cross-session persistence
 * - Insights extraction from chat responses
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AgentContext, MemoryItem } from '@/types/agent';
import api from '@/services/apiService';

const STORAGE_KEY = 'churnvision_agent_memory';
const MEMORY_VERSION = 1;

interface PersistedMemory {
  version: number;
  sessionId: string;
  employeesDiscussed: AgentContext['employeesDiscussed'];
  recentDecisions: MemoryItem[];
  lastUpdated: string;
}

interface InsightPattern {
  pattern: RegExp;
  type: MemoryItem['type'];
  extractTitle: (match: RegExpMatchArray, employeeName?: string) => string;
  extractSummary: (match: RegExpMatchArray, fullText: string) => string;
}

// Patterns to extract insights from AI responses
const INSIGHT_PATTERNS: InsightPattern[] = [
  {
    pattern: /risk (?:level|score)[:\s]+(?:high|critical|elevated)/i,
    type: 'insight_found',
    extractTitle: (_, name) => `High Risk Identified${name ? `: ${name}` : ''}`,
    extractSummary: (_, text) => {
      const match = text.match(/(?:risk|concern|factor)[s]?[:\s]+([^.]+)/i);
      return match ? match[1].slice(0, 100) : 'Employee flagged as high churn risk';
    },
  },
  {
    pattern: /recommend(?:ed|ation)?[:\s]+([^.]+)/i,
    type: 'decision_made',
    extractTitle: () => 'Recommendation Made',
    extractSummary: (match) => match[1].slice(0, 100),
  },
  {
    pattern: /treatment[s]?[:\s]+([^.]+)/i,
    type: 'action_taken',
    extractTitle: () => 'Treatment Suggested',
    extractSummary: (match) => match[1].slice(0, 100),
  },
  {
    pattern: /similar (?:to|employees|profiles)[:\s]+([^.]+)/i,
    type: 'insight_found',
    extractTitle: () => 'Similar Patterns Found',
    extractSummary: (match) => match[1].slice(0, 100),
  },
  {
    pattern: /retention (?:plan|strategy|playbook)/i,
    type: 'decision_made',
    extractTitle: (_, name) => `Retention Plan${name ? ` for ${name}` : ''}`,
    extractSummary: () => 'Generated personalized retention strategy',
  },
  {
    pattern: /key (?:factor|driver|contributor)[s]?[:\s]+([^.]+)/i,
    type: 'insight_found',
    extractTitle: () => 'Key Factors Identified',
    extractSummary: (match) => match[1].slice(0, 100),
  },
];

// Backend insight types
interface BackendInsight {
  id: number;
  insightType: string;
  title: string;
  summary?: string;
  relatedEmployeeHrCode?: string;
  createdAt: string;
}

interface OrganizationalPattern {
  id: number;
  patternType: string;
  patternKey: string;
  description?: string;
  occurrenceCount: number;
  confidenceScore?: number;
}

interface UseAgentMemoryReturn {
  context: AgentContext;
  addEmployeeDiscussed: (employee: {
    hrCode: string;
    name: string;
    riskLevel?: string;
  }) => void;
  addInsight: (insight: Omit<MemoryItem, 'id' | 'timestamp'>) => void;
  extractInsightsFromResponse: (response: string, employeeName?: string) => MemoryItem[];
  clearMemory: () => void;
  clearEmployees: () => void;
  clearInsights: () => void;
  syncToBackend: () => Promise<void>;
  loadFromBackend: () => Promise<void>;
  clearBackendMemory: () => Promise<void>;
  saveInsightToBackend: (insight: {
    insightType: string;
    title: string;
    summary?: string;
    relatedEmployeeHrCode?: string;
    relatedDepartment?: string;
    context?: Record<string, unknown>;
  }) => Promise<BackendInsight | null>;
  getBackendInsights: (params?: {
    limit?: number;
    insight_type?: string;
    employee_hr_code?: string;
  }) => Promise<BackendInsight[]>;
  getEmployeeInsights: (hrCode: string, limit?: number) => Promise<BackendInsight[]>;
  getOrganizationalPatterns: (patternType?: string, limit?: number) => Promise<OrganizationalPattern[]>;
  isLoading: boolean;
  isSyncing: boolean;
}

export function useAgentMemory(): UseAgentMemoryReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout>();

  const [context, setContext] = useState<AgentContext>(() => {
    // Initialize with empty context, will load from storage in useEffect
    return {
      sessionId: uuidv4(),
      employeesDiscussed: [],
      recentDecisions: [],
      pendingActions: [],
      executedActions: [],
    };
  });

  // Load from localStorage on mount
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: PersistedMemory = JSON.parse(stored);
          if (parsed.version === MEMORY_VERSION) {
            setContext(prev => ({
              ...prev,
              sessionId: parsed.sessionId,
              employeesDiscussed: parsed.employeesDiscussed.map(emp => ({
                ...emp,
                lastDiscussed: new Date(emp.lastDiscussed),
              })),
              recentDecisions: parsed.recentDecisions.map(item => ({
                ...item,
                timestamp: new Date(item.timestamp),
              })),
            }));
          }
        }
      } catch (e) {
        console.error('Failed to load agent memory from storage:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadFromStorage();
  }, []);

  // Persist to localStorage on change (debounced)
  useEffect(() => {
    if (isLoading) return;

    const persist = () => {
      try {
        const toStore: PersistedMemory = {
          version: MEMORY_VERSION,
          sessionId: context.sessionId,
          employeesDiscussed: context.employeesDiscussed,
          recentDecisions: context.recentDecisions,
          lastUpdated: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch (e) {
        console.error('Failed to persist agent memory:', e);
      }
    };

    // Debounce persistence
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(persist, 500);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [context, isLoading]);

  // Add employee to discussed list
  const addEmployeeDiscussed = useCallback((employee: {
    hrCode: string;
    name: string;
    riskLevel?: string;
  }) => {
    setContext(prev => {
      const existingIndex = prev.employeesDiscussed.findIndex(
        e => e.hrCode === employee.hrCode
      );

      const entry = {
        hrCode: employee.hrCode,
        name: employee.name,
        lastDiscussed: new Date(),
        riskLevel: employee.riskLevel,
      };

      let updatedEmployees;
      if (existingIndex >= 0) {
        // Update existing entry
        updatedEmployees = prev.employeesDiscussed.map((e, i) =>
          i === existingIndex ? entry : e
        );
        // Move to front
        const [updated] = updatedEmployees.splice(existingIndex, 1);
        updatedEmployees.unshift(updated);
      } else {
        // Add new entry at front, limit to 20
        updatedEmployees = [entry, ...prev.employeesDiscussed].slice(0, 20);
      }

      return {
        ...prev,
        employeesDiscussed: updatedEmployees,
      };
    });
  }, []);

  // Add insight/decision
  const addInsight = useCallback((insight: Omit<MemoryItem, 'id' | 'timestamp'>) => {
    setContext(prev => {
      const newInsight: MemoryItem = {
        ...insight,
        id: uuidv4(),
        timestamp: new Date(),
      };

      // Limit to 50 insights, remove oldest
      const updatedDecisions = [newInsight, ...prev.recentDecisions].slice(0, 50);

      return {
        ...prev,
        recentDecisions: updatedDecisions,
      };
    });
  }, []);

  // Extract insights from AI response text
  const extractInsightsFromResponse = useCallback((
    response: string,
    employeeName?: string
  ): MemoryItem[] => {
    const insights: MemoryItem[] = [];
    const addedTypes = new Set<string>();

    for (const pattern of INSIGHT_PATTERNS) {
      const match = response.match(pattern.pattern);
      if (match && !addedTypes.has(pattern.type)) {
        const insight: MemoryItem = {
          id: uuidv4(),
          type: pattern.type,
          title: pattern.extractTitle(match, employeeName),
          summary: pattern.extractSummary(match, response),
          timestamp: new Date(),
          relatedEntities: employeeName ? { employees: [employeeName] } : undefined,
        };
        insights.push(insight);
        addedTypes.add(pattern.type);

        // Add to context
        addInsight(insight);
      }
    }

    return insights;
  }, [addInsight]);

  // Clear all memory
  const clearMemory = useCallback(() => {
    setContext(prev => ({
      ...prev,
      sessionId: uuidv4(),
      employeesDiscussed: [],
      recentDecisions: [],
    }));
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Clear only employees
  const clearEmployees = useCallback(() => {
    setContext(prev => ({
      ...prev,
      employeesDiscussed: [],
    }));
  }, []);

  // Clear only insights
  const clearInsights = useCallback(() => {
    setContext(prev => ({
      ...prev,
      recentDecisions: [],
    }));
  }, []);

  // Sync to backend (for cross-device persistence)
  const syncToBackend = useCallback(async () => {
    setIsSyncing(true);
    try {
      await api.post('/agent-memory/sync', {
        sessionId: context.sessionId,
        employeesDiscussed: context.employeesDiscussed,
        recentDecisions: context.recentDecisions,
      });
    } catch (e) {
      console.error('Failed to sync memory to backend:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [context]);

  // Load from backend
  const loadFromBackend = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/agent-memory/load');
      if (response.data) {
        setContext(prev => ({
          ...prev,
          ...response.data,
          employeesDiscussed: response.data.employeesDiscussed?.map((emp: any) => ({
            ...emp,
            lastDiscussed: new Date(emp.lastDiscussed),
          })) || [],
          recentDecisions: response.data.recentDecisions?.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          })) || [],
        }));
      }
    } catch (e) {
      // Backend sync not available, use localStorage only
      console.log('Backend memory sync not available');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear memory on backend
  const clearBackendMemory = useCallback(async () => {
    setIsSyncing(true);
    try {
      await api.delete('/agent-memory/clear');
      // Also clear local memory
      clearMemory();
    } catch (e) {
      console.error('Failed to clear backend memory:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [clearMemory]);

  // Save insight to backend for organizational learning
  const saveInsightToBackend = useCallback(async (insight: {
    insightType: string;
    title: string;
    summary?: string;
    relatedEmployeeHrCode?: string;
    relatedDepartment?: string;
    context?: Record<string, unknown>;
  }): Promise<BackendInsight | null> => {
    try {
      const response = await api.post('/agent-memory/insights', insight);
      return response.data;
    } catch (e) {
      console.error('Failed to save insight to backend:', e);
      return null;
    }
  }, []);

  // Get insights from backend
  const getBackendInsights = useCallback(async (params?: {
    limit?: number;
    insight_type?: string;
    employee_hr_code?: string;
  }): Promise<BackendInsight[]> => {
    try {
      const response = await api.get('/agent-memory/insights', { params });
      return response.data || [];
    } catch (e) {
      console.error('Failed to get backend insights:', e);
      return [];
    }
  }, []);

  // Get insights for a specific employee
  const getEmployeeInsights = useCallback(async (
    hrCode: string,
    limit = 20
  ): Promise<BackendInsight[]> => {
    try {
      const response = await api.get(`/agent-memory/insights/employee/${hrCode}`, {
        params: { limit },
      });
      return response.data || [];
    } catch (e) {
      console.error('Failed to get employee insights:', e);
      return [];
    }
  }, []);

  // Get organizational patterns
  const getOrganizationalPatterns = useCallback(async (
    patternType?: string,
    limit = 20
  ): Promise<OrganizationalPattern[]> => {
    try {
      const response = await api.get('/agent-memory/patterns', {
        params: { pattern_type: patternType, limit },
      });
      return response.data || [];
    } catch (e) {
      console.error('Failed to get organizational patterns:', e);
      return [];
    }
  }, []);

  return {
    context,
    addEmployeeDiscussed,
    addInsight,
    extractInsightsFromResponse,
    clearMemory,
    clearEmployees,
    clearInsights,
    syncToBackend,
    loadFromBackend,
    clearBackendMemory,
    saveInsightToBackend,
    getBackendInsights,
    getEmployeeInsights,
    getOrganizationalPatterns,
    isLoading,
    isSyncing,
  };
}

export default useAgentMemory;
