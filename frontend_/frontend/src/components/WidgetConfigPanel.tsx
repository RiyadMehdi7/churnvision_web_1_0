import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  X,
  Save,
  RotateCcw,
  Layout,
  BarChart3,
  Monitor
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DashboardWidget } from '../types/dashboard';

interface WidgetConfigPanelProps {
  widget: DashboardWidget | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widgetId: string, config: Record<string, unknown>) => void;
  onReset: (widgetId: string) => void;
  className?: string;
}

interface ConfigField {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'text' | 'select' | 'color' | 'range';
  value: string | number | boolean;
  options?: { label: string; value: string | number | boolean }[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

interface ConfigSection {
  title: string;
  icon: React.ElementType;
  fields: ConfigField[];
}

export const WidgetConfigPanel: React.FC<WidgetConfigPanelProps> = ({
  widget,
  isOpen,
  onClose,
  onSave,
  onReset,
  className
}) => {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize config when widget changes
  useEffect(() => {
    if (widget) {
      setConfig(widget.config || {});
      setHasChanges(false);
    }
  }, [widget]);

  // Generate configuration sections based on widget type
  const configSections = React.useMemo((): ConfigSection[] => {
    if (!widget) return [];

    const sections: ConfigSection[] = [];
    const cfg = config as any;

    // General section (common to all widgets)
    sections.push({
      title: 'General',
      icon: Settings,
      fields: [
        {
          key: 'showTitle',
          label: 'Show Title',
          type: 'boolean',
          value: (cfg?.showTitle ?? true) as boolean,
          description: 'Display the widget title'
        },
        {
          key: 'height',
          label: 'Height',
          type: 'range',
          value: Number(cfg?.height ?? 200),
          min: 150,
          max: 600,
          step: 50,
          description: 'Widget height in pixels'
        },
        {
          key: 'refreshInterval',
          label: 'Auto Refresh (minutes)',
          type: 'select',
          value: Number(cfg?.refreshInterval ?? 0),
          options: [
            { label: 'Disabled', value: 0 },
            { label: '1 minute', value: 1 },
            { label: '5 minutes', value: 5 },
            { label: '15 minutes', value: 15 },
            { label: '30 minutes', value: 30 }
          ],
          description: 'Automatic data refresh interval'
        }
      ]
    });

    // Display section
    sections.push({
      title: 'Display',
      icon: Monitor,
      fields: [
        {
          key: 'theme',
          label: 'Color Theme',
          type: 'select',
          value: String(cfg?.theme ?? 'default'),
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Blue', value: 'blue' },
            { label: 'Green', value: 'green' },
            { label: 'Purple', value: 'purple' },
            { label: 'Orange', value: 'orange' }
          ],
          description: 'Widget color scheme'
        },
        {
          key: 'showBorder',
          label: 'Show Border',
          type: 'boolean',
          value: Boolean(cfg?.showBorder ?? true),
          description: 'Display widget border'
        },
        {
          key: 'showShadow',
          label: 'Show Shadow',
          type: 'boolean',
          value: Boolean(cfg?.showShadow ?? true),
          description: 'Display drop shadow'
        }
      ]
    });

    // Widget-specific sections
    switch (widget.type) {
      case 'executive-risk-overview':
        sections.push({
          title: 'Risk Analysis',
          icon: BarChart3,
          fields: [
            {
              key: 'showDepartmentBreakdown',
              label: 'Department Breakdown',
              type: 'boolean',
          value: Boolean(cfg?.showDepartmentBreakdown ?? true),
              description: 'Show risk by department'
            },
            {
              key: 'riskThreshold',
              label: 'High Risk Threshold',
              type: 'range',
          value: Number(cfg?.riskThreshold ?? 0.7),
              min: 0.5,
              max: 0.9,
              step: 0.05,
              description: 'Threshold for high risk classification'
            },
            {
              key: 'maxDepartments',
              label: 'Max Departments Shown',
              type: 'number',
          value: Number(cfg?.maxDepartments ?? 8),
              min: 3,
              max: 15,
              description: 'Maximum departments to display'
            }
          ]
        });
        break;

      case 'workforce-trends':
        sections.push({
          title: 'Trends',
          icon: BarChart3,
          fields: [
            {
              key: 'timeRange',
              label: 'Time Range',
              type: 'select',
          value: String(cfg?.timeRange ?? '6months'),
              options: [
                { label: '3 Months', value: '3months' },
                { label: '6 Months', value: '6months' },
                { label: '1 Year', value: '1year' },
                { label: '2 Years', value: '2years' }
              ],
              description: 'Historical data range'
            },
            {
              key: 'showPredictions',
              label: 'Show Predictions',
              type: 'boolean',
          value: Boolean(cfg?.showPredictions ?? true),
              description: 'Display future trend predictions'
            },
            {
              key: 'chartType',
              label: 'Chart Type',
              type: 'select',
          value: String(cfg?.chartType ?? 'line'),
              options: [
                { label: 'Line Chart', value: 'line' },
                { label: 'Area Chart', value: 'area' },
                { label: 'Bar Chart', value: 'bar' }
              ],
              description: 'Visualization style'
            }
          ]
        });
        break;

      case 'enhanced-employee-table':
        sections.push({
          title: 'Table Settings',
          icon: Layout,
          fields: [
            {
              key: 'pageSize',
              label: 'Rows Per Page',
              type: 'select',
          value: Number(cfg?.pageSize ?? 10),
              options: [
                { label: '10 rows', value: 10 },
                { label: '25 rows', value: 25 },
                { label: '50 rows', value: 50 },
                { label: '100 rows', value: 100 }
              ],
              description: 'Number of employees per page'
            },
            {
              key: 'showFilters',
              label: 'Show Filters',
              type: 'boolean',
          value: Boolean(cfg?.showFilters ?? true),
              description: 'Display filter controls'
            },
            {
              key: 'showSearch',
              label: 'Show Search',
              type: 'boolean',
          value: Boolean(cfg?.showSearch ?? true),
              description: 'Display search functionality'
            },
            {
              key: 'defaultSort',
              label: 'Default Sort',
              type: 'select',
          value: String(cfg?.defaultSort ?? 'churnProbability'),
              options: [
                { label: 'Name', value: 'full_name' },
                { label: 'Department', value: 'structure_name' },
                { label: 'Risk Level', value: 'churnProbability' },
                { label: 'Tenure', value: 'tenure' }
              ],
              description: 'Default column to sort by'
            }
          ]
        });
        break;

      case 'individual-risk-analysis':
        sections.push({
          title: 'Analysis Settings',
          icon: BarChart3,
          fields: [
            {
              key: 'showBreakdown',
              label: 'Show Score Breakdown',
              type: 'boolean',
          value: Boolean(cfg?.showBreakdown ?? true),
              description: 'Display ML/heuristic score breakdown'
            },
            {
              key: 'showRecommendations',
              label: 'Show Recommendations',
              type: 'boolean',
          value: Boolean(cfg?.showRecommendations ?? true),
              description: 'Display retention recommendations'
            },
            {
              key: 'maxRecommendations',
              label: 'Max Recommendations',
              type: 'number',
          value: Number(cfg?.maxRecommendations ?? 5),
              min: 1,
              max: 10,
              description: 'Maximum recommendations to show'
            },
            {
              key: 'analysisMode',
              label: 'Default Mode',
              type: 'select',
          value: String(cfg?.analysisMode ?? 'overview'),
              options: [
                { label: 'Overview', value: 'overview' },
                { label: 'Detailed', value: 'detailed' }
              ],
              description: 'Default analysis view mode'
            }
          ]
        });
        break;

      case 'ai-retention-planner':
        sections.push({
          title: 'Planner Settings',
          icon: Settings,
          fields: [
            {
              key: 'autoGenerate',
              label: 'Auto Generate Plans',
              type: 'boolean',
          value: Boolean(cfg?.autoGenerate ?? false),
              description: 'Automatically generate plans for high-risk employees'
            },
            {
              key: 'planTemplate',
              label: 'Default Template',
              type: 'select',
          value: String(cfg?.planTemplate ?? 'comprehensive'),
              options: [
                { label: 'Comprehensive', value: 'comprehensive' },
                { label: 'Quick Action', value: 'quick' },
                { label: 'Long Term', value: 'longterm' }
              ],
              description: 'Default plan template'
            },
            {
              key: 'showProgress',
              label: 'Show Progress Tracking',
              type: 'boolean',
          value: Boolean(cfg?.showProgress ?? true),
              description: 'Display plan progress indicators'
            }
          ]
        });
        break;
    }

    return sections;
  }, [widget, config]);

  // Handle field changes
  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setConfig((prev: Record<string, unknown>) => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (widget) {
      onSave(widget.id, config);
      setHasChanges(false);
      onClose(); // Close panel after saving
    }
  }, [widget, config, onSave, onClose]);

  // Handle reset
  const handleReset = useCallback(() => {
    if (widget) {
      onReset(widget.id);
      setConfig(widget.config || {});
      setHasChanges(false);
    }
  }, [widget, onReset]);

  // Render field input
  const renderField = useCallback((field: ConfigField) => {
    switch (field.type) {
      case 'boolean':
        return (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(e) => handleFieldChange(field.key, e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {field.label}
            </span>
          </label>
        );

      case 'number':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <input
              type="number"
              value={Number(field.value)}
              onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value))}
              min={field.min}
              max={field.max}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        );

      case 'text':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <input
              type="text"
              value={String(field.value)}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        );

      case 'select':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <select
              value={String(field.value)}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {field.options?.map(option => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'range':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="range"
                value={Number(field.value)}
                onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value))}
                min={field.min}
                max={field.max}
                step={field.step}
                className="flex-1"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">
                {String(field.value)}
              </span>
            </div>
          </div>
        );

      case 'color':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={String(field.value)}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="w-8 h-8 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
              />
              <input
                type="text"
                value={String(field.value)}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [handleFieldChange]);

  if (!widget) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-45"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className={cn(
              "fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-hidden flex flex-col",
              className
            )}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Widget Settings
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {widget.title}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {configSections.map((section, sectionIndex) => {
                  const IconComponent = section.icon;
                  return (
                    <div key={sectionIndex}>
                      <h4 className="flex items-center space-x-2 text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                        <IconComponent className="w-4 h-4" />
                        <span>{section.title}</span>
                      </h4>
                      <div className="space-y-4">
                        {section.fields.map((field, fieldIndex) => (
                          <div key={fieldIndex}>
                            {renderField(field)}
                            {field.description && (
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {field.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </div>
              </div>
              {hasChanges && (
                <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  You have unsaved changes
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
