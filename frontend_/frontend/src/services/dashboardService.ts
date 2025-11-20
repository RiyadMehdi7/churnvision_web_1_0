import { DashboardLayout, DashboardTemplate, DashboardWidget, DashboardConfig } from '../types/dashboard';
import { Employee } from '../types/employee';
import { CustomizationMode } from '../contexts/HomeCustomizationContext';
import { roleModeManager } from './roleModeManager';
import { getCurrentThresholds } from '../config/riskThresholds';

export class DashboardService {
  private static instance: DashboardService;
  private layouts: DashboardLayout[] = [];
  private templates: DashboardTemplate[] = [];
  private config: DashboardConfig | null = null;

  private constructor() {}

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  // Initialize service with default templates and configurations
  public async initialize(isEnterprise: boolean = false): Promise<void> {
    this.config = await this.getDefaultConfig(isEnterprise);
    this.templates = await this.getDefaultTemplates(isEnterprise);
    this.layouts = await this.loadLayouts();
  }

  // Get default configuration based on license tier
  private async getDefaultConfig(isEnterprise: boolean): Promise<DashboardConfig> {
    return {
      gridSize: 20,
      maxWidgets: isEnterprise ? 50 : 10,
      allowCustomWidgets: isEnterprise,
      enableAutoGeneration: isEnterprise,
      layouts: [],
      templates: [],
      aiIntegration: {
        enabled: isEnterprise,
        quickActions: isEnterprise ? ['diagnose-risk', 'create-plan', 'analyze-trends', 'generate-report'] : ['diagnose-risk'],
        insights: isEnterprise
      }
    };
  }

  // Get default templates based on license tier
  private async getDefaultTemplates(isEnterprise: boolean): Promise<DashboardTemplate[]> {
    const baseTemplates: DashboardTemplate[] = [
      {
        id: 'executive-overview',
        name: 'Executive Overview',
        description: 'High-level metrics and key insights for executives',
        category: 'executive',
        enterpriseOnly: true,
        tags: ['executive', 'overview', 'metrics'],
        widgets: [
          {
            type: 'risk-bar',
            title: 'Risk Distribution',
            position: { x: 0, y: 0, w: 6, h: 4 },
            config: { showTitle: true, height: 200 }
          },
          {
            type: 'distribution-chart',
            title: 'Churn Risk Analysis',
            position: { x: 6, y: 0, w: 6, h: 4 },
            config: { showTitle: true, height: 200 }
          },
          {
            type: 'metrics',
            title: 'Key Metrics',
            position: { x: 0, y: 4, w: 4, h: 3 },
            config: { showTitle: true, height: 150 }
          },
          {
            type: 'ai-actions',
            title: 'AI Quick Actions',
            position: { x: 4, y: 4, w: 4, h: 3 },
            config: { showTitle: true, height: 150 }
          },
          {
            type: 'insights',
            title: 'AI Insights',
            position: { x: 8, y: 4, w: 4, h: 3 },
            config: { showTitle: true, height: 150 }
          }
        ],
        autoGeneration: {
          enabled: true,
          triggers: ['data-update', 'risk-change', 'new-employee'],
          rules: [
            {
              condition: 'high-risk-increase',
              action: 'add-widget',
              params: { type: 'insights', priority: 'high' }
            }
          ]
        }
      },
      {
        id: 'hr-dashboard',
        name: 'HR Dashboard',
        description: 'Comprehensive view for HR managers',
        category: 'hr',
        enterpriseOnly: true,
        tags: ['hr', 'management', 'employees'],
        widgets: [
          {
            type: 'employee-table',
            title: 'Employee Overview',
            position: { x: 0, y: 0, w: 12, h: 6 },
            config: { showTitle: true, height: 400 }
          },
          {
            type: 'risk-bar',
            title: 'Risk Levels',
            position: { x: 0, y: 6, w: 6, h: 3 },
            config: { showTitle: true, height: 150 }
          },
          {
            type: 'ai-actions',
            title: 'HR Actions',
            position: { x: 6, y: 6, w: 6, h: 3 },
            config: { showTitle: true, height: 150 }
          }
        ],
        autoGeneration: {
          enabled: true,
          triggers: ['employee-added', 'risk-change'],
          rules: []
        }
      },
      {
        id: 'analyst-workspace',
        name: 'Analyst Workspace',
        description: 'Detailed analytics and insights',
        category: 'analyst',
        enterpriseOnly: true,
        tags: ['analytics', 'insights', 'detailed'],
        widgets: [
          {
            type: 'distribution-chart',
            title: 'Risk Distribution',
            position: { x: 0, y: 0, w: 6, h: 4 },
            config: { showTitle: true, height: 200 }
          },
          {
            type: 'insights',
            title: 'AI Insights',
            position: { x: 6, y: 0, w: 6, h: 4 },
            config: { showTitle: true, height: 200 }
          },
          {
            type: 'employee-table',
            title: 'Detailed Employee Data',
            position: { x: 0, y: 4, w: 12, h: 5 },
            config: { showTitle: true, height: 300 }
          }
        ],
        autoGeneration: {
          enabled: true,
          triggers: ['data-analysis', 'pattern-detected'],
          rules: [
            {
              condition: 'pattern-detected',
              action: 'add-widget',
              params: { type: 'insights', focus: 'pattern' }
            }
          ]
        }
      }
    ];

    // Basic template for non-enterprise users
    const basicTemplate: DashboardTemplate = {
      id: 'basic-overview',
      name: 'Basic Overview',
      description: 'Simple overview dashboard',
      category: 'manager',
      enterpriseOnly: false,
      tags: ['basic', 'overview'],
      widgets: [
        {
          type: 'risk-bar',
          title: 'Risk Levels',
          position: { x: 0, y: 0, w: 6, h: 4 },
          config: { showTitle: true, height: 200 }
        },
        {
          type: 'employee-table',
          title: 'Employees',
          position: { x: 0, y: 4, w: 12, h: 5 },
          config: { showTitle: true, height: 300 }
        }
      ],
      autoGeneration: {
        enabled: false,
        triggers: [],
        rules: []
      }
    };

    return isEnterprise ? baseTemplates : [basicTemplate];
  }

  // Load layouts from storage
  private async loadLayouts(): Promise<DashboardLayout[]> {
    const stored = localStorage.getItem('dashboard-layouts');
    if (stored) {
      try {
        return JSON.parse(stored).map((layout: any) => ({
          ...layout,
          createdAt: new Date(layout.createdAt),
          updatedAt: new Date(layout.updatedAt)
        }));
      } catch (error) {
        // Error loading dashboard layouts - logged silently in production
      }
    }
    return [];
  }

  // Save layouts to storage
  private async saveLayouts(): Promise<void> {
    try {
      localStorage.setItem('dashboard-layouts', JSON.stringify(this.layouts));
    } catch (error) {
      // Error saving dashboard layouts - logged silently in production
    }
  }

  // Get available templates
  public getTemplates(enterpriseOnly: boolean = false): DashboardTemplate[] {
    return this.templates.filter(template => !enterpriseOnly || !template.enterpriseOnly);
  }

  // Get role-based templates
  public getRoleBasedTemplates(mode: CustomizationMode): DashboardTemplate[] {
    return this.templates.filter(template => 
      (mode === 'c-level' && template.category === 'executive') ||
      (mode === 'd-level' && template.category === 'manager')
    );
  }

  // Create role-based layout from mode configuration
  public async createRoleBasedLayout(mode: CustomizationMode, name?: string): Promise<DashboardLayout> {
    const defaultLayout = roleModeManager.getDefaultLayout(mode);
    const layoutName = name || `${roleModeManager.getModeConfig(mode).name} Layout`;
    
    const layout: DashboardLayout = {
      ...defaultLayout,
      id: `layout-${mode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: layoutName,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...defaultLayout.metadata,
        mode,
        roleGenerated: true
      }
    };

    this.layouts.push(layout);
    await this.saveLayouts();
    return layout;
  }

  // Get layouts filtered by mode
  public getLayoutsByMode(mode: CustomizationMode): DashboardLayout[] {
    return this.layouts.filter(layout => 
      layout.metadata?.mode === mode || 
      layout.metadata?.category === mode ||
      (mode === 'c-level' && layout.metadata?.category === 'executive') ||
      (mode === 'd-level' && layout.metadata?.category === 'manager')
    );
  }

  // Validate layout for specific mode
  public validateLayoutForMode(layout: DashboardLayout, mode: CustomizationMode): { isValid: boolean; errors: string[] } {
    return roleModeManager.validateLayout(layout, mode);
  }

  // Auto-generate role-specific layout
  public async autoGenerateRoleLayout(
    mode: CustomizationMode,
    employees: Employee[],
    aiInsights: any[]
  ): Promise<DashboardLayout> {
    const modeConfig = roleModeManager.getModeConfig(mode);
    const availableWidgets = roleModeManager.getAvailableWidgets(mode);
    const constraints = roleModeManager.getLayoutConstraints(mode);
    
    const widgets: DashboardWidget[] = [];
    let yPosition = 0;

    if (mode === 'c-level') {
      // C-Level specific auto-generation
      if (availableWidgets.includes('executive-risk-overview')) {
        widgets.push({
          id: `widget-exec-overview-${Date.now()}`,
          type: 'executive-risk-overview' as any,
          title: 'Executive Risk Overview',
          position: { x: 0, y: yPosition, w: 12, h: 4 },
          config: { showTitle: true, height: 250 }
        });
        yPosition += 4;
      }

      if (availableWidgets.includes('workforce-trends') && employees.length > 0) {
        widgets.push({
          id: `widget-workforce-trends-${Date.now()}`,
          type: 'workforce-trends' as any,
          title: 'Workforce Trends',
          position: { x: 0, y: yPosition, w: 6, h: 4 },
          config: { showTitle: true, height: 200 }
        });
      }

      if (availableWidgets.includes('ai-strategic-insights') && aiInsights.length > 0) {
        widgets.push({
          id: `widget-strategic-insights-${Date.now()}`,
          type: 'ai-strategic-insights' as any,
          title: 'AI Strategic Insights',
          position: { x: 6, y: yPosition, w: 6, h: 4 },
          config: { showTitle: true, height: 200 },
          data: aiInsights.filter(insight => 
            ['workforce-trends', 'exit-patterns', 'strategic-insights'].includes(insight.type)
          ).slice(0, 3)
        });
      }

    } else if (mode === 'd-level') {
      // D-Level specific auto-generation
      if (availableWidgets.includes('enhanced-employee-table')) {
        widgets.push({
          id: `widget-enhanced-table-${Date.now()}`,
          type: 'enhanced-employee-table' as any,
          title: 'Employee Management',
          position: { x: 0, y: yPosition, w: 12, h: 6 },
          config: { showTitle: true, height: 400 }
        });
        yPosition += 6;
      }

      const thresholds = getCurrentThresholds();
      const highRiskEmployees = employees.filter(emp => emp.churnProbability > thresholds.highRisk);
      if (availableWidgets.includes('individual-risk-analysis') && highRiskEmployees.length > 0) {
        widgets.push({
          id: `widget-risk-analysis-${Date.now()}`,
          type: 'individual-risk-analysis' as any,
          title: 'Individual Risk Analysis',
          position: { x: 0, y: yPosition, w: 6, h: 4 },
          config: { showTitle: true, height: 200 },
          data: { focusEmployees: highRiskEmployees.slice(0, 5) }
        });
      }

      if (availableWidgets.includes('ai-retention-planner')) {
        widgets.push({
          id: `widget-retention-planner-${Date.now()}`,
          type: 'ai-retention-planner' as any,
          title: 'AI Retention Planner',
          position: { x: 6, y: yPosition, w: 6, h: 4 },
          config: { showTitle: true, height: 200 }
        });
      }
    }

    // Add common widgets if space allows
    yPosition += 4;
    if (widgets.length < constraints.maxWidgets && availableWidgets.includes('ai-actions')) {
      widgets.push({
        id: `widget-ai-actions-${Date.now()}`,
        type: 'ai-actions',
        title: 'AI Quick Actions',
        position: { x: 0, y: yPosition, w: 6, h: 3 },
        config: { showTitle: true, height: 150 },
        aiAction: {
          type: mode === 'c-level' ? 'analyze-trends' : 'diagnose-risk',
          params: { mode }
        }
      });
    }

    if (widgets.length < constraints.maxWidgets && availableWidgets.includes('metrics')) {
      widgets.push({
        id: `widget-metrics-${Date.now()}`,
        type: 'metrics',
        title: 'Key Metrics',
        position: { x: 6, y: yPosition, w: 6, h: 3 },
        config: { showTitle: true, height: 150 }
      });
    }

    const layout: DashboardLayout = {
      id: `auto-${mode}-layout-${Date.now()}`,
      name: `Auto-Generated ${modeConfig.name} (${new Date().toLocaleDateString()})`,
      widgets,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      autoGenerated: true,
      metadata: {
        description: `Auto-generated ${mode} layout based on current data patterns`,
        category: mode,
        mode,
        tags: ['auto-generated', 'role-based', mode],
        roleGenerated: true
      }
    };

    this.layouts.push(layout);
    await this.saveLayouts();
    return layout;
  }

  // Get layouts
  public getLayouts(): DashboardLayout[] {
    return this.layouts;
  }

  // Create layout from template
  public async createLayoutFromTemplate(templateId: string, name: string): Promise<DashboardLayout> {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const layout: DashboardLayout = {
      id: `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      widgets: template.widgets.map((widget, index) => ({
        ...widget,
        id: `widget-${Date.now()}-${index}`
      })),
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      templateId: template.id,
      autoGenerated: false,
      metadata: {
        description: `Created from ${template.name} template`,
        category: template.category,
        tags: template.tags
      }
    };

    this.layouts.push(layout);
    await this.saveLayouts();
    return layout;
  }

  // Auto-generate layout based on data patterns
  public async autoGenerateLayout(
    employees: Employee[],
    aiInsights: any[]
  ): Promise<DashboardLayout> {
    const widgets: DashboardWidget[] = [];
    let yPosition = 0;

    // Always include risk distribution
    widgets.push({
      id: `widget-risk-bar-${Date.now()}`,
      type: 'risk-bar',
      title: 'Risk Distribution',
      position: { x: 0, y: yPosition, w: 6, h: 4 },
      config: { showTitle: true, height: 200 }
    });

    // Add distribution chart
    widgets.push({
      id: `widget-dist-chart-${Date.now()}`,
      type: 'distribution-chart',
      title: 'Churn Risk Analysis',
      position: { x: 6, y: yPosition, w: 6, h: 4 },
      config: { showTitle: true, height: 200 }
    });

    yPosition += 4;

    // Add AI actions if high-risk employees detected
    const thresholds = getCurrentThresholds();
    const highRiskEmployees = employees.filter(emp => emp.churnProbability > thresholds.highRisk);
    if (highRiskEmployees.length > 0) {
      widgets.push({
        id: `widget-ai-actions-${Date.now()}`,
        type: 'ai-actions',
        title: 'AI Quick Actions',
        position: { x: 0, y: yPosition, w: 4, h: 3 },
        config: { showTitle: true, height: 150 },
        aiAction: {
          type: 'diagnose-risk',
          params: { focusEmployees: highRiskEmployees.slice(0, 5) }
        }
      });
    }

    // Add metrics widget
    widgets.push({
      id: `widget-metrics-${Date.now()}`,
      type: 'metrics',
      title: 'Key Metrics',
      position: { x: 4, y: yPosition, w: 4, h: 3 },
      config: { showTitle: true, height: 150 }
    });

    // Add insights if available
    if (aiInsights.length > 0) {
      widgets.push({
        id: `widget-insights-${Date.now()}`,
        type: 'insights',
        title: 'AI Insights',
        position: { x: 8, y: yPosition, w: 4, h: 3 },
        config: { showTitle: true, height: 150 },
        data: aiInsights.slice(0, 5)
      });
    }

    yPosition += 3;

    // Add employee table
    widgets.push({
      id: `widget-employee-table-${Date.now()}`,
      type: 'employee-table',
      title: 'Employee Overview',
      position: { x: 0, y: yPosition, w: 12, h: 6 },
      config: { showTitle: true, height: 400 }
    });

    const layout: DashboardLayout = {
      id: `auto-layout-${Date.now()}`,
      name: `Auto-Generated Dashboard (${new Date().toLocaleDateString()})`,
      widgets,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      autoGenerated: true,
      metadata: {
        description: 'Auto-generated based on current data patterns',
        category: 'custom',
        tags: ['auto-generated', 'personalized']
      }
    };

    this.layouts.push(layout);
    await this.saveLayouts();
    return layout;
  }

  // Update layout
  public async updateLayout(layoutId: string, updates: Partial<DashboardLayout>): Promise<DashboardLayout> {
    const index = this.layouts.findIndex(l => l.id === layoutId);
    if (index === -1) {
      throw new Error('Layout not found');
    }

    this.layouts[index] = {
      ...this.layouts[index],
      ...updates,
      updatedAt: new Date()
    };

    await this.saveLayouts();
    return this.layouts[index];
  }

  // Delete layout
  public async deleteLayout(layoutId: string): Promise<void> {
    const index = this.layouts.findIndex(l => l.id === layoutId);
    if (index === -1) {
      throw new Error('Layout not found');
    }

    this.layouts.splice(index, 1);
    await this.saveLayouts();
  }

  // Apply auto-generation rules
  public async applyAutoGenerationRules(
    layoutId: string,
    context: any
  ): Promise<DashboardLayout | null> {
    const layout = this.layouts.find(l => l.id === layoutId);
    if (!layout) return null;

    const template = this.templates.find(t => t.id === layout.templateId);
    if (!template || !template.autoGeneration.enabled) return null;

    const applicableRules = template.autoGeneration.rules.filter(rule => {
      // Simple condition evaluation - in real implementation, use more sophisticated logic
      return context[rule.condition] === true;
    });

    if (applicableRules.length === 0) return null;

    let modified = false;
    for (const rule of applicableRules) {
      switch (rule.action) {
        case 'add-widget':
          if (rule.params.type && layout.widgets.length < (this.config?.maxWidgets || 10)) {
            const newWidget: DashboardWidget = {
              id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: rule.params.type,
              title: rule.params.title || 'New Widget',
              position: this.findNextAvailablePosition(layout.widgets),
              config: { showTitle: true, height: 150 }
            };
            layout.widgets.push(newWidget);
            modified = true;
          }
          break;
        case 'modify-widget':
          // Find and modify existing widget
          const widget = layout.widgets.find(w => w.type === rule.params.targetType);
          if (widget && rule.params.updates) {
            Object.assign(widget, rule.params.updates);
            modified = true;
          }
          break;
      }
    }

    if (modified) {
      return await this.updateLayout(layoutId, { widgets: layout.widgets });
    }

    return null;
  }

  // Find next available position for a widget
  private findNextAvailablePosition(widgets: DashboardWidget[]): { x: number; y: number; w: number; h: number } {
    const occupiedPositions = widgets.map(w => w.position);
    const maxY = Math.max(...occupiedPositions.map(p => p.y + p.h), 0);
    
    return { x: 0, y: maxY, w: 4, h: 3 };
  }

  // Get configuration
  public getConfig(): DashboardConfig | null {
    return this.config;
  }

  // Check if user has access to enterprise features
  public hasEnterpriseAccess(): boolean {
    // This would integrate with the license provider
    return true; // Demo mode - always enterprise
  }
}

export const dashboardService = DashboardService.getInstance();