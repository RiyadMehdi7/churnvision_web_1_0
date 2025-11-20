import {
  autoAdjustThresholds,
  getAutoAdjustmentConfig,
  initializeSmartThresholds,
  analyzeOptimalThresholds,
  getCurrentThresholds
} from '../config/riskThresholds';

/**
 * Auto Threshold Service
 * Manages automatic threshold adjustments based on real data patterns
 */
class AutoThresholdService {
  private adjustmentTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastDataSnapshot: Array<{ churnProbability?: number }> = [];

  /**
   * Start automatic threshold adjustment monitoring
   */
  start(employees: Array<{ churnProbability?: number }>): void {
    if (this.isRunning) {
      // Auto threshold service already running silently in production
      return;
    }

    this.isRunning = true;
    this.lastDataSnapshot = [...employees];
    
    // Auto threshold service started silently in production
    
    // Initialize smart thresholds on first run
    this.initializeIfNeeded(employees);
    
    // Set up periodic adjustment checks
    this.scheduleNextAdjustment();
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
  updateData(employees: Array<{ churnProbability?: number }>): void {
    this.lastDataSnapshot = [...employees];
    
    // Check if immediate adjustment is needed based on significant data changes
    this.checkForImmediateAdjustment(employees);
  }

  /**
   * Force an immediate adjustment check
   */
  async forceAdjustment(): Promise<{ adjusted: boolean; reason?: string; newThresholds?: any }> {
    // Force adjustment triggered silently in production
    return await autoAdjustThresholds(this.lastDataSnapshot, true);
  }

  /**
   * Get current service status
   */
  getStatus(): {
    isRunning: boolean;
    dataSize: number;
    config: any;
    lastAnalysis?: any;
  } {
    const config = getAutoAdjustmentConfig();
    const lastAnalysis = this.lastDataSnapshot.length > 0 ? 
      analyzeOptimalThresholds(this.lastDataSnapshot) : 
      undefined;

    return {
      isRunning: this.isRunning,
      dataSize: this.lastDataSnapshot.length,
      config,
      lastAnalysis
    };
  }

  /**
   * Initialize smart thresholds if this is the first run
   */
  private async initializeIfNeeded(employees: Array<{ churnProbability?: number }>): Promise<void> {
    const config = getAutoAdjustmentConfig();
    
    if (!config.enabled) {
      // Auto-adjustment disabled, skipping initialization silently in production
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
  private scheduleNextAdjustment(): void {
    const config = getAutoAdjustmentConfig();
    
    if (!config.enabled || !this.isRunning) {
      return;
    }

    const intervalMs = config.adjustmentInterval * 60 * 60 * 1000; // Convert hours to milliseconds
    
    this.adjustmentTimer = setTimeout(async () => {
      await this.performScheduledAdjustment();
      this.scheduleNextAdjustment(); // Schedule next check
    }, intervalMs);

    // Next auto-adjustment scheduled silently in production
  }

  /**
   * Perform a scheduled automatic adjustment
   */
  private async performScheduledAdjustment(): Promise<void> {
    if (!this.isRunning || this.lastDataSnapshot.length === 0) {
      return;
    }

    // Performing scheduled threshold adjustment silently in production
    
    try {
      const result = await autoAdjustThresholds(this.lastDataSnapshot, false);
      
      if (result.adjusted) {
        // Thresholds auto-adjusted silently in production
        
        // Emit event for UI components to update
        window.dispatchEvent(new CustomEvent('thresholds-auto-adjusted', {
          detail: result
        }));
      } else {
        // No adjustment needed silently in production
      }
    } catch (error) {
      // Scheduled adjustment failed silently in production
    }
  }

  /**
   * Check if immediate adjustment is needed due to significant data changes
   */
  private async checkForImmediateAdjustment(employees: Array<{ churnProbability?: number }>): Promise<void> {
    const config = getAutoAdjustmentConfig();
    
    if (!config.enabled || employees.length < config.minSampleSize) {
      return;
    }

    // Check if data distribution has changed significantly
    const currentAnalysis = analyzeOptimalThresholds(employees);
    if (!currentAnalysis) {
      return; // Cannot analyze without data
    }
    const currentDist = currentAnalysis.currentDistribution;
    const targetDist = config.targetDistribution;

    // Calculate deviation from target distribution
    const highDeviation = Math.abs(currentDist.high - targetDist.high);
    const mediumDeviation = Math.abs(currentDist.medium - targetDist.medium);
    const lowDeviation = Math.abs(currentDist.low - targetDist.low);

    // If any category deviates by more than 10%, trigger immediate adjustment
    const maxAllowedDeviation = 10; // 10%
    
    if (highDeviation > maxAllowedDeviation || 
        mediumDeviation > maxAllowedDeviation || 
        lowDeviation > maxAllowedDeviation) {
      
      console.log('Significant distribution deviation detected, triggering immediate adjustment');
      console.log('Current distribution:', currentDist);
      console.log('Target distribution:', targetDist);
      
      const result = await autoAdjustThresholds(employees, true);
      
      if (result.adjusted) {
        console.log('Immediate adjustment applied:', result.newThresholds);
        
        // Emit event for UI components to update
        window.dispatchEvent(new CustomEvent('thresholds-auto-adjusted', {
          detail: { ...result, immediate: true }
        }));
      }
    }
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