/**
 * Dynamic Risk Threshold Configuration
 * 
 * Central configuration for churn risk categorization thresholds.
 * Supports runtime configuration changes and automatic updates across all components.
 * Adjust these values to fine-tune risk level classifications without retraining the model.
 */

export interface RiskThresholds {
  /** Threshold for High Risk (above this value) */
  highRisk: number;
  /** Threshold for Medium Risk (above this value, but below highRisk) */
  mediumRisk: number;
  /** Low Risk is anything below mediumRisk */
}

export interface DynamicRiskConfig {
  /** Current active threshold configuration */
  current: RiskThresholds;
  /** Configuration metadata */
  metadata: {
    lastUpdated: string;
    updatedBy?: string;
    version: string;
  };
}

/**
 * Default risk thresholds (aligned with backend)
 * Current: High >= 60%, Medium 30-60%, Low < 30%
 */
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  highRisk: 0.6,   // 60% - aligned with backend churn_prediction.py
  mediumRisk: 0.3, // 30% - aligned with backend churn_prediction.py
};

// Global configuration state
let globalRiskConfig: DynamicRiskConfig = {
  current: DEFAULT_RISK_THRESHOLDS,
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: '1.0.0'
  }
};

// Event listeners for configuration changes
type ThresholdChangeListener = (newConfig: DynamicRiskConfig) => void;
const changeListeners: Set<ThresholdChangeListener> = new Set();

// Calibration (auto-adjustment) state listeners
type CalibrationChangeListener = (isCalibrating: boolean, meta?: { reason?: string }) => void;
const calibrationListeners: Set<CalibrationChangeListener> = new Set();
let isCalibratingThresholds = false;

/**
 * Get risk level based on probability and thresholds
 * Uses >= comparison to match backend logic in churn_prediction.py
 */
export function getRiskLevel(
  probability: number,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS
): 'High' | 'Medium' | 'Low' {
  const validProb = Math.max(0, Math.min(1, Number(probability) || 0));

  if (validProb >= thresholds.highRisk) return 'High';
  if (validProb >= thresholds.mediumRisk) return 'Medium';
  return 'Low';
}

/**
 * Get risk level with styling information
 */
export function getRiskLevelWithStyles(
  probability: number,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS
) {
  const level = getRiskLevel(probability, thresholds);
  
  const styleMap = {
    High: { 
      level: 'High Risk', 
      color: 'text-red-600', 
      bgColor: 'bg-red-100', 
      borderColor: 'border-red-200',
      darkColor: 'dark:text-red-400',
      darkBgColor: 'dark:bg-red-900/30'
    },
    Medium: { 
      level: 'Medium Risk', 
      color: 'text-orange-600', 
      bgColor: 'bg-orange-100', 
      borderColor: 'border-orange-200',
      darkColor: 'dark:text-orange-400',
      darkBgColor: 'dark:bg-orange-900/30'
    },
    Low: { 
      level: 'Low Risk', 
      color: 'text-green-600', 
      bgColor: 'bg-green-100', 
      borderColor: 'border-green-200',
      darkColor: 'dark:text-green-400',
      darkBgColor: 'dark:bg-green-900/30'
    }
  };
  
  return styleMap[level];
}

/**
 * Calculate risk distribution from employee data
 */
export function calculateRiskDistribution(
  employees: Array<{ churnProbability?: number }>,
  thresholds: RiskThresholds = globalRiskConfig.current
) {
  return employees.reduce((acc, emp) => {
    const probability = emp.churnProbability || 0;
    const level = getRiskLevel(probability, thresholds);
    
    if (level === 'High') acc.high++;
    else if (level === 'Medium') acc.medium++;
    else acc.low++;
    
    return acc;
  }, { high: 0, medium: 0, low: 0 });
}

/**
 * Dynamic Risk Threshold Management Functions
 */

/**
 * Get current dynamic risk configuration
 */
export function getCurrentRiskConfig(): DynamicRiskConfig {
  return { ...globalRiskConfig };
}

/**
 * Get current active thresholds
 */
export function getCurrentThresholds(): RiskThresholds {
  return { ...globalRiskConfig.current };
}

/**
 * Update risk thresholds dynamically
 */
export function updateRiskThresholds(
  newThresholds: Partial<RiskThresholds>,
  updatedBy?: string
): boolean {
  try {
    // Validate thresholds
    const updated = { ...globalRiskConfig.current, ...newThresholds };
    
    if (updated.mediumRisk >= updated.highRisk) {
      throw new Error('Medium risk threshold must be lower than high risk threshold');
    }
    
    if (updated.mediumRisk < 0 || updated.highRisk > 1) {
      throw new Error('Thresholds must be between 0 and 1');
    }

    // Update configuration
    globalRiskConfig = {
      ...globalRiskConfig,
      current: updated,
      metadata: {
        ...globalRiskConfig.metadata,
        lastUpdated: new Date().toISOString(),
        updatedBy,
        version: '1.0.0'
      }
    };
    
    // Notify all listeners
    notifyListeners();
    
    return true;
  } catch (error) {
    console.error('Failed to update risk thresholds:', error);
    return false;
  }
}

/**
 * Subscribe to threshold configuration changes
 */
export function subscribeToThresholdChanges(listener: ThresholdChangeListener): () => void {
  changeListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Get risk level using current dynamic thresholds
 */
export function getDynamicRiskLevel(probability: number): 'High' | 'Medium' | 'Low' {
  return getRiskLevel(probability, globalRiskConfig.current);
}

/**
 * Get risk level with styles using current dynamic thresholds
 */
export function getDynamicRiskLevelWithStyles(probability: number) {
  return getRiskLevelWithStyles(probability, globalRiskConfig.current);
}

/**
 * Calculate risk distribution using current dynamic thresholds
 */
export function getDynamicRiskDistribution(employees: Array<{ churnProbability?: number }>) {
  return calculateRiskDistribution(employees, globalRiskConfig.current);
}

function notifyListeners(): void {
  changeListeners.forEach(listener => {
    try {
      listener({ ...globalRiskConfig });
    } catch (error) {
      console.error('Error in threshold change listener:', error);
    }
  });
}

function notifyCalibrationListeners(reason?: string): void {
  calibrationListeners.forEach(listener => {
    try {
      listener(isCalibratingThresholds, reason ? { reason } : undefined);
    } catch (error) {
      console.error('Error in calibration change listener:', error);
    }
  });
}

/**
 * Auto-Adjustment System for Realistic Risk Thresholds
 */

export interface AutoAdjustmentConfig {
  enabled: boolean;
  /** Target distribution percentages */
  targetDistribution: {
    high: number;    // Target % of employees in high risk
    medium: number;  // Target % of employees in medium risk
    low: number;     // Target % of employees in low risk
  };
  /** Adjustment sensitivity (0-1, higher = more aggressive adjustments) */
  sensitivity: number;
  /** Minimum sample size required for auto-adjustment */
  minSampleSize: number;
  /** Auto-adjustment frequency in hours */
  adjustmentInterval: number;
}

const defaultAutoConfig: AutoAdjustmentConfig = {
  enabled: true,
  targetDistribution: {
    high: 15,    // 15% high risk (realistic for most organizations)
    medium: 25,  // 25% medium risk 
    low: 60      // 60% low risk
  },
  sensitivity: 0.3,
  minSampleSize: 50,
  adjustmentInterval: 24 // Auto-adjust daily
};

let autoAdjustmentConfig = { ...defaultAutoConfig };

/**
 * Auto-adjust thresholds based on actual data distribution
 */
export async function autoAdjustThresholds(
  employees: Array<{ churnProbability?: number }>,
  forceAdjust = false
): Promise<{ adjusted: boolean; reason?: string; newThresholds?: RiskThresholds }> {
  // Mark calibration start
  isCalibratingThresholds = true;
  notifyCalibrationListeners(forceAdjust ? 'forced' : 'scheduled');
  if (!autoAdjustmentConfig.enabled && !forceAdjust) {
    isCalibratingThresholds = false;
    notifyCalibrationListeners('disabled');
    return { adjusted: false, reason: 'Auto-adjustment disabled' };
  }

  if (employees.length < autoAdjustmentConfig.minSampleSize) {
    return { adjusted: false, reason: 'Insufficient sample size' };
  }

  try {
    // Extract valid probabilities and sort them
    const validProbabilities = employees
      .map(emp => emp.churnProbability || 0)
      .filter(prob => prob >= 0 && prob <= 1)
      .sort((a, b) => b - a); // Sort descending

    if (validProbabilities.length === 0) {
      isCalibratingThresholds = false;
      notifyCalibrationListeners('no-data');
      return { adjusted: false, reason: 'No valid probability data' };
    }

    // Calculate target thresholds based on desired distribution
    const totalEmployees = validProbabilities.length;
    const targetHighCount = Math.floor(totalEmployees * autoAdjustmentConfig.targetDistribution.high / 100);
    const targetMediumCount = Math.floor(totalEmployees * autoAdjustmentConfig.targetDistribution.medium / 100);
    
    // Calculate optimal thresholds based on data distribution
    const newHighThreshold = targetHighCount > 0 ? 
      validProbabilities[Math.min(targetHighCount - 1, validProbabilities.length - 1)] : 0.8;
    
    const newMediumThreshold = (targetHighCount + targetMediumCount) < validProbabilities.length ? 
      validProbabilities[targetHighCount + targetMediumCount - 1] : 0.4;

    // Apply smoothing to prevent dramatic changes
    const currentThresholds = getCurrentThresholds();
    const sensitivity = autoAdjustmentConfig.sensitivity;
    
    const smoothedHighThreshold = currentThresholds.highRisk + 
      (newHighThreshold - currentThresholds.highRisk) * sensitivity;
    
    const smoothedMediumThreshold = currentThresholds.mediumRisk + 
      (newMediumThreshold - currentThresholds.mediumRisk) * sensitivity;

    // Ensure logical ordering and bounds
    const finalThresholds: RiskThresholds = {
      highRisk: Math.max(0.1, Math.min(0.95, smoothedHighThreshold)),
      mediumRisk: Math.max(0.05, Math.min(smoothedHighThreshold - 0.05, smoothedMediumThreshold))
    };

    // Only adjust if the change is meaningful (>2% difference)
    const highDiff = Math.abs(finalThresholds.highRisk - currentThresholds.highRisk);
    const mediumDiff = Math.abs(finalThresholds.mediumRisk - currentThresholds.mediumRisk);
    
    if (highDiff < 0.02 && mediumDiff < 0.02) {
      isCalibratingThresholds = false;
      notifyCalibrationListeners('no-meaningful-change');
      return { adjusted: false, reason: 'No meaningful change required' };
    }

    // Apply the new thresholds
    const success = updateRiskThresholds(finalThresholds, 'auto-adjustment-system');
    
    if (success) {
      
      // Log the adjustment for transparency
      console.log('Risk thresholds auto-adjusted:', {
        previous: currentThresholds,
        new: finalThresholds,
        sampleSize: totalEmployees,
        targetDistribution: autoAdjustmentConfig.targetDistribution
      });
      
      isCalibratingThresholds = false;
      notifyCalibrationListeners('applied');
      return { adjusted: true, newThresholds: finalThresholds, reason: `Adjusted based on ${totalEmployees} employees to achieve target distribution` };
    }
    isCalibratingThresholds = false;
    notifyCalibrationListeners('apply-failed');
    return { adjusted: false, reason: 'Failed to apply new thresholds' };
    
  } catch (error) {
    console.error('Auto-adjustment failed:', error);
    isCalibratingThresholds = false;
    notifyCalibrationListeners('error');
    return { adjusted: false, reason: 'Auto-adjustment error' };
  }
}

/**
 * Get current auto-adjustment configuration
 */
export function getAutoAdjustmentConfig(): AutoAdjustmentConfig {
  return { ...autoAdjustmentConfig };
}

/**
 * Subscribe to calibration state changes (start/stop of auto-adjustment)
 */
export function subscribeToCalibrationChanges(listener: CalibrationChangeListener): () => void {
  calibrationListeners.add(listener);
  // Immediately inform of current state
  try { listener(isCalibratingThresholds); } catch {}
  return () => calibrationListeners.delete(listener);
}

/**
 * Get current calibration status
 */
export function isCalibrating(): boolean {
  return isCalibratingThresholds;
}

/**
 * Initialize smart thresholds based on employee data
 */
export async function initializeSmartThresholds(employees: Array<{ churnProbability?: number }>): Promise<boolean> {
  if (employees.length === 0) {
    return false;
  }

  const validProbabilities = employees
    .map(emp => emp.churnProbability || 0)
    .filter(prob => prob >= 0 && prob <= 1)
    .sort((a, b) => a - b);

  if (validProbabilities.length < 10) {
    return false; // Need at least 10 valid data points
  }

  // Calculate optimal thresholds based on data distribution
  const total = validProbabilities.length;
  const config = getAutoAdjustmentConfig();
  
  // Calculate percentile-based thresholds
  const highRiskIndex = Math.floor(total * (1 - config.targetDistribution.high / 100));
  const mediumRiskIndex = Math.floor(total * (1 - (config.targetDistribution.high + config.targetDistribution.medium) / 100));
  
  const optimalThresholds: RiskThresholds = {
    highRisk: Math.min(0.9, Math.max(0.5, validProbabilities[highRiskIndex] || 0.7)),
    mediumRisk: Math.min(0.7, Math.max(0.2, validProbabilities[mediumRiskIndex] || 0.4))
  };

  // Apply the calculated thresholds
  const success = updateRiskThresholds(optimalThresholds, 'smart-initialization');
  
  if (success) {
    console.log('Smart thresholds initialized:', optimalThresholds);
  }

  return success;
}

/**
 * Analyze optimal thresholds for current data
 */
export function analyzeOptimalThresholds(employees: Array<{ churnProbability?: number }>) {
  if (employees.length === 0) {
    return null;
  }

  const validProbabilities = employees
    .map(emp => emp.churnProbability || 0)
    .filter(prob => prob >= 0 && prob <= 1);

  if (validProbabilities.length === 0) {
    return null;
  }

  const currentThresholds = getCurrentThresholds();
  const total = validProbabilities.length;

  // Current distribution
  const currentDistribution = {
    high: Math.round((validProbabilities.filter(p => p > currentThresholds.highRisk).length / total) * 100),
    medium: Math.round((validProbabilities.filter(p => p > currentThresholds.mediumRisk && p <= currentThresholds.highRisk).length / total) * 100),
    low: Math.round((validProbabilities.filter(p => p <= currentThresholds.mediumRisk).length / total) * 100)
  };

  // Calculate optimal thresholds
  const config = getAutoAdjustmentConfig();
  const sortedProbs = [...validProbabilities].sort((a, b) => b - a); // Descending order

  const highRiskIndex = Math.floor(total * (config.targetDistribution.high / 100));
  const mediumRiskIndex = Math.floor(total * ((config.targetDistribution.high + config.targetDistribution.medium) / 100));

  const recommendedThresholds: RiskThresholds = {
    highRisk: Math.min(0.95, Math.max(0.5, sortedProbs[highRiskIndex] || 0.7)),
    mediumRisk: Math.min(0.8, Math.max(0.2, sortedProbs[mediumRiskIndex] || 0.4))
  };

  // Projected distribution with recommended thresholds
  const projectedDistribution = {
    high: Math.round((validProbabilities.filter(p => p > recommendedThresholds.highRisk).length / total) * 100),
    medium: Math.round((validProbabilities.filter(p => p > recommendedThresholds.mediumRisk && p <= recommendedThresholds.highRisk).length / total) * 100),
    low: Math.round((validProbabilities.filter(p => p <= recommendedThresholds.mediumRisk).length / total) * 100)
  };

  return {
    currentDistribution,
    projectedDistribution,
    recommendedThresholds,
    currentThresholds,
    sampleSize: total,
    dataQuality: validProbabilities.length / employees.length
  };
}

/**
 * Get risk level for a specific employee (alias for getDynamicRiskLevel)
 */
export function getRiskLevelForEmployee(probability: number): 'High' | 'Medium' | 'Low' {
  return getDynamicRiskLevel(probability);
}

/**
 * Get risk level with styles for a specific employee (alias for getDynamicRiskLevelWithStyles)
 */
export function getRiskLevelForEmployeeWithStyles(probability: number) {
  return getDynamicRiskLevelWithStyles(probability);
} 