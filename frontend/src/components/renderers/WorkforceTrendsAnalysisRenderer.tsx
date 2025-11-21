import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  AlertTriangle,
  TrendingUp,
  BarChart,
  Lightbulb,
  CheckSquare,
  Brain,
  Users,
  User
} from 'lucide-react';
import { getCurrentThresholds } from '@/config/riskThresholds';
import { WorkforceTrendsAnalysisData } from '@/types/analysisData';

interface WorkforceTrendsAnalysisRendererProps {
  data: WorkforceTrendsAnalysisData;
}

// Markdown components for consistent styling
const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-white">{children}</h3>,
  p: ({ children }) => <p className="mb-2 text-gray-700 dark:text-gray-300 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 text-gray-700 dark:text-gray-300">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 text-gray-700 dark:text-gray-300">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-700 dark:text-gray-300">{children}</em>,
  code: ({ children }) => <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">{children}</code>,
};

export const WorkforceTrendsAnalysisRenderer: React.FC<WorkforceTrendsAnalysisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'positions' | 'recommendations'>('overview');
  const [] = useState<string | null>(null);


  const totalEmployees = data.statistics.totalEmployees;
  const highRiskPct = totalEmployees > 0 ? ((data.statistics.highRisk / totalEmployees) * 100).toFixed(1) : '0.0';
  const mediumRiskPct = totalEmployees > 0 ? ((data.statistics.mediumRisk / totalEmployees) * 100).toFixed(1) : '0.0';
  const lowRiskPct = totalEmployees > 0 ? ((data.statistics.lowRisk / totalEmployees) * 100).toFixed(1) : '0.0';

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-green-500', text: 'text-green-600', light: 'bg-green-50 dark:bg-green-900/20' };
    if (score >= 60) return { bg: 'bg-yellow-500', text: 'text-yellow-600', light: 'bg-yellow-50 dark:bg-yellow-900/20' };
    if (score >= 40) return { bg: 'bg-orange-500', text: 'text-orange-600', light: 'bg-orange-50 dark:bg-orange-900/20' };
    return { bg: 'bg-red-500', text: 'text-red-600', light: 'bg-red-50 dark:bg-red-900/20' };
  };

  const healthScore = data.insights?.organizationalHealth?.overallScore || 50;
  const healthColors = getHealthScoreColor(healthScore);

  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      {/* Header with Organizational Health Overview */}
      <div className={`${healthColors.light} border-b p-8`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className={`w-16 h-16 rounded-full ${healthColors.bg} flex items-center justify-center text-white mr-6 shadow-lg`}>
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Workforce Risk Analysis</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300">Organization-wide retention insights</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.summary}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className={`text-5xl font-bold ${healthColors.text} mb-2`}>
              {healthScore}
            </div>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border-2 ${
              data.insights?.organizationalHealth?.riskLevel === 'Critical' ? 'bg-red-100 text-red-800 border-red-300' :
              data.insights?.organizationalHealth?.riskLevel === 'High' ? 'bg-orange-100 text-orange-800 border-orange-300' :
              data.insights?.organizationalHealth?.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
              'bg-green-100 text-green-800 border-green-300'
            }`}>
              <TrendingUp className="w-4 h-4 mr-2" />
              {data.insights?.organizationalHealth?.riskLevel || 'Medium'} Risk
            </div>
          </div>
        </div>

        {/* Quick Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalEmployees.toLocaleString()}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Total Employees</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {data.statistics.highRisk}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">High Risk ({highRiskPct}%)</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {data.statistics.riskTrends?.criticalEmployees || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Critical (&gt;80%)</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {data.statistics.riskTrends?.atRiskDepartments || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">At-Risk Departments</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {data.statistics.riskTrends?.averageConfidence ? (data.statistics.riskTrends.averageConfidence * 100).toFixed(0) : '0'}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">AI Confidence</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'overview' 
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <BarChart className="w-4 h-4 inline mr-2" />
            Health Overview
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'departments' 
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Departments
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'positions' 
                ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            Positions
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'recommendations' 
                ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Lightbulb className="w-4 h-4 inline mr-2" />
            Recommendations
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6 min-h-[400px]">
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Organizational Health */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Organizational Health
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Health Score:</span>
                    <span className={`text-2xl font-bold ${healthColors.text}`}>{healthScore}/100</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Risk Level:</span>
                    <span className={`font-semibold ${
                      data.insights?.organizationalHealth?.riskLevel === 'Critical' ? 'text-red-600' :
                      data.insights?.organizationalHealth?.riskLevel === 'High' ? 'text-orange-600' :
                      data.insights?.organizationalHealth?.riskLevel === 'Medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {data.insights?.organizationalHealth?.riskLevel || 'Medium'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Confidence Level:</span>
                    <span className={`font-semibold ${
                      data.insights?.organizationalHealth?.confidenceLevel === 'High' ? 'text-green-600' :
                      data.insights?.organizationalHealth?.confidenceLevel === 'Medium' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {data.insights?.organizationalHealth?.confidenceLevel || 'Medium'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk Distribution Visualization */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <BarChart className="w-5 h-5 mr-2" />
                  Risk Distribution
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Low Risk</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${(data.statistics.lowRisk / totalEmployees) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-green-600 min-w-[60px]">{data.statistics.lowRisk} ({lowRiskPct}%)</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Medium Risk</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full" 
                          style={{ width: `${(data.statistics.mediumRisk / totalEmployees) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-orange-600 min-w-[60px]">{data.statistics.mediumRisk} ({mediumRiskPct}%)</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">High Risk</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-red-500 h-2 rounded-full" 
                          style={{ width: `${(data.statistics.highRisk / totalEmployees) * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-red-600 min-w-[60px]">{data.statistics.highRisk} ({highRiskPct}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Priority Areas */}
            {data.insights?.organizationalHealth?.priorityAreas && data.insights.organizationalHealth.priorityAreas.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
                  Priority Areas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.insights.organizationalHealth.priorityAreas.map((area, index) => (
                    <div key={index} className="flex items-start p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                        {index + 1}
                      </div>
                      <span className="text-sm text-orange-800 dark:text-orange-200">{area}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Brain className="w-5 h-5 mr-2 text-purple-500" />
                AI Analysis
              </h3>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                <div className="prose prose-sm max-w-none dark:prose-dark">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {data.insights?.detailedAnalysis || data.analysis}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'departments' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Department Risk Analysis
            </h3>
            
            {data.statistics.departmentRisks.length > 0 ? (
              <div className="space-y-4">
                {data.statistics.departmentRisks.map((dept, index) => (
                  <div key={index} className="p-6 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white mr-4 ${
                          dept.avgRisk > thresholds.highRisk ? 'bg-red-500' :
                          dept.avgRisk > thresholds.mediumRisk ? 'bg-orange-500' :
                          'bg-green-500'
                        }`}>
                          <Users size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{dept.department}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{dept.count} employees</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${
                          dept.avgRisk > thresholds.highRisk ? 'text-red-600' :
                          dept.avgRisk > thresholds.mediumRisk ? 'text-orange-600' :
                          'text-green-600'
                        }`}>
                          {(dept.avgRisk * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">Avg Risk</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-red-600">{dept.highRiskCount || 0}</div>
                        <div className="text-xs text-gray-500">High Risk</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-blue-600">{((dept.avgMLScore || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg ML Score</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-purple-600">{((dept.avgStageScore || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg Stage Score</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-emerald-600">{((dept.avgConfidence || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg Confidence</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>No department data available</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'positions' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <User className="w-5 h-5 mr-2" />
              Position Risk Analysis
            </h3>
            
            {data.statistics.positionRisks.length > 0 ? (
              <div className="space-y-4">
                {data.statistics.positionRisks.map((pos, index) => (
                  <div key={index} className="p-6 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white mr-4 ${
                          pos.avgRisk > thresholds.highRisk ? 'bg-red-500' :
                          pos.avgRisk > thresholds.mediumRisk ? 'bg-orange-500' :
                          'bg-green-500'
                        }`}>
                          <User size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{pos.position}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{pos.count} employees</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-bold ${
                          pos.avgRisk > thresholds.highRisk ? 'text-red-600' :
                          pos.avgRisk > thresholds.mediumRisk ? 'text-orange-600' :
                          'text-green-600'
                        }`}>
                          {(pos.avgRisk * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">Avg Risk</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-red-600">{pos.highRiskCount || 0}</div>
                        <div className="text-xs text-gray-500">High Risk</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-blue-600">{((pos.avgMLScore || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg ML Score</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-purple-600">{((pos.avgStageScore || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg Stage Score</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-emerald-600">{((pos.avgConfidence || 0) * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Avg Confidence</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <User className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>No position data available</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'recommendations' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Urgent Actions */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Urgent Actions Required
                </h3>
                {(data.insights?.urgentActions && data.insights.urgentActions.length > 0) || (data.urgentActions && data.urgentActions.length > 0) ? (
                  <div className="space-y-3">
                    {(data.insights?.urgentActions || data.urgentActions || []).map((action, index) => (
                      <div key={index} className="flex items-start p-4 bg-white dark:bg-gray-700 rounded-lg border border-red-200 dark:border-red-700">
                        <div className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                          !
                        </div>
                        <span className="text-sm text-red-800 dark:text-red-200 leading-relaxed">{action}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-red-700 dark:text-red-300 text-center py-4">
                    No urgent actions identified
                  </p>
                )}
              </div>

              {/* Strategic Recommendations */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-4 flex items-center">
                  <CheckSquare className="w-5 h-5 mr-2" />
                  Strategic Recommendations
                </h3>
                {(data.insights?.strategicRecommendations && data.insights.strategicRecommendations.length > 0) || (data.recommendations && data.recommendations.length > 0) ? (
                  <div className="space-y-3">
                    {(data.insights?.strategicRecommendations || data.recommendations || []).map((rec, index) => (
                      <div key={index} className="flex items-start p-4 bg-white dark:bg-gray-700 rounded-lg border border-green-200 dark:border-green-700">
                        <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                          {index + 1}
                        </div>
                        <span className="text-sm text-green-800 dark:text-green-200 leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-green-700 dark:text-green-300 text-center py-4">
                    No strategic recommendations available
                  </p>
                )}
              </div>
            </div>

            {/* Trend Analysis */}
            {data.insights?.trendAnalysis && (
              <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Trend Analysis
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Overall Trend</h4>
                    <p className={`text-sm font-semibold px-3 py-1 rounded-full inline-block ${
                      data.insights.trendAnalysis.riskTrend === 'Critical' ? 'bg-red-100 text-red-800' :
                      data.insights.trendAnalysis.riskTrend === 'Concerning' ? 'bg-orange-100 text-orange-800' :
                      data.insights.trendAnalysis.riskTrend === 'Stable' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {data.insights.trendAnalysis.riskTrend}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Confidence Level</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">{data.insights.trendAnalysis.confidenceTrends}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Error indicator */}
      {data.error && (
        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 mr-2" />
            <span className="text-sm">
              {data.error === 'ai_error' ? 'AI analysis unavailable - showing statistical summary' : 'Limited data available'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};