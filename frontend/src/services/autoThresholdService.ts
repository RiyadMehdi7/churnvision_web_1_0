import { Employee } from '../types/employee';
import { RiskThresholds, setThresholds } from '../config/riskThresholds';

class AutoThresholdService {
    analyzeAndSetThresholds(employees: Employee[]): RiskThresholds {
        if (!employees || employees.length === 0) {
            return { highRisk: 0.7, mediumRisk: 0.4 };
        }

        const risks = employees
            .map(e => e.churnProbability || 0)
            .sort((a, b) => a - b);

        // Simple percentile-based thresholding
        // Top 20% are high risk
        // Next 30% are medium risk
        // Bottom 50% are low risk

        const highRiskIndex = Math.floor(risks.length * 0.8);
        const mediumRiskIndex = Math.floor(risks.length * 0.5);

        const suggestedHighRisk = risks[highRiskIndex];
        const suggestedMediumRisk = risks[mediumRiskIndex];

        // Ensure some sanity bounds
        const newThresholds = {
            highRisk: Math.max(0.5, Math.min(0.9, suggestedHighRisk)),
            mediumRisk: Math.max(0.2, Math.min(0.6, suggestedMediumRisk))
        };

        setThresholds(newThresholds);
        return newThresholds;
    }

    start(employees: Employee[]) {
        // Initial analysis
        this.analyzeAndSetThresholds(employees);

        // Set up periodic re-analysis if needed
        // For now, just a simple log
        console.log('AutoThresholdService started');
    }

    stop() {
        console.log('AutoThresholdService stopped');
    }
}

export const autoThresholdService = new AutoThresholdService();
