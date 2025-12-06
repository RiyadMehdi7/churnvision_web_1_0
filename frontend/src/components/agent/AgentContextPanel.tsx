/**
 * AgentContextPanel
 *
 * Compact memory display for the AI Assistant sidebar.
 * Shows employees discussed and insights discovered.
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
  Lightbulb,
  CheckCircle,
  History,
  AlertTriangle,
} from 'lucide-react';
import type { AgentContext, MemoryItem } from '@/types/agent';

interface AgentContextPanelProps {
  context: AgentContext | null;
  onClearMemory?: () => void;
  onClearEmployees?: () => void;
  onClearInsights?: () => void;
}

// Icon mapping for insight types
const INSIGHT_ICONS = {
  employee_discussed: User,
  decision_made: CheckCircle,
  insight_found: Lightbulb,
  action_taken: History,
};

const INSIGHT_COLORS = {
  employee_discussed: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  decision_made: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
  insight_found: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
  action_taken: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
};

export const AgentContextPanel = memo<AgentContextPanelProps>(({
  context,
  onClearMemory,
  onClearEmployees,
  onClearInsights,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'employees' | 'insights'>('employees');

  if (!context) return null;

  const hasEmployees = context.employeesDiscussed.length > 0;
  const hasInsights = context.recentDecisions.length > 0;

  if (!hasEmployees && !hasInsights) return null;

  const totalItems = context.employeesDiscussed.length + context.recentDecisions.length;

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header - always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded(!isExpanded); }}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-emerald-500" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
            Agent Memory
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {totalItems}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onClearMemory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearMemory();
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-400 hover:text-red-500 transition-colors"
              title="Clear all memory"
            >
              <Trash2 size={12} />
            </button>
          )}
          {isExpanded ? (
            <ChevronUp size={14} className="text-gray-400" />
          ) : (
            <ChevronDown size={14} className="text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {/* Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 px-2">
              <button
                onClick={() => setActiveTab('employees')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                  activeTab === 'employees'
                    ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Employees ({context.employeesDiscussed.length})
              </button>
              <button
                onClick={() => setActiveTab('insights')}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                  activeTab === 'insights'
                    ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Insights ({context.recentDecisions.length})
              </button>
            </div>

            {/* Content */}
            <div className="px-2 pb-2 max-h-48 overflow-y-auto">
              {/* Employees Tab */}
              {activeTab === 'employees' && (
                <div className="pt-2 space-y-1">
                  {context.employeesDiscussed.length === 0 ? (
                    <p className="text-[10px] text-gray-400 text-center py-3">
                      No employees discussed yet
                    </p>
                  ) : (
                    context.employeesDiscussed.map((emp, idx) => (
                      <motion.div
                        key={emp.hrCode}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-[9px] font-medium flex-shrink-0">
                            {emp.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                              {emp.name}
                            </p>
                          </div>
                        </div>
                        {emp.riskLevel && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 ${
                              emp.riskLevel === 'High'
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                : emp.riskLevel === 'Medium'
                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                            }`}
                          >
                            {emp.riskLevel}
                          </span>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {/* Insights Tab */}
              {activeTab === 'insights' && (
                <div className="pt-2 space-y-1">
                  {context.recentDecisions.length === 0 ? (
                    <p className="text-[10px] text-gray-400 text-center py-3">
                      No insights recorded yet
                    </p>
                  ) : (
                    context.recentDecisions.slice(0, 10).map((insight, idx) => {
                      const IconComponent = INSIGHT_ICONS[insight.type] || Lightbulb;
                      const colorClass = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.insight_found;

                      return (
                        <motion.div
                          key={insight.id}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          <div className={`p-1 rounded ${colorClass} flex-shrink-0`}>
                            <IconComponent size={10} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">
                              {insight.title}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                              {insight.summary}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

AgentContextPanel.displayName = 'AgentContextPanel';

export default AgentContextPanel;
