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
  CheckCircle
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useToast } from '@/hooks/use-toast';
import { useProject } from '@/contexts/ProjectContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useErrorReporting } from '@/utils/errorReporting';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { Employee } from '@/types/employee';
import type { TreatmentOptions, TreatmentSuggestion, ApplyTreatmentResult } from '@/types/treatment';
import { RiskIndicator } from '@/components/RiskIndicator';
import TreatmentTracker from '@/components/TreatmentTracker';
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
import { TrainingReminderBanner } from '../components/TrainingReminderBanner';
import { ModelTrainingRequired } from '../components/ModelTrainingRequired';
import api from '../services/api';
import { employeeService } from '../services/employee';

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
      return 'text-gray-500 dark:text-gray-400';
    }
    if (roi === 'high') return 'text-emerald-600 dark:text-emerald-400';
    if (roi === 'medium') return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Determine if this is an ongoing cost treatment
  const isOngoingCost = treatment.name.toLowerCase().includes('salary increase') ||
    treatment.name.toLowerCase().includes('salary adjustment');

  return (
    <motion.div
      className={`group relative overflow-hidden rounded-xl transition-all duration-500 cursor-pointer ${isSelected
        ? 'bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-blue-500/10 border-2 border-blue-400/50 shadow-xl shadow-blue-500/20'
        : 'bg-gradient-to-br from-white via-gray-50/50 to-white dark:from-gray-800 dark:via-gray-800/80 dark:to-gray-800 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-300/50 dark:hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-500/10'
        }`}
      onClick={() => {
        !isLoading && onSelect(treatment);
      }}
      whileHover={{
        scale: 1.01,
        transition: {
          type: "tween",
          duration: 0.15
        }
      }}
      whileTap={{
        scale: 0.99,
        transition: {
          type: "tween",
          duration: 0.1
        }
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: "easeOut"
      }}
      style={{
        willChange: 'transform',
        backfaceVisibility: 'hidden'
      }}
    >
      {/* Simplified overlay */}
      <div className="absolute inset-0 bg-blue-50/50 dark:bg-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm flex items-center justify-center rounded-xl z-50">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Applying...</span>
          </div>
        </div>
      )}

      <div className="relative z-10 p-5 flex flex-col">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'} transition-colors`}></div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight break-words">
                  {treatment.name}
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed break-words whitespace-pre-line">
                {treatment.description}
              </p>
            </div>
            {/* Status indicator */}
            <div className={`flex-shrink-0 w-3 h-3 rounded-full ${isSelected ? 'bg-blue-500 shadow-lg shadow-blue-500/50' : 'bg-gray-300 dark:bg-gray-600'
              } transition-all duration-300`}></div>
          </div>

          {/* Treatment info badges */}
          {(((treatment as any).timeToEffect) || (treatment.riskLevels && treatment.riskLevels.length > 0)) && (
            <div className="flex items-center gap-2 text-xs mb-4 flex-wrap">
              {(treatment as any).timeToEffect && (
                <span className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 whitespace-normal break-words">
                  <Info size={12} />
                  <span className="font-medium">Effect: {(treatment as any).timeToEffect}</span>
                </span>
              )}
              {treatment.riskLevels && treatment.riskLevels.length > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 whitespace-normal break-words">
                  <AlertTriangle size={12} />
                  <span className="font-medium">Best for: {treatment.riskLevels.join(', ')} risk</span>
                </span>
              )}
            </div>
          )}

          {/* LLM Reasoning Display - Enhanced Look */}
          {treatment.explanation && treatment.explanation.length > 0 && treatment.explanation[0].ruleId === 'llm' && (
            <div className="mb-4 p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-200/50 dark:border-indigo-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                  AI Reasoning
                </h4>
              </div>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed pl-2 border-l-2 border-indigo-300 dark:border-indigo-600 break-words">
                {treatment.explanation[0].reason}
              </p>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 rounded-lg p-3 border border-emerald-200/50 dark:border-emerald-800/50">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1 whitespace-pre-wrap leading-snug">Churn Impact</p>
              <p className={`text-sm font-bold ${treatment.projected_churn_prob_change <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {formatChangePercent(treatment.projected_churn_prob_change)}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                ~{Math.abs((treatment.effectSize || 0) * 100).toFixed(0)}% reduction
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1 whitespace-pre-wrap leading-snug">ROI</p>
              <p className={`text-sm font-bold ${getRoiClass(treatment.projected_roi)}`}>
                {formatROI(treatment.projected_roi)}
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                {isOngoingCost ? 'over 3 years' : 'one-time'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/20 dark:to-gray-800/10 rounded-lg p-3 border border-gray-200/50 dark:border-gray-700/50">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 whitespace-pre-wrap leading-snug">Cost</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                {formatCostPercentage(calculateCostPercentage(treatment.cost, employeeSalary))}
              </p>
              <p className="text-xs text-gray-600/70 dark:text-gray-400/70 mt-0.5">
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
type PlaygroundTab = 'scenario' | 'mass-treatment' | 'treatment-tracking';

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
  const [hasDBConnection, setHasDBConnection] = useState(false);

  // Check project data presence in local SQLite (Excel uploads populate this DB)
  useEffect(() => {
    const checkProjectData = async () => {
      try {
        if (!activeProject) return;
        const employees = await employeeService.getEmployees(activeProject.name);
        setHasDBConnection(employees && employees.length > 0);
      } catch (_error) {
        setHasDBConnection(false);
      }
    };

    checkProjectData();
    const interval = setInterval(checkProjectData, 30000);
    return () => clearInterval(interval);
  }, []);

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
        const [playgroundData, suggestionsResult] = await Promise.all([
          api.get(`/playground/data/${employee.hr_code}`).then(r => r.data),
          api.get(`/playground/treatments/${employee.hr_code}`).then(r => r.data)
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
        const suggestions: TreatmentSuggestion[] = suggestionsResult || [];
        setTreatmentSuggestions(suggestions);

        // Switch to scenario tab to show employee details
        setActiveTab('scenario');

        if (treatmentIdToSelect && suggestions.length > 0) {
          const treatmentToSelect = suggestions.find(t => t.id === treatmentIdToSelect);
          if (treatmentToSelect) {
            await applyTreatment(treatmentToSelect);
          }
        }

        toast({
          title: "Data loaded successfully",
          description: `Loaded risk analysis data for ${employee.name}.`,
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
          await globalCache.fetchHomeData(activeProject?.dbPath || null);
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
      <header className="flex-none bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700/50 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent"></div>
        </div>
        <div className="max-w-[1600px] mx-auto px-6 md:px-8 relative z-10">
          <div className="py-6 md:py-8">
            {/* Main flex container for title and badges */}
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 animate-gradient">
                {localStorage.getItem('settings.dataMode') === 'performance' ? 'Retention Value Index (RVI) Playground' : 'ELTV Treatment Playground'}
              </h1>
              {/* Badges Group */}
              <div className="flex items-center gap-2">
                {/* Atlas by ChurnVision Badge (Consistent Styling) */}
                <span className="relative">
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-teal-500/10 text-teal-300 rounded-full border border-teal-500/20 relative z-10 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
                      <path d="M21.2078 12.0117C21.6076 12.0053 21.9832 11.7346 21.9941 11.3333V6C21.9941 4.89543 21.101 4 20.0005 4H19.9057" />
                      <path d="M2.79222 11.9883C2.39235 11.9947 2.01681 12.2654 2.00586 12.6667V18C2.00586 19.1046 2.89903 20 3.99953 20H4.09431" />
                      <path d="M12 22C12.2106 22 12.3801 21.7531 12.3331 21.5451L11.0531 15.8311C11.0061 15.6231 10.79 15.4909 10.5742 15.5449L4.86949 17.2084C4.65367 17.2624 4.51911 17.5066 4.59327 17.7031L6.17929 21.6265C6.25346 21.823 6.49286 21.9735 6.70347 21.9275L12 20.5909L17.2965 21.9275C17.5071 21.9735 17.7465 21.823 17.8207 21.6265L19.4067 17.7031C19.4809 17.5066 19.3463 17.2624 19.1305 17.2084L13.4258 15.5449C13.21 15.4909 12.9939 15.6231 12.9469 15.8311L11.6669 21.5451C11.6199 21.7531 11.7894 22 12 22Z" />
                      <path d="M12 12L12 2M12 12L19 5M12 12L5 5" />
                    </svg>
                    Atlas by ChurnVision
                  </span>
                  <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-sm animate-pulse"></div>
                </span>

                {/* Beta Badge (Consistent Styling - Green) */}
                <span className="relative">
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-full border border-emerald-500/20 relative z-10 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping absolute"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    Beta
                  </span>
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-sm animate-pulse"></div>
                </span>
              </div>
            </div>
            <p className="text-sm md:text-base text-gray-400 max-w-3xl mt-2">
              {localStorage.getItem('settings.dataMode') === 'performance'
                ? 'Simulate retention scenarios. Select an employee, choose a treatment, and see the projected impact on Retention Value Index (RVI) and churn risk.'
                : 'Simulate retention scenarios. Select an employee, choose a treatment, and see the projected impact on ELTV and churn risk.'}
            </p>
          </div>
        </div>
      </header>

      <div className="px-6 md:px-8 py-4">
        <TrainingReminderBanner />
      </div>

      <main className="flex-1 flex min-h-0">
        {/* Sidebar matching AI Assistant styling */}
        <aside className="w-[340px] flex-none flex flex-col bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-700">
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

        <div className="flex-1 flex flex-col min-w-0 bg-gray-100/50 dark:bg-gray-800/30">
          <div className="flex flex-col p-4 md:p-6 space-y-4 h-full">
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
              <div className="flex flex-col h-full space-y-4">
                {selectedEmployeeData ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm relative overflow-hidden border border-gray-100 dark:border-gray-700 h-fit">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-50 dark:opacity-20" />
                      <div className="relative z-10">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1">
                              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                {localStorage.getItem('settings.dataMode') === 'performance' ? 'Current RVI' : 'Current ELTV'}
                              </h3>
                              <InfoPopover
                                title={localStorage.getItem('settings.dataMode') === 'performance' ? 'What is RVI?' : 'What is ELTV?'}
                                content={
                                  <>
                                    {localStorage.getItem('settings.dataMode') === 'performance' ? (
                                      <>
                                        <p><strong>RVI (Retention Value Index)</strong> is a qualitative indicator (High/Medium/Low) derived from modeled retention value and churn risk signals.</p>
                                        <p>It does not use salary in performance mode. Categories are computed from underlying ELTV ranks.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p><strong>ELTV (Employee Lifetime Value)</strong> estimates the present value of expected contribution based on predicted retention over a fixed horizon with discounting, scaled by the employee’s salary.</p>
                                        <p>Higher survival probabilities and salary yield higher ELTV.</p>
                                      </>
                                    )}
                                  </>
                                }
                              >
                                <Info className="w-3.5 h-3.5 text-gray-400 cursor-pointer" />
                              </InfoPopover>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className={cn(
                                "text-xl font-semibold",
                                localStorage.getItem('settings.dataMode') === 'performance'
                                  ? getELTVCategoryClass(selectedEmployeeData.current_eltv)
                                  : "text-gray-900 dark:text-gray-100"
                              )}>
                                {localStorage.getItem('settings.dataMode') === 'performance'
                                  ? (selectedEmployeeData.current_eltv > 0 ? formatELTVByMode(selectedEmployeeData.current_eltv, 'quality') : 'N/A')
                                  : formatELTVByMode(selectedEmployeeData.current_eltv, 'quantification')}
                              </span>
                            </div>
                          </div>
                          <Calculator className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    <div className={cn(
                      "rounded-xl p-3 shadow-sm relative overflow-hidden border h-fit",
                      applyTreatmentResult
                        ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700"
                        : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-60"
                    )}>
                      {applyTreatmentResult &&
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent opacity-50 dark:opacity-30" />}
                      <div className="relative z-10">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1">
                              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                {localStorage.getItem('settings.dataMode') === 'performance' ? 'RVI Post-Treatment' : 'ELTV Post-Treatment'}
                              </h3>
                              <InfoPopover
                                title={localStorage.getItem('settings.dataMode') === 'performance' ? 'RVI Post‑Treatment' : 'ELTV Post‑Treatment'}
                                content={
                                  <>
                                    {localStorage.getItem('settings.dataMode') === 'performance' ? (
                                      <>
                                        <p>Shows expected <strong>RVI category</strong> after applying the selected treatment, reflecting improved retention without salary.</p>
                                        <p>Categories are derived from updated ELTV ranks under the treatment’s predicted churn reduction.</p>
                                      </>
                                    ) : (
                                      <>
                                        <p>Projected <strong>ELTV</strong> using updated survival probabilities after treatment. Display does not subtract treatment cost; cost is shown separately in ROI.</p>
                                        <p>Depends on survival curve shape, discounting, and the employee’s salary.</p>
                                      </>
                                    )}
                                  </>
                                }
                              >
                                <Info className="w-3.5 h-3.5 text-gray-400 cursor-pointer" />
                              </InfoPopover>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <CustomTooltip
                                content={applyTreatmentResult
                                  ? `Raw value: ${applyTreatmentResult.eltv_post_treatment}, Treatment ID: ${applyTreatmentResult.applied_treatment.id}, Treatment: ${applyTreatmentResult.applied_treatment.name}`
                                  : "No treatment applied"
                                }
                                disabled={!applyTreatmentResult}
                              >
                                <span className={cn(
                                  "text-xl font-semibold cursor-help",
                                  applyTreatmentResult
                                    ? (localStorage.getItem('settings.dataMode') === 'performance'
                                      ? getELTVCategoryClass(applyTreatmentResult.eltv_post_treatment)
                                      : "text-blue-600 dark:text-blue-400")
                                    : "text-gray-400 dark:text-gray-500"
                                )}>
                                  {applyTreatmentResult
                                    ? (localStorage.getItem('settings.dataMode') === 'performance'
                                      ? formatELTVByMode(applyTreatmentResult.eltv_post_treatment, 'quality')
                                      : formatELTVByMode(applyTreatmentResult.eltv_post_treatment, 'quantification'))
                                    : (localStorage.getItem('settings.dataMode') === 'performance' ? 'Unknown' : '$ -.--')}
                                </span>
                              </CustomTooltip>
                            </div>
                          </div>
                          <TrendingUp className={cn(
                            "w-5 h-5",
                            applyTreatmentResult
                              ? "text-blue-500"
                              : "text-gray-400"
                          )} />
                        </div>
                      </div>
                    </div>

                    {/* Budget Input */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 col-span-1 sm:col-span-2 lg:col-span-2 h-fit">
                      <label htmlFor="budgetInput" className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Budget Constraint (Optional)
                      </label>
                      <div className="relative mt-1 rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-gray-500 dark:text-gray-400 sm:text-sm">%</span>
                        </div>
                        <input
                          type="number"
                          name="budgetInput"
                          id="budgetInput"
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-3 pr-8 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:text-gray-100"
                          placeholder="Max % of salary (e.g., 10)"
                          min="0"
                          max="100"
                          step="0.1"
                          value={budget ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBudget(val === '' ? null : parseFloat(val));
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Percentage of employee's annual salary
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Playground Overview</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Explore scenario planning, mass treatment, and tracking tools using the tabs below. Select an employee when you&rsquo;re ready to generate personalized insights and projections.
                    </p>
                  </div>
                )}

                {/* Tab Navigation */}
                <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('scenario')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'scenario'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                  >
                    <GitCompare className="w-4 h-4" />
                    Scenario Comparison
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'scenario' ? (
                  <ScenarioComparisonTab
                    scenarios={scenarios}
                    setScenarios={setScenarios}
                    nextScenarioId={nextScenarioId}
                    setNextScenarioId={setNextScenarioId}
                    selectedEmployee={selectedEmployee}
                    selectedEmployeeData={selectedEmployeeData}
                    treatmentSuggestions={treatmentSuggestions}
                    applyTreatment={applyTreatment}
                    isApplyingTreatment={isApplyingTreatment}
                    selectedTreatment={selectedTreatment}
                    isPerformanceMode={isPerformanceMode}
                    // Mode determined by Settings
                    budget={budget}
                    transformedChartData={transformedChartData}
                  />
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
                ) : (
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
                )}
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="lg:col-span-2 bg-white dark:bg-gray-800/80 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/50 flex flex-col overflow-hidden h-full min-h-0">
        <div className="flex flex-col p-4 h-full min-h-0">
          {/* Chart Title and Controls */}
          <div className="mb-3 pb-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Scenario Comparison - Retention Probability
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={addScenario}
                  disabled={!selectedEmployee || scenarios.length >= MAX_SCENARIOS}
                  title={!selectedEmployee ? 'Select an employee to add personalized scenarios' : scenarios.length >= MAX_SCENARIOS ? `Maximum of ${MAX_SCENARIOS} scenarios reached` : undefined}
                  className="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <GitCompare className="w-3 h-3" />
                  Add Scenario
                </button>
              </div>
            </div>

            {!selectedEmployeeData && (
              <div className="mb-3 p-3 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200 text-xs">
                Select an employee to compare baseline versus treated retention probabilities. Until then, the chart below will stay empty.
              </div>
            )}

            {/* Scenario Management */}
            {scenarios.length > 0 && (
              <div className="space-y-2 mb-3">
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: scenario.color }}></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{scenario.name}</span>
                    <select
                      value={scenario.treatmentId || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const treatmentId = value === '' ? null : parseInt(value, 10);
                        updateScenarioTreatment(scenario.id, treatmentId);
                      }}
                      className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1"
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
                      className="text-red-500 hover:text-red-700 ml-auto"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedEmployeeData && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Current Risk:</strong> {(selectedEmployeeData.current_churn_probability * 100).toFixed(1)}% annual churn probability
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Compare different treatment scenarios side by side. Each line represents a different scenario with its applied treatment.
                </p>
              </div>
            )}
          </div>

          <div className="flex-1" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={scenarioChartData}
                margin={{ top: 5, right: 20, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  label={{ value: 'Months from Now', position: 'bottom', dy: 5, style: { fontSize: 12, fill: '#6b7280' } }}
                  type="number"
                  domain={[1, 12]}
                  ticks={[1, 3, 6, 9, 12]}
                  stroke="#6b7280"
                  tick={{ fontSize: 11 }}
                  axisLine={{ stroke: "#d1d5db" }}
                  tickLine={{ stroke: "#d1d5db" }}
                />
                <YAxis
                  label={{ value: 'Retention Probability (%)', angle: -90, position: 'insideLeft', offset: -5, dx: -10, style: { fontSize: 12, fill: '#6b7280' } }}
                  domain={[0, 100]}
                  stroke="#6b7280"
                  tick={{ fontSize: 11 }}
                  axisLine={{ stroke: "#d1d5db" }}
                  tickLine={{ stroke: "#d1d5db" }}
                  width={45}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg text-xs max-w-xs">
                          <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {label} months from now
                          </p>
                          {payload.map((entry: any) => (
                            <div key={entry.name} className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
                              <span className="font-medium text-gray-800 dark:text-gray-100">{entry.value.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={30}
                  iconSize={8}
                  wrapperStyle={{ fontSize: '12px', paddingTop: '5px' }}
                  formatter={(value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>}
                />

                {scenarios.map((scenario) => (
                  <Line
                    key={scenario.id}
                    type="monotone"
                    dataKey={scenario.name}
                    stroke={scenario.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 1, fill: scenario.color }}
                    name={scenario.name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800/80 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/50 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <h3 className="text-base font-medium text-gray-700 dark:text-gray-200">
            AI-Generated Treatments
          </h3>
        </div>

        {/* Disclaimer removed; presentation is now governed by global data mode in Settings */}

        {treatmentSuggestions.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600" style={{ minHeight: '300px' }}>
            {treatmentSuggestions
              .filter(treatment => {
                if (budget === null) return true;
                const costPercentage = calculateCostPercentage(treatment.cost, selectedEmployeeData?.current_features.employee_cost || 0);
                return costPercentage <= budget;
              })
              .slice(0, 6)
              .map((treatment) => (
                <TreatmentCard
                  key={treatment.id}
                  treatment={treatment}
                  onSelect={applyTreatment}
                  isSelected={selectedTreatment?.id === treatment.id}
                  isLoading={isApplyingTreatment && selectedTreatment?.id === treatment.id}

                  employeeSalary={selectedEmployeeData?.current_features.employee_cost || 0}
                />
              ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center py-8 text-gray-500 dark:text-gray-400">
            <p>{selectedEmployeeData ? 'No treatment suggestions available for this employee.' : 'Select an employee to generate treatment suggestions.'}</p>
          </div>
        )}
      </div>
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
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold">Mass Treatment Analysis</h3>
        <p className="text-sm text-gray-500">Identify and prioritize employees for retention efforts.</p>

        {/* Enhanced Progress Bar for Bulk Operations */}
        {isApplyingBulkTreatment && bulkProgress.total > 0 && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {bulkOperationCancelled ? 'Cancelling...' : 'Applying Treatments'}
                  </span>
                </div>
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  ({bulkProgress.completed}/{bulkProgress.total})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%
                </span>
                {!bulkOperationCancelled && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelBulkTreatment}
                    className="h-6 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 mb-3">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                style={{ width: `${Math.max(8, (bulkProgress.completed / bulkProgress.total) * 100)}%` }}
              >
                {bulkProgress.completed > 0 && (
                  <span className="text-xs text-white font-medium">
                    {Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%
                  </span>
                )}
              </div>
            </div>

            {/* Status Details */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                {(bulkProgress.successful ?? 0) > 0 && (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    {bulkProgress.successful} successful
                  </span>
                )}
                {(bulkProgress.failed ?? 0) > 0 && (
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    {bulkProgress.failed} failed
                  </span>
                )}
              </div>
              <div className="text-blue-700 dark:text-blue-300">
                {bulkProgress.currentEmployee && (
                  <span>Current: {bulkProgress.currentEmployee}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Candidates analyzed</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{candidates.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{summaryMetrics.appliedCount} already applied</div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {isPerformanceMode ? 'Potential churn reduction' : 'Potential ELTV gain'}
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {isPerformanceMode
                ? `${(summaryMetrics.totalPotentialChurn * 100).toFixed(1)}%`
                : formatCurrency(summaryMetrics.totalPotentialELTV)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Selected: {isPerformanceMode
                ? `${(summaryMetrics.selectedPotentialChurn * 100).toFixed(1)}%`
                : formatCurrency(summaryMetrics.selectedPotentialELTV)}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {isPerformanceMode ? 'Realized churn drop' : 'Realized impact'}
            </div>
            <div className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
              {isPerformanceMode
                ? `${(summaryMetrics.realizedChurnDrop * 100).toFixed(1)}%`
                : formatCurrency(summaryMetrics.realizedGainELTV)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{selectedCandidates.size} selected</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={analyzeTeamForTreatment} disabled={isLoading || isApplyingBulkTreatment}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Analyze Team
          </Button>

          {/* Bulk Action Buttons */}
          {candidates.length > 0 && (
            <>
              <Button
                onClick={() => applyBulkTreatment()}
                disabled={selectedCount === 0 || isApplyingBulkTreatment}
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
                >
                  Select All
                </Button>
                <Button
                  onClick={deselectAllCandidates}
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0}
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
                      className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1"
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
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="mx-auto h-12 w-12 text-gray-400 animate-spin mb-4" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Analyzing employees...</h3>
            <p className="text-sm text-gray-500">This may take a few moments as we evaluate each employee for treatment opportunities.</p>
          </div>
        ) : candidates.length > 0 ? (
          <div className="space-y-4">
            {candidates.map((candidate) => {
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
                <div
                  key={candidate.employee.id}
                  className={cn(
                    'p-4 rounded-lg shadow-sm border transition-all',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                      : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700',
                    candidate.lastResult ? 'border-emerald-300 dark:border-emerald-500/60 ring-1 ring-emerald-100 dark:ring-emerald-500/30' : '',
                    candidate.isApplying ? 'opacity-90' : ''
                  )}
                >
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidate(candidate.employee.hr_code)}
                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            {candidate.employee.full_name || candidate.employee.name}
                          </h4>
                          {candidate.lastResult && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium">
                              <CheckCircle className="h-3 w-3" /> Applied
                            </span>
                          )}
                          {candidate.isApplying && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300">
                              <Loader2 className="h-3 w-3 animate-spin" /> Applying…
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {candidate.employee.position} • {candidate.employee.structure_name || candidate.employee.department}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                          <span className={cn(
                            'px-2 py-1 rounded-full',
                            candidate.riskLevel === 'High'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : candidate.riskLevel === 'Medium'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          )}>
                            {candidate.riskLevel} Risk
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">Priority {candidate.priorityScore?.toFixed(0) || 'N/A'}</span>
                          {candidate.lastResult && (
                            <span className="text-emerald-600 dark:text-emerald-300 font-medium">
                              {isPerformanceMode
                                ? `${realizedChurnDrop !== null ? (realizedChurnDrop * 100).toFixed(1) : '0.0'}% churn drop`
                                : `+${formatCurrency(candidate.lastResult.treatment_effect_eltv ?? 0)} impact`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        size="sm"
                        disabled={!candidate.topTreatment || candidate.isApplying}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => applyCandidateTreatment(candidate).catch(() => { })}
                      >
                        {candidate.isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply Recommended'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={candidate.isApplying}
                        onClick={() => handleEmployeeSelect(candidate.employee.id, candidate.topTreatment?.id)}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>

                  {candidate.topTreatment && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300">
                        <h5 className="text-sm font-medium text-blue-900 dark:text-blue-100">Recommended Treatment</h5>
                        {isPerformanceMode ? (
                          <div className="flex flex-col items-end">
                            <span>Projected RVI {projectedRviCategory ?? 'N/A'}</span>
                            {costPercentageDisplay && (
                              <span className="text-[11px] text-blue-600/80 dark:text-blue-300/80">
                                Cost {costPercentageDisplay} of salary
                              </span>
                            )}
                          </div>
                        ) : (
                          <span>Cost {formatCurrency(candidate.topTreatment.cost || 0)}</span>
                        )}
                      </div>
                      <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">{candidate.topTreatment.name}</p>
                      {isPerformanceMode ? (
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1 space-y-1">
                          <div>Churn drop {(Math.max(0, candidate.potentialChurnReduction || 0) * 100).toFixed(1)}%</div>
                          {costPercentageDisplay ? (
                            <div>Cost share {costPercentageDisplay} of salary</div>
                          ) : null}
                          <div>Time to impact: {candidate.topTreatment.timeToEffect || 'N/A'}</div>
                        </div>
                      ) : (
                        <div className="flex justify-between text-xs text-blue-700 dark:text-blue-300 mt-1">
                          <span>Expected Gain {formatCurrency(candidate.potentialELTVGain)}</span>
                          <span>Time to impact: {candidate.topTreatment.timeToEffect || 'N/A'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!candidate.topTreatment && (
                    <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3 mb-3 text-xs text-gray-600 dark:text-gray-400">
                      This employee does not currently have an AI-recommended treatment. Consider reviewing their profile manually.
                    </div>
                  )}

                  {candidate.lastResult && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600 dark:text-gray-300 mb-3">
                      {resultMetrics.map((metric, idx) => (
                        <div key={`${candidate.employee.hr_code}-metric-${idx}`}>
                          <span className="font-medium text-gray-700 dark:text-gray-200">{metric.label}</span>
                          <div>{metric.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {candidate.selectionCriteria && candidate.selectionCriteria.length > 0 && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Why selected:</span>
                      <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                        {candidate.selectionCriteria.slice(0, isPerformanceMode ? 4 : 3).map((criteria, idx) => (
                          <li key={idx}>{criteria}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {candidate.lastError && (
                    <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {candidate.lastError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No candidates analyzed</h3>
            <p className="mt-1 text-sm text-gray-500">Click "Analyze Team" to get started.</p>
          </div>
        )}
      </div>

      {/* Template Save Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Save Template
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., High Risk Engineering Team"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                This will save your current selection ({selectedCount} employees) and filters
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={saveTemplate} disabled={!templateName.trim()}>
                Save Template
              </Button>
              <Button
                onClick={() => {
                  setShowTemplateModal(false);
                  setTemplateName('');
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
