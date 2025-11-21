// Analysis result types for local analysis functions

export interface Insight {
  id: string;
  title: string;
  description: string;
  severity?: 'high' | 'medium' | 'low';
  confidence?: number;
  affectedEmployees?: number;
  departments?: string[];
  supportingData?: any;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low';
  estimatedImpact?: string;
  estimatedTimeframe?: string;
  actionItems?: string[];
}

export interface Visualization {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'heatmap' | 'pie-chart' | 'bar-chart';
  title: string;
  data: any;
  config?: any;
  component?: React.ComponentType;
}

export interface DataSource {
  type: string;
  name: string;
  available: boolean;
  recordCount?: number;
  lastUpdated?: Date;
}

export interface AnalysisResult {
  id: string;
  type: string;
  title: string;
  summary: string;
  insights: Insight[];
  visualizations?: Visualization[];
  recommendations?: Recommendation[];
  confidence: number;
  timestamp: Date;
  dataSources?: DataSource[];
  parameters?: any;
  executionTime: number;
}

export interface ChurnAnalysisResult extends AnalysisResult {
  type: 'churn-patterns';
  patterns?: {
    departmentRisks: Array<{ department: string; avgRisk: number; count: number }>;
    tenurePatterns: Array<{ range: string; count: number; avgRisk: number }>;
    riskFactors: Array<{ factor: string; frequency: number; impact: number }>;
  };
}

export interface CorrelationResult extends AnalysisResult {
  type: 'engagement-correlation';
  correlations?: Array<{
    factor1: string;
    factor2: string;
    correlation: number;
    significance: number;
  }>;
}

export interface OrganizationalInsights extends AnalysisResult {
  type: 'organizational-insights';
  departmentAnalysis?: Array<{
    department: string;
    riskLevel: number;
    employeeCount: number;
    trends: string[];
  }>;
  riskDistribution?: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface CrossAnalysisResult extends AnalysisResult {
  type: 'cross-source';
  crossCorrelations?: Array<{
    source1: string;
    source2: string;
    insights: string[];
    strength: number;
  }>;
}