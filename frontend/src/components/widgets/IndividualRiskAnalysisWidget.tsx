import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User,
  Brain,
  AlertTriangle,
  TrendingUp,
  Activity,
  Target,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Lightbulb,
  Zap,
  Shield,
  BarChart3,
  Clock
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';
import { useEmployeeReasoning } from '../../hooks/useReasoning';

interface IndividualRiskAnalysisWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  selectedEmployeeId?: string;
  className?: string;
}

interface RiskBreakdown {
  mlScore: number;
  heuristicScore: number;
  stageScore: number;
  finalScore: number;
  confidence: number;
}

interface RetentionRecommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'engagement' | 'compensation' | 'development' | 'management' | 'workload';
  timeline: string;
  successProbability: number;
  effort: 'low' | 'medium' | 'high';
}

export const IndividualRiskAnalysisWidget: React.FC<IndividualRiskAnalysisWidgetProps> = ({
  widget,
  employees,
  selectedEmployeeId,
  className
}) => {
  const { getRiskLevel, getRiskLevelWithStyles, thresholds } = useCurrentRiskThresholds();
  
  // State management
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'overview' | 'detailed'>('overview');

  // Get reasoning data for selected employee
  const { reasoning, isLoading, error, refresh } = useEmployeeReasoning(
    selectedEmployee?.hr_code || null
  );

  // Initialize selected employee
  useEffect(() => {
    if (selectedEmployeeId) {
      const employee = employees.find(emp => emp.employee_id === selectedEmployeeId);
      if (employee) {
        setSelectedEmployee(employee);
      }
    } else if (employees.length > 0 && !selectedEmployee) {
      // Default to highest risk employee
      const highestRisk = employees.reduce((prev, current) => 
        (current.churnProbability || 0) > (prev.churnProbability || 0) ? current : prev
      );
      setSelectedEmployee(highestRisk);
    }
  }, [selectedEmployeeId, employees, selectedEmployee]);

  // Calculate risk breakdown from reasoning data
  const riskBreakdown = useMemo((): RiskBreakdown | null => {
    if (!reasoning || !selectedEmployee) return null;

    return {
      mlScore: reasoning.ml_score || 0,
      heuristicScore: reasoning.heuristic_score || 0,
      stageScore: reasoning.stage_score || 0,
      finalScore: reasoning.churn_risk || selectedEmployee.churnProbability || 0,
      confidence: reasoning.confidence_level || 0
    };
  }, [reasoning, selectedEmployee]);

  // Generate retention recommendations based on reasoning data
  const retentionRecommendations = useMemo((): RetentionRecommendation[] => {
    if (!reasoning || !selectedEmployee) return [];

    const recommendations: RetentionRecommendation[] = [];
    
    // Parse recommendations from reasoning text
    // const _ = reasoning.recommendations || '';
    
    // Add ML-based recommendations
    if (reasoning.ml_contributors && reasoning.ml_contributors.length > 0) {
      const topContributor = reasoning.ml_contributors[0];
      if (topContributor.importance > 0.1) {
        recommendations.push({
          id: 'ml-primary',
          title: `Address ${topContributor.feature} Concerns`,
          description: `Focus on improving ${topContributor.feature.toLowerCase()} as it's the primary risk factor (${(topContributor.importance * 100).toFixed(1)}% impact).`,
          priority: 'high',
          category: 'engagement',
          timeline: '2-4 weeks',
          successProbability: 0.75,
          effort: 'medium'
        });
      }
    }

    // Add heuristic-based recommendations
    if (reasoning.heuristic_alerts && reasoning.heuristic_alerts.length > 0) {
      reasoning.heuristic_alerts.forEach((alert, index) => {
        if (alert.impact > 0.05 && index < 2) {
          recommendations.push({
            id: `heuristic-${index}`,
            title: alert.rule_name,
            description: alert.reason,
            priority: alert.impact > 0.15 ? 'high' : 'medium',
            category: 'management',
            timeline: '1-3 weeks',
            successProbability: Math.max(0.4, 1 - alert.impact),
            effort: alert.impact > 0.15 ? 'high' : 'medium'
          });
        }
      });
    }

    // Add stage-based recommendations
    if (reasoning.stage && reasoning.stage_score > 0.5) {
      recommendations.push({
        id: 'stage-based',
        title: `${reasoning.stage} Stage Intervention`,
        description: `Implement targeted interventions for employees in the ${reasoning.stage.toLowerCase()} stage to reduce churn risk.`,
        priority: 'medium',
        category: 'development',
        timeline: '4-8 weeks',
        successProbability: 0.6,
        effort: 'medium'
      });
    }

    // Add general recommendations based on risk level
    const riskLevel = getRiskLevel(selectedEmployee.churnProbability || 0);
    if (riskLevel === 'High') {
      recommendations.push({
        id: 'urgent-intervention',
        title: 'Urgent Retention Meeting',
        description: 'Schedule immediate one-on-one meeting to discuss concerns and career development opportunities.',
        priority: 'high',
        category: 'management',
        timeline: 'This week',
        successProbability: 0.8,
        effort: 'low'
      });
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }, [reasoning, selectedEmployee, getRiskLevel]);

  // Event handlers
  const handleEmployeeSelect = useCallback((employee: Employee) => {
    setSelectedEmployee(employee);
  }, []);

  const handleSectionToggle = useCallback((section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!selectedEmployee || !refresh) return;
    
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      console.error('Error refreshing analysis:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedEmployee, refresh]);

  // Helper functions
  const getScoreColor = (score: number) => {
    if (score >= thresholds.highRisk) return 'text-red-600 dark:text-red-400';
    if (score >= thresholds.mediumRisk) return 'text-orange-600 dark:text-orange-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= thresholds.highRisk) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    if (score >= thresholds.mediumRisk) return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
    return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'medium': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
      case 'low': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
    }
  };

  const getCategoryIcon = (category: RetentionRecommendation['category']) => {
    switch (category) {
      case 'engagement': return Activity;
      case 'compensation': return Target;
      case 'development': return TrendingUp;
      case 'management': return User;
      case 'workload': return BarChart3;
      default: return Lightbulb;
    }
  };

  if (!selectedEmployee) {
    return (
      <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
        <div className="p-6 text-center">
          <User className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            No Employee Selected
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select an employee to view detailed risk analysis
          </p>
        </div>
      </div>
    );
  }

  const riskInfo = getRiskLevelWithStyles(selectedEmployee.churnProbability || 0);
  const riskLevel = getRiskLevel(selectedEmployee.churnProbability || 0);

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setAnalysisMode(analysisMode === 'overview' ? 'detailed' : 'overview')}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {analysisMode === 'overview' ? 'Detailed' : 'Overview'}
              </button>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("h-4 w-4", (isRefreshing || isLoading) && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Employee Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Employee for Analysis
          </label>
          <select
            value={selectedEmployee.employee_id}
            onChange={(e) => {
              const employee = employees.find(emp => emp.employee_id === e.target.value);
              if (employee) handleEmployeeSelect(employee);
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {employees
              .sort((a, b) => (b.churnProbability || 0) - (a.churnProbability || 0))
              .map(employee => (
                <option key={employee.employee_id} value={employee.employee_id}>
                  {employee.full_name} - {((employee.churnProbability || 0) * 100).toFixed(1)}% risk
                </option>
              ))}
          </select>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8">
            <RefreshCw className="mx-auto h-8 w-8 text-blue-600 animate-spin" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Analyzing employee risk factors...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
              <span className="text-sm text-red-800 dark:text-red-200">
                Error loading analysis: {error}
              </span>
            </div>
          </div>
        )}

        {/* Analysis Content */}
        {!isLoading && !error && (
          <div className="space-y-6">
            {/* Employee Overview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-4 rounded-lg border",
                getScoreBgColor(selectedEmployee.churnProbability || 0)
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {selectedEmployee.full_name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedEmployee.position} • {selectedEmployee.structure_name}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-2xl font-bold", getScoreColor(selectedEmployee.churnProbability || 0))}>
                    {((selectedEmployee.churnProbability || 0) * 100).toFixed(1)}%
                  </div>
                  <span className={cn(
                    'px-2 py-1 text-xs font-medium rounded-full',
                    `${riskInfo.color} ${riskInfo.bgColor} ${riskInfo.darkColor} ${riskInfo.darkBgColor}`
                  )}>
                    {riskLevel} Risk
                  </span>
                </div>
              </div>
              
              {reasoning && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p className="mb-2">
                    <strong>Stage:</strong> {reasoning.stage || 'Unknown'}
                  </p>
                  <p>
                    <strong>Confidence:</strong> {((reasoning.confidence_level || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </motion.div>

            {/* Risk Score Breakdown */}
            {riskBreakdown && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <button
                  onClick={() => handleSectionToggle('breakdown')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Risk Score Breakdown
                    </span>
                  </div>
                  {expandedSections.has('breakdown') ? 
                    <ChevronDown className="w-5 h-5 text-gray-500" /> : 
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  }
                </button>

                <AnimatePresence>
                  {expandedSections.has('breakdown') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-4"
                    >
                      {/* ML Score */}
                      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              ML Model Score
                            </span>
                          </div>
                          <span className={cn("text-sm font-bold", getScoreColor(riskBreakdown.mlScore))}>
                            {(riskBreakdown.mlScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={cn(
                              "h-2 rounded-full transition-all duration-300",
                              riskBreakdown.mlScore >= thresholds.highRisk ? "bg-red-500" :
                              riskBreakdown.mlScore >= thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                            )}
                            style={{ width: `${riskBreakdown.mlScore * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Heuristic Score */}
                      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Business Rules Score
                            </span>
                          </div>
                          <span className={cn("text-sm font-bold", getScoreColor(riskBreakdown.heuristicScore))}>
                            {(riskBreakdown.heuristicScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={cn(
                              "h-2 rounded-full transition-all duration-300",
                              riskBreakdown.heuristicScore >= thresholds.highRisk ? "bg-red-500" :
                              riskBreakdown.heuristicScore >= thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                            )}
                            style={{ width: `${riskBreakdown.heuristicScore * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Stage Score */}
                      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Career Stage Score
                            </span>
                          </div>
                          <span className={cn("text-sm font-bold", getScoreColor(riskBreakdown.stageScore))}>
                            {(riskBreakdown.stageScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={cn(
                              "h-2 rounded-full transition-all duration-300",
                              riskBreakdown.stageScore >= thresholds.highRisk ? "bg-red-500" :
                              riskBreakdown.stageScore >= thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                            )}
                            style={{ width: `${riskBreakdown.stageScore * 100}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ML Contributors */}
            {reasoning?.ml_contributors && reasoning.ml_contributors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <button
                  onClick={() => handleSectionToggle('ml-factors')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Key Risk Factors
                    </span>
                  </div>
                  {expandedSections.has('ml-factors') ? 
                    <ChevronDown className="w-5 h-5 text-gray-500" /> : 
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  }
                </button>

                <AnimatePresence>
                  {expandedSections.has('ml-factors') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-2"
                    >
                      {reasoning.ml_contributors.slice(0, 5).map((contributor, index) => (
                        <div 
                          key={index}
                          className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {contributor.feature}
                            </span>
                            <span className={cn(
                              "text-sm font-bold",
                              contributor.importance > 0.1 ? "text-red-600 dark:text-red-400" :
                              contributor.importance > 0.05 ? "text-orange-600 dark:text-orange-400" :
                              "text-gray-600 dark:text-gray-400"
                            )}>
                              {(contributor.importance * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            Value: {typeof contributor.value === 'number' ? 
                              contributor.value.toFixed(2) : 
                              String(contributor.value)
                            }
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Retention Recommendations */}
            {retentionRecommendations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  onClick={() => handleSectionToggle('recommendations')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Lightbulb className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Retention Recommendations
                    </span>
                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                      {retentionRecommendations.length}
                    </span>
                  </div>
                  {expandedSections.has('recommendations') ? 
                    <ChevronDown className="w-5 h-5 text-gray-500" /> : 
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  }
                </button>

                <AnimatePresence>
                  {expandedSections.has('recommendations') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-3"
                    >
                      {retentionRecommendations.map((recommendation) => {
                        const CategoryIcon = getCategoryIcon(recommendation.category);
                        return (
                          <div 
                            key={recommendation.id}
                            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <CategoryIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <h5 className="font-medium text-gray-900 dark:text-gray-100">
                                  {recommendation.title}
                                </h5>
                              </div>
                              <span className={cn(
                                "px-2 py-1 text-xs font-medium rounded",
                                getPriorityColor(recommendation.priority)
                              )}>
                                {recommendation.priority}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                              {recommendation.description}
                            </p>
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>Timeline: {recommendation.timeline}</span>
                              <span>Success: {(recommendation.successProbability * 100).toFixed(0)}%</span>
                              <span>Effort: {recommendation.effort}</span>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* AI Reasoning Summary */}
            {reasoning?.reasoning && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <button
                  onClick={() => handleSectionToggle('ai-reasoning')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      AI Analysis Summary
                    </span>
                  </div>
                  {expandedSections.has('ai-reasoning') ? 
                    <ChevronDown className="w-5 h-5 text-gray-500" /> : 
                    <ChevronRight className="w-5 h-5 text-gray-500" />
                  }
                </button>

                <AnimatePresence>
                  {expandedSections.has('ai-reasoning') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {reasoning.reasoning}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};