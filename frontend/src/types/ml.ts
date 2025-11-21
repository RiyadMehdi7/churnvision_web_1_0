export interface MLContributor {
  feature: string;
  value: string | number | boolean | null;
  importance: number;
}

export interface MLResult {
  score: number; // 0..1 churn probability
  contributors: MLContributor[];
  confidence: number; // 0..1
  model_version: string;
}

export interface ChurnOutputData {
  hr_code: string;
  resign_proba: number;
  shap_values?: string | Record<string, number> | Array<{ feature: string; importance: number }>;
  model_version?: string;
  confidence_score?: number; // 0..100
  prediction_date?: string; // ISO
}

