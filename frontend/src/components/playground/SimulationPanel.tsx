/**
 * Simulation Panel Component
 *
 * Treatment-First Unified Simulator that allows users to:
 * 1. Select a treatment
 * 2. See which ML features it affects
 * 3. Fine-tune feature values if needed
 * 4. Run ML-based simulation
 * 5. View projected outcomes
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Play,
  Settings2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
    <div className="space-y-4">
      {/* Treatment Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Select Treatment
          </CardTitle>
          <CardDescription>
            Choose a treatment intervention to simulate its impact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {treatments.map((treatment) => (
              <button
                key={treatment.id}
                onClick={() => handleTreatmentSelect(treatment)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  'hover:border-purple-300 hover:bg-purple-50',
                  selectedTreatment?.id === treatment.id
                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                    : 'border-slate-200 bg-white'
                )}
              >
                <p className="font-medium text-sm">{treatment.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">
                    ${treatment.cost.toLocaleString()}
                  </span>
                  {treatment.effectSize && (
                    <Badge variant="outline" className="text-xs">
                      {(treatment.effectSize * 100).toFixed(0)}% effect
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Feature Modifications (Advanced) */}
      {selectedTreatment && (
        <Card>
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-slate-500" />
                <CardTitle className="text-lg">Feature Adjustments</CardTitle>
              </div>
              {showAdvanced ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </button>
            <CardDescription>
              Fine-tune the ML features this treatment will modify
            </CardDescription>
          </CardHeader>

          {showAdvanced && (
            <CardContent>
              {isMappingLoading ? (
                <div className="text-center py-4 text-slate-500">
                  Loading feature mapping...
                </div>
              ) : treatmentMapping ? (
                <div className="space-y-4">
                  {/* Default modifications from treatment */}
                  <div className="bg-slate-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-slate-600 mb-2">
                      <strong>{treatmentMapping.treatment_name}</strong> targets these features:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {treatmentMapping.affected_features.map((feature: string) => (
                        <Badge key={feature} variant="secondary">
                          {FEATURE_CONFIG[feature]?.label || feature}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Customizable sliders */}
                  {treatmentMapping.affected_features.map((feature: string) => {
                    const config = FEATURE_CONFIG[feature];
                      if (!config) return null;

                      const defaultValue = treatmentMapping.feature_modifications[feature];
                      const currentValue = customModifications[feature] ?? defaultValue;

                      return (
                        <div key={feature} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">{config.label}</Label>
                            <span className="text-sm font-medium">
                              {config.format(currentValue as number)}
                            </span>
                          </div>
                          <Slider
                            value={[currentValue as number]}
                            min={config.min}
                            max={config.max}
                            step={config.step}
                            onValueChange={([value]) => handleFeatureChange(feature, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500">
                    Select a treatment to see feature modifications
                  </div>
                )}
              </CardContent>
            )}
        </Card>
      )}

      {/* Simulation Controls */}
      {selectedTreatment && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="ml-model"
                  checked={useMLModel}
                  onCheckedChange={setUseMLModel}
                />
                <Label htmlFor="ml-model" className="flex items-center gap-2">
                  <Zap className={cn('h-4 w-4', useMLModel ? 'text-amber-500' : 'text-slate-400')} />
                  Use ML Model
                  {useMLModel && (
                    <Badge variant="outline" className="text-xs bg-amber-50">
                      Recommended
                    </Badge>
                  )}
                </Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleRunSimulation}
                disabled={simulateMutation.isPending}
                className="flex-1"
              >
                {simulateMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run Simulation
              </Button>

              {simulationResult && (
                <Button
                  variant="outline"
                  onClick={handleGenerateRecommendation}
                  disabled={recommendMutation.isPending}
                >
                  {recommendMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Recommendation
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulation Results */}
      {simulationResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Simulation Results
                {simulationResult.ml_model_used && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    ML Model
                  </Badge>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
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
            <div className="mt-4 pt-4 border-t border-green-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Treatment</p>
                  <p className="font-medium">{simulationResult.treatment_name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Churn Reduction</p>
                  <p className="font-medium text-green-600">
                    -{(Math.abs(simulationResult.churn_delta) * 100).toFixed(1)} pp
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Net Benefit</p>
                  <p className="font-medium text-blue-600">
                    ${simulationResult.net_benefit.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Features Modified</p>
                  <p className="font-medium">
                    {Object.keys(simulationResult.feature_modifications).length}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error handling */}
      {simulateMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">
              Simulation failed: {(simulateMutation.error as Error)?.message || 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SimulationPanel;
