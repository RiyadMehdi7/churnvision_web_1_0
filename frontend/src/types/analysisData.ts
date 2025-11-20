export interface PossibleStructuredData {
    type: string;
    [key: string]: any;
}

export interface SimilarityAnalysisData extends PossibleStructuredData {
    type: 'similarityAnalysis';
    targetEmployeeName: string;
    similarEmployees: any[];
    explanation: string;
    comparisonType?: string;
}

export interface EnhancedSimilarityAnalysisData extends PossibleStructuredData {
    type: 'enhancedSimilarityAnalysis';
    targetEmployee: any;
    comparisonType: string;
    similarEmployees: any[];
    patterns: any;
    insights: any[];
    analysis: string;
}

export interface EnhancedChurnRiskDiagnosisData extends PossibleStructuredData {
    type: 'enhancedChurnRiskDiagnosis';
    targetEmployeeName: string;
    overallRisk: number;
    mlScore: number;
    heuristicScore: number;
    stageScore: number;
    confidenceLevel: number;
    mlContributors: any[];
    heuristicAlerts: any[];
    reasoning: string;
    recommendations: string[];
    explanation: string;
}

export interface EnhancedRetentionPlaybookData extends PossibleStructuredData {
    type: 'enhancedRetentionPlaybook';
    targetEmployeeName: string;
    currentRisk: number;
    stage: string;
    primaryRiskFactors: string[];
    actionPlan: any[];
    monitoringMetrics: string[];
    successIndicators: string[];
    summary: string;
}

export interface WorkforceTrendsAnalysisData extends PossibleStructuredData {
    type: 'churn_trends_analysis';
    statistics: {
        totalEmployees: number;
        [key: string]: any;
    };
    analysis: string;
    insights?: any;
}

export interface DepartmentAnalysisData extends PossibleStructuredData {
    type: 'department_analysis';
    analysisType: string;
    summary: string;
    [key: string]: any;
}

export interface EnhancedExitPatternMiningData extends PossibleStructuredData {
    type: 'exit_pattern_mining';
    exitData?: any;
    insights?: any;
    summary?: string;
}

export interface AIReasoningAnalysisData extends PossibleStructuredData {
    type: 'aiReasoningAnalysis';
    targetEmployeeName: string;
    reasoning: {
        churn_risk: number;
        stage: string;
        stage_score: number;
        ml_score: number;
        heuristic_score: number;
        ml_contributors: string[];
        heuristic_alerts: string[];
        reasoning: string;
        recommendations: string;
        confidence_level: number;
    };
}
