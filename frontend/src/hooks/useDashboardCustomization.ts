import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout, DashboardWidget, DashboardConfig, DashboardTemplate } from '../types/dashboard';
import { dashboardService } from '../services/dashboardService';
import { useLicense } from '../providers/LicenseProvider';
import { Employee } from '../types/employee';

export interface UseDashboardCustomizationReturn {
  layouts: DashboardLayout[];
  templates: DashboardTemplate[];
  currentLayout: DashboardLayout | null;
  config: DashboardConfig | null;
  isEditMode: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCurrentLayout: (layoutId: string) => void;
  setEditMode: (enabled: boolean) => void;
  createLayoutFromTemplate: (templateId: string, name: string) => Promise<DashboardLayout>;
  updateLayout: (layoutId: string, updates: Partial<DashboardLayout>) => Promise<void>;
  deleteLayout: (layoutId: string) => Promise<void>;
  autoGenerateLayout: (employees: Employee[], aiInsights: any[]) => Promise<DashboardLayout>;
  saveLayout: () => Promise<void>;
  resetLayout: () => void;
  
  // Widget management
  addWidget: (widget: Omit<DashboardWidget, 'id'>) => void;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  removeWidget: (widgetId: string) => void;
  moveWidget: (widgetId: string, position: { x: number; y: number; w: number; h: number }) => void;
  
  // Enterprise features
  hasEnterpriseAccess: boolean;
  canCustomize: boolean;
}

export function useDashboardCustomization(): UseDashboardCustomizationReturn {
  const { licenseTier, hasAccess } = useLicense();
  const [layouts, setLayouts] = useState<DashboardLayout[]>([]);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [currentLayout, setCurrentLayoutState] = useState<DashboardLayout | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Check enterprise access
  const hasEnterpriseAccess = licenseTier === 'enterprise';
  const canCustomize = hasEnterpriseAccess && hasAccess('ai-assistant');

  // Initialize dashboard service
  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        await dashboardService.initialize(hasEnterpriseAccess);
        
        const dashboardLayouts = dashboardService.getLayouts();
        const dashboardTemplates = dashboardService.getTemplates(hasEnterpriseAccess);
        const dashboardConfig = dashboardService.getConfig();
        
        setLayouts(dashboardLayouts);
        setTemplates(dashboardTemplates);
        setConfig(dashboardConfig);
        
        // Set default layout if none exists
        if (dashboardLayouts.length === 0 && dashboardTemplates.length > 0) {
          const defaultLayout = await dashboardService.createLayoutFromTemplate(
            dashboardTemplates[0].id,
            'Default Dashboard'
          );
          setLayouts([defaultLayout]);
          setCurrentLayoutState(defaultLayout);
        } else if (dashboardLayouts.length > 0) {
          const defaultLayout = dashboardLayouts.find(l => l.isDefault) || dashboardLayouts[0];
          setCurrentLayoutState(defaultLayout);
        }
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize dashboard');
        console.error('Dashboard initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, [hasEnterpriseAccess]);

  // Set current layout
  const setCurrentLayout = useCallback((layoutId: string) => {
    const layout = layouts.find(l => l.id === layoutId);
    if (layout) {
      setCurrentLayoutState(layout);
      setUnsavedChanges(false);
    }
  }, [layouts]);

  // Set edit mode
  const setEditMode = useCallback((enabled: boolean) => {
    if (!canCustomize && enabled) {
      setError('Enterprise license required for dashboard customization');
      return;
    }
    setIsEditMode(enabled);
  }, [canCustomize]);

  // Create layout from template
  const createLayoutFromTemplate = useCallback(async (templateId: string, name: string): Promise<DashboardLayout> => {
    try {
      setError(null);
      const newLayout = await dashboardService.createLayoutFromTemplate(templateId, name);
      setLayouts(prev => [...prev, newLayout]);
      return newLayout;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create layout';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Update layout
  const updateLayout = useCallback(async (layoutId: string, updates: Partial<DashboardLayout>) => {
    try {
      setError(null);
      const updatedLayout = await dashboardService.updateLayout(layoutId, updates);
      setLayouts(prev => prev.map(l => l.id === layoutId ? updatedLayout : l));
      if (currentLayout?.id === layoutId) {
        setCurrentLayoutState(updatedLayout);
      }
      setUnsavedChanges(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update layout';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentLayout?.id]);

  // Delete layout
  const deleteLayout = useCallback(async (layoutId: string) => {
    try {
      setError(null);
      await dashboardService.deleteLayout(layoutId);
      setLayouts(prev => prev.filter(l => l.id !== layoutId));
      if (currentLayout?.id === layoutId) {
        const remainingLayouts = layouts.filter(l => l.id !== layoutId);
        setCurrentLayoutState(remainingLayouts.length > 0 ? remainingLayouts[0] : null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete layout';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentLayout?.id, layouts]);

  // Auto-generate layout
  const autoGenerateLayout = useCallback(async (employees: Employee[], aiInsights: any[]): Promise<DashboardLayout> => {
    try {
      setError(null);
      const newLayout = await dashboardService.autoGenerateLayout(employees, aiInsights);
      setLayouts(prev => [...prev, newLayout]);
      return newLayout;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to auto-generate layout';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Save current layout
  const saveLayout = useCallback(async () => {
    if (!currentLayout || !unsavedChanges) return;
    
    try {
      await updateLayout(currentLayout.id, currentLayout);
      setUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save layout:', err);
    }
  }, [currentLayout, unsavedChanges, updateLayout]);

  // Reset layout to last saved state
  const resetLayout = useCallback(() => {
    if (currentLayout) {
      const savedLayout = layouts.find(l => l.id === currentLayout.id);
      if (savedLayout) {
        setCurrentLayoutState(savedLayout);
        setUnsavedChanges(false);
      }
    }
  }, [currentLayout, layouts]);

  // Add widget
  const addWidget = useCallback((widget: Omit<DashboardWidget, 'id'>) => {
    if (!currentLayout || !canCustomize) return;
    
    const newWidget: DashboardWidget = {
      ...widget,
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    const updatedLayout = {
      ...currentLayout,
      widgets: [...currentLayout.widgets, newWidget],
      updatedAt: new Date()
    };
    
    setCurrentLayoutState(updatedLayout);
    setUnsavedChanges(true);
  }, [currentLayout, canCustomize]);

  // Update widget
  const updateWidget = useCallback((widgetId: string, updates: Partial<DashboardWidget>) => {
    if (!currentLayout || !canCustomize) return;
    
    const updatedLayout = {
      ...currentLayout,
      widgets: currentLayout.widgets.map(w => 
        w.id === widgetId ? { ...w, ...updates } : w
      ),
      updatedAt: new Date()
    };
    
    setCurrentLayoutState(updatedLayout);
    setUnsavedChanges(true);
  }, [currentLayout, canCustomize]);

  // Remove widget
  const removeWidget = useCallback((widgetId: string) => {
    if (!currentLayout || !canCustomize) return;
    
    const updatedLayout = {
      ...currentLayout,
      widgets: currentLayout.widgets.filter(w => w.id !== widgetId),
      updatedAt: new Date()
    };
    
    setCurrentLayoutState(updatedLayout);
    setUnsavedChanges(true);
  }, [currentLayout, canCustomize]);

  // Move widget
  const moveWidget = useCallback((widgetId: string, position: { x: number; y: number; w: number; h: number }) => {
    if (!currentLayout || !canCustomize) return;
    
    const updatedLayout = {
      ...currentLayout,
      widgets: currentLayout.widgets.map(w => 
        w.id === widgetId ? { ...w, position } : w
      ),
      updatedAt: new Date()
    };
    
    setCurrentLayoutState(updatedLayout);
    setUnsavedChanges(true);
  }, [currentLayout, canCustomize]);

  // Auto-save effect
  useEffect(() => {
    if (unsavedChanges && currentLayout) {
      const timer = setTimeout(() => {
        saveLayout();
      }, 2000); // Auto-save after 2 seconds of inactivity
      
      return () => clearTimeout(timer);
    }
  }, [unsavedChanges, currentLayout, saveLayout]);

  return {
    layouts,
    templates,
    currentLayout,
    config,
    isEditMode,
    isLoading,
    error,
    
    setCurrentLayout,
    setEditMode,
    createLayoutFromTemplate,
    updateLayout,
    deleteLayout,
    autoGenerateLayout,
    saveLayout,
    resetLayout,
    
    addWidget,
    updateWidget,
    removeWidget,
    moveWidget,
    
    hasEnterpriseAccess,
    canCustomize
  };
}