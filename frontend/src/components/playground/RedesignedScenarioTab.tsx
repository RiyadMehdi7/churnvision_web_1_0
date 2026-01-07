/**
 * Redesigned Scenario Tab for Playground
 *
 * Complete UX overhaul with clear 3-section layout:
 * - Left: Employee profile card with current metrics
 * - Center: Impact visualization (before/after comparison)
 * - Right: Scrollable treatment cards
 *
 * Key UX improvements:
 * - Visual flow guides user through the process
 * - Impact is shown immediately upon treatment selection
 * - Retention chart moved to expandable panel (less visual noise)
 * - Clear action buttons and state feedback
 */

import { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Zap,
  DollarSign,
  Clock,
  ChevronRight,
  ArrowRight,
  Sparkles,
  BarChart3,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Bot,
  X,
  Target,
  Shield,
  Activity,
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

function calculateCostPercentage(cost: number, salary: number): number {
  if (!salary || salary <= 0) return 0;
  return (cost / salary) * 100;
}

// Compact Treatment Card for scrollable list
const CompactTreatmentCard = memo(({
  treatment,
  isSelected,
  isApplying,
  onSelect,
  employeeSalary,
  isPerformanceMode,
}: {
  treatment: TreatmentSuggestion;
  isSelected: boolean;
  isApplying: boolean;
  onSelect: () => void;
  employeeSalary: number;
  isPerformanceMode: boolean;
}) => {
  const costPercent = calculateCostPercentage(treatment.cost, employeeSalary);
  const hasAIReasoning = treatment.explanation?.some(e => e.ruleId === 'llm');
  const churnChange = treatment.projected_churn_prob_change;
  const isPositiveImpact = churnChange < 0;

  return (
    <motion.button
      onClick={onSelect}
      disabled={isApplying}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full p-4 rounded-xl border text-left transition-all duration-200 relative overflow-hidden group",
        isSelected
          ? "border-emerald-400 dark:border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-900/30 dark:to-teal-900/20 shadow-lg shadow-emerald-500/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md",
        isApplying && "opacity-60 cursor-wait"
      )}
    >
      {/* Selection indicator bar */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-colors",
        isSelected ? "bg-emerald-500" : "bg-transparent group-hover:bg-emerald-300 dark:group-hover:bg-emerald-700"
      )} />

      {/* Loading overlay */}
      {isApplying && isSelected && (
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
          <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />
        </div>
      )}

      <div className="pl-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                {treatment.name}
              </h4>
              {hasAIReasoning && (
                <Bot className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
              {treatment.description}
            </p>
          </div>
          {isSelected && (
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          )}
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-3 mt-3">
          {/* Impact */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
            isPositiveImpact
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
          )}>
            {isPositiveImpact ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {churnChange < 0 ? '−' : '+'}{Math.abs(churnChange * 100).toFixed(0)}%
          </div>

          {/* Cost */}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isPerformanceMode ? `${costPercent.toFixed(0)}%` : formatCurrency(treatment.cost)}
          </span>

          {/* ROI Badge */}
          <span className={cn(
            "ml-auto text-xs font-medium px-2 py-0.5 rounded",
            treatment.projected_roi === 'high' ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" :
            treatment.projected_roi === 'medium' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
            "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
          )}>
            {treatment.projected_roi?.charAt(0).toUpperCase()}{treatment.projected_roi?.slice(1)}
          </span>
        </div>
      </div>
    </motion.button>
  );
});

// Employee Profile Card
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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-xl flex-shrink-0 shadow-lg shadow-violet-500/20">
          {(employee.name || employee.full_name)?.charAt(0) || 'E'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
            {employee.name || employee.full_name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {employee.position}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
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
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Risk</span>
          </div>
          <p className={cn("text-lg font-bold", risk.color)}>
            {risk.label.split(' ')[0]}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatPercentDetailed(employeeData.current_churn_probability)} churn
          </p>
        </div>

        {/* ELTV/RVI */}
        <div className="rounded-lg p-3 bg-violet-50 dark:bg-violet-900/20">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isPerformanceMode ? 'RVI' : 'ELTV'}
            </span>
          </div>
          <p className="text-lg font-bold text-violet-700 dark:text-violet-300">
            {isPerformanceMode
              ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Medium' : 'Low')
              : formatCurrency(employeeData.current_eltv)
            }
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Current value
          </p>
        </div>

        {/* Retention */}
        <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Retention</span>
          </div>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
            {formatPercent(1 - employeeData.current_churn_probability)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            12-month prob
          </p>
        </div>
      </div>
    </div>
  );
});

// Impact Preview Panel
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
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-emerald-50 via-teal-50/30 to-emerald-50 dark:from-emerald-900/20 dark:via-teal-900/10 dark:to-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700/50 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-emerald-200/50 dark:border-emerald-700/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedTreatment.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Projected impact analysis
            </p>
          </div>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="p-2 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800/30 transition-colors"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        )}
      </div>

      {/* Impact Metrics */}
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Churn Change */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200/50 dark:border-slate-700/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Churn Risk Change</p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-red-500 dark:text-red-400">
                  {formatPercentDetailed(result.pre_churn_probability)}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Before</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-500 dark:text-emerald-400">
                  {formatPercentDetailed(result.post_churn_probability)}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">After</p>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
                <TrendingDown className="w-4 h-4" />
                −{(churnReduction * 100).toFixed(1)} pp
              </span>
            </div>
          </div>

          {/* Value Change */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200/50 dark:border-slate-700/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
              {isPerformanceMode ? 'Value Index' : 'Lifetime Value'}
            </p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-slate-600 dark:text-slate-400">
                  {isPerformanceMode
                    ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Med' : 'Low')
                    : formatCurrency(employeeData.current_eltv)
                  }
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Before</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-500 dark:text-emerald-400">
                  {isPerformanceMode
                    ? (result.eltv_post_treatment >= 100000 ? 'High' : result.eltv_post_treatment >= 50000 ? 'Med' : 'Low')
                    : formatCurrency(result.eltv_post_treatment)
                  }
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">After</p>
              </div>
            </div>
            {!isPerformanceMode && eltvGain > 0 && (
              <div className="mt-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
                  <TrendingUp className="w-4 h-4" />
                  +{formatCurrency(eltvGain)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Summary Row */}
        <div className="mt-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cost</p>
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatCurrency(result.treatment_cost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Net Benefit</p>
                <p className={cn(
                  "font-semibold",
                  netBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {netBenefit >= 0 ? '+' : ''}{formatCurrency(netBenefit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">ROI</p>
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
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            )}>
              {netBenefit >= 0 ? '✓ Recommended' : '⚠ Review carefully'}
            </div>
          </div>
        </div>

        {/* Expandable Chart */}
        <button
          onClick={() => setShowChart(!showChart)}
          className="mt-4 w-full flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Activity className="w-4 h-4" />
            View retention forecast chart
          </div>
          {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {showChart && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                      width={40}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Without Treatment"
                      stroke="#94a3b8"
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
                    <div className="w-3 h-0.5 bg-slate-400 rounded" />
                    <span className="text-xs text-slate-500">Without Treatment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                    <span className="text-xs text-slate-500">With Treatment</span>
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

// Empty State
const EmptyState = memo(({ type }: { type: 'employee' | 'treatment' }) => {
  if (type === 'employee') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-violet-500 dark:text-violet-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Select an Employee
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          Choose a team member from the sidebar to view their risk profile and explore retention treatments.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-800/50">
      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
        <Play className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
        Ready to Simulate
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        Click on a treatment card to run the simulation and see projected outcomes.
      </p>
    </div>
  );
});

// Main Component
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
  // Filter treatments by budget
  const filteredTreatments = useMemo(() => {
    if (!treatmentSuggestions.length) return [];

    const salary = selectedEmployeeData?.current_features?.employee_cost || 0;

    return treatmentSuggestions.filter(treatment => {
      if (budget === null) return true;
      const costPercent = calculateCostPercentage(treatment.cost, salary);
      return costPercent <= budget;
    });
  }, [treatmentSuggestions, budget, selectedEmployeeData]);

  const handleTreatmentSelect = useCallback((treatment: TreatmentSuggestion) => {
    if (!isApplyingTreatment) {
      applyTreatment(treatment);
    }
  }, [applyTreatment, isApplyingTreatment]);

  const employeeSalary = selectedEmployeeData?.current_features?.employee_cost || selectedEmployee?.salary || 0;

  return (
    <div className="flex gap-5 h-full min-h-0">
      {/* Left Section - Employee Profile & Impact */}
      <div className="flex-1 flex flex-col min-w-0 space-y-5 overflow-y-auto pr-1">
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

      {/* Right Section - Treatment Cards (Scrollable) */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Treatment Options
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filteredTreatments.length} available
            </p>
          </div>
        </div>

        {/* Treatment List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedEmployee && selectedEmployeeData ? (
            filteredTreatments.length > 0 ? (
              filteredTreatments.map((treatment) => (
                <CompactTreatmentCard
                  key={treatment.id}
                  treatment={treatment}
                  isSelected={selectedTreatment?.id === treatment.id}
                  isApplying={isApplyingTreatment}
                  onSelect={() => handleTreatmentSelect(treatment)}
                  employeeSalary={employeeSalary}
                  isPerformanceMode={isPerformanceMode}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <Info className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  No treatments match
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {budget !== null ? 'Try adjusting your budget' : 'No treatments available'}
                </p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4">
              <User className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Select an employee
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                Choose from the sidebar
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RedesignedScenarioTab;
