/**
 * Model Intelligence Service
 * Provides API calls for backtesting, prediction tracking, departure timelines, cohorts, and alerts
 */
import api from './apiService';

// Types for Model Intelligence features

export interface BacktestingPeriod {
  period: string;
  total_predictions: number;
  high_risk_flagged: number;
  actual_churns: number;
  correct_predictions: number;
  precision: number;
  recall: number;
  accuracy: number;
}

export interface BacktestingAggregate {
  total_predictions_analyzed: number;
  total_high_risk_flagged: number;
  total_actual_churns: number;
  total_correct_predictions: number;
  overall_precision: number;
  overall_recall: number;
  overall_accuracy: number;
  catch_rate_message: string;
}

export interface BacktestingResults {
  periods: BacktestingPeriod[];
  aggregate: BacktestingAggregate;
  generated_at: string;
}

export interface PredictionOutcome {
  hr_code: string;
  full_name: string;
  department: string;
  predicted_risk: number;
  prediction_date: string | null;
  actual_outcome: 'stayed' | 'left' | 'pending';
  outcome_date: string | null;
  was_correct: boolean | null;
  days_to_outcome: number | null;
}

export interface PredictionOutcomesResult {
  outcomes: PredictionOutcome[];
  summary: {
    total_tracked: number;
    correct_predictions: number;
    accuracy: number;
    employees_who_left: number;
    high_risk_who_left: number;
    prediction_fulfilled_rate: number;
  };
  generated_at: string;
}

export interface DepartureTimeline {
  hr_code: string;
  current_risk: number;
  predicted_departure_window: string;
  probability_30d: number;
  probability_60d: number;
  probability_90d: number;
  probability_180d: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
}

export interface CohortMember {
  hr_code: string;
  full_name: string;
  department: string;
  position: string;
  tenure: number;
  risk_score: number;
  outcome: 'stayed' | 'left' | 'active';
  similarity_score: number;
  key_factors: string[];
}

export interface CohortAnalysis {
  target_employee: {
    hr_code: string;
    full_name: string;
    department: string;
    position: string;
    tenure: number;
    risk_score: number;
  };
  similar_who_left: CohortMember[];
  similar_who_stayed: CohortMember[];
  common_risk_factors: string[];
  retention_insights: string[];
  recommended_actions: string[];
}

export interface CohortOverview {
  department_cohorts: Array<{
    department: string;
    total: number;
    avg_risk: number;
  }>;
  tenure_cohorts: Array<{
    range: string;
    total: number;
    avg_risk: number;
  }>;
  generated_at: string;
}

export interface RiskAlert {
  id: string;
  hr_code: string;
  full_name: string;
  department: string;
  alert_type: 'risk_increase' | 'entered_high_risk' | 'critical_risk' | 'new_high_risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  previous_risk: number;
  current_risk: number;
  change_amount: number;
  change_percent: number;
  message: string;
  context: string;
  recommended_action: string;
  created_at: string;
  is_read: boolean;
}

export interface AlertsResult {
  alerts: RiskAlert[];
  total_count: number;
  unread_count: number;
  severity_counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  generated_at: string;
}

// Model Routing / Selection types
export interface DatasetProfile {
  dataset_id: string;
  n_samples: number;
  n_features: number;
  n_numeric_features: number;
  n_categorical_features: number;
  n_classes: number;
  class_balance_ratio: number;
  is_severely_imbalanced: boolean;
  missing_ratio: number;
  has_outliers: boolean;
  outlier_ratio: number;
  overall_quality_score: number;
  tabpfn_suitability: number;
  tree_model_suitability: number;
  linear_model_suitability: number;
  created_at: string;
}

export interface ModelRoutingDecision {
  dataset_id: string;
  selected_model: string;
  confidence: number;
  reasoning: string[];
  is_ensemble: boolean;
  ensemble_models?: string[];
  ensemble_weights?: Record<string, number>;
  ensemble_method?: string;
  alternatives?: Array<{ model: string; score: number; reason: string }>;
  model_scores?: Record<string, number>;
  decided_at: string;
}

export interface RoutingInfo {
  profile: DatasetProfile;
  routing: ModelRoutingDecision;
}

/**
 * Model Intelligence Service
 */
export const modelIntelligenceService = {
  /**
   * Get backtesting results showing historical prediction accuracy
   */
  async getBacktestingResults(periods: number = 6): Promise<BacktestingResults> {
    const response = await api.get('/churn/model/backtesting', {
      params: { periods }
    });
    return response.data;
  },

  /**
   * Get individual prediction outcomes
   */
  async getPredictionOutcomes(limit: number = 50): Promise<PredictionOutcomesResult> {
    const response = await api.get('/churn/model/prediction-outcomes', {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Get departure timeline for a specific employee
   */
  async getDepartureTimeline(hrCode: string): Promise<DepartureTimeline> {
    const response = await api.get(`/churn/timeline/${hrCode}`);
    return response.data;
  },

  /**
   * Get batch departure timelines for high-risk employees
   */
  async getBatchDepartureTimelines(limit: number = 100): Promise<{ timelines: DepartureTimeline[] }> {
    const response = await api.get('/churn/timelines/batch', {
      params: { limit }
    });
    return response.data;
  },

  /**
   * Get cohort analysis for a specific employee
   */
  async getCohortAnalysis(hrCode: string): Promise<CohortAnalysis> {
    const response = await api.get(`/churn/cohort/${hrCode}`);
    return response.data;
  },

  /**
   * Get cohort overview for dashboard
   */
  async getCohortOverview(): Promise<CohortOverview> {
    const response = await api.get('/churn/cohorts/overview');
    return response.data;
  },

  /**
   * Get recent risk alerts
   */
  async getAlerts(limit: number = 20, includeRead: boolean = false): Promise<AlertsResult> {
    const response = await api.get('/churn/alerts', {
      params: { limit, include_read: includeRead }
    });
    return response.data;
  },

  /**
   * Mark a specific alert as read
   */
  async markAlertRead(alertId: string): Promise<{ success: boolean }> {
    const response = await api.post(`/churn/alerts/${alertId}/read`);
    return response.data;
  },

  /**
   * Mark all alerts as read
   */
  async markAllAlertsRead(): Promise<{ success: boolean; count: number }> {
    const response = await api.post('/churn/alerts/read-all');
    return response.data;
  },

  /**
   * Get model routing info (dataset profile + routing decision)
   */
  async getRoutingInfo(): Promise<RoutingInfo> {
    const response = await api.get('/churn/model/routing-info');
    return response.data;
  },

  /**
   * Get dataset profile for a specific dataset
   */
  async getDatasetProfile(datasetId: string): Promise<DatasetProfile> {
    const response = await api.get(`/churn/model/dataset-profile/${datasetId}`);
    return response.data;
  }
};

export default modelIntelligenceService;
