import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Layout, 
  Plus, 
  Settings, 
  Save, 
  Undo, 
  Eye, 
  Edit3,
  Wand2,
  Grid3X3,
  Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDashboardCustomization } from '../../hooks/useDashboardCustomization';
import { useLicense } from '../../providers/LicenseProvider';
import { DashboardTemplate } from '../../types/dashboard';
import { Employee } from '../../types/employee';

interface DashboardCustomizationProps {
  employees: Employee[];
  aiInsights: any[];
  onLayoutChange?: (layoutId: string) => void;
}

export const DashboardCustomization: React.FC<DashboardCustomizationProps> = ({
  employees,
  aiInsights,
  onLayoutChange
}) => {
  const { hasAccess } = useLicense();
  const {
    layouts,
    templates,
    currentLayout,
    isEditMode,
    isLoading,
    error,
    hasEnterpriseAccess,
    canCustomize,
    setCurrentLayout,
    setEditMode,
    createLayoutFromTemplate,
    deleteLayout,
    autoGenerateLayout,
    saveLayout,
    resetLayout
  } = useDashboardCustomization();

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showLayoutManager, setShowLayoutManager] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Handle template selection
  const handleTemplateSelect = async (template: DashboardTemplate) => {
    try {
      const layoutName = `${template.name} - ${new Date().toLocaleDateString()}`;
      const newLayout = await createLayoutFromTemplate(template.id, layoutName);
      setCurrentLayout(newLayout.id);
      onLayoutChange?.(newLayout.id);
      setShowTemplateSelector(false);
    } catch (err) {
      console.error('Failed to create layout from template:', err);
    }
  };

  // Handle auto-generation
  const handleAutoGenerate = async () => {
    if (!hasEnterpriseAccess) return;
    
    try {
      setIsGenerating(true);
      const newLayout = await autoGenerateLayout(employees, aiInsights);
      setCurrentLayout(newLayout.id);
      onLayoutChange?.(newLayout.id);
    } catch (err) {
      console.error('Failed to auto-generate layout:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle layout deletion
  const handleDeleteLayout = async (layoutId: string) => {
    if (layouts.length <= 1) return; // Don't delete the last layout
    
    try {
      await deleteLayout(layoutId);
      // If we deleted the current layout, switch to the first available one
      if (currentLayout?.id === layoutId && layouts.length > 1) {
        const newCurrentLayout = layouts.find(l => l.id !== layoutId);
        if (newCurrentLayout) {
          setCurrentLayout(newCurrentLayout.id);
          onLayoutChange?.(newCurrentLayout.id);
        }
      }
    } catch (err) {
      console.error('Failed to delete layout:', err);
    }
  };

  if (!hasAccess('home')) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Dashboard Header Controls */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Layout className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Dashboard
            </h2>
            {!hasEnterpriseAccess && (
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                Basic
              </span>
            )}
            {hasEnterpriseAccess && (
              <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                Enterprise
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Layout Selector */}
          <select
            value={currentLayout?.id || ''}
            onChange={(e) => {
              setCurrentLayout(e.target.value);
              onLayoutChange?.(e.target.value);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            disabled={isLoading}
          >
            {layouts.map(layout => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>

          {/* Layout Management Button */}
          <button
            onClick={() => setShowLayoutManager(!showLayoutManager)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            title="Manage Layouts"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Edit Mode Toggle */}
          {canCustomize && (
            <button
              onClick={() => setEditMode(!isEditMode)}
              className={cn(
                "p-2 rounded-md transition-colors",
                isEditMode
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
              title={isEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
            >
              {isEditMode ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
            </button>
          )}

          {/* Save/Reset Buttons */}
          {isEditMode && (
            <>
              <button
                onClick={saveLayout}
                className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                title="Save Changes"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={resetLayout}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Reset Changes"
              >
                <Undo className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Enterprise Features Panel */}
      {hasEnterpriseAccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100">
                Enterprise Dashboard Features
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                Customize your dashboard with AI-powered layouts and templates
              </p>
            </div>
            <div className="flex space-x-2">
              {/* Template Selector */}
              <button
                onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-600 rounded-md text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors text-sm"
              >
                <Plus className="h-4 w-4 mr-1 inline" />
                Templates
              </button>

              {/* Auto-Generate Button */}
              <button
                onClick={handleAutoGenerate}
                disabled={isGenerating}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className={cn("h-4 w-4 mr-1 inline", isGenerating && "animate-spin")} />
                {isGenerating ? 'Generating...' : 'Auto Generate'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Choose a Template
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(template => (
              <motion.div
                key={template.id}
                whileHover={{ scale: 1.02 }}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 cursor-pointer hover:border-purple-300 dark:hover:border-purple-500 transition-colors"
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {template.name}
                  </h4>
                  {template.enterpriseOnly && (
                    <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                      Enterprise
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {template.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowTemplateSelector(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Layout Manager Modal */}
      {showLayoutManager && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Manage Layouts
          </h3>
          <div className="space-y-3">
            {layouts.map(layout => (
              <div
                key={layout.id}
                className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <Grid3X3 className="h-5 w-5 text-gray-400" />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {layout.name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {layout.widgets.length} widgets • Updated {layout.updatedAt.toLocaleDateString()}
                    </p>
                  </div>
                  {layout.autoGenerated && (
                    <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                      Auto-generated
                    </span>
                  )}
                  {layout.isDefault && (
                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setCurrentLayout(layout.id);
                      onLayoutChange?.(layout.id);
                      setShowLayoutManager(false);
                    }}
                    className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  >
                    Select
                  </button>
                  {layouts.length > 1 && (
                    <button
                      onClick={() => handleDeleteLayout(layout.id)}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setShowLayoutManager(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Close
            </button>
          </div>
        </motion.div>
      )}

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4"
        >
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </motion.div>
      )}

      {/* License Upgrade Prompt for Non-Enterprise Users */}
      {!hasEnterpriseAccess && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4"
        >
          <div className="flex items-center space-x-3">
            <Wand2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Unlock Advanced Dashboard Features
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Upgrade to Enterprise to access custom dashboards, AI-powered layouts, and advanced templates.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};