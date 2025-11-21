import { useState, useEffect, useCallback } from 'react';
import { TabType, TabStates, SharedAnalysisContext } from '../components/TabInterfaceController';

const TAB_STORAGE_KEY = 'churnvision-active-tab';
const TAB_STATES_STORAGE_KEY = 'churnvision-tab-states';
const SHARED_CONTEXT_STORAGE_KEY = 'churnvision-shared-context';

// Default tab states
const getDefaultTabStates = (): TabStates => ({
  dashboard: {
    filters: {
      searchTerm: '',
      selectedDepartment: '',
      selectedPosition: '',
      selectedRiskLevel: '',
      selectedStatus: 'Active'
    },
    sortConfig: {
      field: 'churnProbability',
      direction: 'desc'
    },
    selectedEmployees: []
  },
  deepAnalysis: {
    selectedAnalysisType: '',
    analysisParams: {},
    activeDataSources: [],
    currentResults: null,
    savedAnalyses: []
  }
});

const getDefaultSharedContext = (): SharedAnalysisContext => ({});

/**
 * Custom hook for managing tab state with persistence
 */
export const useTabState = (defaultTab: TabType = 'dashboard') => {
  // Initialize active tab from localStorage or default
  const [activeTab, setActiveTabState] = useState<TabType>(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);
      return (stored as TabType) || defaultTab;
    } catch {
      return defaultTab;
    }
  });

  // Initialize tab states from localStorage or defaults
  const [tabStates, setTabStates] = useState<TabStates>(() => {
    try {
      const stored = localStorage.getItem(TAB_STATES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all required properties exist
        return {
          dashboard: { ...getDefaultTabStates().dashboard, ...parsed.dashboard },
          deepAnalysis: { ...getDefaultTabStates().deepAnalysis, ...parsed.deepAnalysis }
        };
      }
    } catch {
      // Fall through to default
    }
    
    return getDefaultTabStates();
  });

  // Initialize shared context from localStorage or defaults
  const [sharedContext, setSharedContext] = useState<SharedAnalysisContext>(() => {
    try {
      const stored = localStorage.getItem(SHARED_CONTEXT_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fall through to default
    }
    
    return getDefaultSharedContext();
  });

  // Persist active tab to localStorage
  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch (error) {
      console.warn('Failed to persist active tab to localStorage:', error);
    }
  }, []);

  // Update specific tab state
  const updateTabState = useCallback(<T extends keyof TabStates>(
    tab: T,
    state: Partial<TabStates[T]>
  ) => {
    setTabStates(prev => {
      const newStates = {
        ...prev,
        [tab]: {
          ...prev[tab],
          ...state
        }
      };
      
      // Persist to localStorage
      try {
        localStorage.setItem(TAB_STATES_STORAGE_KEY, JSON.stringify(newStates));
      } catch (error) {
        console.warn('Failed to persist tab states to localStorage:', error);
      }
      
      return newStates;
    });
  }, []);

  // Update shared context
  const updateSharedContext = useCallback((context: Partial<SharedAnalysisContext>) => {
    setSharedContext(prev => {
      const newContext = {
        ...prev,
        ...context
      };
      
      // Persist to localStorage
      try {
        localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(newContext));
      } catch (error) {
        console.warn('Failed to persist shared context to localStorage:', error);
      }
      
      return newContext;
    });
  }, []);

  // Reset tab states to defaults
  const resetTabStates = useCallback(() => {
    const defaultStates = getDefaultTabStates();
    setTabStates(defaultStates);
    try {
      localStorage.setItem(TAB_STATES_STORAGE_KEY, JSON.stringify(defaultStates));
    } catch (error) {
      console.warn('Failed to persist reset tab states to localStorage:', error);
    }
  }, []);

  // Reset shared context to defaults
  const resetSharedContext = useCallback(() => {
    const defaultContext = getDefaultSharedContext();
    setSharedContext(defaultContext);
    try {
      localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(defaultContext));
    } catch (error) {
      console.warn('Failed to persist reset shared context to localStorage:', error);
    }
  }, []);

  // Clear all persisted data
  const clearPersistedData = useCallback(() => {
    try {
      localStorage.removeItem(TAB_STORAGE_KEY);
      localStorage.removeItem(TAB_STATES_STORAGE_KEY);
      localStorage.removeItem(SHARED_CONTEXT_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear persisted tab data:', error);
    }
  }, []);

  // Persist states to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(TAB_STATES_STORAGE_KEY, JSON.stringify(tabStates));
    } catch (error) {
      console.warn('Failed to persist tab states to localStorage:', error);
    }
  }, [tabStates]);

  useEffect(() => {
    try {
      localStorage.setItem(SHARED_CONTEXT_STORAGE_KEY, JSON.stringify(sharedContext));
    } catch (error) {
      console.warn('Failed to persist shared context to localStorage:', error);
    }
  }, [sharedContext]);

  return {
    // Current state
    activeTab,
    tabStates,
    sharedContext,
    
    // State updaters
    setActiveTab,
    updateTabState,
    updateSharedContext,
    
    // Utility functions
    resetTabStates,
    resetSharedContext,
    clearPersistedData,
    
    // Helper functions
    getDashboardState: () => tabStates.dashboard,
    getDeepAnalysisState: () => tabStates.deepAnalysis,
    isTabActive: (tab: TabType) => activeTab === tab
  };
};

export default useTabState;