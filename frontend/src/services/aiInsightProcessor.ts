import { AIInsight } from './aiIntegrationManager';
import { Employee } from '../types/employee';

export interface ProcessedInsight extends AIInsight {
  relevanceScore: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  displayFormat: 'card' | 'alert' | 'chart' | 'list';
  visualData?: any;
  formattedSummary: string;
  keyMetrics: KeyMetric[];
}

export interface KeyMetric {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
  icon?: string;
}

export interface InsightFilter {
  types?: string[];
  priorities?: string[];
  minRelevance?: number;
  maxAge?: number; // hours
  employeeIds?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
}

class AIInsightProcessor {
  private static instance: AIInsightProcessor;
  private readonly RELEVANCE_WEIGHTS = {
    recency: 0.3,
    confidence: 0.25,
    priority: 0.2,
    employeeCount: 0.15,
    actionability: 0.1
  };

  private constructor() {}

  public static getInstance(): AIInsightProcessor {
    if (!AIInsightProcessor.instance) {
      AIInsightProcessor.instance = new AIInsightProcessor();
    }
    return AIInsightProcessor.instance;
  }

  // Main processing methods
  public processInsight(insight: AIInsight, employees: Employee[]): ProcessedInsight {
    const relevanceScore = this.calculateRelevanceScore(insight, employees);
    const urgencyLevel = this.determineUrgencyLevel(insight, relevanceScore);
    const displayFormat = this.determineDisplayFormat(insight);
    const keyMetrics = this.extractKeyMetrics(insight);
    const formattedSummary = this.formatSummary(insight);
    const visualData = this.prepareVisualizationData(insight);

    return {
      ...insight,
      relevanceScore,
      urgencyLevel,
      displayFormat,
      keyMetrics,
      formattedSummary,
      visualData
    };
  }

  public processBatchInsights(insights: AIInsight[], employees: Employee[]): ProcessedInsight[] {
    return insights
      .map(insight => this.processInsight(insight, employees))
      .sort((a, b) => this.compareInsights(a, b));
  }

  public filterInsights(insights: ProcessedInsight[], filter: InsightFilter): ProcessedInsight[] {
    return insights.filter(insight => {
      // Type filter
      if (filter.types && !filter.types.includes(insight.type)) {
        return false;
      }

      // Priority filter
      if (filter.priorities && !filter.priorities.includes(insight.priority)) {
        return false;
      }

      // Relevance filter
      if (filter.minRelevance && insight.relevanceScore < filter.minRelevance) {
        return false;
      }

      // Age filter
      if (filter.maxAge) {
        const ageHours = (Date.now() - insight.timestamp.getTime()) / (1000 * 60 * 60);
        if (ageHours > filter.maxAge) {
          return false;
        }
      }

      // Employee filter
      if (filter.employeeIds && insight.relevantEmployees) {
        const hasRelevantEmployee = insight.relevantEmployees.some(empId => 
          filter.employeeIds!.includes(empId)
        );
        if (!hasRelevantEmployee) {
          return false;
        }
      }

      return true;
    });
  }

  // Relevance scoring
  private calculateRelevanceScore(insight: AIInsight, employees: Employee[]): number {
    let score = 0;

    // Recency score (newer = higher)
    const ageHours = (Date.now() - insight.timestamp.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - (ageHours / 24)); // Decay over 24 hours
    score += recencyScore * this.RELEVANCE_WEIGHTS.recency;

    // Confidence score
    score += insight.confidence * this.RELEVANCE_WEIGHTS.confidence;

    // Priority score
    const priorityScore = insight.priority === 'high' ? 1 : insight.priority === 'medium' ? 0.6 : 0.3;
    score += priorityScore * this.RELEVANCE_WEIGHTS.priority;

    // Employee count score (more employees = higher relevance)
    if (insight.relevantEmployees) {
      const employeeRatio = Math.min(1, insight.relevantEmployees.length / employees.length);
      score += employeeRatio * this.RELEVANCE_WEIGHTS.employeeCount;
    }

    // Actionability score (insights with action items are more relevant)
    const actionabilityScore = insight.actionItems && insight.actionItems.length > 0 ? 1 : 0.5;
    score += actionabilityScore * this.RELEVANCE_WEIGHTS.actionability;

    return Math.min(1, Math.max(0, score));
  }

  private determineUrgencyLevel(insight: AIInsight, relevanceScore: number): 'critical' | 'high' | 'medium' | 'low' {
    // Critical: High priority + high relevance + immediate action items
    if (insight.priority === 'high' && relevanceScore > 0.8) {
      const hasImmediateActions = insight.actionItems?.some(action => action.type === 'immediate');
      if (hasImmediateActions) return 'critical';
    }

    // High: High priority or high relevance
    if (insight.priority === 'high' || relevanceScore > 0.7) {
      return 'high';
    }

    // Medium: Medium priority or medium relevance
    if (insight.priority === 'medium' || relevanceScore > 0.4) {
      return 'medium';
    }

    return 'low';
  }

  private determineDisplayFormat(insight: AIInsight): 'card' | 'alert' | 'chart' | 'list' {
    switch (insight.type) {
      case 'workforce-trends':
        return 'chart';
      case 'exit-patterns':
        return 'alert';
      case 'risk-diagnosis':
        return 'card';
      case 'retention-plan':
        return 'list';
      case 'strategic-insights':
        return 'card';
      default:
        return 'card';
    }
  }

  // Data extraction and formatting
  private extractKeyMetrics(insight: AIInsight): KeyMetric[] {
    const metrics: KeyMetric[] = [];

    switch (insight.type) {
      case 'workforce-trends':
        if (insight.data?.totalEmployees) {
          metrics.push({
            label: 'Total Employees',
            value: insight.data.totalEmployees,
            color: 'blue',
            icon: 'users'
          });
        }
        if (insight.data?.highRiskCount !== undefined) {
          metrics.push({
            label: 'High Risk',
            value: insight.data.highRiskCount,
            color: 'red',
            icon: 'alert-triangle'
          });
        }
        if (insight.data?.averageRisk !== undefined) {
          metrics.push({
            label: 'Avg Risk',
            value: `${(insight.data.averageRisk * 100).toFixed(1)}%`,
            trend: insight.data.trendDirection === 'increasing' ? 'up' : 'stable',
            color: insight.data.averageRisk > 0.5 ? 'red' : 'green',
            icon: 'trending-up'
          });
        }
        break;

      case 'risk-diagnosis':
        if (insight.data?.employee?.churnProbability !== undefined) {
          metrics.push({
            label: 'Churn Risk',
            value: `${(insight.data.employee.churnProbability * 100).toFixed(1)}%`,
            color: insight.data.employee.churnProbability > 0.7 ? 'red' : 'orange',
            icon: 'target'
          });
        }
        if (insight.confidence) {
          metrics.push({
            label: 'Confidence',
            value: `${(insight.confidence * 100).toFixed(0)}%`,
            color: insight.confidence > 0.8 ? 'green' : 'yellow',
            icon: 'shield'
          });
        }
        break;

      case 'retention-plan':
        if (insight.data?.successProbability !== undefined) {
          metrics.push({
            label: 'Success Rate',
            value: `${insight.data.successProbability.toFixed(0)}%`,
            color: insight.data.successProbability > 70 ? 'green' : 'orange',
            icon: 'target'
          });
        }
        break;
    }

    return metrics;
  }

  private formatSummary(insight: AIInsight): string {
    let formatted = insight.summary;

    // Add urgency indicators
    if (insight.priority === 'high') {
      formatted = `🚨 ${formatted}`;
    }

    // Add confidence indicator
    if (insight.confidence > 0.9) {
      formatted += ' (High Confidence)';
    } else if (insight.confidence < 0.6) {
      formatted += ' (Low Confidence)';
    }

    // Truncate if too long
    if (formatted.length > 150) {
      formatted = formatted.substring(0, 147) + '...';
    }

    return formatted;
  }

  private prepareVisualizationData(insight: AIInsight): any {
    switch (insight.type) {
      case 'workforce-trends':
        return this.prepareWorkforceTrendsViz(insight);
      case 'exit-patterns':
        return this.prepareExitPatternsViz(insight);
      case 'risk-diagnosis':
        return this.prepareRiskDiagnosisViz(insight);
      default:
        return null;
    }
  }

  private prepareWorkforceTrendsViz(insight: AIInsight): any {
    if (!insight.data?.departmentBreakdown) return null;

    const departments = Object.entries(insight.data.departmentBreakdown).map(([name, data]: [string, any]) => ({
      name,
      riskLevel: data.avgRisk,
      employeeCount: data.totalEmployees,
      highRiskCount: data.highRiskCount
    }));

    return {
      type: 'bar',
      data: departments,
      xAxis: 'name',
      yAxis: 'riskLevel',
      colorBy: 'riskLevel'
    };
  }

  private prepareExitPatternsViz(insight: AIInsight): any {
    if (!insight.data?.criticalPatterns) return null;

    return {
      type: 'alert-list',
      items: insight.data.criticalPatterns.map((pattern: string, index: number) => ({
        id: index,
        message: pattern,
        severity: 'high'
      }))
    };
  }

  private prepareRiskDiagnosisViz(insight: AIInsight): any {
    if (!insight.data?.riskFactors) return null;

    return {
      type: 'horizontal-bar',
      data: insight.data.riskFactors.map((factor: any) => ({
        name: factor.feature,
        value: factor.importance * 100,
        color: factor.importance > 0.2 ? 'red' : factor.importance > 0.1 ? 'orange' : 'yellow'
      }))
    };
  }

  // Validation
  public validateInsight(insight: AIInsight): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let confidence = 1.0;

    // Required fields validation
    if (!insight.id) errors.push('Missing insight ID');
    if (!insight.type) errors.push('Missing insight type');
    if (!insight.title) errors.push('Missing insight title');
    if (!insight.summary) errors.push('Missing insight summary');

    // Data validation
    if (insight.confidence < 0 || insight.confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }

    if (insight.confidence < 0.5) {
      warnings.push('Low confidence insight');
      confidence *= 0.8;
    }

    // Timestamp validation
    const now = Date.now();
    const insightTime = insight.timestamp.getTime();
    if (insightTime > now) {
      warnings.push('Future timestamp detected');
      confidence *= 0.9;
    }

    if (now - insightTime > 24 * 60 * 60 * 1000) {
      warnings.push('Insight is over 24 hours old');
      confidence *= 0.7;
    }

    // Action items validation
    if (insight.actionItems) {
      insight.actionItems.forEach((action, index) => {
        if (!action.title) errors.push(`Action item ${index + 1} missing title`);
        if (!action.description) warnings.push(`Action item ${index + 1} missing description`);
        if (action.estimatedImpact < 0 || action.estimatedImpact > 1) {
          errors.push(`Action item ${index + 1} has invalid impact value`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      confidence: Math.max(0, confidence)
    };
  }

  // Utility methods
  private compareInsights(a: ProcessedInsight, b: ProcessedInsight): number {
    // Sort by urgency first
    const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const urgencyDiff = urgencyOrder[b.urgencyLevel] - urgencyOrder[a.urgencyLevel];
    if (urgencyDiff !== 0) return urgencyDiff;

    // Then by relevance score
    const relevanceDiff = b.relevanceScore - a.relevanceScore;
    if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff;

    // Finally by timestamp (newer first)
    return b.timestamp.getTime() - a.timestamp.getTime();
  }

  public formatForWidget(insight: ProcessedInsight, widgetType: string): any {
    const base = {
      id: insight.id,
      title: insight.title,
      summary: insight.formattedSummary,
      urgency: insight.urgencyLevel,
      relevance: insight.relevanceScore,
      metrics: insight.keyMetrics,
      timestamp: insight.timestamp
    };

    switch (widgetType) {
      case 'executive-dashboard':
        return {
          ...base,
          strategicImpact: this.calculateStrategicImpact(insight),
          recommendedActions: insight.actionItems?.slice(0, 3) || []
        };

      case 'manager-dashboard':
        return {
          ...base,
          affectedEmployees: insight.relevantEmployees?.length || 0,
          actionItems: insight.actionItems || [],
          visualData: insight.visualData
        };

      case 'alert-panel':
        return {
          ...base,
          severity: insight.urgencyLevel,
          dismissible: insight.urgencyLevel !== 'critical',
          autoExpire: insight.urgencyLevel === 'low'
        };

      default:
        return base;
    }
  }

  private calculateStrategicImpact(insight: ProcessedInsight): 'high' | 'medium' | 'low' {
    const factors = [
      insight.relevanceScore > 0.8 ? 1 : 0,
      insight.urgencyLevel === 'critical' ? 1 : 0,
      (insight.relevantEmployees?.length || 0) > 10 ? 1 : 0,
      insight.actionItems && insight.actionItems.length > 2 ? 1 : 0
    ];

    const score = factors.reduce((sum, factor) => sum + factor, 0);
    
    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  public aggregateInsights(insights: ProcessedInsight[]): any {
    const summary = {
      total: insights.length,
      byUrgency: { critical: 0, high: 0, medium: 0, low: 0 },
      byType: {} as Record<string, number>,
      avgRelevance: 0,
      totalActionItems: 0,
      affectedEmployees: new Set<string>()
    };

    insights.forEach(insight => {
      summary.byUrgency[insight.urgencyLevel]++;
      summary.byType[insight.type] = (summary.byType[insight.type] || 0) + 1;
      summary.totalActionItems += insight.actionItems?.length || 0;
      
      if (insight.relevantEmployees) {
        insight.relevantEmployees.forEach(empId => summary.affectedEmployees.add(empId));
      }
    });

    summary.avgRelevance = insights.length > 0 
      ? insights.reduce((sum, insight) => sum + insight.relevanceScore, 0) / insights.length 
      : 0;

    return {
      ...summary,
      affectedEmployees: summary.affectedEmployees.size
    };
  }
}

export const aiInsightProcessor = AIInsightProcessor.getInstance();