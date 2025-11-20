export enum RiskLevel {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}

export interface RiskFactor {
  name: string;
  value: number;
  impact: number; // 1 for positive, -1 for negative
}

export interface ShapValue {
  feature: string;
  value: number;
}

export interface InterviewData {
  id?: number;
  hrcode: string;
  date: string;
  notes: string;
  interview_type: 'stay' | 'exit';
  sentiment_score?: number;
  processed_insights?: string;
  created_at?: string;
}

export interface InterviewInsight {
  theme: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  impact_score: number;
  key_phrases: string[];
}

// Combined and corrected Employee interface
export interface Employee {
  id: number;
  employee_id: string; // Add employee_id property
  hr_code: string;
  name: string; // Use full_name from transformEmployee
  full_name: string;
  position: string;
  department: string; // Use structure_name from transformEmployee
  structure_name: string;
  salary: number;
  tenure: number;
  performance: string; // Formatted score (e.g., "4.5/5")
  riskLevel: RiskLevel; // Use the enum
  churnProbability: number; // Normalized probability (0-1)
  resign_proba: number; // Keep original normalized probability if needed
  currentELTV: number;
  factors: RiskFactor[]; // Use RiskFactor interface
  engagementScore: number; // Based on performance_rating_latest
  status: 'Active' | 'Resigned';
  manager_id?: string | null;
  termination_date?: string; // Optional termination date
  shap_values: ShapValue[];
  confidenceScore?: number;
  uncertaintyRange?: [number, number];
  counterfactuals: Counterfactual[];
  reasoningChurnRisk?: number; // From churn_reasoning.churn_risk
  reasoningStage?: string; // From churn_reasoning.stage
  reasoningConfidence?: number; // From churn_reasoning.confidence_level
  lastAnalyzed?: string; // Add lastAnalyzed property (optional, ISO date string)
  interviewData?: InterviewData[]; // Associated interview data
  interviewInsights?: InterviewInsight[]; // Processed interview insights
  age?: number;
  workLocation?: string;
  remotePreference?: string;
  teamSize?: number;
  peerResignations90d?: number;
  additionalAttributes?: Record<string, any>;
}

export interface Counterfactual {
  feature: string;
  from: string | number | null;
  to: string | number | null;
  impact?: number;
}
