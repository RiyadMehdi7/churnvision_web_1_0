import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  AlertTriangle,
  TrendingDown,
  BarChart,
  Lightbulb,
  CheckSquare,
  Brain,
  Users,
  Clock
} from 'lucide-react';
import { EnhancedExitPatternMiningData } from '@/types/analysisData';

interface EnhancedExitPatternMiningRendererProps {
  data: EnhancedExitPatternMiningData;
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

export const EnhancedExitPatternMiningRenderer: React.FC<EnhancedExitPatternMiningRendererProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'patterns' | 'recommendations'>('overview');

  if (data.error) {
    return (
      <div className="border rounded-xl bg-white dark:bg-gray-800 shadow-lg my-4 p-6">
        <div className="flex items-center text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <div>
            <h3 className="font-semibold">Exit Pattern Analysis Error</h3>
            <p className="text-sm">{data.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const urgencyColor = data.insights?.urgencyLevel === 'High' ? 'text-red-600' : 
                      data.insights?.urgencyLevel === 'Medium' ? 'text-orange-600' : 'text-green-600';

  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-b p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white mr-6 shadow-lg">
              <TrendingDown size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Exit Pattern Analysis</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300">Comprehensive departure pattern insights</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.summary}</p>
            </div>
          </div>
          
          {data.insights && (
            <div className="text-right">
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                {data.exitData?.totalResignations || 0}
              </div>
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border-2 ${urgencyColor} border-current`}>
                <AlertTriangle className="w-4 h-4 mr-2" />
                {data.insights.urgencyLevel} Priority
              </div>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        {data.exitData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {data.exitData.departmentPatterns?.length || 0}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Affected Departments</div>
            </div>
            <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {data.insights?.patternSummary?.mostCommonTenureExit || 'N/A'}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Common Exit Tenure</div>
            </div>
            <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {data.exitData.commonRiskFactors?.length || 0}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Risk Factors</div>
            </div>
            <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {data.insights?.patternSummary?.mostAffectedDepartment || 'N/A'}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Top Affected Dept</div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'overview' 
                ? 'bg-white dark:bg-gray-600 text-orange-600 dark:text-orange-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <BarChart className="w-4 h-4 inline mr-2" />
            Overview
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
            onClick={() => setActiveTab('patterns')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'patterns' 
                ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <TrendingDown className="w-4 h-4 inline mr-2" />
            Patterns
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
            Prevention
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
            {/* AI Analysis */}
            {data.insights?.detailedAnalysis && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-purple-500" />
                  AI Analysis
                </h3>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                  <div className="prose prose-sm max-w-none dark:prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {data.insights.detailedAnalysis}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Key Patterns */}
            {data.insights?.keyPatterns && data.insights.keyPatterns.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <TrendingDown className="w-5 h-5 mr-2 text-orange-500" />
                  Key Exit Patterns
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.insights.keyPatterns.map((pattern, index) => (
                    <div key={index} className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                          {index + 1}
                        </div>
                        <span className="text-sm text-orange-800 dark:text-orange-200">{pattern}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              Department Exit Patterns
            </h3>
            
            {data.exitData?.departmentPatterns && data.exitData.departmentPatterns.length > 0 ? (
              <div className="space-y-4">
                {data.exitData.departmentPatterns.map((dept, index) => (
                  <div key={index} className="p-6 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white mr-4 ${
                          dept.resignation_count > 10 ? 'bg-red-500' :
                          dept.resignation_count > 5 ? 'bg-orange-500' :
                          'bg-yellow-500'
                        }`}>
                          <Users size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{dept.department}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Avg tenure at exit: {dept.avg_tenure?.toFixed(1) || 'N/A'} years
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-red-600">
                          {dept.resignation_count}
                        </div>
                        <div className="text-xs text-gray-500">Resignations</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-red-600">{dept.early_exits || 0}</div>
                        <div className="text-xs text-gray-500">Early Exits</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-orange-600">{dept.mid_tenure_exits || 0}</div>
                        <div className="text-xs text-gray-500">Mid-Tenure</div>
                      </div>
                      <div className="text-center p-3 bg-white dark:bg-gray-600 rounded-lg">
                        <div className="text-lg font-bold text-blue-600">{dept.senior_exits || 0}</div>
                        <div className="text-xs text-gray-500">Senior Exits</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>No department exit data available</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'patterns' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tenure Patterns */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Tenure Exit Patterns
                </h3>
                {data.exitData?.tenurePatterns && data.exitData.tenurePatterns.length > 0 ? (
                  <div className="space-y-3">
                    {data.exitData.tenurePatterns.map((tenure, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded-lg">
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{tenure.tenure_range}</span>
                        <span className="text-lg font-bold text-blue-600">{tenure.resignation_count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-blue-700 dark:text-blue-300">No tenure patterns available</p>
                )}
              </div>

              {/* Risk Factors */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Common Risk Factors
                </h3>
                {data.exitData?.commonRiskFactors && data.exitData.commonRiskFactors.length > 0 ? (
                  <div className="space-y-3">
                    {data.exitData.commonRiskFactors.slice(0, 5).map((factor, index) => (
                      <div key={index} className="p-3 bg-white dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-red-800 dark:text-red-200">{factor.factor}</span>
                          <span className="text-sm font-bold text-red-600">{factor.frequency}x</span>
                        </div>
                        <div className="text-xs text-gray-500 capitalize">{factor.type.replace('_', ' ')}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-red-700 dark:text-red-300">No risk factor patterns available</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'recommendations' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preventive Strategies */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-4 flex items-center">
                  <CheckSquare className="w-5 h-5 mr-2" />
                  Preventive Strategies
                </h3>
                {data.insights?.preventiveStrategies && data.insights.preventiveStrategies.length > 0 ? (
                  <div className="space-y-3">
                    {data.insights.preventiveStrategies.map((strategy, index) => (
                      <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                        <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                          {index + 1}
                        </div>
                        <span className="text-sm text-green-800 dark:text-green-200">{strategy}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-green-700 dark:text-green-300">No preventive strategies available</p>
                )}
              </div>

              {/* Risk Indicators */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 border border-yellow-200 dark:border-yellow-800">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Early Warning Signs
                </h3>
                {data.insights?.riskIndicators && data.insights.riskIndicators.length > 0 ? (
                  <div className="space-y-3">
                    {data.insights.riskIndicators.map((indicator, index) => (
                      <div key={index} className="flex items-start p-3 bg-white dark:bg-gray-700 rounded-lg">
                        <div className="w-6 h-6 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                          !
                        </div>
                        <span className="text-sm text-yellow-800 dark:text-yellow-200">{indicator}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-yellow-700 dark:text-yellow-300">No risk indicators available</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};