import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Users, 
  Building2,
  Target,
  Activity,
  DollarSign,
  Shield,
  Zap,
  BarChart3,
  Eye
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';

interface ExecutiveRiskOverviewWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}



export const ExecutiveRiskOverviewWidget: React.FC<ExecutiveRiskOverviewWidgetProps> = ({
  widget,
  employees,
  className
}) => {
  const { getRiskLevel, thresholds } = useCurrentRiskThresholds();

  // Calculate real executive metrics with actual data
  const executiveMetrics = useMemo(() => {
    if (employees.length === 0) {
      return {
        totalEmployees: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        averageRisk: 0,
        totalELTV: 0,
        financialImpact: 0,
        criticalDepartments: [],
        retentionPriority: 'low' as const,
        riskTrend: 'stable' as const,
        topRiskFactors: []
      };
    }

    // Real risk calculations
    const highRisk = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'High');
    const mediumRisk = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'Medium');
    const lowRisk = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'Low');
    
    const averageRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length;
    const totalELTV = employees.reduce((sum, emp) => sum + (emp.currentELTV || 0), 0);
    
    // Calculate financial impact (high risk employees * their ELTV)
    const financialImpact = highRisk.reduce((sum, emp) => sum + (emp.currentELTV || 0), 0);
    
    // Real department analysis
    const deptRisks = new Map<string, { count: number; avgRisk: number; totalELTV: number; highRiskCount: number }>();
    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unknown';
      const existing = deptRisks.get(dept) || { count: 0, avgRisk: 0, totalELTV: 0, highRiskCount: 0 };
      const isHighRisk = getRiskLevel(emp.churnProbability || 0) === 'High';
      deptRisks.set(dept, {
        count: existing.count + 1,
        avgRisk: (existing.avgRisk * existing.count + (emp.churnProbability || 0)) / (existing.count + 1),
        totalELTV: existing.totalELTV + (emp.currentELTV || 0),
        highRiskCount: existing.highRiskCount + (isHighRisk ? 1 : 0)
      });
    });
    
    const criticalDepartments = Array.from(deptRisks.entries())
      .filter(([_, data]) => data.avgRisk > thresholds.highRisk || data.highRiskCount > data.count * (thresholds.highRisk / 2))
      .map(([dept, data]) => ({
        name: dept,
        risk: data.avgRisk,
        count: data.count,
        eltv: data.totalELTV,
        highRiskCount: data.highRiskCount
      }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 3);
    
    // Determine retention priority based on real metrics
    let retentionPriority: 'critical' | 'high' | 'medium' | 'low' = 'low';
    const highRiskRatio = thresholds.highRisk;
    const mediumRiskRatio = thresholds.mediumRisk;
    if (highRisk.length > employees.length * (highRiskRatio / 2) || financialImpact > totalELTV * highRiskRatio) {
      retentionPriority = 'critical';
    } else if (highRisk.length > employees.length * (mediumRiskRatio / 2) || financialImpact > totalELTV * mediumRiskRatio) {
      retentionPriority = 'high';
    } else if (highRisk.length > employees.length * (mediumRiskRatio / 4)) {
      retentionPriority = 'medium';
    }
    
    // Calculate risk trend based on actual data distribution
    const riskTrend = averageRisk > thresholds.highRisk ? 'increasing' : averageRisk > thresholds.mediumRisk ? 'stable' : 'decreasing';
    
    // Extract top risk factors from SHAP values
    const allShapValues = employees.flatMap(emp => emp.shap_values || []);
    const factorMap = new Map<string, number>();
    allShapValues.forEach(shap => {
      const existing = factorMap.get(shap.feature) || 0;
      factorMap.set(shap.feature, existing + Math.abs(shap.value));
    });
    
    const topRiskFactors = Array.from(factorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([feature, value]) => ({
        feature: feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        impact: value
      }));
    
    return {
      totalEmployees: employees.length,
      highRiskCount: highRisk.length,
      mediumRiskCount: mediumRisk.length,
      lowRiskCount: lowRisk.length,
      averageRisk,
      totalELTV,
      financialImpact,
      criticalDepartments,
      retentionPriority,
      riskTrend,
      topRiskFactors
    };
  }, [employees, getRiskLevel]);



  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-800';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800';
      default: return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'decreasing': return <TrendingDown className="w-4 h-4 text-green-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className={cn("bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg", className)}>
      {/* Super Sexy Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                <Target className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {widget.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Executive Risk Overview
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600">
                {getTrendIcon(executiveMetrics.riskTrend)}
                <span className={cn(
                  "text-sm font-semibold",
                  executiveMetrics.riskTrend === 'decreasing' ? 'text-green-600 dark:text-green-400' :
                  executiveMetrics.riskTrend === 'increasing' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-600 dark:text-gray-400'
                )}>
                  {executiveMetrics.riskTrend.charAt(0).toUpperCase() + executiveMetrics.riskTrend.slice(1)}
                </span>
              </div>
              <div className={cn("px-3 py-1 rounded-full text-xs font-bold border", getPriorityColor(executiveMetrics.retentionPriority))}>
                {executiveMetrics.retentionPriority.toUpperCase()} PRIORITY
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Super Sexy Content */}
      <div className="p-6">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Employees</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{executiveMetrics.totalEmployees}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-4 border border-red-200 dark:border-red-800 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">High Risk</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100">{executiveMetrics.highRiskCount}</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {executiveMetrics.totalEmployees > 0 ? ((executiveMetrics.highRiskCount / executiveMetrics.totalEmployees) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Medium Risk</p>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{executiveMetrics.mediumRiskCount}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {executiveMetrics.totalEmployees > 0 ? ((executiveMetrics.mediumRiskCount / executiveMetrics.totalEmployees) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <Activity className="h-8 w-8 text-orange-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-4 border border-green-200 dark:border-green-800 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Low Risk</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{executiveMetrics.lowRiskCount}</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {executiveMetrics.totalEmployees > 0 ? ((executiveMetrics.lowRiskCount / executiveMetrics.totalEmployees) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <Shield className="h-8 w-8 text-green-500" />
            </div>
          </motion.div>
        </div>

        {/* Financial Impact & Risk Score */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Financial Impact</h4>
              <DollarSign className="h-6 w-6 text-purple-500" />
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100 mb-2">
                ${(executiveMetrics.financialImpact / 1000000).toFixed(1)}M
              </div>
              <p className="text-sm text-purple-600 dark:text-purple-400">
                At Risk from {executiveMetrics.highRiskCount} High-Risk Employees
              </p>
              <div className="mt-3 w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${executiveMetrics.totalELTV > 0 ? (executiveMetrics.financialImpact / executiveMetrics.totalELTV) * 100 : 0}%` }}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">Average Risk Score</h4>
              <BarChart3 className="h-6 w-6 text-indigo-500" />
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 mb-2">
                {(executiveMetrics.averageRisk * 100).toFixed(1)}%
              </div>
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                Organization-wide Average
              </p>
              <div className="mt-3 w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all duration-500",
                    executiveMetrics.averageRisk > thresholds.highRisk ? "bg-red-500" :
                    executiveMetrics.averageRisk > thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                  )}
                  style={{ width: `${executiveMetrics.averageRisk * 100}%` }}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Critical Departments & Top Risk Factors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Critical Departments</h4>
              <Building2 className="h-5 w-5 text-gray-500" />
            </div>
            <div className="space-y-3">
              {executiveMetrics.criticalDepartments.length > 0 ? (
                executiveMetrics.criticalDepartments.map((dept) => (
                  <div key={dept.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        dept.risk > thresholds.highRisk ? "bg-red-500" : dept.risk > thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                      )} />
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{dept.name}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{dept.count} employees</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-sm font-bold",
                        dept.risk > thresholds.highRisk ? "text-red-600 dark:text-red-400" :
                        dept.risk > thresholds.mediumRisk ? "text-orange-600 dark:text-orange-400" :
                        "text-green-600 dark:text-green-400"
                      )}>
                        {(dept.risk * 100).toFixed(1)}%
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{dept.highRiskCount} high-risk</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <Shield className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">No critical departments detected</p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Risk Factors</h4>
              <Zap className="h-5 w-5 text-gray-500" />
            </div>
            <div className="space-y-3">
              {executiveMetrics.topRiskFactors.length > 0 ? (
                executiveMetrics.topRiskFactors.map((factor) => (
                  <div key={factor.feature} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{factor.feature}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">
                        {(factor.impact * 100).toFixed(1)}%
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">impact</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-sm">No risk factors available</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};