import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart,
  Lightbulb,
  CheckCircle,
  Brain,
  AlertCircle,
  Users,
  User,
  Clock,
  CheckSquare,
  ChevronDown
} from 'lucide-react';
import { getCurrentThresholds } from '@/config/riskThresholds';
import { EnhancedChurnRiskDiagnosisData } from '@/types/analysisData';

interface EnhancedChurnRiskDiagnosisRendererProps {
  data: EnhancedChurnRiskDiagnosisData;
}

export const EnhancedChurnRiskDiagnosisRenderer: React.FC<EnhancedChurnRiskDiagnosisRendererProps> = ({ data }) => {
  const thresholds = getCurrentThresholds();
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');
  const [activeTab, setActiveTab] = useState<'ml' | 'rules' | 'comparative'>('ml');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const getRiskColor = (risk: number) => {
    if (risk > thresholds.highRisk) return { 
      bg: 'bg-red-500', 
      text: 'text-red-600', 
      light: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800'
    };
    if (risk > thresholds.mediumRisk) return { 
      bg: 'bg-orange-500', 
      text: 'text-orange-600', 
      light: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800'
    };
    return { 
      bg: 'bg-green-500', 
      text: 'text-green-600', 
      light: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800'
    };
  };

  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case 'Critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  };

  const riskColors = getRiskColor(data.overallRisk);

  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      {/* Header with Risk Overview */}
      <div className={`${riskColors.light} ${riskColors.border} border-b p-8`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className={`w-16 h-16 rounded-full ${riskColors.bg} flex items-center justify-center text-white mr-6 shadow-lg`}>
              <BarChart size={24} />
            </div>
          <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Risk Analysis</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300">{data.targetEmployeeName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.personalProfile.position} • {data.personalProfile.department}</p>
          </div>
          </div>
          
          <div className="text-right">
            <div className={`text-5xl font-bold ${riskColors.text} mb-2`}>
              {(data.overallRisk * 100).toFixed(0)}%
            </div>
            <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border-2 ${getUrgencyStyle(data.urgencyLevel)}`}>
              <AlertTriangle className="w-4 h-4 mr-2" />
              {data.urgencyLevel} Priority
            </div>
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {(data.mlScore * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">AI Model</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {(data.heuristicScore * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Business Rules</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {data.stage}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Career Stage</div>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {(data.confidenceLevel * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Confidence</div>
          </div>
        </div>
      </div>

      {/* Key Findings */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
          Key Findings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.keyFindings.map((finding, index) => (
            <div key={index} className="flex items-start p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-500 mr-3 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{finding}</span>
        </div>
          ))}
        </div>
        </div>

      {/* Detailed Analysis Tabs */}
      <div className="p-6">
        <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('ml')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'ml' 
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            AI Model Insights
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'rules' 
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Business Rules
          </button>
          <button
            onClick={() => setActiveTab('comparative')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'comparative' 
                ? 'bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Peer Comparison
          </button>
      </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === 'ml' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Top Risk Factors (AI Model)</h4>
              <div className="space-y-3">
                {data.mlContributors.slice(0, 6).map((factor, index) => {
                  const isNegative = factor.importance < 0;
                  return (
                    <div key={index} className={`p-4 rounded-lg border ${
                      isNegative 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          {isNegative ? (
                            <TrendingDown className="w-5 h-5 text-green-600 mr-3" />
                          ) : (
                            <TrendingUp className="w-5 h-5 text-red-600 mr-3" />
                          )}
                          <h5 className="font-medium text-gray-900 dark:text-white">
                            {factor.feature.replace(/(_)/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </h5>
              </div>
                        <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                          isNegative 
                            ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200' 
                            : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                        }`}>
                          {factor.importance > 0 ? '+' : ''}{(factor.importance * 100).toFixed(1)}%
                        </span>
              </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Current Value:</strong> {factor.value !== null ? factor.value : 'Not Available'}
            </div>
        </div>
                  );
                })}
      </div>
            </motion.div>
          )}

          {activeTab === 'rules' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Business Rule Alerts</h4>
              {data.heuristicAlerts.length > 0 ? (
                <div className="space-y-3">
            {data.heuristicAlerts.map((alert, index) => (
                    <div key={index} className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-orange-900 dark:text-orange-200 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          {alert.rule_name}
                        </h5>
                        <span className="text-sm font-bold bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-200 px-3 py-1 rounded-full">
                          +{(alert.impact * 100).toFixed(1)}%
                        </span>
                </div>
                      <p className="text-sm text-orange-800 dark:text-orange-300 leading-relaxed">
                        {alert.reason || (alert as any).message || 'No details available'}
                      </p>
              </div>
            ))}
          </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p>No business rule alerts triggered</p>
                  <p className="text-sm">This is a positive indicator</p>
        </div>
              )}
            </motion.div>
          )}

          {activeTab === 'comparative' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Peer Comparison Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Department Comparison */}
                {data.comparativeInsights.departmentComparison && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h5 className="font-medium text-blue-900 dark:text-blue-200 mb-2 flex items-center">
                      <Users className="w-4 h-4 mr-2" />
                      Department Average
                    </h5>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                      {(data.comparativeInsights.departmentComparison.avgRisk * 100).toFixed(1)}%
      </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {data.targetEmployeeName} is {data.comparativeInsights.departmentComparison.relativePosition} average
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {data.comparativeInsights.departmentComparison.departmentSize} employees in department
                    </p>
                  </div>
                )}

                {/* Position Comparison */}
                {data.comparativeInsights.positionComparison && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <h5 className="font-medium text-purple-900 dark:text-purple-200 mb-2 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Position Average
                    </h5>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                      {(data.comparativeInsights.positionComparison.avgRisk * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      {data.targetEmployeeName} is {data.comparativeInsights.positionComparison.relativePosition} average
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      {data.comparativeInsights.positionComparison.peerCount} employees in similar roles
                    </p>
        </div>
      )}

                {/* Tenure Comparison */}
                {data.comparativeInsights.tenureComparison && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <h5 className="font-medium text-emerald-900 dark:text-emerald-200 mb-2 flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      Tenure Cohort
                    </h5>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                      {(data.comparativeInsights.tenureComparison.avgRisk * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      {data.targetEmployeeName} is {data.comparativeInsights.tenureComparison.relativePosition} average
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {data.comparativeInsights.tenureComparison.cohortSize} employees with similar tenure
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* AI Analysis & Recommendations */}
      <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Analysis */}
      <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-blue-500" />
              AI Analysis
            </h4>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                {data.reasoning}
              </p>
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <CheckSquare className="w-5 h-5 mr-2 text-green-500" />
              Recommendations
            </h4>
            <div className="space-y-2">
              {data.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                    {index + 1}
                  </div>
                  <span className="text-sm text-green-800 dark:text-green-200 leading-relaxed">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Optional: Calculation Details */}
      {data.calculationBreakdown && (
        <div className="p-6 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => toggleSection('calculation')}
            className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${expandedSection === 'calculation' ? 'rotate-180' : ''}`} />
            Show detailed calculation breakdown
        </button>
        
        {expandedSection === 'calculation' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-blue-600 dark:text-blue-400">AI Model</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {(data.mlScore * 100).toFixed(1)}% × {data.calculationBreakdown.weights.ml_weight} = {data.calculationBreakdown.ml_contribution.toFixed(3)}
            </div>
          </div>
                <div className="text-center">
                  <div className="font-semibold text-purple-600 dark:text-purple-400">Business Rules</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {(data.heuristicScore * 100).toFixed(1)}% × {data.calculationBreakdown.weights.heuristic_weight} = {data.calculationBreakdown.heuristic_contribution.toFixed(3)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-indigo-600 dark:text-indigo-400">Career Stage</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {(data.stageScore * 100).toFixed(1)}% × {data.calculationBreakdown.weights.stage_weight} = {data.calculationBreakdown.stage_contribution.toFixed(3)}
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3 text-center">
                <div className="font-bold text-lg text-gray-900 dark:text-white">
                  Final Risk Score: {(data.overallRisk * 100).toFixed(1)}%
                </div>
              </div>
            </motion.div>
        )}
      </div>
      )}
    </div>
  );
};