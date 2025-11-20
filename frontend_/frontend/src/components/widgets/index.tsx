import { AIRetentionPlannerWidget } from './AIRetentionPlannerWidget';

import { IndividualRiskAnalysisWidget } from './IndividualRiskAnalysisWidget';

import { EnhancedEmployeeTableWidget } from './EnhancedEmployeeTableWidget';

import { CLevelQuickActionsWidget } from './CLevelQuickActionsWidget';

import { AIStrategicInsightsWidget } from './AIStrategicInsightsWidget';

import { WorkforceTrendsWidget } from './WorkforceTrendsWidget';

import { ExecutiveRiskOverviewWidget } from './ExecutiveRiskOverviewWidget';

// Widget exports for the home page customization system
export { ExecutiveRiskOverviewWidget } from './ExecutiveRiskOverviewWidget';
export { WorkforceTrendsWidget } from './WorkforceTrendsWidget';
export { AIStrategicInsightsWidget } from './AIStrategicInsightsWidget';
export { CLevelQuickActionsWidget } from './CLevelQuickActionsWidget';
export { EnhancedEmployeeTableWidget } from './EnhancedEmployeeTableWidget';
export { IndividualRiskAnalysisWidget } from './IndividualRiskAnalysisWidget';
export { AIRetentionPlannerWidget } from './AIRetentionPlannerWidget';

// Demo components

// Widget type definitions for dynamic rendering
export const WIDGET_COMPONENTS = {
  'executive-risk-overview': ExecutiveRiskOverviewWidget,
  'workforce-trends': WorkforceTrendsWidget,
  'ai-strategic-insights': AIStrategicInsightsWidget,
  'c-level-quick-actions': CLevelQuickActionsWidget,
  'enhanced-employee-table': EnhancedEmployeeTableWidget,
  'individual-risk-analysis': IndividualRiskAnalysisWidget,
  'ai-retention-planner': AIRetentionPlannerWidget,
} as const;

export type WidgetComponentType = keyof typeof WIDGET_COMPONENTS;