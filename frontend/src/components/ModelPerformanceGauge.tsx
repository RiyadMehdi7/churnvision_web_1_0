import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ModelPerformanceGaugeProps {
    value: number;
    label: string;
    color?: 'blue' | 'green' | 'purple' | 'orange';
}

export const ModelPerformanceGauge: React.FC<ModelPerformanceGaugeProps> = ({
    value,
    label,
    color = 'blue'
}) => {
    // Clamp value between 0 and 100
    const clampedValue = Math.min(Math.max(value, 0), 100);

    // Calculate circumference for SVG circle
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

    const colorClasses = {
        blue: 'text-blue-500 stroke-blue-500',
        green: 'text-green-500 stroke-green-500',
        purple: 'text-purple-500 stroke-purple-500',
        orange: 'text-orange-500 stroke-orange-500'
    };

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-24 h-24">
                {/* Background Circle */}
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="48"
                        cy="48"
                        r={radius}
                        className="stroke-gray-200 dark:stroke-gray-700 fill-none"
                        strokeWidth="8"
                    />
                    {/* Progress Circle */}
                    <motion.circle
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        cx="48"
                        cy="48"
                        r={radius}
                        className={cn("fill-none", colorClasses[color])}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeLinecap="round"
                    />
                </svg>

                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn("text-xl font-bold", colorClasses[color].split(' ')[0])}>
                        {clampedValue}%
                    </span>
                </div>
            </div>
            <span className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                {label}
            </span>
        </div>
    );
};
