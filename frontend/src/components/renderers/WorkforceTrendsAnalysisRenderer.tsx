import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  User,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Brain,
} from 'lucide-react';
import { getCurrentThresholds } from '@/config/riskThresholds';
import { WorkforceTrendsAnalysisData } from '@/types/analysisData';

interface WorkforceTrendsAnalysisRendererProps {
  data: WorkforceTrendsAnalysisData;
}

export const WorkforceTrendsAnalysisRenderer: React.FC<WorkforceTrendsAnalysisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');

  const totalEmployees = data.statistics.totalEmployees;
  const highRiskPct = totalEmployees > 0 ? ((data.statistics.highRisk / totalEmployees) * 100).toFixed(1) : '0.0';
  const mediumRiskPct = totalEmployees > 0 ? ((data.statistics.mediumRisk / totalEmployees) * 100).toFixed(1) : '0.0';
  const lowRiskPct = totalEmployees > 0 ? ((data.statistics.lowRisk / totalEmployees) * 100).toFixed(1) : '0.0';

  const healthScore = data.insights?.organizationalHealth?.overallScore || 50;

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-3">
      {/* Header Card - Organizational Health */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative overflow-hidden bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-700/50 rounded-lg p-4"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
                <TrendingUp size={14} />
              </div>
              <span className="font-semibold text-green-700 dark:text-green-300 text-sm">Workforce Risk Analysis</span>
            </div>
            <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              healthScore >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
              healthScore >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              Health: {healthScore}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{totalEmployees}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{data.statistics.highRisk}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">High Risk</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{data.statistics.mediumRisk}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Medium</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{data.statistics.lowRisk}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Low Risk</div>
            </div>
          </div>

          {/* Risk Distribution Bar */}
          <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${lowRiskPct}%` }} />
            <div className="bg-amber-500" style={{ width: `${mediumRiskPct}%` }} />
            <div className="bg-red-500" style={{ width: `${highRiskPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-1">
            <span>Low {lowRiskPct}%</span>
            <span>Medium {mediumRiskPct}%</span>
            <span>High {highRiskPct}%</span>
          </div>
        </div>
      </motion.div>

      {/* Departments Section */}
      {data.statistics.departmentRisks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border border-indigo-200 dark:border-indigo-700/50 rounded-lg"
        >
          <button
            onClick={() => toggleSection('departments')}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                <Building2 size={14} />
              </div>
              <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm">Department Analysis</span>
              <span className="text-xs text-indigo-500 dark:text-indigo-400">({data.statistics.departmentRisks.length})</span>
            </div>
            {expandedSection === 'departments' ? (
              <ChevronUp size={16} className="text-indigo-400" />
            ) : (
              <ChevronDown size={16} className="text-indigo-400" />
            )}
          </button>

          {expandedSection === 'departments' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 space-y-2"
            >
              {data.statistics.departmentRisks.slice(0, 5).map((dept, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-white/60 dark:bg-gray-800/40 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                      dept.avgRisk > thresholds.highRisk ? 'bg-red-500' :
                      dept.avgRisk > thresholds.mediumRisk ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}>
                      {dept.department.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{dept.department}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{dept.count} employees</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      dept.avgRisk > thresholds.highRisk ? 'text-red-600 dark:text-red-400' :
                      dept.avgRisk > thresholds.mediumRisk ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {(dept.avgRisk * 100).toFixed(0)}%
                    </p>
                    {dept.highRiskCount > 0 && (
                      <p className="text-[10px] text-red-500">{dept.highRiskCount} high risk</p>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Positions Section */}
      {data.statistics.positionRisks && data.statistics.positionRisks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="group relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-700/50 rounded-lg"
        >
          <button
            onClick={() => toggleSection('positions')}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
                <User size={14} />
              </div>
              <span className="font-semibold text-purple-700 dark:text-purple-300 text-sm">Position Analysis</span>
              <span className="text-xs text-purple-500 dark:text-purple-400">({data.statistics.positionRisks.length})</span>
            </div>
            {expandedSection === 'positions' ? (
              <ChevronUp size={16} className="text-purple-400" />
            ) : (
              <ChevronDown size={16} className="text-purple-400" />
            )}
          </button>

          {expandedSection === 'positions' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 space-y-2"
            >
              {data.statistics.positionRisks.slice(0, 5).map((pos, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-white/60 dark:bg-gray-800/40 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                      pos.avgRisk > thresholds.highRisk ? 'bg-red-500' :
                      pos.avgRisk > thresholds.mediumRisk ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}>
                      <User size={10} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{pos.position}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{pos.count} employees</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      pos.avgRisk > thresholds.highRisk ? 'text-red-600 dark:text-red-400' :
                      pos.avgRisk > thresholds.mediumRisk ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {(pos.avgRisk * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Recommendations Section */}
      {((data.insights?.strategicRecommendations && data.insights.strategicRecommendations.length > 0) ||
        (data.insights?.urgentActions && data.insights.urgentActions.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-700/50 rounded-lg"
        >
          <button
            onClick={() => toggleSection('recommendations')}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                <Lightbulb size={14} />
              </div>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">Recommendations</span>
            </div>
            {expandedSection === 'recommendations' ? (
              <ChevronUp size={16} className="text-emerald-400" />
            ) : (
              <ChevronDown size={16} className="text-emerald-400" />
            )}
          </button>

          {expandedSection === 'recommendations' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 space-y-2"
            >
              {/* Urgent Actions */}
              {data.insights?.urgentActions && data.insights.urgentActions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Urgent Actions</p>
                  {data.insights.urgentActions.slice(0, 3).map((action, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-red-50/50 dark:bg-red-900/20 rounded-md">
                      <AlertTriangle size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-300">{action}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategic Recommendations */}
              {data.insights?.strategicRecommendations && data.insights.strategicRecommendations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Strategic</p>
                  {data.insights.strategicRecommendations.slice(0, 3).map((rec, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
                      <CheckCircle size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* AI Analysis Summary */}
      {(data.insights?.detailedAnalysis || data.analysis) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="group relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700/50 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Brain size={14} />
            </div>
            <span className="font-semibold text-blue-700 dark:text-blue-300 text-sm">AI Summary</span>
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
            {data.summary || data.insights?.detailedAnalysis || data.analysis}
          </p>
        </motion.div>
      )}

      {/* Error indicator */}
      {data.error && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700/50">
          <AlertTriangle size={12} className="text-amber-500" />
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {data.error === 'ai_error' ? 'AI analysis unavailable - showing statistical summary' : 'Limited data available'}
          </span>
        </div>
      )}
    </div>
  );
};
