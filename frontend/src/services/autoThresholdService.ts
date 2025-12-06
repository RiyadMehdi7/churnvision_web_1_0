import {
  autoAdjustThresholds,
  getAutoAdjustmentConfig,
  initializeSmartThresholds,
  analyzeOptimalThresholds,
  getCurrentThresholds,
  updateRiskThresholds,
  DEFAULT_RISK_THRESHOLDS,
  RiskThresholds
} from '../config/riskThresholds';

/**
 * Auto Threshold Service
 * Manages automatic threshold adjustments based on real data patterns
 */
class AutoThresholdService {
  private adjustmentTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastDataSnapshot: Array<{ churnProbability?: number }> = [];
  private currentDatasetId: string | null = null;
  private hasCalibratedForDataset = false;

  /**
   * Start automatic threshold adjustment monitoring
   */
  start(employees: Array<{ churnProbability?: number }>, datasetId: string | null = null): void {
    const key = datasetId || 'default';

    // If switching datasets, reset to defaults and clear calibration state
    if (this.currentDatasetId !== key) {
      this.stop();
      this.currentDatasetId = key;
      this.hasCalibratedForDataset = false;
      updateRiskThresholds(DEFAULT_RISK_THRESHOLDS, 'dataset-switch');
      this.loadPersistedThresholds(key);
    }

    // If we already calibrated for this dataset (or loaded persisted thresholds), do nothing
    if (this.hasCalibratedForDataset) {
      return;
    }

    this.isRunning = true;
    this.lastDataSnapshot = [...employees];

    // Run a single calibration when we have enough data
    this.initializeIfNeeded(employees, key).then(() => {
      this.calibrateOnceIfReady(employees, key);
    });
  }

  /**
   * Stop automatic threshold adjustment monitoring
   */
  stop(): void {
    if (this.adjustmentTimer) {
      clearTimeout(this.adjustmentTimer);
      this.adjustmentTimer = null;
    }
    this.isRunning = false;
    // Auto threshold service stopped silently in production
  }

  /**
   * Update employee data and trigger immediate analysis
   */
  updateData(employees: Array<{ churnProbability?: number }>, datasetId: string | null = null): void {
    this.lastDataSnapshot = [...employees];
    const key = datasetId || this.currentDatasetId || 'default';
    this.calibrateOnceIfReady(employees, key);
  }

  /**
   * Force an immediate adjustment check
   */
  async forceAdjustment(datasetId: string | null = null): Promise<{ adjusted: boolean; reason?: string; newThresholds?: any }> {
    const key = datasetId || this.currentDatasetId || 'default';
    const result = await autoAdjustThresholds(this.lastDataSnapshot, true);
    if (result.adjusted && result.newThresholds) {
      this.persistThresholds(key, result.newThresholds);
      this.hasCalibratedForDataset = true;
    }
    return result;
  }

  /**
   * Get current service status
   */
  getStatus(): {
    isRunning: boolean;
    dataSize: number;
    config: any;
    lastAnalysis?: any;
    datasetId?: string | null;
    calibrated?: boolean;
  } {
    const config = getAutoAdjustmentConfig();
    const lastAnalysis = this.lastDataSnapshot.length > 0 ? 
      analyzeOptimalThresholds(this.lastDataSnapshot) : 
      undefined;

    return {
      isRunning: this.isRunning,
      dataSize: this.lastDataSnapshot.length,
      config,
      lastAnalysis,
      datasetId: this.currentDatasetId,
      calibrated: this.hasCalibratedForDataset
    };
  }

  /**
   * Initialize smart thresholds if this is the first run
   */
  private async initializeIfNeeded(employees: Array<{ churnProbability?: number }>, datasetKey: string): Promise<void> {
    const config = getAutoAdjustmentConfig();
    
    if (!config.enabled) {
      // Auto-adjustment disabled, skipping initialization silently in production
      return;
    }

    // If thresholds are already persisted for this dataset, load and mark calibrated
    const persisted = this.loadPersistedThresholds(datasetKey);
    if (persisted) {
      this.hasCalibratedForDataset = true;
      return;
    }

    if (employees.length >= config.minSampleSize) {
      // Initializing smart thresholds silently in production
      const initialized = await initializeSmartThresholds(employees);
      
      if (initialized) {
        // Smart thresholds initialized successfully silently in production
      } else {
        // Smart threshold initialization skipped or failed silently in production
      }
    } else {
      // Insufficient data for smart threshold initialization silently in production
    }
  }

  /**
   * Schedule the next automatic adjustment check
   */
  private async calibrateOnceIfReady(employees: Array<{ churnProbability?: number }>, datasetKey: string): Promise<void> {
    if (this.hasCalibratedForDataset) return;

    const config = getAutoAdjustmentConfig();
    if (!config.enabled) return;
    if (employees.length < config.minSampleSize) return; // wait until enough data

    try {
      const result = await autoAdjustThresholds(employees, true);
      if (result.adjusted && result.newThresholds) {
        this.persistThresholds(datasetKey, result.newThresholds);
        this.hasCalibratedForDataset = true;
        window.dispatchEvent(new CustomEvent('thresholds-auto-adjusted', { detail: { ...result, datasetId: datasetKey } }));
      } else {
        // Even if no change was necessary, mark as calibrated to avoid endless attempts
        this.hasCalibratedForDataset = true;
      }
    } catch (error) {
      console.warn('Calibration failed, will retry on next data update:', error);
    }
  }

  private persistThresholds(datasetKey: string, thresholds: RiskThresholds): void {
    try {
      const payload = {
        thresholds,
        calibratedAt: new Date().toISOString(),
        datasetId: datasetKey,
      };
      localStorage.setItem(this.storageKey(datasetKey), JSON.stringify(payload));
      updateRiskThresholds(thresholds, 'auto-calibration');
    } catch (error) {
      console.warn('Failed to persist thresholds', error);
    }
  }

  private loadPersistedThresholds(datasetKey: string): RiskThresholds | null {
    try {
      const raw = localStorage.getItem(this.storageKey(datasetKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.thresholds) {
        updateRiskThresholds(parsed.thresholds, 'auto-calibration-cache');
        this.hasCalibratedForDataset = true;
        return parsed.thresholds as RiskThresholds;
      }
    } catch (error) {
      console.warn('Failed to load persisted thresholds', error);
    }
    return null;
  }

  private storageKey(datasetKey: string): string {
    return `churnvision-thresholds-${datasetKey}`;
  }

  /**
   * Get intelligent recommendations for manual review
   */
  getRecommendations(): {
    shouldAdjust: boolean;
    recommendations: string[];
    analysis: any;
  } {
    if (this.lastDataSnapshot.length === 0) {
      return {
        shouldAdjust: false,
        recommendations: ['No data available for analysis'],
        analysis: null
      };
    }

    const analysis = analyzeOptimalThresholds(this.lastDataSnapshot);
    if (!analysis) {
      return {
        shouldAdjust: false,
        recommendations: ['No data available for analysis'],
        analysis: null
      };
    }
    const config = getAutoAdjustmentConfig();
    const recommendations: string[] = [];
    
    // Analyze current vs recommended thresholds
    const currentDist = analysis.currentDistribution;
    const targetDist = config.targetDistribution;

    let shouldAdjust = false;

    // Check if current distribution is far from target
    if (Math.abs(currentDist.high - targetDist.high) > 5) {
      shouldAdjust = true;
      recommendations.push(
        `High risk employees: Currently ${currentDist.high.toFixed(1)}%, target ${targetDist.high}%`
      );
    }

    if (Math.abs(currentDist.medium - targetDist.medium) > 5) {
      shouldAdjust = true;
      recommendations.push(
        `Medium risk employees: Currently ${currentDist.medium.toFixed(1)}%, target ${targetDist.medium}%`
      );
    }

    // Check data quality
    const validProbabilities = this.lastDataSnapshot
      .map(emp => emp.churnProbability || 0)
      .filter(prob => prob >= 0 && prob <= 1);

    if (validProbabilities.length < this.lastDataSnapshot.length * 0.9) {
      recommendations.push('Data quality issue: Some employees missing churn probability scores');
    }

    // Check for clustering issues
    const thresholds = getCurrentThresholds();
    const highRiskCount = validProbabilities.filter(p => p > thresholds.highRisk).length;
    const lowRiskCount = validProbabilities.filter(p => p < 0.3).length;
    
    if (highRiskCount / validProbabilities.length > 0.5) {
      recommendations.push('Warning: Over 50% of employees are high risk - consider model recalibration');
    }

    if (lowRiskCount / validProbabilities.length > 0.8) {
      recommendations.push('Most employees are low risk - thresholds may be too conservative');
    }

    if (!shouldAdjust && recommendations.length === 0) {
      recommendations.push('Current thresholds appear well-calibrated for your data');
    }

    return {
      shouldAdjust,
      recommendations,
      analysis
    };
  }
}

// Export singleton instance
export const autoThresholdService = new AutoThresholdService();
export default autoThresholdService;
