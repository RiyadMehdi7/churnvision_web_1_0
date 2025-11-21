import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  AlertTriangle,
  BarChart,
  Lightbulb,
  CheckCircle,
  Brain,
  Users,
  Building2
} from 'lucide-react';
import { getCurrentThresholds, getRiskLevel } from '@/config/riskThresholds';
import { DepartmentAnalysisData } from '@/types/analysisData';

interface DepartmentAnalysisRendererProps {
  data: DepartmentAnalysisData;
}

// Markdown components for consistent styling
const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-medium mb-2 text-gray-900 dark:text-white">{children}</h3>,
  p: ({ children }) => <p className="mb-2 text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 text-gray-700 dark:text-gray-300 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 text-gray-700 dark:text-gray-300 text-sm">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-700 dark:text-gray-300">{children}</em>,
  code: ({ children }) => <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">{children}</code>,
};

export const DepartmentAnalysisRenderer: React.FC<DepartmentAnalysisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'insights'>('overview');

  if (data.error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 my-4">
        <div className="flex items-center text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <div>
            <h3 className="font-semibold">Department Analysis Error</h3>
            <p className="text-sm">{data.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const totalDepartments = data.departments?.length || 0;
  const highRiskDepts = data.departments?.filter(d => d.avgRisk > thresholds.highRisk).length || 0;
  const mediumRiskDepts = data.departments?.filter(d => d.avgRisk > thresholds.mediumRisk && d.avgRisk <= thresholds.highRisk).length || 0;
  const lowRiskDepts = data.departments?.filter(d => d.avgRisk <= thresholds.mediumRisk).length || 0;
  const totalEmployees = data.departments?.reduce((sum, dept) => sum + dept.totalEmployees, 0) || 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 my-4">
      {/* Header - Same style as other quick actions */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {data.analysisType === 'specific' ? `${data.targetDepartment} Department Analysis` : 'Department Analysis'}
          </h3>
          <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
            Risk Overview
          </span>
        </div>
        {data.summary && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{data.summary}</p>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Quick Stats Grid - Same style as other quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">{totalDepartments}</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Total Departments</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-red-900 dark:text-red-100">{highRiskDepts}</h4>
                  <p className="text-xs text-red-700 dark:text-red-300">High Risk</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-green-900 dark:text-green-100">{lowRiskDepts}</h4>
                  <p className="text-xs text-green-700 dark:text-green-300">Low Risk</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-purple-900 dark:text-purple-100">{totalEmployees.toLocaleString()}</h4>
                  <p className="text-xs text-purple-700 dark:text-purple-300">Total Employees</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart },
            { id: 'departments', label: 'Departments', icon: Building2 },
            { id: 'insights', label: 'Insights', icon: Brain }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                activeTab === id 
                  ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === 'overview' && (
            <div>
              {/* Risk Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-red-900 dark:text-red-200 text-sm">High Risk</h4>
                    <span className="text-xl font-bold text-red-600">{highRiskDepts}</span>
                  </div>
                  <div className="w-full bg-red-200 dark:bg-red-800 rounded-full h-2">
                    <div 
                      className="bg-red-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${totalDepartments > 0 ? (highRiskDepts / totalDepartments) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-red-600 mt-2">{totalDepartments > 0 ? ((highRiskDepts / totalDepartments) * 100).toFixed(1) : 0}% of departments</p>
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-orange-900 dark:text-orange-200 text-sm">Medium Risk</h4>
                    <span className="text-xl font-bold text-orange-600">{mediumRiskDepts}</span>
                  </div>
                  <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-2">
                    <div 
                      className="bg-orange-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${totalDepartments > 0 ? (mediumRiskDepts / totalDepartments) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-orange-600 mt-2">{totalDepartments > 0 ? ((mediumRiskDepts / totalDepartments) * 100).toFixed(1) : 0}% of departments</p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-green-900 dark:text-green-200 text-sm">Low Risk</h4>
                    <span className="text-xl font-bold text-green-600">{lowRiskDepts}</span>
                  </div>
                  <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${totalDepartments > 0 ? (lowRiskDepts / totalDepartments) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-green-600 mt-2">{totalDepartments > 0 ? ((lowRiskDepts / totalDepartments) * 100).toFixed(1) : 0}% of departments</p>
                </div>
              </div>

              {/* AI Analysis */}
              {data.insights?.detailedAnalysis && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-3 flex items-center text-sm">
                    <Brain className="w-4 h-4 mr-2" />
                    AI Analysis
                  </h4>
                  <div className="prose prose-sm max-w-none dark:prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {data.insights.detailedAnalysis}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'departments' && (
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center text-sm">
                <Building2 className="w-4 h-4 mr-2" />
                Department Rankings
              </h4>
              
              {data.departments && data.departments.length > 0 ? (
                <div className="space-y-3">
                  {data.departments
                    .sort((a, b) => b.avgRisk - a.avgRisk)
                    .slice(0, 5)
                    .map((dept, index) => {
                      const riskLevel = getRiskLevel(dept.avgRisk, thresholds);
                      const colorClass = riskLevel === 'High' ? 'text-red-600' : 
                                        riskLevel === 'Medium' ? 'text-orange-600' : 'text-green-600';
                      const bgClass = riskLevel === 'High' ? 'bg-red-50 dark:bg-red-900/20' : 
                                     riskLevel === 'Medium' ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-green-50 dark:bg-green-900/20';
                      
                      return (
                        <div key={index} className={`p-3 ${bgClass} rounded-lg border border-gray-200 dark:border-gray-600`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="text-sm font-bold text-gray-500 w-6">#{index + 1}</span>
                              <div>
                                <h5 className="font-medium text-gray-900 dark:text-white text-sm">{dept.department}</h5>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{dept.totalEmployees} employees</p>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className={`text-lg font-bold ${colorClass}`}>
                                {(dept.avgRisk * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-gray-500">{riskLevel} Risk</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">No department data available</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'insights' && (
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center text-sm">
                <Brain className="w-4 h-4 mr-2" />
                Key Insights & Recommendations
              </h4>
              
              <div className="space-y-4">
                {/* Organizational Insights */}
                {data.insights?.organizationalInsights && data.insights.organizationalInsights.length > 0 && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h5 className="font-medium text-blue-900 dark:text-blue-200 mb-3 text-sm">Organizational Insights</h5>
                    <div className="space-y-2">
                      {data.insights.organizationalInsights.slice(0, 3).map((insight, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <span className="w-4 h-4 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0">
                            {index + 1}
                          </span>
                          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strategic Recommendations */}
                {data.insights?.strategicRecommendations && data.insights.strategicRecommendations.length > 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <h5 className="font-medium text-green-900 dark:text-green-200 mb-3 text-sm flex items-center">
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Strategic Recommendations
                    </h5>
                    <div className="space-y-2">
                      {data.insights.strategicRecommendations.slice(0, 3).map((rec, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <span className="w-4 h-4 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center text-xs font-bold text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0">
                            {index + 1}
                          </span>
                          <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Urgent Actions */}
                {data.insights?.urgentActions && data.insights.urgentActions.length > 0 && (
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <h5 className="font-medium text-orange-900 dark:text-orange-200 mb-3 text-sm flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      Urgent Actions
                    </h5>
                    <div className="space-y-2">
                      {data.insights.urgentActions.slice(0, 3).map((action, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">{action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!data.insights?.organizationalInsights?.length && !data.insights?.strategicRecommendations?.length && !data.insights?.urgentActions?.length) && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Brain className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">No insights available</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};