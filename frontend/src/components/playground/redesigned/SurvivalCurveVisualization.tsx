/**
 * Survival Curve Visualization Component
 *
 * Reusable chart component for displaying employee retention probability
 * over time using Weibull survival curves. Supports baseline vs. treatment
 * comparison with area or line chart variants.
 *
 * Design aligned with ChurnVision design system (gray-* colors, dark mode support).
 */

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';

interface SurvivalCurveVisualizationProps {
  /** Baseline survival probabilities by month (e.g., { "1": 0.95, "2": 0.91, ... }) */
  survivalProbabilities: Record<string, number>;
  /** Optional comparison probabilities (e.g., post-treatment) */
  comparisonProbabilities?: Record<string, number>;
  /** Chart height in pixels */
  height?: number;
  /** Show axis labels and legend */
  showLabels?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Chart type: area fills under curve, line shows just the line */
  variant?: 'line' | 'area';
  /** Additional CSS classes */
  className?: string;
  /** Compact mode for inline displays */
  compact?: boolean;
}

interface ChartDataPoint {
  month: number;
  baseline: number;
  comparison: number | null;
}

// Custom tooltip for hover state
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: number;
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Month {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600 dark:text-gray-400">
              {entry.name === 'baseline' ? 'Current' : 'With Treatment'}:
            </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {entry.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function SurvivalCurveVisualization({
  survivalProbabilities,
  comparisonProbabilities,
  height = 200,
  showLabels = true,
  showGrid = true,
  variant = 'area',
  className,
  compact = false,
}: SurvivalCurveVisualizationProps) {
  // Transform probability records into chart data array
  const chartData = useMemo<ChartDataPoint[]>(() => {
    // Get all unique months and sort them numerically
    const allMonths = new Set<number>();
    Object.keys(survivalProbabilities).forEach((key) => {
      const month = parseInt(key.replace(/\D/g, ''), 10);
      if (!isNaN(month)) allMonths.add(month);
    });
    if (comparisonProbabilities) {
      Object.keys(comparisonProbabilities).forEach((key) => {
        const month = parseInt(key.replace(/\D/g, ''), 10);
        if (!isNaN(month)) allMonths.add(month);
      });
    }

    const months = Array.from(allMonths).sort((a, b) => a - b);

    return months.map((month) => {
      // Handle various key formats (month_1, month_01, 1, etc.)
      const baselineValue =
        survivalProbabilities[`month_${month}`] ??
        survivalProbabilities[`month_${String(month).padStart(2, '0')}`] ??
        survivalProbabilities[String(month)] ??
        0;

      let comparisonValue: number | null = null;
      if (comparisonProbabilities) {
        comparisonValue =
          comparisonProbabilities[`month_${month}`] ??
          comparisonProbabilities[`month_${String(month).padStart(2, '0')}`] ??
          comparisonProbabilities[String(month)] ??
          null;
      }

      return {
        month,
        baseline: baselineValue * 100,
        comparison: comparisonValue !== null ? comparisonValue * 100 : null,
      };
    });
  }, [survivalProbabilities, comparisonProbabilities]);

  // Common chart margins
  const margins = compact
    ? { top: 5, right: 5, left: 0, bottom: 5 }
    : { top: 10, right: 15, left: showLabels ? 45 : 0, bottom: showLabels ? 25 : 10 };

  // Render Area chart variant
  const renderAreaChart = () => (
    <AreaChart data={chartData} margin={margins}>
      <defs>
        <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id="comparisonGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
          <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
        </linearGradient>
      </defs>

      {showGrid && (
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          strokeOpacity={0.5}
          vertical={false}
        />
      )}

      <XAxis
        dataKey="month"
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={{ stroke: '#d1d5db' }}
        tickLine={false}
        {...(showLabels && !compact
          ? {
              label: {
                value: 'Months',
                position: 'insideBottom',
                offset: -15,
                style: { fontSize: 11, fill: '#6b7280' },
              },
            }
          : {})}
      />

      <YAxis
        domain={[0, 100]}
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={{ stroke: '#d1d5db' }}
        tickLine={false}
        tickFormatter={(value) => `${value}%`}
        width={showLabels ? 45 : 35}
        {...(showLabels && !compact
          ? {
              label: {
                value: 'Retention',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#6b7280' },
              },
            }
          : {})}
      />

      <Tooltip content={<CustomTooltip />} />

      {/* Reference line at 50% retention */}
      {showLabels && (
        <ReferenceLine
          y={50}
          stroke="#9ca3af"
          strokeDasharray="3 3"
          strokeOpacity={0.5}
        />
      )}

      {/* Baseline (red) area */}
      <Area
        type="monotone"
        dataKey="baseline"
        stroke="#ef4444"
        strokeWidth={2}
        fill="url(#baselineGradient)"
        name="baseline"
        dot={false}
        activeDot={{ r: 4, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
      />

      {/* Comparison (green) area - only if data provided */}
      {comparisonProbabilities && (
        <Area
          type="monotone"
          dataKey="comparison"
          stroke="#10b981"
          strokeWidth={2.5}
          fill="url(#comparisonGradient)"
          name="comparison"
          dot={false}
          activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
        />
      )}
    </AreaChart>
  );

  // Render Line chart variant
  const renderLineChart = () => (
    <LineChart data={chartData} margin={margins}>
      {showGrid && (
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          strokeOpacity={0.5}
          vertical={false}
        />
      )}

      <XAxis
        dataKey="month"
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={{ stroke: '#d1d5db' }}
        tickLine={false}
      />

      <YAxis
        domain={[0, 100]}
        tick={{ fontSize: 11, fill: '#9ca3af' }}
        axisLine={{ stroke: '#d1d5db' }}
        tickLine={false}
        tickFormatter={(value) => `${value}%`}
        width={showLabels ? 45 : 35}
      />

      <Tooltip content={<CustomTooltip />} />

      <Line
        type="monotone"
        dataKey="baseline"
        stroke="#ef4444"
        strokeWidth={2}
        name="baseline"
        dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
        activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
      />

      {comparisonProbabilities && (
        <Line
          type="monotone"
          dataKey="comparison"
          stroke="#10b981"
          strokeWidth={2.5}
          name="comparison"
          dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
        />
      )}
    </LineChart>
  );

  return (
    <div
      className={cn('relative', className)}
      role="img"
      aria-label={`Survival curve chart showing employee retention probability over ${chartData.length} months${comparisonProbabilities ? ', comparing current trajectory with treatment impact' : ''}`}
    >
      <ResponsiveContainer width="100%" height={height}>
        {variant === 'area' ? renderAreaChart() : renderLineChart()}
      </ResponsiveContainer>

      {/* Legend */}
      {showLabels && !compact && (
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-red-500 rounded" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Current trajectory
            </span>
          </div>
          {comparisonProbabilities && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-emerald-500 rounded" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                With treatment
              </span>
            </div>
          )}
        </div>
      )}

      {/* Compact legend */}
      {showLabels && compact && (
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[10px] text-gray-400">Now</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-0.5 bg-red-500 rounded" />
              <span className="text-[10px] text-gray-400">Current</span>
            </div>
            {comparisonProbabilities && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-0.5 bg-emerald-500 rounded" />
                <span className="text-[10px] text-gray-400">Treated</span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-400">12mo</span>
        </div>
      )}
    </div>
  );
}

export default SurvivalCurveVisualization;
