import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Target, Brain, CheckCircle, AlertTriangle, TrendingUp, User, Calendar,
  BarChart3, RefreshCw, Plus, Play, Star, FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { getCurrentThresholds, getRiskLevel } from '../../config/riskThresholds';

interface AIRetentionPlannerWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface RetentionPlan {
  id: string;
  employeeId: string;
  employeeName: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  status: 'draft' | 'active' | 'completed';
  successProbability: number;
  totalActions: number;
  completedActions: number;
  priority: 'urgent' | 'high' | 'medium';
  dueDate: Date;
}

export const AIRetentionPlannerWidget: React.FC<AIRetentionPlannerWidgetProps> = ({
  widget,
  employees,
  className
}) => {
  const thresholds = getCurrentThresholds();
  
  const getRiskLevelForEmployee = useCallback((probability: number) => {
    return getRiskLevel(probability, thresholds);
  }, [thresholds]);
  const [activeTab, setActiveTab] = useState<'overview' | 'plans'>('overview');
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock retention plans for demo
  const retentionPlans: RetentionPlan[] = useMemo(() => {
    return employees
      .filter(emp => emp.churnProbability > thresholds.mediumRisk)
      .slice(0, 5)
      .map((emp, index) => ({
        id: `plan-${emp.employee_id}`,
        employeeId: emp.employee_id,
        employeeName: emp.full_name,
        riskLevel: getRiskLevelForEmployee(emp.churnProbability) as 'High' | 'Medium' | 'Low',
        status: ['draft', 'active', 'completed'][index % 3] as 'draft' | 'active' | 'completed',
        successProbability: 0.7 + Math.random() * 0.2,
        totalActions: 4 + Math.floor(Math.random() * 3),
        completedActions: Math.floor(Math.random() * 4),
        priority: emp.churnProbability > 0.8 ? 'urgent' : 'high',
                  dueDate: new Date(Date.now() + (15 + Math.floor(Math.random() * 30)) * 24 * 60 * 60 * 1000)
      }));
  }, [employees, getRiskLevelForEmployee]);

  const planStats = useMemo(() => ({
    total: retentionPlans.length,
    active: retentionPlans.filter(p => p.status === 'active').length,
    completed: retentionPlans.filter(p => p.status === 'completed').length,
    avgSuccess: retentionPlans.reduce((sum, p) => sum + p.successProbability, 0) / retentionPlans.length || 0
  }), [retentionPlans]);

  const generatePlans = useCallback(async () => {
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsGenerating(false);
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      default: return 'text-yellow-600 bg-yellow-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-blue-600 bg-blue-50';
      case 'completed': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
            </div>
            <button
              onClick={generatePlans}
              disabled={isGenerating}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center space-x-1 disabled:opacity-50"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{isGenerating ? 'Generating...' : 'Create Plan'}</span>
            </button>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'plans', label: 'Active Plans', icon: Target }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Total Plans</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{planStats.total}</p>
                  </div>
                  <Target className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 dark:text-green-400">Active Plans</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">{planStats.active}</p>
                  </div>
                  <Play className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 dark:text-purple-400">Completed</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{planStats.completed}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600 dark:text-orange-400">Avg Success</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                      {(planStats.avgSuccess * 100).toFixed(0)}%
                    </p>
                  </div>
                  <Star className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                </div>
              </motion.div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Quick Actions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button className="flex items-center space-x-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Generate AI Plans</span>
                </button>
                <button className="flex items-center space-x-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">High-Risk Review</span>
                </button>
                <button className="flex items-center space-x-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Export Report</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            {retentionPlans.length === 0 ? (
              <div className="text-center py-8">
                <Target className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  No retention plans yet
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create your first retention plan to get started
                </p>
              </div>
            ) : (
              retentionPlans.map((plan, index) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {plan.employeeName}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {plan.riskLevel} Risk Employee
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        "px-2 py-1 text-xs font-medium rounded",
                        getPriorityColor(plan.priority)
                      )}>
                        {plan.priority}
                      </span>
                      <span className={cn(
                        "px-2 py-1 text-xs font-medium rounded",
                        getStatusColor(plan.status)
                      )}>
                        {plan.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">
                        {(plan.successProbability * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {plan.completedActions}/{plan.totalActions}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Due Date</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {plan.dueDate.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Days Left</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {Math.ceil((plan.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-4">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(plan.completedActions / plan.totalActions) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded">
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded">
                        <TrendingUp className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};