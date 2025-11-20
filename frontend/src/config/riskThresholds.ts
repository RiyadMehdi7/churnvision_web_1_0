import { Employee } from '../types/employee';

export interface RiskThresholds {
    highRisk: number;
    mediumRisk: number;
}

let currentThresholds: RiskThresholds = {
    highRisk: 0.7,
    mediumRisk: 0.4
};

type ThresholdChangeListener = (thresholds: RiskThresholds) => void;
const listeners: ThresholdChangeListener[] = [];

export const getCurrentThresholds = (): RiskThresholds => {
    return { ...currentThresholds };
};

export const setThresholds = (newThresholds: RiskThresholds) => {
    currentThresholds = { ...newThresholds };
    notifyListeners();
};

export const subscribeToThresholdChanges = (listener: ThresholdChangeListener) => {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
};

const notifyListeners = () => {
    listeners.forEach(listener => listener(currentThresholds));
};

export const getDynamicRiskLevel = (probability: number): 'High' | 'Medium' | 'Low' => {
    if (probability > currentThresholds.highRisk) return 'High';
    if (probability > currentThresholds.mediumRisk) return 'Medium';
    return 'Low';
};

export const getDynamicRiskLevelWithStyles = (probability: number) => {
    const level = getDynamicRiskLevel(probability);
    switch (level) {
        case 'High':
            return { level, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' };
        case 'Medium':
            return { level, color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-200' };
        case 'Low':
            return { level, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' };
    }
};
