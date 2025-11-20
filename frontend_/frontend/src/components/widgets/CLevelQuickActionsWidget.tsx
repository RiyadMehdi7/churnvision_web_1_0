import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Brain, 
  Zap, 
  TrendingUp, 
  FileText, 
  Users, 
  AlertTriangle,
  ChevronRight,
  Sparkles,
  BarChart3,
  Target,
  Building2,
  Calendar,
  Eye,
  Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useNavigate } from 'react-router-dom';
import { standardizePrompt } from '../../utils/promptStandardizer';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';
import { filterActiveEmployees } from '../../utils/employeeFilters';

interface CLevelQuickActionsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  onActionTrigger?: (action: string, params: any) => void;
  className?: string;
}

interface ExecutiveAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  hoverColor: string;
  action: () => void;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'analysis' | 'reporting' | 'strategy' | 'oversight';
  estimatedTime: string;
  impact: 'high' | 'medium' | 'low';
  requiresData?: boolean;
  count?: number;
}

interface ActionCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  actions: ExecutiveAction[];
}

export const CLevelQuickActionsWidget: React.FC<CLevelQuickActionsWidgetProps> = ({
  widget,
  employees,
  onActionTrigger,
  className
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { thresholds } = useCurrentRiskThresholds();

  // Filter for active employees only (except for exit pattern analysis)
  const activeEmployees = filterActiveEmployees(employees);

  // Calculate organizational metrics for action prioritization - ONLY ACTIVE EMPLOYEES
  const organizationalMetrics = useMemo(() => {
    const totalEmployees = activeEmployees.length;
    const highRiskEmployees = activeEmployees.filter(emp => (emp.churnProbability || 0) >= thresholds.highRisk);
    const mediumRiskEmployees = activeEmployees.filter(emp => (emp.churnProbability || 0) >= thresholds.mediumRisk && (emp.churnProbability || 0) < thresholds.highRisk);
    const avgRisk = totalEmployees > 0 ? activeEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / totalEmployees : 0;
    
    // Calculate department risks - ONLY ACTIVE EMPLOYEES
    const departmentMap = new Map<string, Employee[]>();
    activeEmployees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unassigned';
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, []);
      }
      departmentMap.get(dept)!.push(emp);
    });
    
    const criticalDepartments = Array.from(departmentMap.entries()).filter(([_, emps]) => {
      const deptAvgRisk = emps.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / emps.length;
      return deptAvgRisk > thresholds.highRisk;
    }).length;

    return {
      totalEmployees,
      highRiskCount: highRiskEmployees.length,
      mediumRiskCount: mediumRiskEmployees.length,
      avgRisk,
      criticalDepartments,
      departmentCount: departmentMap.size
    };
  }, [employees]);

  // Navigate to AI Assistant with executive-focused prompts
  const navigateToAIAssistant = (prompt: string, employees?: Employee[]) => {
    const params = new URLSearchParams();
    params.set('prompt', prompt);
    if (employees && employees.length > 0) {
      params.set('employees', employees.map(e => e.employee_id).join(','));
    }
    navigate(`/ai-assistant?${params.toString()}`);
  };

  // Handle action execution with loading states
  const handleAction = async (actionId: string, action: () => void) => {
    setIsLoading(actionId);
    try {
      await action();
      onActionTrigger?.(actionId, { 
        employees: employees.slice(0, 10),
        metrics: organizationalMetrics 
      });
    } catch (error) {
      console.error(`Error executing action ${actionId}:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  // Define executive-focused actions
  const executiveActions: ExecutiveAction[] = [
    // Strategic Analysis Actions
    {
      id: 'organizational-health-assessment',
      title: 'Organizational Health Assessment',
      description: `Comprehensive analysis of workforce health across ${organizationalMetrics.departmentCount} departments`,
      icon: Activity,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      hoverColor: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
      priority: 'high',
      category: 'analysis',
      estimatedTime: '5 min',
      impact: 'high',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('organizational_health', undefined, undefined, organizationalMetrics.totalEmployees);
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'workforce-trends-analysis',
      title: 'Strategic Workforce Trends',
      description: 'Identify patterns and predict future workforce challenges',
      icon: TrendingUp,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      hoverColor: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
      priority: 'high',
      category: 'analysis',
      estimatedTime: '7 min',
      impact: 'high',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('workforce_trends');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'critical-risk-intervention',
      title: 'Critical Risk Intervention Plan',
      description: `Immediate action plan for ${organizationalMetrics.highRiskCount} high-risk employees`,
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      hoverColor: 'hover:bg-red-100 dark:hover:bg-red-900/30',
      priority: 'critical',
      category: 'strategy',
      estimatedTime: '10 min',
      impact: 'high',
      count: organizationalMetrics.highRiskCount,
      requiresData: true,
      action: () => {
        const highRiskEmployees = activeEmployees.filter(emp => (emp.churnProbability || 0) >= thresholds.highRisk);
        const standardized = standardizePrompt('critical_intervention', undefined, undefined, organizationalMetrics.highRiskCount);
        navigateToAIAssistant(standardized.prompt, highRiskEmployees.slice(0, 10));
      }
    },
    {
      id: 'department-performance-review',
      title: 'Department Performance Review',
      description: `Strategic review of ${organizationalMetrics.criticalDepartments} critical departments`,
      icon: Building2,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      hoverColor: 'hover:bg-orange-100 dark:hover:bg-orange-900/30',
      priority: organizationalMetrics.criticalDepartments > 0 ? 'high' : 'medium',
      category: 'oversight',
      estimatedTime: '8 min',
      impact: 'high',
      count: organizationalMetrics.criticalDepartments,
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('department_review');
        navigateToAIAssistant(standardized.prompt);
      }
    },

    // Executive Reporting Actions
    {
      id: 'board-ready-report',
      title: 'Board-Ready Executive Report',
      description: 'Comprehensive workforce report for board presentation',
      icon: FileText,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      hoverColor: 'hover:bg-green-100 dark:hover:bg-green-900/30',
      priority: 'medium',
      category: 'reporting',
      estimatedTime: '12 min',
      impact: 'high',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('board_report');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'quarterly-workforce-summary',
      title: 'Quarterly Workforce Summary',
      description: 'Strategic summary for quarterly business reviews',
      icon: Calendar,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      hoverColor: 'hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
      priority: 'medium',
      category: 'reporting',
      estimatedTime: '6 min',
      impact: 'medium',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('quarterly_summary');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'competitive-benchmarking',
      title: 'Competitive Benchmarking Analysis',
      description: 'Industry comparison and competitive positioning',
      icon: Target,
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      hoverColor: 'hover:bg-teal-100 dark:hover:bg-teal-900/30',
      priority: 'medium',
      category: 'analysis',
      estimatedTime: '9 min',
      impact: 'medium',
      requiresData: false,
      action: () => {
        const standardized = standardizePrompt('competitive_benchmarking');
        navigateToAIAssistant(standardized.prompt);
      }
    },

    // Strategic Planning Actions
    {
      id: 'strategic-workforce-planning',
      title: 'Strategic Workforce Planning',
      description: 'Long-term workforce strategy and planning',
      icon: Users,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
      hoverColor: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/30',
      priority: 'medium',
      category: 'strategy',
      estimatedTime: '15 min',
      impact: 'high',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('strategic_planning');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'roi-investment-analysis',
      title: 'ROI & Investment Analysis',
      description: 'Financial impact analysis of retention investments',
      icon: BarChart3,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      hoverColor: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
      priority: 'medium',
      category: 'analysis',
      estimatedTime: '11 min',
      impact: 'high',
      requiresData: true,
      action: () => {
        const standardized = standardizePrompt('roi_analysis');
        navigateToAIAssistant(standardized.prompt);
      }
    }
  ];

  // Group actions by category
  const actionCategories: ActionCategory[] = [
    {
      id: 'analysis',
      name: 'Strategic Analysis',
      description: 'Data-driven insights and organizational assessment',
      icon: BarChart3,
      actions: executiveActions.filter(action => action.category === 'analysis')
    },
    {
      id: 'strategy',
      name: 'Strategic Planning',
      description: 'Long-term planning and intervention strategies',
      icon: Target,
      actions: executiveActions.filter(action => action.category === 'strategy')
    },
    {
      id: 'reporting',
      name: 'Executive Reporting',
      description: 'Board-ready reports and executive summaries',
      icon: FileText,
      actions: executiveActions.filter(action => action.category === 'reporting')
    },
    {
      id: 'oversight',
      name: 'Organizational Oversight',
      description: 'Department reviews and performance monitoring',
      icon: Eye,
      actions: executiveActions.filter(action => action.category === 'oversight')
    }
  ];

  // Filter actions based on selected category and priority
  const filteredActions = useMemo(() => {
    let actions = selectedCategory === 'all' ? executiveActions : 
      actionCategories.find(cat => cat.id === selectedCategory)?.actions || [];
    
    // Sort by priority and impact
    return actions.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const impactOrder = { high: 3, medium: 2, low: 1 };
      
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      const aImpact = impactOrder[a.impact];
      const bImpact = impactOrder[b.impact];
      
      return bImpact - aImpact;
    });
  }, [selectedCategory, executiveActions, actionCategories]);

  const getPriorityColor = (priority: 'critical' | 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
              <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                Executive
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Strategic Actions
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* Category Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                selectedCategory === 'all'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
            >
              All Actions
            </button>
            {actionCategories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center space-x-1",
                  selectedCategory === category.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                <category.icon className="w-3 h-3" />
                <span>{category.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredActions.map((action, index) => (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <button
                onClick={() => handleAction(action.id, action.action)}
                disabled={isLoading === action.id || (action.requiresData && employees.length === 0)}
                className={cn(
                  "w-full p-4 rounded-lg border border-gray-200 dark:border-gray-600 transition-all duration-200 text-left",
                  action.bgColor,
                  action.hoverColor,
                  "hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md",
                  isLoading === action.id && "opacity-50 cursor-not-allowed",
                  action.requiresData && employees.length === 0 && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={cn("p-2.5 rounded-lg", action.bgColor)}>
                      <action.icon className={cn("h-5 w-5", action.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {action.title}
                        </h4>
                        {action.count !== undefined && action.count > 0 && (
                          <span className={cn(
                            "px-2 py-0.5 text-xs rounded-full font-medium",
                            action.priority === 'critical' 
                              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                              : action.priority === 'high'
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          )}>
                            {action.count}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {action.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded border",
                            getPriorityColor(action.priority)
                          )}>
                            {action.priority}
                          </span>
                          <span className="text-xs text-gray-500">
                            ~{action.estimatedTime}
                          </span>
                          <span className={cn(
                            "text-xs font-medium",
                            action.impact === 'high' ? 'text-green-600 dark:text-green-400' :
                            action.impact === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-gray-600 dark:text-gray-400'
                          )}>
                            {action.impact} impact
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-2">
                    {action.priority === 'critical' && (
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                    {isLoading === action.id ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </div>

        {/* AI Assistant Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <button
            onClick={() => navigate('/ai-assistant')}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all duration-200 hover:shadow-lg"
          >
            <Zap className="h-4 w-4" />
            <span className="font-medium">Open AI Strategic Assistant</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>

        {/* Data Requirement Notice */}
        {employees.length === 0 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-800 dark:text-yellow-200">
                Some actions require employee data to be loaded first.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};