/**
 * Executive Summary Card Component
 *
 * Hero card for the ROI Dashboard that provides C-Suite executives
 * with an immediate "headline" view of portfolio risk and recovery potential.
 *
 * Design: Modern gradient card with key metrics and narrative text.
 * Follows Figma/Linear style with premium feel.
 */

import { motion } from 'framer-motion';
import {
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExecutiveSummaryCardProps {
  /** Total employees in the portfolio */
  totalEmployees: number;
  /** Number of high-risk employees */
  highRiskCount: number;
  /** Number of medium-risk employees */
  mediumRiskCount: number;
  /** Total ELTV at risk (dollar value) */
  totalEltvAtRisk: number;
  /** Potential recovery with treatments */
  recoveryPotential: number;
  /** Aggregate ROI percentage */
  aggregateRoi: number;
  /** Average churn probability across portfolio (0-1) */
  avgChurnProbability: number;
  /** Number of treatments already applied */
  treatmentsApplied: number;
  /** Additional CSS classes */
  className?: string;
}

// Utility functions
function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function ExecutiveSummaryCard({
  totalEmployees,
  highRiskCount,
  mediumRiskCount,
  totalEltvAtRisk,
  recoveryPotential,
  aggregateRoi,
  avgChurnProbability,
  treatmentsApplied,
  className,
}: ExecutiveSummaryCardProps) {
  const atRiskEmployees = highRiskCount + mediumRiskCount;
  const riskPercentage = totalEmployees > 0 ? (atRiskEmployees / totalEmployees) * 100 : 0;

  // Determine overall health status for color theming
  const healthStatus = highRiskCount > totalEmployees * 0.1
    ? 'critical'
    : highRiskCount > totalEmployees * 0.05
      ? 'warning'
      : 'healthy';

  const statusColors = {
    critical: {
      gradient: 'from-red-50 via-amber-50 to-blue-50 dark:from-red-900/20 dark:via-amber-900/20 dark:to-blue-900/20',
      border: 'border-red-200 dark:border-red-800/50',
      accent: 'from-red-500 to-amber-500',
    },
    warning: {
      gradient: 'from-amber-50 via-blue-50 to-emerald-50 dark:from-amber-900/20 dark:via-blue-900/20 dark:to-emerald-900/20',
      border: 'border-amber-200 dark:border-amber-800/50',
      accent: 'from-amber-500 to-blue-500',
    },
    healthy: {
      gradient: 'from-emerald-50 via-blue-50 to-purple-50 dark:from-emerald-900/20 dark:via-blue-900/20 dark:to-purple-900/20',
      border: 'border-emerald-200 dark:border-emerald-800/50',
      accent: 'from-emerald-500 to-blue-500',
    },
  };

  const colors = statusColors[healthStatus];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'bg-gradient-to-br rounded-2xl border-2 overflow-hidden',
        colors.gradient,
        colors.border,
        className
      )}
    >
      {/* Main content */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Left: Narrative section */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-white/60 dark:bg-gray-800/60">
                <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Portfolio Impact Summary
              </span>
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {formatCurrency(recoveryPotential)}{' '}
              <span className="text-xl lg:text-2xl font-normal text-gray-600 dark:text-gray-400">
                at stake
              </span>
            </h2>

            <p className="text-sm lg:text-base text-gray-700 dark:text-gray-300 leading-relaxed max-w-2xl mb-5">
              Targeted retention interventions could recover{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(recoveryPotential)}
              </span>{' '}
              in employee lifetime value across{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {highRiskCount} high-risk
              </span>{' '}
              employees, yielding a projected{' '}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {formatPercentage(aggregateRoi)} ROI
              </span>
              .
            </p>

            {/* Quick stats row */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {highRiskCount} at risk
                </span>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatPercentage(aggregateRoi)} ROI
                </span>
              </div>

              {treatmentsApplied > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                  <DollarSign className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {treatmentsApplied} treated
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Visual summary */}
          <div className="flex flex-col items-center lg:items-end gap-4">
            {/* ROI Circle */}
            <div
              className={cn(
                'w-28 h-28 lg:w-32 lg:h-32 rounded-full bg-gradient-to-br flex flex-col items-center justify-center text-white shadow-xl',
                colors.accent
              )}
            >
              <span className="text-2xl lg:text-3xl font-bold">
                {formatPercentage(aggregateRoi)}
              </span>
              <span className="text-xs font-medium opacity-90">Projected ROI</span>
            </div>

            {/* Value flow indicator */}
            <div className="flex items-center gap-2 text-sm">
              <div className="text-right">
                <p className="font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(totalEltvAtRisk)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">At Risk</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <div className="text-left">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(recoveryPotential)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Recoverable</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom metrics bar */}
      <div className="px-6 py-4 bg-white/40 dark:bg-gray-800/40 border-t border-gray-200/50 dark:border-gray-700/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Total Workforce
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {totalEmployees.toLocaleString()}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                High Risk
              </span>
            </div>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">
              {highRiskCount}
              <span className="text-sm font-normal text-gray-500 ml-1">
                ({riskPercentage.toFixed(1)}%)
              </span>
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Avg Churn Probability
              </span>
            </div>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {formatPercentage(avgChurnProbability * 100)}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Cost of Inaction
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(totalEltvAtRisk * 0.3)}
              <span className="text-sm font-normal text-gray-500 ml-1">/yr</span>
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default ExecutiveSummaryCard;
