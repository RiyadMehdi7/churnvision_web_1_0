import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTabState } from '@/hooks/useTabState';

// Types for tab management
export type TabType = 'dashboard' | 'deep-analysis';

export interface DashboardState {
  filters: {
    searchTerm: string;
    selectedDepartment: string;
    selectedPosition: string;
    selectedRiskLevel: string;
    selectedStatus: string;
  };
  sortConfig: {
    field: string;
    direction: 'asc' | 'desc';
  };
  selectedEmployees: string[];
}

export interface DeepAnalysisState {
  selectedAnalysisType: string;
  analysisParams: Record<string, any>;
  activeDataSources: string[];
  currentResults: any | null;
  savedAnalyses: any[];
}

export interface TabStates {
  dashboard: DashboardState;
  deepAnalysis: DeepAnalysisState;
}

export interface SharedAnalysisContext {
  selectedEmployeeIds?: string[];
  dateRange?: { start: Date; end: Date };
  departmentFilter?: string;
}

interface TabInterfaceControllerProps {
  children: (props: {
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;
    tabStates: TabStates;
    updateTabState: <T extends keyof TabStates>(tab: T, state: Partial<TabStates[T]>) => void;
    sharedContext: SharedAnalysisContext;
    updateSharedContext: (context: Partial<SharedAnalysisContext>) => void;
  }) => React.ReactNode;
  defaultTab?: TabType;
  className?: string;
}

// Storage keys for tab state management
// const TAB_STORAGE_KEY = 'churnvision-active-tab';
// const TAB_STATES_STORAGE_KEY = 'churnvision-tab-states';
// const SHARED_CONTEXT_STORAGE_KEY = 'churnvision-shared-context';

export const TabInterfaceController: React.FC<TabInterfaceControllerProps> = ({
  children,
  defaultTab = 'dashboard',
  className
}) => {
  // Use the custom hook for tab state management
  const {
    activeTab,
    tabStates,
    sharedContext,
    setActiveTab,
    updateTabState,
    updateSharedContext
  } = useTabState(defaultTab);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex space-x-8 px-6">
          <TabButton
            isActive={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            label="Dashboard"
            description="Real-time employee monitoring"
          />
          <TabButton
            isActive={activeTab === 'deep-analysis'}
            onClick={() => setActiveTab('deep-analysis')}
            label="Deep Analysis"
            description="AI-powered organizational insights"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {children({
          activeTab,
          setActiveTab,
          tabStates,
          updateTabState,
          sharedContext,
          updateSharedContext
        })}
      </div>
    </div>
  );
};

// Tab Button Component
interface TabButtonProps {
  isActive: boolean;
  onClick: () => void;
  label: string;
  description: string;
}

const TabButton: React.FC<TabButtonProps> = ({ isActive, onClick, label, description }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative py-4 px-1 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        isActive
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      )}
    >
      <div className="flex flex-col items-center space-y-1">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{description}</span>
      </div>
      
      {/* Active tab indicator */}
      {isActive && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
          layoutId="activeTabIndicator"
          initial={false}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
        />
      )}
    </button>
  );
};

export default TabInterfaceController;