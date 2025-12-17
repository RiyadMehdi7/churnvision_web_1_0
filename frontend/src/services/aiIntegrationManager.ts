import { Employee } from '../types/employee';
import { ChurnReasoning } from '../types/reasoning';
import reasoningService from './reasoningService';
import { getCurrentThresholds } from '../config/riskThresholds';
import { aiCacheManager } from './aiCacheManager';

export interface AIInsight {
  id: string;
  type: 'workforce-trends' | 'exit-patterns' | 'risk-diagnosis' | 'retention-plan' | 'strategic-insights';
  title: string;
  summary: string;
  data: any;
  confidence: number;
  timestamp: Date;
  relevantEmployees?: string[];
  actionItems?: ActionItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  type: 'immediate' | 'short-term' | 'long-term';
  estimatedImpact: number;
  dueDate?: Date;
}

export interface AIAnalysisRequest {
  type: 'workforce-analysis' | 'individual-diagnosis' | 'retention-planning' | 'trend-analysis';
  employees?: Employee[];
  hrCodes?: string[];
  parameters?: Record<string, any>;
}

// CacheEntry is now managed by aiCacheManager - no longer needed here

class AIIntegrationManager {
  private static instance: AIIntegrationManager;
  private readonly DEFAULT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  private constructor() {}

  public static getInstance(): AIIntegrationManager {
    if (!AIIntegrationManager.instance) {
      AIIntegrationManager.instance = new AIIntegrationManager();
    }
    return AIIntegrationManager.instance;
  }

  // Main AI analysis methods
  public async generateWorkforceTrends(employees: Employee[]): Promise<AIInsight> {
    const cacheKey = `workforce-trends-${employees.length}-${Date.now().toString().slice(0, -5)}`;
    const cached = this.getFromCache<AIInsight>(cacheKey);
    if (cached) return cached;

    try {
      const thresholds = getCurrentThresholds();
      const highRiskCount = employees.filter(emp => emp.churnProbability > thresholds.highRisk).length;
      const avgRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length;
      
      const insight: AIInsight = {
        id: `workforce-trends-${Date.now()}`,
        type: 'workforce-trends',
        title: 'Workforce Risk Trends',
        summary: `${highRiskCount} high-risk employees detected. Average risk: ${(avgRisk * 100).toFixed(1)}%`,
        data: {
          totalEmployees: employees.length,
          highRiskCount,
          mediumRiskCount: employees.filter(emp => emp.churnProbability >= thresholds.mediumRisk && emp.churnProbability < thresholds.highRisk).length,
          lowRiskCount: employees.filter(emp => emp.churnProbability < thresholds.mediumRisk).length,
          averageRisk: avgRisk,
          trendDirection: avgRisk > thresholds.mediumRisk ? 'increasing' : 'stable',
          departmentBreakdown: this.analyzeDepartmentRisks(employees)
        },
        confidence: 0.85,
        timestamp: new Date(),
        priority: highRiskCount > employees.length * 0.2 ? 'high' : 'medium',
        actionItems: this.generateWorkforceActionItems(employees, highRiskCount, avgRisk)
      };

      this.setCache(cacheKey, insight);
      return insight;
    } catch (error) {
      console.error('Error generating workforce trends:', error);
      throw new Error('Failed to generate workforce trends analysis');
    }
  }

  public async generateIndividualDiagnosis(employee: Employee): Promise<AIInsight> {
    const cacheKey = `individual-diagnosis-${employee.hr_code}`;
    const cached = this.getFromCache<AIInsight>(cacheKey);
    if (cached) return cached;

    try {
      const thresholds = getCurrentThresholds();
      const reasoning = await reasoningService.getEmployeeReasoning(employee.hr_code);

      const insight: AIInsight = {
        id: `individual-diagnosis-${employee.hr_code}-${Date.now()}`,
        type: 'risk-diagnosis',
        title: `Risk Analysis: ${employee.full_name}`,
        summary: `${(employee.churnProbability * 100).toFixed(1)}% churn risk${reasoning ? ` with ${(reasoning.confidence_level * 100).toFixed(0)}% confidence` : ''}`,
        data: {
          employee,
          reasoning,
          riskFactors: reasoning?.ml_contributors?.slice(0, 5) || [],
          businessRuleAlerts: reasoning?.heuristic_alerts || [],
          stage: reasoning?.stage || 'Unknown',
          recommendations: this.parseRecommendations(reasoning?.recommendations || '')
        },
        confidence: reasoning?.confidence_level || 0.7,
        timestamp: new Date(),
        relevantEmployees: [employee.hr_code],
        priority: employee.churnProbability > thresholds.highRisk ? 'high' : employee.churnProbability > thresholds.mediumRisk ? 'medium' : 'low',
        actionItems: this.generateIndividualActionItems(employee, reasoning)
      };

      this.setCache(cacheKey, insight);
      return insight;
    } catch (error) {
      console.error('Error generating individual diagnosis:', error);
      throw new Error('Failed to generate individual risk diagnosis');
    }
  }

  public async generateRetentionPlan(employee: Employee): Promise<AIInsight> {
    const cacheKey = `retention-plan-${employee.hr_code}`;
    const cached = this.getFromCache<AIInsight>(cacheKey);
    if (cached) return cached;

    try {
      const thresholds = getCurrentThresholds();
      const reasoning = await reasoningService.getEmployeeReasoning(employee.hr_code);
      const riskLevel = employee.churnProbability > thresholds.highRisk ? 'high' : employee.churnProbability > thresholds.mediumRisk ? 'medium' : 'low';

      const insight: AIInsight = {
        id: `retention-plan-${employee.hr_code}-${Date.now()}`,
        type: 'retention-plan',
        title: `Retention Plan: ${employee.full_name}`,
        summary: `${riskLevel.toUpperCase()} priority retention plan with ${this.calculateSuccessProbability(employee, reasoning)}% success probability`,
        data: {
          employee,
          riskLevel,
          successProbability: this.calculateSuccessProbability(employee, reasoning),
          timeline: this.generateTimeline(employee, reasoning),
          interventions: this.generateInterventions(employee, reasoning),
          milestones: this.generateMilestones(employee, reasoning)
        },
        confidence: reasoning?.confidence_level || 0.7,
        timestamp: new Date(),
        relevantEmployees: [employee.hr_code],
        priority: riskLevel === 'high' ? 'high' : 'medium',
        actionItems: this.generateRetentionActionItems(employee, reasoning)
      };

      this.setCache(cacheKey, insight);
      return insight;
    } catch (error) {
      console.error('Error generating retention plan:', error);
      throw new Error('Failed to generate retention plan');
    }
  }

  public async generateStrategicInsights(employees: Employee[]): Promise<AIInsight[]> {
    const cacheKey = `strategic-insights-${employees.length}`;
    const cached = this.getFromCache<AIInsight[]>(cacheKey);
    if (cached) return cached;

    try {
      const insights: AIInsight[] = [];
      
      // Exit pattern analysis
      const exitPatterns = this.analyzeExitPatterns(employees);
      if (exitPatterns.criticalPatterns.length > 0) {
        insights.push({
          id: `exit-patterns-${Date.now()}`,
          type: 'exit-patterns',
          title: 'Critical Exit Patterns Detected',
          summary: `${exitPatterns.criticalPatterns.length} concerning patterns identified`,
          data: exitPatterns,
          confidence: 0.8,
          timestamp: new Date(),
          priority: 'high',
          actionItems: this.generateExitPatternActions(exitPatterns)
        });
      }

      // Department risk analysis
      const deptRisks = this.analyzeDepartmentRisks(employees);
      const thresholds = getCurrentThresholds();
      const criticalDepts = Object.entries(deptRisks).filter(([_, risk]) => risk.avgRisk > thresholds.highRisk);
      if (criticalDepts.length > 0) {
        insights.push({
          id: `dept-risks-${Date.now()}`,
          type: 'strategic-insights',
          title: 'Department Risk Alert',
          summary: `${criticalDepts.length} departments showing elevated risk`,
          data: { departmentRisks: deptRisks, criticalDepartments: criticalDepts },
          confidence: 0.75,
          timestamp: new Date(),
          priority: 'high',
          actionItems: this.generateDepartmentActions(criticalDepts)
        });
      }

      this.setCache(cacheKey, insights, 10 * 60 * 1000); // 10 min cache
      return insights;
    } catch (error) {
      console.error('Error generating strategic insights:', error);
      throw new Error('Failed to generate strategic insights');
    }
  }

  // Cache management - delegates to aiCacheManager
  private getFromCache<T>(key: string): T | null {
    return aiCacheManager.get<T>(key);
  }

  private setCache<T>(key: string, data: T, ttl: number = this.DEFAULT_CACHE_TTL): void {
    // Determine priority based on content type
    const priority = key.includes('individual') || key.includes('retention') ? 'high' : 'medium';
    aiCacheManager.set(key, data, ttl, priority);
  }

  public clearCache(pattern?: string): void {
    if (pattern) {
      aiCacheManager.invalidatePattern(pattern);
    } else {
      aiCacheManager.invalidatePattern('workforce-trends');
      aiCacheManager.invalidatePattern('individual-diagnosis');
      aiCacheManager.invalidatePattern('retention-plan');
      aiCacheManager.invalidatePattern('strategic-insights');
    }
  }

  // Helper methods
  private analyzeDepartmentRisks(employees: Employee[]) {
    const deptMap = new Map<string, Employee[]>();
    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unknown';
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(emp);
    });

    const result: Record<string, any> = {};
    deptMap.forEach((emps, dept) => {
      const avgRisk = emps.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / emps.length;
      const thresholds = getCurrentThresholds();
      const highRiskCount = emps.filter(emp => emp.churnProbability > thresholds.highRisk).length;
      
      result[dept] = {
        totalEmployees: emps.length,
        avgRisk,
        highRiskCount,
        riskLevel: avgRisk > thresholds.highRisk ? 'high' : avgRisk > thresholds.mediumRisk ? 'medium' : 'low'
      };
    });

    return result;
  }

  private analyzeExitPatterns(employees: Employee[]) {
    const thresholds = getCurrentThresholds();
    const patterns = {
      criticalPatterns: [] as string[],
      tenureRisks: [] as string[],
      performanceCorrelations: [] as string[]
    };

    // Analyze tenure patterns
    const newHires = employees.filter(emp => emp.tenure < 1);
    const newHireRisk = newHires.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / newHires.length;
    if (newHireRisk > thresholds.highRisk) {
      patterns.criticalPatterns.push('High new hire churn risk detected');
      patterns.tenureRisks.push(`${newHires.length} new hires at ${(newHireRisk * 100).toFixed(1)}% avg risk`);
    }

    // Analyze performance correlations
    const highPerformers = employees.filter(emp => parseFloat(emp.performance) > 4.0);
    const highPerfRisk = highPerformers.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / highPerformers.length;
    if (highPerfRisk > thresholds.mediumRisk) {
      patterns.criticalPatterns.push('High performers showing elevated churn risk');
      patterns.performanceCorrelations.push(`${highPerformers.length} high performers at risk`);
    }

    return patterns;
  }

  private generateWorkforceActionItems(employees: Employee[], highRiskCount: number, avgRisk: number): ActionItem[] {
    const actions: ActionItem[] = [];

    if (highRiskCount > employees.length * 0.15) {
      actions.push({
        id: 'urgent-review',
        title: 'Urgent High-Risk Employee Review',
        description: 'Conduct immediate review of all high-risk employees',
        type: 'immediate',
        estimatedImpact: 0.8,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      });
    }

    if (avgRisk > 0.5) {
      actions.push({
        id: 'org-intervention',
        title: 'Organization-wide Retention Initiative',
        description: 'Launch comprehensive retention program',
        type: 'short-term',
        estimatedImpact: 0.6,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      });
    }

    return actions;
  }

  private generateIndividualActionItems(employee: Employee, reasoning: ChurnReasoning | null): ActionItem[] {
    const actions: ActionItem[] = [];

    const thresholds = getCurrentThresholds();
    if (employee.churnProbability > thresholds.highRisk) {
      actions.push({
        id: 'immediate-meeting',
        title: 'Schedule Immediate 1:1 Meeting',
        description: 'Urgent discussion about concerns and career goals',
        type: 'immediate',
        estimatedImpact: 0.7,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      });
    }

    if (reasoning?.ml_contributors?.some(c => c.feature.includes('engagement'))) {
      actions.push({
        id: 'engagement-plan',
        title: 'Create Engagement Improvement Plan',
        description: 'Address engagement concerns identified by AI',
        type: 'short-term',
        estimatedImpact: 0.6,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    }

    return actions;
  }

  private generateRetentionActionItems(_: Employee, __: ChurnReasoning | null): ActionItem[] {
    return [
      {
        id: 'retention-plan',
        title: 'Implement Personalized Retention Plan',
        description: 'Execute AI-generated retention strategy',
        type: 'short-term',
        estimatedImpact: 0.75,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    ];
  }

  private generateExitPatternActions(_: any): ActionItem[] {
    return [
      {
        id: 'pattern-analysis',
        title: 'Deep Dive Pattern Analysis',
        description: 'Investigate root causes of exit patterns',
        type: 'short-term',
        estimatedImpact: 0.7,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      }
    ];
  }

  private generateDepartmentActions(_: any[]): ActionItem[] {
    return [
      {
        id: 'dept-intervention',
        title: 'Department-Level Intervention',
        description: 'Address systemic issues in high-risk departments',
        type: 'short-term',
        estimatedImpact: 0.8,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ];
  }

  private parseRecommendations(recommendations: string): string[] {
    return recommendations.split('.').filter(r => r.trim().length > 10).slice(0, 3);
  }

  private calculateSuccessProbability(employee: Employee, reasoning: ChurnReasoning | null): number {
    const baseSuccess = 0.6;
    const confidenceBonus = (reasoning?.confidence_level || 0.7) * 0.2;
    const riskPenalty = (employee.churnProbability || 0.5) * 0.3;
    return Math.max(0.3, Math.min(0.9, baseSuccess + confidenceBonus - riskPenalty)) * 100;
  }

  private generateTimeline(_: Employee, __: ChurnReasoning | null): any {
    return {
      immediate: '0-7 days',
      shortTerm: '1-4 weeks',
      longTerm: '1-3 months'
    };
  }

  private generateInterventions(_: Employee, __: ChurnReasoning | null): any[] {
    return [
      { type: 'meeting', priority: 'high', description: 'Manager 1:1 discussion' },
      { type: 'development', priority: 'medium', description: 'Career development planning' },
      { type: 'recognition', priority: 'medium', description: 'Achievement recognition' }
    ];
  }

  private generateMilestones(_: Employee, __: ChurnReasoning | null): any[] {
    return [
      { week: 1, goal: 'Initial intervention completed' },
      { week: 4, goal: 'Progress assessment' },
      { week: 12, goal: 'Final evaluation' }
    ];
  }
}

export const aiIntegrationManager = AIIntegrationManager.getInstance();