import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    Search,
    ChevronUp,
    ChevronDown,
    FolderKanban,
    Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { useProject } from '@/contexts/ProjectContext';
import { Employee } from '@/types/employee';
import { DataUploadWindow } from '@/components/DataUploadWindow';
import { DataUploadNotification } from '@/components/DataUploadNotification';
import { LoadingStates } from '@/components/LoadingSpinner';
import { AnalysisResultVisualization } from '@/components/AnalysisResultVisualization';
import EmployeeNetworkGraph from '@/components/EmployeeNetworkGraph';
import { ModelTrainingRequired } from '@/components/ModelTrainingRequired';
import { TrainingReminderBanner } from '@/components/TrainingReminderBanner';
import { useDebounce } from '@/hooks/useDebounce';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { getCurrentThresholds, getDynamicRiskLevel, getDynamicRiskLevelWithStyles, subscribeToThresholdChanges } from '@/config/riskThresholds';
import { autoThresholdService } from '@/services/autoThresholdService';
import {
    analyzeChurnPatternsLocal,
    analyzeEngagementCorrelationLocal,
    generateOrganizationalInsightsLocal,
    runCrossAnalysisLocal,
    runGeneralAnalysisLocal
} from '@/features/dashboard/dashboardUtils';

import { RiskBarCard } from '@/features/dashboard/components/RiskBarCard';
import { EmployeeTableRow } from '@/features/dashboard/components/EmployeeTableRow';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';

export const Route = createFileRoute('/')({
    component: Dashboard,
})

type SortableField = 'churnProbability' | 'full_name' | 'position' | 'structure_name' | 'status' | 'riskLevel';

function Dashboard() {
    const { activeProject } = useProject();
    const {
        homeEmployees,
        isLoadingHomeData,
        isEnhancingWithReasoning,
        reasoningEnhancementProgress,
        fetchHomeData,
        trainingStatus
    } = useGlobalDataCache();

    // Use centralized dynamic risk threshold functions
    const getRiskLevel = getDynamicRiskLevel;
    const getRiskLevelWithStyles = getDynamicRiskLevelWithStyles;
    const [thresholdVersion, setThresholdVersion] = useState(0);

    // Tab state management
    const [activeTab, setActiveTab] = useState<'dashboard' | 'deep-analysis' | 'network'>('dashboard');

    // Wrapper function to prevent access to insights tab
    const setActiveTabSafe = (tab: 'dashboard' | 'deep-analysis' | 'network') => {
        setActiveTab(tab);
    };

    // Deep Analysis state
    const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>('');
    const [analysisParams, setAnalysisParams] = useState({
        departmentFilter: 'all-departments',
        timePeriod: 'last-12-months',
        riskLevel: 'all-risk-levels',
        employeeGroup: 'all-employees'
    });
    const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
    const [analysisResults, setAnalysisResults] = useState<any>(null);

    // State management
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('Active');
    const [sortField, setSortField] = useState<SortableField>('churnProbability');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        const unsubscribe = subscribeToThresholdChanges(() => {
            setThresholdVersion((prev) => prev + 1);
        });

        return () => {
            unsubscribe();
        };
    }, []);
    const [isUploadWindowOpen, setIsUploadWindowOpen] = useState(false);
    const [error] = useState<string | null>(null);
    const [showNotification, setShowNotification] = useState(false);
    const [notificationMessage, setNotificationMessage] = useState('');

    // Debounced search term
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // Parent ref for the virtualizer
    const parentRef = useRef<HTMLDivElement>(null);
    const hasReasoningData = useMemo(
        () =>
            (homeEmployees || []).some(
                emp => emp?.hasReasoningData || typeof emp?.reasoningChurnRisk === 'number'
            ),
        [homeEmployees]
    );
    const isModelReady = trainingStatus?.status === 'complete' || hasReasoningData;

    // Fetch and process data
    useEffect(() => {
        if (!activeProject) {
            return;
        }

        const initializeData = async () => {
            try {
                // Check if this is a refresh after an upload by checking the URL
                const urlParams = new URLSearchParams(window.location.search);
                const isPostUpload = urlParams.get('refresh') === 'true';

                if (isPostUpload) {
                    // Force a complete refresh of the data
                    await fetchHomeData(activeProject.dbPath, true);

                    // Clear the URL parameter after using it
                    window.history.replaceState({}, document.title, window.location.pathname);
                } else {
                    // Normal initialization - fetch data if it's not already in the cache
                    await fetchHomeData(activeProject.dbPath, false);
                }

            } catch (err) {
                // Error loading data - logged silently in production
            }
        };

        initializeData();
    }, [activeProject, fetchHomeData]);

    // Use homeEmployees directly from the global cache
    const employees = homeEmployees || [];
    const isLoading = isLoadingHomeData;
    const hasChurnReasoningData = useMemo(() =>
        employees.some(emp =>
            typeof (emp as any)?.churnProbability === 'number' ||
            typeof (emp as any)?.reasoningChurnRisk === 'number' ||
            (emp as any)?.hasReasoningData
        )
        , [employees]);

    // Base filtered data (before dropdown filters) for cascade filtering
    const baseFilteredEmployees = useMemo(() => {
        if (!debouncedSearchTerm) return employees;

        // Apply search filter only
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

        // Apply other active filters except department
        if (selectedPosition && selectedPosition !== 'All') {
            dataForDepts = dataForDepts.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
        }
        if (selectedRiskLevel && selectedRiskLevel !== 'All') {
            dataForDepts = dataForDepts.filter(emp => {
                const riskLevel = getRiskLevel(emp.churnProbability || 0);
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
    }, [baseFilteredEmployees, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

    const availablePositions = useMemo(() => {
        let dataForPositions = baseFilteredEmployees;

        // Apply other active filters except position
        if (selectedDepartment && selectedDepartment !== 'All') {
            dataForPositions = dataForPositions.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
        }
        if (selectedRiskLevel && selectedRiskLevel !== 'All') {
            dataForPositions = dataForPositions.filter(emp => {
                const riskLevel = getRiskLevel(emp.churnProbability || 0);
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
    }, [baseFilteredEmployees, selectedDepartment, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

    const availableRiskLevels = useMemo(() => {
        let dataForRisk = baseFilteredEmployees;

        // Apply other active filters except risk level
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
            const riskLevel = getRiskLevel(emp.churnProbability || 0);
            riskSet.add(riskLevel);
        });

        return ['All', ...Array.from(riskSet).sort()];
    }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedStatus, getRiskLevel, thresholdVersion]);

    const availableStatuses = useMemo(() => {
        let dataForStatus = baseFilteredEmployees;

        // Apply other active filters except status
        if (selectedDepartment && selectedDepartment !== 'All') {
            dataForStatus = dataForStatus.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
        }
        if (selectedPosition && selectedPosition !== 'All') {
            dataForStatus = dataForStatus.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
        }
        if (selectedRiskLevel && selectedRiskLevel !== 'All') {
            dataForStatus = dataForStatus.filter(emp => {
                const riskLevel = getRiskLevel(emp.churnProbability || 0);
                return riskLevel === selectedRiskLevel;
            });
        }

        const statusSet = new Set<string>();
        dataForStatus.forEach(emp => {
            statusSet.add(emp.status || 'Active');
        });

        return ['All', ...Array.from(statusSet).sort()];
    }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, getRiskLevel, thresholdVersion]);

    // Final filtered data with all filters applied
    const filteredEmployees = useMemo(() => {
        let filtered = baseFilteredEmployees;

        // Apply dropdown filters
        if (selectedDepartment && selectedDepartment !== 'All') {
            filtered = filtered.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
        }

        if (selectedPosition && selectedPosition !== 'All') {
            filtered = filtered.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
        }

        if (selectedRiskLevel && selectedRiskLevel !== 'All') {
            filtered = filtered.filter(emp => {
                const riskLevel = getRiskLevel(emp.churnProbability || 0);
                return riskLevel === selectedRiskLevel;
            });
        }

        if (selectedStatus && selectedStatus !== 'All') {
            filtered = filtered.filter(emp => (emp.status || 'Active') === selectedStatus);
        }

        return filtered;
    }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

    // Derive display metrics from filtered employees - OPTIMIZED
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

        // Calculate all metrics in a single pass for better performance
        let churnSum = 0;
        const riskDistribution = { high: 0, medium: 0, low: 0 };

        for (const emp of filteredEmployees) {
            const churnProb = emp.churnProbability || 0;
            churnSum += churnProb;

            // Calculate risk level once and increment counter
            const riskLevel = getRiskLevel(churnProb);
            if (riskLevel === 'High') riskDistribution.high++;
            else if (riskLevel === 'Medium') riskDistribution.medium++;
            else riskDistribution.low++;
        }

        const avgChurnProb = churnSum / totalEmployees;

        return {
            total_employees: totalEmployees,
            average_churn_probability: avgChurnProb,
            risk_levels: riskDistribution,
            // Keep the old properties for backward compatibility
            high_risk_count: riskDistribution.high,
            medium_risk_count: riskDistribution.medium,
            low_risk_count: riskDistribution.low
        };
    }, [filteredEmployees.length, filteredEmployees, thresholdVersion]);

    // Step 3: Sort the filtered employees for the table
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
                    const riskOrder: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
                    aValue = riskOrder[getRiskLevel(a.churnProbability || 0)] || 0;
                    bValue = riskOrder[getRiskLevel(b.churnProbability || 0)] || 0;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredEmployees, sortField, sortDirection, thresholdVersion]);

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
            setSortDirection(prevDirection => prevDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
        }
    }, [sortField]);

    const SortIcon = ({ field }: { field: SortableField }) => {
        if (sortField !== field) return null
        return sortDirection === 'asc' ?
            <ChevronUp key={`sort-icon-${field}-asc`} className="w-4 h-4 ml-1" /> :
            <ChevronDown key={`sort-icon-${field}-desc`} className="w-4 h-4 ml-1" />
    }

    // Handle reasoning button click
    const navigate = useNavigate();

    const handleReasoningClick = (employee: Employee) => {
        navigate({ to: `/reasoning/${employee.hr_code}`, state: { employeeName: employee.full_name } } as any);
    };

    // Immediately remove training indicator if it exists
    useEffect(() => {
        // Remove any existing training indicator
        const existingIndicator = document.getElementById('model-training-indicator');
        if (existingIndicator && existingIndicator.parentNode) {
            existingIndicator.parentNode.removeChild(existingIndicator);
        }

        // Clear training status in localStorage
        localStorage.removeItem('modelTrainingInProgress');
        localStorage.removeItem('modelTrainingStartTime');
    }, []);

    // Check for data upload note - now using React state
    useEffect(() => {
        const dataUploadNote = localStorage.getItem('dataUploadNote');

        if (dataUploadNote) {
            setNotificationMessage(dataUploadNote);
            setShowNotification(true);

            // Clean up localStorage when showing notification
            localStorage.removeItem('dataUploadNote');
        }
    }, []);

    const handleNotificationClose = useCallback(() => {
        setShowNotification(false);
    }, []);

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

    if (!activeProject) {
        return (
            <div
                className="h-full w-full flex items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900"
                style={{
                    minHeight: '400px',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f9fafb', // Neutral light gray
                    border: '1px solid #e5e7eb', // Neutral border
                }}
            >
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

    if (!isModelReady) {
        return <ModelTrainingRequired status={trainingStatus?.status} message={trainingStatus?.message} />;
    }

    return (
        <div className="h-full flex flex-col p-6 space-y-6 bg-gray-50 dark:bg-gray-900 overflow-hidden">

            {/* Data Upload Notification */}
            <DataUploadNotification
                show={showNotification}
                onClose={handleNotificationClose}
            />

            <div className="mb-6">
                <DashboardHeader />
            </div>

            <div className="mb-6">
                <TrainingReminderBanner />
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg mb-6">
                <div className="flex space-x-6 px-6">
                    <button
                        onClick={() => setActiveTabSafe('dashboard')}
                        className={cn(
                            'relative py-2 px-1 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                            activeTab === 'dashboard'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                    >
                        <span className="font-semibold">Dashboard</span>

                        {/* Active tab indicator */}
                        {activeTab === 'dashboard' && (
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

                    <button
                        onClick={() => setActiveTabSafe('deep-analysis')}
                        className={cn(
                            'relative py-2 px-1 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                            activeTab === 'deep-analysis'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                    >
                        <span className="font-semibold">Deep Analysis</span>
                        {activeTab === 'deep-analysis' && (
                            <motion.div
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                                layoutId="activeTabIndicator"
                            />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTabSafe('network')}
                        className={cn(
                            'relative py-2 px-1 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                            activeTab === 'network'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                    >
                        <span className="font-semibold">Network Graph</span>
                        {activeTab === 'network' && (
                            <motion.div
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                                layoutId="activeTabIndicator"
                            />
                        )}
                    </button>
                </div>
            </div>

            {/* Dashboard Tab Content */}
            {
                activeTab === 'dashboard' && (
                    <>
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
                                    <SelectValue placeholder="Active" />
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
                            {isLoading || error || sortedEmployees.length === 0 ? (
                                <div className="flex items-center justify-center h-full min-h-[300px]">
                                    {isLoading && <LoadingStates.PageLoading text="Loading employee data..." />}
                                    {error && (
                                        <div className="text-center">
                                            <div className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading data</div>
                                            <p className="text-gray-500 dark:text-gray-400 text-sm">{error}</p>
                                        </div>
                                    )}
                                    {!isLoading && !error && sortedEmployees.length === 0 && (
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
                                                    getRiskLevel={getRiskLevel}
                                                    getRiskLevelWithStyles={getRiskLevelWithStyles}
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
                    </>
                )
            }

            {
                activeTab === 'network' && (
                    <div className="space-y-6">
                        <EmployeeNetworkGraph
                            employees={filteredEmployees}
                            availableDepartments={availableDepartments}
                            isLoading={isLoading}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Only employees with at least two shared connections (2+ links) are displayed; relationship strength uses
                            optional columns when present (e.g. age, work_location, remote_preference) and any missing values are
                            ignored.
                        </p>
                    </div>
                )
            }

            {/* Deep Analysis Tab Content */}
            {
                activeTab === 'deep-analysis' && (
                    <div className="space-y-6">
                        {/* Analysis Type Selector */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Analysis Type</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelectedAnalysisType('churn-patterns')}
                                    className={cn(
                                        "p-4 border-2 rounded-lg transition-colors text-left",
                                        selectedAnalysisType === 'churn-patterns'
                                            ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                                            : "border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400"
                                    )}
                                >
                                    <div className="flex items-center mb-3">
                                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mr-3">
                                            <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100">Churn Pattern Analysis</h4>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Analyze churn reasoning data to identify patterns and risk factors across your organization.
                                    </p>
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 transition-colors text-left opacity-50 cursor-not-allowed"
                                >
                                    <div className="flex items-center mb-3">
                                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mr-3">
                                            <ChevronUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100">Engagement Correlation</h4>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Correlate engagement survey data with churn risk to identify satisfaction drivers.
                                    </p>
                                    <div className="mt-2">
                                        <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                                            Requires engagement data
                                        </span>
                                    </div>
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors text-left opacity-50 cursor-not-allowed"
                                >
                                    <div className="flex items-center mb-3">
                                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mr-3">
                                            <ChevronDown className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100">Cross-Source Analysis</h4>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Comprehensive analysis combining churn, engagement, and interview data sources.
                                    </p>
                                    <div className="mt-2">
                                        <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                                            Requires multiple data sources
                                        </span>
                                    </div>
                                </motion.button>
                            </div>
                        </div>

                        {/* Data Source Status */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Available Data Sources</h3>
                            <div className="space-y-3">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                        hasChurnReasoningData
                                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                            : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                                    )}
                                >
                                    <div className="flex items-center">
                                        <div
                                            className={cn(
                                                "w-2 h-2 rounded-full mr-3",
                                                hasChurnReasoningData ? "bg-green-500" : "bg-gray-400"
                                            )}
                                        ></div>
                                        <span className="font-medium text-gray-900 dark:text-gray-100">Churn Reasoning Data</span>
                                    </div>
                                    <span
                                        className={cn(
                                            "text-sm",
                                            hasChurnReasoningData
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-gray-500 dark:text-gray-400"
                                        )}
                                    >
                                        {hasChurnReasoningData ? 'Available' : 'Not available'}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full mr-3"></div>
                                        <span className="font-medium text-gray-900 dark:text-gray-100">Engagement Survey Data</span>
                                    </div>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Not uploaded</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="flex items-center">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full mr-3"></div>
                                        <span className="font-medium text-gray-900 dark:text-gray-100">Interview Data</span>
                                    </div>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Not uploaded</span>
                                </div>
                            </div>

                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                    <strong>💡 Tip:</strong> Upload engagement survey data in the Data Management section to unlock advanced correlation analysis capabilities.
                                </p>
                            </div>
                        </div>

                        {/* Analysis Configuration */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Analysis Configuration</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Department Filter
                                    </label>
                                    <Select
                                        value={analysisParams.departmentFilter}
                                        onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, departmentFilter: value }))}
                                        disabled={!selectedAnalysisType}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All Departments" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all-departments">All Departments</SelectItem>
                                            {availableDepartments.filter(dept => dept !== 'All').map((dept) => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Time Period
                                    </label>
                                    <Select
                                        value={analysisParams.timePeriod}
                                        onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, timePeriod: value }))}
                                        disabled={!selectedAnalysisType}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Last 12 months" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="last-3-months">Last 3 months</SelectItem>
                                            <SelectItem value="last-6-months">Last 6 months</SelectItem>
                                            <SelectItem value="last-12-months">Last 12 months</SelectItem>
                                            <SelectItem value="last-24-months">Last 24 months</SelectItem>
                                            <SelectItem value="all-time">All time</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Risk Level
                                    </label>
                                    <Select
                                        value={analysisParams.riskLevel}
                                        onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, riskLevel: value }))}
                                        disabled={!selectedAnalysisType}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All Risk Levels" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all-risk-levels">All Risk Levels</SelectItem>
                                            <SelectItem value="High">High Risk</SelectItem>
                                            <SelectItem value="Medium">Medium Risk</SelectItem>
                                            <SelectItem value="Low">Low Risk</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Employee Group
                                    </label>
                                    <Select
                                        value={analysisParams.employeeGroup}
                                        onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, employeeGroup: value }))}
                                        disabled={!selectedAnalysisType}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All Employees" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all-employees">All Employees</SelectItem>
                                            <SelectItem value="new-hires">New Hires (&lt; 1 year)</SelectItem>
                                            <SelectItem value="experienced">Experienced (1-5 years)</SelectItem>
                                            <SelectItem value="senior">Senior (&gt; 5 years)</SelectItem>
                                            <SelectItem value="high-performers">High Performers</SelectItem>
                                            <SelectItem value="at-risk">At Risk Employees</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-between items-center">
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedAnalysisType ? (
                                        `Ready to analyze ${selectedAnalysisType.replace('-', ' ')} with current filters`
                                    ) : (
                                        'Select an analysis type to configure parameters'
                                    )}
                                </div>
                                <button
                                    disabled={!selectedAnalysisType || isAnalysisRunning}
                                    onClick={async () => {
                                        if (!selectedAnalysisType) return;

                                        setIsAnalysisRunning(true);
                                        try {
                                            // Get current thresholds for analysis
                                            const thresholds = getCurrentThresholds();

                                            // Filter employees based on analysis parameters
                                            let analysisData = filteredEmployees;

                                            // Apply additional filters based on analysis parameters
                                            if (analysisParams.departmentFilter && analysisParams.departmentFilter !== 'all-departments') {
                                                analysisData = analysisData.filter(emp =>
                                                    (emp.structure_name || emp.department || 'Unassigned') === analysisParams.departmentFilter
                                                );
                                            }

                                            if (analysisParams.riskLevel && analysisParams.riskLevel !== 'all-risk-levels') {
                                                analysisData = analysisData.filter(emp => {
                                                    const riskLevel = getRiskLevel(emp.churnProbability || 0);
                                                    return riskLevel === analysisParams.riskLevel;
                                                });
                                            }

                                            if (analysisParams.employeeGroup && analysisParams.employeeGroup !== 'all-employees') {
                                                // Filter based on employee group (tenure, performance, etc.)
                                                analysisData = analysisData.filter(emp => {
                                                    switch (analysisParams.employeeGroup) {
                                                        case 'new-hires':
                                                            // Assuming we have hire date or tenure data
                                                            return (emp.tenure_years || 0) < 1;
                                                        case 'experienced':
                                                            return (emp.tenure_years || 0) >= 1 && (emp.tenure_years || 0) <= 5;
                                                        case 'senior':
                                                            return (emp.tenure_years || 0) > 5;
                                                        case 'high-performers':
                                                            // Assuming we have performance data
                                                            return (emp.performance || '0').includes('4') || (emp.performance || '0').includes('5');
                                                        case 'at-risk':
                                                            return (emp.churnProbability || 0) >= thresholds.highRisk;
                                                        default:
                                                            return true;
                                                    }
                                                });
                                            }

                                            // Use local reasoning service for analysis
                                            let result;
                                            switch (selectedAnalysisType) {
                                                case 'churn-patterns':
                                                    result = await analyzeChurnPatternsLocal(analysisData, thresholds);
                                                    break;
                                                case 'engagement-correlation':
                                                    result = await analyzeEngagementCorrelationLocal(analysisData);
                                                    break;
                                                case 'organizational-insights':
                                                    result = await generateOrganizationalInsightsLocal(analysisData, availableDepartments, displayMetrics);
                                                    break;
                                                case 'cross-source':
                                                    result = await runCrossAnalysisLocal(analysisData);
                                                    break;
                                                default:
                                                    result = await runGeneralAnalysisLocal(selectedAnalysisType, analysisData);
                                            }

                                            setAnalysisResults(result);
                                        } catch (error) {
                                            // Analysis failed - logged silently in production
                                            // Show user-friendly error
                                            setAnalysisResults({
                                                id: 'error',
                                                type: selectedAnalysisType as any,
                                                title: 'Analysis Failed',
                                                summary: `Failed to complete ${selectedAnalysisType.replace('-', ' ')} analysis. ${error instanceof Error ? error.message : 'Unknown error occurred.'}`,
                                                insights: [],
                                                visualizations: [],
                                                recommendations: [],
                                                confidence: 0,
                                                timestamp: new Date(),
                                                dataSources: [],
                                                parameters: analysisParams,
                                                executionTime: 0
                                            });
                                        } finally {
                                            setIsAnalysisRunning(false);
                                        }
                                    }}
                                    className={cn(
                                        "px-6 py-2 rounded-lg font-medium transition-all flex items-center space-x-2",
                                        selectedAnalysisType && !isAnalysisRunning
                                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                                            : "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed"
                                    )}
                                >
                                    {isAnalysisRunning ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            <span>Running Analysis...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Brain className="w-4 h-4" />
                                            <span>Run Analysis</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Analysis Results Section */}
                        {analysisResults && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Analysis Results</h3>
                                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <span>Confidence: {(analysisResults.confidence * 100).toFixed(0)}%</span>
                                        <span>•</span>
                                        <span>{analysisResults.timestamp.toLocaleString()}</span>
                                    </div>
                                </div>
                                <AnalysisResultVisualization
                                    data={analysisResults}
                                    type={analysisResults.type}
                                />
                            </div>
                        )}

                    </div>
                )
            }
        </div>
    )
}

