import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

interface RiskIndicatorProps {
    riskScore: number;
    size?: 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    className?: string;
    showLabel?: boolean;
}

export const RiskIndicator: React.FC<RiskIndicatorProps> = ({
    riskScore,
    size = 'md',
    showIcon = true,
    className,
    showLabel = true,
}) => {
    let colorClass = 'text-green-600 bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
    let icon = <CheckCircle className={cn("w-4 h-4", size === 'lg' && "w-5 h-5", size === 'sm' && "w-3 h-3")} />;
    let label = 'Low Risk';

    if (riskScore > 0.7) {
        colorClass = 'text-red-600 bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
        icon = <AlertTriangle className={cn("w-4 h-4", size === 'lg' && "w-5 h-5", size === 'sm' && "w-3 h-3")} />;
        label = 'High Risk';
    } else if (riskScore > 0.4) {
        colorClass = 'text-yellow-600 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
        icon = <AlertCircle className={cn("w-4 h-4", size === 'lg' && "w-5 h-5", size === 'sm' && "w-3 h-3")} />;
        label = 'Medium Risk';
    }

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-sm',
        lg: 'px-3 py-1.5 text-base',
    };

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border font-medium',
                colorClass,
                sizeClasses[size],
                className
            )}
        >
            {showIcon && icon}
            {showLabel && <span>{label}</span>}
        </div>
    );
};
