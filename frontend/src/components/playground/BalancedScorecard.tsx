/**
 * Balanced Scorecard Component
 *
 * Displays the three key metrics for employee retention decisions:
 * - ELTV (Employee Lifetime Value)
 * - Risk Level
 * - ROI (Return on Investment)
 *
 * This provides at-a-glance business value visibility.
 */

import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, User, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  color: string;
  bgColor: string;
} {
  if (churnProbability >= 0.7) {
    return { level: 'High', color: 'text-red-600', bgColor: 'bg-red-100' };
  }
  if (churnProbability >= 0.4) {
    return { level: 'Medium', color: 'text-amber-600', bgColor: 'bg-amber-100' };
  }
  return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-100' };
}

function getROICategory(roi: number): {
  label: string;
  color: string;
} {
  if (roi >= 100) return { label: 'Excellent', color: 'text-green-600' };
  if (roi >= 50) return { label: 'Good', color: 'text-emerald-600' };
  if (roi >= 0) return { label: 'Marginal', color: 'text-amber-600' };
  return { label: 'Negative', color: 'text-red-600' };
}

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
      <div className={cn('flex items-center gap-4 p-3 bg-slate-50 rounded-lg', className)}>
        {/* Risk */}
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn('h-4 w-4', currentRisk.color)} />
          <div>
            <span className="text-xs text-slate-500">Risk</span>
            <Badge variant="outline" className={cn('ml-1 text-xs', currentRisk.color, currentRisk.bgColor)}>
              {currentRisk.level}
            </Badge>
            {showProjected && projectedRisk && projectedRisk.level !== currentRisk.level && (
              <span className={cn('ml-1 text-xs', projectedRisk.color)}>
                 {projectedRisk.level}
              </span>
            )}
          </div>
        </div>

        {/* ELTV */}
        <div className="flex items-center gap-2 border-l pl-4">
          <DollarSign className="h-4 w-4 text-blue-600" />
          <div>
            <span className="text-xs text-slate-500">ELTV</span>
            <span className="ml-1 font-medium">{formatCurrency(currentELTV)}</span>
            {showProjected && eltvDelta !== 0 && (
              <span className={cn('ml-1 text-xs', eltvDelta > 0 ? 'text-green-600' : 'text-red-600')}>
                {eltvDelta > 0 ? '+' : ''}{formatCurrency(eltvDelta)}
              </span>
            )}
          </div>
        </div>

        {/* ROI */}
        {showProjected && projectedROI !== undefined && (
          <div className="flex items-center gap-2 border-l pl-4">
            <Activity className="h-4 w-4 text-purple-600" />
            <div>
              <span className="text-xs text-slate-500">ROI</span>
              <span className={cn('ml-1 font-medium', roiCategory?.color)}>
                {projectedROI.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full card layout
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
      {/* Risk Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Churn Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Badge
                variant="outline"
                className={cn('text-lg px-3 py-1', currentRisk.color, currentRisk.bgColor)}
              >
                {currentRisk.level}
              </Badge>
              <p className="text-sm text-slate-500 mt-1">
                {formatPercentage(currentChurnProbability)} probability
              </p>
            </div>

            {showProjected && projectedRisk && riskDelta !== 0 && (
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm">
                  {riskDelta < 0 ? (
                    <TrendingDown className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-red-600" />
                  )}
                  <span className={riskDelta < 0 ? 'text-green-600' : 'text-red-600'}>
                    {riskDelta < 0 ? '' : '+'}{formatPercentage(riskDelta)}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-xs mt-1', projectedRisk.color, projectedRisk.bgColor)}
                >
                  {projectedRisk.level}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ELTV Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Employee Lifetime Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(currentELTV)}
              </p>
              <p className="text-sm text-slate-500">Current value</p>
            </div>

            {showProjected && eltvDelta !== 0 && (
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm">
                  {eltvDelta > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={eltvDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                    {eltvDelta > 0 ? '+' : ''}{formatCurrency(eltvDelta)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Projected: {formatCurrency(projectedELTV || currentELTV)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ROI Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Treatment ROI
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showProjected && projectedROI !== undefined && treatmentCost !== undefined ? (
            <div className="flex items-center justify-between">
              <div>
                <p className={cn('text-2xl font-bold', roiCategory?.color)}>
                  {projectedROI.toFixed(0)}%
                </p>
                <p className="text-sm text-slate-500">{roiCategory?.label}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600">
                  Cost: {formatCurrency(treatmentCost)}
                </p>
                <p className="text-sm text-slate-600">
                  Gain: {formatCurrency(eltvDelta)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-500">
              <p className="text-sm">Select a treatment to see ROI</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BalancedScorecard;
