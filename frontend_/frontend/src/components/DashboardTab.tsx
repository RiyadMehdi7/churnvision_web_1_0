import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  ChevronUp,
  ChevronDown,
  FolderKanban,
  Brain
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGlobalDataCache } from '../hooks/useGlobalDataCache';
import { useProject } from '../contexts/ProjectContext';
import { Employee } from '../types/employee';
import { DataUploadWindow } from './DataUploadWindow';
import { DataUploadNotification } from './DataUploadNotification';
import { LoadingStates } from './LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { getRiskLevelForEmployee, getRiskLevelForEmployeeWithStyles, subscribeToCalibrationChanges, isCalibrating } from '../config/riskThresholds';
import { autoThresholdService } from '../services/autoThresholdService';
import { DashboardState } from './TabInterfaceController';

// Types and utilities
type SortableField = 'churnProbability' | 'full_name' | 'position' | 'structure_name' | 'status' | 'riskLevel'

// Memoized table row component
const EmployeeTableRow = memo(({
  employee,
  onReasoningClick,
  style,
  getRiskLevelForEmployee,
  getRiskLevelForEmployeeWithStyles,
  isEnhancing
}: {
  employee: Employee;
  onReasoningClick: (employee: Employee) => void;
  style?: React.CSSProperties;
  getRiskLevelForEmployee: (probability: number) => 'High' | 'Medium' | 'Low';
  getRiskLevelForEmployeeWithStyles: (probability: number) => any;
  isEnhancing: boolean;
}) => {
  // Handle potential NaN in churnProbability
  const probability = isNaN(employee.churnProbability) ? 0 : employee.churnProbability;
  
  // Block risk indicators during calibration/enhancement
  const [calibrating, setCalibrating] = useState<boolean>(isCalibrating());
  useEffect(() => {
    const unsubscribe = subscribeToCalibrationChanges((state) => setCalibrating(state));
    return () => unsubscribe();
  }, []);

  const blocked = calibrating || isEnhancing;
  const riskInfo = blocked
    ? { color: 'text-gray-600', bgColor: 'bg-gray-100', darkColor: 'dark:text-gray-300', darkBgColor: 'dark:bg-gray-800/60' }
    : getRiskLevelForEmployeeWithStyles(probability);
  const riskLevel = blocked ? 'Calibrating' : getRiskLevelForEmployee(probability);
  
  // Check if employee data seems malformed
  const hasIssues = !employee.full_name || employee.full_name.includes('Unknown') || !employee.structure_name || !employee.position;
  
  // Memoize confidence calculations for performance
  const confidence = useMemo(() => {
    return employee.reasoningConfidence 
      ? Math.round(employee.reasoningConfidence * 100) 
      : (employee.confidenceScore || 0);
  }, [employee.reasoningConfidence, employee.confidenceScore]);

  const confidenceColor = useMemo(() => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-blue-500';
    if (confidence >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  }, [confidence]);

  const handleReasoningClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    onReasoningClick(employee);
  }, [onReasoningClick, employee]);
  
  return (
    <div
      style={style}
      className={cn(
          `flex items-center border-b border-gray-100 dark:border-gray-700/80`,
          `hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasIssues ? 'bg-red-50 dark:bg-red-900/10' : ''} cursor-pointer`
      )}
      onClick={() => onReasoningClick(employee)}
    >
       <div className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 truncate w-[20%]">
         {employee.full_name || (
            <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                 Missing Name
            </span>
         )}
       </div>
       <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 truncate w-[15%]">
         {employee.structure_name || 'Unassigned'}
       </div>
       <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 truncate w-[15%]">
         {employee.position || 'Unassigned'}
       </div>
        <div className="px-6 py-3 w-[10%]">
         <span className={cn(
           'px-2.5 py-0.5 text-xs font-medium rounded-full inline-block',
           `${riskInfo.color} ${riskInfo.bgColor} ${riskInfo.darkColor} ${riskInfo.darkBgColor}`
         )}>
           {riskLevel}
         </span>
       </div>
       <div className="px-6 py-3 w-[15%]">
         <div className="flex items-center gap-2">
           <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
             {(probability * 100).toFixed(1)}%
           </div>
           <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
             <div className={`w-2 h-2 rounded-full ${confidenceColor}`}></div>
             <span className="text-xs text-blue-700 dark:text-blue-300 whitespace-nowrap font-medium">
               {confidence}% conf.
             </span>
           </div>
         </div>
       </div>
       <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 w-[10%]">
         {employee.status || 'Active'}
       </div>
       <div className="px-6 py-3 w-[15%]">
         <div className="flex items-center gap-2">
           <button
             onClick={handleReasoningClick}
             className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded transition-colors"
           >
             <Brain className="w-3 h-3" />
             Reasoning
           </button>
         </div>
       </div>
    </div>
  );
});

// Risk Bar Card Component
interface RiskBarCardProps {
  title: string;
  count: number;
  total: number;
  colorClass: string;
}

const RiskBarCard: React.FC<RiskBarCardProps> = ({ title, count, total, colorClass }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        `bg-white dark:bg-gray-800/50 p-4 rounded-lg border h-full min-h-[90px]`,
        `border-gray-200/75 dark:border-gray-700/50 shadow-xs`
      )}
    >
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</p>
      <div className="flex items-center space-x-3">
        <div className="flex-grow h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full bg-${colorClass}-500 dark:bg-${colorClass}-600`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            title={`${percentage.toFixed(1)}%`}
          />
        </div>
        <p className="text-base font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0 w-10 text-right">
          {count}
        </p>
      </div>
    </motion.div>
  );
};

// Debounce Hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface DashboardTabProps {
  dashboardState: DashboardState;
  updateDashboardState: (state: Partial<DashboardState>) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  dashboardState,
  updateDashboardState
}) => {
  const { activeProject } = useProject();
  const {
    homeEmployees,
    isLoadingHomeData,
    isEnhancingWithReasoning,
    reasoningEnhancementProgress,
    fetchHomeData,
    trainingStatus
  } = useGlobalDataCache();
  const isModelReady = trainingStatus?.status === 'complete';
  
  // Dynamic risk thresholds are available through helper functions
  
  const getRiskLevelForEmployeeForEmployee = (probability: number) => {
    return getRiskLevelForEmployee(probability);
  };
  
  const getRiskLevelForEmployeeWithStylesForEmployee = (probability: number) => {
    return getRiskLevelForEmployeeWithStyles(probability);
  };
  
  // Local state for UI interactions
  const [isUploadWindowOpen, setIsUploadWindowOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // Extract state from dashboardState prop
  const {
    searchTerm,
    selectedDepartment,
    selectedPosition,
    selectedRiskLevel,
    selectedStatus
  } = dashboardState.filters;

  const { field: sortField, direction: sortDirection } = dashboardState.sortConfig;

  // Update functions that sync with parent state
  const setSearchTerm = useCallback((value: string) => {
    updateDashboardState({
      filters: { ...dashboardState.filters, searchTerm: value }
    });
  }, [dashboardState.filters, updateDashboardState]);

  const setSelectedDepartment = useCallback((value: string) => {
    updateDashboardState({
      filters: { ...dashboardState.filters, selectedDepartment: value }
    });
  }, [dashboardState.filters, updateDashboardState]);

  const setSelectedPosition = useCallback((value: string) => {
    updateDashboardState({
      filters: { ...dashboardState.filters, selectedPosition: value }
    });
  }, [dashboardState.filters, updateDashboardState]);

  const setSelectedRiskLevel = useCallback((value: string) => {
    updateDashboardState({
      filters: { ...dashboardState.filters, selectedRiskLevel: value }
    });
  }, [dashboardState.filters, updateDashboardState]);

  const setSelectedStatus = useCallback((value: string) => {
    updateDashboardState({
      filters: { ...dashboardState.filters, selectedStatus: value }
    });
  }, [dashboardState.filters, updateDashboardState]);

  const setSortField = useCallback((field: string) => {
    updateDashboardState({
      sortConfig: { ...dashboardState.sortConfig, field }
    });
  }, [dashboardState.sortConfig, updateDashboardState]);

  const setSortDirection = useCallback((direction: 'asc' | 'desc') => {
    updateDashboardState({
      sortConfig: { ...dashboardState.sortConfig, direction }
    });
  }, [dashboardState.sortConfig, updateDashboardState]);

  // Debounced search term
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Parent ref for the virtualizer
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch and process data
  useEffect(() => {
    if (!activeProject) {
      console.log('[Dashboard Tab] No active project, skipping data initialization.');
      return;
    }
    
    const initializeData = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const isPostUpload = urlParams.get('refresh') === 'true';
        
        if (isPostUpload) {
          console.log('Post-upload refresh detected. Forcing data refresh...');
          await fetchHomeData(activeProject.dbPath, true);
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          await fetchHomeData(activeProject.dbPath, false);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };

    initializeData();
  }, [activeProject, fetchHomeData]);

  useEffect(() => {
    if (isModelReady && homeEmployees && homeEmployees.length > 0) {
      autoThresholdService.start(homeEmployees);
    } else {
      autoThresholdService.stop();
    }

    return () => {
      autoThresholdService.stop();
    };
  }, [isModelReady, homeEmployees]);
  
  // Use homeEmployees directly from the global cache
  const employees = homeEmployees || [];
  const isLoading = isLoadingHomeData;

  // Base filtered data (before dropdown filters) for cascade filtering
  const baseFilteredEmployees = useMemo(() => {
    if (!debouncedSearchTerm) return employees;
    
    const searchLower = debouncedSearchTerm.toLowerCase();
    return employees.filter(employee => {
      const fullName = employee.full_name || '';
      const structureName = employee.structure_name || '';
      const position = employee.position || '';
      
      return fullName.toLowerCase().includes(searchLower) ||
             structureName.toLowerCase().includes(searchLower) ||
             position.toLowerCase().includes(searchLower);
    });
  }, [employees, debouncedSearchTerm]);

  // Cascade filter options based on current selections
  const availableDepartments = useMemo(() => {
    let dataForDepts = baseFilteredEmployees;
    
    if (selectedPosition && selectedPosition !== 'All') {
      dataForDepts = dataForDepts.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForDepts = dataForDepts.filter(emp => {
        const riskLevel = getRiskLevelForEmployeeForEmployee(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForDepts = dataForDepts.filter(emp => (emp.status || 'Active') === selectedStatus);
    }
    
    const deptSet = new Set<string>();
    dataForDepts.forEach(emp => {
      deptSet.add(emp.structure_name || emp.department || 'Unassigned');
    });
    
    return ['All', ...Array.from(deptSet).sort()];
  }, [baseFilteredEmployees, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevelForEmployee]);

  const availablePositions = useMemo(() => {
    let dataForPositions = baseFilteredEmployees;
    
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForPositions = dataForPositions.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForPositions = dataForPositions.filter(emp => {
        const riskLevel = getRiskLevelForEmployeeForEmployee(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForPositions = dataForPositions.filter(emp => (emp.status || 'Active') === selectedStatus);
    }
    
    const posSet = new Set<string>();
    dataForPositions.forEach(emp => {
      posSet.add(emp.position || 'Unassigned');
    });
    
    return ['All', ...Array.from(posSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedRiskLevel, selectedStatus, getRiskLevelForEmployee]);

  const availableRiskLevels = useMemo(() => {
    let dataForRisk = baseFilteredEmployees;
    
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedPosition && selectedPosition !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.status || 'Active') === selectedStatus);
    }
    
    const riskSet = new Set<string>();
    dataForRisk.forEach(emp => {
      const riskLevel = getRiskLevelForEmployee(emp.churnProbability || 0);
      riskSet.add(riskLevel);
    });
    
    return ['All', ...Array.from(riskSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedStatus, getRiskLevelForEmployee]);

  const availableStatuses = useMemo(() => {
    let dataForStatus = baseFilteredEmployees;
    
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForStatus = dataForStatus.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedPosition && selectedPosition !== 'All') {
      dataForStatus = dataForStatus.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForStatus = dataForStatus.filter(emp => {
        const riskLevel = getRiskLevelForEmployeeForEmployee(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }
    
    const statusSet = new Set<string>();
    dataForStatus.forEach(emp => {
      statusSet.add(emp.status || 'Active');
    });
    
    return ['All', ...Array.from(statusSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, getRiskLevelForEmployee]);

  // Final filtered data with all filters applied
  const filteredEmployees = useMemo(() => {
    let filtered = baseFilteredEmployees;

    if (selectedDepartment && selectedDepartment !== 'All') {
      filtered = filtered.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }

    if (selectedPosition && selectedPosition !== 'All') {
      filtered = filtered.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }

    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      filtered = filtered.filter(emp => {
        const riskLevel = getRiskLevelForEmployeeForEmployee(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }

    if (selectedStatus && selectedStatus !== 'All') {
      filtered = filtered.filter(emp => (emp.status || 'Active') === selectedStatus);
    }

    return filtered;
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevelForEmployee]);

  // Derive display metrics from filtered employees
  const displayMetrics = useMemo(() => {
    const totalEmployees = filteredEmployees.length;
    if (totalEmployees === 0) {
      return {
        total_employees: 0,
        average_churn_probability: 0,
        risk_levels: { high: 0, medium: 0, low: 0 },
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0
      };
    }
    
    let churnSum = 0;
    const riskDistribution = { high: 0, medium: 0, low: 0 };
    
    for (const emp of filteredEmployees) {
      const churnProb = emp.churnProbability || 0;
      churnSum += churnProb;
      
      const riskLevel = getRiskLevelForEmployeeForEmployee(churnProb);
      if (riskLevel === 'High') riskDistribution.high++;
      else if (riskLevel === 'Medium') riskDistribution.medium++;
      else riskDistribution.low++;
    }
    
    const avgChurnProb = churnSum / totalEmployees;
    
    return {
      total_employees: totalEmployees,
      average_churn_probability: avgChurnProb,
      risk_levels: riskDistribution,
      high_risk_count: riskDistribution.high,
      medium_risk_count: riskDistribution.medium,
      low_risk_count: riskDistribution.low
    };
  }, [filteredEmployees, getRiskLevelForEmployee]);

  // Sort the filtered employees for the table
  const sortedEmployees = useMemo(() => {
    if (!filteredEmployees.length) return [];

    return [...filteredEmployees].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'full_name':
          aValue = (a.full_name || '').toLowerCase();
          bValue = (b.full_name || '').toLowerCase();
          break;
        case 'structure_name':
          aValue = (a.structure_name || a.department || '').toLowerCase();
          bValue = (b.structure_name || b.department || '').toLowerCase();
          break;
        case 'position':
          aValue = (a.position || '').toLowerCase();
          bValue = (b.position || '').toLowerCase();
          break;
        case 'churnProbability':
          aValue = a.churnProbability || 0;
          bValue = b.churnProbability || 0;
          break;
        case 'status':
          aValue = (a.status || 'Active').toLowerCase();
          bValue = (b.status || 'Active').toLowerCase();
          break;
        case 'riskLevel':
          const riskOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
          aValue = riskOrder[getRiskLevelForEmployeeForEmployee(a.churnProbability || 0)] || 0;
          bValue = riskOrder[getRiskLevelForEmployeeForEmployee(b.churnProbability || 0)] || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmployees, sortField, sortDirection, getRiskLevelForEmployee]);

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: sortedEmployees.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  // Memoized sort handler
  const handleSort = useCallback((field: SortableField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField, sortDirection, setSortField, setSortDirection]);

  const SortIcon = ({ field }: { field: SortableField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? 
      <ChevronUp key={`sort-icon-${field}-asc`} className="w-4 h-4 ml-1" /> : 
      <ChevronDown key={`sort-icon-${field}-desc`} className="w-4 h-4 ml-1" />
  }

  // Handle reasoning button click
  const navigate = useNavigate();

  const handleReasoningClick = (employee: Employee) => {
    navigate(`/reasoning/${employee.hr_code}`, { state: { employeeName: employee.full_name } });
  };

  // Check for data upload note
  useEffect(() => {
    const dataUploadNote = localStorage.getItem('dataUploadNote');
    
    if (dataUploadNote) {
      setNotificationMessage(dataUploadNote);
      setShowNotification(true);
      localStorage.removeItem('dataUploadNote');
    }
  }, []);
  
  const handleNotificationClose = useCallback(() => {
    setShowNotification(false);
  }, []);

  if (!activeProject) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900">
        <div>
          <FolderKanban className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No Project Active
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please select or create a project to view the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50 dark:bg-gray-900">
      {/* Data Upload Window */}
      {isUploadWindowOpen && (
        <DataUploadWindow
          show={isUploadWindowOpen}
          onClose={() => setIsUploadWindowOpen(false)}
          onUploadSuccess={() => {
            setTimeout(() => {
              fetchHomeData(activeProject.dbPath, true);
            }, 2000);
          }}
        />
      )}
      
      {/* Data Upload Notification */}
      <DataUploadNotification
        show={showNotification}
        message={notificationMessage}
        onClose={handleNotificationClose}
      />

      {/* Reasoning Enhancement Progress Indicator */}
      {isEnhancingWithReasoning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Enhancing data with AI reasoning...
              </span>
            </div>
            <div className="flex-1 bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${reasoningEnhancementProgress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium min-w-[3rem] text-right">
              {reasoningEnhancementProgress}%
            </span>
          </div>
        </motion.div>
      )}

      {/* Metrics Section */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}
      >
        {/* Average Churn Probability Card */}
        <motion.div
          className={cn(
            `bg-white dark:bg-gray-800/50 p-4 rounded-lg border h-full min-h-[90px]`,
            `border-gray-200/75 dark:border-gray-700/50 shadow-xs`
          )}
        >
           <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Average Churn Probability</p>
           <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
             {(displayMetrics.average_churn_probability * 100).toFixed(1)}%
           </p>
        </motion.div>
        
        {/* Risk Bar Cards */}
        <RiskBarCard 
          title="High Risk" 
          count={displayMetrics.risk_levels.high} 
          total={displayMetrics.total_employees} 
          colorClass="red" 
        />
        <RiskBarCard 
          title="Medium Risk" 
          count={displayMetrics.risk_levels.medium} 
          total={displayMetrics.total_employees} 
          colorClass="yellow" 
        />
        <RiskBarCard 
          title="Low Risk" 
          count={displayMetrics.risk_levels.low} 
          total={displayMetrics.total_employees} 
          colorClass="green" 
        />
      </motion.div>

      {/* Filter Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <div className="relative md:col-span-1 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger>
            <SelectValue placeholder={`All Departments (${availableDepartments.length - 1})`} />
          </SelectTrigger>
          <SelectContent>
            {availableDepartments.map((dep: string) => (
              <SelectItem key={dep} value={dep}>{dep}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedPosition} onValueChange={setSelectedPosition}>
           <SelectTrigger>
            <SelectValue placeholder={`All Positions (${availablePositions.length - 1})`} />
          </SelectTrigger>
          <SelectContent>
            {availablePositions.map((pos: string) => (
              <SelectItem key={pos} value={pos}>{pos}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
           <SelectTrigger>
            <SelectValue placeholder={`All Risk Levels (${availableRiskLevels.length - 1})`} />
          </SelectTrigger>
          <SelectContent>
            {availableRiskLevels.map((level: string) => (
              <SelectItem key={level} value={level}>{level}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
           <SelectTrigger>
            <SelectValue placeholder={`All Statuses (${availableStatuses.length - 1})`} />
          </SelectTrigger>
          <SelectContent>
            {availableStatuses.map((status: string) => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table Section */}
       <div ref={parentRef} className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-auto min-h-0 border border-gray-200/75 dark:border-gray-700/50 relative" style={{ maxHeight: '400px' }}>
        {isLoading || sortedEmployees.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[300px]">
            {isLoading && <LoadingStates.PageLoading text="Loading employee data..." />}
            {!isLoading && sortedEmployees.length === 0 && (
              <div className="text-center">
                <div className="text-gray-600 dark:text-gray-400 font-medium mb-2">No employees found</div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your filters or search criteria</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <table className="w-full table-fixed border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10">
                <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[20%]">
                     <div className="flex items-center" onClick={() => handleSort('full_name')}>
                       Name <SortIcon field="full_name" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                     <div className="flex items-center" onClick={() => handleSort('structure_name')}>
                       Department <SortIcon field="structure_name" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                     <div className="flex items-center" onClick={() => handleSort('position')}>
                       Position <SortIcon field="position" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[10%]">
                     <div className="flex items-center" onClick={() => handleSort('riskLevel')}>
                       Risk <SortIcon field="riskLevel" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                     <div className="flex items-center" onClick={() => handleSort('churnProbability')}>
                       Churn % <SortIcon field="churnProbability" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[10%]">
                     <div className="flex items-center" onClick={() => handleSort('status')}>
                       Status <SortIcon field="status" />
                     </div>
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-[15%]">
                     Actions
                   </th>
                </tr>
              </thead>
            </table>
            <div
               className="relative w-full"
               style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                 const employee = sortedEmployees[virtualRow.index];
                 if (!employee) return null;
                 return (
                   <EmployeeTableRow
                     key={employee.hr_code || virtualRow.index}
                     employee={employee}
                     onReasoningClick={handleReasoningClick}
                     getRiskLevelForEmployee={getRiskLevelForEmployeeForEmployee}
                     getRiskLevelForEmployeeWithStyles={getRiskLevelForEmployeeWithStylesForEmployee}
                      isEnhancing={isEnhancingWithReasoning}
                     style={{
                       position: 'absolute',
                       top: 0,
                       left: 0,
                       width: '100%',
                       height: `${virtualRow.size}px`,
                       transform: `translateY(${virtualRow.start}px)`,
                     }}
                   />
                 );
               })}
             </div>
          </>
        )}
       </div>
    </div>
  );
};

export default DashboardTab;
