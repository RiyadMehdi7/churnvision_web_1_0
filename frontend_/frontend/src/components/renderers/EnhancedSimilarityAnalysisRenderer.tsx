import React, { useState } from 'react';
// Removed motion import to reduce memory usage
import {
  AlertTriangle,
  TrendingUp,
  BarChart,
  Lightbulb,
  CheckCircle,
  Brain,
  Users,
  Search
} from 'lucide-react';
import { getCurrentThresholds } from '@/config/riskThresholds';

import { EnhancedSimilarityAnalysisData } from '@/types/analysisData';

interface EnhancedSimilarityAnalysisRendererProps {
  data: EnhancedSimilarityAnalysisData;
}

export const EnhancedSimilarityAnalysisRenderer: React.FC<EnhancedSimilarityAnalysisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'patterns' | 'insights'>('overview');

  // Safety check for data structure
  if (!data || !data.targetEmployee || !data.similarEmployees || !data.insights) {
    return (
      <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 p-8">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>Unable to display similarity analysis. Data structure is incomplete.</p>
        </div>
      </div>
    );
  }

  const getComparisonTypeStyle = (type: 'stayed' | 'resigned') => {
    return type === 'stayed' 
      ? { 
          color: 'text-green-600', 
          bg: 'bg-green-500', 
          light: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          icon: '✓'
        }
      : { 
          color: 'text-red-600', 
          bg: 'bg-red-500', 
          light: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: '✗'
        };
  };

  const getRiskColor = (risk: number) => {
    if (risk > thresholds.highRisk) return 'text-red-600 bg-red-100 dark:bg-red-900/30';
    if (risk > thresholds.mediumRisk) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
    return 'text-green-600 bg-green-100 dark:bg-green-900/30';
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence.toLowerCase()) {
      case 'high': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'low': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const comparisonStyle = getComparisonTypeStyle(data.comparisonType);

  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      {/* Header with Target Employee Overview */}
      <div className={`${comparisonStyle.light} ${comparisonStyle.border} border-b p-8`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className={`w-16 h-16 rounded-full ${comparisonStyle.bg} flex items-center justify-center text-white mr-6 shadow-lg`}>
              <span className="text-2xl">{comparisonStyle.icon}</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Similar {data.comparisonType === 'stayed' ? 'Retained' : 'Resigned'} Employees
              </h2>
              <p className="text-lg text-gray-700 dark:text-gray-300">{data.targetEmployee.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.targetEmployee.position} • {data.targetEmployee.department}
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className={`text-4xl font-bold ${comparisonStyle.color} mb-2`}>
              {(data.targetEmployee.risk * 100).toFixed(0)}%
            </div>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${getRiskColor(data.targetEmployee.risk)}`}>
              Current Risk
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{data.similarEmployees?.length || 0}</div>
            <div className="text-xs text-gray-500">Similar Found</div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{((data.patterns?.averageSimilarity || 0) * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-500">Avg Similarity</div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
            <div className="text-2xl font-bold text-emerald-600">{data.targetEmployee.tenure}y</div>
            <div className="text-xs text-gray-500">Tenure</div>
          </div>
          <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
            <div className={`text-2xl font-bold inline-flex items-center px-3 py-1 rounded-full text-xs ${getConfidenceColor(data.confidence)}`}>
              {data.confidence}
            </div>
            <div className="text-xs text-gray-500 mt-1">Confidence</div>
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
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'employees' 
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Similar Employees
          </button>
          <button
            onClick={() => setActiveTab('patterns')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'patterns' 
                ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <BarChart className="w-4 h-4 inline mr-2" />
            Patterns
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'insights' 
                ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Lightbulb className="w-4 h-4 inline mr-2" />
            Insights
          </button>
        </div>
      </div>

      {/* Tab Content - Overview */}
      {activeTab === 'overview' && (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Key Findings */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                <Brain className="w-5 h-5 mr-2" />
                Key Findings
              </h3>
              {data.insights?.keyFindings?.length > 0 ? (
                <div className="space-y-3">
                  {data.insights.keyFindings.map((finding, index) => (
                    <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-sm text-blue-800 dark:text-blue-200">{finding}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-blue-700 dark:text-blue-300 text-center py-4">
                  No specific findings identified from the comparison
                </p>
              )}
            </div>

            {/* Risk Patterns */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-200 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Risk Patterns
              </h3>
              <div className="space-y-3">
                {data.insights?.riskPatterns?.map((pattern, index) => (
                  <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    <span className="text-sm text-orange-800 dark:text-orange-200">{pattern}</span>
                  </div>
                )) || (
                  <p className="text-orange-700 dark:text-orange-300 text-center py-4">
                    No risk patterns identified
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Analysis Summary */}
          <div className="mt-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Search className="w-5 h-5 mr-2" />
                Analysis Summary
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {data.insights?.summary || 'No analysis summary available'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content - Similar Employees */}
      {activeTab === 'employees' && (
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Similar {data.comparisonType === 'stayed' ? 'Retained' : 'Resigned'} Employees
          </h3>
          
          {data.similarEmployees?.length > 0 ? (
            <div className="space-y-4">
              {data.similarEmployees.slice(0, 10).map((emp, index) => (
                <div key={index} className="p-6 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-full ${comparisonStyle.bg} flex items-center justify-center text-white mr-4 text-sm font-bold`}>
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">{emp.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{emp.position} • {emp.department}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{(emp.similarityScore * 100).toFixed(0)}%</div>
                      <div className="text-xs text-gray-500">Similarity</div>
                    </div>
                  </div>

                  {/* Employee Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{emp.tenure}y</div>
                      <div className="text-xs text-gray-500">Tenure</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                      <div className={`text-lg font-bold ${getRiskColor(emp.risk)}`}>{(emp.risk * 100).toFixed(0)}%</div>
                      <div className="text-xs text-gray-500">Risk</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                      <div className="text-lg font-bold text-purple-600">{emp.stage}</div>
                      <div className="text-xs text-gray-500">Stage</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                      <div className="text-lg font-bold text-emerald-600">{(emp.mlScore * 100).toFixed(0)}%</div>
                      <div className="text-xs text-gray-500">ML Score</div>
                    </div>
                  </div>

                  {/* Common Patterns */}
                  {emp.commonPatterns?.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-medium text-gray-900 dark:text-white mb-2">Common Patterns:</h5>
                      <div className="flex flex-wrap gap-1">
                        {emp.commonPatterns.map((pattern, pIndex) => (
                          <span key={pIndex} className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 text-xs rounded-full">
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Reasoning */}
                  <div className="bg-white dark:bg-gray-600 rounded-lg p-3 border border-gray-200 dark:border-gray-500">
                    <h5 className="font-medium text-gray-900 dark:text-white mb-2 text-sm">AI Analysis:</h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {emp.reasoning || 'No detailed reasoning available'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p>No similar {data.comparisonType} employees found</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Content - Patterns Analysis */}
      {activeTab === 'patterns' && (
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
            <BarChart className="w-5 h-5 mr-2" />
            Pattern Analysis
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Distribution */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-4">Department Distribution</h4>
              <div className="space-y-3">
                {Object.entries(data.patterns?.departmentDistribution || {}).map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between">
                    <span className="text-sm text-blue-800 dark:text-blue-200">{dept}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">{count}</span>
                      <div className="w-16 bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${(count / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Position Distribution */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
              <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-4">Position Distribution</h4>
              <div className="space-y-3">
                {Object.entries(data.patterns?.positionDistribution || {}).map(([pos, count]) => (
                  <div key={pos} className="flex items-center justify-between">
                    <span className="text-sm text-purple-800 dark:text-purple-200">{pos}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">{count}</span>
                      <div className="w-16 bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full" 
                          style={{ width: `${(count / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Distribution */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
              <h4 className="font-semibold text-orange-900 dark:text-orange-200 mb-4">Risk Level Distribution</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-orange-800 dark:text-orange-200">Low Risk (&lt;40%)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">{data.patterns?.riskDistribution?.low || 0}</span>
                    <div className="w-16 bg-green-200 dark:bg-green-800 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${((data.patterns?.riskDistribution?.low || 0) / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-orange-800 dark:text-orange-200">Medium Risk (40-70%)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">{data.patterns?.riskDistribution?.medium || 0}</span>
                    <div className="w-16 bg-orange-200 dark:bg-orange-800 rounded-full h-2">
                      <div 
                        className="bg-orange-600 h-2 rounded-full" 
                        style={{ width: `${((data.patterns?.riskDistribution?.medium || 0) / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-orange-800 dark:text-orange-200">High Risk (&gt;70%)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">{data.patterns?.riskDistribution?.high || 0}</span>
                    <div className="w-16 bg-red-200 dark:bg-red-800 rounded-full h-2">
                      <div className="bg-red-600 h-2 rounded-full" 
                        style={{ width: `${((data.patterns?.riskDistribution?.high || 0) / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage Distribution */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800">
              <h4 className="font-semibold text-emerald-900 dark:text-emerald-200 mb-4">Behavioral Stage Distribution</h4>
              <div className="space-y-3">
                {Object.entries(data.patterns?.stageDistribution || {}).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between">
                    <span className="text-sm text-emerald-800 dark:text-emerald-200">{stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{count}</span>
                      <div className="w-16 bg-emerald-200 dark:bg-emerald-800 rounded-full h-2">
                        <div 
                          className="bg-emerald-600 h-2 rounded-full" 
                          style={{ width: `${(count / (data.patterns?.totalSimilar || 1)) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-700 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Summary Statistics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{data.patterns?.totalSimilar || 0}</div>
                <div className="text-xs text-gray-500">Total Similar</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{((data.patterns?.averageSimilarity || 0) * 100).toFixed(0)}%</div>
                <div className="text-xs text-gray-500">Avg Similarity</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{Object.keys(data.patterns?.departmentDistribution || {}).length}</div>
                <div className="text-xs text-gray-500">Departments</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{Object.keys(data.patterns?.positionDistribution || {}).length}</div>
                <div className="text-xs text-gray-500">Positions</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content - Insights & Recommendations */}
      {activeTab === 'insights' && (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Common Factors */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                Common Factors
              </h3>
              {data.insights?.commonFactors?.length > 0 ? (
                <div className="space-y-3">
                  {data.insights.commonFactors.map((factor, index) => (
                    <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                      <span className="text-sm text-blue-800 dark:text-blue-200">{factor}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-blue-700 dark:text-blue-300 text-center py-4">
                  No common factors identified
                </p>
              )}
            </div>

            {/* Differentiating Factors */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-200 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Differentiating Factors
              </h3>
              {data.insights?.differentiatingFactors?.length > 0 ? (
                <div className="space-y-3">
                  {data.insights.differentiatingFactors.map((factor, index) => (
                    <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                      <span className="text-sm text-orange-800 dark:text-orange-200">{factor}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-orange-700 dark:text-orange-300 text-center py-4">
                  No significant differences identified
                </p>
              )}
            </div>

            {/* Risk Patterns */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Risk Patterns
              </h3>
              {data.insights?.riskPatterns?.length > 0 ? (
                <div className="space-y-3">
                  {data.insights.riskPatterns.map((pattern, index) => (
                    <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                      <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                      <span className="text-sm text-red-800 dark:text-red-200">{pattern}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-red-700 dark:text-red-300 text-center py-4">
                  No risk patterns identified
                </p>
              )}
            </div>

            {/* Recommendations */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-4 flex items-center">
                <Lightbulb className="w-5 h-5 mr-2" />
                Recommendations
              </h3>
              {data.insights?.recommendations?.length > 0 ? (
                <div className="space-y-3">
                  {data.insights.recommendations.map((rec, index) => (
                    <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                      <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                        {index + 1}
                      </div>
                      <span className="text-sm text-green-800 dark:text-green-200">{rec}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-green-700 dark:text-green-300 text-center py-4">
                  No specific recommendations generated
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Footer */}
      <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Comparison Summary</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {data.similarEmployees?.length || 0}
            </div>
            <div className="text-xs text-gray-500">Similar {data.comparisonType === 'stayed' ? 'Retained' : 'Resigned'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};