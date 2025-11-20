export interface ChurnReasoning {
    hr_code: string;
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
}
