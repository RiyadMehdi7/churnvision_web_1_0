import React from 'react';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { AIQuickActionsWidget } from './AIQuickActionsWidget';
import { getCurrentThresholds } from '../../config/riskThresholds';

// Import existing components (these would be your current dashboard components)
interface RiskBarWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface DistributionChartWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface EmployeeTableWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface MetricsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

interface InsightsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  aiInsights?: any[];
  className?: string;
}

// Placeholder components - replace with your actual components
const RiskBarWidget: React.FC<RiskBarWidgetProps> = ({ widget, employees, className }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {widget.config?.showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {widget.title}
        </h3>
      )}
      <div className="text-center text-gray-600 dark:text-gray-400">
        Risk Bar Chart Component
        <div className="text-sm mt-2">
          {employees.length} employees loaded
        </div>
      </div>
    </div>
  </div>
);

const DistributionChartWidget: React.FC<DistributionChartWidgetProps> = ({ widget, employees, className }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {widget.config?.showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {widget.title}
        </h3>
      )}
      <div className="text-center text-gray-600 dark:text-gray-400">
        Distribution Chart Component
        <div className="text-sm mt-2">
          {employees.length} employees loaded
        </div>
      </div>
    </div>
  </div>
);

const EmployeeTableWidget: React.FC<EmployeeTableWidgetProps> = ({ widget, employees, className }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {widget.config?.showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {widget.title}
        </h3>
      )}
      <div className="text-center text-gray-600 dark:text-gray-400">
        Employee Table Component
        <div className="text-sm mt-2">
          {employees.length} employees loaded
        </div>
      </div>
    </div>
  </div>
);

const MetricsWidget: React.FC<MetricsWidgetProps> = ({ widget, employees, className }) => {
  const thresholds = getCurrentThresholds();
  const highRisk = employees.filter(e => e.churnProbability > thresholds.highRisk).length;
  const mediumRisk = employees.filter(e => e.churnProbability >= thresholds.mediumRisk && e.churnProbability <= thresholds.highRisk).length;
  const lowRisk = employees.filter(e => e.churnProbability < thresholds.mediumRisk).length;

  return (
    <div className={className}>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        {widget.config?.showTitle && (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {widget.title}
          </h3>
        )}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{highRisk}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">High Risk</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{mediumRisk}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Medium Risk</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{lowRisk}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Low Risk</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InsightsWidget: React.FC<InsightsWidgetProps> = ({ widget, aiInsights = [], className }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {widget.config?.showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {widget.title}
        </h3>
      )}
      <div className="space-y-3">
        {aiInsights.length > 0 ? (
          aiInsights.slice(0, 5).map((insight, index) => (
            <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-blue-900 dark:text-blue-100">
                {insight.title || `Insight ${index + 1}`}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {insight.description || 'AI-generated insight based on current data patterns'}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-600 dark:text-gray-400">
            <div>No AI insights available</div>
            <div className="text-sm mt-2">Run analysis to generate insights</div>
          </div>
        )}
      </div>
    </div>
  </div>
);

const CustomWidget: React.FC<{ widget: DashboardWidget; className?: string }> = ({ widget, className }) => (
  <div className={className}>
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {widget.config?.showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {widget.title}
        </h3>
      )}
      <div className="text-center text-gray-600 dark:text-gray-400">
        Custom Widget
        <div className="text-sm mt-2">Widget ID: {widget.id}</div>
      </div>
    </div>
  </div>
);

// Main widget renderer component
interface DashboardWidgetRendererProps {
  widget: DashboardWidget;
  employees: Employee[];
  aiInsights?: any[];
  onActionTrigger?: (action: string, params: any) => void;
  className?: string;
}

export const DashboardWidgetRenderer: React.FC<DashboardWidgetRendererProps> = ({
  widget,
  employees,
  aiInsights,
  onActionTrigger,
  className
}) => {
  const commonProps = {
    widget,
    employees,
    className
  };

  switch (widget.type) {
    case 'risk-bar':
      return <RiskBarWidget {...commonProps} />;
    
    case 'distribution-chart':
      return <DistributionChartWidget {...commonProps} />;
    
    case 'employee-table':
      return <EmployeeTableWidget {...commonProps} />;
    
    case 'ai-actions':
      return (
        <AIQuickActionsWidget 
          {...commonProps} 
          onActionTrigger={onActionTrigger}
        />
      );
    
    case 'metrics':
      return <MetricsWidget {...commonProps} />;
    
    case 'insights':
      return (
        <InsightsWidget 
          {...commonProps} 
          aiInsights={aiInsights}
        />
      );
    
    case 'custom':
      return <CustomWidget widget={widget} className={className} />;
    
    default:
      return (
        <div className={className}>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="text-center text-gray-600 dark:text-gray-400">
              Unknown widget type: {widget.type}
            </div>
          </div>
        </div>
      );
  }
};

export default DashboardWidgetRenderer;