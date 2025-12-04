/**
 * AgentExecutionPanel
 *
 * Sleek, minimal agent execution visualization that matches
 * the AI Assistant's design language.
 */

import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AgentExecution, AgentToolExecution, ToolStatus } from '@/types/agent';

// Simple step component matching existing AnalysisStep style
const ExecutionStep = memo<{
  tool: AgentToolExecution;
  index: number;
}>(({ tool, index }) => {
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    if (tool.status === 'completed') {
      const timer = setTimeout(() => setShowComplete(true), 150);
      return () => clearTimeout(timer);
    } else {
      setShowComplete(false);
    }
  }, [tool.status]);

  const isActive = tool.status === 'running';
  const isComplete = tool.status === 'completed' && showComplete;
  const isPending = tool.status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={`flex items-center gap-2 text-sm ${
        isPending
          ? 'text-gray-300 dark:text-gray-600'
          : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {isComplete ? (
        <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
      ) : isActive ? (
        <Loader2 size={14} className="text-emerald-500 animate-spin flex-shrink-0" />
      ) : (
        <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" />
      )}
      <span className={isActive ? 'text-gray-700 dark:text-gray-300' : ''}>
        {tool.displayName}
      </span>
      {isComplete && tool.result?.preview && (
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto truncate max-w-[120px]">
          {tool.result.preview}
        </span>
      )}
    </motion.div>
  );
});

// Main panel component
interface AgentExecutionPanelProps {
  execution: AgentExecution | null;
  isActive: boolean;
  onClose?: () => void;
}

export const AgentExecutionPanel = memo<AgentExecutionPanelProps>(({
  execution,
  isActive,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isActive || !execution) {
    return null;
  }

  const completedCount = execution.tools.filter(t => t.status === 'completed').length;
  const totalCount = execution.tools.length;
  const currentTool = execution.tools.find(t => t.status === 'running');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="p-4 mb-4 ml-2 mr-12"
    >
      <div className="flex items-start gap-3">
        {/* Bot Avatar - matching TypingIndicator style */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white flex-shrink-0">
          <Bot size={16} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {currentTool?.displayName || 'Processing...'}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {completedCount}/{totalCount}
              </span>
            </div>
            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
              {isExpanded ? (
                <ChevronUp size={14} className="text-gray-400" />
              ) : (
                <ChevronDown size={14} className="text-gray-400" />
              )}
            </button>
          </div>

          {/* Progress bar - thin and subtle */}
          <div className="mt-2 h-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 to-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / totalCount) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Reasoning - compact */}
          {execution.reasoning && isExpanded && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic"
            >
              {execution.reasoning}
            </motion.p>
          )}

          {/* Steps - collapsible */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 space-y-1.5 overflow-hidden"
              >
                {execution.tools.map((tool, index) => (
                  <ExecutionStep
                    key={tool.id}
                    tool={tool}
                    index={index}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
});

AgentExecutionPanel.displayName = 'AgentExecutionPanel';

export default AgentExecutionPanel;
