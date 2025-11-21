import { useState, useEffect, useCallback } from 'react';
import {
  RiskThresholds,
  DynamicRiskConfig,
  AutoAdjustmentConfig,
  getCurrentRiskConfig,
  subscribeToThresholdChanges,
  getDynamicRiskLevel,
  getDynamicRiskLevelWithStyles,
  getDynamicRiskDistribution,
  autoAdjustThresholds,
  getAutoAdjustmentConfig,
} from '../config/riskThresholds';

export interface UseDynamicRiskRangesReturn {
  // Current configuration
  config: DynamicRiskConfig;
  thresholds: RiskThresholds;
  autoConfig: AutoAdjustmentConfig;
  
  // Auto-adjustment functions
  autoAdjust: (employees: Array<{ churnProbability?: number }>, forceAdjust?: boolean) => Promise<{ adjusted: boolean; reason?: string; newThresholds?: RiskThresholds }>;
  
  // Utility functions
  getRiskLevel: (probability: number) => 'High' | 'Medium' | 'Low';
  getRiskLevelWithStyles: (probability: number) => any;
  calculateRiskDistribution: (employees: Array<{ churnProbability?: number }>) => { high: number; medium: number; low: number };
  
  // State
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing dynamic risk thresholds
 * Provides reactive access to risk threshold configuration with automatic updates
 */
export function useDynamicRiskRanges(): UseDynamicRiskRangesReturn {
  const [config, setConfig] = useState<DynamicRiskConfig>(getCurrentRiskConfig());
  const [autoConfig] = useState<AutoAdjustmentConfig>(getAutoAdjustmentConfig());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to configuration changes
  useEffect(() => {
    const unsubscribe = subscribeToThresholdChanges((newConfig) => {
      setConfig(newConfig);
      setError(null);
    });

    return unsubscribe;
  }, []);

  // Auto-adjust thresholds
  const handleAutoAdjust = useCallback(async (
    employees: Array<{ churnProbability?: number }>,
    forceAdjust = false
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await autoAdjustThresholds(employees, forceAdjust);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Auto-adjustment failed';
      setError(errorMessage);
      return { adjusted: false, reason: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // Current configuration
    config,
    thresholds: config.current,
    autoConfig,
    
    // Auto-adjustment functions
    autoAdjust: handleAutoAdjust,
    
    // Utility functions (these use current dynamic thresholds)
    getRiskLevel: getDynamicRiskLevel,
    getRiskLevelWithStyles: getDynamicRiskLevelWithStyles,
    calculateRiskDistribution: getDynamicRiskDistribution,
    
    // State
    isLoading,
    error,
  };
}

/**
 * Alias for useDynamicRiskRanges for backward compatibility
 */
export const useCurrentRiskThresholds = useDynamicRiskRanges;
