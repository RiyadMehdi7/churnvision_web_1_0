export interface TreatmentOptions {
  id: number;
  name: string;
  description?: string;
  cost?: number;
  effectSize?: number;
  targetedVariables?: string[];
  riskLevels?: Array<'Low' | 'Medium' | 'High'>;
}

export interface TreatmentApplicationRecord {
  id?: number;
  employee_id: string;
  hr_code: string;
  treatment_id: number;
  treatment_name: string;
  treatment_type: string;
  predicted_churn_reduction: number;
  predicted_cost: number;
  predicted_roi: number;
  actual_cost?: number;
  applied_date: string;
  applied_by?: string;
  status: 'applied' | 'active' | 'completed' | 'cancelled';
  notes?: string;
  ab_group: 'control' | 'treatment';
}

export interface TreatmentSuggestion extends TreatmentOptions {
  timeToEffect: string;
  projected_churn_prob_change: number;
  projected_post_eltv: number;
  projected_roi: 'high' | 'medium' | 'low';
  cost: number; // dynamic cost in context
  explanation?: any[];
  llm_generated?: boolean;
  ai_reasoning?: string;
}

export interface ApplyTreatmentResult {
  employee_id: string;
  eltv_pre_treatment: number;
  eltv_post_treatment: number;
  treatment_effect_eltv: number;
  treatment_cost: number;
  roi: number;
  pre_churn_probability: number;
  post_churn_probability: number;
  new_survival_probabilities: Record<string, number>;
  applied_treatment: TreatmentOptions;
}
