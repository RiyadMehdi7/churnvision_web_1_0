import { DashboardLayout, DashboardWidget } from '../types/dashboard';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';

export interface LegacyPreferences {
  theme?: 'light' | 'dark';
  defaultView?: 'table' | 'cards';
  sortBy?: string;
  filterPreferences?: {
    department?: string;
    riskLevel?: string;
    status?: string;
  };
  tableSettings?: {
    pageSize?: number;
    columnsVisible?: string[];
    sortDirection?: 'asc' | 'desc';
  };
  dashboardSettings?: {
    showMetrics?: boolean;
    showCharts?: boolean;
    refreshInterval?: number;
  };
}

export interface MigrationResult {
  success: boolean;
  layout?: DashboardLayout;
  errors: string[];
  warnings: string[];
  migratedPreferences: any;
}

class CompatibilityLayer {
  private static instance: CompatibilityLayer;
  private readonly LEGACY_STORAGE_KEYS = [
    'user-preferences',
    'dashboard-settings',
    'table-settings',
    'filter-preferences',
    'theme-preference',
    'view-preference'
  ];

  private constructor() {}

  public static getInstance(): CompatibilityLayer {
    if (!CompatibilityLayer.instance) {
      CompatibilityLayer.instance = new CompatibilityLayer();
    }
    return CompatibilityLayer.instance;
  }

  // Migration methods
  public async migrateLegacyPreferences(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      errors: [],
      warnings: [],
      migratedPreferences: {}
    };

    try {
      // Collect legacy preferences from various storage keys
      const legacyPrefs = this.collectLegacyPreferences();
      
      if (Object.keys(legacyPrefs).length === 0) {
        result.warnings.push('No legacy preferences found to migrate');
        result.success = true;
        return result;
      }

      // Convert legacy preferences to new format
      const migratedLayout = this.convertToNewLayout(legacyPrefs);
      
      if (migratedLayout) {
        result.layout = migratedLayout;
        result.migratedPreferences = this.convertPreferences(legacyPrefs);
        
        // Store migrated preferences
        await this.storeMigratedPreferences(result.migratedPreferences);
        
        // Mark migration as complete
        localStorage.setItem('preferences-migrated', 'true');
        localStorage.setItem('migration-date', new Date().toISOString());
        
        result.success = true;
        result.warnings.push('Legacy preferences successfully migrated');
      } else {
        result.errors.push('Failed to convert legacy preferences to new layout format');
      }

    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  public needsMigration(): boolean {
    const migrated = localStorage.getItem('preferences-migrated');
    if (migrated === 'true') return false;

    // Check if any legacy preferences exist
    return this.LEGACY_STORAGE_KEYS.some(key => localStorage.getItem(key) !== null);
  }

  public async rollbackMigration(): Promise<boolean> {
    try {
      // Remove migrated preferences
      localStorage.removeItem('customization-settings');
      localStorage.removeItem('dashboard-layouts');
      localStorage.removeItem('preferences-migrated');
      localStorage.removeItem('migration-date');
      
      return true;
    } catch (error) {
      // Failed to rollback migration - logged silently in production
      return false;
    }
  }

  // Legacy preference collection
  private collectLegacyPreferences(): LegacyPreferences {
    const prefs: LegacyPreferences = {};

    try {
      // Theme preference
      const theme = localStorage.getItem('theme-preference');
      if (theme) prefs.theme = theme as 'light' | 'dark';

      // View preference
      const view = localStorage.getItem('view-preference');
      if (view) prefs.defaultView = view as 'table' | 'cards';

      // Dashboard settings
      const dashboardSettings = localStorage.getItem('dashboard-settings');
      if (dashboardSettings) {
        try {
          prefs.dashboardSettings = JSON.parse(dashboardSettings);
        } catch (e) {
          // Failed to parse dashboard settings - logged silently in production
        }
      }

      // Table settings
      const tableSettings = localStorage.getItem('table-settings');
      if (tableSettings) {
        try {
          prefs.tableSettings = JSON.parse(tableSettings);
        } catch (e) {
          // Failed to parse table settings - logged silently in production
        }
      }

      // Filter preferences
      const filterPrefs = localStorage.getItem('filter-preferences');
      if (filterPrefs) {
        try {
          prefs.filterPreferences = JSON.parse(filterPrefs);
        } catch (e) {
          // Failed to parse filter preferences - logged silently in production
        }
      }

      // User preferences (general)
      const userPrefs = localStorage.getItem('user-preferences');
      if (userPrefs) {
        try {
          const parsed = JSON.parse(userPrefs);
          Object.assign(prefs, parsed);
        } catch (e) {
          // Failed to parse user preferences - logged silently in production
        }
      }

    } catch (error) {
      // Error collecting legacy preferences - logged silently in production
    }

    return prefs;
  }

  // Conversion methods
  private convertToNewLayout(legacyPrefs: LegacyPreferences): DashboardLayout | null {
    try {
      const widgets: DashboardWidget[] = [];
      let yPosition = 0;

      // Always include basic widgets based on legacy preferences
      
      // Risk distribution widget (always included)
      widgets.push({
        id: 'migrated-risk-bar',
        type: 'risk-bar',
        title: 'Risk Distribution',
        position: { x: 0, y: yPosition, w: 6, h: 3 },
        config: {
          showTitle: true,
          height: 200,
          theme: legacyPrefs.theme || 'default'
        }
      });

      // Employee table widget (if table view was preferred)
      if (legacyPrefs.defaultView === 'table' || !legacyPrefs.defaultView) {
        widgets.push({
          id: 'migrated-employee-table',
          type: 'employee-table',
          title: 'Employee Overview',
          position: { x: 6, y: yPosition, w: 6, h: 6 },
          config: {
            showTitle: true,
            height: 400,
            pageSize: legacyPrefs.tableSettings?.pageSize || 25,
            showFilters: true,
            showSearch: true,
            defaultSort: legacyPrefs.sortBy || 'churnProbability'
          }
        });
        yPosition += 6;
      } else {
        yPosition += 3;
      }

      // Metrics widget (if dashboard metrics were enabled)
      if (legacyPrefs.dashboardSettings?.showMetrics !== false) {
        widgets.push({
          id: 'migrated-metrics',
          type: 'metrics',
          title: 'Key Metrics',
          position: { x: 0, y: yPosition, w: 4, h: 3 },
          config: {
            showTitle: true,
            height: 180,
            refreshInterval: legacyPrefs.dashboardSettings?.refreshInterval || 0
          }
        });
      }

      // Charts widget (if charts were enabled)
      if (legacyPrefs.dashboardSettings?.showCharts !== false) {
        widgets.push({
          id: 'migrated-distribution-chart',
          type: 'distribution-chart',
          title: 'Risk Analysis',
          position: { x: 4, y: yPosition, w: 8, h: 4 },
          config: {
            showTitle: true,
            height: 250
          }
        });
      }

      const layout: DashboardLayout = {
        id: 'migrated-layout',
        name: 'Migrated Layout',
        widgets,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          description: 'Layout migrated from legacy preferences',
          tags: ['migrated', 'legacy'],
          category: 'custom'
        }
      };

      return layout;
    } catch (error) {
      console.error('Failed to convert legacy preferences to layout:', error);
      return null;
    }
  }

  private convertPreferences(legacyPrefs: LegacyPreferences): any {
    return {
      theme: legacyPrefs.theme || 'light',
      defaultMode: this.inferModeFromPreferences(legacyPrefs),
      notifications: {
        enabled: true,
        types: ['error', 'warning', 'info']
      },
      autoSave: true,
      refreshInterval: legacyPrefs.dashboardSettings?.refreshInterval || 0,
      filters: {
        department: legacyPrefs.filterPreferences?.department || 'All',
        riskLevel: legacyPrefs.filterPreferences?.riskLevel || 'All',
        status: legacyPrefs.filterPreferences?.status || 'All'
      },
      table: {
        pageSize: legacyPrefs.tableSettings?.pageSize || 25,
        sortBy: legacyPrefs.sortBy || 'churnProbability',
        sortDirection: legacyPrefs.tableSettings?.sortDirection || 'desc',
        columnsVisible: legacyPrefs.tableSettings?.columnsVisible || [
          'full_name', 'structure_name', 'position', 'churnProbability', 'status'
        ]
      }
    };
  }

  private inferModeFromPreferences(legacyPrefs: LegacyPreferences): CustomizationMode {
    // Simple heuristic to infer mode based on legacy preferences
    // If user preferred detailed table view and had many columns visible, likely D-level
    if (legacyPrefs.defaultView === 'table' && 
        legacyPrefs.tableSettings?.columnsVisible && 
        legacyPrefs.tableSettings.columnsVisible.length > 5) {
      return 'd-level';
    }
    
    // If user had charts disabled and preferred simple metrics, likely C-level
    if (legacyPrefs.dashboardSettings?.showCharts === false && 
        legacyPrefs.dashboardSettings?.showMetrics !== false) {
      return 'c-level';
    }
    
    // Default to D-level for most users
    return 'd-level';
  }

  private async storeMigratedPreferences(preferences: any): Promise<void> {
    try {
      localStorage.setItem('customization-settings', JSON.stringify(preferences));
    } catch (error) {
      throw new Error(`Failed to store migrated preferences: ${error}`);
    }
  }

  // Fallback mechanisms
  public getFallbackLayout(mode: CustomizationMode): DashboardLayout {
    const widgets: DashboardWidget[] = [];

    if (mode === 'c-level') {
      // C-Level fallback layout
      widgets.push(
        {
          id: 'fallback-executive-overview',
          type: 'risk-bar',
          title: 'Risk Overview',
          position: { x: 0, y: 0, w: 6, h: 3 },
          config: { showTitle: true, height: 200 }
        },
        {
          id: 'fallback-metrics',
          type: 'metrics',
          title: 'Key Metrics',
          position: { x: 6, y: 0, w: 6, h: 3 },
          config: { showTitle: true, height: 200 }
        }
      );
    } else {
      // D-Level fallback layout
      widgets.push(
        {
          id: 'fallback-employee-table',
          type: 'employee-table',
          title: 'Employee Overview',
          position: { x: 0, y: 0, w: 12, h: 6 },
          config: { showTitle: true, height: 400 }
        },
        {
          id: 'fallback-risk-bar',
          type: 'risk-bar',
          title: 'Risk Distribution',
          position: { x: 0, y: 6, w: 6, h: 3 },
          config: { showTitle: true, height: 200 }
        }
      );
    }

    return {
      id: `fallback-${mode}-layout`,
      name: `Fallback ${mode === 'c-level' ? 'Executive' : 'Manager'} Layout`,
      widgets,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        description: 'Fallback layout for compatibility',
        tags: ['fallback', mode],
        category: mode
      }
    };
  }

  public getCompatibilityShims(): any {
    return {
      // Legacy API compatibility
      getDashboardData: () => {
        console.warn('getDashboardData is deprecated. Use new dashboard service instead.');
        return { employees: [], metrics: {} };
      },
      
      setUserPreference: (key: string, value: any) => {
        console.warn('setUserPreference is deprecated. Use customization context instead.');
        localStorage.setItem(`legacy-${key}`, JSON.stringify(value));
      },
      
      getUserPreference: (key: string, defaultValue?: any) => {
        console.warn('getUserPreference is deprecated. Use customization context instead.');
        const stored = localStorage.getItem(`legacy-${key}`);
        return stored ? JSON.parse(stored) : defaultValue;
      },
      
      // Theme compatibility
      setTheme: (theme: 'light' | 'dark') => {
        console.warn('setTheme is deprecated. Use theme context instead.');
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        root.style.colorScheme = theme;

        try {
          localStorage.setItem('churnvision-theme', theme);
          localStorage.setItem('churnvision-theme-source', 'user');
        } catch (error) {
          // Ignore storage write errors to stay compatible in restricted environments
        }
      }
    };
  }

  // Cleanup methods
  public cleanupLegacyData(): void {
    try {
      // Remove legacy storage keys after successful migration
      this.LEGACY_STORAGE_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          // Backup before removal
          localStorage.setItem(`backup-${key}`, value);
          localStorage.removeItem(key);
        }
      });
      
      localStorage.setItem('legacy-cleanup-date', new Date().toISOString());
    } catch (error) {
      console.error('Failed to cleanup legacy data:', error);
    }
  }

  public restoreLegacyData(): boolean {
    try {
      // Restore from backup if needed
      this.LEGACY_STORAGE_KEYS.forEach(key => {
        const backup = localStorage.getItem(`backup-${key}`);
        if (backup) {
          localStorage.setItem(key, backup);
          localStorage.removeItem(`backup-${key}`);
        }
      });
      
      localStorage.removeItem('legacy-cleanup-date');
      return true;
    } catch (error) {
      console.error('Failed to restore legacy data:', error);
      return false;
    }
  }

  // Validation methods
  public validateMigration(): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    try {
      // Check if migration was completed
      const migrated = localStorage.getItem('preferences-migrated');
      if (migrated !== 'true') {
        issues.push('Migration not completed');
      }
      
      // Check if migrated preferences exist
      const settings = localStorage.getItem('customization-settings');
      if (!settings) {
        issues.push('Migrated settings not found');
      } else {
        try {
          JSON.parse(settings);
        } catch (e) {
          issues.push('Migrated settings are corrupted');
        }
      }
      
      // Check migration date
      const migrationDate = localStorage.getItem('migration-date');
      if (!migrationDate) {
        issues.push('Migration date not recorded');
      }
      
    } catch (error) {
      issues.push(`Validation error: ${error}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

export const compatibilityLayer = CompatibilityLayer.getInstance();
