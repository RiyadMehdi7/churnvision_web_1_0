import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Plus,
  Save,
  RotateCcw,
  Eye,
  Grid,
  Layout,
  Download,
  X,
  Check,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DashboardLayout } from '../types/dashboard';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';

interface CustomizationToolbarProps {
  isCustomizing: boolean;
  onToggleCustomization: () => void;
  currentMode: CustomizationMode;
  onModeChange: (mode: CustomizationMode) => void;
  currentLayout: DashboardLayout | null;
  availableLayouts: DashboardLayout[];
  onLayoutChange: (layoutId: string) => void;
  onSaveLayout: (name: string) => Promise<void>;
  onAddWidget: (type: string) => void;
  onResetLayout: () => void;
  onExportLayout: () => void;
  onImportLayout: (layout: DashboardLayout) => void;
  className?: string;
}

interface WidgetPaletteItem {
  type: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: 'executive' | 'operational' | 'ai' | 'analytics';
  modes: CustomizationMode[];
}

export const CustomizationToolbar: React.FC<CustomizationToolbarProps> = ({
  isCustomizing,
  onToggleCustomization,
  currentMode,
  onModeChange,
  currentLayout,
  availableLayouts,
  onLayoutChange,
  onSaveLayout,
  onAddWidget,
  onResetLayout,
  onExportLayout,
  onImportLayout: _,
  className
}) => {
  const [showWidgetPalette, setShowWidgetPalette] = useState(false);
  const [showLayoutManager, setShowLayoutManager] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLayoutName, setSaveLayoutName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Widget palette configuration
  const widgetPalette: WidgetPaletteItem[] = [
    {
      type: 'executive-risk-overview',
      name: 'Executive Risk Overview',
      description: 'High-level organizational risk metrics and trends',
      icon: Grid,
      category: 'executive',
      modes: ['c-level']
    },
    {
      type: 'workforce-trends',
      name: 'Workforce Trends',
      description: 'Historical patterns and predictive analytics',
      icon: Layout,
      category: 'analytics',
      modes: ['c-level']
    },
    {
      type: 'ai-strategic-insights',
      name: 'AI Strategic Insights',
      description: 'Executive-level AI recommendations and alerts',
      icon: Settings,
      category: 'ai',
      modes: ['c-level']
    },
    {
      type: 'enhanced-employee-table',
      name: 'Employee Management Table',
      description: 'Detailed employee data with advanced filtering',
      icon: Grid,
      category: 'operational',
      modes: ['d-level']
    },
    {
      type: 'individual-risk-analysis',
      name: 'Individual Risk Analysis',
      description: 'Deep-dive employee risk assessment',
      icon: AlertCircle,
      category: 'analytics',
      modes: ['d-level']
    },
    {
      type: 'ai-retention-planner',
      name: 'AI Retention Planner',
      description: 'Automated retention plan generation and tracking',
      icon: Settings,
      category: 'ai',
      modes: ['d-level']
    }
  ];

  // Filter widgets by current mode
  const availableWidgets = widgetPalette.filter(widget => 
    widget.modes.includes(currentMode)
  );

  // Event handlers
  const handleSaveLayout = useCallback(async () => {
    if (!saveLayoutName.trim()) return;
    
    setIsSaving(true);
    try {
      await onSaveLayout(saveLayoutName.trim());
      setShowSaveDialog(false);
      setSaveLayoutName('');
    } catch (error) {
      console.error('Failed to save layout:', error);
    } finally {
      setIsSaving(false);
    }
  }, [saveLayoutName, onSaveLayout]);

  const handleAddWidget = useCallback((widgetType: string) => {
    onAddWidget(widgetType);
    setShowWidgetPalette(false);
  }, [onAddWidget]);


  if (!isCustomizing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "fixed top-4 left-1/2 transform -translate-x-1/2 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700",
          className
        )}
      >
        <button
          onClick={onToggleCustomization}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Customize</span>
        </button>
      </motion.div>
    );
  }

  return (
    <>
      {/* Main Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "fixed top-4 left-1/2 transform -translate-x-1/2 z-30 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700",
          className
        )}
      >
        <div className="flex items-center divide-x divide-gray-200 dark:divide-gray-700">
          {/* Mode Selector */}
          <div className="px-4 py-2">
            <select
              value={currentMode}
              onChange={(e) => onModeChange(e.target.value as CustomizationMode)}
              className="text-sm bg-transparent border-none focus:ring-0 text-gray-700 dark:text-gray-300"
            >
              <option value="c-level">C-Level Mode</option>
              <option value="d-level">D-Level Mode</option>
            </select>
          </div>

          {/* Widget Actions */}
          <div className="flex items-center">
            <button
              onClick={() => setShowWidgetPalette(!showWidgetPalette)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Add Widget"
            >
              <Plus className="w-4 h-4" />
              <span>Add Widget</span>
            </button>
          </div>

          {/* Layout Actions */}
          <div className="flex items-center">
            <button
              onClick={() => setShowLayoutManager(!showLayoutManager)}
              className="px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Layout Manager"
            >
              <Layout className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Save Layout"
            >
              <Save className="w-4 h-4" />
            </button>
            
            <button
              onClick={onResetLayout}
              className="px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Reset Layout"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Export */}
          <div className="flex items-center">
            <button
              onClick={onExportLayout}
              className="px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Export Layout"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Exit Customization */}
          <div className="px-2">
            <button
              onClick={onToggleCustomization}
              className="flex items-center space-x-2 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Widget Palette */}
      <AnimatePresence>
        {showWidgetPalette && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-35 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-96"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Add Widget
                </h3>
                <button
                  onClick={() => setShowWidgetPalette(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableWidgets.map((widget) => {
                  const IconComponent = widget.icon;
                  return (
                    <button
                      key={widget.type}
                      onClick={() => handleAddWidget(widget.type)}
                      className="w-full p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                          <IconComponent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {widget.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {widget.description}
                          </p>
                          <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            {widget.category}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layout Manager */}
      <AnimatePresence>
        {showLayoutManager && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-20 right-4 z-35 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-80"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Layout Manager
                </h3>
                <button
                  onClick={() => setShowLayoutManager(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableLayouts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No saved layouts
                  </p>
                ) : (
                  availableLayouts.map((layout) => (
                    <div
                      key={layout.id}
                      className={cn(
                        "p-3 border rounded-lg transition-colors",
                        currentLayout?.id === layout.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {layout.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {layout.widgets.length} widgets • {layout.updatedAt.toLocaleDateString()}
                          </p>
                          {layout.isDefault && (
                            <span className="inline-block mt-1 px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          {currentLayout?.id !== layout.id && (
                            <button
                              onClick={() => onLayoutChange(layout.id)}
                              className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                              title="Load Layout"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {!layout.isDefault && (
                            <button
                              className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              title="Delete Layout"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Layout Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-96 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Save Layout
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Layout Name
                </label>
                <input
                  type="text"
                  value={saveLayoutName}
                  onChange={(e) => setSaveLayoutName(e.target.value)}
                  placeholder="Enter layout name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveLayoutName('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLayout}
                  disabled={!saveLayoutName.trim() || isSaving}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};