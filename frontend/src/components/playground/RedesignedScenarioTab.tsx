/**
 * Redesigned Scenario Tab for Playground
 *
 * Complete UX overhaul with clear 2-section layout:
 * - Left: Employee profile card + Impact preview with survival curve visualization
 * - Right: AI-first treatment recommendations with hero card for recommended action
 *
 * Design aligned with ChurnVision design system (ROIDashboardTab pattern).
 * Uses gray-* colors for consistency across the application.
 */

import { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  DollarSign,
  ArrowRight,
  Sparkles,
  Play,
  ChevronDown,
  ChevronUp,
  X,
  Target,
  Shield,
  Activity,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';
import type { TreatmentSuggestion, ApplyTreatmentResult } from '@/types/treatment';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { SurvivalCurveVisualization } from './redesigned/SurvivalCurveVisualization';
import { TreatmentRecommendationPanel } from './redesigned/TreatmentRecommendationPanel';

// Types
interface PlaygroundEmployeeData {
  employee_id: string;
  current_features: {
    hr_code: string;
    full_name: string;
    structure_name: string;
    position: string;
    status: string;
    tenure: number;
    employee_cost: number;
    report_date: string;
    normalized_position_level?: string;
    termination_date: string | null;
  };
  current_churn_probability: number;
  current_eltv: number;
  current_survival_probabilities: Record<string, number>;
  shap_values: Record<string, number>;
  normalized_position_level?: string;
}

interface RedesignedScenarioTabProps {
  selectedEmployee: Employee | null;
  selectedEmployeeData: PlaygroundEmployeeData | null;
  treatmentSuggestions: TreatmentSuggestion[];
  applyTreatment: (treatment: TreatmentSuggestion) => Promise<void>;
  isApplyingTreatment: boolean;
  selectedTreatment: TreatmentSuggestion | null;
  applyTreatmentResult: ApplyTreatmentResult | null;
  isPerformanceMode: boolean;
  budget: number | null;
  transformedChartData: Array<{ month: number; [key: string]: number }>;
  onResetSimulation?: () => void;
}

// Utility functions
function formatCurrency(value: number): string {
  if (value === undefined || value === null || isNaN(value)) return '$0';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatPercentDetailed(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getRiskInfo(probability: number): { label: string; color: string; bgColor: string; icon: typeof AlertTriangle } {
  if (probability >= 0.7) return { label: 'High Risk', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20', icon: AlertTriangle };
  if (probability >= 0.4) return { label: 'Medium Risk', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20', icon: AlertTriangle };
  return { label: 'Low Risk', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Shield };
}

// Employee Profile Card - Matches ROIDashboardTab MetricCard pattern
const EmployeeProfileCard = memo(({
  employee,
  employeeData,
  isPerformanceMode,
}: {
  employee: Employee;
  employeeData: PlaygroundEmployeeData;
  isPerformanceMode: boolean;
}) => {
  const risk = getRiskInfo(employeeData.current_churn_probability);
  const RiskIcon = risk.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
    >
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-xl flex-shrink-0">
          {(employee.name || employee.full_name)?.charAt(0) || 'E'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {employee.name || employee.full_name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {employee.position}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {employee.department} • {employeeData.current_features?.tenure || 0} years
          </p>
        </div>
      </div>

      {/* Current metrics */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        {/* Risk */}
        <div className={cn("rounded-lg p-3", risk.bgColor)}>
          <div className="flex items-center gap-2 mb-1">
            <RiskIcon className={cn("w-4 h-4", risk.color)} />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Risk</span>
          </div>
          <p className={cn("text-lg font-bold", risk.color)}>
            {risk.label.split(' ')[0]}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {formatPercentDetailed(employeeData.current_churn_probability)} churn
          </p>
        </div>

        {/* ELTV/RVI with Tooltip */}
        <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 relative group">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {isPerformanceMode ? 'RVI' : 'ELTV'}
            </span>
            <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
          </div>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {isPerformanceMode
              ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Medium' : 'Low')
              : formatCurrency(employeeData.current_eltv)
            }
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Current value
          </p>

          {/* ELTV Explanation Tooltip */}
          <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 w-72 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 text-left">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {isPerformanceMode ? 'Retention Value Index' : 'Employee Lifetime Value'}
              </p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
              {isPerformanceMode
                ? 'RVI is a qualitative index (High/Medium/Low) showing relative retention value without using salary figures.'
                : 'ELTV estimates the present value of this employee based on their predicted retention probability over time.'
              }
            </p>
            <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Annual compensation</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {formatCurrency(employeeData.current_features.employee_cost)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">12-mo retention</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {formatPercent(1 - employeeData.current_churn_probability)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Tenure</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {employeeData.current_features.tenure?.toFixed(1) || 0} years
                </span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[10px] text-gray-400 italic">
                Hover on survival chart below for detailed trajectory
              </p>
            </div>
          </div>
        </div>

        {/* Retention */}
        <div className="rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Retention</span>
          </div>
          <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
            {formatPercent(1 - employeeData.current_churn_probability)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            12-month prob
          </p>
        </div>
      </div>
    </motion.div>
  );
});

// Impact Preview Panel - Matches ROIDashboardTab SectionCard pattern
const ImpactPreviewPanel = memo(({
  employeeData,
  result,
  selectedTreatment,
  isPerformanceMode,
  chartData,
  onReset,
}: {
  employeeData: PlaygroundEmployeeData;
  result: ApplyTreatmentResult;
  selectedTreatment: TreatmentSuggestion;
  isPerformanceMode: boolean;
  chartData: Array<{ month: number; [key: string]: number }>;
  onReset?: () => void;
}) => {
  const [showChart, setShowChart] = useState(false);

  const churnReduction = result.pre_churn_probability - result.post_churn_probability;
  const eltvGain = result.eltv_post_treatment - employeeData.current_eltv;
  const netBenefit = result.treatment_effect_eltv - result.treatment_cost;
  const roi = result.roi * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-emerald-200 dark:border-emerald-800/50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {selectedTreatment.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Projected impact analysis
            </p>
          </div>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>

      {/* Impact Metrics */}
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Churn Change */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Churn Risk Change</p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  {formatPercentDetailed(result.pre_churn_probability)}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Before</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatPercentDetailed(result.post_churn_probability)}
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">After</p>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                <TrendingDown className="w-4 h-4" />
                −{(churnReduction * 100).toFixed(1)} pp
              </span>
            </div>
          </div>

          {/* Value Change */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
              {isPerformanceMode ? 'Value Index' : 'Lifetime Value'}
            </p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-600 dark:text-gray-400">
                  {isPerformanceMode
                    ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Med' : 'Low')
                    : formatCurrency(employeeData.current_eltv)
                  }
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Before</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {isPerformanceMode
                    ? (result.eltv_post_treatment >= 100000 ? 'High' : result.eltv_post_treatment >= 50000 ? 'Med' : 'Low')
                    : formatCurrency(result.eltv_post_treatment)
                  }
                </p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">After</p>
              </div>
            </div>
            {!isPerformanceMode && eltvGain > 0 && (
              <div className="mt-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                  <TrendingUp className="w-4 h-4" />
                  +{formatCurrency(eltvGain)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Survival Curve Comparison - NEW */}
        <div className="mt-4 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-700/50 dark:to-blue-900/10 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Retention Trajectory Comparison
              </p>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
              <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                Improved
              </span>
            </div>
          </div>

          <SurvivalCurveVisualization
            survivalProbabilities={employeeData.current_survival_probabilities}
            comparisonProbabilities={result.new_survival_probabilities}
            height={160}
            showLabels={true}
            showGrid={true}
            variant="area"
          />

          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 text-center leading-relaxed">
            <span className="text-red-500 font-medium">Red</span> shows current trajectory •
            <span className="text-emerald-500 font-medium"> Green</span> shows improved retention after treatment
          </p>
        </div>

        {/* Summary Row */}
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cost</p>
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  {formatCurrency(result.treatment_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Net Benefit</p>
                <p className={cn(
                  "font-semibold",
                  netBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {netBenefit >= 0 ? '+' : ''}{formatCurrency(netBenefit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ROI</p>
                <p className={cn(
                  "font-semibold",
                  roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
                </p>
              </div>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-lg font-medium text-sm",
              netBenefit >= 0
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            )}>
              {netBenefit >= 0 ? '✓ Recommended' : '⚠ Review carefully'}
            </div>
          </div>
        </div>

        {/* Expandable Chart */}
        <button
          onClick={() => setShowChart(!showChart)}
          className="mt-4 w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Activity className="w-4 h-4" />
            View retention forecast chart
          </div>
          {showChart ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        <AnimatePresence>
          {showChart && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={{ stroke: '#d1d5db' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={{ stroke: '#d1d5db' }}
                      tickLine={false}
                      width={40}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Without Treatment"
                      stroke="#9ca3af"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="With Treatment"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-gray-400 rounded" />
                    <span className="text-xs text-gray-500">Without Treatment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                    <span className="text-xs text-gray-500">With Treatment</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

// Empty State - Matches app design patterns
const EmptyState = memo(({ type }: { type: 'employee' | 'treatment' }) => {
  if (type === 'employee') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-blue-500 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Select an Employee
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Choose a team member from the sidebar to view their risk profile and explore retention treatments.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
      <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
        <Play className="w-8 h-8 text-blue-500 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Ready to Simulate
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        Select a treatment from the panel to simulate its impact.
      </p>
    </div>
  );
});

// Main Component - Fixed layout: middle is STATIC, only treatment list scrolls
export function RedesignedScenarioTab({
  selectedEmployee,
  selectedEmployeeData,
  treatmentSuggestions,
  applyTreatment,
  isApplyingTreatment,
  selectedTreatment,
  applyTreatmentResult,
  isPerformanceMode,
  budget,
  transformedChartData,
  onResetSimulation,
}: RedesignedScenarioTabProps) {
  const handleTreatmentSelect = useCallback((treatment: TreatmentSuggestion) => {
    if (!isApplyingTreatment) {
      applyTreatment(treatment);
    }
  }, [applyTreatment, isApplyingTreatment]);

  const employeeSalary = selectedEmployeeData?.current_features?.employee_cost || selectedEmployee?.salary || 0;

  return (
    <div className="flex gap-4 h-full">
      {/* Left Section - Employee Profile & Impact (STATIC - no scroll) */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        {/* Employee Profile */}
        {selectedEmployee && selectedEmployeeData ? (
          <>
            <EmployeeProfileCard
              employee={selectedEmployee}
              employeeData={selectedEmployeeData}
              isPerformanceMode={isPerformanceMode}
            />

            {/* Impact Preview or Ready State */}
            {applyTreatmentResult && selectedTreatment ? (
              <ImpactPreviewPanel
                employeeData={selectedEmployeeData}
                result={applyTreatmentResult}
                selectedTreatment={selectedTreatment}
                isPerformanceMode={isPerformanceMode}
                chartData={transformedChartData}
                onReset={onResetSimulation}
              />
            ) : (
              <EmptyState type="treatment" />
            )}
          </>
        ) : (
          <EmptyState type="employee" />
        )}
      </div>

      {/* Right Section - AI-First Treatment Recommendations */}
      <div className="w-[360px] flex-shrink-0 flex flex-col max-h-[650px] overflow-y-auto">
        {selectedEmployee && selectedEmployeeData ? (
          <TreatmentRecommendationPanel
            treatments={treatmentSuggestions}
            selectedTreatment={selectedTreatment}
            onSelectTreatment={handleTreatmentSelect}
            isLoading={isApplyingTreatment}
            isPerformanceMode={isPerformanceMode}
            employeeSalary={employeeSalary}
            budgetFilter={budget}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
              <Zap className="w-7 h-7 text-blue-500 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              AI Treatment Recommendations
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              Select an employee from the sidebar to see personalized retention treatments ranked by ROI.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RedesignedScenarioTab;
