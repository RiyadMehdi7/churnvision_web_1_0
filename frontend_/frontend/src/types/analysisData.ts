// Shared types for AI Assistant analysis renderers

export interface SimilarityAnalysisData {
  type: 'similarityAnalysis';
  targetEmployeeName: string;
  comparisonType: string;
  similarEmployees: EnhancedSimilarityEntry[];
  explanation: string;
}

export interface EnhancedSimilarityEntry {
  name: string;
  department: string;
  position: string;
  tenure: number;
  similarityScore: number;
  churnRisk: number;
  stage: string;
  mlScore: number;
  heuristicScore: number;
  confidenceLevel: number;
}

// For Enhanced Similarity Analysis with comprehensive data
export interface EnhancedSimilarityAnalysisData {
  type: 'enhancedSimilarityAnalysis';
  targetEmployee: {
    name: string;
    hrCode: string;
    department: string;
    position: string;
    tenure: number;
    risk: number;
    stage: string;
    mlScore: number;
    heuristicScore: number;
    confidenceLevel: number;
  };
  comparisonType: 'stayed' | 'resigned';
  similarEmployees: Array<{
    name: string;
    hrCode: string;
    department: string;
    position: string;
    tenure: number;
    risk: number;
    stage: string;
    similarityScore: number;
    commonPatterns: string[];
    mlScore: number;
    heuristicScore: number;
    reasoning: string;
  }>;
  patterns: {
    departmentDistribution: { [key: string]: number };
    positionDistribution: { [key: string]: number };
    tenureDistribution: { low: number; medium: number; high: number };
    riskDistribution: { low: number; medium: number; high: number };
    stageDistribution: { [key: string]: number };
    totalSimilar: number;
    averageSimilarity: number;
  };
  insights: {
    commonFactors: string[];
    differentiatingFactors: string[];
    riskPatterns: string[];
    recommendations: string[];
    keyFindings: string[];
    summary: string;
  };
  analysis: string;
  confidence: string;
  summary: string;
}

// For Churn Risk Diagnosis (SHAP-style)
export interface ChurnFactor {
  feature: string; // e.g., "Tenure", "Manager Change", "Performance Score"
  contribution: number; // Positive for increasing risk, negative for decreasing
  value: string | number | null; // Actual value of the feature for the employee (allow null for missing data)
}

// Old interfaces removed - using enhanced versions instead

// Old interfaces removed - using enhanced versions instead

// For Enhanced Exit Pattern Mining
export interface EnhancedExitPatternMiningData {
  type: 'exit_pattern_mining';
  exitData?: {
    totalResignations: number;
    departmentPatterns: Array<{
      department: string;
      resignation_count: number;
      avg_tenure: number;
      early_exits: number;
      mid_tenure_exits: number;
      senior_exits: number;
    }>;
    positionPatterns: Array<{
      position: string;
      resignation_count: number;
      avg_tenure: number;
      early_exits: number;
      mid_tenure_exits: number;
      senior_exits: number;
    }>;
    tenurePatterns: Array<{
      tenure_range: string;
      resignation_count: number;
      avg_tenure_in_range: number;
    }>;
    commonRiskFactors: Array<{
      factor: string;
      frequency: number;
      avgImpact: number;
      type: 'ml_factor' | 'business_rule';
      examples: string[];
    }>;
    seasonalPatterns: Array<{
      month: string;
      resignation_count: number;
      year: string;
    }>;
    riskFactorData: Array<{
      hr_code: string;
      full_name: string;
      structure_name: string;
      position: string;
      tenure: number;
      churn_risk: number;
      stage: string;
    }>;
  };
  insights?: {
    detailedAnalysis: string;
    keyPatterns: string[];
    riskIndicators: string[];
    preventiveStrategies: string[];
    departmentInsights: string[];
    patternSummary: {
      mostAffectedDepartment: string;
      mostCommonTenureExit: string;
      topRiskFactor: string;
      totalPatterns: number;
    };
    urgencyLevel: string;
    trends: {
      departmentTrend: string;
      tenureTrend: string;
      riskFactorTrend: string;
    };
  };
  summary: string;
  error?: string;
  message?: string;
}

// Old interfaces removed - using enhanced versions instead

// For Enhanced Churn Risk Diagnosis using Reasoning Data
export interface EnhancedChurnRiskDiagnosisData {
  type: 'enhancedChurnRiskDiagnosis';
  targetEmployeeName: string;
  targetHrCode: string;
  overallRisk: number;
  mlScore: number;
  heuristicScore: number;
  stageScore: number;
  stage: string;
  confidenceLevel: number;
  mlContributors: Array<{
    feature: string;
    value: any;
    importance: number;
    impact: 'positive' | 'negative';
  }>;
  heuristicAlerts: Array<{
    rule_name: string;
    impact: number;
    reason?: string;
    message?: string;
    priority?: number;
  }>;
  calculationBreakdown?: {
    ml_contribution: number;
    heuristic_contribution: number;
    stage_contribution: number;
    weights: {
      ml_weight: number;
      heuristic_weight: number;
      stage_weight: number;
    };
  } | null;
  reasoning: string;
  recommendations: string[];
  explanation: string;
  personalProfile: {
    department: string;
    position: string;
    tenure?: number;
    employeeCost?: number;
    reportDate?: string;
  };
  keyFindings: string[];
  comparativeInsights: {
    departmentComparison?: {
      avgRisk: number;
      relativePosition: string;
      departmentSize: number;
    };
    positionComparison?: {
      avgRisk: number;
      relativePosition: string;
      peerCount: number;
    };
    tenureComparison?: {
      avgRisk: number;
      relativePosition: string;
      cohortSize: number;
    };
  };
  urgencyLevel: string;
}

// For Enhanced Retention Playbook using Reasoning Data
export interface EnhancedRetentionPlaybookData {
  type: 'enhancedRetentionPlaybook';
  targetEmployeeName: string;
  targetHrCode: string;
  currentRisk: number;
  stage: string;
  riskLevel: string;
  personalProfile: {
    department: string;
    position: string;
    tenure: number;
    employeeCost: number;
    reportDate: string;
  };
  primaryRiskFactors: string[];
  actionPlan: Array<{
    step: number;
    category: 'immediate' | 'short_term' | 'long_term';
    action: string;
    rationale: string;
    expectedImpact: string;
    timeframe: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    owner: string;
    cost: string;
    riskReduction: number;
  }>;
  timelineOverview: {
    immediate: {
      timeframe: string;
      actionCount: number;
      focus: string;
      expectedRiskReduction: number;
    };
    shortTerm: {
      timeframe: string;
      actionCount: number;
      focus: string;
      expectedRiskReduction: number;
    };
    longTerm: {
      timeframe: string;
      actionCount: number;
      focus: string;
      expectedRiskReduction: number;
    };
  };
  successExamples: Array<{
    name: string;
    position: string;
    riskReduction: string;
    insights: string;
  }>;
  monitoringMetrics: string[];
  successIndicators: string[];
  budgetConsiderations: {
    estimatedRetentionCost: number;
    replacementCost: number;
    netSavings: number;
    roi: string;
    breakdown: {
      immediate: number;
      shortTerm: number;
      longTerm: number;
    };
  };
  riskMitigation: Array<{
    riskFactor: string;
    currentImpact: string;
    strategy: string;
    timeline: string;
  }>;
  summary: string;
  expectedOutcomes: {
    currentRisk: string;
    projectedRisk: string;
    riskReduction: string;
    timeline: string;
    confidenceLevel: string;
  };
}

// For AI Reasoning Analysis Section
export interface AIReasoningAnalysisData {
  type: 'aiReasoningAnalysis';
  targetEmployeeName: string;
  targetHrCode: string;
  reasoning: {
    churn_risk: number;
    stage: string;
    stage_score: number;
    ml_score: number;
    heuristic_score: number;
    ml_contributors: Array<{
      feature: string;
      value: any;
      importance: number;
    }>;
    heuristic_alerts: Array<{
      rule_name: string;
      impact: number;
      reason: string;
    }>;
    reasoning: string;
    recommendations: string;
    confidence_level: number;
    calculation_breakdown?: {
      ml_contribution: number;
      heuristic_contribution: number;
      stage_contribution: number;
      weights: {
        ml_weight: number;
        heuristic_weight: number;
        stage_weight: number;
      };
    };
  };
}

// For Workforce Trends Analysis - Enhanced Version
export interface EnhancedWorkforceStatistics {
  totalEmployees: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  departmentRisks: Array<{
    department: string;
    count: number;
    avgRisk: number;
    highRiskCount: number;
    avgMLScore: number;
    avgStageScore: number;
    avgConfidence: number;
  }>;
  positionRisks: Array<{
    position: string;
    count: number;
    avgRisk: number;
    highRiskCount: number;
    avgMLScore: number;
    avgStageScore: number;
    avgConfidence: number;
  }>;
  stageDistribution: Array<{
    stage: string;
    count: number;
    avgRisk: number;
  }>;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  riskTrends: {
    criticalEmployees: number;
    atRiskDepartments: number;
    averageConfidence: number;
    totalWithReasoningData: number;
  };
}

export interface WorkforceTrendsAnalysisData {
  type: 'churn_trends_analysis';
  statistics: EnhancedWorkforceStatistics;
  insights?: {
    detailedAnalysis: string;
    strategicRecommendations: string[];
    urgentActions: string[];
    trendAnalysis: {
      riskTrend: string;
      departmentTrends: string[];
      stageTrends: string[];
      confidenceTrends: string;
    };
    organizationalHealth: {
      overallScore: number;
      riskLevel: string;
      confidenceLevel: string;
      priorityAreas: string[];
    };
  };
  analysis: string;
  summary?: string;
  recommendations?: string[];
  urgentActions?: string[];
  trends?: any;
  error?: string;
  message?: string;
}

// For Department Analysis - Enhanced Version
export interface DepartmentAnalysisData {
  type: 'department_analysis';
  analysisType: 'overview' | 'specific';
  targetDepartment?: string;
  departments?: Array<{
    department: string;
    totalEmployees: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    avgRisk: number;
    avgMLScore: number;
    avgStageScore: number;
    avgConfidence: number;
    withReasoningData: number;
    avgTenure: number;
    avgCost: number;
  }>;
  departmentData?: {
    departmentName: string;
    totalEmployees: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    avgRisk: number;
    avgMLScore: number;
    avgStageScore: number;
    avgConfidence: number;
    withReasoningData: number;
    avgTenure: number;
    minTenure: number;
    maxTenure: number;
    avgCost: number;
    minCost: number;
    maxCost: number;
    positions: Array<{
      position: string;
      count: number;
      avgRisk: number;
      highRiskCount: number;
    }>;
    stages: Array<{
      stage: string;
      count: number;
      avgRisk: number;
    }>;
    highRiskEmployees: Array<{
      full_name: string;
      hr_code: string;
      position: string;
      tenure: number;
      churn_risk: number;
      stage: string;
      reasoning: string;
    }>;
    riskFactors: Array<{
      factor: string;
      frequency: number;
      avgImportance: number;
      type: 'ml_factor' | 'business_rule';
    }>;
  };
  insights?: {
    detailedAnalysis: string;
    strategicRecommendations: string[];
    urgentActions: string[];
    retentionStrategies: string[];
    healthScore: number;
    riskLevel: string;
    priorityActions: string[];
    benchmarkComparison: {
      organizationAverage: number;
      departmentAverage: number;
      relativePosiiton: string;
    };
    summary?: string;
    highestRisk?: any;
    departmentRanking?: any[];
    organizationalInsights?: string[];
  };
  summary: string;
  availableDepartments?: string[];
  error?: string;
  message?: string;
}

// Union Type for All Structured Data (Enhanced Only)
export type PossibleStructuredData = 
  | SimilarityAnalysisData 
  | EnhancedSimilarityAnalysisData
  | EnhancedChurnRiskDiagnosisData
  | EnhancedRetentionPlaybookData
  | EnhancedExitPatternMiningData
  | AIReasoningAnalysisData
  | WorkforceTrendsAnalysisData
  | DepartmentAnalysisData
  | LegacyRetentionPlaybookData
  | PeerRetentionComparisonData
  | LegacyExitPatternData
  | null;

// Legacy/simple retention playbook format support
export interface LegacyRetentionPlaybookData {
  type: 'retentionPlaybook';
  targetDescription?: string;
  playbook: Array<{
    step: number;
    action: string;
    rationale?: string;
  }>;
  summary?: string;
}

// Legacy compare (stayed) data
export interface PeerRetentionComparisonData {
  type: 'peerRetentionComparison';
  targetEmployeeName: string;
  retainedPeerGroupName: string;
  comparisonFactors: Array<{
    factor: string;
    targetValue: string;
    peerAverage: string;
    insight: string;
    positiveImpact?: boolean;
  }>;
  summaryInsight: string;
}

// Legacy exit pattern mining data
export interface LegacyExitPatternData {
  type: 'exitPatternMining';
  patterns: Array<{
    pattern: string;
    percentage?: number;
    count?: number;
    context?: string;
  }>;
  summary: string;
}