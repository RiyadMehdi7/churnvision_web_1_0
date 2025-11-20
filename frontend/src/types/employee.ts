export interface Employee {
    id: string;
    hr_code: string;
    name: string;
    full_name?: string;
    department: string;
    structure_name?: string;
    position: string;
    salary?: number;
    employee_cost?: number;
    riskScore: number;
    churnProbability?: number;
    status: string;
    tenure?: number;
    termination_date?: string | null;
    hasReasoningData?: boolean;
    reasoningChurnRisk?: number;
    normalized_position_level?: string;
    report_date?: string;
    eltv?: number;
}
