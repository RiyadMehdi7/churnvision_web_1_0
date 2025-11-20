import { DashboardLayout, DashboardWidget } from '../types/dashboard';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';

export type WidgetType = 
  | 'risk-bar' 
  | 'distribution-chart' 
  | 'employee-table' 
  | 'ai-actions' 
  | 'insights' 
  | 'metrics' 
  | 'executive-risk-overview'
  | 'workforce-trends'
  | 'ai-strategic-insights'
  | 'enhanced-employee-table'
  | 'individual-risk-analysis'
  | 'ai-retention-planner'
  | 'custom';

export interface Permission {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

export interface LayoutConstraints {
  minWidgets: number;
  maxWidgets: number;
  gridSize: number;
  allowResize: boolean;
  allowMove: boolean;
  restrictedPositions?: { x: number; y: number; w: number; h: number }[];
}

export interface ModeConfig {
  id: CustomizationMode;
  name: string;
  description: string;
  defaultWidgets: WidgetType[];
  availableWidgets: WidgetType[];
  aiIntegrations: AIIntegrationType[];
  permissions: Permission[];
  layoutConstraints: LayoutConstraints;
  priority: number;
}

export type AIIntegrationType = 
  | 'workforce-trends'
  | 'exit-patterns'
  | 'risk-diagnosis'
  | 'retention-planning'
  | 'strategic-insights'
  | 'quick-actions';

export class RoleModeManager {
  private static instance: RoleModeManager;
  private modeConfigs: Map<CustomizationMode, ModeConfig>;
  private userPermissions: Set<string>;

  private constructor() {
    this.modeConfigs = new Map();
    this.userPermissions = new Set();
    this.initializeModeConfigs();
    this.loadUserPermissions();
  }

  public static getInstance(): RoleModeManager {
    if (!RoleModeManager.instance) {
      RoleModeManager.instance = new RoleModeManager();
    }
    return RoleModeManager.instance;
  }

  private initializeModeConfigs(): void {
    // C-Level Mode Configuration
    const cLevelConfig: ModeConfig = {
      id: 'c-level',
      name: 'Executive Dashboard',
      description: 'Strategic overview for C-level executives with organizational insights and high-level metrics',
      defaultWidgets: [
        'executive-risk-overview',
        'workforce-trends',
        'ai-strategic-insights',
        'ai-actions',
        'metrics'
      ],
      availableWidgets: [
        'executive-risk-overview',
        'workforce-trends',
        'ai-strategic-insights',
        'ai-actions',
        'metrics',
        'insights',
        'risk-bar',
        'distribution-chart'
      ],
      aiIntegrations: [
        'workforce-trends',
        'exit-patterns',
        'strategic-insights',
        'quick-actions'
      ],
      permissions: [
        {
          id: 'view-organizational-metrics',
          name: 'View Organizational Metrics',
          description: 'Access to company-wide metrics and trends',
          required: true
        },
        {
          id: 'access-strategic-insights',
          name: 'Access Strategic Insights',
          description: 'View AI-generated strategic recommendations',
          required: true
        },
        {
          id: 'customize-executive-dashboard',
          name: 'Customize Executive Dashboard',
          description: 'Ability to customize C-level dashboard layout',
          required: false
        }
      ],
      layoutConstraints: {
        minWidgets: 3,
        maxWidgets: 8,
        gridSize: 20,
        allowResize: true,
        allowMove: true
      },
      priority: 1
    };

    // D-Level Mode Configuration
    const dLevelConfig: ModeConfig = {
      id: 'd-level',
      name: 'Department Manager Dashboard',
      description: 'Detailed operational view for department managers with individual employee insights',
      defaultWidgets: [
        'enhanced-employee-table',
        'individual-risk-analysis',
        'ai-retention-planner',
        'ai-actions',
        'risk-bar'
      ],
      availableWidgets: [
        'enhanced-employee-table',
        'individual-risk-analysis',
        'ai-retention-planner',
        'ai-actions',
        'risk-bar',
        'distribution-chart',
        'metrics',
        'insights',
        'employee-table'
      ],
      aiIntegrations: [
        'risk-diagnosis',
        'retention-planning',
        'quick-actions'
      ],
      permissions: [
        {
          id: 'view-employee-details',
          name: 'View Employee Details',
          description: 'Access to individual employee information and risk assessments',
          required: true
        },
        {
          id: 'access-retention-tools',
          name: 'Access Retention Tools',
          description: 'Use AI-powered retention planning tools',
          required: true
        },
        {
          id: 'customize-manager-dashboard',
          name: 'Customize Manager Dashboard',
          description: 'Ability to customize D-level dashboard layout',
          required: false
        }
      ],
      layoutConstraints: {
        minWidgets: 2,
        maxWidgets: 12,
        gridSize: 20,
        allowResize: true,
        allowMove: true
      },
      priority: 2
    };

    this.modeConfigs.set('c-level', cLevelConfig);
    this.modeConfigs.set('d-level', dLevelConfig);
  }

  private loadUserPermissions(): void {
    try {
      const stored = localStorage.getItem('user-permissions');
      if (stored) {
        const permissions = JSON.parse(stored);
        this.userPermissions = new Set(permissions);
      } else {
        // Default permissions for demo purposes
        this.setDefaultPermissions();
      }
    } catch (error) {
      console.error('Failed to load user permissions:', error);
      this.setDefaultPermissions();
    }
  }

  private setDefaultPermissions(): void {
    // Grant all permissions by default for demo purposes
    const allPermissions = [
      'view-organizational-metrics',
      'access-strategic-insights',
      'customize-executive-dashboard',
      'view-employee-details',
      'access-retention-tools',
      'customize-manager-dashboard'
    ];
    
    this.userPermissions = new Set(allPermissions);
    this.saveUserPermissions();
  }

  private saveUserPermissions(): void {
    try {
      localStorage.setItem('user-permissions', JSON.stringify([...this.userPermissions]));
    } catch (error) {
      console.error('Failed to save user permissions:', error);
    }
  }

  public getModeConfig(mode: CustomizationMode): ModeConfig {
    const config = this.modeConfigs.get(mode);
    if (!config) {
      throw new Error(`Mode configuration not found for: ${mode}`);
    }
    return config;
  }

  public getAvailableWidgets(mode: CustomizationMode): WidgetType[] {
    const config = this.getModeConfig(mode);
    
    // Filter widgets based on user permissions
    return config.availableWidgets.filter(widget => {
      return this.hasWidgetPermission(widget, mode);
    });
  }

  public getDefaultLayout(mode: CustomizationMode): DashboardLayout {
    const config = this.getModeConfig(mode);
    const widgets: DashboardWidget[] = [];
    let yPosition = 0;

    config.defaultWidgets.forEach((widgetType, index) => {
      if (this.hasWidgetPermission(widgetType, mode)) {
        const widget = this.createDefaultWidget(widgetType, index, yPosition);
        widgets.push(widget);
        yPosition += widget.position.h;
      }
    });

    return {
      id: `default-${mode}-layout`,
      name: `Default ${config.name}`,
      widgets,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        description: `Default layout for ${config.name}`,
        category: mode,
        tags: ['default', mode]
      }
    };
  }

  private createDefaultWidget(type: WidgetType, index: number, yPosition: number): DashboardWidget {
    const baseWidget = {
      id: `widget-${type}-${index}`,
      type: type as any,
      title: this.getWidgetTitle(type),
      config: { showTitle: true, height: 200 }
    };

    // Define default positions and sizes for different widget types
    const widgetConfigs: Record<WidgetType, { w: number; h: number; x?: number }> = {
      'executive-risk-overview': { w: 12, h: 4 },
      'workforce-trends': { w: 6, h: 4 },
      'ai-strategic-insights': { w: 6, h: 4 },
      'enhanced-employee-table': { w: 12, h: 6 },
      'individual-risk-analysis': { w: 6, h: 4 },
      'ai-retention-planner': { w: 6, h: 4 },
      'ai-actions': { w: 4, h: 3 },
      'risk-bar': { w: 4, h: 3 },
      'distribution-chart': { w: 4, h: 3 },
      'employee-table': { w: 12, h: 5 },
      'insights': { w: 4, h: 3 },
      'metrics': { w: 4, h: 3 },
      'custom': { w: 4, h: 3 }
    };

    const config = widgetConfigs[type] || { w: 4, h: 3 };

    return {
      ...baseWidget,
      position: {
        x: config.x || 0,
        y: yPosition,
        w: config.w,
        h: config.h
      }
    };
  }

  private getWidgetTitle(type: WidgetType): string {
    const titles: Record<WidgetType, string> = {
      'executive-risk-overview': 'Executive Risk Overview',
      'workforce-trends': 'Workforce Trends',
      'ai-strategic-insights': 'AI Strategic Insights',
      'enhanced-employee-table': 'Employee Management',
      'individual-risk-analysis': 'Individual Risk Analysis',
      'ai-retention-planner': 'AI Retention Planner',
      'ai-actions': 'AI Quick Actions',
      'risk-bar': 'Risk Distribution',
      'distribution-chart': 'Risk Analysis',
      'employee-table': 'Employee Overview',
      'insights': 'AI Insights',
      'metrics': 'Key Metrics',
      'custom': 'Custom Widget'
    };

    return titles[type] || 'Widget';
  }

  public async switchMode(newMode: CustomizationMode): Promise<void> {
    if (!this.validateModeAccess(newMode)) {
      throw new Error(`Access denied for mode: ${newMode}`);
    }

    // Additional mode switching logic can be added here
    // For example, clearing caches, updating user preferences, etc.
    
    try {
      // Save mode preference
      localStorage.setItem('preferred-mode', newMode);
    } catch (error) {
      console.error('Failed to save mode preference:', error);
    }
  }

  public validateModeAccess(mode: CustomizationMode): boolean {
    const config = this.getModeConfig(mode);
    
    // Check if user has all required permissions for the mode
    const requiredPermissions = config.permissions.filter(p => p.required);
    
    return requiredPermissions.every(permission => 
      this.userPermissions.has(permission.id)
    );
  }

  private hasWidgetPermission(widget: WidgetType, _: CustomizationMode): boolean {
    // Define widget-specific permission requirements
    const widgetPermissions: Partial<Record<WidgetType, string[]>> = {
      'executive-risk-overview': ['view-organizational-metrics'],
      'workforce-trends': ['view-organizational-metrics'],
      'ai-strategic-insights': ['access-strategic-insights'],
      'enhanced-employee-table': ['view-employee-details'],
      'individual-risk-analysis': ['view-employee-details'],
      'ai-retention-planner': ['access-retention-tools'],
    };

    const requiredPermissions = widgetPermissions[widget] || [];
    
    return requiredPermissions.every(permission => 
      this.userPermissions.has(permission)
    );
  }

  public getAllModeConfigs(): ModeConfig[] {
    return Array.from(this.modeConfigs.values()).sort((a, b) => a.priority - b.priority);
  }

  public getUserPermissions(): string[] {
    return [...this.userPermissions];
  }

  public setUserPermissions(permissions: string[]): void {
    this.userPermissions = new Set(permissions);
    this.saveUserPermissions();
  }

  public hasPermission(permissionId: string): boolean {
    return this.userPermissions.has(permissionId);
  }

  public getAIIntegrations(mode: CustomizationMode): AIIntegrationType[] {
    const config = this.getModeConfig(mode);
    return config.aiIntegrations;
  }

  public getLayoutConstraints(mode: CustomizationMode): LayoutConstraints {
    const config = this.getModeConfig(mode);
    return config.layoutConstraints;
  }

  public validateLayout(layout: DashboardLayout, mode: CustomizationMode): { isValid: boolean; errors: string[] } {
    const constraints = this.getLayoutConstraints(mode);
    const errors: string[] = [];

    // Check widget count constraints
    if (layout.widgets.length < constraints.minWidgets) {
      errors.push(`Layout must have at least ${constraints.minWidgets} widgets`);
    }

    if (layout.widgets.length > constraints.maxWidgets) {
      errors.push(`Layout cannot have more than ${constraints.maxWidgets} widgets`);
    }

    // Check widget permissions
    const availableWidgets = this.getAvailableWidgets(mode);
    layout.widgets.forEach(widget => {
      if (!availableWidgets.includes(widget.type as WidgetType)) {
        errors.push(`Widget type '${widget.type}' is not available for ${mode} mode`);
      }
    });

    // Check restricted positions
    if (constraints.restrictedPositions) {
      layout.widgets.forEach(widget => {
        const isInRestrictedArea = constraints.restrictedPositions!.some(restricted => 
          this.isPositionOverlapping(widget.position, restricted)
        );
        
        if (isInRestrictedArea) {
          errors.push(`Widget '${widget.title}' is in a restricted position`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private isPositionOverlapping(
    pos1: { x: number; y: number; w: number; h: number },
    pos2: { x: number; y: number; w: number; h: number }
  ): boolean {
    return !(
      pos1.x + pos1.w <= pos2.x ||
      pos2.x + pos2.w <= pos1.x ||
      pos1.y + pos1.h <= pos2.y ||
      pos2.y + pos2.h <= pos1.y
    );
  }
}

export const roleModeManager = RoleModeManager.getInstance();