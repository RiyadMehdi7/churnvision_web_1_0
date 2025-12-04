/**
 * Agent Execution Types
 *
 * Defines the structure for agentic AI features including
 * tool execution, action proposals, and memory.
 */

// Tool execution status
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed';

// Available agent tools
export type AgentToolType =
  | 'query_employee'
  | 'fetch_churn_reasoning'
  | 'analyze_risk_factors'
  | 'generate_treatments'
  | 'compare_employees'
  | 'analyze_department'
  | 'mine_exit_patterns'
  | 'fetch_workforce_stats'
  | 'generate_retention_plan'
  | 'draft_email'
  | 'schedule_meeting'
  | 'create_task'
  | 'think'
  | 'synthesize';

// Individual tool execution step
export interface AgentToolExecution {
  id: string;
  tool: AgentToolType;
  displayName: string;
  description: string;
  status: ToolStatus;
  startedAt?: Date;
  completedAt?: Date;
  result?: {
    preview?: string; // Short preview of the result
    data?: any; // Full result data
  };
  error?: string;
  icon?: string; // Lucide icon name
}

// Agent execution session
export interface AgentExecution {
  id: string;
  query: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  tools: AgentToolExecution[];
  reasoning?: string; // Why the agent chose this path
  finalResponse?: string;
}

// Proposed action types
export type ActionType = 'email' | 'meeting' | 'task' | 'notification' | 'report';

// Action proposal (for approval workflow)
export interface ActionProposal {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: Date;
  executedAt?: Date;
  metadata: {
    // Email-specific
    to?: string[];
    cc?: string[];
    subject?: string;
    body?: string;
    // Meeting-specific
    attendees?: string[];
    proposedTime?: Date;
    duration?: number; // minutes
    agenda?: string;
    // Task-specific
    assignee?: string;
    dueDate?: Date;
    priority?: 'low' | 'medium' | 'high';
    // Generic
    targetEmployee?: {
      hrCode: string;
      name: string;
    };
  };
  preview?: string; // Human-readable preview
}

// Memory item for context panel
export interface MemoryItem {
  id: string;
  type: 'employee_discussed' | 'decision_made' | 'insight_found' | 'action_taken';
  title: string;
  summary: string;
  timestamp: Date;
  relatedEntities?: {
    employees?: string[];
    departments?: string[];
  };
}

// Agent session context
export interface AgentContext {
  sessionId: string;
  employeesDiscussed: Array<{
    hrCode: string;
    name: string;
    lastDiscussed: Date;
    riskLevel?: string;
  }>;
  recentDecisions: MemoryItem[];
  pendingActions: ActionProposal[];
  executedActions: ActionProposal[];
}

// Tool metadata for display
export const TOOL_METADATA: Record<AgentToolType, {
  displayName: string;
  icon: string;
  category: 'data' | 'analysis' | 'generation' | 'action' | 'thinking';
}> = {
  query_employee: {
    displayName: 'Query Employee Data',
    icon: 'User',
    category: 'data',
  },
  fetch_churn_reasoning: {
    displayName: 'Fetch Churn Analysis',
    icon: 'Brain',
    category: 'data',
  },
  analyze_risk_factors: {
    displayName: 'Analyze Risk Factors',
    icon: 'AlertTriangle',
    category: 'analysis',
  },
  generate_treatments: {
    displayName: 'Generate Treatments',
    icon: 'Pill',
    category: 'generation',
  },
  compare_employees: {
    displayName: 'Compare Employees',
    icon: 'Users',
    category: 'analysis',
  },
  analyze_department: {
    displayName: 'Analyze Department',
    icon: 'Building2',
    category: 'analysis',
  },
  mine_exit_patterns: {
    displayName: 'Mine Exit Patterns',
    icon: 'TrendingDown',
    category: 'analysis',
  },
  fetch_workforce_stats: {
    displayName: 'Fetch Workforce Stats',
    icon: 'BarChart3',
    category: 'data',
  },
  generate_retention_plan: {
    displayName: 'Generate Retention Plan',
    icon: 'FileText',
    category: 'generation',
  },
  draft_email: {
    displayName: 'Draft Email',
    icon: 'Mail',
    category: 'action',
  },
  schedule_meeting: {
    displayName: 'Schedule Meeting',
    icon: 'Calendar',
    category: 'action',
  },
  create_task: {
    displayName: 'Create Task',
    icon: 'CheckSquare',
    category: 'action',
  },
  think: {
    displayName: 'Reasoning',
    icon: 'Lightbulb',
    category: 'thinking',
  },
  synthesize: {
    displayName: 'Synthesizing Response',
    icon: 'Sparkles',
    category: 'thinking',
  },
};
