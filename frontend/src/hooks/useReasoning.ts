import { useState, useCallback } from 'react';
import { Employee } from '../types/employee';
import { ChurnReasoning } from '../types/reasoning';

export const useBatchReasoning = () => {
    const [isReasoning, setIsReasoning] = useState(false);
    const [reasoningData, setReasoningData] = useState<Record<string, ChurnReasoning>>({});

    const generateReasoning = useCallback(async (employees: Employee[]) => {
        setIsReasoning(true);

        // Simulate batch processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        const newReasoning: Record<string, ChurnReasoning> = {};

        employees.forEach(emp => {
            newReasoning[emp.id] = {
                hr_code: emp.hr_code,
                churn_risk: emp.churnProbability || 0.5,
                stage: 'Analysis',
                stage_score: 0.8,
                ml_score: 0.7,
                heuristic_score: 0.6,
                ml_contributors: ['Tenure', 'Salary'],
                heuristic_alerts: ['Low Engagement'],
                reasoning: `Analysis for ${emp.name} shows potential risk factors.`,
                recommendations: 'Schedule a 1-on-1 meeting.',
                confidence_level: 0.85
            };
        });

        setReasoningData(prev => ({ ...prev, ...newReasoning }));
        setIsReasoning(false);

        return newReasoning;
    }, []);

    return {
        isReasoning,
        reasoningData,
        generateReasoning
    };
};
