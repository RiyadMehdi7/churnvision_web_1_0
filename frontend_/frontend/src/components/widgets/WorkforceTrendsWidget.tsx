import React, { useMemo, useState, memo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Calendar, 
  Users, 
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';

interface WorkforceTrendsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface TrendData {
  period: string;
  totalEmployees: number;
  avgRisk: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  newHires: number;
  departures: number;
}

interface SeasonalPattern {
  month: string;
  riskLevel: number;
  pattern: 'high' | 'medium' | 'low';
  description: string;
}

interface DepartmentTrend {
  department: string;
  currentRisk: number;
  previousRisk: number;
  trend: 'improving' | 'declining' | 'stable';
  trendValue: number;
  employeeCount: number;
}

interface PredictiveInsight {
  type: 'warning' | 'opportunity' | 'stable';
  title: string;
  description: string;
  confidence: number;
  timeframe: string;
  impact: 'high' | 'medium' | 'low';
}

const WorkforceTrendsWidget: React.FC<WorkforceTrendsWidgetProps> = memo(({
  widget,
  employees,
  className
}) => {
  const { getRiskLevel, thresholds } = useCurrentRiskThresholds();
  const [activeTab, setActiveTab] = useState<'trends' | 'seasonal' | 'predictions'>('trends');

  // Generate historical trend data (simulated for demo) - optimized
  const historicalTrends = useMemo((): TrendData[] => {
    if (employees.length === 0) return [];
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const currentMonth = new Date().getMonth();
    const baseEmployees = employees.length;
    
    // Pre-calculate average risk once
    const avgEmployeeRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length;
    
    return months.map((month, index) => {
      // Simulate historical data with some realistic patterns
      const variation = Math.sin((currentMonth - index) * 0.5) * 0.1;
      const totalEmployees = Math.max(1, Math.floor(baseEmployees * (1 + variation)));
      
      // Simulate risk trends with pre-calculated base
      const avgRisk = Math.max(0.1, Math.min(0.9, avgEmployeeRisk + (Math.random() - 0.5) * 0.2));
      
      const riskCounts = employees.reduce((acc, emp) => {
        const adjustedRisk = Math.max(0, Math.min(1, (emp.churnProbability || 0) + variation));
        const riskLevel = getRiskLevel(adjustedRisk);
        acc[riskLevel.toLowerCase() as 'high' | 'medium' | 'low']++;
        return acc;
      }, { high: 0, medium: 0, low: 0 });

      return {
        period: month,
        totalEmployees,
        avgRisk,
        highRisk: riskCounts.high,
        mediumRisk: riskCounts.medium,
        lowRisk: riskCounts.low,
        newHires: Math.floor(Math.random() * 10) + 1,
        departures: Math.floor(Math.random() * 5) + 1
      };
    }).reverse();
  }, [employees.length, getRiskLevel]);

  // Generate seasonal patterns
  const seasonalPatterns = useMemo((): SeasonalPattern[] => {
    const patterns = [
      { month: 'Q1', riskLevel: thresholds.mediumRisk + 0.05, pattern: 'medium' as const, description: 'Post-holiday adjustment period' },
      { month: 'Q2', riskLevel: thresholds.mediumRisk - 0.05, pattern: 'low' as const, description: 'Stable performance period' },
      { month: 'Q3', riskLevel: thresholds.mediumRisk + 0.15, pattern: 'medium' as const, description: 'Summer transition challenges' },
      { month: 'Q4', riskLevel: thresholds.highRisk - 0.05, pattern: 'high' as const, description: 'Year-end pressure and bonuses' }
    ];
    
    return patterns;
  }, []);

  // Generate department trends - optimized
  const departmentTrends = useMemo((): DepartmentTrend[] => {
    if (employees.length === 0) return [];
    
    const departmentMap = new Map<string, Employee[]>();
    
    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unassigned';
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, []);
      }
      departmentMap.get(dept)!.push(emp);
    });

    return Array.from(departmentMap.entries()).map(([department, deptEmployees]) => {
      const currentRisk = deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / deptEmployees.length;
      
      // Simulate previous period risk (would come from historical data)
              const previousRisk = currentRisk + (Math.random() - 0.5) * 0.2;
      const trendValue = currentRisk - previousRisk;
      
      let trend: 'improving' | 'declining' | 'stable';
      if (trendValue < -0.05) trend = 'improving';
      else if (trendValue > 0.05) trend = 'declining';
      else trend = 'stable';

      return {
        department,
        currentRisk,
        previousRisk,
        trend,
        trendValue: Math.abs(trendValue),
        employeeCount: deptEmployees.length
      };
    }).sort((a, b) => b.currentRisk - a.currentRisk);
  }, [employees.length]);

  // Generate predictive insights
  const predictiveInsights = useMemo((): PredictiveInsight[] => {
    const insights: PredictiveInsight[] = [];
    
    // High risk department warning
    const highRiskDepts = departmentTrends.filter(dept => dept.currentRisk > thresholds.highRisk);
    if (highRiskDepts.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Critical Department Risk',
        description: `${highRiskDepts[0].department} shows elevated churn risk (${(highRiskDepts[0].currentRisk * 100).toFixed(1)}%)`,
        confidence: 0.85,
        timeframe: '30 days',
        impact: 'high'
      });
    }

    // Improving trend opportunity
    const improvingDepts = departmentTrends.filter(dept => dept.trend === 'improving');
    if (improvingDepts.length > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Positive Trend Detected',
        description: `${improvingDepts[0].department} showing ${(improvingDepts[0].trendValue * 100).toFixed(1)}% improvement`,
        confidence: 0.78,
        timeframe: '60 days',
        impact: 'medium'
      });
    }

    // Seasonal prediction
    const currentQuarter = Math.floor(new Date().getMonth() / 3);
    const nextQuarter = seasonalPatterns[(currentQuarter + 1) % 4];
    if (nextQuarter.pattern === 'high') {
      insights.push({
        type: 'warning',
        title: 'Seasonal Risk Increase',
        description: `${nextQuarter.description} - expect ${(nextQuarter.riskLevel * 100).toFixed(0)}% risk level`,
        confidence: 0.72,
        timeframe: '90 days',
        impact: 'medium'
      });
    }

    // Stable workforce
    if (insights.length === 0) {
      insights.push({
        type: 'stable',
        title: 'Workforce Stability',
        description: 'Current trends indicate stable workforce with manageable risk levels',
        confidence: 0.80,
        timeframe: '30 days',
        impact: 'low'
      });
    }

    return insights.slice(0, 3);
  }, [departmentTrends, seasonalPatterns]);

  const getTrendIcon = (trend: 'improving' | 'declining' | 'stable') => {
    switch (trend) {
      case 'improving':
        return <ArrowDownRight className="w-4 h-4 text-green-500" />;
      case 'declining':
        return <ArrowUpRight className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getInsightIcon = (type: 'warning' | 'opportunity' | 'stable') => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'opportunity':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getInsightColor = (type: 'warning' | 'opportunity' | 'stable') => {
    switch (type) {
      case 'warning':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'opportunity':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      default:
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Last 6 months
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveTab('trends')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeTab === 'trends'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Trends
          </button>
          <button
            onClick={() => setActiveTab('seasonal')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeTab === 'seasonal'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Seasonal
          </button>
          <button
            onClick={() => setActiveTab('predictions')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeTab === 'predictions'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Target className="w-4 h-4 inline mr-2" />
            Predictions
          </button>
        </div>

        {/* Historical Trends Tab */}
        {activeTab === 'trends' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Trend Chart Visualization */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Risk Level Trends
              </h4>
              <div className="relative h-32 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-end justify-between h-full">
                  {historicalTrends.map((trend) => (
                    <div key={trend.period} className="flex flex-col items-center space-y-2">
                      <div className="flex flex-col items-center space-y-1">
                        <div
                          className="w-8 bg-gradient-to-t from-purple-500 to-purple-300 rounded-t"
                          style={{ height: `${trend.avgRisk * 80}px` }}
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {trend.period}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Department Trends */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Department Performance
              </h4>
              <div className="space-y-3">
                {departmentTrends.slice(0, 5).map((dept, index) => (
                  <motion.div
                    key={dept.department}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {dept.department}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        ({dept.employeeCount} employees)
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {(dept.currentRisk * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          vs {(dept.previousRisk * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        {getTrendIcon(dept.trend)}
                        <span className={cn(
                          "text-xs font-medium",
                          dept.trend === 'improving' ? 'text-green-600 dark:text-green-400' :
                          dept.trend === 'declining' ? 'text-red-600 dark:text-red-400' :
                          'text-gray-600 dark:text-gray-400'
                        )}>
                          {dept.trend === 'stable' ? 'Stable' : `${(dept.trendValue * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Seasonal Patterns Tab */}
        {activeTab === 'seasonal' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {seasonalPatterns.map((pattern, index) => (
                <motion.div
                  key={pattern.month}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * index }}
                  className={cn(
                    "p-4 rounded-lg border",
                    pattern.pattern === 'high' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                    pattern.pattern === 'medium' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                    'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-semibold text-gray-900 dark:text-gray-100">
                      {pattern.month}
                    </h5>
                    <div className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      pattern.pattern === 'high' ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' :
                      pattern.pattern === 'medium' ? 'bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300' :
                      'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                    )}>
                      {(pattern.riskLevel * 100).toFixed(0)}% Risk
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {pattern.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Predictions Tab */}
        {activeTab === 'predictions' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-4">
              {predictiveInsights.map((insight, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={cn(
                    "p-4 rounded-lg border",
                    getInsightColor(insight.type)
                  )}
                >
                  <div className="flex items-start space-x-3">
                    {getInsightIcon(insight.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-gray-900 dark:text-gray-100">
                          {insight.title}
                        </h5>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {insight.timeframe}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {insight.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="text-xs text-gray-500">
                            Confidence: {(insight.confidence * 100).toFixed(0)}%
                          </div>
                          <div className={cn(
                            "px-2 py-1 rounded text-xs font-medium",
                            insight.impact === 'high' ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' :
                            insight.impact === 'medium' ? 'bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300' :
                            'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                          )}>
                            {insight.impact} impact
                          </div>
                        </div>
                        <div className="w-24 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{ width: `${insight.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
});

export { WorkforceTrendsWidget };