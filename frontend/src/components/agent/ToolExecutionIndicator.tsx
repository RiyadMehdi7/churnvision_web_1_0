/**
 * ToolExecutionIndicator Component
 *
 * Displays real-time tool execution status in the chat interface.
 * Shows which tools are being called and their results.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  Users,
  BarChart3,
  Search,
  Calculator,
  Clock,
} from 'lucide-react';

// Tool call status
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

// Single tool call information
export interface ToolCallInfo {
  id?: string;
  tool: string;
  arguments?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  executionTimeMs?: number;
}

// Props for the component
interface ToolExecutionIndicatorProps {
  toolCalls: ToolCallInfo[];
  className?: string;
  compact?: boolean;
}

// Map tool names to icons
const getToolIcon = (toolName: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    get_employee_data: <Users className="h-4 w-4" />,
    get_churn_prediction: <BarChart3 className="h-4 w-4" />,
    get_employee_eltv: <Calculator className="h-4 w-4" />,
    get_treatment_history: <Clock className="h-4 w-4" />,
    count_employees: <Users className="h-4 w-4" />,
    aggregate_metrics: <Calculator className="h-4 w-4" />,
    get_company_overview: <Database className="h-4 w-4" />,
    get_department_stats: <BarChart3 className="h-4 w-4" />,
    flexible_data_query: <Search className="h-4 w-4" />,
  };
  return iconMap[toolName] || <Database className="h-4 w-4" />;
};

// Format tool name for display
const formatToolName = (toolName: string): string => {
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// Status indicator component
const StatusIndicator: React.FC<{ status: ToolCallStatus }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <div className="h-2 w-2 rounded-full bg-gray-400" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
  }
};

// Individual tool call item
const ToolCallItem: React.FC<{
  call: ToolCallInfo;
  compact?: boolean;
}> = ({ call, compact = false }) => {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 transition-all',
        call.status === 'running' && 'border-blue-200 bg-blue-50',
        call.status === 'success' && 'border-green-200 bg-green-50',
        call.status === 'error' && 'border-red-200 bg-red-50',
        call.status === 'pending' && 'border-gray-200 bg-gray-50'
      )}
    >
      {/* Tool icon */}
      <div className="text-gray-600">{getToolIcon(call.tool)}</div>

      {/* Tool name and details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {formatToolName(call.tool)}
          </span>
          {call.executionTimeMs !== undefined && call.status === 'success' && (
            <span className="text-xs text-gray-500">
              {call.executionTimeMs}ms
            </span>
          )}
        </div>

        {/* Arguments preview (if not compact) */}
        {!compact && call.arguments && Object.keys(call.arguments).length > 0 && (
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {Object.entries(call.arguments)
              .slice(0, 2)
              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
              .join(', ')}
          </div>
        )}

        {/* Result preview (if not compact) */}
        {!compact && call.result && call.status === 'success' && (
          <div className="text-xs text-green-700 truncate mt-0.5 max-w-[200px]">
            {call.result}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <StatusIndicator status={call.status} />
    </div>
  );
};

// Main component
export const ToolExecutionIndicator: React.FC<ToolExecutionIndicatorProps> = ({
  toolCalls,
  className,
  compact = false,
}) => {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <Database className="h-3 w-3" />
        <span>Data Analysis</span>
        <span className="text-gray-400">
          ({toolCalls.filter((c) => c.status === 'success').length}/
          {toolCalls.length} complete)
        </span>
      </div>

      {/* Tool calls list */}
      <div className="space-y-1.5">
        {toolCalls.map((call, index) => (
          <ToolCallItem
            key={call.id || `tool-${index}`}
            call={call}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
};

// Inline version for chat messages
export const ToolExecutionInline: React.FC<{
  toolCalls: ToolCallInfo[];
}> = ({ toolCalls }) => {
  const successCount = toolCalls.filter((c) => c.status === 'success').length;
  const isComplete = successCount === toolCalls.length;

  if (toolCalls.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
      {isComplete ? (
        <CheckCircle2 className="h-3 w-3 text-green-500" />
      ) : (
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      )}
      <span>
        {isComplete
          ? `Analyzed with ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}`
          : `Analyzing... (${successCount}/${toolCalls.length})`}
      </span>
    </div>
  );
};

export default ToolExecutionIndicator;
