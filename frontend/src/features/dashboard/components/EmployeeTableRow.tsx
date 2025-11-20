import React, { memo, useMemo, useCallback } from 'react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Employee } from '@/types/employee';

interface EmployeeTableRowProps {
    employee: Employee;
    onReasoningClick: (employee: Employee) => void;
    style?: React.CSSProperties;
    getRiskLevel: (probability: number) => 'High' | 'Medium' | 'Low';
    getRiskLevelWithStyles: (probability: number) => any;
}

export const EmployeeTableRow = memo(({
    employee,
    onReasoningClick,
    style,
    getRiskLevel,
    getRiskLevelWithStyles
}: EmployeeTableRowProps) => {
    // Handle potential NaN in churnProbability
    const probability = isNaN(employee.churnProbability) ? 0 : employee.churnProbability;

    // Get risk level and styling from dynamic thresholds
    const riskInfo = getRiskLevelWithStyles(probability);
    const riskLevel = getRiskLevel(probability);

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
                `hover:bg-white dark:hover:bg-gray-800 hover:shadow-sm hover:z-10 relative transition-all duration-200`,
                `${hasIssues ? 'bg-red-50 dark:bg-red-900/10' : ''} cursor-pointer`
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 dark:text-purple-300 rounded-md transition-all duration-200 border border-purple-200 dark:border-purple-800 hover:shadow-sm"
                    >
                        <Brain className="w-3.5 h-3.5" />
                        Reasoning
                    </button>
                </div>
            </div>
        </div>
    );
});
