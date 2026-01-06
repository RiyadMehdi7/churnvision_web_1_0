/**
 * Atlas Simulator Sub-Tab Component
 * TRUE Counterfactual Analysis using ML Model Perturbation
 *
 * This component uses the actual ML model to predict churn changes,
 * not heuristic-based estimates. It works with the 9 EmployeeChurnFeatures
 * that the model was trained on.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
  Sparkles,
  Brain,
  CheckCircle2,
  Target,
  Gauge,
  Briefcase,
  Clock,
  Calendar,
  Shield,
  Award,
  Building2,
  DollarSign,
  Play
} from 'lucide-react';
import { cn, colors } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import api from '@/services/apiService';

// Types for ML-based counterfactual
interface PerturbableFeature {
  name: string;
  label: string;
  current_value: number | boolean | string;
  type: 'float' | 'int' | 'bool' | 'categorical';
  min_value?: number;
  max_value?: number;
  step?: number;
  options?: string[];
  description: string;
  impact_direction: 'higher_is_better' | 'lower_is_better' | 'neutral';
}

interface EmployeeMlFeatures {
  employee_id: string;
  employee_name?: string;
  features: Record<string, any>;
  perturbable_features: PerturbableFeature[];
  annual_salary?: number;
}

interface ContributingFactor {
  feature: string;
  value: any;
  shap_value?: number;
  impact: string;
  direction?: string;
  message?: string;
}

interface CounterfactualResult {
  scenario_name: string;
  scenario_id: string;
  baseline_churn_prob: number;
  baseline_risk_level: string;
  baseline_eltv: number;
  baseline_confidence: number;
  baseline_factors: ContributingFactor[];
  scenario_churn_prob: number;
  scenario_risk_level: string;
  scenario_eltv: number;
  scenario_confidence: number;
  scenario_factors: ContributingFactor[];
  churn_delta: number;
  eltv_delta: number;
  implied_annual_cost: number;
  implied_roi: number;
  baseline_survival_probs: Record<string, number>;
  scenario_survival_probs: Record<string, number>;
  modifications: Record<string, any>;
  simulated_at: string;
  prediction_method: 'model' | 'heuristic';
}

interface Scenario {
  id: string;
  name: string;
  modifications: Record<string, any>;
  result?: CounterfactualResult;
  isLoading?: boolean;
  error?: string;
}

interface AtlasSimulatorSubTabProps {
  selectedEmployeeId?: string;
  className?: string;
}

const SCENARIO_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Map feature names to Lucide icons
function getFeatureIcon(featureName: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    satisfaction_level: <Gauge className="w-4 h-4" />,
    last_evaluation: <Target className="w-4 h-4" />,
    number_project: <Briefcase className="w-4 h-4" />,
    average_monthly_hours: <Clock className="w-4 h-4" />,
    time_spend_company: <Calendar className="w-4 h-4" />,
    work_accident: <Shield className="w-4 h-4" />,
    promotion_last_5years: <Award className="w-4 h-4" />,
    department: <Building2 className="w-4 h-4" />,
    salary_level: <DollarSign className="w-4 h-4" />
  };
  return iconMap[featureName] || <Target className="w-4 h-4" />;
}

// Clean section card matching design system
const SectionCard: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, children, className }) => (
  <div className={cn("bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden", className)}>
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
      )}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

export function AtlasSimulatorSubTab({
  selectedEmployeeId,
  className
}: AtlasSimulatorSubTabProps) {
  const [mlFeatures, setMlFeatures] = useState<EmployeeMlFeatures | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);
  const [nextScenarioId, setNextScenarioId] = useState(1);

  // Fetch ML features when employee changes
  useEffect(() => {
    const fetchMlFeatures = async () => {
      if (!selectedEmployeeId) {
        setMlFeatures(null);
        setFeaturesError(null);
        return;
      }

      setIsLoadingFeatures(true);
      setFeaturesError(null);

      try {
        const response = await api.get(`/atlas/employee-features/${selectedEmployeeId}`);
        setMlFeatures(response.data);
      } catch (err: any) {
        console.error('Error fetching ML features:', err);
        setFeaturesError(err.response?.data?.detail || 'Failed to load employee features');
        setMlFeatures(null);
      } finally {
        setIsLoadingFeatures(false);
      }
    };

    fetchMlFeatures();
    // Clear scenarios when employee changes
    setScenarios([]);
    setNextScenarioId(1);
  }, [selectedEmployeeId]);

  // Add a new empty scenario
  const addScenario = () => {
    if (scenarios.length >= 5 || !mlFeatures) return;

    const newScenario: Scenario = {
      id: `cf_${nextScenarioId}`,
      name: `Scenario ${nextScenarioId}`,
      modifications: {}
    };

    setScenarios([...scenarios, newScenario]);
    setNextScenarioId(nextScenarioId + 1);
  };

  // Remove a scenario
  const removeScenario = (scenarioId: string) => {
    setScenarios(scenarios.filter(s => s.id !== scenarioId));
  };

  // Update scenario modifications
  const updateScenarioModification = (
    scenarioId: string,
    feature: string,
    value: any
  ) => {
    setScenarios(scenarios.map(s => {
      if (s.id !== scenarioId) return s;

      const newMods = { ...s.modifications };

      if (value === null || value === undefined) {
        delete newMods[feature];
      } else {
        newMods[feature] = value;
      }

      return { ...s, modifications: newMods, result: undefined };
    }));
  };

  // Update scenario name
  const updateScenarioName = (scenarioId: string, name: string) => {
    setScenarios(scenarios.map(s =>
      s.id === scenarioId ? { ...s, name } : s
    ));
  };

  // Run counterfactual simulation for a single scenario
  const runSimulation = async (scenarioId: string) => {
    if (!selectedEmployeeId || !mlFeatures) return;

    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario || Object.keys(scenario.modifications).length === 0) return;

    setScenarios(scenarios.map(s =>
      s.id === scenarioId ? { ...s, isLoading: true, error: undefined } : s
    ));

    try {
      const response = await api.post('/atlas/counterfactual', {
        employee_id: selectedEmployeeId,
        base_features: mlFeatures.features,
        modifications: scenario.modifications,
        scenario_name: scenario.name,
        scenario_id: scenario.id,
        annual_salary: mlFeatures.annual_salary
      });

      setScenarios(scenarios.map(s =>
        s.id === scenarioId
          ? { ...s, result: response.data, isLoading: false }
          : s
      ));
    } catch (err: any) {
      setScenarios(scenarios.map(s =>
        s.id === scenarioId
          ? { ...s, error: err.response?.data?.detail || 'Counterfactual simulation failed', isLoading: false }
          : s
      ));
    }
  };

  // Run all scenarios using batch endpoint
  const runAllSimulations = async () => {
    if (!selectedEmployeeId || !mlFeatures) return;

    const validScenarios = scenarios.filter(s => Object.keys(s.modifications).length > 0);
    if (validScenarios.length === 0) return;

    // Mark all as loading
    setScenarios(scenarios.map(s => ({ ...s, isLoading: true, error: undefined })));

    try {
      const response = await api.post('/atlas/counterfactual/batch', {
        employee_id: selectedEmployeeId,
        base_features: mlFeatures.features,
        scenarios: validScenarios.map(s => ({
          name: s.name,
          id: s.id,
          modifications: s.modifications
        })),
        annual_salary: mlFeatures.annual_salary
      });

      const results = response.data.scenarios as CounterfactualResult[];

      setScenarios(scenarios.map(s => {
        const result = results.find(r => r.scenario_id === s.id);
        return result ? { ...s, result, isLoading: false } : { ...s, isLoading: false };
      }));
    } catch (err: any) {
      setScenarios(scenarios.map(s => ({
        ...s,
        error: err.response?.data?.detail || 'Batch counterfactual failed',
        isLoading: false
      })));
    }
  };

  // Render modification control based on feature type
  const renderFeatureControl = (
    feature: PerturbableFeature,
    scenarioId: string,
    currentMods: Record<string, any>
  ) => {
    const modifiedValue = currentMods[feature.name];
    const baseValue = feature.current_value;
    const hasModification = modifiedValue !== undefined && modifiedValue !== baseValue;

    switch (feature.type) {
      case 'float':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={feature.min_value ?? 0}
                max={feature.max_value ?? 1}
                step={feature.step ?? 0.05}
                value={modifiedValue ?? baseValue}
                onChange={(e) => {
                  const newVal = parseFloat(e.target.value);
                  if (newVal === baseValue) {
                    updateScenarioModification(scenarioId, feature.name, null);
                  } else {
                    updateScenarioModification(scenarioId, feature.name, newVal);
                  }
                }}
                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500"
              />
              <span className={cn(
                "text-sm font-medium min-w-[3rem] text-right tabular-nums",
                hasModification ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
              )}>
                {((modifiedValue ?? baseValue) as number).toFixed(2)}
              </span>
            </div>
            {hasModification && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{(baseValue as number).toFixed(2)}</span>
                <span className="text-gray-400">→</span>
                <span className={cn(
                  "font-medium",
                  feature.impact_direction === 'higher_is_better' && modifiedValue > baseValue
                    ? "text-emerald-600 dark:text-emerald-400"
                    : feature.impact_direction === 'lower_is_better' && modifiedValue < baseValue
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-blue-600 dark:text-blue-400"
                )}>
                  {(modifiedValue as number).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        );

      case 'int':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={feature.min_value ?? 0}
                max={feature.max_value ?? 10}
                step={feature.step ?? 1}
                value={modifiedValue ?? baseValue}
                onChange={(e) => {
                  const newVal = parseInt(e.target.value);
                  if (newVal === baseValue) {
                    updateScenarioModification(scenarioId, feature.name, null);
                  } else {
                    updateScenarioModification(scenarioId, feature.name, newVal);
                  }
                }}
                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500"
              />
              <span className={cn(
                "text-sm font-medium min-w-[2rem] text-right tabular-nums",
                hasModification ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
              )}>
                {modifiedValue ?? baseValue}
              </span>
            </div>
            {hasModification && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{baseValue}</span>
                <span className="text-gray-400">→</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">{modifiedValue}</span>
              </div>
            )}
          </div>
        );

      case 'bool':
        const boolValue = modifiedValue !== undefined ? modifiedValue : baseValue;
        return (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newVal = !boolValue;
                if (newVal === baseValue) {
                  updateScenarioModification(scenarioId, feature.name, null);
                } else {
                  updateScenarioModification(scenarioId, feature.name, newVal);
                }
              }}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                boolValue
                  ? "bg-emerald-500"
                  : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                  boolValue ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {boolValue ? 'Yes' : 'No'}
            </span>
            {hasModification && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                (was {baseValue ? 'Yes' : 'No'})
              </span>
            )}
          </div>
        );

      case 'categorical':
        return (
          <div className="flex flex-wrap gap-1.5">
            {feature.options?.map((option) => (
              <button
                key={option}
                onClick={() => {
                  if (option === baseValue) {
                    updateScenarioModification(scenarioId, feature.name, null);
                  } else {
                    updateScenarioModification(scenarioId, feature.name, option);
                  }
                }}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  (modifiedValue ?? baseValue) === option
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  // Prepare chart data for survival comparison
  const survivalChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => `month_${i + 1}`);
    return months.map((monthKey, idx) => {
      const data: Record<string, any> = { month: `M${idx + 1}` };

      // Add baseline from first result
      const firstResult = scenarios.find(s => s.result)?.result;
      if (firstResult?.baseline_survival_probs) {
        data['Baseline'] = (firstResult.baseline_survival_probs[monthKey] || 0) * 100;
      }

      // Add each scenario
      scenarios.forEach((s) => {
        if (s.result?.scenario_survival_probs) {
          data[s.name] = (s.result.scenario_survival_probs[monthKey] || 0) * 100;
        }
      });

      return data;
    });
  }, [scenarios]);

  // ROI comparison data
  const roiChartData = useMemo(() => {
    return scenarios
      .filter(s => s.result)
      .map((s, idx) => ({
        name: s.name,
        roi: s.result!.implied_roi,
        eltv_delta: s.result!.eltv_delta,
        cost: s.result!.implied_annual_cost,
        color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
      }));
  }, [scenarios]);

  // No employee selected state
  if (!selectedEmployeeId) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
          <Brain className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Atlas Counterfactual Simulator
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
          Select an employee to run what-if scenarios using real ML model predictions.
          See exactly how changes would affect their churn probability.
        </p>
      </div>
    );
  }

  if (isLoadingFeatures) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <span className="text-sm text-gray-600 dark:text-gray-400">Loading ML features...</span>
      </div>
    );
  }

  if (featuresError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Could Not Load Features
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
          {featuresError}
        </p>
      </div>
    );
  }

  if (!mlFeatures) {
    return null;
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-500" />
            Counterfactual Simulator
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Real ML predictions for <span className="font-medium text-gray-700 dark:text-gray-300">{mlFeatures.employee_name || selectedEmployeeId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addScenario}
            disabled={scenarios.length >= 5}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Scenario
          </button>
          {scenarios.length > 0 && scenarios.some(s => Object.keys(s.modifications).length > 0) && (
            <button
              onClick={runAllSimulations}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Run All
            </button>
          )}
        </div>
      </div>

      {/* Current ML Features Overview */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Current Model Features
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              These are the features used by the churn prediction model. Modify them to see real predictions.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {mlFeatures.perturbable_features.slice(0, 5).map((f) => (
            <div key={f.name} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-gray-400">{getFeatureIcon(f.name)}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">{f.label}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {typeof f.current_value === 'boolean'
                  ? (f.current_value ? 'Yes' : 'No')
                  : typeof f.current_value === 'number'
                    ? f.current_value.toFixed(f.type === 'int' ? 0 : 2)
                    : f.current_value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario Cards */}
      <AnimatePresence>
        {scenarios.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center"
          >
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              No scenarios yet. Create a scenario to model what-if interventions.
            </p>
            <button
              onClick={addScenario}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Scenario
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {scenarios.map((scenario, idx) => (
              <motion.div
                key={scenario.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Scenario Header */}
                <div
                  className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}
                >
                  <input
                    type="text"
                    value={scenario.name}
                    onChange={(e) => updateScenarioName(scenario.id, e.target.value)}
                    className="bg-transparent font-medium text-gray-900 dark:text-gray-100 border-none focus:outline-none focus:ring-0 p-0 w-full"
                  />
                  <button
                    onClick={() => removeScenario(scenario.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Feature Controls */}
                <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
                  {mlFeatures.perturbable_features.map((feature) => (
                    <div key={feature.name} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{getFeatureIcon(feature.name)}</span>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {feature.label}
                        </label>
                        {feature.impact_direction !== 'neutral' && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            ({feature.impact_direction === 'higher_is_better' ? '↑' : '↓'} better)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {feature.description}
                      </p>
                      <div className="mt-1.5">
                        {renderFeatureControl(feature, scenario.id, scenario.modifications)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Run Button */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => runSimulation(scenario.id)}
                    disabled={scenario.isLoading || Object.keys(scenario.modifications).length === 0}
                    className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {scenario.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {scenario.isLoading ? 'Running Model...' : 'Run Counterfactual'}
                  </button>
                </div>

                {/* Results */}
                {scenario.result && (
                  <div className="px-4 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700">
                    {/* Model prediction badge */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        ML Prediction • {formatPercentage(scenario.result.scenario_confidence)} confidence
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Churn Delta</span>
                        <div className={cn(
                          "text-lg font-bold flex items-center gap-1",
                          scenario.result.churn_delta < 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {scenario.result.churn_delta < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                          {formatPercentage(Math.abs(scenario.result.churn_delta))}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400">ELTV Delta</span>
                        <div className={cn(
                          "text-lg font-bold",
                          scenario.result.eltv_delta > 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {scenario.result.eltv_delta > 0 ? '+' : ''}{formatCurrency(scenario.result.eltv_delta)}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Annual Cost</span>
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(scenario.result.implied_annual_cost)}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400">ROI</span>
                        <div className={cn(
                          "text-lg font-bold",
                          scenario.result.implied_roi > 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {scenario.result.implied_roi.toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Key SHAP factors */}
                    {scenario.result.scenario_factors.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Key Impact Factors</p>
                        <div className="space-y-1.5">
                          {scenario.result.scenario_factors.slice(0, 2).map((factor, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                factor.direction === 'decreases_risk' ? "bg-emerald-500" : "bg-red-500"
                              )} />
                              <span className="text-gray-600 dark:text-gray-400 truncate">
                                {factor.message || `${factor.feature}: ${factor.impact}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {scenario.error && (
                  <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{scenario.error}</span>
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Comparison Charts */}
      {scenarios.some(s => s.result) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ROI Comparison */}
          <SectionCard
            title="ROI Comparison"
            icon={<TrendingUp className="w-4 h-4" />}
            description="Return on investment across scenarios"
          >
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip
                    formatter={(value) => [`${(value as number)?.toFixed(0) ?? 0}%`, 'ROI']}
                    contentStyle={{
                      backgroundColor: colors.tooltip.light,
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                    {roiChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Survival Curve Comparison */}
          <SectionCard
            title="Survival Projection"
            icon={<Target className="w-4 h-4" />}
            description="Retention probability over time"
          >
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={survivalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip
                    formatter={(value) => [`${(value as number)?.toFixed(1) ?? 0}%`, 'Survival']}
                    contentStyle={{
                      backgroundColor: colors.tooltip.light,
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="Baseline"
                    stroke="#6b7280"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                  />
                  {scenarios.filter(s => s.result).map((s, idx) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.name}
                      stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

export default AtlasSimulatorSubTab;
