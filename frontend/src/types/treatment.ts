export interface TreatmentSuggestion {
    id: number;
    name: string;
    description: string;
    cost: number;
    projected_churn_prob_change: number;
    projected_roi: 'high' | 'medium' | 'low';
    projected_post_eltv?: number;
    effectSize?: number;
    riskLevels?: string[];
    explanation?: {
        ruleId: string;
        reason: string;
    }[];
}

export interface ApplyTreatmentResult {
    success: boolean;
    newProbability: number;
    newELTV: number;
    roi: number;
    treatmentId: number;
    treatmentName?: string;
    cost?: number;
    projectedRiskReduction?: number;
    newChurnProbability?: number;
    status?: string;
    appliedAt?: string;
}

export interface TreatmentOptions {
    treatments: TreatmentSuggestion[];
}
