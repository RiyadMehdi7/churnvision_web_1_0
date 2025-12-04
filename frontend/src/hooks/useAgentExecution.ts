/**
 * useAgentExecution Hook
 *
 * Manages agent execution state and simulates tool execution steps
 * based on the query pattern detected.
 */

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentExecution,
  AgentToolExecution,
  AgentToolType,
  ToolStatus,
} from '@/types/agent';
import { TOOL_METADATA } from '@/types/agent';

// Pattern to tool mapping - defines which tools are used for each query type
const PATTERN_TOOL_CHAINS: Record<string, AgentToolType[]> = {
  churn_risk_diagnosis: [
    'think',
    'query_employee',
    'fetch_churn_reasoning',
    'analyze_risk_factors',
    'synthesize',
  ],
  retention_plan: [
    'think',
    'query_employee',
    'fetch_churn_reasoning',
    'generate_treatments',
    'generate_retention_plan',
    'synthesize',
  ],
  employee_comparison: [
    'think',
    'query_employee',
    'fetch_churn_reasoning',
    'compare_employees',
    'synthesize',
  ],
  employee_comparison_stayed: [
    'think',
    'query_employee',
    'fetch_churn_reasoning',
    'compare_employees',
    'synthesize',
  ],
  exit_pattern_mining: [
    'think',
    'mine_exit_patterns',
    'analyze_risk_factors',
    'synthesize',
  ],
  workforce_trends: [
    'think',
    'fetch_workforce_stats',
    'analyze_department',
    'synthesize',
  ],
  department_analysis: [
    'think',
    'analyze_department',
    'fetch_workforce_stats',
    'synthesize',
  ],
  shap_explanation: [
    'think',
    'query_employee',
    'fetch_churn_reasoning',
    'analyze_risk_factors',
    'synthesize',
  ],
  general_chat: ['think', 'synthesize'],
};

// Tool descriptions based on context
const getToolDescription = (
  tool: AgentToolType,
  context?: { employeeName?: string; department?: string }
): string => {
  switch (tool) {
    case 'think':
      return 'Understanding your request and planning approach...';
    case 'query_employee':
      return context?.employeeName
        ? `Fetching data for ${context.employeeName}...`
        : 'Querying employee database...';
    case 'fetch_churn_reasoning':
      return 'Retrieving churn analysis and risk scores...';
    case 'analyze_risk_factors':
      return 'Analyzing ML contributors and heuristic alerts...';
    case 'generate_treatments':
      return 'Generating personalized treatment options...';
    case 'generate_retention_plan':
      return 'Creating comprehensive retention strategy...';
    case 'compare_employees':
      return 'Finding and comparing similar employee profiles...';
    case 'analyze_department':
      return context?.department
        ? `Analyzing ${context.department} department...`
        : 'Analyzing department metrics...';
    case 'mine_exit_patterns':
      return 'Mining historical exit patterns and trends...';
    case 'fetch_workforce_stats':
      return 'Aggregating workforce statistics...';
    case 'draft_email':
      return 'Composing personalized email draft...';
    case 'schedule_meeting':
      return 'Preparing meeting schedule...';
    case 'create_task':
      return 'Creating follow-up task...';
    case 'synthesize':
      return 'Synthesizing insights and preparing response...';
    default:
      return 'Processing...';
  }
};

// Result preview generators
const getResultPreview = (
  tool: AgentToolType,
  context?: { employeeName?: string; riskScore?: number; department?: string }
): string | undefined => {
  switch (tool) {
    case 'query_employee':
      return context?.employeeName
        ? `Found: ${context.employeeName}`
        : 'Employee data retrieved';
    case 'fetch_churn_reasoning':
      return context?.riskScore !== undefined
        ? `Risk Score: ${(context.riskScore * 100).toFixed(0)}%`
        : 'Churn reasoning loaded';
    case 'analyze_risk_factors':
      return 'Identified top risk factors';
    case 'generate_treatments':
      return '5 personalized treatments generated';
    case 'compare_employees':
      return 'Found 5 similar employees';
    case 'analyze_department':
      return context?.department
        ? `${context.department} analysis complete`
        : 'Department insights ready';
    case 'mine_exit_patterns':
      return 'Exit patterns identified';
    case 'fetch_workforce_stats':
      return 'Workforce statistics compiled';
    case 'synthesize':
      return 'Response ready';
    default:
      return undefined;
  }
};

interface UseAgentExecutionReturn {
  execution: AgentExecution | null;
  isExecuting: boolean;
  startExecution: (
    query: string,
    patternType: string,
    context?: { employeeName?: string; riskScore?: number; department?: string }
  ) => void;
  completeExecution: () => void;
  resetExecution: () => void;
  updateToolStatus: (toolId: string, status: ToolStatus, result?: any) => void;
}

export function useAgentExecution(): UseAgentExecutionReturn {
  const [execution, setExecution] = useState<AgentExecution | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Clear all pending timeouts
  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  // Start a new execution
  const startExecution = useCallback(
    (
      query: string,
      patternType: string,
      context?: { employeeName?: string; riskScore?: number; department?: string }
    ) => {
      clearTimeouts();
      setIsExecuting(true);

      // Get the tool chain for this pattern
      const normalizedPattern = patternType.toLowerCase().replace(/-/g, '_');
      const toolChain = PATTERN_TOOL_CHAINS[normalizedPattern] || PATTERN_TOOL_CHAINS.general_chat;

      // Create tool execution steps
      const tools: AgentToolExecution[] = toolChain.map((toolType) => ({
        id: uuidv4(),
        tool: toolType,
        displayName: TOOL_METADATA[toolType]?.displayName || toolType,
        description: getToolDescription(toolType, context),
        status: 'pending' as ToolStatus,
      }));

      // Generate reasoning based on pattern
      const reasoning = generateReasoning(patternType, context);

      // Create execution object
      const newExecution: AgentExecution = {
        id: uuidv4(),
        query,
        status: 'planning',
        startedAt: new Date(),
        tools,
        reasoning,
      };

      setExecution(newExecution);

      // Simulate tool execution with realistic timing
      let cumulativeDelay = 300; // Initial delay after showing panel

      tools.forEach((tool, index) => {
        // Start tool
        const startTimeout = setTimeout(() => {
          setExecution((prev) => {
            if (!prev) return null;
            const updatedTools = [...prev.tools];
            updatedTools[index] = {
              ...updatedTools[index],
              status: 'running',
              startedAt: new Date(),
            };
            return {
              ...prev,
              status: 'executing',
              tools: updatedTools,
            };
          });
        }, cumulativeDelay);
        timeoutsRef.current.push(startTimeout);

        // Complete tool (variable timing based on tool type)
        const toolDuration = getToolDuration(tool.tool);
        cumulativeDelay += toolDuration;

        const completeTimeout = setTimeout(() => {
          setExecution((prev) => {
            if (!prev) return null;
            const updatedTools = [...prev.tools];
            updatedTools[index] = {
              ...updatedTools[index],
              status: 'completed',
              completedAt: new Date(),
              result: {
                preview: getResultPreview(tool.tool, context),
              },
            };
            return {
              ...prev,
              tools: updatedTools,
            };
          });
        }, cumulativeDelay);
        timeoutsRef.current.push(completeTimeout);

        cumulativeDelay += 100; // Small gap between tools
      });
    },
    [clearTimeouts]
  );

  // Complete the execution
  const completeExecution = useCallback(() => {
    setExecution((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'completed',
        completedAt: new Date(),
      };
    });
    setIsExecuting(false);
  }, []);

  // Reset execution
  const resetExecution = useCallback(() => {
    clearTimeouts();
    setExecution(null);
    setIsExecuting(false);
  }, [clearTimeouts]);

  // Manual tool status update (for real backend integration)
  const updateToolStatus = useCallback(
    (toolId: string, status: ToolStatus, result?: any) => {
      setExecution((prev) => {
        if (!prev) return null;
        const updatedTools = prev.tools.map((t) =>
          t.id === toolId
            ? {
                ...t,
                status,
                completedAt: status === 'completed' ? new Date() : t.completedAt,
                result: result || t.result,
              }
            : t
        );
        return { ...prev, tools: updatedTools };
      });
    },
    []
  );

  return {
    execution,
    isExecuting,
    startExecution,
    completeExecution,
    resetExecution,
    updateToolStatus,
  };
}

// Helper: Get realistic tool duration
function getToolDuration(tool: AgentToolType): number {
  switch (tool) {
    case 'think':
      return 400;
    case 'query_employee':
      return 600;
    case 'fetch_churn_reasoning':
      return 500;
    case 'analyze_risk_factors':
      return 700;
    case 'generate_treatments':
      return 800;
    case 'generate_retention_plan':
      return 900;
    case 'compare_employees':
      return 700;
    case 'analyze_department':
      return 600;
    case 'mine_exit_patterns':
      return 800;
    case 'fetch_workforce_stats':
      return 500;
    case 'draft_email':
      return 600;
    case 'schedule_meeting':
      return 400;
    case 'create_task':
      return 300;
    case 'synthesize':
      return 500;
    default:
      return 400;
  }
}

// Helper: Generate reasoning text
function generateReasoning(
  patternType: string,
  context?: { employeeName?: string; department?: string }
): string {
  const normalizedPattern = patternType.toLowerCase().replace(/-/g, '_');

  switch (normalizedPattern) {
    case 'churn_risk_diagnosis':
      return context?.employeeName
        ? `I'll analyze ${context.employeeName}'s churn risk by examining their ML prediction scores, behavioral stage, and key risk factors.`
        : 'I\'ll perform a comprehensive risk diagnosis by analyzing ML scores, behavioral indicators, and heuristic alerts.';
    case 'retention_plan':
      return context?.employeeName
        ? `I'll create a personalized retention plan for ${context.employeeName} by identifying their specific risk factors and matching them with effective interventions.`
        : 'I\'ll generate a retention strategy based on the employee\'s risk profile and available treatments.';
    case 'employee_comparison':
      return 'I\'ll find employees with similar profiles who have resigned to identify common patterns and warning signs.';
    case 'employee_comparison_stayed':
      return 'I\'ll find similar employees who stayed to understand what retention factors may have worked for them.';
    case 'exit_pattern_mining':
      return 'I\'ll analyze historical resignation data to identify common exit patterns across departments and tenure levels.';
    case 'workforce_trends':
      return 'I\'ll aggregate workforce statistics and analyze risk distribution across the organization.';
    case 'department_analysis':
      return context?.department
        ? `I'll analyze the ${context.department} department's risk profile and identify employees needing attention.`
        : 'I\'ll compare risk metrics across all departments to identify areas of concern.';
    default:
      return 'I\'ll analyze the available data to provide you with relevant insights.';
  }
}

export default useAgentExecution;
