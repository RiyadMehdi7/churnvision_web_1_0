import React from 'react';
import { cn } from '@/lib/utils';

interface MetricPillProps {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    className?: string;
}

export const MetricPill: React.FC<MetricPillProps> = ({
    label,
    value,
    icon,
    trend,
    trendValue,
    className,
}) => {
    return (
        <div className={cn(
            "flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm",
            className
        )}>
            {icon && (
                <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                    {icon}
                </div>
            )}
            <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
                    {trend && trendValue && (
                        <span className={cn(
                            "text-xs font-medium",
                            trend === 'up' ? "text-emerald-600" :
                                trend === 'down' ? "text-red-600" : "text-gray-500"
                        )}>
                            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
