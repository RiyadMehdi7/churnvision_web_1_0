/**
 * Balanced Scorecard Component
 *
 * Displays the three key metrics for employee retention decisions:
 * - ELTV (Employee Lifetime Value)
 * - Risk Level
 * - ROI (Return on Investment)
 *
 * This provides at-a-glance business value visibility.
 *
 * Design aligned with ChurnVision design system (ROIDashboardTab pattern).
 */

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BalancedScorecardProps {
  // Current state
  currentChurnProbability: number;
  currentELTV: number;

  // Projected state (after treatment)
  projectedChurnProbability?: number;
  projectedELTV?: number;

  // Treatment details
  treatmentCost?: number;
  projectedROI?: number;

  // Display options
  showProjected?: boolean;
  compact?: boolean;
  className?: string;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getRiskLevel(churnProbability: number): {
  level: 'High' | 'Medium' | 'Low';
  textColor: string;
  bgColor: string;
  darkTextColor: string;
  darkBgColor: string;
} {
  if (churnProbability >= 0.7) {
    return {
      level: 'High',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
      darkTextColor: 'dark:text-red-400',
      darkBgColor: 'dark:bg-red-900/20',
    };
  }
  if (churnProbability >= 0.4) {
    return {
      level: 'Medium',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      darkTextColor: 'dark:text-amber-400',
      darkBgColor: 'dark:bg-amber-900/20',
    };
  }
  return {
    level: 'Low',
    textColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    darkTextColor: 'dark:text-emerald-400',
    darkBgColor: 'dark:bg-emerald-900/20',
  };
}

function getROICategory(roi: number): {
  label: string;
  textColor: string;
  darkTextColor: string;
} {
  if (roi >= 100) return { label: 'Excellent', textColor: 'text-emerald-600', darkTextColor: 'dark:text-emerald-400' };
  if (roi >= 50) return { label: 'Good', textColor: 'text-emerald-600', darkTextColor: 'dark:text-emerald-400' };
  if (roi >= 0) return { label: 'Marginal', textColor: 'text-amber-600', darkTextColor: 'dark:text-amber-400' };
  return { label: 'Negative', textColor: 'text-red-600', darkTextColor: 'dark:text-red-400' };
}

// MetricCard component following ROIDashboardTab pattern
const MetricCard: React.FC<{
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'info';
  children?: React.ReactNode;
  delay?: number;
}> = ({ label, value, subtext, icon, trend, trendValue, variant = 'default', children, delay = 0 }) => {
  const variantStyles = {
    default: 'text-gray-600 dark:text-gray-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400'
  };

  const iconBgStyles = {
    default: 'bg-gray-100 dark:bg-gray-700',
    danger: 'bg-red-50 dark:bg-red-900/20',
    success: 'bg-emerald-50 dark:bg-emerald-900/20',
    warning: 'bg-amber-50 dark:bg-amber-900/20',
    info: 'bg-blue-50 dark:bg-blue-900/20'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
          <p className={cn("text-2xl font-bold", variantStyles[variant])}>
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtext}</p>
          )}
          {trend && trendValue && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend === 'up' ? "text-emerald-600 dark:text-emerald-400" :
              trend === 'down' ? "text-red-600 dark:text-red-400" : "text-gray-500"
            )}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
               trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
              {trendValue}
            </div>
          )}
          {children}
        </div>
        <div className={cn("p-2.5 rounded-lg", iconBgStyles[variant])}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
};

export function BalancedScorecard({
  currentChurnProbability,
  currentELTV,
  projectedChurnProbability,
  projectedELTV,
  treatmentCost,
  projectedROI,
  showProjected = true,
  compact = false,
  className,
}: BalancedScorecardProps) {
  const currentRisk = getRiskLevel(currentChurnProbability);
  const projectedRisk = projectedChurnProbability !== undefined
    ? getRiskLevel(projectedChurnProbability)
    : null;

  const eltvDelta = projectedELTV !== undefined ? projectedELTV - currentELTV : 0;
  const riskDelta = projectedChurnProbability !== undefined
    ? projectedChurnProbability - currentChurnProbability
    : 0;

  const roiCategory = projectedROI !== undefined ? getROICategory(projectedROI) : null;

  if (compact) {
    // Compact horizontal layout
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700',
          className
        )}
      >
        {/* Risk */}
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", currentRisk.bgColor, currentRisk.darkBgColor)}>
            <AlertTriangle className={cn('w-4 h-4', currentRisk.textColor, currentRisk.darkTextColor)} />
          </div>
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Risk</span>
            <div className="flex items-center gap-1">
              <span className={cn('text-sm font-semibold', currentRisk.textColor, currentRisk.darkTextColor)}>
                {currentRisk.level}
              </span>
              {showProjected && projectedRisk && projectedRisk.level !== currentRisk.level && (
                <>
                  <span className="text-gray-400 dark:text-gray-500">→</span>
                  <span className={cn('text-sm font-semibold', projectedRisk.textColor, projectedRisk.darkTextColor)}>
                    {projectedRisk.level}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ELTV */}
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-4">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400">ELTV</span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(currentELTV)}
              </span>
              {showProjected && eltvDelta !== 0 && (
                <span className={cn(
                  'text-xs font-medium',
                  eltvDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {eltvDelta > 0 ? '+' : ''}{formatCurrency(eltvDelta)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ROI */}
        {showProjected && projectedROI !== undefined && (
          <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-4">
            <div className={cn(
              "p-1.5 rounded-lg",
              roiCategory && projectedROI >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"
            )}>
              <Activity className={cn(
                'w-4 h-4',
                roiCategory?.textColor,
                roiCategory?.darkTextColor
              )} />
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">ROI</span>
              <span className={cn('text-sm font-semibold block', roiCategory?.textColor, roiCategory?.darkTextColor)}>
                {projectedROI.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // Full card layout - matches ROIDashboardTab MetricCard pattern
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
      {/* Risk Card */}
      <MetricCard
        label="Churn Risk"
        value={currentRisk.level}
        subtext={`${formatPercentage(currentChurnProbability)} probability`}
        icon={<AlertTriangle className={cn('w-5 h-5', currentRisk.textColor, currentRisk.darkTextColor)} />}
        variant={currentRisk.level === 'High' ? 'danger' : currentRisk.level === 'Medium' ? 'warning' : 'success'}
        trend={showProjected && riskDelta !== 0 ? (riskDelta < 0 ? 'up' : 'down') : undefined}
        trendValue={showProjected && riskDelta !== 0 ? `${riskDelta < 0 ? '' : '+'}${formatPercentage(riskDelta)}` : undefined}
        delay={0}
      >
        {showProjected && projectedRisk && riskDelta !== 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Projected:</span>
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              projectedRisk.bgColor,
              projectedRisk.darkBgColor,
              projectedRisk.textColor,
              projectedRisk.darkTextColor
            )}>
              {projectedRisk.level}
            </span>
          </div>
        )}
      </MetricCard>

      {/* ELTV Card */}
      <MetricCard
        label="Employee Lifetime Value"
        value={formatCurrency(currentELTV)}
        subtext="Current value"
        icon={<DollarSign className="w-5 h-5 text-blue-500" />}
        variant="info"
        trend={showProjected && eltvDelta !== 0 ? (eltvDelta > 0 ? 'up' : 'down') : undefined}
        trendValue={showProjected && eltvDelta !== 0 ? `${eltvDelta > 0 ? '+' : ''}${formatCurrency(eltvDelta)}` : undefined}
        delay={1}
      >
        {showProjected && eltvDelta !== 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Projected: {formatCurrency(projectedELTV || currentELTV)}
          </p>
        )}
      </MetricCard>

      {/* ROI Card */}
      <MetricCard
        label="Treatment ROI"
        value={showProjected && projectedROI !== undefined ? `${projectedROI.toFixed(0)}%` : '—'}
        subtext={roiCategory?.label || 'Select a treatment'}
        icon={<Activity className={cn(
          'w-5 h-5',
          roiCategory ? (projectedROI! >= 0 ? 'text-emerald-500' : 'text-red-500') : 'text-gray-400'
        )} />}
        variant={roiCategory ? (projectedROI! >= 50 ? 'success' : projectedROI! >= 0 ? 'warning' : 'danger') : 'default'}
        delay={2}
      >
        {showProjected && projectedROI !== undefined && treatmentCost !== undefined && (
          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex justify-between">
              <span>Cost:</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(treatmentCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Gain:</span>
              <span className={cn(
                "font-medium",
                eltvDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {eltvDelta >= 0 ? '+' : ''}{formatCurrency(eltvDelta)}
              </span>
            </div>
          </div>
        )}
      </MetricCard>
    </div>
  );
}

export default BalancedScorecard;
