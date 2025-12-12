import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  TrendingUp,
  CheckSquare,
  Clock,
  BarChart,
  Users,
  AlertTriangle,
  CheckCircle,
  ChevronDown
} from 'lucide-react';
import { getCurrentThresholds, getRiskColorExtended } from '@/config/riskThresholds';
import { EnhancedRetentionPlaybookData } from '@/types/analysisData';

interface EnhancedRetentionPlaybookRendererProps {
  data: EnhancedRetentionPlaybookData;
}

export const EnhancedRetentionPlaybookRenderer: React.FC<EnhancedRetentionPlaybookRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'timeline' | 'budget'>('overview');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('immediate');

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-200';
    }
  };

  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'immediate': return { label: 'Immediate Actions', icon: '🚨', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20' };
      case 'short_term': return { label: 'Short-term Strategy', icon: '⚡', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/20' };
      case 'long_term': return { label: 'Long-term Growth', icon: '🌱', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/20' };
      default: return { label: category, icon: '📋', color: 'text-gray-600', bgColor: 'bg-gray-50 dark:bg-gray-900/20' };
    }
  };

  const riskColors = getRiskColorExtended(data.currentRisk, thresholds);

  const categorizedActions = {
    immediate: data.actionPlan.filter(action => action.category === 'immediate'),
    short_term: data.actionPlan.filter(action => action.category === 'short_term'),
    long_term: data.actionPlan.filter(action => action.category === 'long_term')
  };

  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      {/* Header with Risk Overview */}
      <div className={`${riskColors.light} ${riskColors.border} border-b p-8`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className={`w-16 h-16 rounded-full ${riskColors.bg} flex items-center justify-center text-white mr-6 shadow-lg`}>
              <BookOpen size={24} />
            </div>
          <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Retention Strategy</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300">{data.targetEmployeeName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.personalProfile.position} • {data.personalProfile.department}</p>
          </div>
          </div>
          
          <div className="text-right">
            <div className={`text-4xl font-bold ${riskColors.text} mb-2`}>
              {(data.currentRisk * 100).toFixed(0)}%
            </div>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border-2 ${getPriorityColor('high')}`}>
              {data.riskLevel} Risk
          </div>
        </div>
      </div>

        {/* Risk Factors Overview */}
        <div className="bg-white dark:bg-gray-700 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Primary Risk Factors</h3>
        <div className="flex flex-wrap gap-2">
          {data.primaryRiskFactors.map((factor, index) => (
              <span key={index} className="px-3 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 text-sm rounded-full border border-orange-200 dark:border-orange-700">
              {factor}
            </span>
          ))}
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
            Strategy Overview
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'actions' 
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4 inline mr-2" />
            Action Plan
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'timeline' 
                ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Timeline
          </button>
          <button
            onClick={() => setActiveTab('budget')}
            className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'budget' 
                ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <BarChart className="w-4 h-4 inline mr-2" />
            ROI Analysis
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
              {/* Expected Outcomes */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Expected Outcomes
                </h3>
        <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Current Risk:</span>
                    <span className="font-bold text-red-600">{data.expectedOutcomes.currentRisk}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Projected Risk:</span>
                    <span className="font-bold text-green-600">{data.expectedOutcomes.projectedRisk}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Risk Reduction:</span>
                    <span className="font-bold text-emerald-600">-{data.expectedOutcomes.riskReduction}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Timeline:</span>
                    <span className="font-semibold text-blue-800 dark:text-blue-200">{data.expectedOutcomes.timeline}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-700 dark:text-blue-300">Confidence:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      data.expectedOutcomes.confidenceLevel === 'High' ? 'bg-green-100 text-green-800' :
                      data.expectedOutcomes.confidenceLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {data.expectedOutcomes.confidenceLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Success Examples */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Success Examples
                </h3>
                {data.successExamples.length > 0 ? (
                  <div className="space-y-3">
                    {data.successExamples.map((example, index) => (
                      <div key={index} className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-green-200 dark:border-green-700">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-green-800 dark:text-green-200">{example.name}</span>
                          <span className="text-xs text-green-600 dark:text-green-400">{example.riskReduction}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{example.position}</p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">{example.insights}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-green-700 dark:text-green-300 text-center py-4">
                    No similar success cases found in this department
                  </p>
                )}
              </div>
            </div>

            {/* Risk Mitigation Strategies */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
                Risk Mitigation Strategies
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.riskMitigation.map((strategy, index) => (
                  <div key={index} className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-200">{strategy.riskFactor}</h4>
                      <span className="text-xs bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                        {strategy.currentImpact}
                      </span>
                    </div>
                    <p className="text-sm text-orange-800 dark:text-orange-300 mb-2">{strategy.strategy}</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">Timeline: {strategy.timeline}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'actions' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {Object.entries(categorizedActions).map(([category, actions]) => {
              const categoryInfo = getCategoryInfo(category);
              return actions.length > 0 && (
                <div key={category} className="mb-6">
                <button
                  onClick={() => toggleCategory(category)}
                    className={`w-full p-4 ${categoryInfo.bgColor} hover:bg-opacity-80 rounded-lg border border-gray-200 dark:border-gray-600 text-left transition-all`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{categoryInfo.icon}</span>
                        <div>
                          <h3 className={`font-semibold ${categoryInfo.color} dark:text-white`}>
                            {categoryInfo.label} ({actions.length} actions)
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {data.timelineOverview[category as keyof typeof data.timelineOverview]?.focus}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 transition-transform ${expandedCategory === category ? 'rotate-180' : ''}`} />
                    </div>
                </button>
                
                {expandedCategory === category && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                      className="mt-4 space-y-4"
                    >
                    {actions.sort((a, b) => a.step - b.step).map((action) => (
                        <div key={action.step} className="p-6 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full flex items-center justify-center text-sm font-bold">
                              {action.step}
                          </div>
                              <div className="flex gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(action.priority)}`}>
                                  {action.priority.toUpperCase()}
                                </span>
                                <span className="px-3 py-1 bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">
                            {action.timeframe}
                          </span>
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <div className="text-gray-500 dark:text-gray-400">Risk Reduction</div>
                              <div className="font-semibold text-green-600">-{(action.riskReduction * 100).toFixed(1)}%</div>
                            </div>
                        </div>
                        
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-lg">{action.action}</h4>
                        
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Rationale:</div>
                              <div className="text-gray-600 dark:text-gray-400">{action.rationale}</div>
                          </div>
                          <div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Impact:</div>
                              <div className="text-gray-600 dark:text-gray-400">{action.expectedImpact}</div>
                          </div>
                            <div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Owner:</div>
                              <div className="text-gray-600 dark:text-gray-400">{action.owner}</div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Cost Level:</div>
                              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                action.cost === 'High' ? 'bg-red-100 text-red-700' :
                                action.cost === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {action.cost}
                              </div>
                            </div>
                        </div>
                      </div>
                    ))}
                    </motion.div>
                  )}
                  </div>
              );
            })}
          </motion.div>
        )}

        {activeTab === 'timeline' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-6">
              {Object.entries(data.timelineOverview).map(([key, phase]) => {
                const categoryInfo = getCategoryInfo(key);
                return (
                  <div key={key} className={`p-6 ${categoryInfo.bgColor} rounded-xl border border-gray-200 dark:border-gray-600`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <span className="text-3xl mr-4">{categoryInfo.icon}</span>
                        <div>
                          <h3 className={`text-xl font-bold ${categoryInfo.color} dark:text-white`}>
                            {categoryInfo.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{phase.timeframe}</p>
              </div>
        </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          -{(phase.expectedRiskReduction * 100).toFixed(1)}%
      </div>
                        <div className="text-xs text-gray-500">Risk Reduction</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300">Actions:</div>
                        <div className="text-gray-600 dark:text-gray-400">{phase.actionCount} planned interventions</div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300">Focus Area:</div>
                        <div className="text-gray-600 dark:text-gray-400">{phase.focus}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'budget' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cost Analysis */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
                <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200 mb-4 flex items-center">
                  <BarChart className="w-5 h-5 mr-2" />
                  Investment Analysis
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-indigo-700 dark:text-indigo-300">Retention Cost:</span>
                    <span className="font-bold text-indigo-900 dark:text-indigo-100">
                      ${data.budgetConsiderations.estimatedRetentionCost.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-indigo-700 dark:text-indigo-300">Replacement Cost:</span>
                    <span className="font-bold text-red-600">
                      ${data.budgetConsiderations.replacementCost.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-indigo-700 dark:text-indigo-300">Net Savings:</span>
                    <span className="font-bold text-green-600 text-lg">
                      ${data.budgetConsiderations.netSavings.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-indigo-700 dark:text-indigo-300">ROI:</span>
                    <span className="font-bold text-emerald-600 text-lg">
                      {data.budgetConsiderations.roi}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-200 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Cost Breakdown
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-700 dark:text-purple-300">Immediate (0-30 days):</span>
                    <span className="font-semibold">${data.budgetConsiderations.breakdown.immediate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-700 dark:text-purple-300">Short-term (1-3 months):</span>
                    <span className="font-semibold">${data.budgetConsiderations.breakdown.shortTerm.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-700 dark:text-purple-300">Long-term (3+ months):</span>
                    <span className="font-semibold">${data.budgetConsiderations.breakdown.longTerm.toLocaleString()}</span>
                  </div>
                </div>
                
                {/* Visual Cost Breakdown */}
                <div className="mt-4">
                  <div className="text-sm text-purple-700 dark:text-purple-300 mb-2">Investment Distribution:</div>
                  <div className="flex rounded-full overflow-hidden h-4 bg-purple-200 dark:bg-purple-800">
                    <div 
                      className="bg-red-500 h-full" 
                      style={{ width: `${(data.budgetConsiderations.breakdown.immediate / data.budgetConsiderations.estimatedRetentionCost) * 100}%` }}
                    ></div>
                    <div 
                      className="bg-orange-500 h-full" 
                      style={{ width: `${(data.budgetConsiderations.breakdown.shortTerm / data.budgetConsiderations.estimatedRetentionCost) * 100}%` }}
                    ></div>
                    <div 
                      className="bg-green-500 h-full" 
                      style={{ width: `${(data.budgetConsiderations.breakdown.longTerm / data.budgetConsiderations.estimatedRetentionCost) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monitoring */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 text-blue-500" />
                  Monitoring Metrics
                </h3>
                <div className="space-y-2">
            {data.monitoringMetrics.map((metric, index) => (
                    <div key={index} className="flex items-start p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                      <span className="text-sm text-blue-800 dark:text-blue-200">{metric}</span>
                    </div>
                  ))}
                </div>
        </div>
        
        <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-500" />
                  Success Indicators
                </h3>
                <div className="space-y-2">
            {data.successIndicators.map((indicator, index) => (
                    <div key={index} className="flex items-start p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                      <span className="text-sm text-green-800 dark:text-green-200">{indicator}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Strategy Summary</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{data.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-600">
              {data.actionPlan.length}
            </div>
            <div className="text-xs text-gray-500">Total Actions</div>
          </div>
        </div>
      </div>
    </div>
  );
};