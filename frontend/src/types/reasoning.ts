// Types for the Churn Reasoning Module

export interface CalculationBreakdown {
  ml_contribution: number;
  heuristic_contribution: number;
  stage_contribution: number;
  weights: {
    ml_weight: number;
    heuristic_weight: number;
    stage_weight: number;
  };
  confidence_breakdown: {
    ml_confidence: number;
    heuristic_confidence: number;
    llm_confidence?: number;
    overall_confidence: number;
  };
}

export interface ChurnReasoning {
  hr_code: string;
  churn_risk: number;
  stage: string;
  stage_score: number;
  ml_score: number;
  heuristic_score: number;
  ml_contributors: MLContributor[];
  heuristic_alerts: HeuristicAlert[];
  reasoning: string;
  recommendations: string;
  confidence_level: number;
  calculation_breakdown?: CalculationBreakdown;
  updated_at: string;
}

export interface MLContributor {
  feature: string;
  value: any;
  importance: number;
}

export interface HeuristicAlert {
  rule_id: string;
  rule_name: string;
  impact: number;
  reason: string;
}

export interface BusinessRule {
  rule_id: number;
  rule_name: string;
  rule_description: string;
  rule_condition: string;
  adjustment_logic: string;
  priority: number;
  is_active: boolean;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

export interface BehavioralStage {
  stage_id: number;
  stage_name: string;
  stage_description: string;
  min_tenure: number;
  max_tenure: number | null;
  stage_indicators: string[];
  base_risk_score: number;
  is_active: boolean;
  created_at: string;
}

export interface StageResult {
  name: string;
  description: string;
  score: number;
  indicators: string[];
}

export interface LLMStatus {
  isAvailable: boolean;
  isReady: boolean;
  modelPath: string | null;
  error: string | null;
}

// API Response Types
export interface ReasoningResponse {
  success: boolean;
  data: ChurnReasoning;
  error?: string;
}

export interface BatchReasoningResponse {
  success: boolean;
  data: ChurnReasoning[];
  count: number;
  error?: string;
}

export interface RulesResponse {
  success: boolean;
  data: BusinessRule[];
  count: number;
  error?: string;
}

export interface StagesResponse {
  success: boolean;
  data: BehavioralStage[];
  count: number;
  error?: string;
}

export interface LLMStatusResponse {
  success: boolean;
  data: LLMStatus;
  error?: string;
}

export interface LLMQuestionResponse {
  success: boolean;
  data: string;
  error?: string;
}

// Request Types
export interface CreateRuleRequest {
  name: string;
  description?: string;
  condition: string;
  adjustmentLogic: string;
  priority?: number;
}

export interface UpdateRuleRequest {
  rule_name?: string;
  rule_description?: string;
  rule_condition?: string;
  adjustment_logic?: string;
  priority?: number;
  is_active?: boolean;
}

export interface CreateStageRequest {
  name: string;
  description?: string;
  minTenure: number;
  maxTenure?: number | null;
  indicators?: string[];
  baseRiskScore: number;
}

export interface TestRuleRequest {
  condition: string;
  adjustmentLogic: string;
  hrCode: string;
  baseScore?: number;
}

export interface LLMQuestionRequest {
  question: string;
  hrCode: string;
}

// Summary and Analytics Types
export interface ReasoningSummary {
  total_employees: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  avg_confidence: number;
  stage_distribution: { [stage: string]: number };
  top_risk_factors: { factor: string; frequency: number }[];
  recent_updates: number;
}

export interface RuleTestResult {
  condition_result: boolean;
  original_score: number;
  adjusted_score: number;
  impact: number;
  error?: string;
}

export interface StageTestResult {
  matched_stage: string;
  tenure_match: string | null;
  special_conditions: string[];
  final_score: number;
  reasoning: string[];
} 