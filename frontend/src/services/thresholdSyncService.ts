import { getCurrentThresholds, updateRiskThresholds } from '../config/riskThresholds';
import logger from '../utils/clientLogger';
import api from './api';

/**
 * Threshold Sync Service
 * Synchronizes risk thresholds between frontend and backend via API
 */
class ThresholdSyncService {
  private static instance: ThresholdSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  private constructor() {}

  static getInstance(): ThresholdSyncService {
    if (!ThresholdSyncService.instance) {
      ThresholdSyncService.instance = new ThresholdSyncService();
    }
    return ThresholdSyncService.instance;
  }

  /**
   * Sync frontend thresholds with backend
   */
  async syncWithBackend(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;

    try {
      const response = await api.get('/settings/risk-thresholds');
      const backendThresholds = response.data;

      // Get current frontend thresholds
      const frontendThresholds = getCurrentThresholds();

      // Check if thresholds are different
      if (backendThresholds.highRisk !== frontendThresholds.highRisk ||
          backendThresholds.mediumRisk !== frontendThresholds.mediumRisk) {

        logger.info('Syncing thresholds with backend:', {
          frontend: frontendThresholds,
          backend: backendThresholds
        });

        // Update frontend thresholds to match backend
        const success = updateRiskThresholds({
          highRisk: backendThresholds.highRisk,
          mediumRisk: backendThresholds.mediumRisk
        }, 'backend-sync');

        if (success) {
          return {
            success: true,
            message: 'Thresholds synchronized successfully'
          };
        } else {
          return {
            success: false,
            message: 'Failed to update frontend thresholds'
          };
        }
      } else {
        return {
          success: true,
          message: 'Thresholds already in sync'
        };
      }
    } catch (error) {
      logger.error('Failed to sync with backend:', error);
      return {
        success: false,
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync backend thresholds with frontend
   */
  async syncToBackend(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;

    try {
      const frontendThresholds = getCurrentThresholds();

      await api.put('/settings/risk-thresholds', {
        highRisk: frontendThresholds.highRisk,
        mediumRisk: frontendThresholds.mediumRisk
      });

      logger.info('Backend thresholds updated successfully');
      return {
        success: true,
        message: 'Backend thresholds updated successfully'
      };
    } catch (error) {
      logger.error('Failed to sync to backend:', error);
      return {
        success: false,
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(intervalMinutes: number = 30): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.syncInterval = setInterval(async () => {
      logger.debug('Running automatic threshold sync');
      await this.syncWithBackend();
    }, intervalMs);

    logger.info(`Started automatic threshold sync every ${intervalMinutes} minutes`);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Stopped automatic threshold sync');
    }
  }

  /**
   * Get sync status
   */
  getStatus(): { isSyncing: boolean; autoSyncActive: boolean } {
    return {
      isSyncing: this.isSyncing,
      autoSyncActive: this.syncInterval !== null
    };
  }
}

// Export singleton instance
const thresholdSyncService = ThresholdSyncService.getInstance();
export default thresholdSyncService;
