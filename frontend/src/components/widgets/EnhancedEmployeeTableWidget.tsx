import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter,
  ChevronUp,
  ChevronDown,
  Users,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  Eye,
  BarChart3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
// import { standardizePrompt } from '../../utils/promptStandardizer'; // Unused

interface EnhancedEmployeeTableWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  className?: string;
}

type SortableField = 'full_name' | 'structure_name' | 'position' | 'churnProbability' | 'status' | 'riskLevel';
type FilterField = 'department' | 'position' | 'riskLevel' | 'status';

interface FilterState {
  department: string;
  position: string;
  riskLevel: string;
  status: string;
  searchTerm: string;
}

// interface EmployeeAction {
//   id: string;
//   label: string;
//   icon: React.ElementType;
//   color: string;
//   action: (employee: Employee) => void;
// }

export const EnhancedEmployeeTableWidget: React.FC<EnhancedEmployeeTableWidgetProps> = ({
  widget,
  employees,
  className
}) => {
  const { getRiskLevel, getRiskLevelWithStyles, thresholds } = useCurrentRiskThresholds();
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);

  // State management
  const [filters, setFilters] = useState<FilterState>({
    department: 'all',
    position: 'all',
    riskLevel: 'all',
    status: 'all',
    searchTerm: ''
  });
  const [sortField, setSortField] = useState<SortableField>('churnProbability');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter options derived from employee data
  const filterOptions = useMemo(() => {
    const departments = Array.from(new Set(employees.map(emp => emp.structure_name || emp.department || 'Unassigned')));
    const positions = Array.from(new Set(employees.map(emp => emp.position || 'Unassigned')));
    const statuses = Array.from(new Set(employees.map(emp => emp.status || 'Active')));
    const riskLevels = ['High', 'Medium', 'Low'];

    return {
      departments: ['all', ...departments.sort()],
      positions: ['all', ...positions.sort()],
      statuses: ['all', ...statuses.sort()],
      riskLevels: ['all', ...riskLevels]
    };
  }, [employees]);

  // Filtered and sorted employees
  const processedEmployees = useMemo(() => {
    let filtered = employees.filter(employee => {
      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesSearch = 
          (employee.full_name || '').toLowerCase().includes(searchLower) ||
          (employee.structure_name || '').toLowerCase().includes(searchLower) ||
          (employee.position || '').toLowerCase().includes(searchLower) ||
          (employee.hr_code || '').toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Department filter
      if (filters.department !== 'all') {
        const empDept = employee.structure_name || employee.department || 'Unassigned';
        if (empDept !== filters.department) return false;
      }

      // Position filter
      if (filters.position !== 'all') {
        const empPos = employee.position || 'Unassigned';
        if (empPos !== filters.position) return false;
      }

      // Risk level filter
      if (filters.riskLevel !== 'all') {
        const riskLevel = getRiskLevel(employee.churnProbability || 0);
        if (riskLevel !== filters.riskLevel) return false;
      }

      // Status filter
      if (filters.status !== 'all') {
        const empStatus = employee.status || 'Active';
        if (empStatus !== filters.status) return false;
      }

      return true;
    });

    // Sort filtered employees
    return filtered.sort((a, b) => {
      let aValue: string | number, bValue: string | number;

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
  }, [employees, filters, sortField, sortDirection, getRiskLevel]);

  // Simplified metrics calculation - less complex to improve performance
  const realMetrics = useMemo(() => {
    if (processedEmployees.length === 0) {
      return {
        totalEmployees: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        averageRisk: 0,
        riskTrend: 'stable'
      };
    }

    // Lightweight calculation for better performance
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;
    let totalRisk = 0;
    
    for (const emp of processedEmployees) {
      const churnProb = emp.churnProbability || 0;
      const riskLevel = getRiskLevel(churnProb);
      
      // Simple risk counting
      if (riskLevel === 'High') highRiskCount++;
      else if (riskLevel === 'Medium') mediumRiskCount++;
      else lowRiskCount++;
      
      totalRisk += churnProb;
    }
    
    const totalEmployees = processedEmployees.length;
    const averageRisk = totalRisk / totalEmployees;
    const riskTrend = averageRisk > thresholds.highRisk ? 'increasing' : averageRisk > thresholds.mediumRisk ? 'stable' : 'decreasing';
    
    return {
      totalEmployees,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      averageRisk,
      riskTrend
    };
  }, [processedEmployees, getRiskLevel]);

  // Optimized virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: processedEmployees.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Reduced row height for better performance
    overscan: 3, // Reduced overscan for better performance
  });

  // Employee actions
  // Employee actions for future use
  // const employeeActions: EmployeeAction[] = [
  //   {
  //     id: 'view-reasoning',
  //     label: 'View AI Reasoning',
  //     icon: Brain,
  //     color: 'text-purple-600 hover:text-purple-700',
  //     action: (employee) => {
  //       navigate(`/reasoning/${employee.hr_code}`, { 
  //         state: { employeeName: employee.full_name } 
  //       });
  //     }
  //   },
  //   {
  //     id: 'create-plan',
  //     label: 'Create Retention Plan',
  //     icon: CheckCircle,
  //     color: 'text-green-600 hover:text-green-700',
  //     action: (employee) => {
  //       const standardized = standardizePrompt('retention', employee.full_name);
  //       const params = new URLSearchParams();
  //       params.set('prompt', standardized.prompt);
  //       params.set('employees', employee.employee_id);
  //       navigate(`/ai-assistant?${params.toString()}`);
  //     }
  //   },
  //   {
  //     id: 'analyze-risk',
  //     label: 'Analyze Risk Factors',
  //     icon: AlertTriangle,
  //     color: 'text-orange-600 hover:text-orange-700',
  //     action: (employee) => {
  //       const standardized = standardizePrompt('diagnose', employee.full_name);
  //       const params = new URLSearchParams();
  //       params.set('prompt', standardized.prompt);
  //       params.set('employees', employee.employee_id);
  //       navigate(`/ai-assistant?${params.toString()}`);
  //     }
  //   }
  // ];

  // Event handlers
  const handleSort = useCallback((field: SortableField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleFilterChange = useCallback((field: FilterField, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, searchTerm: value }));
  }, []);

  const handleEmployeeSelect = useCallback((employeeId: string, selected: boolean) => {
    setSelectedEmployees(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(employeeId);
      } else {
        newSet.delete(employeeId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedEmployees.size === processedEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(processedEmployees.map(emp => emp.employee_id)));
    }
  }, [selectedEmployees.size, processedEmployees]);

  const clearFilters = useCallback(() => {
    setFilters({
      department: 'all',
      position: 'all',
      riskLevel: 'all',
      status: 'all',
      searchTerm: ''
    });
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
  }, []);

  const SortIcon = ({ field }: { field: SortableField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 ml-1" /> : 
      <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const getConfidenceColor = (employee: Employee) => {
    const confidence = employee.reasoningConfidence 
      ? Math.round(employee.reasoningConfidence * 100) 
      : (employee.confidenceScore || 0);
    
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-blue-500';
    if (confidence >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceValue = (employee: Employee) => {
    const confidence = employee.reasoningConfidence 
      ? Math.round(employee.reasoningConfidence * 100) 
      : (employee.confidenceScore || 0);
    
    return confidence;
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
              <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                {processedEmployees.length} of {employees.length}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> 80%+</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> 60–79%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-full"></span> 40–59%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full"></span> &lt;40%</span>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  showFilters 
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                )}
              >
                <Filter className="h-4 w-4" />
              </button>
              <button
                onClick={refreshData}
                disabled={isLoading}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trust & Traceability Banner */}
      <div className="px-6 py-2 text-xs bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
        Predictions include a confidence indicator. Low confidence may reflect limited data or heuristic fallback; check dataset recency in Data Management.
      </div>

      <div className="p-6">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search employees by name, department, position, or HR code..."
              value={filters.searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter Controls */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Department
                </label>
                <select
                  value={filters.department}
                  onChange={(e) => handleFilterChange('department', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {filterOptions.departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Position
                </label>
                <select
                  value={filters.position}
                  onChange={(e) => handleFilterChange('position', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {filterOptions.positions.map(pos => (
                    <option key={pos} value={pos}>
                      {pos === 'all' ? 'All Positions' : pos}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Risk Level
                </label>
                <select
                  value={filters.riskLevel}
                  onChange={(e) => handleFilterChange('riskLevel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {filterOptions.riskLevels.map(risk => (
                    <option key={risk} value={risk}>
                      {risk === 'all' ? 'All Risk Levels' : risk}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {filterOptions.statuses.map(status => (
                    <option key={status} value={status}>
                      {status === 'all' ? 'All Statuses' : status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Super Sexy Metrics Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 grid grid-cols-2 lg:grid-cols-6 gap-4"
        >
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total</p>
                <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{realMetrics.totalEmployees}</p>
              </div>
              <Users className="h-6 w-6 text-blue-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-4 border border-red-200 dark:border-red-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">High Risk</p>
                <p className="text-xl font-bold text-red-900 dark:text-red-100">{realMetrics.highRiskCount}</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {realMetrics.totalEmployees > 0 ? ((realMetrics.highRiskCount / realMetrics.totalEmployees) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Avg Risk</p>
                <p className="text-xl font-bold text-orange-900 dark:text-orange-100">{(realMetrics.averageRisk * 100).toFixed(1)}%</p>
              </div>
              <Target className="h-6 w-6 text-orange-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Financial Impact</p>
                <p className="text-xl font-bold text-purple-900 dark:text-purple-100">N/A</p>
              </div>
              <DollarSign className="h-6 w-6 text-purple-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-4 border border-green-200 dark:border-green-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Avg Tenure</p>
                <p className="text-xl font-bold text-green-900 dark:text-green-100">N/A</p>
              </div>
              <Clock className="h-6 w-6 text-green-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Risk Trend</p>
                <p className="text-xl font-bold text-indigo-900 dark:text-indigo-100 capitalize">{realMetrics.riskTrend}</p>
              </div>
              {realMetrics.riskTrend === 'increasing' ? (
                <TrendingUp className="h-6 w-6 text-red-500" />
              ) : realMetrics.riskTrend === 'decreasing' ? (
                <TrendingDown className="h-6 w-6 text-green-500" />
              ) : (
                <Activity className="h-6 w-6 text-gray-500" />
              )}
            </div>
          </div>
        </motion.div>

        {/* Top Departments Summary */}
        {false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Departments</h4>
              <BarChart3 className="h-5 w-5 text-gray-500" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[].map((dept: any) => (
                <div key={dept.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      dept.avgRisk > thresholds.highRisk ? "bg-red-500" : dept.avgRisk > thresholds.mediumRisk ? "bg-orange-500" : "bg-green-500"
                    )} />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{dept.name}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{dept.count} employees</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "text-sm font-bold",
                      dept.avgRisk > thresholds.highRisk ? "text-red-600 dark:text-red-400" :
                      dept.avgRisk > thresholds.mediumRisk ? "text-orange-600 dark:text-orange-400" :
                      "text-green-600 dark:text-green-400"
                    )}>
                      {(dept.avgRisk * 100).toFixed(1)}%
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">avg risk</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

    {/* Bulk Actions */}
        {selectedEmployees.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800 dark:text-blue-200">
                {selectedEmployees.size} employee{selectedEmployees.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                  Bulk Actions
                </button>
                <button 
                  onClick={() => setSelectedEmployees(new Set())}
                  className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Employee Table */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center px-6 py-3">
              <div className="w-8 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedEmployees.size === processedEmployees.length && processedEmployees.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('full_name')}
                  className="col-span-3 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Name
                  <SortIcon field="full_name" />
                </button>
                <button
                  onClick={() => handleSort('structure_name')}
                  className="col-span-2 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Department
                  <SortIcon field="structure_name" />
                </button>
                <button
                  onClick={() => handleSort('position')}
                  className="col-span-2 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Position
                  <SortIcon field="position" />
                </button>
                <button
                  onClick={() => handleSort('riskLevel')}
                  className="col-span-1 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Risk
                  <SortIcon field="riskLevel" />
                </button>
                <button
                  onClick={() => handleSort('churnProbability')}
                  className="col-span-2 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Probability
                  <SortIcon field="churnProbability" />
                </button>
                <button
                  onClick={() => handleSort('status')}
                  className="col-span-1 flex items-center text-left hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Status
                  <SortIcon field="status" />
                </button>
                <div className="col-span-1 text-center">
                  Actions
                </div>
              </div>
            </div>
          </div>

          {/* Table Body */}
          <div
            ref={parentRef}
            className="h-96 overflow-auto"
            style={{ contain: 'strict' }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const employee = processedEmployees[virtualItem.index];
                const probability = isNaN(employee.churnProbability) ? 0 : employee.churnProbability;
                const riskInfo = getRiskLevelWithStyles(probability);
                const riskLevel = getRiskLevel(probability);
                const isSelected = selectedEmployees.has(employee.employee_id);

                return (
                  <div
                    key={employee.employee_id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className={cn(
                      "flex items-center px-4 py-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50",
                      isSelected && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                    <div className="w-8 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleEmployeeSelect(employee.employee_id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {employee.full_name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {employee.hr_code}
                        </div>
                      </div>
                      <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400">
                        {employee.structure_name || employee.department || 'Unassigned'}
                      </div>
                      <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400">
                        {employee.position || 'Unassigned'}
                      </div>
                      <div className="col-span-1">
                        <span className={cn(
                          'px-2 py-1 text-xs font-medium rounded-full',
                          `${riskInfo.color} ${riskInfo.bgColor} ${riskInfo.darkColor} ${riskInfo.darkBgColor}`
                        )}>
                          {riskLevel}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                            {(probability * 100).toFixed(1)}%
                          </span>
                          <div className="flex items-center space-x-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                            <div className={`w-2 h-2 rounded-full ${getConfidenceColor(employee)}`}></div>
                            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                              {getConfidenceValue(employee)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-1 text-sm text-gray-600 dark:text-gray-400">
                        {employee.status || 'Active'}
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <button 
                          onClick={() => navigate('/playground', { state: { hrCode: employee.hr_code } })}
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty State */}
        {processedEmployees.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              No employees found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {employees.length === 0 
                ? "No employee data available" 
                : "Try adjusting your search or filter criteria"
              }
            </p>
            {employees.length > 0 && (
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
