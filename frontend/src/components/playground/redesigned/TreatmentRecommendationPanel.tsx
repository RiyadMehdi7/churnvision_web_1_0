/**
 * Treatment Recommendation Panel Component
 *
 * AI-first treatment selection interface that prominently displays
 * the recommended action with clear metrics, while allowing access
 * to alternative treatments through a collapsible section.
 *
 * Design follows modern dashboard patterns (Figma/Linear style)
 * with gradient hero cards and clear visual hierarchy.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Bot,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Target,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreatmentSuggestion } from '@/types/treatment';

interface TreatmentRecommendationPanelProps {
  /** All available treatments for the selected employee */
  treatments: TreatmentSuggestion[];
  /** Currently selected treatment (if any) */
  selectedTreatment: TreatmentSuggestion | null;
  /** Callback when user selects a treatment to simulate */
  onSelectTreatment: (treatment: TreatmentSuggestion) => void;
  /** Whether treatment is currently being simulated */
  isLoading: boolean;
  /** Use performance mode (RVI instead of ELTV) */
  isPerformanceMode: boolean;
  /** Employee's annual salary for cost percentage calculation */
  employeeSalary: number;
  /** Budget filter percentage (if any) */
  budgetFilter: number | null;
}

// Utility functions
function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCostPercentage(cost: number, salary: number): string {
  if (!salary || salary <= 0) return '0%';
  return `${((cost / salary) * 100).toFixed(0)}% of salary`;
}

function getROIColor(roi: string | undefined): { text: string; bg: string } {
  switch (roi) {
    case 'high':
      return {
        text: 'text-emerald-700 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      };
    case 'medium':
      return {
        text: 'text-amber-700 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-900/20',
      };
    default:
      return {
        text: 'text-gray-600 dark:text-gray-400',
        bg: 'bg-gray-100 dark:bg-gray-700',
      };
  }
}

/**
 * Calculate the recommended treatment based on multiple factors
 */
function calculateRecommendedTreatment(
  treatments: TreatmentSuggestion[]
): TreatmentSuggestion | null {
  if (!treatments.length) return null;

  // Filter to treatments with positive impact (negative churn change = good)
  const effectiveTreatments = treatments.filter(
    (t) => t.projected_churn_prob_change < 0
  );

  if (!effectiveTreatments.length) return treatments[0];

  // Score each treatment
  const scored = effectiveTreatments.map((t) => {
    const roiScore =
      t.projected_roi === 'high' ? 3 : t.projected_roi === 'medium' ? 2 : 1;
    const impactScore = Math.abs(t.projected_churn_prob_change) * 10;
    const costEfficiency = 1 / Math.max(t.cost || 100, 100); // Avoid division by zero and handle undefined

    return {
      treatment: t,
      score: roiScore * 2.5 + impactScore * 3 + costEfficiency * 0.3,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].treatment;
}

// Alternative treatment card component
const AlternativeTreatmentCard = ({
  treatment,
  isSelected,
  onSelect,
  employeeSalary,
  isPerformanceMode,
}: {
  treatment: TreatmentSuggestion;
  isSelected: boolean;
  onSelect: () => void;
  employeeSalary: number;
  isPerformanceMode: boolean;
}) => {
  const roiColors = getROIColor(treatment.projected_roi);
  const churnChange = treatment.projected_churn_prob_change;
  const isPositiveImpact = churnChange < 0;

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'w-full p-4 rounded-xl border text-left transition-all duration-200',
        isSelected
          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-1 ring-blue-500'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
              {treatment.name}
            </h4>
            {treatment.llm_generated && (
              <Bot className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {treatment.description}
          </p>

          {/* Metrics row */}
          <div className="flex items-center gap-3 mt-3">
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
                isPositiveImpact
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              )}
            >
              {isPositiveImpact ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <TrendingUp className="w-3 h-3" />
              )}
              {churnChange < 0 ? '' : '+'}
              {Math.abs(churnChange * 100).toFixed(0)}%
            </div>

            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isPerformanceMode
                ? formatCostPercentage(treatment.cost, employeeSalary)
                : formatCurrency(treatment.cost)}
            </span>

            <span
              className={cn('ml-auto text-xs font-medium px-2 py-0.5 rounded', roiColors.bg, roiColors.text)}
            >
              {treatment.projected_roi?.charAt(0).toUpperCase()}
              {treatment.projected_roi?.slice(1)} ROI
            </span>
          </div>
        </div>

        {isSelected && (
          <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
        )}
      </div>
    </motion.button>
  );
};

export function TreatmentRecommendationPanel({
  treatments,
  selectedTreatment,
  onSelectTreatment,
  isLoading,
  isPerformanceMode,
  employeeSalary,
  budgetFilter,
}: TreatmentRecommendationPanelProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  // Filter treatments by budget if set
  const filteredTreatments = useMemo(() => {
    if (!treatments.length) return [];
    if (budgetFilter === null) return treatments;

    return treatments.filter((t) => {
      if (!employeeSalary || employeeSalary <= 0) return true;
      const costPercent = (t.cost / employeeSalary) * 100;
      return costPercent <= budgetFilter;
    });
  }, [treatments, budgetFilter, employeeSalary]);

  // Calculate recommended treatment
  const recommendedTreatment = useMemo(
    () => calculateRecommendedTreatment(filteredTreatments),
    [filteredTreatments]
  );

  // Get alternatives (excluding recommended)
  const alternatives = useMemo(
    () =>
      filteredTreatments.filter((t) => t.id !== recommendedTreatment?.id),
    [filteredTreatments, recommendedTreatment]
  );

  // Empty state
  if (!filteredTreatments.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
          <Info className="w-6 h-6 text-amber-500" />
        </div>
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
          No treatments available
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          {budgetFilter !== null
            ? 'Try increasing your budget filter to see more treatment options.'
            : 'No treatments are currently configured for this employee profile.'}
        </p>
      </div>
    );
  }

  if (!recommendedTreatment) return null;

  const hasAIReasoning =
    recommendedTreatment.ai_reasoning || recommendedTreatment.llm_generated;
  const roiColors = getROIColor(recommendedTreatment.projected_roi);
  const isRecommendedSelected = selectedTreatment?.id === recommendedTreatment.id;

  return (
    <div className="space-y-4">
      {/* Recommended Treatment Hero Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-emerald-50 via-blue-50 to-purple-50 dark:from-emerald-900/20 dark:via-blue-900/20 dark:to-purple-900/20 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 overflow-hidden"
      >
        {/* Badge header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white" />
          <span className="text-xs font-bold text-white uppercase tracking-wide">
            Recommended Action
          </span>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {recommendedTreatment.name}
                </h3>
                {hasAIReasoning && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <Bot className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                      AI
                    </span>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {recommendedTreatment.description}
              </p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Risk Reduction */}
            <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Risk Reduction
                </span>
              </div>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {Math.abs(
                  recommendedTreatment.projected_churn_prob_change * 100
                ).toFixed(0)}
                %
              </p>
            </div>

            {/* Cost */}
            <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Cost
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {isPerformanceMode
                  ? formatCostPercentage(
                      recommendedTreatment.cost,
                      employeeSalary
                    ).replace(' of salary', '')
                  : formatCurrency(recommendedTreatment.cost)}
              </p>
            </div>

            {/* ROI */}
            <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Target className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ROI
                </span>
              </div>
              <p
                className={cn(
                  'text-lg font-bold',
                  recommendedTreatment.projected_roi === 'high'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : recommendedTreatment.projected_roi === 'medium'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-600 dark:text-gray-400'
                )}
              >
                {recommendedTreatment.projected_roi?.charAt(0).toUpperCase()}
                {recommendedTreatment.projected_roi?.slice(1)}
              </p>
            </div>
          </div>

          {/* Time to Effect */}
          {recommendedTreatment.timeToEffect && (
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Expected effect in {recommendedTreatment.timeToEffect}</span>
            </div>
          )}

          {/* AI Reasoning */}
          {hasAIReasoning && recommendedTreatment.ai_reasoning && (
            <div className="bg-purple-50/70 dark:bg-purple-900/20 rounded-lg p-3 mb-4 border border-purple-100 dark:border-purple-800/50">
              <div className="flex items-start gap-2">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-purple-900 dark:text-purple-300 mb-1">
                    AI Analysis
                  </p>
                  <p className="text-xs text-purple-800 dark:text-purple-400 leading-relaxed">
                    {recommendedTreatment.ai_reasoning}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={() => onSelectTreatment(recommendedTreatment)}
            disabled={isLoading}
            className={cn(
              'w-full py-3.5 font-semibold rounded-lg transition-all flex items-center justify-center gap-2',
              isRecommendedSelected
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white',
              isLoading && 'opacity-60 cursor-wait'
            )}
          >
            {isLoading && isRecommendedSelected ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Simulating...
              </>
            ) : isRecommendedSelected ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Selected
              </>
            ) : (
              <>
                Simulate This Treatment
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Alternative Treatments */}
      {alternatives.length > 0 && (
        <div>
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {alternatives.length} alternative treatment
                {alternatives.length > 1 ? 's' : ''}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({filteredTreatments.length} total)
              </span>
            </div>
            {showAlternatives ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <AnimatePresence>
            {showAlternatives && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {alternatives.map((treatment) => (
                    <AlternativeTreatmentCard
                      key={treatment.id}
                      treatment={treatment}
                      isSelected={selectedTreatment?.id === treatment.id}
                      onSelect={() => onSelectTreatment(treatment)}
                      employeeSalary={employeeSalary}
                      isPerformanceMode={isPerformanceMode}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default TreatmentRecommendationPanel;
