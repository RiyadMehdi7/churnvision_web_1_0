import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, DollarSign, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { TreatmentSuggestion } from '@/types/treatment';
import { cn } from '@/lib/utils';

interface TreatmentCardProps {
    treatment: TreatmentSuggestion;
    onApply?: (treatment: TreatmentSuggestion) => void;
    isApplied?: boolean;
    className?: string;
}

export const TreatmentCard: React.FC<TreatmentCardProps> = ({
    treatment,
    onApply,
    isApplied = false,
    className,
}) => {
    return (
        <Card className={cn("p-4 border-l-4 hover:shadow-md transition-shadow",
            treatment.projected_roi === 'high' ? "border-l-emerald-500" :
                treatment.projected_roi === 'medium' ? "border-l-yellow-500" : "border-l-blue-500",
            className
        )}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{treatment.name}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{treatment.description}</p>
                </div>
                {isApplied && (
                    <span className="flex items-center text-emerald-600 text-xs font-medium bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Applied
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 my-4 text-sm">
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                    <DollarSign className="w-4 h-4 mr-2 text-gray-400" />
                    <span>Cost: ${treatment.cost.toLocaleString()}</span>
                </div>
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                    <TrendingUp className="w-4 h-4 mr-2 text-emerald-500" />
                    <span>Risk: -{(treatment.projected_churn_prob_change * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center text-gray-600 dark:text-gray-300">
                    <TrendingUp className="w-4 h-4 mr-2 text-blue-500" />
                    <span>ROI: {treatment.projected_roi.toUpperCase()}</span>
                </div>
            </div>

            {onApply && !isApplied && (
                <Button
                    onClick={() => onApply(treatment)}
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:hover:bg-blue-900/20"
                >
                    Apply Treatment
                    <ArrowRight className="w-3 h-3 ml-2" />
                </Button>
            )}
        </Card>
    );
};
