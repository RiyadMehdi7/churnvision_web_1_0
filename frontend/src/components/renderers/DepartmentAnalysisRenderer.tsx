import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Brain,
  Users,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getCurrentThresholds, getRiskLevel } from '@/config/riskThresholds';
import { DepartmentAnalysisData } from '@/types/analysisData';

interface DepartmentAnalysisRendererProps {
  data: DepartmentAnalysisData;
}

export const DepartmentAnalysisRenderer: React.FC<DepartmentAnalysisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');

  if (data.error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700/50">
        <AlertTriangle size={14} className="text-red-500" />
        <div>
          <span className="font-medium text-red-700 dark:text-red-300 text-sm">Department Analysis Error</span>
          <p className="text-xs text-red-600 dark:text-red-400">{data.message}</p>
        </div>
      </div>
    );
  }

  const totalDepartments = data.departments?.length || 0;
  const highRiskDepts = data.departments?.filter(d => d.avgRisk > thresholds.highRisk).length || 0;
  const mediumRiskDepts = data.departments?.filter(d => d.avgRisk > thresholds.mediumRisk && d.avgRisk <= thresholds.highRisk).length || 0;
  const lowRiskDepts = data.departments?.filter(d => d.avgRisk <= thresholds.mediumRisk).length || 0;
  const totalEmployees = data.departments?.reduce((sum, dept) => sum + dept.totalEmployees, 0) || 0;

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-3">
      {/* Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative overflow-hidden bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border border-indigo-200 dark:border-indigo-700/50 rounded-lg p-4"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                <Building2 size={14} />
              </div>
              <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm">
                {data.analysisType === 'specific' ? `${data.targetDepartment} Analysis` : 'Department Analysis'}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {totalDepartments} depts
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{totalDepartments}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Depts</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{highRiskDepts}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">High Risk</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{lowRiskDepts}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Low Risk</div>
            </div>
            <div className="text-center p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{totalEmployees}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Employees</div>
            </div>
          </div>

          {/* Risk Distribution Bar */}
          <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${totalDepartments > 0 ? (lowRiskDepts / totalDepartments) * 100 : 0}%` }} />
            <div className="bg-amber-500" style={{ width: `${totalDepartments > 0 ? (mediumRiskDepts / totalDepartments) * 100 : 0}%` }} />
            <div className="bg-red-500" style={{ width: `${totalDepartments > 0 ? (highRiskDepts / totalDepartments) * 100 : 0}%` }} />
          </div>

          {data.summary && (
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-2">{data.summary}</p>
          )}
        </div>
      </motion.div>

      {/* Department Rankings */}
      {data.departments && data.departments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-700/50 rounded-lg"
        >
          <button
            onClick={() => toggleSection('departments')}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
                <Users size={14} />
              </div>
              <span className="font-semibold text-purple-700 dark:text-purple-300 text-sm">Department Rankings</span>
              <span className="text-xs text-purple-500 dark:text-purple-400">({data.departments.length})</span>
            </div>
            {expandedSection === 'departments' ? (
              <ChevronUp size={16} className="text-purple-400" />
            ) : (
              <ChevronDown size={16} className="text-purple-400" />
            )}
          </button>

          {expandedSection === 'departments' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 space-y-2"
            >
              {data.departments
                .sort((a, b) => b.avgRisk - a.avgRisk)
                .slice(0, 5)
                .map((dept, index) => {
                  const riskLevel = getRiskLevel(dept.avgRisk, thresholds);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-white/60 dark:bg-gray-800/40 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                          riskLevel === 'High' ? 'bg-red-500' :
                          riskLevel === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{dept.department}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{dept.totalEmployees} employees</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${
                          riskLevel === 'High' ? 'text-red-600 dark:text-red-400' :
                          riskLevel === 'Medium' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {(dept.avgRisk * 100).toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-gray-500">{riskLevel} Risk</p>
                      </div>
                    </div>
                  );
                })}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Insights & Recommendations */}
      {((data.insights?.strategicRecommendations && data.insights.strategicRecommendations.length > 0) ||
        (data.insights?.urgentActions && data.insights.urgentActions.length > 0) ||
        (data.insights?.organizationalInsights && data.insights.organizationalInsights.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-700/50 rounded-lg"
        >
          <button
            onClick={() => toggleSection('insights')}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                <Lightbulb size={14} />
              </div>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">Insights & Actions</span>
            </div>
            {expandedSection === 'insights' ? (
              <ChevronUp size={16} className="text-emerald-400" />
            ) : (
              <ChevronDown size={16} className="text-emerald-400" />
            )}
          </button>

          {expandedSection === 'insights' && (
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
                  {data.insights.urgentActions.slice(0, 2).map((action, index) => (
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
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Recommendations</p>
                  {data.insights.strategicRecommendations.slice(0, 2).map((rec, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-white/60 dark:bg-gray-800/40 rounded-md">
                      <CheckCircle size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">{rec}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Organizational Insights */}
              {data.insights?.organizationalInsights && data.insights.organizationalInsights.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Insights</p>
                  {data.insights.organizationalInsights.slice(0, 2).map((insight, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 bg-blue-50/50 dark:bg-blue-900/20 rounded-md">
                      <Brain size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">{insight}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* AI Analysis Summary */}
      {data.insights?.detailedAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700/50 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Brain size={14} />
            </div>
            <span className="font-semibold text-blue-700 dark:text-blue-300 text-sm">AI Analysis</span>
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
            {data.insights.detailedAnalysis}
          </p>
        </motion.div>
      )}
    </div>
  );
};
