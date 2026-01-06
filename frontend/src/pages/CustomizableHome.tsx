import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Eye } from 'lucide-react';
import { useGlobalDataCache } from '../hooks/useGlobalDataCache';
import { useProject } from '../contexts/ProjectContext';
import { HomeCustomizationProvider, useHomeCustomization } from '../contexts/HomeCustomizationContext';
import { CustomizationToolbar } from '@/components/dashboard/CustomizationToolbar';
import { DragDropGrid } from '@/components/dashboard/DragDropGrid';
import { WidgetConfigPanel } from '@/components/dashboard/WidgetConfigPanel';
import { DashboardWidget, DashboardLayout } from '../types/dashboard';
import { dashboardService } from '../services/dashboardService';
import { roleModeManager } from '../services/roleModeManager';
import { aiCacheManager } from '../services/aiCacheManager';

interface CustomizableHomeContentProps {
  onToggleClassicView: () => void;
}

const CustomizableHomeContent: React.FC<CustomizableHomeContentProps> = ({ onToggleClassicView }) => {
  const { activeProject } = useProject();
  const { homeEmployees, isLoadingHomeData, fetchHomeData } = useGlobalDataCache();

  const {
    currentMode,
    setMode,
    isCustomizing,
    setCustomizing,
    currentLayout,
    setCurrentLayout,
  } = useHomeCustomization();

  // Local state for managing available layouts
  const [localAvailableLayouts, setLocalAvailableLayouts] = useState<DashboardLayout[]>([]);

  // Local state
  const [configWidget, setConfigWidget] = useState<DashboardWidget | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize dashboard service and load data
  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize dashboard service
        await dashboardService.initialize(true); // Assume enterprise for demo

        // Load layouts for current mode
        const layouts = dashboardService.getLayoutsByMode(currentMode);
        setLocalAvailableLayouts(layouts);

        // Set default layout if none selected
        if (!currentLayout && layouts.length > 0) {
          const defaultLayout = layouts.find(l => l.isDefault) || layouts[0];
          setCurrentLayout(defaultLayout);
        } else if (!currentLayout) {
          // Create a default layout from role manager
          try {
            const defaultLayout = roleModeManager.getDefaultLayout(currentMode);
            setCurrentLayout(defaultLayout);
          } catch (err) {
            // Create a minimal fallback layout
            const fallbackLayout: DashboardLayout = {
              id: `fallback-${currentMode}-${Date.now()}`,
              name: `Fallback ${currentMode} Layout`,
              widgets: [],
              isDefault: false,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            setCurrentLayout(fallbackLayout);
          }
        }

        // Load employee data if needed
        if (activeProject && (!homeEmployees || homeEmployees.length === 0)) {
          if (activeProject?.id) {
            fetchHomeData(activeProject.id, false);
          }
        }

        setIsInitialized(true);
      } catch (err) {
        setError('Failed to initialize dashboard');
      }
    };

    initialize();
  }, [activeProject, currentMode]);

  // Handle mode changes
  const handleModeChange = useCallback(async (newMode: typeof currentMode) => {
    try {
      await roleModeManager.switchMode(newMode);
      setMode(newMode);

      // Load layouts for new mode
      const layouts = dashboardService.getLayoutsByMode(newMode);
      setLocalAvailableLayouts(layouts);

      // Set default layout for new mode
      const defaultLayout = layouts.find(l => l.isDefault) || layouts[0];
      setCurrentLayout(defaultLayout);

      // Clear any AI cache for mode-specific data
      aiCacheManager.invalidateAIInsights();
    } catch (err) {
      setError('Failed to switch dashboard mode');
    }
  }, [setMode, setCurrentLayout]);

  // Handle layout changes
  const handleLayoutChange = useCallback((layoutId: string) => {
    const layout = localAvailableLayouts.find(l => l.id === layoutId);
    if (layout) {
      setCurrentLayout(layout);
    }
  }, [localAvailableLayouts, setCurrentLayout]);

  // Handle widget operations
  const handleAddWidget = useCallback(async (widgetType: string) => {
    if (!currentLayout) {
      return;
    }

    try {
      const newWidget: DashboardWidget = {
        id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: widgetType as any,
        title: getWidgetTitle(widgetType),
        position: findNextAvailablePosition(currentLayout.widgets),
        config: { showTitle: true, height: 300 }
      };

      const updatedLayout = {
        ...currentLayout,
        widgets: [...currentLayout.widgets, newWidget],
        updatedAt: new Date()
      };

      // Update state directly for immediate feedback
      setCurrentLayout(updatedLayout);

      // Then try to save to service (optional)
      try {
        await dashboardService.updateLayout(currentLayout.id, updatedLayout);
      } catch (serviceErr) {
        // Failed to save to service, but widget added to UI
      }
    } catch (err) {
      setError('Failed to add widget');
    }
  }, [currentLayout, setCurrentLayout]);

  const handleRemoveWidget = useCallback(async (widgetId: string) => {
    if (!currentLayout) return;

    try {
      const updatedLayout = {
        ...currentLayout,
        widgets: currentLayout.widgets.filter(w => w.id !== widgetId),
        updatedAt: new Date()
      };

      // Update state immediately for immediate feedback
      setCurrentLayout(updatedLayout);

      // Try to save to service (optional)
      try {
        await dashboardService.updateLayout(currentLayout.id, updatedLayout);
      } catch (serviceErr) {
        // Failed to persist widget removal, but updated UI
      }
    } catch (err) {
      setError('Failed to remove widget');
    }
  }, [currentLayout, setCurrentLayout]);

  const handleLayoutUpdate = useCallback(async (layout: any[]) => {
    if (!currentLayout) return;

    try {
      const updatedWidgets = currentLayout.widgets.map(widget => {
        const layoutItem = layout.find(item => item.i === widget.id);
        if (layoutItem) {
          return {
            ...widget,
            position: {
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h
            }
          };
        }
        return widget;
      });

      const updatedLayout = {
        ...currentLayout,
        widgets: updatedWidgets,
        updatedAt: new Date()
      };

      // Update state immediately for smooth UX
      setCurrentLayout(updatedLayout);

      // Try to save to service (optional - for persistence)
      try {
        await dashboardService.updateLayout(currentLayout.id, updatedLayout);
      } catch (serviceErr) {
        // Failed to persist layout changes, but UI updated
        // For now, we'll allow the UI to work even if persistence fails
      }
    } catch (err) {
      setError('Failed to update layout');
    }
  }, [currentLayout, setCurrentLayout]);

  const handleSaveLayout = useCallback(async (name: string) => {
    if (!currentLayout) return;

    try {
      const newLayout = {
        ...currentLayout,
        id: `layout-${Date.now()}`,
        name,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Update local state immediately
      setLocalAvailableLayouts((prev: DashboardLayout[]) => [...prev, newLayout]);
      setCurrentLayout(newLayout);

      // Try to save to service (optional)
      try {
        await dashboardService.updateLayout(newLayout.id, newLayout);
      } catch (serviceErr) {
        // Failed to persist saved layout, but added to UI
      }
    } catch (err) {
      setError('Failed to save layout');
    }
  }, [currentLayout]);

  const handleResetLayout = useCallback(async () => {
    try {
      const defaultLayout = roleModeManager.getDefaultLayout(currentMode);
      setCurrentLayout(defaultLayout);
    } catch (err) {
      setError('Failed to reset layout');
    }
  }, [currentMode, setCurrentLayout]);

  const handleExportLayout = useCallback(async () => {
    if (!currentLayout) return;

    try {
      // Import PDF libraries dynamically
      const jsPDF = (await import('jspdf')).default;

      // Create PDF document
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      // Add header
      pdf.setFontSize(24);
      pdf.setTextColor(59, 130, 246); // Blue color
      pdf.text('ChurnVision Dashboard Report', margin, 30);

      pdf.setFontSize(12);
      pdf.setTextColor(107, 114, 128); // Gray color
      pdf.text(`Layout: ${currentLayout.name}`, margin, 40);
      pdf.text(`Mode: ${currentMode === 'c-level' ? 'Executive View' : 'Department Manager View'}`, margin, 47);
      pdf.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, margin, 54);
      pdf.text(`Widgets: ${currentLayout.widgets.length}`, margin, 61);

      // Add summary section
      pdf.setFontSize(16);
      pdf.setTextColor(17, 24, 39); // Dark color
      pdf.text('Dashboard Summary', margin, 80);

      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      let yPosition = 90;

      // Add widget details
      currentLayout.widgets.forEach((widget, index) => {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = 30;
        }

        const widgetTitle = getWidgetTitle(widget.type);
        const category = widget.type.includes('executive') ? 'Executive' :
          widget.type.includes('ai') ? 'AI Insights' :
            widget.type.includes('analytics') ? 'Analytics' : 'Operational';

        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39);
        pdf.text(`${index + 1}. ${widgetTitle}`, margin, yPosition);

        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Category: ${category}`, margin + 5, yPosition + 5);
        pdf.text(`Position: ${widget.position.x},${widget.position.y} | Size: ${widget.position.w}x${widget.position.h}`, margin + 5, yPosition + 10);

        yPosition += 20;
      });

      // Add footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(156, 163, 175);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 30, pageHeight - 10);
        pdf.text('ChurnVision - Employee Retention Analytics Platform', margin, pageHeight - 10);
      }

      // Save the PDF
      const fileName = `ChurnVision_${currentLayout.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      // Failed to generate PDF - logged silently in production
      // Fallback to JSON export
      const dataStr = JSON.stringify(currentLayout, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `${currentLayout.name.replace(/\s+/g, '_')}_layout.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    }
  }, [currentLayout, currentMode]);

  const handleImportLayout = useCallback(async (layout: DashboardLayout) => {
    try {
      const importedLayout = {
        ...layout,
        id: `imported-${Date.now()}`,
        name: `${layout.name} (Imported)`,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await dashboardService.updateLayout(importedLayout.id, importedLayout);
      setLocalAvailableLayouts((prev: DashboardLayout[]) => [...prev, importedLayout]);
      setCurrentLayout(importedLayout);
    } catch (err) {
      setError('Failed to import layout');
    }
  }, [setCurrentLayout]);

  const handleWidgetConfig = useCallback((widgetId: string, config: any) => {
    if (!currentLayout) return;

    const updatedWidgets = currentLayout.widgets.map(widget =>
      widget.id === widgetId ? { ...widget, config: { ...widget.config, ...config } } : widget
    );

    const updatedLayout = {
      ...currentLayout,
      widgets: updatedWidgets,
      updatedAt: new Date()
    };

    setCurrentLayout(updatedLayout);
    dashboardService.updateLayout(currentLayout.id, updatedLayout);
  }, [currentLayout, setCurrentLayout]);

  const handleWidgetConfigReset = useCallback((widgetId: string) => {
    if (!currentLayout) return;

    const updatedWidgets = currentLayout.widgets.map(widget =>
      widget.id === widgetId ? { ...widget, config: { showTitle: true, height: 300 } } : widget
    );

    const updatedLayout = {
      ...currentLayout,
      widgets: updatedWidgets,
      updatedAt: new Date()
    };

    setCurrentLayout(updatedLayout);
    dashboardService.updateLayout(currentLayout.id, updatedLayout);
  }, [currentLayout, setCurrentLayout]);

  // Helper functions
  const getWidgetTitle = (type: string): string => {
    const titles: Record<string, string> = {
      'executive-risk-overview': 'Executive Risk Overview',
      'workforce-trends': 'Workforce Trends',
      'ai-strategic-insights': 'AI Strategic Insights',
      'enhanced-employee-table': 'Employee Management',
      'individual-risk-analysis': 'Individual Risk Analysis',
      'ai-retention-planner': 'AI Retention Planner'
    };
    return titles[type] || 'Widget';
  };

  const findNextAvailablePosition = (widgets: DashboardWidget[]) => {
    if (widgets.length === 0) {
      return { x: 0, y: 0, w: 6, h: 4 };
    }

    // Create a grid representation to find available space
    const gridWidth = 12;
    const gridHeight = 20; // Reasonable max height
    const grid: boolean[][] = Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(false));

    // Mark occupied positions
    widgets.forEach(widget => {
      const { x, y, w, h } = widget.position;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const gridY = y + dy;
          const gridX = x + dx;
          if (gridY < gridHeight && gridX < gridWidth) {
            grid[gridY][gridX] = true;
          }
        }
      }
    });

    // Find the first available position
    const widgetWidth = 6;
    const widgetHeight = 4;

    for (let y = 0; y <= gridHeight - widgetHeight; y++) {
      for (let x = 0; x <= gridWidth - widgetWidth; x++) {
        let canPlace = true;

        // Check if the area is free
        for (let dy = 0; dy < widgetHeight; dy++) {
          for (let dx = 0; dx < widgetWidth; dx++) {
            if (grid[y + dy][x + dx]) {
              canPlace = false;
              break;
            }
          }
          if (!canPlace) break;
        }

        if (canPlace) {
          return { x, y, w: widgetWidth, h: widgetHeight };
        }
      }
    }

    // Fallback: place at the bottom
    const maxY = Math.max(...widgets.map(w => w.position.y + w.position.h), 0);
    return { x: 0, y: maxY, w: widgetWidth, h: widgetHeight };
  };

  // Loading state
  if (!isInitialized || isLoadingHomeData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Dashboard Error
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Dashboard Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                ChurnVision Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {currentMode === 'c-level' ? 'Executive View' : 'Department Manager View'} •
                {currentLayout?.name || 'Default Layout'}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onToggleClassicView}
                className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span>Classic View</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customization Toolbar */}
      <div className="flex-shrink-0">
        <CustomizationToolbar
          isCustomizing={isCustomizing}
          onToggleCustomization={() => setCustomizing(!isCustomizing)}
          currentMode={currentMode}
          onModeChange={handleModeChange}
          currentLayout={currentLayout}
          availableLayouts={localAvailableLayouts}
          onLayoutChange={handleLayoutChange}
          onSaveLayout={handleSaveLayout}
          onAddWidget={handleAddWidget}
          onResetLayout={handleResetLayout}
          onExportLayout={handleExportLayout}
          onImportLayout={handleImportLayout}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {currentLayout ? (
          <DragDropGrid
            widgets={currentLayout.widgets}
            isEditing={isCustomizing}
            onLayoutChange={handleLayoutUpdate}
            onWidgetRemove={handleRemoveWidget}
            onWidgetConfigure={(widgetId) => {
              const widget = currentLayout.widgets.find(w => w.id === widgetId);
              setConfigWidget(widget || null);
            }}
            employees={homeEmployees || []}
          />
        ) : (
          <div className="text-center py-12">
            <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No Layout Selected
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Please select or create a dashboard layout to get started
            </p>
          </div>
        )}
      </div>

      {/* Widget Configuration Panel */}
      <WidgetConfigPanel
        widget={configWidget}
        isOpen={!!configWidget}
        onClose={() => setConfigWidget(null)}
        onSave={handleWidgetConfig}
        onReset={handleWidgetConfigReset}
      />

      {/* Error Notifications */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg max-w-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-2 text-white hover:text-gray-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface CustomizableHomeProps {
  onToggleClassicView: () => void;
}

export const CustomizableHome: React.FC<CustomizableHomeProps> = ({ onToggleClassicView }) => {
  return (
    <HomeCustomizationProvider>
      <CustomizableHomeContent onToggleClassicView={onToggleClassicView} />
    </HomeCustomizationProvider>
  );
};