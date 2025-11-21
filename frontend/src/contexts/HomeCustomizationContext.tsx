import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { DashboardLayout } from '../types/dashboard';

export type CustomizationMode = 'c-level' | 'd-level';

export interface HomeCustomizationState {
  // Mode management
  currentMode: CustomizationMode;
  setMode: (mode: CustomizationMode) => void;
  
  // Customization state
  isCustomizing: boolean;
  setCustomizing: (enabled: boolean) => void;
  
  // Layout management
  currentLayout: DashboardLayout | null;
  availableLayouts: DashboardLayout[];
  setCurrentLayout: (layout: DashboardLayout | null) => void;
  
  // AI integration
  aiInsights: AIInsight[];
  refreshAIInsights: () => Promise<void>;
  
  // Persistence
  saveCustomizationState: () => Promise<void>;
  resetToDefaults: () => void;
}

export interface AIInsight {
  id: string;
  type: 'workforce-trends' | 'exit-patterns' | 'risk-diagnosis' | 'retention-plan';
  title: string;
  summary: string;
  data: any;
  confidence: number;
  timestamp: Date;
  relevantEmployees?: string[];
  actionItems?: ActionItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  type: 'immediate' | 'short_term' | 'long_term';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate?: Date;
  assignee?: string;
}

interface CustomizationSettings {
  currentMode: CustomizationMode;
  layouts: {
    'c-level': DashboardLayout | null;
    'd-level': DashboardLayout | null;
  };
  preferences: {
    autoRefreshAI: boolean;
    aiInsightTypes: string[];
    defaultView: CustomizationMode;
    notifications: {
      enabled: boolean;
      highPriorityOnly: boolean;
    };
  };
  lastModified: Date;
}

const STORAGE_KEY = 'home-customization-settings';
const AI_INSIGHTS_STORAGE_KEY = 'home-ai-insights';

const defaultSettings: CustomizationSettings = {
  currentMode: 'd-level',
  layouts: {
    'c-level': null,
    'd-level': null,
  },
  preferences: {
    autoRefreshAI: true,
    aiInsightTypes: ['workforce-trends', 'risk-diagnosis', 'retention-plan'],
    defaultView: 'd-level',
    notifications: {
      enabled: true,
      highPriorityOnly: false,
    },
  },
  lastModified: new Date(),
};

const HomeCustomizationContext = createContext<HomeCustomizationState | null>(null);

export interface HomeCustomizationProviderProps {
  children: ReactNode;
}

export const HomeCustomizationProvider: React.FC<HomeCustomizationProviderProps> = ({ children }) => {
  const [currentMode, setCurrentModeState] = useState<CustomizationMode>('d-level');
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<DashboardLayout | null>(null);
  const [availableLayouts] = useState<DashboardLayout[]>([]);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  const [settings, setSettings] = useState<CustomizationSettings>(defaultSettings);

  // Load settings from localStorage on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsedSettings = JSON.parse(stored);
          // Convert date strings back to Date objects
          parsedSettings.lastModified = new Date(parsedSettings.lastModified);
          setSettings(parsedSettings);
          setCurrentModeState(parsedSettings.currentMode);
        }
      } catch (error) {
        console.error('Failed to load customization settings:', error);
        setSettings(defaultSettings);
      }
    };

    const loadAIInsights = () => {
      try {
        const stored = localStorage.getItem(AI_INSIGHTS_STORAGE_KEY);
        if (stored) {
          const parsedInsights = JSON.parse(stored);
          // Convert date strings back to Date objects
          const insights = parsedInsights.map((insight: any) => ({
            ...insight,
            timestamp: new Date(insight.timestamp),
            actionItems: insight.actionItems?.map((item: any) => ({
              ...item,
              dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
            })) || [],
          }));
          setAIInsights(insights);
        }
      } catch (error) {
        console.error('Failed to load AI insights:', error);
        setAIInsights([]);
      }
    };

    loadSettings();
    loadAIInsights();
  }, []);

  // Memoize settings update calculation
  const updatedSettings = useMemo(() => ({
    ...settings,
    currentMode,
    layouts: {
      ...settings.layouts,
      [currentMode]: currentLayout,
    },
    lastModified: new Date(),
  }), [settings, currentMode, currentLayout]);

  // Save settings to localStorage whenever they change
  const saveCustomizationState = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSettings));
      localStorage.setItem(AI_INSIGHTS_STORAGE_KEY, JSON.stringify(aiInsights));
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save customization settings:', error);
      throw new Error('Failed to save customization settings');
    }
  }, [updatedSettings, aiInsights]);

  // Auto-save when critical state changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveCustomizationState().catch(console.error);
    }, 1000); // Debounce saves by 1 second

    return () => clearTimeout(timeoutId);
  }, [currentMode, currentLayout, saveCustomizationState]);

  // Mode switching with layout preservation
  const setMode = useCallback((mode: CustomizationMode) => {
    if (mode === currentMode) return;

    // Switch to new mode and load its layout
    setCurrentModeState(mode);
    setCurrentLayout(updatedSettings.layouts[mode]);
    setSettings(updatedSettings);

    // Exit customization mode when switching modes
    setIsCustomizing(false);
  }, [currentMode, updatedSettings]);

  // Customization mode toggle
  const setCustomizing = useCallback((enabled: boolean) => {
    setIsCustomizing(enabled);
    
    // Auto-save when entering/exiting customization mode
    if (!enabled) {
      saveCustomizationState().catch(console.error);
    }
  }, [saveCustomizationState]);

  // AI insights refresh
  const refreshAIInsights = useCallback(async () => {
    try {
      // This will be implemented when AI integration is added
      // For now, we'll simulate loading insights
      const mockInsights: AIInsight[] = [
        {
          id: 'insight-1',
          type: 'workforce-trends',
          title: 'High Risk Department Identified',
          summary: 'Engineering department shows 23% higher churn risk than average',
          data: { department: 'Engineering', riskIncrease: 0.23 },
          confidence: 0.87,
          timestamp: new Date(),
          priority: 'high',
          actionItems: [
            {
              id: 'action-1',
              title: 'Schedule department review',
              description: 'Meet with engineering leadership to discuss retention strategies',
              type: 'immediate',
              priority: 'high',
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
            },
          ],
        },
      ];

      setAIInsights(mockInsights);
      await saveCustomizationState();
    } catch (error) {
      console.error('Failed to refresh AI insights:', error);
      throw new Error('Failed to refresh AI insights');
    }
  }, [saveCustomizationState]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setSettings(defaultSettings);
    setCurrentModeState(defaultSettings.currentMode);
    setCurrentLayout(null);
    setIsCustomizing(false);
    setAIInsights([]);
    
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AI_INSIGHTS_STORAGE_KEY);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: HomeCustomizationState = useMemo(() => ({
    currentMode,
    setMode,
    isCustomizing,
    setCustomizing,
    currentLayout,
    availableLayouts,
    setCurrentLayout,
    aiInsights,
    refreshAIInsights,
    saveCustomizationState,
    resetToDefaults,
  }), [currentMode, setMode, isCustomizing, setCustomizing, currentLayout, availableLayouts, setCurrentLayout, aiInsights, refreshAIInsights, saveCustomizationState, resetToDefaults]);

  return (
    <HomeCustomizationContext.Provider value={contextValue}>
      {children}
    </HomeCustomizationContext.Provider>
  );
};

export const useHomeCustomization = (): HomeCustomizationState => {
  const context = useContext(HomeCustomizationContext);
  if (!context) {
    throw new Error('useHomeCustomization must be used within a HomeCustomizationProvider');
  }
  return context;
};

export default HomeCustomizationContext;