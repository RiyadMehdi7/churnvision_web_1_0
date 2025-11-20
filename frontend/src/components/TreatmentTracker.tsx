import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle,
    Clock,
    AlertTriangle,
    TrendingUp,
    DollarSign,
    Calendar,
    ChevronDown,
    ChevronUp,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApplyTreatmentResult } from '@/types/treatment';

interface TreatmentTrackerProps {
    activeTreatments: ApplyTreatmentResult[];
    onRemoveTreatment?: (id: string) => void;
}

const TreatmentTracker: React.FC<TreatmentTrackerProps> = ({
    activeTreatments,
    onRemoveTreatment
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (activeTreatments.length === 0) return null;

    const totalCost = activeTreatments.reduce((sum, t) => sum + t.cost, 0);
    const totalRiskReduction = activeTreatments.reduce((sum, t) => sum + (t.projectedRiskReduction * 100), 0);
    const avgRoi = activeTreatments.reduce((sum, t) => sum + t.roi, 0) / activeTreatments.length;

    return (
        <div className="fixed bottom-6 right-6 z-50 w-96 shadow-2xl">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Header */}
                <div
                    className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-2 text-white">
                        <div className="relative">
                            <Clock className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-blue-600"></span>
                        </div>
                        <span className="font-semibold">Active Treatments ({activeTreatments.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-blue-100 text-sm font-mono">
                            ${totalCost.toLocaleString()}
                        </span>
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-200" />
                        ) : (
                            <ChevronUp className="w-4 h-4 text-blue-200" />
                        )}
                    </div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-gray-100 dark:border-gray-700"
                        >
                            {/* Summary Metrics */}
                            <div className="grid grid-cols-3 gap-px bg-gray-100 dark:bg-gray-700">
                                <div className="bg-white dark:bg-gray-800 p-3 text-center">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Risk Impact</div>
                                    <div className="text-green-600 dark:text-green-400 font-bold text-sm flex items-center justify-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        -{totalRiskReduction.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-3 text-center">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Cost</div>
                                    <div className="text-gray-900 dark:text-gray-100 font-bold text-sm">
                                        ${totalCost.toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-3 text-center">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg ROI</div>
                                    <div className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                                        {avgRoi.toFixed(1)}x
                                    </div>
                                </div>
                            </div>

                            {/* Treatment List */}
                            <div className="max-h-64 overflow-y-auto p-2 space-y-2 bg-gray-50 dark:bg-gray-900/50">
                                {activeTreatments.map((treatment) => (
                                    <motion.div
                                        key={treatment.treatmentId}
                                        layout
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="bg-white dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm relative group"
                                    >
                                        {onRemoveTreatment && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveTreatment(treatment.treatmentId);
                                                }}
                                                className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}

                                        <div className="flex justify-between items-start mb-2 pr-6">
                                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                                                {treatment.treatmentName}
                                            </h4>
                                        </div>

                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(treatment.appliedAt).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <DollarSign className="w-3 h-3" />
                                                    {treatment.cost.toLocaleString()}
                                                </span>
                                            </div>
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                                treatment.status === 'active'
                                                    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                                                    : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800"
                                            )}>
                                                {treatment.status.toUpperCase()}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default TreatmentTracker;
