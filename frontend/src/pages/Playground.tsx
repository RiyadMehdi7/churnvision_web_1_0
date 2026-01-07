import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  AlertTriangle,
  Search,
  Info,
  Bot,
  Loader2,
  FlaskConical,
  Calculator,
  Users,
  GitCompare,
  Zap,
  Activity,
  CheckCircle,
  Beaker
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '../lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProject } from '@/contexts/ProjectContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useErrorReporting } from '@/utils/errorReporting';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { Employee } from '@/types/employee';
import type { TreatmentOptions, TreatmentSuggestion, ApplyTreatmentResult } from '@/types/treatment';
import { RiskIndicator } from '@/components/risk/RiskIndicator';
import TreatmentTracker from '@/components/risk/TreatmentTracker';
import { ROIDashboardTab } from '@/components/tabs/ROIDashboardTab';
import { AtlasSimulatorSubTab } from '@/components/tabs/AtlasSimulatorSubTab';
import { RedesignedScenarioTab } from '@/components/playground/RedesignedScenarioTab';
import { useDynamicRiskRanges } from '../hooks/useDynamicRiskThresholds';
import { FixedSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrainingReminderBanner } from '@/components/notifications/TrainingReminderBanner';
import { ModelTrainingRequired } from '@/components/model/ModelTrainingRequired';
import api from '../services/apiService';
import { employeeService } from '../services/employeeService';

// --- What‑If Adjustments State ---
interface WhatIfState {
  tenure: number | null;
  employee_cost: number | null;
}

// --- Import Backend Types (Assume these are defined/imported correctly) ---
// You might need to create these types based on the backend service definitions
// or place them in a shared types directory.
interface SurvivalProbabilities { [key: string]: number; }
interface EmployeeDataStrict {
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
}
interface PlaygroundEmployeeData {
  employee_id: string;
  current_features: EmployeeDataStrict;
  current_churn_probability: number;
  current_eltv: number;
  current_survival_probabilities: SurvivalProbabilities;
  shap_values: { [featureName: string]: number };
  normalized_position_level?: string;
}
interface SuggestionExplanation { // Added from backend
  ruleId: string;
  ruleName: string;
  impact: number;
  newProbability: number;
  reason: string;
}
// Use shared TreatmentSuggestion & ApplyTreatmentResult types

// --- End Backend Types ---


// Utility functions
function formatCurrency(value: number): string {
  if (value === undefined || value === null || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// ELTV categorical conversion functions
function convertELTVToCategory(eltv: number): 'high' | 'medium' | 'low' {
  // Convert ELTV to categorical based on value ranges
  if (eltv >= 100000) return 'high';
  if (eltv >= 50000) return 'medium';
  return 'low';
}

function formatELTVByMode(eltv: number, mode: 'quantification' | 'quality'): string {
  if (mode === 'quality') {
    const category = convertELTVToCategory(eltv);
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
  return formatCurrency(eltv);
}

function getELTVCategoryClass(eltv: number): string {
  const category = convertELTVToCategory(eltv);
  if (category === 'high') return 'text-emerald-600 dark:text-emerald-400';
  if (category === 'medium') return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

// Info text helpers for ELTV/RVI tooltips
function getMetricInfoText(metric: 'current' | 'post', isPerformanceMode: boolean): string {
  if (isPerformanceMode) {
    return metric === 'current'
      ? 'RVI (Retention Value Index) is a qualitative index (High/Medium/Low) derived from the modeled retention value and churn risk signals. In performance mode it does not use salary and is shown as categories rather than currency.'
      : 'RVI Post-Treatment indicates the expected category (High/Medium/Low) after applying the treatment, reflecting the treatment’s impact on predicted retention without using salary figures.';
  }
  return metric === 'current'
    ? 'ELTV (Employee Lifetime Value) estimates the present value of an employee’s contribution based on predicted retention (survival probabilities) over a fixed horizon and a discount rate, scaled by the employee’s salary.'
    : 'ELTV Post-Treatment is the projected value using the updated retention curve after applying the selected treatment. The display here does not subtract treatment cost; costs are reflected separately in ROI.';
}

// Calculate treatment cost as percentage of employee salary
function calculateCostPercentage(treatmentCost: number, employeeSalary: number): number {
  if (!employeeSalary || employeeSalary <= 0) return 0;
  return (treatmentCost / employeeSalary) * 100;
}

function formatCostPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

// -------------------------------------
// Data Interfaces and Mock Treatments
// -------------------------------------
// Removed Treatment interface - use TreatmentSuggestion / TreatmentOptions from backend types
// Removed SimulationResult interface - use ApplyTreatmentResult

// Risk zone configuration
// const riskZones = [
//   { name: 'High Risk', color: 'rgba(239, 68, 68, 0.1)', threshold: 0.6 },
//   { name: 'Medium Risk', color: 'rgba(245, 158, 11, 0.1)', threshold: 0.8 },
//   { name: 'Low Risk', color: 'rgba(34, 197, 94, 0.1)', threshold: 1.0 },
// ];

// Sorting options
// const sortOptions = [
//   { id: 'risk', label: 'Risk Level' },
//   { id: 'name', label: 'Name' },
//   { id: 'department', label: 'Department' },
//   { id: 'eltv', label: 'Current ELTV' }
// ];

// Metric descriptions for tooltips
const metricDescriptions = {
  treatmentEffectELTV: 'The expected increase in Employee Lifetime Value after applying the selected treatment',
  newELTV: 'Projected Employee Lifetime Value after the treatment is applied',
  roi: 'Return on Investment = (ELTV Increase - Treatment Cost) / Treatment Cost',
  timeToValue: 'Estimated time until the treatment shows measurable impact',
  currentELTV: 'Current Employee Lifetime Value without any interventions',
  churnProbability: 'Likelihood of the employee leaving within the next 12 months',
  survivalProbability: 'Probability of the employee staying with the company over time'
};

// -------------------------------------
// Reusable UI Components
// -------------------------------------
interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
}
function CustomTooltip({ content, children, position = 'top', disabled = false }: TooltipProps) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [transformClass, setTransformClass] = useState<string>("");
  const showTooltipsContext = true; // Simplified for now

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    if (position === 'top') {
      setCoords({ top: rect.top - margin, left: rect.left + rect.width / 2 });
      setTransformClass('-translate-x-1/2 -translate-y-full');
    } else if (position === 'right') {
      setCoords({ top: rect.top + rect.height / 2, left: rect.right + margin });
      setTransformClass('-translate-y-1/2');
    } else if (position === 'bottom') {
      setCoords({ top: rect.bottom + margin, left: rect.left + rect.width / 2 });
      setTransformClass('-translate-x-1/2');
    } else {
      // left
      setCoords({ top: rect.top + rect.height / 2, left: rect.left - margin });
      setTransformClass('-translate-y-1/2 -translate-x-full');
    }
  }, [position]);

  useEffect(() => {
    if (!show) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [show, updatePosition]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => !disabled && showTooltipsContext && setShow(true)}
      onMouseLeave={() => !disabled && showTooltipsContext && setShow(false)}
    >
      {children}
      {show && !disabled && showTooltipsContext && createPortal(
        <div
          className={cn(
            "fixed z-[9999] px-2 py-1 text-xs bg-white border border-gray-200 rounded shadow-lg whitespace-nowrap dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
            transformClass
          )}
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}

// Clickable, accessible info popover with rich content rendered in a portal
function InfoPopover({
  title,
  children,
  content,
  position = 'top',
}: {
  title: string;
  children: React.ReactNode;
  content: React.ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [transformClass, setTransformClass] = useState<string>("");

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 10;
    if (position === 'top') {
      setCoords({ top: rect.top - margin, left: rect.left + rect.width / 2 });
      setTransformClass('-translate-x-1/2 -translate-y-full');
    } else if (position === 'right') {
      setCoords({ top: rect.top + rect.height / 2, left: rect.right + margin });
      setTransformClass('-translate-y-1/2');
    } else if (position === 'bottom') {
      setCoords({ top: rect.bottom + margin, left: rect.left + rect.width / 2 });
      setTransformClass('-translate-x-1/2');
    } else {
      setCoords({ top: rect.top + rect.height / 2, left: rect.left - margin });
      setTransformClass('-translate-y-1/2 -translate-x-full');
    }
  }, [position]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    const onClickOutside = (e: MouseEvent) => {
      if (!panelRef.current || !triggerRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown as any);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown as any);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`${title} info`}
        className="inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded"
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className={cn(
            'fixed z-[10000] max-w-xs sm:max-w-sm md:max-w-md p-3 sm:p-3.5 rounded-lg shadow-xl border backdrop-blur bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200',
            transformClass
          )}
          style={{ top: coords.top, left: coords.left }}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
            <button onClick={() => setOpen(false)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">×</button>
          </div>
          <div className="text-xs leading-5 space-y-2">
            {content}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Context removed for simplicity, enable if needed later
// const ShowTooltipsContext = createContext(true);

// function SkeletonLoader({ className = "" }: { className?: string }) {
//   return <div className={cn("animate-pulse bg-gray-200 dark:bg-gray-700 rounded", className)} />;
// }


// Unused component - commented out
// function EmployeeCardSkeleton() {
//   return (
//     <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800">
//       <div className="flex items-center justify-between">
//         <div className="flex-1">
//           <SkeletonLoader className="h-5 w-32 mb-2" />
//           <SkeletonLoader className="h-4 w-24 mb-1" />
//           <SkeletonLoader className="h-3 w-20" />
//         </div>
//         <SkeletonLoader className="h-8 w-8 rounded-full" />
//       </div>
//     </div>
//   );
// }

// Treatment Card Component
const TreatmentCard = memo(({
  treatment,
  onSelect,
  isSelected = false,
  isLoading = false,
  employeeSalary = 0
}: {
  treatment: TreatmentSuggestion;
  onSelect: (treatment: TreatmentSuggestion) => void;
  isSelected?: boolean;
  isLoading?: boolean;
  employeeSalary?: number;
}) => {
  const isPerformanceMode = (typeof window !== 'undefined') && (localStorage.getItem('settings.dataMode') === 'performance');
  // Format change as a percentage with sign
  const formatChangePercent = (change: number) => {
    const sign = change < 0 ? '−' : '+'; // use minus sign instead of hyphen
    return `${sign}${Math.abs(change * 100).toFixed(1)}%`;
  };

  // Format ROI with proper handling of new category system
  const formatROI = (roi: 'high' | 'medium' | 'low') => {
    if (!roi || typeof roi !== 'string') {
      return 'Unknown';
    }
    return roi.charAt(0).toUpperCase() + roi.slice(1);
  };

  // Derive class based on ROI for visual indication
  const getRoiClass = (roi: 'high' | 'medium' | 'low') => {
    if (!roi || typeof roi !== 'string') {
      return 'text-slate-500 dark:text-slate-400';
    }
    if (roi === 'high') return 'text-emerald-600 dark:text-emerald-400';
    if (roi === 'medium') return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  // Determine if this is an ongoing cost treatment
  const isOngoingCost = treatment.name.toLowerCase().includes('salary increase') ||
    treatment.name.toLowerCase().includes('salary adjustment');

  return (
    <motion.div
      className={cn(
        'group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300',
        isSelected
          ? 'bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 border-2 border-emerald-400/60 dark:border-emerald-500/50 shadow-xl shadow-emerald-500/20 dark:shadow-emerald-500/10'
          : 'bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900 border border-slate-200/70 dark:border-slate-700/60 hover:border-emerald-300/60 dark:hover:border-emerald-600/50 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-950/50'
      )}
      onClick={() => {
        !isLoading && onSelect(treatment);
      }}
      whileHover={{
        scale: 1.008,
        transition: { type: "spring", stiffness: 400, damping: 25 }
      }}
      whileTap={{
        scale: 0.995,
        transition: { type: "spring", stiffness: 400, damping: 25 }
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Premium decorative elements */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl transition-opacity duration-500",
        isSelected
          ? "bg-gradient-to-bl from-emerald-400/25 via-teal-400/15 to-transparent opacity-100"
          : "bg-gradient-to-bl from-slate-300/20 via-slate-200/10 to-transparent opacity-0 group-hover:opacity-100"
      )} />
      <div className={cn(
        "absolute bottom-0 left-0 w-24 h-24 rounded-full blur-2xl transition-opacity duration-500",
        isSelected
          ? "bg-gradient-to-tr from-teal-400/20 via-emerald-400/10 to-transparent opacity-100"
          : "bg-gradient-to-tr from-slate-300/15 to-transparent opacity-0 group-hover:opacity-60"
      )} />

      {/* Left accent bar */}
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full rounded-full transition-all duration-300",
        isSelected
          ? "bg-gradient-to-b from-emerald-500 via-teal-500 to-emerald-400"
          : "bg-gradient-to-b from-slate-300 via-slate-200 to-slate-300 dark:from-slate-600 dark:via-slate-700 dark:to-slate-600 group-hover:from-emerald-400 group-hover:via-teal-400 group-hover:to-emerald-400"
      )} />

      {/* Hover shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-center rounded-2xl z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-xl animate-pulse" />
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin relative" />
            </div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Applying treatment...</span>
          </div>
        </div>
      )}

      <div className="relative z-10 p-6 flex flex-col">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1 min-w-0 pl-3">
              <div className="flex items-center gap-3 mb-2.5">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all duration-300",
                  isSelected
                    ? "bg-emerald-500 shadow-lg shadow-emerald-500/50 ring-4 ring-emerald-500/20"
                    : "bg-slate-300 dark:bg-slate-600 group-hover:bg-emerald-400 group-hover:shadow-md group-hover:shadow-emerald-400/30"
                )} />
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-tight break-words tracking-tight">
                  {treatment.name}
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed break-words whitespace-pre-line pl-5">
                {treatment.description}
              </p>
            </div>
            {/* Premium status indicator */}
            <div className={cn(
              "flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center transition-all duration-300",
              isSelected
                ? "bg-emerald-500 shadow-lg shadow-emerald-500/40"
                : "bg-slate-200 dark:bg-slate-700 group-hover:bg-emerald-400/80"
            )}>
              {isSelected && (
                <motion.svg
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-3 h-3 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </motion.svg>
              )}
            </div>
          </div>

          {/* Treatment info badges */}
          {(((treatment as any).timeToEffect) || (treatment.riskLevels && treatment.riskLevels.length > 0)) && (
            <div className="flex items-center gap-2.5 text-xs mb-3 flex-wrap pl-3">
              {(treatment as any).timeToEffect && (
                <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-950/40 dark:to-sky-950/40 text-cyan-700 dark:text-cyan-300 px-3 py-1.5 rounded-full border border-cyan-200/60 dark:border-cyan-800/60 whitespace-normal break-words shadow-sm">
                  <Info size={11} className="flex-shrink-0" />
                  <span className="font-medium text-[11px] uppercase tracking-wide">Effect: {(treatment as any).timeToEffect}</span>
                </span>
              )}
              {treatment.riskLevels && treatment.riskLevels.length > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-full border border-amber-200/60 dark:border-amber-800/60 whitespace-normal break-words shadow-sm">
                  <AlertTriangle size={11} className="flex-shrink-0" />
                  <span className="font-medium text-[11px] uppercase tracking-wide">Best for: {treatment.riskLevels.join(', ')} risk</span>
                </span>
              )}
            </div>
          )}

          {/* LLM Reasoning Display - Premium Glass Panel */}
          {treatment.explanation && treatment.explanation.length > 0 && treatment.explanation[0].ruleId === 'llm' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-4 p-4 relative overflow-hidden rounded-xl border border-violet-200/60 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/80 via-indigo-50/50 to-purple-50/80 dark:from-violet-950/30 dark:via-indigo-950/20 dark:to-purple-950/30 backdrop-blur-sm"
            >
              {/* Decorative glow */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-violet-400/20 via-transparent to-transparent rounded-full blur-2xl" />

              <div className="flex items-center gap-2.5 mb-3 relative">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <Bot size={14} className="text-white" />
                </div>
                <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-200 tracking-tight">
                  AI Reasoning
                </h4>
              </div>
              <p className="text-sm text-violet-700 dark:text-violet-300 leading-relaxed pl-3 border-l-2 border-violet-400/60 dark:border-violet-500/60 break-words relative">
                {treatment.explanation[0].reason}
              </p>
            </motion.div>
          )}

          {/* Metrics Grid - Premium Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {/* Churn Impact Card */}
            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50">
              <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-emerald-400/20 to-transparent rounded-full blur-xl" />
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5 uppercase tracking-wider">Churn Impact</p>
              <p className={cn(
                "text-lg font-bold font-mono tracking-tight",
                treatment.projected_churn_prob_change <= 0
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-rose-700 dark:text-rose-300'
              )}>
                {formatChangePercent(treatment.projected_churn_prob_change)}
              </p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-1 font-medium">
                ~{Math.abs((treatment.effectSize || 0) * 100).toFixed(0)}% reduction
              </p>
            </div>

            {/* ROI Card */}
            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-violet-50 via-indigo-50/50 to-violet-50 dark:from-violet-950/40 dark:via-indigo-950/30 dark:to-violet-950/40 border border-violet-200/60 dark:border-violet-800/50">
              <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-violet-400/20 to-transparent rounded-full blur-xl" />
              <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1.5 uppercase tracking-wider">ROI</p>
              <p className={cn("text-lg font-bold tracking-tight", getRoiClass(treatment.projected_roi))}>
                {formatROI(treatment.projected_roi)}
              </p>
              <p className="text-[10px] text-violet-600/70 dark:text-violet-400/70 mt-1 font-medium">
                {isOngoingCost ? 'over 3 years' : 'one-time'}
              </p>
            </div>

            {/* Cost Card */}
            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-50 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-slate-800/60 border border-slate-200/60 dark:border-slate-700/50">
              <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-slate-300/30 dark:from-slate-600/30 to-transparent rounded-full blur-xl" />
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Cost</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200 font-mono tracking-tight">
                {formatCostPercentage(calculateCostPercentage(treatment.cost, employeeSalary))}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1 font-medium">
                of annual salary
              </p>
            </div>
          </div>

          {/* Expected Post-Treatment Value (ELTV or RVI) */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-3 mb-4 border border-purple-200/50 dark:border-purple-700/50">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400">{isPerformanceMode ? 'Expected RVI Post-Treatment' : 'Expected ELTV Post-Treatment'}</p>
                  <InfoPopover
                    title={isPerformanceMode ? 'RVI Post‑Treatment' : 'ELTV Post‑Treatment'}
                    content={
                      <>
                        {isPerformanceMode ? (
                          <>
                            <p>Expected <strong>RVI</strong> category after applying the selected treatment.</p>
                            <p>Uses the treatment’s predicted churn reduction to update retention and re‑rank value into categories.</p>
                          </>
                        ) : (
                          <>
                            <p>Projected <strong>ELTV</strong> after treatment using the updated survival curve and discounting.</p>
                            <p>Note: display does not subtract treatment cost; ROI reflects cost separately.</p>
                          </>
                        )}
                      </>
                    }
                  >
                    <Info className="w-3.5 h-3.5 text-purple-500 cursor-pointer" />
                  </InfoPopover>
                </div>
                <p className={cn(
                  "text-lg font-bold",
                  isPerformanceMode
                    ? getELTVCategoryClass(treatment.projected_post_eltv || 0)
                    : "text-purple-800 dark:text-purple-200"
                )} title={`Raw value: ${treatment.projected_post_eltv}, Treatment ID: ${treatment.id}`}>
                  {isPerformanceMode
                    ? formatELTVByMode(treatment.projected_post_eltv || 0, 'quality')
                    : formatELTVByMode(treatment.projected_post_eltv || 0, 'quantification')}
                </p>
              </div>
              <TrendingUp className="w-5 h-5 text-purple-500 flex-shrink-0" />
            </div>
          </div>

          {/* Close content wrapper */}
        </div>

        {/* Action Button */}
        <button
          className={`mt-auto w-full py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${isLoading
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-wait'
            : isSelected
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30'
              : 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-800 dark:text-gray-200 hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30 hover:text-blue-700 dark:hover:text-blue-300 border border-gray-300 dark:border-gray-600'
            }`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isLoading) {
              onSelect(treatment);
            }
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm sm:text-base leading-tight text-center">Applying...</span>
            </>
          ) : isSelected ? (
            <>
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white"></div>
              </div>
              <span className="text-sm sm:text-base leading-tight text-center">Applied</span>
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm sm:text-base leading-tight text-center">Apply Treatment</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
});

// function ChartSkeleton() {
//   return (
//     <div className="space-y-4 p-4">
//       <div className="flex justify-between items-center">
//         <SkeletonLoader className="h-6 w-48" />
//         <SkeletonLoader className="h-6 w-6 rounded-full" />
//       </div>
//       <SkeletonLoader className="h-[300px] w-full" />
//        <div className="flex justify-center gap-6 pt-2">
//            <SkeletonLoader className="h-4 w-24" />
//            <SkeletonLoader className="h-4 w-24" />
//        </div>
//     </div>
//   );
// }

// Memoized components
// const MemoizedRiskIndicator = memo(RiskIndicator); // Unused
// Removed unused memos
// const MemoizedEmployeeCard = memo(EmployeeCardSkeleton);
// const MemoizedTreatmentCard = memo(TreatmentCardSkeleton);
// const MemoizedChartSkeleton = memo(ChartSkeleton); // Unused in new tab structure

// Constants
const MAX_SCENARIOS = 5;
const SCENARIO_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const clonePlaygroundEmployeeData = (data: PlaygroundEmployeeData | null): PlaygroundEmployeeData | null => {
  if (!data) return null;
  try {
    return structuredClone(data);
  } catch (_error) {
    return JSON.parse(JSON.stringify(data));
  }
};

const generateScenarioId = (counter: number): string => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `scenario-${counter}-${suffix}`;
};

// Removed createSearchIndex - using simple includes for filtering
// Removed mockTreatments

// -------------------------------------
// Tab Types and Interfaces
// -------------------------------------
type PlaygroundTab = 'scenario' | 'mass-treatment' | 'treatment-tracking' | 'roi-dashboard';

interface ScenarioData {
  id: string;
  name: string;
  color: string;
  employeeId: string;
  treatmentId: number | null;
  data: PlaygroundEmployeeData | null;
  treatmentResult: ApplyTreatmentResult | null;
}

interface MassTreatmentCandidate {
  employee: Employee;
  playgroundData: PlaygroundEmployeeData;
  suggestedTreatments: TreatmentSuggestion[];
  topTreatment: TreatmentSuggestion | null;
  potentialELTVGain: number;
  potentialChurnReduction?: number;
  projectedPostRviCategory?: string | null;
  costPercentage?: number;
  employeeSalaryReference?: number;
  riskLevel: string;
  selectionCriteria?: string[];
  treatmentRationale?: string[];
  // Scoring properties for enhanced insights
  criticalityScore?: number;
  efficiencyScore?: number;
  priorityScore?: number;
  // Runtime status fields for UI/processing
  lastResult?: ApplyTreatmentResult | null;
  isApplying?: boolean;
  lastError?: string | null;
}

// -------------------------------------
// Main Component
// -------------------------------------
export function Playground() {
  const { toast } = useToast();
  const { reportError } = useErrorReporting();
  const { activeProject } = useProject();
  const globalCache = useGlobalDataCache();
  const trainingStatus = globalCache.trainingStatus;
  const hasReasoningData = useMemo(
    () =>
      (globalCache.playgroundEmployees || []).some(
        emp => emp?.hasReasoningData || typeof emp?.reasoningChurnRisk === 'number'
      ),
    [globalCache.playgroundEmployees]
  );
  const isModelReady = trainingStatus?.status === 'complete' || hasReasoningData;
  const location = useLocation();
  const isPerformanceMode = (typeof window !== 'undefined') && (localStorage.getItem('settings.dataMode') === 'performance');

  // Use dynamic risk thresholds
  const { getRiskLevel } = useDynamicRiskRanges();

  // Tab management
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('scenario');
  const [scenarioSubTab, setScenarioSubTab] = useState<'comparison' | 'atlas'>('comparison');
  const [hasDBConnection, setHasDBConnection] = useState(false);

  // Check project data presence in local SQLite (Excel uploads populate this DB)
  useEffect(() => {
    const checkProjectData = async () => {
      try {
        if (!activeProject) return;
        const datasetId = typeof window !== 'undefined' ? localStorage.getItem('activeDatasetId') : null;
        const employees = await employeeService.getEmployees(activeProject.name, datasetId);
        setHasDBConnection(employees && employees.length > 0);
      } catch (_error) {
        setHasDBConnection(false);
      }
    };

    checkProjectData();
    const interval = setInterval(checkProjectData, 30000);
    return () => clearInterval(interval);
  }, [activeProject]);

  // Scenario comparison state
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [nextScenarioId, setNextScenarioId] = useState(1);

  // Mass treatment state
  const [massTreatmentCandidates, setMassTreatmentCandidates] = useState<MassTreatmentCandidate[]>([]);
  const [isLoadingMassTreatment, setIsLoadingMassTreatment] = useState(false);
  const [massTreatmentFilters, setMassTreatmentFilters] = useState({
    riskLevel: '',
    department: '',
    minELTVGain: 0
  });
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [isApplyingBulkTreatment, setIsApplyingBulkTreatment] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    completed: number;
    total: number;
    currentEmployee?: string;
    successful?: number;
    failed?: number;
  }>({ completed: 0, total: 0, successful: 0, failed: 0 });
  const [bulkOperationCancelled, setBulkOperationCancelled] = useState(false);
  const bulkOperationCancelRef = useRef(false);

  // Declare selectedEmployee first before using it in hooks
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const updateCandidateState = useCallback((hrCode: string, updater: (candidate: MassTreatmentCandidate) => MassTreatmentCandidate) => {
    setMassTreatmentCandidates(prev => prev.map(candidate =>
      candidate.employee.hr_code === hrCode ? updater(candidate) : candidate
    ));
  }, [setMassTreatmentCandidates]);

  const applyTreatmentToCandidate = useCallback(async (
    candidate: MassTreatmentCandidate,
    options?: { treatment?: TreatmentSuggestion | null; silent?: boolean }
  ): Promise<ApplyTreatmentResult | null> => {
    const treatment = options?.treatment ?? candidate.topTreatment;
    const silent = options?.silent ?? false;
    const employeeName = candidate.employee.full_name || candidate.employee.name || candidate.employee.hr_code;

    if (!treatment) {
      if (!silent) {
        toast({
          title: 'No Treatment Available',
          description: 'Select a treatment option before applying.',
          variant: 'destructive',
        });
      }
      return null;
    }

    // API is always available

    updateCandidateState(candidate.employee.hr_code, current => ({
      ...current,
      isApplying: true,
      lastError: null,
    }));

    try {
      // Use API for simulation
      const response = await api.post('/playground/simulate', {
        employee_id: candidate.employee.hr_code,
        treatment_id: treatment.id
      });
      const result = response.data;

      if (!result) {
        throw new Error('No response returned from treatment service.');
      }

      updateCandidateState(candidate.employee.hr_code, current => {
        const updatedPlayground = current.playgroundData ? {
          ...current.playgroundData,
          current_churn_probability: result.post_churn_probability ?? current.playgroundData.current_churn_probability,
          current_eltv: result.eltv_post_treatment ?? current.playgroundData.current_eltv,
          current_survival_probabilities: result.new_survival_probabilities ?? current.playgroundData.current_survival_probabilities,
        } : current.playgroundData;

        const churnReduction = (result.pre_churn_probability != null && result.post_churn_probability != null)
          ? Math.max(0, result.pre_churn_probability - result.post_churn_probability)
          : current.potentialChurnReduction ?? 0;
        const projectedRviCategory = formatELTVByMode(result.eltv_post_treatment ?? updatedPlayground?.current_eltv ?? 0, 'quality');
        const salaryRef = current.employeeSalaryReference || current.employee.salary || updatedPlayground?.current_features?.employee_cost || 0;
        const updatedCostPercentage = calculateCostPercentage(
          result.treatment_cost ?? treatment.cost ?? 0,
          salaryRef
        );

        return {
          ...current,
          isApplying: false,
          lastResult: result,
          lastError: null,
          topTreatment: treatment,
          potentialELTVGain: result.treatment_effect_eltv ?? current.potentialELTVGain,
          potentialChurnReduction: churnReduction,
          projectedPostRviCategory: projectedRviCategory,
          costPercentage: Number.isFinite(updatedCostPercentage) && updatedCostPercentage > 0 ? updatedCostPercentage : current.costPercentage,
          employeeSalaryReference: salaryRef || current.employeeSalaryReference,
          playgroundData: updatedPlayground,
        };
      });

      setSelectedCandidates(prev => {
        if (!prev.has(candidate.employee.hr_code)) return prev;
        const next = new Set(prev);
        next.delete(candidate.employee.hr_code);
        return next;
      });

      if (!silent) {
        if (isPerformanceMode) {
          const churnDrop = (result.pre_churn_probability != null && result.post_churn_probability != null)
            ? Math.max(0, result.pre_churn_probability - result.post_churn_probability)
            : null;
          const churnText = churnDrop !== null ? `${(churnDrop * 100).toFixed(1)}% churn drop` : 'Churn drop recorded';
          const projectedRvi = formatELTVByMode(result.eltv_post_treatment ?? candidate.playgroundData.current_eltv ?? 0, 'quality');
          toast({
            title: `Treatment applied to ${employeeName}`,
            description: `${churnText} • RVI ${projectedRvi}`,
          });
        } else {
          const gain = result.treatment_effect_eltv ?? 0;
          const roiPercent = (result.roi ?? 0) * 100;
          toast({
            title: `Treatment applied to ${employeeName}`,
            description: `${formatCurrency(gain)} ELTV gain • ROI ${roiPercent.toFixed(1)}%`,
          });
        }
      }

      return result;
    } catch (error: any) {
      const message = error?.message || 'Failed to apply treatment.';

      updateCandidateState(candidate.employee.hr_code, current => ({
        ...current,
        isApplying: false,
        lastError: message,
      }));

      if (!silent) {
        toast({
          title: 'Error applying treatment',
          description: message,
          variant: 'destructive',
        });
      }

      throw error;
    }
  }, [toast, updateCandidateState, setSelectedCandidates, isPerformanceMode]);

  // Enhanced bulk treatment application leveraging shared helper
  const applyBulkTreatment = useCallback(async () => {
    const selectedCandidatesList = massTreatmentCandidates.filter(candidate =>
      selectedCandidates.has(candidate.employee.hr_code)
    );

    if (selectedCandidatesList.length === 0) {
      toast({
        title: 'No Selection',
        description: 'Please select employees to apply treatments to.',
        variant: 'destructive',
      });
      return;
    }

    // Service availability check removed - using backend API

    setIsApplyingBulkTreatment(true);
    setBulkOperationCancelled(false);
    bulkOperationCancelRef.current = false;
    setBulkProgress({ completed: 0, total: selectedCandidatesList.length, successful: 0, failed: 0 });

    let completed = 0;
    let successful = 0;
    const errors: Array<{ employee: string; error: string }> = [];

    for (const candidate of selectedCandidatesList) {
      if (bulkOperationCancelRef.current) {
        setBulkOperationCancelled(true);
        break;
      }

      const employeeName = candidate.employee.full_name || candidate.employee.name || candidate.employee.hr_code;

      setBulkProgress({
        completed,
        total: selectedCandidatesList.length,
        currentEmployee: `→ ${employeeName}`,
        successful,
        failed: errors.length,
      });

      try {
        await applyTreatmentToCandidate(candidate, { silent: true });
        completed += 1;
        successful += 1;
        setBulkProgress({
          completed,
          total: selectedCandidatesList.length,
          currentEmployee: `✓ ${employeeName}`,
          successful,
          failed: errors.length,
        });
      } catch (error: any) {
        completed += 1;
        const message = error?.message || 'Unknown error occurred';
        errors.push({ employee: employeeName, error: message });
        reportError(error, `Bulk Treatment - ${employeeName}`, {
          employeeHrCode: candidate.employee.hr_code,
          treatmentId: candidate.topTreatment?.id,
        });
        setBulkProgress({
          completed,
          total: selectedCandidatesList.length,
          currentEmployee: `⚠ ${employeeName}`,
          successful,
          failed: errors.length,
        });
      }

      if (bulkOperationCancelRef.current) {
        setBulkOperationCancelled(true);
        break;
      }
    }

    setIsApplyingBulkTreatment(false);
    setBulkProgress(prev => ({ ...prev, currentEmployee: undefined }));

    if (bulkOperationCancelRef.current) {
      toast({
        title: 'Bulk treatment cancelled',
        description: `Completed ${successful} applications before cancellation.`,
      });
      return;
    }

    if (errors.length > 0) {
      const failedPreview = errors.slice(0, 3).map(e => e.employee).join(', ');
      toast({
        title: 'Bulk treatment completed with issues',
        description: `${successful} succeeded, ${errors.length} failed.${failedPreview ? ` Issues: ${failedPreview}${errors.length > 3 ? '…' : ''}` : ''}`,
        variant: 'destructive',
        duration: 8000,
      });
    } else {
      toast({
        title: 'Bulk treatment applied',
        description: `Successfully applied treatments to ${successful} employees.`,
      });
    }
  }, [applyTreatmentToCandidate, massTreatmentCandidates, reportError, selectedCandidates, toast]);

  // Function to cancel bulk treatment operation
  const cancelBulkTreatment = useCallback(() => {
    bulkOperationCancelRef.current = true;
    setBulkOperationCancelled(true);
    toast({
      title: "Cancelling Operation",
      description: "Bulk treatment will stop after the current employee.",
      variant: "default",
    });
  }, [toast]);

  // Add reasoning hooks for enhanced data
  // const { fetchBatchReasoning, reasoningData, isLoading: isLoadingReasoning } = useBatchReasoning();
  // const { reasoning: selectedEmployeeReasoning, isLoading: isLoadingSelectedReasoning } = useEmployeeReasoning(
  //   selectedEmployee?.hr_code || null
  // );

  // Ref to track if loading is in progress
  const isLoadingBaseEmployeesRef = useRef(false);

  // State for base employee list
  // const [employees, setEmployees] = useState<Employee[]>([]); // Will use globalCache.playgroundEmployees directly more

  // State for selected employee and detailed data
  const [selectedEmployeeData, setSelectedEmployeeData] = useState<PlaygroundEmployeeData | null>(null);

  // State for treatments
  const [selectedTreatment, setSelectedTreatment] = useState<TreatmentSuggestion | null>(null);
  const [treatmentSuggestions, setTreatmentSuggestions] = useState<TreatmentSuggestion[]>([]);

  // ELTV display mode
  // removed eltvMode toggle; display is governed by Settings data mode

  // State for simulation/application result
  const [applyTreatmentResult, setApplyTreatmentResult] = useState<ApplyTreatmentResult | null>(null);

  // Loading states
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true); // For initial load from cache
  const [isLoadingPlaygroundData, setIsLoadingPlaygroundData] = useState(false); // For selected employee's detailed data
  const [isApplyingTreatment, setIsApplyingTreatment] = useState(false);

  // UI State for Sidebar
  const [error, setError] = useState<string | null>(null); // For data loading errors
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [sortBy, setSortBy] = useState<string>('risk'); // Made stateful for UI control
  const [isSorting, setIsSorting] = useState(false); // Added

  const [budget, setBudget] = useState<number | null>(null); // State for budget input

  // Function to apply selected treatment
  const applyTreatment = useCallback(async (treatment: TreatmentSuggestion) => {
    if (!selectedEmployee) {
      return;
    }

    const baselineSnapshot = clonePlaygroundEmployeeData(selectedEmployeeData);

    setIsApplyingTreatment(true);
    setSelectedTreatment(treatment);

    try {
      // Use API for simulation
      const response = await api.post('/playground/simulate', {
        employee_id: selectedEmployee.hr_code,
        treatment_id: treatment.id
      });
      const result = response.data;

      setApplyTreatmentResult(result);
      if (result) {
        setSelectedEmployeeData(prev => prev ? {
          ...prev,
          current_churn_probability: result.post_churn_probability ?? prev.current_churn_probability,
          current_eltv: result.eltv_post_treatment ?? prev.current_eltv,
          current_survival_probabilities: result.new_survival_probabilities ?? prev.current_survival_probabilities,
        } : prev);

        setSelectedEmployee(prev => prev ? {
          ...prev,
          churnProbability: result.post_churn_probability ?? prev.churnProbability,
          currentELTV: result.eltv_post_treatment ?? prev.currentELTV,
        } : prev);

        if (baselineSnapshot) {
          let scenarioAdded = false;
          let scenarioLimitReached = false;

          setScenarios(prev => {
            const existingIndex = prev.findIndex(scenario =>
              scenario.employeeId === selectedEmployee.hr_code && scenario.treatmentId === treatment.id
            );

            if (existingIndex !== -1) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                data: baselineSnapshot,
                treatmentId: treatment.id,
                treatmentResult: result,
              };
              return updated;
            }

            if (prev.length >= MAX_SCENARIOS) {
              scenarioLimitReached = true;
              return prev;
            }

            const baseName = treatment.name?.trim() || `Scenario ${nextScenarioId}`;
            const duplicateCount = prev.filter(s => s.name === baseName || s.name.startsWith(`${baseName} (`)).length;
            const scenarioName = duplicateCount === 0 ? baseName : `${baseName} (${duplicateCount + 1})`;

            const newScenario: ScenarioData = {
              id: generateScenarioId(nextScenarioId),
              name: scenarioName,
              color: SCENARIO_COLORS[(nextScenarioId - 1) % SCENARIO_COLORS.length],
              employeeId: selectedEmployee.hr_code,
              treatmentId: treatment.id,
              data: baselineSnapshot,
              treatmentResult: result,
            };

            scenarioAdded = true;
            return [...prev, newScenario];
          });

          if (scenarioAdded) {
            setNextScenarioId(prev => prev + 1);
          } else if (scenarioLimitReached) {
            toast({
              title: 'Scenario limit reached',
              description: `You can only keep up to ${MAX_SCENARIOS} scenarios at a time. Remove one before adding another.`,
              variant: 'destructive',
            });
          }
        }
      }

      toast({
        title: "Treatment Applied",
        description: `Successfully applied "${treatment.name}" to ${selectedEmployee.name}`,
      });

    } catch (error: any) {
      setApplyTreatmentResult(null);

      toast({
        title: "Error",
        description: `Failed to apply treatment: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsApplyingTreatment(false);
    }
  }, [selectedEmployee, selectedEmployeeData, toast, setScenarios, nextScenarioId, setNextScenarioId]);

  // --- Sort Options (Consistent with AIAssistant) ---
  const sortOptions = [
    { id: 'risk', label: 'Risk Level' },
    { id: 'name', label: 'Name' },
    { id: 'department', label: 'Department' },
    { id: 'eltv', label: 'Current ELTV' }
  ];

  // --- Handle Sort Change (Consistent with AIAssistant) ---
  const handleSortChange = useCallback((value: string) => {
    // Assuming globalCache.playgroundEmployees might be large
    if (globalCache.playgroundEmployees && globalCache.playgroundEmployees.length > 500) {
      setIsSorting(true);
      setTimeout(() => {
        setSortBy(value);
        setIsSorting(false);
      }, 0);
    } else {
      setSortBy(value);
    }
  }, [globalCache.playgroundEmployees]);


  // Debounced search term for performance
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Base filtered data (before dropdown filters) for cascade filtering
  const baseFilteredEmployees = useMemo(() => {
    const employees = globalCache.playgroundEmployees;
    if (!employees?.length) return [];

    // Filter for active employees first
    let filtered = employees.filter(emp => emp.status === 'Active');

    // Apply search filter only
    if (debouncedSearchTerm.trim()) {
      const searchTermLower = debouncedSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(searchTermLower) ||
        (emp.position || '').toLowerCase().includes(searchTermLower) ||
        (emp.department || '').toLowerCase().includes(searchTermLower)
      );
    }

    return filtered;
  }, [globalCache.playgroundEmployees, debouncedSearchTerm]);

  // Cascade filter options based on current selections
  const availableDepartments = useMemo(() => {
    let dataForDepts = baseFilteredEmployees;

    // Apply other active filters except department
    if (selectedPosition) {
      dataForDepts = dataForDepts.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }
    if (selectedRiskLevel) {
      dataForDepts = dataForDepts.filter(emp => {
        const probability = emp.churnProbability || 0;
        const calculatedRiskLevel = getRiskLevel(probability);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }

    return Array.from(new Set(dataForDepts.map(emp => emp.department || 'N/A'))).sort();
  }, [baseFilteredEmployees, selectedPosition, selectedRiskLevel, getRiskLevel]);

  const availablePositions = useMemo(() => {
    let dataForPositions = baseFilteredEmployees;

    // Apply other active filters except position
    if (selectedDepartment) {
      dataForPositions = dataForPositions.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }
    if (selectedRiskLevel) {
      dataForPositions = dataForPositions.filter(emp => {
        const probability = emp.churnProbability || 0;
        const calculatedRiskLevel = getRiskLevel(probability);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }

    return Array.from(new Set(dataForPositions.map(emp => emp.position || 'N/A'))).sort();
  }, [baseFilteredEmployees, selectedDepartment, selectedRiskLevel, getRiskLevel]);

  const availableRiskLevels = useMemo(() => {
    let dataForRisk = baseFilteredEmployees;

    // Apply other active filters except risk level
    if (selectedDepartment) {
      dataForRisk = dataForRisk.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }
    if (selectedPosition) {
      dataForRisk = dataForRisk.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }

    const riskLevels = dataForRisk.map(emp => {
      const probability = emp.churnProbability || 0;
      return getRiskLevel(probability);
    });

    return Array.from(new Set(riskLevels)).sort();
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, getRiskLevel]);

  // Final filtered data with all filters applied
  const filteredEmployeesMemo = useMemo(() => {
    let filtered = baseFilteredEmployees;

    // Apply dropdown filters
    if (selectedDepartment) {
      filtered = filtered.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }

    if (selectedPosition) {
      filtered = filtered.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }

    if (selectedRiskLevel) {
      filtered = filtered.filter(emp => {
        const probability = emp.churnProbability || 0;
        const calculatedRiskLevel = getRiskLevel(probability);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }

    return filtered;
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, getRiskLevel]);

  // Optimized sorting matching AI Assistant approach
  const sortedEmployeesMemo = useMemo(() => {
    if (!filteredEmployeesMemo.length) return [];

    const sorted = [...filteredEmployeesMemo];

    if (sortBy === 'risk') {
      sorted.sort((a, b) => (b.churnProbability ?? 0) - (a.churnProbability ?? 0));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'department') {
      sorted.sort((a, b) => (a.department || '').localeCompare(b.department || ''));
    } else if (sortBy === 'eltv') {
      sorted.sort((a, b) => (b.currentELTV ?? (b.churnProbability ?? 0)) - (a.currentELTV ?? (a.churnProbability ?? 0)));
    }

    return sorted;
  }, [filteredEmployeesMemo, sortBy]);

  // Debug logging for employee data
  // Removed debug logging for production

  // Stable employee selection - avoid dependency on selectedEmployee object
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  // --- Employee Selection Logic --- (Moved earlier to be available for list renderers)
  const handleEmployeeSelect = useCallback(async (employeeId: number, treatmentIdToSelect?: number) => {
    if (isLoadingPlaygroundData || selectedEmployeeId === employeeId) return; // Prevent double-loading

    // Find employee by ID from the current dataset
    const employee = globalCache.playgroundEmployees?.find(emp => emp.id === employeeId);
    if (!employee) return;

    setIsLoadingPlaygroundData(true);
    setError(null); // setError was previously removed, but error is used in JSX

    setSelectedEmployeeId(employeeId);
    setSelectedEmployee(employee);
    setSelectedEmployeeData(null);

    // API is always available

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const [playgroundData, suggestionsResult, aiTreatments] = await Promise.all([
          api.get(`/playground/data/${employee.hr_code}`).then(r => r.data),
          api.get(`/playground/treatments/${employee.hr_code}`).then(r => r.data),
          employeeService.generateTreatments(employee.hr_code)
        ]);

        if (!playgroundData || !suggestionsResult) {
          const errorMsg = "Incomplete data received from backend.";

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            continue;
          }
          throw new Error(errorMsg);
        }

        setSelectedEmployeeData(playgroundData);

        // Combine existing suggestions with AI treatments
        // Ensure AI treatments have unique IDs if they don't already
        const formattedAiTreatments = aiTreatments.map((t, index) => ({
          ...t,
          id: t.id || 1000 + index, // Temporary ID assignment if missing
          projected_churn_prob_change: t.projected_churn_prob_change || -0.05, // Default impact if missing
          projected_roi: t.projected_roi || 'medium',
          cost: t.estimated_cost || 0
        }));

        const combinedSuggestions: TreatmentSuggestion[] = [...(suggestionsResult || []), ...formattedAiTreatments];
        setTreatmentSuggestions(combinedSuggestions);

        // Switch to scenario tab to show employee details
        setActiveTab('scenario');

        if (treatmentIdToSelect && combinedSuggestions.length > 0) {
          const treatmentToSelect = combinedSuggestions.find(t => t.id === treatmentIdToSelect);
          if (treatmentToSelect) {
            await applyTreatment(treatmentToSelect);
          }
        }

        toast({
          title: "Data loaded successfully",
          description: `Loaded risk analysis and generated ${aiTreatments.length} AI treatments for ${employee.name}.`,
          variant: "default"
        });

        setIsLoadingPlaygroundData(false);
        return;
      } catch (err: any) {
        lastError = err;

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 600 * attempt));
          continue;
        }
      }
    }
    setError(`Failed to load data for ${employee.name}: ${lastError?.message || 'Unknown error'}`);

    toast({
      title: "Error loading data",
      description: `Failed to load data for ${employee.name}. Please try again.`,
      variant: "destructive"
    });

    setTimeout(() => {
      setSelectedEmployee(null);
      setSelectedEmployeeId(null);
    }, 2000);
    setIsLoadingPlaygroundData(false);
  }, [isLoadingPlaygroundData, selectedEmployeeId, globalCache.playgroundEmployees, toast, applyTreatment]);

  // --- Employee List Rendering (Now defined after handleEmployeeSelect) ---
  const ROW_HEIGHT = 95;

  // Memoized employee row component matching AI Assistant
  const EmployeeRow = memo(({
    employee,
    isSelected,
    onClick,
    style
  }: {
    employee: Employee;
    isSelected: boolean;
    onClick: () => void;
    style?: React.CSSProperties;
  }) => {
    const riskScore = employee.churnProbability ?? 0;

    return (
      <motion.button
        onClick={onClick}
        style={style}
        className={`
          w-full p-3 rounded-lg text-left
          transition-all duration-300
          ${isSelected
            ? 'bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-900/30 dark:to-transparent border-emerald-200 dark:border-emerald-800'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-transparent'
          }
          border relative group overflow-hidden
          dark:bg-gray-800 dark:text-gray-100
        `}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        data-employee-id={employee.id}
        data-component="employee-row"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent dark:from-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {employee.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {employee.position}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {employee.department}
              </p>
            </div>
            <RiskIndicator riskScore={riskScore} size="sm" showIcon={true} />
          </div>
        </div>
      </motion.button>
    );
  });

  const EmployeeRowRenderer = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const employee = sortedEmployeesMemo[index];
    if (!employee) return null;
    return (
      <div style={style}>
        <EmployeeRow
          key={employee.id}
          employee={employee}
          isSelected={selectedEmployeeId === employee.id}
          onClick={() => handleEmployeeSelect(employee.id)}
        />
      </div>
    );
  }, [sortedEmployeesMemo, selectedEmployeeId, handleEmployeeSelect]);

  const MemoizedEmployeeList = useMemo(() => (
    <AutoSizer>
      {({ height, width }) => (
        <List
          height={height}
          width={width}
          itemCount={sortedEmployeesMemo.length}
          itemSize={ROW_HEIGHT}
          overscanCount={5}
          className="bg-transparent dark:bg-transparent"
        >
          {EmployeeRowRenderer}
        </List>
      )}
    </AutoSizer>
  ), [sortedEmployeesMemo, selectedEmployeeId, EmployeeRowRenderer]);
  // --- End Employee List Rendering ---

  // --- Load Base Employee List ---
  useEffect(() => {
    if (!activeProject) {
      setIsLoadingEmployees(false);
      // setEmployees([]); // Removed, will derive from globalCache
      setError(null);
      return;
    }

    const loadBaseEmployeesFromCache = async () => {
      if (isLoadingBaseEmployeesRef.current) {
        return;
      }
      isLoadingBaseEmployeesRef.current = true;
      setIsLoadingEmployees(true);
      setError(null);
      try {
        // Use fetchPlaygroundData if it's specifically for playground, or fetchHomeData if it's the general one
        // Assuming fetchHomeData populates playgroundEmployees or a similar field
        if (!globalCache.playgroundEmployees || globalCache.playgroundEmployees.length === 0) {
          await globalCache.fetchHomeData(activeProject?.id || null);
        } else {
          // Data already loaded
        }
      } catch (err) {
        setError('Failed to load employee list. Please try again.');
      } finally {
        setIsLoadingEmployees(false);
        isLoadingBaseEmployeesRef.current = false;
      }
    };

    loadBaseEmployeesFromCache();
  }, [activeProject, globalCache.fetchHomeData, globalCache.playgroundEmployees]); // Depend on playgroundEmployees from cache

  useEffect(() => {
    const state = location.state as { hrCode?: string; selectedTreatmentId?: number };
    if (state?.hrCode && globalCache.playgroundEmployees && globalCache.playgroundEmployees.length > 0) {
      const employeeToSelect = globalCache.playgroundEmployees.find(e => e.hr_code === state.hrCode);
      if (employeeToSelect && employeeToSelect.id !== selectedEmployeeId) {
        handleEmployeeSelect(employeeToSelect.id, state.selectedTreatmentId);
      }
    }
  }, [location.state, globalCache.playgroundEmployees, handleEmployeeSelect, selectedEmployeeId]);

  // No longer need to set local 'employees' state directly from globalCache.playgroundEmployees here,
  // as 'filteredEmployees' and 'sortedEmployees' will derive directly from globalCache.playgroundEmployees.
  // The filtering for 'Active' status is now within 'filteredEmployees' useMemo.



  // --- Chart Data Transform ---
  const transformSurvivalProbabilities = useCallback(() => {
    if (!selectedEmployeeData) return [];

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const baseSurvival = selectedEmployeeData.current_survival_probabilities;

    // Use survival probabilities from treatment results
    let modifiedSurvival = baseSurvival;
    if (applyTreatmentResult?.new_survival_probabilities) {
      modifiedSurvival = applyTreatmentResult.new_survival_probabilities;
    }

    return months.map(month => {
      const monthKey = `month_${month}`;
      const baselineProb = (baseSurvival?.[monthKey] ?? 0) * 100;
      const newProb = (modifiedSurvival?.[monthKey] ?? baselineProb / 100) * 100;

      return {
        month,
        "Without Treatment": baselineProb,
        "With Treatment": newProb,
      };
    });
  }, [selectedEmployeeData, applyTreatmentResult]);

  // Memoized chart data transformation
  const transformedChartData = useMemo(transformSurvivalProbabilities, [transformSurvivalProbabilities]);

  // Chart config
  // const chartConfig = {
  //   colors: {
  //     "Without Treatment": '#94a3b8',
  //     "With Treatment": '#3b82f6',
  //   }
  // };

  // --- UI Rendering ---

  if (isLoadingEmployees) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="opacity-100">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900">
        <FlaskConical className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          No Project Active
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Please select or create a project to use the Playground.
        </p>
      </div>
    );
  }

  if (!isModelReady) {
    return <ModelTrainingRequired status={trainingStatus?.status} message={trainingStatus?.message} />;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <PageHeader
        title={isPerformanceMode ? 'RVI Playground' : 'ELTV Playground'}
        subtitle={isPerformanceMode
          ? 'Simulate retention scenarios and see the projected impact on Retention Value Index'
          : 'Simulate retention scenarios and see the projected impact on ELTV and churn risk'}
        icon={Beaker}
        badges={[
          { label: 'Atlas', variant: 'blue' },
          { label: 'Beta', variant: 'emerald', pulse: true },
        ]}
      />

      <div className="px-6 md:px-8 py-4 flex-shrink-0">
        <TrainingReminderBanner />
      </div>

      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar matching AI Assistant styling */}
        <aside className="w-[340px] flex-none flex flex-col bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-700 overflow-hidden">
          <div className="flex-none p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Team Members</h2>
            <p className="text-xs text-gray-500 mt-1">
              {sortedEmployeesMemo.length} employees found
            </p>
          </div>

          <div className="flex-none p-4 border-b border-gray-100 dark:border-gray-800">
            {error && !isLoadingPlaygroundData && (
              <div className="p-3 mb-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employees..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
              <div>
                {searchTerm.trim() ? (
                  <>Found <span className="font-medium text-gray-700 dark:text-gray-200">{sortedEmployeesMemo.length}</span> {sortedEmployeesMemo.length === 1 ? 'employee' : 'employees'}</>
                ) : (
                  <>{(globalCache.playgroundEmployees || []).length} total employees</>
                )}
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="space-y-2 mb-4">
              <select
                value={sortBy}
                onChange={e => handleSortChange(e.target.value)}
                disabled={isSorting}
                className={`w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-emerald-600 dark:focus:border-emerald-600 ${isSorting ? 'opacity-50 cursor-wait' : ''}`}
              >
                {sortOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    Sort by: {option.label} {isSorting && '(sorting...)'}
                  </option>
                ))}
              </select>

              <select
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Departments ({availableDepartments.length})</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <select
                value={selectedRiskLevel}
                onChange={e => setSelectedRiskLevel(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Risk Levels ({availableRiskLevels.length})</option>
                {availableRiskLevels.map(level => (
                  <option key={level} value={level}>
                    {level} Risk
                  </option>
                ))}
              </select>

              <select
                value={selectedPosition}
                onChange={e => setSelectedPosition(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Positions ({availablePositions.length})</option>
                {availablePositions.map(pos => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap gap-1 mb-3">
              {(selectedDepartment || selectedRiskLevel || selectedPosition) && (
                <button
                  onClick={() => {
                    setSelectedDepartment('');
                    setSelectedRiskLevel('');
                    setSelectedPosition('');
                  }}
                  className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs rounded-full hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                >
                  Clear All
                </button>
              )}
              {selectedDepartment && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs rounded-full">
                  Dept: {selectedDepartment}
                </span>
              )}
              {selectedRiskLevel && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs rounded-full">
                  Risk: {selectedRiskLevel}
                </span>
              )}
              {selectedPosition && (
                <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs rounded-full">
                  Pos: {selectedPosition}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {isLoadingEmployees ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-lg border border-gray-100 dark:border-gray-800 animate-pulse h-[83px] bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : sortedEmployeesMemo.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Calculator className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <h3 className="text-gray-900 dark:text-gray-100 font-medium mb-1">No employees found</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              MemoizedEmployeeList
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-gray-100/50 dark:bg-gray-800/30 overflow-hidden">
          <div className="flex flex-col p-4 md:p-6 space-y-4 h-full overflow-y-auto">
            {isLoadingPlaygroundData ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>Loading employee details...</p>
              </div>
            ) : error && !selectedEmployeeData ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                <AlertTriangle className="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Error Loading Data</h3>
                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
              </div>
            ) : (
              <div className="flex flex-col h-full space-y-5">

                {/* Premium Tab Navigation */}
                <div className="relative">
                  {/* Ambient glow behind tabs */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-violet-500/5 dark:from-violet-500/10 dark:via-indigo-500/10 dark:to-violet-500/10 rounded-2xl blur-xl opacity-60" />

                  <div className="relative flex p-1.5 gap-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 backdrop-blur-sm">
                    <button
                      onClick={() => setActiveTab('scenario')}
                      className={cn(
                        "group relative flex-1 flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium rounded-lg transition-all duration-300 overflow-hidden",
                        activeTab === 'scenario'
                          ? "bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-200/80 dark:border-slate-700/60"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/30"
                      )}
                    >
                      {activeTab === 'scenario' && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-transparent to-indigo-500/5 dark:from-violet-500/10 dark:to-indigo-500/10"
                          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                        />
                      )}
                      <GitCompare className={cn(
                        "w-4 h-4 transition-colors relative z-10",
                        activeTab === 'scenario' ? "text-violet-600 dark:text-violet-400" : ""
                      )} />
                      <span className="relative z-10">Scenario Lab</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('roi-dashboard')}
                      className={cn(
                        "group relative flex-1 flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium rounded-lg transition-all duration-300 overflow-hidden",
                        activeTab === 'roi-dashboard'
                          ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-200/80 dark:border-slate-700/60"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/30"
                      )}
                    >
                      {activeTab === 'roi-dashboard' && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/10"
                          transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                        />
                      )}
                      <TrendingUp className={cn(
                        "w-4 h-4 transition-colors relative z-10",
                        activeTab === 'roi-dashboard' ? "text-emerald-600 dark:text-emerald-400" : ""
                      )} />
                      <span className="relative z-10">ROI Dashboard</span>
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'scenario' ? (
                  <div className="space-y-4">
                    {/* Premium Scenario Sub-Tab Navigation */}
                    <div className="flex items-center gap-1 p-1 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-slate-200/40 dark:border-slate-700/30 w-fit">
                      <button
                        onClick={() => setScenarioSubTab('comparison')}
                        className={cn(
                          "relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
                          scenarioSubTab === 'comparison'
                            ? "bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 shadow-sm border border-slate-200/60 dark:border-slate-600/40"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/40"
                        )}
                      >
                        <GitCompare className="w-4 h-4" />
                        <span>Treatment Comparison</span>
                        {scenarioSubTab === 'comparison' && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400" />
                        )}
                      </button>
                      <button
                        onClick={() => setScenarioSubTab('atlas')}
                        className={cn(
                          "relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
                          scenarioSubTab === 'atlas'
                            ? "bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-sm border border-slate-200/60 dark:border-slate-600/40"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/40"
                        )}
                      >
                        <Beaker className="w-4 h-4" />
                        <span>Atlas Simulator</span>
                        {scenarioSubTab === 'atlas' && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                        )}
                      </button>
                    </div>

                    {/* Scenario Sub-Tab Content */}
                    {scenarioSubTab === 'comparison' ? (
                      <RedesignedScenarioTab
                        selectedEmployee={selectedEmployee}
                        selectedEmployeeData={selectedEmployeeData}
                        treatmentSuggestions={treatmentSuggestions}
                        applyTreatment={applyTreatment}
                        isApplyingTreatment={isApplyingTreatment}
                        selectedTreatment={selectedTreatment}
                        applyTreatmentResult={applyTreatmentResult}
                        isPerformanceMode={isPerformanceMode}
                        budget={budget}
                        transformedChartData={transformedChartData}
                        onResetSimulation={() => {
                          setApplyTreatmentResult(null);
                          setSelectedTreatment(null);
                        }}
                      />
                    ) : (
                      <AtlasSimulatorSubTab
                        selectedEmployeeId={selectedEmployee?.hr_code}
                      />
                    )}
                  </div>
                ) : activeTab === 'mass-treatment' ? (
                  <MassTreatmentTab
                    candidates={massTreatmentCandidates}
                    setCandidates={setMassTreatmentCandidates}
                    isLoading={isLoadingMassTreatment}
                    setIsLoading={setIsLoadingMassTreatment}
                    isPerformanceMode={isPerformanceMode}
                    filters={massTreatmentFilters}
                    setFilters={setMassTreatmentFilters}
                    employees={sortedEmployeesMemo}
                    getRiskLevel={getRiskLevel}
                    toast={toast}
                    handleEmployeeSelect={handleEmployeeSelect}
                    setActiveTab={setActiveTab}
                    selectedCandidates={selectedCandidates}
                    setSelectedCandidates={setSelectedCandidates}
                    isApplyingBulkTreatment={isApplyingBulkTreatment}
                    bulkProgress={bulkProgress}
                    applyBulkTreatment={applyBulkTreatment}
                    applyCandidateTreatment={applyTreatmentToCandidate}
                    bulkOperationCancelled={bulkOperationCancelled}
                    cancelBulkTreatment={cancelBulkTreatment}
                  />
                ) : activeTab === 'treatment-tracking' ? (
                  <div className="space-y-6">
                    <TreatmentTracker
                      selectedEmployee={selectedEmployee ? {
                        hr_code: selectedEmployee.hr_code,
                        name: selectedEmployee.name,
                        churn_probability: selectedEmployee.churnProbability
                      } : undefined}
                      isVisible={true}
                      hasDBConnection={hasDBConnection}
                      isPerformanceMode={isPerformanceMode}
                    />
                  </div>
                ) : activeTab === 'roi-dashboard' ? (
                  <ROIDashboardTab />
                ) : null}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// -------------------------------------
// Scenario Comparison Tab Component
// -------------------------------------
const ScenarioComparisonTab = memo(({
  scenarios,
  setScenarios,
  nextScenarioId,
  setNextScenarioId,
  selectedEmployee,
  selectedEmployeeData,
  treatmentSuggestions,
  applyTreatment,
  isApplyingTreatment,
  selectedTreatment,
  isPerformanceMode,

  budget,
  transformedChartData
}: {
  scenarios: ScenarioData[];
  setScenarios: React.Dispatch<React.SetStateAction<ScenarioData[]>>;
  nextScenarioId: number;
  setNextScenarioId: React.Dispatch<React.SetStateAction<number>>;
  selectedEmployee: Employee | null;
  selectedEmployeeData: PlaygroundEmployeeData | null;
  treatmentSuggestions: TreatmentSuggestion[];
  applyTreatment: (treatment: TreatmentSuggestion) => Promise<void>;
  isApplyingTreatment: boolean;
  selectedTreatment: TreatmentSuggestion | null;
  isPerformanceMode: boolean;

  budget: number | null;
  transformedChartData: any[];
}) => {
  const addScenario = useCallback(() => {
    if (!selectedEmployee || !selectedEmployeeData || scenarios.length >= MAX_SCENARIOS) return;

    const newScenario: ScenarioData = {
      id: generateScenarioId(nextScenarioId),
      name: `Scenario ${nextScenarioId}`,
      color: SCENARIO_COLORS[(nextScenarioId - 1) % SCENARIO_COLORS.length],
      employeeId: selectedEmployee.hr_code,
      treatmentId: null,
      data: selectedEmployeeData,
      treatmentResult: null
    };

    setScenarios(prev => [...prev, newScenario]);
    setNextScenarioId(prev => prev + 1);
  }, [selectedEmployee, selectedEmployeeData, scenarios, nextScenarioId, setScenarios, setNextScenarioId]);

  const removeScenario = useCallback((scenarioId: string) => {
    setScenarios(prev => prev.filter(s => s.id !== scenarioId));
  }, [setScenarios]);

  const updateScenarioTreatment = useCallback(async (scenarioId: string, treatmentId: number | null) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    if (treatmentId === null) {
      setScenarios(prev => prev.map(s =>
        s.id === scenarioId
          ? { ...s, treatmentId: null, treatmentResult: null }
          : s
      ));
      return;
    }

    // Backend API call will be used instead

    const previousTreatmentId = scenario.treatmentId;
    const previousResult = scenario.treatmentResult;
    const baselineSnapshot = clonePlaygroundEmployeeData(scenario.data);

    setScenarios(prev => prev.map(s =>
      s.id === scenarioId
        ? { ...s, treatmentId, treatmentResult: null }
        : s
    ));

    try {
      const response = await api.post('/playground/simulate', {
        employee_id: scenario.employeeId,
        treatment_id: treatmentId
      });

      const result = response.data;

      setScenarios(prev => prev.map(s =>
        s.id === scenarioId
          ? {
            ...s,
            data: baselineSnapshot ?? s.data,
            treatmentId,
            treatmentResult: result,
          }
          : s
      ));
    } catch (_error) {
      setScenarios(prev => prev.map(s =>
        s.id === scenarioId
          ? {
            ...s,
            treatmentId: previousTreatmentId,
            treatmentResult: previousResult,
          }
          : s
      ));
    }
  }, [scenarios, setScenarios]);

  // Transform scenarios data for multi-line chart
  const scenarioChartData = useMemo(() => {
    if (scenarios.length === 0) return transformedChartData;

    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    return months.map(month => {
      const monthKey = `month_${month}`;
      const dataPoint: any = { month };

      scenarios.forEach(scenario => {
        if (scenario.data) {
          const baselineProb = (scenario.data.current_survival_probabilities?.[monthKey] ?? 0) * 100;
          const treatmentProb = scenario.treatmentResult
            ? (scenario.treatmentResult.new_survival_probabilities?.[monthKey] ?? baselineProb / 100) * 100
            : baselineProb;

          dataPoint[scenario.name] = treatmentProb;
        }
      });

      return dataPoint;
    });
  }, [scenarios, transformedChartData]);

  // const scenarioChartConfig = useMemo(() => {
  //   const colors: { [key: string]: string } = {};
  //   scenarios.forEach(scenario => {
  //     colors[scenario.name] = scenario.color;
  //   });
  //   return { colors };
  // }, [scenarios]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 min-h-0">
      {/* Chart Panel - Premium Glass Design */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-800/80 dark:to-slate-900 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/50 flex flex-col h-full min-h-0"
      >
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-violet-500/[0.03] via-transparent to-transparent dark:from-violet-500/[0.08] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-cyan-500/[0.03] via-transparent to-transparent dark:from-cyan-500/[0.08] rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col p-5 h-full min-h-0 overflow-y-auto">
          {/* Chart Header */}
          <div className="mb-4 pb-4 border-b border-slate-200/60 dark:border-slate-700/40 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20 border border-violet-200/50 dark:border-violet-500/30">
                  <Activity className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    Retention Forecast
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Compare scenarios over 12-month horizon
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={addScenario}
                disabled={!selectedEmployee || scenarios.length >= MAX_SCENARIOS}
                title={!selectedEmployee ? 'Select an employee to add personalized scenarios' : scenarios.length >= MAX_SCENARIOS ? `Maximum of ${MAX_SCENARIOS} scenarios reached` : undefined}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-all duration-200",
                  selectedEmployee && scenarios.length < MAX_SCENARIOS
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                )}
              >
                <GitCompare className="w-4 h-4" />
                Add Scenario
              </motion.button>
            </div>

            {!selectedEmployeeData && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-800/30 border border-slate-200/60 dark:border-slate-700/40"
              >
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-700/60">
                    <Info className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No employee selected</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Select an employee from the sidebar to visualize retention scenarios
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Scenario Pills */}
            {scenarios.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {scenarios.map((scenario) => (
                  <motion.div
                    key={scenario.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div
                      className="w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-sm"
                      style={{ backgroundColor: scenario.color }}
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{scenario.name}</span>
                    <select
                      value={scenario.treatmentId || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const treatmentId = value === '' ? null : parseInt(value, 10);
                        updateScenarioTreatment(scenario.id, treatmentId);
                      }}
                      className="text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                    >
                      <option value="">No Treatment</option>
                      {treatmentSuggestions.map(treatment => {
                        const salaryBase = selectedEmployee?.salary || selectedEmployeeData?.current_features.employee_cost || 0;
                        const costPercent = calculateCostPercentage(treatment.cost || 0, salaryBase);
                        const hasCostShare = costPercent > 0;
                        const optionLabel = isPerformanceMode
                          ? `${treatment.name}${hasCostShare ? ` (${formatCostPercentage(costPercent)} of salary)` : ''}`
                          : `${treatment.name} (${formatCurrency(treatment.cost || 0)})`;

                        return (
                          <option key={treatment.id} value={treatment.id}>
                            {optionLabel}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => removeScenario(scenario.id)}
                      className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </div>
            )}

            {selectedEmployeeData && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/80 dark:from-amber-900/20 dark:via-orange-900/10 dark:to-amber-900/20 border border-amber-200/60 dark:border-amber-700/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-800/40">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        {(selectedEmployeeData.current_churn_probability * 100).toFixed(1)}% Annual Churn Risk
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                        Baseline probability without interventions
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">
                      {(100 - selectedEmployeeData.current_churn_probability * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">retention</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Chart Area */}
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={scenarioChartData}
                margin={{ top: 10, right: 30, left: 5, bottom: 25 }}
              >
                <defs>
                  <linearGradient id="chartGrid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e2e8f0" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="url(#chartGrid)" vertical={false} />
                <XAxis
                  dataKey="month"
                  label={{ value: 'Months', position: 'bottom', dy: 10, style: { fontSize: 11, fill: '#64748b', fontWeight: 500 } }}
                  type="number"
                  domain={[1, 12]}
                  ticks={[1, 3, 6, 9, 12]}
                  stroke="#94a3b8"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  tickLine={false}
                />
                <YAxis
                  label={{ value: 'Retention %', angle: -90, position: 'insideLeft', offset: 0, dx: -5, style: { fontSize: 11, fill: '#64748b', fontWeight: 500 } }}
                  domain={[0, 100]}
                  stroke="#94a3b8"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  tickLine={false}
                  width={50}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-4 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/50"
                        >
                          <p className="font-semibold text-slate-900 dark:text-slate-100 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                            Month {label}
                          </p>
                          <div className="space-y-2">
                            {payload.map((entry: any) => (
                              <div key={entry.name} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                  <span className="text-sm text-slate-600 dark:text-slate-300">{entry.name}</span>
                                </div>
                                <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                                  {entry.value.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconSize={10}
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  formatter={(value) => <span className="text-slate-600 dark:text-slate-300 font-medium">{value}</span>}
                />

                {scenarios.map((scenario) => (
                  <Line
                    key={scenario.id}
                    type="monotone"
                    dataKey={scenario.name}
                    stroke={scenario.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: scenario.color }}
                    name={scenario.name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Treatments Panel - Premium Card Design */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/60 dark:to-slate-900 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/50 flex flex-col h-full min-h-0"
      >
        {/* Decorative gradient */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/[0.04] via-transparent to-transparent dark:from-emerald-500/[0.08] rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center gap-3 p-5 border-b border-slate-200/60 dark:border-slate-700/40 flex-shrink-0">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 border border-emerald-200/50 dark:border-emerald-500/30">
            <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Treatment Options
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              AI-powered interventions
            </p>
          </div>
          {treatmentSuggestions.length > 0 && (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              {treatmentSuggestions.length} available
            </span>
          )}
        </div>

        {treatmentSuggestions.length > 0 ? (
          <div className="relative flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-slate-600">
            {treatmentSuggestions
              .filter(treatment => {
                if (budget === null) return true;
                const costPercentage = calculateCostPercentage(treatment.cost, selectedEmployeeData?.current_features.employee_cost || 0);
                return costPercentage <= budget;
              })
              .slice(0, 6)
              .map((treatment, index) => (
                <motion.div
                  key={treatment.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <TreatmentCard
                    treatment={treatment}
                    onSelect={applyTreatment}
                    isSelected={selectedTreatment?.id === treatment.id}
                    isLoading={isApplyingTreatment && selectedTreatment?.id === treatment.id}
                    employeeSalary={selectedEmployeeData?.current_features.employee_cost || 0}
                  />
                </motion.div>
              ))}
          </div>
        ) : (
          <div className="relative flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 mb-4">
              <FlaskConical className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {selectedEmployeeData ? 'No treatments available' : 'Awaiting selection'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">
              {selectedEmployeeData
                ? 'No AI-generated treatments for this employee profile.'
                : 'Select an employee to generate personalized treatment options.'}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
});

// -------------------------------------
// Mass Treatment Tab Component
// -------------------------------------
const MassTreatmentTab = memo(({
  candidates,
  setCandidates,
  isLoading,
  setIsLoading,
  isPerformanceMode,
  filters: _filters,
  setFilters: _setFilters,
  employees,
  getRiskLevel,
  toast,
  handleEmployeeSelect,
  setActiveTab: _setActiveTab,
  selectedCandidates,
  setSelectedCandidates,
  isApplyingBulkTreatment,
  bulkProgress,
  applyBulkTreatment,
  applyCandidateTreatment,
  bulkOperationCancelled,
  cancelBulkTreatment
}: {
  candidates: MassTreatmentCandidate[];
  setCandidates: React.Dispatch<React.SetStateAction<MassTreatmentCandidate[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isPerformanceMode: boolean;
  filters: {
    riskLevel: string;
    department: string;
    minELTVGain: number;
  };
  setFilters: React.Dispatch<React.SetStateAction<{
    riskLevel: string;
    department: string;
    minELTVGain: number;
  }>>;
  employees: Employee[];
  getRiskLevel: (probability: number) => string;
  toast: any;
  handleEmployeeSelect: (employeeId: number, treatmentIdToSelect?: number) => Promise<void>;
  setActiveTab: React.Dispatch<React.SetStateAction<PlaygroundTab>>;
  selectedCandidates: Set<string>;
  setSelectedCandidates: React.Dispatch<React.SetStateAction<Set<string>>>;
  isApplyingBulkTreatment: boolean;
  bulkProgress: {
    completed: number;
    total: number;
    currentEmployee?: string;
    successful?: number;
    failed?: number;
  };
  applyBulkTreatment: () => Promise<void>;
  applyCandidateTreatment: (candidate: MassTreatmentCandidate, options?: { treatment?: TreatmentSuggestion | null }) => Promise<ApplyTreatmentResult | null>;
  bulkOperationCancelled: boolean;
  cancelBulkTreatment: () => void;
}) => {
  const analyzeTeamForTreatment = useCallback(async () => {
    setIsLoading(true);
    try {
      // Starting mass treatment analysis

      // Step 1: Create a comprehensive scoring system for efficiency and criticality
      const employeeScores = employees
        .filter(emp => {
          // Basic validation
          const hasValidData = emp.hr_code && emp.name;
          const hasReasonableSalary = (emp.salary || 0) >= 0;
          return hasValidData && hasReasonableSalary;
        })
        .map(emp => {
          const riskLevel = getRiskLevel(emp.churnProbability || 0);
          const churnProb = emp.churnProbability || 0;
          const salary = emp.salary || 0;
          const tenure = emp.tenure || 0;

          // Criticality Score (0-100): How critical is this employee to retain?
          const criticalityScore = calculateCriticalityScore({
            churnProbability: churnProb,
            salary,
            currentELTV: emp.currentELTV,
            tenure,
            riskLevel
          });

          // Efficiency Score (0-100): How efficient would treatment be?
          const efficiencyScore = calculateEfficiencyScore({
            churnProbability: churnProb,
            salary,
            tenure,
            riskLevel
          });

          // Combined Priority Score (0-100)
          const priorityScore = (criticalityScore * 0.6) + (efficiencyScore * 0.4);

          return {
            employee: emp,
            criticalityScore,
            efficiencyScore,
            priorityScore,
            riskLevel
          };
        })
        .filter(score => score.priorityScore > 30) // Only consider employees with meaningful priority
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, Math.max(5, Math.floor(employees.length * 0.1))); // Top 10% of employees (minimum 5)

      if (employeeScores.length === 0) {

        toast({
          title: "No Critical Opportunities Found",
          description: "No employees meet the criticality and efficiency criteria. Try adjusting the analysis parameters.",
          variant: "destructive",
        });
        return;
      }

      // Process the scored employees and get their treatment data
      const candidatePromises = employeeScores.map(async (scoredEmployee) => {
        try {
          const employee = scoredEmployee.employee;

          const [playgroundData, treatmentSuggestions] = await Promise.all([
            api.get(`/playground/data/${employee.hr_code}`).then(r => r.data),
            api.get(`/playground/treatments/${employee.hr_code}`).then(r => r.data)
          ]);

          if (!playgroundData || !treatmentSuggestions) {
            return null;
          }

          // Find the best treatment option
          const suggestions = treatmentSuggestions.suggestions || [];
          const topTreatment = suggestions.length > 0 ? suggestions[0] : null;
          const potentialELTVGain = topTreatment ?
            (topTreatment.projected_post_eltv || 0) - (playgroundData.current_eltv || 0) : 0;
          const potentialChurnReduction = topTreatment ? Math.max(0, -(topTreatment.projected_churn_prob_change || 0)) : 0;
          const projectedPostRviCategory = topTreatment ? formatELTVByMode(topTreatment.projected_post_eltv || 0, 'quality') : null;
          const employeeSalaryReference = employee.salary || playgroundData.current_features.employee_cost || 0;
          const costPercentage = topTreatment ? calculateCostPercentage(topTreatment.cost || 0, employeeSalaryReference) : 0;
          const costPercentageText = costPercentage > 0 ? `Cost: ${formatCostPercentage(costPercentage)} of salary` : undefined;

          const treatmentRationale = topTreatment ? (
            isPerformanceMode
              ? [
                `Recommended: ${topTreatment.name}`,
                `Estimated churn drop: ${(potentialChurnReduction * 100).toFixed(1)}%`,
                projectedPostRviCategory ? `Projected RVI: ${projectedPostRviCategory}` : undefined,
                costPercentageText,
              ].filter(Boolean) as string[]
              : [
                `Recommended: ${topTreatment.name}`,
                `Expected ELTV gain: ${formatCurrency(potentialELTVGain)}`,
                `Cost: ${formatCurrency(topTreatment.cost || 0)}`
              ]
          ) : ['No treatment recommendations available'];

          const candidate: MassTreatmentCandidate = {
            employee,
            playgroundData,
            suggestedTreatments: suggestions,
            topTreatment,
            potentialELTVGain,
            potentialChurnReduction,
            projectedPostRviCategory,
            riskLevel: scoredEmployee.riskLevel,
            criticalityScore: scoredEmployee.criticalityScore,
            efficiencyScore: scoredEmployee.efficiencyScore,
            priorityScore: scoredEmployee.priorityScore,
            selectionCriteria: [
              `High priority score: ${scoredEmployee.priorityScore.toFixed(1)}`,
              `Risk level: ${scoredEmployee.riskLevel}`,
              `Churn probability: ${(scoredEmployee.employee.churnProbability * 100).toFixed(1)}%`,
              ...(isPerformanceMode && potentialChurnReduction > 0
                ? [`Potential churn drop: ${(potentialChurnReduction * 100).toFixed(1)}%`]
                : []),
              ...(isPerformanceMode && costPercentage > 0
                ? [`Cost: ${formatCostPercentage(costPercentage)} of salary`]
                : []),
              ...(!isPerformanceMode && potentialELTVGain > 0
                ? [`Expected ELTV gain: ${formatCurrency(potentialELTVGain)}`]
                : []),
            ],
            treatmentRationale,
            costPercentage,
            employeeSalaryReference,
            lastResult: null,
            isApplying: false,
            lastError: null,
          };

          return candidate;
        }
        catch (error) {
          console.error('Error analyzing employee for mass treatment:', error);
          return null;
        }
      });

      const results = await Promise.all(candidatePromises);
      const validCandidates = results.filter(candidate => candidate !== null) as MassTreatmentCandidate[];

      setCandidates(validCandidates);
      setSelectedCandidates(new Set(validCandidates.slice(0, Math.min(3, validCandidates.length)).map(c => c.employee.hr_code)));

      toast({
        title: "Analysis Complete",
        description: `Found ${validCandidates.length} employees for potential treatment interventions.`,
        variant: "default",
      });
    }
    catch (error) {
      // Error in analyzeTeamForTreatment
    }
    finally {
      setIsLoading(false);
    }
  }, [employees, getRiskLevel, isPerformanceMode, setIsLoading, setSelectedCandidates, toast]);

  const summaryMetrics = useMemo(() => {
    let totalPotentialELTV = 0;
    let selectedPotentialELTV = 0;
    let totalPotentialChurn = 0;
    let selectedPotentialChurn = 0;
    let appliedCount = 0;
    let realizedGainELTV = 0;
    let realizedChurnDrop = 0;

    candidates.forEach(candidate => {
      const potentialGain = Math.max(0, candidate.potentialELTVGain || 0);
      const potentialChurnDrop = Math.max(0, candidate.potentialChurnReduction || 0);

      totalPotentialELTV += potentialGain;
      totalPotentialChurn += potentialChurnDrop;

      if (selectedCandidates.has(candidate.employee.hr_code)) {
        selectedPotentialELTV += potentialGain;
        selectedPotentialChurn += potentialChurnDrop;
      }

      if (candidate.lastResult) {
        appliedCount += 1;
        realizedGainELTV += candidate.lastResult.treatment_effect_eltv ?? 0;
        const churnDrop = Math.max(0, (candidate.lastResult.pre_churn_probability ?? 0) - (candidate.lastResult.post_churn_probability ?? 0));
        realizedChurnDrop += churnDrop;
      }
    });

    return {
      totalPotentialELTV,
      selectedPotentialELTV,
      totalPotentialChurn,
      selectedPotentialChurn,
      appliedCount,
      realizedGainELTV,
      realizedChurnDrop,
    };
  }, [candidates, selectedCandidates]);

  const calculateCriticalityScore = (data: {
    churnProbability: number;
    salary: number;
    currentELTV?: number;
    tenure: number;
    riskLevel: string;
  }) => {
    const { churnProbability, salary, currentELTV = 0, tenure } = data;

    // Base criticality from churn probability (0-40 points)
    const churnScore = churnProbability * 40;

    // Salary impact (0-25 points) - higher salary = more critical
    const salaryScore = Math.min((salary / 100000) * 25, 25);

    // ELTV impact (0-20 points) - higher ELTV = more critical
    const eltvScore = Math.min((currentELTV / 200000) * 20, 20);

    // Tenure impact (0-15 points) - moderate tenure is most critical
    const tenureScore = tenure >= 1 && tenure <= 5 ? 15 : tenure > 5 ? 10 : 5;

    return Math.min(churnScore + salaryScore + eltvScore + tenureScore, 100);
  }

  // ------------------------------
  // What‑If Adjustments UI + Logic
  // ------------------------------
  const [whatIf, setWhatIf] = useState<WhatIfState>({ tenure: null, employee_cost: null });
  const [whatIfResult, setWhatIfResult] = useState<null | {
    post_churn_probability: number;
    eltv_pre_treatment: number;
    eltv_post_treatment: number;
  }>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  const applyWhatIf = useCallback(async (employee: Employee) => {
    try {
      setWhatIfLoading(true);
      const changedFeatures: Record<string, number> = {};
      if (typeof whatIf.tenure === 'number') changedFeatures.tenure = whatIf.tenure;
      if (typeof whatIf.employee_cost === 'number') changedFeatures.employee_cost = whatIf.employee_cost;
      const response = await api.post('/playground/manual-simulate', { employee_id: employee.hr_code, changed_features: changedFeatures });
      const resp = response.data;
      if (resp && typeof resp === 'object') {
        const r: any = resp;
        setWhatIfResult({
          post_churn_probability: Number(r?.post_churn_probability ?? r?.postChurnProbability ?? 0),
          eltv_pre_treatment: Number(r?.pre_eltv ?? r?.eltv_pre_treatment ?? employee.currentELTV ?? 0),
          eltv_post_treatment: Number(r?.post_eltv ?? r?.eltv_post_treatment ?? 0)
        });
      }
    } catch (e) {
      console.error('What‑If simulation failed', e);
    } finally {
      setWhatIfLoading(false);
    }
  }, [whatIf]);

  const resetWhatIf = useCallback(() => {
    setWhatIf({ tenure: null, employee_cost: null });
    setWhatIfResult(null);
  }, []);

  const calculateEfficiencyScore = (data: {
    churnProbability: number;
    salary: number;
    tenure: number;
    riskLevel: string;
  }) => {
    const { churnProbability, tenure, riskLevel } = data;

    // Treatment efficiency is higher for moderate risk (0-30 points)
    let riskScore = 0;
    if (riskLevel === 'Medium') riskScore = 30;
    else if (riskLevel === 'High') riskScore = 20;
    else if (riskLevel === 'Low') riskScore = 10;

    // Tenure efficiency (0-25 points) - newer employees often respond better to treatment
    const tenureScore = tenure <= 2 ? 25 : tenure <= 5 ? 20 : 15;

    // Probability sweet spot (0-25 points) - 40-70% probability is most treatable
    let probScore = 0;
    if (churnProbability >= 0.4 && churnProbability <= 0.7) probScore = 25;
    else if (churnProbability >= 0.3 && churnProbability <= 0.8) probScore = 20;
    else probScore = 10;

    // General treatability factor (0-20 points)
    const treatabilityScore = 20;

    return Math.min(riskScore + tenureScore + probScore + treatabilityScore, 100);
  }

  // Helper functions for selection
  const toggleCandidate = useCallback((hrCode: string) => {
    const newSelection = new Set(selectedCandidates);
    if (newSelection.has(hrCode)) {
      newSelection.delete(hrCode);
    } else {
      newSelection.add(hrCode);
    }
    setSelectedCandidates(newSelection);
  }, [selectedCandidates, setSelectedCandidates]);

  const selectAllCandidates = useCallback(() => {
    const allHrCodes = candidates.map(c => c.employee.hr_code);
    setSelectedCandidates(new Set(allHrCodes));
  }, [candidates, setSelectedCandidates]);

  const deselectAllCandidates = useCallback(() => {
    setSelectedCandidates(new Set());
  }, [setSelectedCandidates]);

  const selectedCount = selectedCandidates.size;

  // Template system state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<Array<{ id: string, name: string, criteria: any, createdAt: string }>>([]);

  // Load templates on component mount
  useEffect(() => {
    const saved = localStorage.getItem('massTreatmentTemplates');
    if (saved) {
      try {
        setSavedTemplates(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    }
  }, []);

  // Save template
  const saveTemplate = useCallback(() => {
    if (!templateName.trim()) {
      toast({
        title: "Template Name Required",
        description: "Please enter a name for your template.",
        variant: "destructive",
      });
      return;
    }

    const newTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      criteria: {
        selectedEmployees: Array.from(selectedCandidates),
        filters: _filters,
        employeeCount: selectedCount,
        totalCandidates: candidates.length
      },
      createdAt: new Date().toISOString()
    };

    const updatedTemplates = [...savedTemplates, newTemplate];
    setSavedTemplates(updatedTemplates);
    localStorage.setItem('massTreatmentTemplates', JSON.stringify(updatedTemplates));

    setTemplateName('');
    setShowTemplateModal(false);

    toast({
      title: "Template Saved",
      description: `Template "${newTemplate.name}" saved successfully.`,
    });
  }, [templateName, selectedCandidates, _filters, selectedCount, candidates.length, savedTemplates, toast]);

  // Load template
  const loadTemplate = useCallback((template: any) => {
    if (template.criteria.selectedEmployees) {
      setSelectedCandidates(new Set(template.criteria.selectedEmployees));
    }
    if (template.criteria.filters) {
      _setFilters(template.criteria.filters);
    }

    toast({
      title: "Template Loaded",
      description: `Template "${template.name}" loaded successfully.`,
    });
  }, [_setFilters, toast]);

  // Delete template
  const deleteTemplate = useCallback((templateId: string, templateName: string) => {
    const updatedTemplates = savedTemplates.filter(t => t.id !== templateId);
    setSavedTemplates(updatedTemplates);
    localStorage.setItem('massTreatmentTemplates', JSON.stringify(updatedTemplates));

    toast({
      title: "Template Deleted",
      description: `Template "${templateName}" deleted successfully.`,
    });
  }, [savedTemplates, toast]);

  return (
    <div className="flex flex-col h-full">
      {/* Premium Header Section */}
      <div className="relative overflow-hidden p-6 border-b border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-800/60 dark:to-slate-900">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-violet-500/5 via-indigo-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-emerald-500/5 via-teal-500/5 to-transparent rounded-full blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Mass Treatment Analysis</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Identify and prioritize employees for retention efforts</p>
            </div>
          </div>

          {/* Enhanced Progress Bar for Bulk Operations */}
          {isApplyingBulkTreatment && bulkProgress.total > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 p-5 relative overflow-hidden rounded-2xl border border-cyan-200/60 dark:border-cyan-800/50 bg-gradient-to-br from-cyan-50/80 via-sky-50/50 to-cyan-50/80 dark:from-cyan-950/30 dark:via-sky-950/20 dark:to-cyan-950/30 backdrop-blur-sm"
            >
              {/* Decorative glow */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-cyan-400/20 via-transparent to-transparent rounded-full blur-2xl" />

              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400/30 rounded-full blur-lg animate-pulse" />
                    <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">
                      {bulkOperationCancelled ? 'Cancelling operation...' : 'Applying Treatments'}
                    </span>
                    <span className="ml-2 text-sm text-cyan-700 dark:text-cyan-300 font-mono">
                      ({bulkProgress.completed}/{bulkProgress.total})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-cyan-700 dark:text-cyan-300 font-mono">
                    {Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%
                  </span>
                  {!bulkOperationCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelBulkTreatment}
                      className="h-7 px-3 text-xs font-medium border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 rounded-lg"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* Premium Progress Bar */}
              <div className="relative w-full h-3 bg-cyan-200/60 dark:bg-cyan-800/40 rounded-full overflow-hidden mb-4">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 via-sky-500 to-cyan-500 rounded-full relative"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(5, (bulkProgress.completed / bulkProgress.total) * 100)}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </motion.div>
              </div>

              {/* Status Details */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  {(bulkProgress.successful ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-sm shadow-emerald-500/50" />
                      {bulkProgress.successful} successful
                    </span>
                  )}
                  {(bulkProgress.failed ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                      <span className="w-2 h-2 bg-rose-500 rounded-full shadow-sm shadow-rose-500/50" />
                      {bulkProgress.failed} failed
                    </span>
                  )}
                </div>
                {bulkProgress.currentEmployee && (
                  <span className="text-cyan-700 dark:text-cyan-300 font-medium">
                    Processing: <span className="font-mono">{bulkProgress.currentEmployee}</span>
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {/* Premium Metrics Cards */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Candidates Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900 p-4 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-950/50">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-violet-500/10 via-transparent to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 via-indigo-500 to-violet-400 rounded-full" />
              <div className="pl-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Candidates analyzed</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">{candidates.length}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{summaryMetrics.appliedCount} already applied</div>
              </div>
            </div>

            {/* Potential Gain Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900 p-4 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-200/30 dark:hover:shadow-emerald-950/30">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/15 via-transparent to-transparent rounded-full blur-2xl" />
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 via-teal-500 to-emerald-400 rounded-full" />
              <div className="pl-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  {isPerformanceMode ? 'Potential churn reduction' : 'Potential ELTV gain'}
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                  {isPerformanceMode
                    ? `${(summaryMetrics.totalPotentialChurn * 100).toFixed(1)}%`
                    : formatCurrency(summaryMetrics.totalPotentialELTV)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  Selected: <span className="text-emerald-600 dark:text-emerald-400">{isPerformanceMode
                    ? `${(summaryMetrics.selectedPotentialChurn * 100).toFixed(1)}%`
                    : formatCurrency(summaryMetrics.selectedPotentialELTV)}</span>
                </div>
              </div>
            </div>

            {/* Realized Impact Card */}
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900 p-4 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-200/30 dark:hover:shadow-cyan-950/30">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/15 via-transparent to-transparent rounded-full blur-2xl" />
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 via-sky-500 to-cyan-400 rounded-full" />
              <div className="pl-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  {isPerformanceMode ? 'Realized churn drop' : 'Realized impact'}
                </div>
                <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 font-mono tracking-tight">
                  {isPerformanceMode
                    ? `${(summaryMetrics.realizedChurnDrop * 100).toFixed(1)}%`
                    : formatCurrency(summaryMetrics.realizedGainELTV)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  <span className="text-cyan-600 dark:text-cyan-400">{selectedCandidates.size}</span> selected
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={analyzeTeamForTreatment}
              disabled={isLoading || isApplyingBulkTreatment}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Analyze Team
            </Button>

            {/* Bulk Action Buttons */}
            {candidates.length > 0 && (
              <>
                <Button
                  onClick={() => applyBulkTreatment()}
                  disabled={selectedCount === 0 || isApplyingBulkTreatment}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
                >
                  {isApplyingBulkTreatment ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="mr-2 h-4 w-4" />
                  )}
                  Apply to Selected ({selectedCount})
                </Button>

                <div className="flex gap-2">
                  <Button
                    onClick={selectAllCandidates}
                    variant="outline"
                    size="sm"
                    className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Select All
                  </Button>
                  <Button
                    onClick={deselectAllCandidates}
                    variant="outline"
                    size="sm"
                    disabled={selectedCount === 0}
                    className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Deselect All
                  </Button>
                </div>

                {/* Template System */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowTemplateModal(true)}
                    variant="outline"
                    size="sm"
                    disabled={selectedCount === 0}
                    className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Save Template
                  </Button>
                  {savedTemplates.length > 0 && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const template = savedTemplates.find(t => t.id === e.target.value);
                            if (template) loadTemplate(template);
                            e.target.value = '';
                          }
                        }}
                        className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        defaultValue=""
                      >
                        <option value="">Load Template ({savedTemplates.length})</option>
                        {savedTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.criteria.employeeCount} employees)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Premium Candidates List */}
      <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-900">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-violet-400/20 rounded-full blur-2xl animate-pulse" />
              <Loader2 className="relative w-14 h-14 text-violet-500 animate-spin" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Analyzing employees...</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">This may take a few moments as we evaluate each employee for treatment opportunities.</p>
          </div>
        ) : candidates.length > 0 ? (
          <div className="space-y-4">
            {candidates.map((candidate, index) => {
              const isSelected = selectedCandidates.has(candidate.employee.hr_code);
              const realizedChurnDrop = candidate.lastResult && candidate.lastResult.pre_churn_probability != null && candidate.lastResult.post_churn_probability != null
                ? Math.max(0, candidate.lastResult.pre_churn_probability - candidate.lastResult.post_churn_probability)
                : null;
              const projectedRviCategory = candidate.projectedPostRviCategory || (candidate.lastResult ? formatELTVByMode(candidate.lastResult.eltv_post_treatment ?? candidate.playgroundData.current_eltv ?? 0, 'quality') : null);
              const postChurnValue = candidate.lastResult ? `${(candidate.lastResult.post_churn_probability * 100).toFixed(1)}%` : 'N/A';
              const costPercentageDisplay = candidate.costPercentage && candidate.costPercentage > 0
                ? formatCostPercentage(candidate.costPercentage)
                : null;
              const costShareResult = candidate.lastResult
                ? calculateCostPercentage(
                  candidate.lastResult.treatment_cost ?? candidate.topTreatment?.cost ?? 0,
                  candidate.employeeSalaryReference || candidate.employee.salary || candidate.playgroundData.current_features.employee_cost || 0
                )
                : candidate.costPercentage;
              const costShareDisplay = costShareResult && costShareResult > 0 ? formatCostPercentage(costShareResult) : null;
              const resultMetrics = candidate.lastResult
                ? (isPerformanceMode
                  ? [
                    { label: 'Post-churn', value: postChurnValue },
                    { label: 'Churn reduction', value: realizedChurnDrop !== null ? `${(realizedChurnDrop * 100).toFixed(1)}%` : 'N/A' },
                    { label: 'Post RVI', value: projectedRviCategory ?? 'N/A' },
                    { label: 'Cost share', value: costShareDisplay ?? 'N/A' },
                  ]
                  : [
                    { label: 'Post-churn', value: postChurnValue },
                    { label: 'ROI', value: `${((candidate.lastResult.roi ?? 0) * 100).toFixed(1)}%` },
                    { label: 'New ELTV', value: formatCurrency(candidate.lastResult.eltv_post_treatment ?? 0) },
                    { label: 'Treatment cost', value: formatCurrency(candidate.lastResult.treatment_cost ?? candidate.topTreatment?.cost ?? 0) },
                  ])
                : [];
              return (
                <motion.div
                  key={candidate.employee.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.25 }}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl transition-all duration-300',
                    isSelected
                      ? 'bg-gradient-to-br from-violet-50 via-indigo-50/50 to-violet-50 dark:from-violet-950/30 dark:via-indigo-950/20 dark:to-violet-950/30 border-2 border-violet-300/70 dark:border-violet-600/50 shadow-lg shadow-violet-200/40 dark:shadow-violet-950/30'
                      : 'bg-gradient-to-br from-white via-slate-50/30 to-white dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900 border border-slate-200/70 dark:border-slate-700/60 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-950/50',
                    candidate.lastResult && 'ring-2 ring-emerald-400/40 dark:ring-emerald-500/30',
                    candidate.isApplying && 'opacity-80'
                  )}
                >
                  {/* Left accent bar */}
                  <div className={cn(
                    "absolute top-0 left-0 w-1 h-full rounded-full transition-colors duration-300",
                    candidate.lastResult
                      ? "bg-gradient-to-b from-emerald-500 via-teal-500 to-emerald-400"
                      : isSelected
                        ? "bg-gradient-to-b from-violet-500 via-indigo-500 to-violet-400"
                        : "bg-gradient-to-b from-slate-300 via-slate-200 to-slate-300 dark:from-slate-600 dark:via-slate-700 dark:to-slate-600"
                  )} />

                  {/* Decorative gradient */}
                  <div className={cn(
                    "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    candidate.lastResult
                      ? "bg-gradient-to-bl from-emerald-400/20 via-transparent to-transparent"
                      : isSelected
                        ? "bg-gradient-to-bl from-violet-400/20 via-transparent to-transparent"
                        : "bg-gradient-to-bl from-slate-300/20 via-transparent to-transparent"
                  )} />

                  <div className="relative p-5 pl-6">
                    <div className="flex justify-between items-start gap-4 mb-4">
                      <div className="flex items-start gap-4">
                        {/* Premium checkbox */}
                        <label className="relative flex items-center cursor-pointer mt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCandidate(candidate.employee.hr_code)}
                            className="sr-only peer"
                          />
                          <div className={cn(
                            "w-5 h-5 rounded-lg border-2 transition-all duration-200 flex items-center justify-center",
                            isSelected
                              ? "bg-violet-500 border-violet-500 shadow-lg shadow-violet-500/30"
                              : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 peer-hover:border-violet-400 dark:peer-hover:border-violet-500"
                          )}>
                            {isSelected && (
                              <motion.svg
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-3 h-3 text-white"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </motion.svg>
                            )}
                          </div>
                        </label>

                        <div className="flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap mb-1">
                            <h4 className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                              {candidate.employee.full_name || candidate.employee.name}
                            </h4>
                            {candidate.lastResult && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-medium shadow-sm">
                                <CheckCircle className="h-3.5 w-3.5" /> Applied
                              </span>
                            )}
                            {candidate.isApplying && (
                              <span className="inline-flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-300 font-medium">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {candidate.employee.position} • {candidate.employee.structure_name || candidate.employee.department}
                          </p>
                          <div className="flex flex-wrap items-center gap-2.5 mt-3">
                            <span className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium shadow-sm',
                              candidate.riskLevel === 'High'
                                ? 'bg-gradient-to-r from-rose-100 to-red-100 dark:from-rose-900/40 dark:to-red-900/40 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/50'
                                : candidate.riskLevel === 'Medium'
                                  ? 'bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/40 dark:to-yellow-900/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50'
                                  : 'bg-gradient-to-r from-emerald-100 to-green-100 dark:from-emerald-900/40 dark:to-green-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50'
                            )}>
                              {candidate.riskLevel} Risk
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-full">
                              Priority <span className="font-mono">{candidate.priorityScore?.toFixed(0) || 'N/A'}</span>
                            </span>
                            {candidate.lastResult && (
                              <span className="text-xs text-emerald-600 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1.5 rounded-full">
                                {isPerformanceMode
                                  ? `${realizedChurnDrop !== null ? (realizedChurnDrop * 100).toFixed(1) : '0.0'}% churn drop`
                                  : `+${formatCurrency(candidate.lastResult.treatment_effect_eltv ?? 0)} impact`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2.5">
                        <Button
                          size="sm"
                          disabled={!candidate.topTreatment || candidate.isApplying}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300 rounded-lg"
                          onClick={() => applyCandidateTreatment(candidate).catch(() => { })}
                        >
                          {candidate.isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply Recommended'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={candidate.isApplying}
                          onClick={() => handleEmployeeSelect(candidate.employee.id, candidate.topTreatment?.id)}
                          className="border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          View Details
                        </Button>
                      </div>
                    </div>

                    {candidate.topTreatment && (
                      <div className="relative overflow-hidden rounded-xl p-4 mb-4 bg-gradient-to-br from-cyan-50/80 via-sky-50/50 to-cyan-50/80 dark:from-cyan-950/30 dark:via-sky-950/20 dark:to-cyan-950/30 border border-cyan-200/60 dark:border-cyan-800/50">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-400/15 via-transparent to-transparent rounded-full blur-2xl" />
                        <div className="relative flex items-center justify-between mb-2">
                          <h5 className="text-sm font-semibold text-cyan-900 dark:text-cyan-100 flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center">
                              <Zap className="w-3 h-3 text-white" />
                            </div>
                            Recommended Treatment
                          </h5>
                          {isPerformanceMode ? (
                            <div className="flex flex-col items-end text-xs">
                              <span className="text-cyan-700 dark:text-cyan-300 font-medium">Projected RVI {projectedRviCategory ?? 'N/A'}</span>
                              {costPercentageDisplay && (
                                <span className="text-cyan-600/70 dark:text-cyan-300/70">
                                  Cost {costPercentageDisplay} of salary
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-cyan-700 dark:text-cyan-300 font-mono font-medium">
                              {formatCurrency(candidate.topTreatment.cost || 0)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-cyan-800 dark:text-cyan-200 font-medium mb-2">{candidate.topTreatment.name}</p>
                        {isPerformanceMode ? (
                          <div className="flex flex-wrap gap-3 text-xs text-cyan-700 dark:text-cyan-300">
                            <span className="bg-cyan-100/60 dark:bg-cyan-900/30 px-2 py-1 rounded-md">
                              Churn drop <span className="font-mono font-medium">{(Math.max(0, candidate.potentialChurnReduction || 0) * 100).toFixed(1)}%</span>
                            </span>
                            {costPercentageDisplay && (
                              <span className="bg-cyan-100/60 dark:bg-cyan-900/30 px-2 py-1 rounded-md">
                                Cost share <span className="font-mono font-medium">{costPercentageDisplay}</span>
                              </span>
                            )}
                            <span className="bg-cyan-100/60 dark:bg-cyan-900/30 px-2 py-1 rounded-md">
                              Effect: <span className="font-medium">{candidate.topTreatment.timeToEffect || 'N/A'}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-xs text-cyan-700 dark:text-cyan-300">
                            <span>Expected Gain <span className="font-mono font-medium">{formatCurrency(candidate.potentialELTVGain)}</span></span>
                            <span>Effect: <span className="font-medium">{candidate.topTreatment.timeToEffect || 'N/A'}</span></span>
                          </div>
                        )}
                      </div>
                    )}

                    {!candidate.topTreatment && (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 mb-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                        This employee does not currently have an AI-recommended treatment. Consider reviewing their profile manually.
                      </div>
                    )}

                    {candidate.lastResult && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {resultMetrics.map((metric, idx) => (
                          <div key={`${candidate.employee.hr_code}-metric-${idx}`} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{metric.label}</span>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono mt-0.5">{metric.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {candidate.selectionCriteria && candidate.selectionCriteria.length > 0 && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Why selected:</span>
                        <ul className="list-none ml-3 mt-2 space-y-1.5">
                          {candidate.selectionCriteria.slice(0, isPerformanceMode ? 4 : 3).map((criteria, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                              {criteria}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {candidate.lastError && (
                      <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/50 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2.5">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        {candidate.lastError}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-slate-300/20 rounded-full blur-2xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">No candidates analyzed</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-4">Click "Analyze Team" to identify employees who would benefit most from retention interventions.</p>
            <Button
              onClick={analyzeTeamForTreatment}
              disabled={isLoading}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25"
            >
              <Zap className="mr-2 h-4 w-4" />
              Analyze Team
            </Button>
          </div>
        )}
      </div>

      {/* Premium Template Save Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-800/60 dark:to-slate-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-slate-200/60 dark:border-slate-700/50 shadow-2xl shadow-slate-900/20"
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-violet-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-emerald-500/10 via-teal-500/5 to-transparent rounded-full blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <FlaskConical className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                  Save Template
                </h3>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., High Risk Engineering Team"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all duration-200"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  This will save your current selection (<span className="font-semibold text-violet-600 dark:text-violet-400">{selectedCount} employees</span>) and filters
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={saveTemplate}
                  disabled={!templateName.trim()}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300"
                >
                  Save Template
                </Button>
                <Button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setTemplateName('');
                  }}
                  variant="outline"
                  className="flex-1 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
});
