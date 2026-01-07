/**
 * Simulation Panel Component
 *
 * Treatment-First Unified Simulator that allows users to:
 * 1. Select a treatment
 * 2. See which ML features it affects
 * 3. Fine-tune feature values if needed
 * 4. Run ML-based simulation
 * 5. View projected outcomes
 *
 * Design aligned with ChurnVision design system (AtlasSimulatorSubTab pattern).
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Settings2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  AlertCircle,
  Check,
} from 'lucide-react';
import api from '@/services/apiService';
import { cn } from '@/lib/utils';
import { BalancedScorecard } from './BalancedScorecard';

interface Treatment {
  id: number;
  name: string;
  description?: string;
  cost: number;
  effectSize?: number;
  timeToEffect: string;
  riskLevels?: string[];
}

interface SimulationResult {
  employee_id: string;
  treatment_id: number;
  treatment_name: string;
  treatment_cost: number;
  feature_modifications: Record<string, unknown>;
  pre_churn_probability: number;
  post_churn_probability: number;
  churn_delta: number;
  eltv_pre_treatment: number;
  eltv_post_treatment: number;
  treatment_effect_eltv: number;
  net_benefit: number;
  roi: number;
  new_survival_probabilities: Record<string, number>;
  ml_model_used: boolean;
  applied_treatment: {
    id: number;
    name: string;
    cost: number;
    description?: string;
    affected_features?: string[];
  };
}

interface TreatmentMapping {
  treatment_id: number;
  treatment_name: string;
  description: string;
  estimated_cost: number;
  feature_modifications: Record<string, unknown>;
  affected_features: string[];
}

interface SimulationPanelProps {
  employeeId: string;
  treatments: Treatment[];
  currentChurnProbability: number;
  currentELTV: number;
  onSimulationComplete?: (result: SimulationResult) => void;
  onGenerateRecommendation?: (result: SimulationResult) => void;
}

// Feature display names and constraints
const FEATURE_CONFIG: Record<string, {
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}> = {
  satisfaction_level: {
    label: 'Satisfaction Level',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  last_evaluation: {
    label: 'Last Evaluation Score',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  number_project: {
    label: 'Number of Projects',
    min: 1,
    max: 10,
    step: 1,
    format: (v) => v.toString(),
  },
  average_monthly_hours: {
    label: 'Monthly Hours',
    min: 80,
    max: 300,
    step: 5,
    format: (v) => `${v}h`,
  },
  time_spend_company: {
    label: 'Tenure (Years)',
    min: 0,
    max: 20,
    step: 1,
    format: (v) => `${v} years`,
  },
  promotion_last_5years: {
    label: 'Promoted Recently',
    min: 0,
    max: 1,
    step: 1,
    format: (v) => v ? 'Yes' : 'No',
  },
  salary_level: {
    label: 'Salary Level',
    min: 0,
    max: 2,
    step: 1,
    format: (v) => ['Low', 'Medium', 'High'][v] || 'Medium',
  },
};

// SectionCard matching ROIDashboardTab pattern
const SectionCard: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}> = ({ title, description, icon, children, className, headerAction }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden",
      className
    )}
  >
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        )}
      </div>
      {headerAction}
    </div>
    <div className="p-5">{children}</div>
  </motion.div>
);

export function SimulationPanel({
  employeeId,
  treatments,
  currentChurnProbability,
  currentELTV,
  onSimulationComplete,
  onGenerateRecommendation,
}: SimulationPanelProps) {
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);
  const [customModifications, setCustomModifications] = useState<Record<string, unknown>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useMLModel, setUseMLModel] = useState(true);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  // Fetch treatment feature mapping when treatment is selected
  const { data: treatmentMapping, isLoading: isMappingLoading } = useQuery({
    queryKey: ['treatment-mapping', selectedTreatment?.id],
    queryFn: async (): Promise<TreatmentMapping | null> => {
      if (!selectedTreatment) return null;
      const response = await api.get<TreatmentMapping>(
        `/api/v1/playground/treatment-mapping/${selectedTreatment.id}`
      );
      return response.data;
    },
    enabled: !!selectedTreatment,
  });

  // Simulation mutation
  const simulateMutation = useMutation({
    mutationFn: async (): Promise<SimulationResult> => {
      if (!selectedTreatment) throw new Error('No treatment selected');

      const response = await api.post<SimulationResult>('/api/v1/playground/simulate-ml', {
        employee_id: employeeId,
        treatment_id: selectedTreatment.id,
        custom_modifications: Object.keys(customModifications).length > 0
          ? customModifications
          : null,
        use_ml_model: useMLModel,
      });
      return response.data;
    },
    onSuccess: (result) => {
      setSimulationResult(result);
      onSimulationComplete?.(result);
    },
  });

  // Generate recommendation mutation
  const recommendMutation = useMutation({
    mutationFn: async () => {
      if (!simulationResult) throw new Error('No simulation result');

      const response = await api.post('/api/v1/recommendations/generate', {
        employee_id: employeeId,
        treatment_id: simulationResult.treatment_id,
        use_ml_model: true,
      });
      return response.data;
    },
    onSuccess: () => {
      if (simulationResult) {
        onGenerateRecommendation?.(simulationResult);
      }
    },
  });

  const handleTreatmentSelect = (treatment: Treatment) => {
    setSelectedTreatment(treatment);
    setCustomModifications({});
    setSimulationResult(null);
  };

  const handleFeatureChange = (feature: string, value: unknown) => {
    setCustomModifications((prev) => ({
      ...prev,
      [feature]: value,
    }));
  };

  const handleRunSimulation = () => {
    simulateMutation.mutate();
  };

  const handleGenerateRecommendation = () => {
    recommendMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Treatment Selection */}
      <SectionCard
        title="Select Treatment"
        description="Choose a treatment intervention to simulate its impact"
        icon={<Sparkles className="w-4 h-4" />}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {treatments.map((treatment) => (
            <motion.button
              key={treatment.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTreatmentSelect(treatment)}
              className={cn(
                'p-4 rounded-xl border text-left transition-all',
                'hover:border-blue-300 dark:hover:border-blue-600',
                selectedTreatment?.id === treatment.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              )}
            >
              <div className="flex items-start justify-between">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {treatment.name}
                </p>
                {selectedTreatment?.id === treatment.id && (
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  ${treatment.cost.toLocaleString()}
                </span>
                {treatment.effectSize && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    {(treatment.effectSize * 100).toFixed(0)}% effect
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </SectionCard>

      {/* Feature Modifications (Advanced) */}
      <AnimatePresence>
        {selectedTreatment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <SectionCard
              title="Feature Adjustments"
              description="Fine-tune the ML features this treatment will modify"
              icon={<Settings2 className="w-4 h-4" />}
              headerAction={
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {showAdvanced ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              }
            >
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {isMappingLoading ? (
                      <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                        Loading feature mapping...
                      </div>
                    ) : treatmentMapping ? (
                      <div className="space-y-4">
                        {/* Default modifications from treatment */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {treatmentMapping.treatment_name}
                            </span>{' '}
                            targets these features:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {treatmentMapping.affected_features.map((feature: string) => (
                              <span
                                key={feature}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              >
                                {FEATURE_CONFIG[feature]?.label || feature}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Customizable sliders */}
                        <div className="space-y-4">
                          {treatmentMapping.affected_features.map((feature: string) => {
                            const config = FEATURE_CONFIG[feature];
                            if (!config) return null;

                            const defaultValue = treatmentMapping.feature_modifications[feature];
                            const currentValue = customModifications[feature] ?? defaultValue;
                            const hasModification = feature in customModifications;

                            return (
                              <div key={feature} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {config.label}
                                  </span>
                                  <span className={cn(
                                    "text-sm font-medium min-w-[3rem] text-right tabular-nums",
                                    hasModification
                                      ? "text-blue-600 dark:text-blue-400"
                                      : "text-gray-700 dark:text-gray-300"
                                  )}>
                                    {config.format(currentValue as number)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min={config.min}
                                    max={config.max}
                                    step={config.step}
                                    value={currentValue as number}
                                    onChange={(e) => handleFeatureChange(feature, parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full appearance-none cursor-pointer accent-blue-500"
                                  />
                                </div>
                                {hasModification && (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Default: {config.format(defaultValue as number)}
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-medium text-blue-600 dark:text-blue-400">
                                      {config.format(currentValue as number)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Select a treatment to see feature modifications
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simulation Controls */}
      <AnimatePresence>
        {selectedTreatment && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setUseMLModel(!useMLModel)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors",
                    useMLModel ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                    useMLModel ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
                <div className="flex items-center gap-2">
                  <Zap className={cn('w-4 h-4', useMLModel ? 'text-amber-500' : 'text-gray-400')} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Use ML Model
                  </span>
                  {useMLModel && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      Recommended
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRunSimulation}
                disabled={simulateMutation.isPending}
                className={cn(
                  "flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
                  "bg-blue-600 text-white hover:bg-blue-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {simulateMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Run Simulation
              </button>

              {simulationResult && (
                <button
                  onClick={handleGenerateRecommendation}
                  disabled={recommendMutation.isPending}
                  className={cn(
                    "px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2",
                    "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200",
                    "hover:bg-gray-200 dark:hover:bg-gray-600",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {recommendMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generate Recommendation
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simulation Results */}
      <AnimatePresence>
        {simulationResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-gray-800 rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-emerald-100 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Simulation Results
                  </h3>
                </div>
                {simulationResult.ml_model_used && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                    ML Model
                  </span>
                )}
              </div>
            </div>
            <div className="p-5">
              <BalancedScorecard
                currentChurnProbability={simulationResult.pre_churn_probability}
                currentELTV={simulationResult.eltv_pre_treatment}
                projectedChurnProbability={simulationResult.post_churn_probability}
                projectedELTV={simulationResult.eltv_post_treatment}
                treatmentCost={simulationResult.treatment_cost}
                projectedROI={simulationResult.roi}
                showProjected={true}
              />

              {/* Detailed breakdown */}
              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Treatment
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {simulationResult.treatment_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Churn Reduction
                    </p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      -{(Math.abs(simulationResult.churn_delta) * 100).toFixed(1)} pp
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Net Benefit
                    </p>
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      ${simulationResult.net_benefit.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Features Modified
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {Object.keys(simulationResult.feature_modifications).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error handling */}
      <AnimatePresence>
        {simulateMutation.isError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-5"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Simulation Failed</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {(simulateMutation.error as Error)?.message || 'Unknown error occurred'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SimulationPanel;
