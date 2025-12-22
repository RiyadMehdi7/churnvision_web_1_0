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
  Target
} from 'lucide-react';
import { cn } from '../lib/utils';
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
import api from '../services/apiService';

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

function getFeatureIcon(featureName: string): string {
  const icons: Record<string, string> = {
    satisfaction_level: '😊',
    last_evaluation: '📊',
    number_project: '📁',
    average_monthly_hours: '⏰',
    time_spend_company: '📅',
    work_accident: '⚠️',
    promotion_last_5years: '🚀',
    department: '🏢',
    salary_level: '💰'
  };
  return icons[featureName] || '📋';
}

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
          <div className="space-y-1">
            <div className="flex items-center gap-2">
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
                className="flex-1 accent-blue-500"
              />
              <span className={cn(
                "text-sm font-medium w-14 text-right",
                hasModification ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"
              )}>
                {((modifiedValue ?? baseValue) as number).toFixed(2)}
              </span>
            </div>
            {hasModification && (
              <div className="text-xs text-blue-600 dark:text-blue-400">
                {(baseValue as number).toFixed(2)} → {(modifiedValue as number).toFixed(2)}
                {feature.impact_direction === 'higher_is_better' && modifiedValue > baseValue && ' ↑'}
                {feature.impact_direction === 'lower_is_better' && modifiedValue < baseValue && ' ↓'}
              </div>
            )}
          </div>
        );

      case 'int':
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
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
                className="flex-1 accent-blue-500"
              />
              <span className={cn(
                "text-sm font-medium w-12 text-right",
                hasModification ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"
              )}>
                {modifiedValue ?? baseValue}
              </span>
            </div>
            {hasModification && (
              <div className="text-xs text-blue-600 dark:text-blue-400">
                {baseValue} → {modifiedValue}
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
                "w-12 h-6 rounded-full transition-colors relative",
                boolValue
                  ? "bg-green-500"
                  : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  boolValue ? "translate-x-7" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {boolValue ? 'Yes' : 'No'}
            </span>
            {hasModification && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                (changed from {baseValue ? 'Yes' : 'No'})
              </span>
            )}
          </div>
        );

      case 'categorical':
        return (
          <div className="flex flex-wrap gap-1">
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
                  "px-2 py-1 text-xs rounded-md transition-colors",
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
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
          <Brain className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Atlas Counterfactual Simulator
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Select an employee to run what-if scenarios using real ML model predictions.
          See exactly how changes would affect their churn probability.
        </p>
      </div>
    );
  }

  if (isLoadingFeatures) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading ML features...</span>
      </div>
    );
  }

  if (featuresError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Could Not Load Features
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real ML predictions for <span className="font-medium">{mlFeatures.employee_name || selectedEmployeeId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addScenario}
            disabled={scenarios.length >= 5}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Scenario
          </button>
          {scenarios.length > 0 && scenarios.some(s => Object.keys(s.modifications).length > 0) && (
            <button
              onClick={runAllSimulations}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Run All
            </button>
          )}
        </div>
      </div>

      {/* Current ML Features Overview */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg p-4">
        <div className="flex items-start gap-2 mb-3">
          <Target className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Current ML Model Features
            </p>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
              These are the 9 features used by the churn prediction model. Modify them to see real predictions.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {mlFeatures.perturbable_features.slice(0, 5).map((f) => (
            <div key={f.name} className="text-center p-2 bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <span className="text-lg">{getFeatureIcon(f.name)}</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{f.label}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
            className="bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center"
          >
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No scenarios yet. Click "Add Scenario" to start modeling what-if interventions.
            </p>
            <button
              onClick={addScenario}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
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
                  className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
                  style={{ borderTopColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length], borderTopWidth: 3 }}
                >
                  <input
                    type="text"
                    value={scenario.name}
                    onChange={(e) => updateScenarioName(scenario.id, e.target.value)}
                    className="bg-transparent font-medium text-gray-900 dark:text-gray-100 border-none focus:outline-none focus:ring-0 p-0"
                  />
                  <button
                    onClick={() => removeScenario(scenario.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Feature Controls */}
                <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                  {mlFeatures.perturbable_features.map((feature) => (
                    <div key={feature.name}>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <span>{getFeatureIcon(feature.name)}</span>
                        {feature.label}
                        {feature.impact_direction !== 'neutral' && (
                          <span className="text-xs text-gray-400">
                            ({feature.impact_direction === 'higher_is_better' ? '↑ better' : '↓ better'})
                          </span>
                        )}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                        {feature.description}
                      </p>
                      <div className="mt-1">
                        {renderFeatureControl(feature, scenario.id, scenario.modifications)}
                      </div>
                    </div>
                  ))}

                  {/* Run Button */}
                  <button
                    onClick={() => runSimulation(scenario.id)}
                    disabled={scenario.isLoading || Object.keys(scenario.modifications).length === 0}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    {scenario.isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Brain className="w-4 h-4" />
                    )}
                    {scenario.isLoading ? 'Running Model...' : 'Run Counterfactual'}
                  </button>
                </div>

                {/* Results */}
                {scenario.result && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600">
                    {/* Model prediction badge */}
                    <div className="flex items-center gap-1 mb-2">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        Real ML Prediction (Confidence: {formatPercentage(scenario.result.scenario_confidence)})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Churn Delta</span>
                        <div className={cn(
                          "font-semibold flex items-center gap-1",
                          scenario.result.churn_delta < 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {scenario.result.churn_delta < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                          {formatPercentage(Math.abs(scenario.result.churn_delta))}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">ELTV Delta</span>
                        <div className={cn(
                          "font-semibold",
                          scenario.result.eltv_delta > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {scenario.result.eltv_delta > 0 ? '+' : ''}{formatCurrency(scenario.result.eltv_delta)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Cost</span>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(scenario.result.implied_annual_cost)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">ROI</span>
                        <div className={cn(
                          "font-semibold",
                          scenario.result.implied_roi > 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {scenario.result.implied_roi.toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Key SHAP factors */}
                    {scenario.result.scenario_factors.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Key Factors (SHAP):</p>
                        <div className="space-y-1">
                          {scenario.result.scenario_factors.slice(0, 2).map((factor, i) => (
                            <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                factor.direction === 'decreases_risk' ? "bg-green-500" : "bg-red-500"
                              )} />
                              {factor.message || `${factor.feature}: ${factor.impact}`}
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
                      <AlertTriangle className="w-4 h-4" />
                      {scenario.error}
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
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              ROI Comparison
            </h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(0)}%`, 'ROI']}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb'
                    }}
                  />
                  <Bar dataKey="roi">
                    {roiChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Survival Curve Comparison */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              Survival Projection
            </h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={survivalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Survival']}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb'
                    }}
                  />
                  <Legend />
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
          </div>
        </div>
      )}
    </div>
  );
}

export default AtlasSimulatorSubTab;
