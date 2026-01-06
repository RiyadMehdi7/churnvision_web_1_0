import React, { createContext, useContext, ReactNode } from 'react';
import { useTabState } from '../hooks/useTabState';
import { TabType, TabStates, SharedAnalysisContext } from '@/components/tabs/TabInterfaceController';

interface TabStateContextType {
  // Current state
  activeTab: TabType;
  tabStates: TabStates;
  sharedContext: SharedAnalysisContext;
  
  // State updaters
  setActiveTab: (tab: TabType) => void;
  updateTabState: <T extends keyof TabStates>(tab: T, state: Partial<TabStates[T]>) => void;
  updateSharedContext: (context: Partial<SharedAnalysisContext>) => void;
  
  // Utility functions
  resetTabStates: () => void;
  resetSharedContext: () => void;
  clearPersistedData: () => void;
  
  // Helper functions
  getDashboardState: () => TabStates['dashboard'];
  getDeepAnalysisState: () => TabStates['deepAnalysis'];
  isTabActive: (tab: TabType) => boolean;
}

const TabStateContext = createContext<TabStateContextType | undefined>(undefined);

interface TabStateProviderProps {
  children: ReactNode;
  defaultTab?: TabType;
}

export const TabStateProvider: React.FC<TabStateProviderProps> = ({ 
  children, 
  defaultTab = 'dashboard' 
}) => {
  const tabState = useTabState(defaultTab);

  return (
    <TabStateContext.Provider value={tabState}>
      {children}
    </TabStateContext.Provider>
  );
};

/**
 * Hook to access tab state context
 * Must be used within a TabStateProvider
 */
export const useTabStateContext = (): TabStateContextType => {
  const context = useContext(TabStateContext);
  if (context === undefined) {
    throw new Error('useTabStateContext must be used within a TabStateProvider');
  }
  return context;
};

/**
 * HOC to wrap components with TabStateProvider
 */
export const withTabState = <P extends object>(
  Component: React.ComponentType<P>,
  defaultTab?: TabType
) => {
  const WrappedComponent = (props: P) => (
    <TabStateProvider defaultTab={defaultTab}>
      <Component {...props} />
    </TabStateProvider>
  );
  
  WrappedComponent.displayName = `withTabState(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

export default TabStateContext;