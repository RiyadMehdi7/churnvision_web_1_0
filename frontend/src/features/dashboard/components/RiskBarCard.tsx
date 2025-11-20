import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RiskBarCardProps {
    title: string;
    count: number;
    total: number;
    colorClass: string;
}

export const RiskBarCard: React.FC<RiskBarCardProps> = ({ title, count, total, colorClass }) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={cn(
                `bg-white dark:bg-gray-800/40 p-4 rounded-xl border h-full min-h-[90px] backdrop-blur-sm`,
                `border-gray-200/75 dark:border-gray-700/50 shadow-sm`,
                `hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300`,
                `group relative overflow-hidden`
            )}
        >
            <div className={`absolute inset-0 bg-gradient-to-br from-${colorClass}-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
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
