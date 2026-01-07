/**
 * Improved Middle Section for Playground
 *
 * Redesigned with a clear 3-step workflow:
 * 1. Employee Overview - Shows selected employee's current status
 * 2. Treatment Selection - Simple treatment picker with key metrics
 * 3. Impact Preview - Before/after comparison with simulation results
 *
 * Design principles:
 * - Visual hierarchy guides user through the flow
 * - Progressive disclosure - details expand on demand
 * - Clear cause-and-effect visualization
 */

import { useState, useMemo, memo } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';
import type { TreatmentSuggestion, ApplyTreatmentResult } from '@/types/treatment';

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

interface ImprovedMiddleSectionProps {
  selectedEmployee: Employee | null;
  selectedEmployeeData: PlaygroundEmployeeData | null;
  treatmentSuggestions: TreatmentSuggestion[];
  selectedTreatment: TreatmentSuggestion | null;
  applyTreatmentResult: ApplyTreatmentResult | null;
  isApplyingTreatment: boolean;
  isLoadingPlaygroundData: boolean;
  onApplyTreatment: (treatment: TreatmentSuggestion) => Promise<void>;
  onResetSimulation?: () => void;
  isPerformanceMode?: boolean;
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

function getRiskLevel(probability: number): { label: string; color: string; bgColor: string } {
  if (probability >= 0.7) return { label: 'High', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20' };
  if (probability >= 0.4) return { label: 'Medium', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20' };
  return { label: 'Low', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20' };
}

// Step indicator component
const StepIndicator = memo(({ step, currentStep, label }: { step: number; currentStep: number; label: string }) => {
  const isActive = currentStep >= step;
  const isCurrent = currentStep === step;

  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
        isActive
          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
          : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
      )}>
        {isActive && step < currentStep ? <CheckCircle className="w-4 h-4" /> : step}
      </div>
      <span className={cn(
        "text-sm font-medium transition-colors",
        isCurrent ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
      )}>
        {label}
      </span>
    </div>
  );
});

// Employee Summary Card - Compact, focused info
const EmployeeSummaryCard = memo(({
  employee,
  employeeData,
  isPerformanceMode
}: {
  employee: Employee;
  employeeData: PlaygroundEmployeeData;
  isPerformanceMode: boolean;
}) => {
  const risk = getRiskLevel(employeeData.current_churn_probability);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
          {employee.name?.charAt(0) || 'E'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {employee.name || employee.full_name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {employee.position} • {employee.department}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {employeeData.current_features?.tenure || 0} years tenure
            </span>
          </div>
        </div>

        {/* Risk Badge */}
        <div className={cn("px-3 py-1.5 rounded-lg", risk.bgColor)}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={cn("w-4 h-4", risk.color)} />
            <span className={cn("text-sm font-semibold", risk.color)}>
              {risk.label} Risk
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatPercent(employeeData.current_churn_probability)} churn
          </p>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {isPerformanceMode ? 'Retention Value Index' : 'Employee Lifetime Value'}
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {isPerformanceMode
              ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Medium' : 'Low')
              : formatCurrency(employeeData.current_eltv)
            }
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            12-Month Retention
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatPercent(1 - employeeData.current_churn_probability)}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

// Treatment Option Card - Clean, scannable
const TreatmentOptionCard = memo(({
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
  const costPercent = employeeSalary > 0 ? (treatment.cost / employeeSalary) * 100 : 0;
  const hasAIReasoning = treatment.explanation?.some(e => e.ruleId === 'llm');

  return (
    <motion.button
      onClick={onSelect}
      disabled={isApplying}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full p-4 rounded-xl border-2 text-left transition-all duration-200 relative overflow-hidden",
        isSelected
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg shadow-emerald-500/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
        isApplying && "opacity-50 cursor-wait"
      )}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
        </div>
      )}

      {/* Content */}
      <div className="pr-8">
        <div className="flex items-start gap-2 mb-2">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
            {treatment.name}
          </h4>
          {hasAIReasoning && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded">
              AI
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
          {treatment.description}
        </p>

        {/* Metrics row */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              treatment.projected_churn_prob_change <= -0.1 ? "bg-emerald-500" :
              treatment.projected_churn_prob_change <= -0.05 ? "bg-amber-500" : "bg-slate-400"
            )} />
            <span className="text-slate-600 dark:text-slate-300 font-medium">
              {treatment.projected_churn_prob_change < 0 ? '−' : '+'}
              {Math.abs(treatment.projected_churn_prob_change * 100).toFixed(0)}% churn
            </span>
          </div>
          <div className="text-slate-500 dark:text-slate-400">
            {isPerformanceMode
              ? `${costPercent.toFixed(1)}% of salary`
              : formatCurrency(treatment.cost)
            }
          </div>
          <div className={cn(
            "ml-auto font-medium",
            treatment.projected_roi === 'high' ? "text-emerald-600 dark:text-emerald-400" :
            treatment.projected_roi === 'medium' ? "text-amber-600 dark:text-amber-400" :
            "text-slate-500 dark:text-slate-400"
          )}>
            {treatment.projected_roi?.charAt(0).toUpperCase()}{treatment.projected_roi?.slice(1)} ROI
          </div>
        </div>
      </div>
    </motion.button>
  );
});

// Impact Comparison Panel - Clear before/after
const ImpactComparisonPanel = memo(({
  employeeData,
  result,
  selectedTreatment,
  isPerformanceMode,
}: {
  employeeData: PlaygroundEmployeeData;
  result: ApplyTreatmentResult;
  selectedTreatment: TreatmentSuggestion;
  isPerformanceMode: boolean;
}) => {
  const churnReduction = result.pre_churn_probability - result.post_churn_probability;
  const eltvGain = result.eltv_post_treatment - employeeData.current_eltv;
  const netBenefit = result.treatment_effect_eltv - result.treatment_cost;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 dark:from-emerald-900/20 dark:via-teal-900/10 dark:to-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            Impact Analysis: {selectedTreatment.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Projected outcomes based on ML simulation
          </p>
        </div>
      </div>

      {/* Before/After Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Churn Risk */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200/50 dark:border-slate-700/50">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Churn Risk</p>
          <div className="flex items-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatPercent(result.pre_churn_probability)}
              </p>
              <p className="text-[10px] text-slate-500">Before</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatPercent(result.post_churn_probability)}
              </p>
              <p className="text-[10px] text-slate-500">After</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
            <TrendingDown className="w-3 h-3" />
            <span className="text-xs font-semibold">−{(churnReduction * 100).toFixed(1)} pp</span>
          </div>
        </div>

        {/* ELTV */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200/50 dark:border-slate-700/50">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
            {isPerformanceMode ? 'RVI' : 'ELTV'}
          </p>
          <div className="flex items-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-600 dark:text-slate-400">
                {isPerformanceMode
                  ? (employeeData.current_eltv >= 100000 ? 'High' : employeeData.current_eltv >= 50000 ? 'Med' : 'Low')
                  : formatCurrency(employeeData.current_eltv)
                }
              </p>
              <p className="text-[10px] text-slate-500">Before</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {isPerformanceMode
                  ? (result.eltv_post_treatment >= 100000 ? 'High' : result.eltv_post_treatment >= 50000 ? 'Med' : 'Low')
                  : formatCurrency(result.eltv_post_treatment)
                }
              </p>
              <p className="text-[10px] text-slate-500">After</p>
            </div>
          </div>
          {!isPerformanceMode && eltvGain > 0 && (
            <div className="mt-2 flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3 h-3" />
              <span className="text-xs font-semibold">+{formatCurrency(eltvGain)}</span>
            </div>
          )}
        </div>

        {/* ROI Summary */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200/50 dark:border-slate-700/50">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Net Impact</p>
          <div className="text-center">
            <p className={cn(
              "text-2xl font-bold",
              netBenefit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}>
              {isPerformanceMode
                ? (result.roi * 100).toFixed(0) + '%'
                : formatCurrency(netBenefit)
              }
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isPerformanceMode ? 'ROI' : 'Net Benefit'}
            </p>
          </div>
          <div className={cn(
            "mt-2 text-center text-xs font-medium px-2 py-1 rounded",
            netBenefit >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" :
            "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
          )}>
            {netBenefit >= 0 ? '✓ Recommended' : '⚠ Consider alternatives'}
          </div>
        </div>
      </div>

      {/* Treatment Details */}
      <div className="mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-700/50 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Cost: {formatCurrency(result.treatment_cost)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {(selectedTreatment as any).timeToEffect || '1-3 months'}
          </span>
        </div>
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Zap className="w-3 h-3" />
          ML Model Used
        </span>
      </div>
    </motion.div>
  );
});

// Empty State Component
const EmptyStateCard = memo(({ step }: { step: 'employee' | 'treatment' | 'result' }) => {
  const config = {
    employee: {
      icon: User,
      title: 'Select an Employee',
      description: 'Choose a team member from the sidebar to analyze their retention risk and explore treatment options.',
      color: 'violet',
    },
    treatment: {
      icon: Sparkles,
      title: 'Choose a Treatment',
      description: 'Select a retention intervention above to simulate its impact on the employee.',
      color: 'blue',
    },
    result: {
      icon: BarChart3,
      title: 'View Impact Analysis',
      description: 'After running a simulation, you\'ll see detailed before/after comparisons here.',
      color: 'emerald',
    },
  };

  const { icon: Icon, title, description, color } = config[step];

  return (
    <div className={cn(
      "rounded-xl border-2 border-dashed p-8 text-center",
      `border-${color}-200 dark:border-${color}-800/50 bg-${color}-50/30 dark:bg-${color}-900/10`
    )}>
      <div className={cn(
        "w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center",
        `bg-${color}-100 dark:bg-${color}-900/30`
      )}>
        <Icon className={cn("w-6 h-6", `text-${color}-600 dark:text-${color}-400`)} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
        {description}
      </p>
    </div>
  );
});

// Main Component
export function ImprovedMiddleSection({
  selectedEmployee,
  selectedEmployeeData,
  treatmentSuggestions,
  selectedTreatment,
  applyTreatmentResult,
  isApplyingTreatment,
  isLoadingPlaygroundData,
  onApplyTreatment,
  onResetSimulation,
  isPerformanceMode = false,
}: ImprovedMiddleSectionProps) {
  const [showAllTreatments, setShowAllTreatments] = useState(false);

  // Determine current step
  const currentStep = useMemo(() => {
    if (!selectedEmployee || !selectedEmployeeData) return 1;
    if (!applyTreatmentResult) return 2;
    return 3;
  }, [selectedEmployee, selectedEmployeeData, applyTreatmentResult]);

  // Filter and sort treatments
  const displayedTreatments = useMemo(() => {
    const sorted = [...treatmentSuggestions].sort((a, b) => {
      // Sort by ROI (high > medium > low)
      const roiOrder = { high: 0, medium: 1, low: 2 };
      const aOrder = roiOrder[a.projected_roi] ?? 2;
      const bOrder = roiOrder[b.projected_roi] ?? 2;
      return aOrder - bOrder;
    });
    return showAllTreatments ? sorted : sorted.slice(0, 4);
  }, [treatmentSuggestions, showAllTreatments]);

  const employeeSalary = selectedEmployeeData?.current_features?.employee_cost || selectedEmployee?.salary || 0;

  // Loading state
  if (isLoadingPlaygroundData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading employee data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-5 overflow-y-auto pb-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-8 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-6 sticky top-0 z-10">
        <StepIndicator step={1} currentStep={currentStep} label="Select Employee" />
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <StepIndicator step={2} currentStep={currentStep} label="Choose Treatment" />
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <StepIndicator step={3} currentStep={currentStep} label="View Impact" />
      </div>

      {/* Step 1: Employee Summary */}
      <section>
        {selectedEmployee && selectedEmployeeData ? (
          <EmployeeSummaryCard
            employee={selectedEmployee}
            employeeData={selectedEmployeeData}
            isPerformanceMode={isPerformanceMode}
          />
        ) : (
          <EmptyStateCard step="employee" />
        )}
      </section>

      {/* Step 2: Treatment Selection */}
      <AnimatePresence mode="wait">
        {selectedEmployee && selectedEmployeeData && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Recommended Treatments
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an intervention to simulate its impact
                </p>
              </div>
              {applyTreatmentResult && onResetSimulation && (
                <button
                  onClick={onResetSimulation}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
              )}
            </div>

            {treatmentSuggestions.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displayedTreatments.map((treatment) => (
                    <TreatmentOptionCard
                      key={treatment.id}
                      treatment={treatment}
                      isSelected={selectedTreatment?.id === treatment.id}
                      isApplying={isApplyingTreatment}
                      onSelect={() => onApplyTreatment(treatment)}
                      employeeSalary={employeeSalary}
                      isPerformanceMode={isPerformanceMode}
                    />
                  ))}
                </div>

                {treatmentSuggestions.length > 4 && (
                  <button
                    onClick={() => setShowAllTreatments(!showAllTreatments)}
                    className="w-full mt-3 py-2 text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
                  >
                    {showAllTreatments
                      ? 'Show fewer options'
                      : `Show ${treatmentSuggestions.length - 4} more options`
                    }
                  </button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No treatments available for this employee</p>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Step 3: Impact Analysis */}
      <AnimatePresence mode="wait">
        {applyTreatmentResult && selectedEmployeeData && selectedTreatment ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.2 }}
          >
            <ImpactComparisonPanel
              employeeData={selectedEmployeeData}
              result={applyTreatmentResult}
              selectedTreatment={selectedTreatment}
              isPerformanceMode={isPerformanceMode}
            />
          </motion.section>
        ) : selectedEmployee && selectedEmployeeData && !applyTreatmentResult && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
              <Play className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ready to Simulate
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Click on a treatment card above to run the ML simulation and see projected outcomes
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ImprovedMiddleSection;
