import React, { useState } from 'react';
// Removed motion import to reduce memory usage
import { 
  Brain, 
  Zap, 
  TrendingUp, 
  FileText, 
  Users, 
  AlertTriangle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useNavigate } from 'react-router-dom';
import { getCurrentThresholds } from '../../config/riskThresholds';
import { standardizePrompt } from '../../utils/promptStandardizer';
import { filterActiveEmployees } from '../../utils/employeeFilters';

interface AIQuickActionsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  onActionTrigger?: (action: string, params: any) => void;
  className?: string;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  hoverColor: string;
  action: () => void;
  count?: number;
  priority?: 'high' | 'medium' | 'low';
}

export const AIQuickActionsWidget: React.FC<AIQuickActionsWidgetProps> = ({
  widget,
  employees,
  onActionTrigger,
  className
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const thresholds = getCurrentThresholds();
  

  // Filter for active employees only (except for exit pattern analysis)
  const activeEmployees = filterActiveEmployees(employees);

  // Calculate action counts and priorities - ONLY ACTIVE EMPLOYEES
  const highRiskEmployees = activeEmployees.filter(emp => emp.churnProbability > thresholds.highRisk);
  const mediumRiskEmployees = activeEmployees.filter(emp => emp.churnProbability >= thresholds.mediumRisk && emp.churnProbability <= thresholds.highRisk);
  const recentlyAnalyzed = activeEmployees.filter(emp => {
    const daysSinceAnalysis = emp.lastAnalyzed 
      ? (Date.now() - new Date(emp.lastAnalyzed).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;
    return daysSinceAnalysis <= 7;
  });

  // Navigate to AI Assistant with specific prompt
  const navigateToAIAssistant = (prompt: string, employees?: Employee[]) => {
    const params = new URLSearchParams();
    params.set('prompt', prompt);
    if (employees && employees.length > 0) {
      params.set('employees', employees.map(e => e.employee_id).join(','));
    }
    navigate(`/ai-assistant?${params.toString()}`);
  };

  // Handle action execution
  const handleAction = async (actionId: string, action: () => void) => {
    setIsLoading(actionId);
    try {
      await action();
      onActionTrigger?.(actionId, { employees: employees.slice(0, 5) });
    } catch (error) {
      console.error(`Error executing action ${actionId}:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  // Define quick actions based on current data
  const quickActions: QuickAction[] = [
    {
      id: 'diagnose-high-risk',
      title: 'Diagnose High Risk',
      description: `Analyze ${highRiskEmployees.length} high-risk employees`,
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      hoverColor: 'hover:bg-red-100 dark:hover:bg-red-900/30',
      count: highRiskEmployees.length,
      priority: 'high',
      action: () => {
        if (highRiskEmployees.length > 0) {
          const selectedEmployees = highRiskEmployees.slice(0, 5);
          const employeeNames = selectedEmployees.map(e => e.full_name);
          const standardized = standardizePrompt('diagnose_multiple', undefined, employeeNames);
          navigateToAIAssistant(standardized.prompt, selectedEmployees);
        }
      }
    },
    {
      id: 'create-retention-plan',
      title: 'Create Retention Plans',
      description: `Generate plans for ${mediumRiskEmployees.length} at-risk employees`,
      icon: FileText,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      hoverColor: 'hover:bg-orange-100 dark:hover:bg-orange-900/30',
      count: mediumRiskEmployees.length,
      priority: 'medium',
      action: () => {
        if (mediumRiskEmployees.length > 0) {
          const selectedEmployees = mediumRiskEmployees.slice(0, 5);
          const employeeNames = selectedEmployees.map(e => e.full_name);
          const standardized = standardizePrompt('retention_multiple', undefined, employeeNames);
          navigateToAIAssistant(standardized.prompt, selectedEmployees);
        }
      }
    },
    {
      id: 'analyze-trends',
      title: 'Analyze Trends',
      description: 'Identify patterns in recent churn data',
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      hoverColor: 'hover:bg-blue-100 dark:hover:bg-blue-900/30',
      count: recentlyAnalyzed.length,
      priority: 'medium',
      action: () => {
        const standardized = standardizePrompt('trends');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'team-overview',
      title: 'Team Risk Overview',
      description: 'Get department-wise risk assessment',
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      hoverColor: 'hover:bg-purple-100 dark:hover:bg-purple-900/30',
      priority: 'low',
      action: () => {
        const standardized = standardizePrompt('team_overview');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'generate-report',
      title: 'Generate Report',
      description: 'Create executive summary report',
      icon: FileText,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      hoverColor: 'hover:bg-green-100 dark:hover:bg-green-900/30',
      priority: 'low',
      action: () => {
        const standardized = standardizePrompt('generate_report');
        navigateToAIAssistant(standardized.prompt);
      }
    },
    {
      id: 'ai-insights',
      title: 'AI Insights',
      description: 'Get personalized recommendations',
      icon: Sparkles,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      hoverColor: 'hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
      priority: 'medium',
      action: () => {
        const standardized = standardizePrompt('ai_insights');
        navigateToAIAssistant(standardized.prompt);
      }
    }
  ];

  // Filter and sort actions by priority and relevance
  const prioritizedActions = quickActions
    .filter(action => {
      // Show high priority actions if they have relevant data
      if (action.priority === 'high' && action.count && action.count > 0) return true;
      if (action.priority === 'medium') return true;
      if (action.priority === 'low') return true;
      return false;
    })
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority || 'low'] - priorityOrder[a.priority || 'low'];
    })
    .slice(0, 6); // Limit to 6 actions for better UI

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {widget.title}
            </h3>
            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
              AI Powered
            </span>
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prioritizedActions.map((action) => (
            <div key={action.id}>
              <button
                onClick={() => handleAction(action.id, action.action)}
                disabled={isLoading === action.id}
                className={cn(
                  "w-full p-4 rounded-lg border border-gray-200 dark:border-gray-600 transition-all duration-200 text-left",
                  action.bgColor,
                  action.hoverColor,
                  "hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md",
                  isLoading === action.id && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={cn("p-2 rounded-lg", action.bgColor)}>
                      <action.icon className={cn("h-5 w-5", action.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {action.title}
                        </h4>
                        {action.count !== undefined && action.count > 0 && (
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full font-medium",
                            action.priority === 'high' 
                              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                              : action.priority === 'medium'
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          )}>
                            {action.count}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {action.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-2">
                    {action.priority === 'high' && (
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
            </div>
          ))}
        </div>

        {/* AI Assistant Link */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigate('/ai-assistant')}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all duration-200 hover:shadow-lg"
          >
            <Zap className="h-4 w-4" />
            <span className="font-medium">Open AI Assistant</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};