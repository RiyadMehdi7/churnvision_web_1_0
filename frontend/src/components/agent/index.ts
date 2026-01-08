/**
 * Agent Components
 *
 * Exports all agentic AI components for the ChurnVision AI Assistant.
 */

export { AgentExecutionPanel } from './AgentExecutionPanel';
export { ActionProposalCard } from './ActionProposalCard';
export { AgentContextPanel } from './AgentContextPanel';
export { EmailComposer } from './EmailComposer';
export { TeamsComposer } from './TeamsComposer';
export { ToolExecutionIndicator, ToolExecutionInline } from './ToolExecutionIndicator';
export type { ToolCallInfo, ToolCallStatus } from './ToolExecutionIndicator';

// Re-export types
export type {
  AgentExecution,
  AgentToolExecution,
  AgentToolType,
  ToolStatus,
  ActionProposal,
  ActionType,
  AgentContext,
  MemoryItem,
} from '@/types/agent';
