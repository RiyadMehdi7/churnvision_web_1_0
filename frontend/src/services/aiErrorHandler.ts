import { aiCacheManager } from './aiCacheManager';
import { AIInsight } from './aiIntegrationManager';
import { Employee } from '../types/employee';
import { getCurrentThresholds } from '../config/riskThresholds';

export interface ErrorContext {
  service: 'reasoning' | 'ai-assistant' | 'integration-manager' | 'cache';
  operation: string;
  timestamp: Date;
  userAgent?: string;
  userId?: string;
  additionalData?: any;
}

export interface FallbackData {
  type: 'cached' | 'synthetic' | 'historical' | 'default';
  data: any;
  confidence: number;
  limitations: string[];
  timestamp: Date;
}

export interface ErrorNotification {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  actions?: NotificationAction[];
  autoHide?: boolean;
  duration?: number;
}

export interface NotificationAction {
  label: string;
  action: () => void;
  style: 'primary' | 'secondary' | 'danger';
}

class AIErrorHandler {
  private static instance: AIErrorHandler;
  private errorLog: Array<{ error: Error; context: ErrorContext }> = [];
  private notificationCallbacks: Array<(notification: ErrorNotification) => void> = [];
  private retryAttempts = new Map<string, number>();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_BASE = 1000; // 1 second

  private constructor() {}

  public static getInstance(): AIErrorHandler {
    if (!AIErrorHandler.instance) {
      AIErrorHandler.instance = new AIErrorHandler();
    }
    return AIErrorHandler.instance;
  }

  // Error handling methods
  public async handleError<T>(
    error: Error,
    context: ErrorContext,
    fallbackStrategy?: () => Promise<FallbackData | null>
  ): Promise<T | FallbackData | null> {
    this.logError(error, context);

    // Determine if retry is appropriate
    if (this.shouldRetry(error, context)) {
      try {
        return await this.retryOperation(context);
      } catch (retryError) {
        // If retry fails, continue to fallback
      }
    }

    // Try fallback strategy
    if (fallbackStrategy) {
      try {
        const fallbackData = await fallbackStrategy();
        if (fallbackData) {
          this.notifyUser({
            id: `fallback-${Date.now()}`,
            type: 'warning',
            title: 'Using Cached Data',
            message: 'AI service temporarily unavailable. Showing cached results.',
            autoHide: true,
            duration: 5000
          });
          return fallbackData;
        }
      } catch (fallbackError) {
        console.warn('Fallback strategy failed:', fallbackError);
      }
    }

    // Use built-in fallback strategies
    const builtInFallback = await this.getBuiltInFallback(context);
    if (builtInFallback) {
      return builtInFallback;
    }

    // Final error notification
    this.notifyUser(this.createErrorNotification(error, context));
    return null;
  }

  private shouldRetry(error: Error, context: ErrorContext): boolean {
    const retryKey = `${context.service}-${context.operation}`;
    const attempts = this.retryAttempts.get(retryKey) || 0;

    if (attempts >= this.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    // Retry for network errors, timeouts, and 5xx server errors
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'AbortError',
      'TypeError' // Often network-related
    ];

    const isRetryableError = retryableErrors.some(type => 
      error.name === type || error.message.includes(type)
    );

    const isServerError = error.message.includes('5') && error.message.includes('Error');

    return isRetryableError || isServerError;
  }

  private async retryOperation<T>(context: ErrorContext): Promise<T> {
    const retryKey = `${context.service}-${context.operation}`;
    const attempts = this.retryAttempts.get(retryKey) || 0;
    
    this.retryAttempts.set(retryKey, attempts + 1);

    // Exponential backoff
    const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempts);
    await new Promise(resolve => setTimeout(resolve, delay));

    // This would need to be implemented by the calling service
    throw new Error('Retry mechanism requires service-specific implementation');
  }

  // Fallback strategies
  private async getBuiltInFallback(context: ErrorContext): Promise<FallbackData | null> {
    switch (context.service) {
      case 'reasoning':
        return this.getReasoningFallback(context);
      case 'ai-assistant':
        return this.getAIAssistantFallback(context);
      case 'integration-manager':
        return this.getIntegrationManagerFallback(context);
      default:
        return this.getGenericFallback(context);
    }
  }

  private async getReasoningFallback(context: ErrorContext): Promise<FallbackData | null> {
    // Try to get cached reasoning data
    if (context.additionalData?.hrCode) {
      const cached = aiCacheManager.getEmployeeAnalysis(context.additionalData.hrCode);
      if (cached) {
        return {
          type: 'cached',
          data: cached,
          confidence: 0.7,
          limitations: ['Data may be outdated', 'Real-time analysis unavailable'],
          timestamp: new Date()
        };
      }
    }

    // Generate synthetic reasoning data based on employee info
    if (context.additionalData?.employee) {
      return this.generateSyntheticReasoning(context.additionalData.employee);
    }

    return null;
  }

  private async getAIAssistantFallback(context: ErrorContext): Promise<FallbackData | null> {
    // Try cached insights
    const cachedInsights = this.getCachedInsights(context);
    if (cachedInsights.length > 0) {
      return {
        type: 'cached',
        data: cachedInsights,
        confidence: 0.6,
        limitations: ['Insights may be outdated', 'New analysis unavailable'],
        timestamp: new Date()
      };
    }

    // Generate basic insights from employee data
    if (context.additionalData?.employees) {
      return this.generateBasicInsights(context.additionalData.employees);
    }

    return null;
  }

  private async getIntegrationManagerFallback(context: ErrorContext): Promise<FallbackData | null> {
    // Return basic statistical analysis
    if (context.additionalData?.employees) {
      return this.generateStatisticalFallback(context.additionalData.employees);
    }

    return null;
  }

  private async getGenericFallback(_: ErrorContext): Promise<FallbackData | null> {
    return {
      type: 'default',
      data: {
        message: 'Service temporarily unavailable',
        suggestion: 'Please try again later or contact support if the issue persists'
      },
      confidence: 0.0,
      limitations: ['No data available', 'Service offline'],
      timestamp: new Date()
    };
  }

  // Synthetic data generation
  private generateSyntheticReasoning(employee: Employee): FallbackData {
    const churnProb = employee.churnProbability || 0.5;
    const stage = this.inferStageFromTenure(employee.tenure);
    
    return {
      type: 'synthetic',
      data: {
        hr_code: employee.hr_code,
        churn_risk: churnProb,
        stage,
        confidence_level: 0.5,
        reasoning: `Basic risk assessment based on available employee data. Churn probability: ${(churnProb * 100).toFixed(1)}%`,
        recommendations: this.generateBasicRecommendations(employee),
        ml_contributors: this.generateBasicContributors(employee),
        heuristic_alerts: []
      },
      confidence: 0.5,
      limitations: ['Simplified analysis', 'No real-time ML processing', 'Limited reasoning depth'],
      timestamp: new Date()
    };
  }

  private generateBasicInsights(employees: Employee[]): FallbackData {
    const totalEmployees = employees.length;
    const thresholds = getCurrentThresholds();
    const highRiskCount = employees.filter(emp => emp.churnProbability > thresholds.highRisk).length;
    const avgRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / totalEmployees;

    const insights: AIInsight[] = [{
      id: `fallback-insight-${Date.now()}`,
      type: 'workforce-trends',
      title: 'Basic Workforce Analysis',
      summary: `${highRiskCount} high-risk employees detected from ${totalEmployees} total employees`,
      data: {
        totalEmployees,
        highRiskCount,
        averageRisk: avgRisk,
        analysis: 'basic-statistical'
      },
      confidence: 0.4,
      timestamp: new Date(),
      priority: highRiskCount > totalEmployees * 0.2 ? 'high' : 'medium'
    }];

    return {
      type: 'synthetic',
      data: insights,
      confidence: 0.4,
      limitations: ['Basic statistical analysis only', 'No AI-powered insights', 'Limited recommendations'],
      timestamp: new Date()
    };
  }

  private generateStatisticalFallback(employees: Employee[]): FallbackData {
    const thresholds = getCurrentThresholds();
    const stats = {
      totalEmployees: employees.length,
      averageRisk: employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length,
      riskDistribution: {
        high: employees.filter(emp => emp.churnProbability > thresholds.highRisk).length,
        medium: employees.filter(emp => emp.churnProbability > thresholds.mediumRisk && emp.churnProbability <= thresholds.highRisk).length,
        low: employees.filter(emp => emp.churnProbability <= thresholds.mediumRisk).length
      },
      departmentBreakdown: this.calculateDepartmentStats(employees)
    };

    return {
      type: 'synthetic',
      data: stats,
      confidence: 0.6,
      limitations: ['Statistical analysis only', 'No predictive modeling', 'Basic calculations'],
      timestamp: new Date()
    };
  }

  // Helper methods
  private inferStageFromTenure(tenure: number): string {
    if (tenure < 0.5) return 'New Hire';
    if (tenure < 2) return 'Early Career';
    if (tenure < 5) return 'Established';
    return 'Veteran';
  }

  private generateBasicRecommendations(employee: Employee): string {
    const thresholds = getCurrentThresholds();
    const recommendations = [];

    if (employee.churnProbability > thresholds.highRisk) {
      recommendations.push('Schedule immediate one-on-one meeting');
      recommendations.push('Review compensation and benefits');
    }
    
    if (employee.tenure < 1) {
      recommendations.push('Enhance onboarding support');
      recommendations.push('Assign mentor or buddy');
    }
    
    if (parseFloat(employee.performance) < 3.5) {
      recommendations.push('Provide additional training and support');
    }

    return recommendations.join('. ') + '.';
  }

  private generateBasicContributors(employee: Employee): any[] {
    const contributors = [];
    
    if (employee.tenure < 1) {
      contributors.push({ feature: 'tenure', value: employee.tenure, importance: 0.3 });
    }
    
    if (employee.engagementScore < 3.5) {
      contributors.push({ feature: 'engagement', value: employee.engagementScore, importance: 0.25 });
    }
    
    const perfScore = parseFloat(employee.performance);
    if (perfScore < 3.5) {
      contributors.push({ feature: 'performance', value: perfScore, importance: 0.2 });
    }

    return contributors;
  }

  private calculateDepartmentStats(employees: Employee[]): Record<string, any> {
    const thresholds = getCurrentThresholds();
    const deptMap = new Map<string, Employee[]>();

    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unknown';
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(emp);
    });

    const result: Record<string, any> = {};
    deptMap.forEach((emps, dept) => {
      result[dept] = {
        totalEmployees: emps.length,
        avgRisk: emps.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / emps.length,
        highRiskCount: emps.filter(emp => emp.churnProbability > thresholds.highRisk).length
      };
    });

    return result;
  }

  private getCachedInsights(_: ErrorContext): AIInsight[] {
    // This would integrate with the cache manager to retrieve cached insights
    // For now, return empty array
    return [];
  }

  // Error logging and notifications
  private logError(error: Error, context: ErrorContext): void {
    this.errorLog.push({ error, context });
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('AI Service Error:', error, context);
    }
  }

  private createErrorNotification(_: Error, context: ErrorContext): ErrorNotification {
    const baseNotification = {
      id: `error-${Date.now()}`,
      type: 'error' as const,
      autoHide: false
    };

    switch (context.service) {
      case 'reasoning':
        return {
          ...baseNotification,
          title: 'Analysis Unavailable',
          message: 'Unable to generate employee risk analysis. Using basic assessment.',
          actions: [{
            label: 'Retry',
            action: () => window.location.reload(),
            style: 'primary' as const
          }]
        };

      case 'ai-assistant':
        return {
          ...baseNotification,
          title: 'AI Assistant Offline',
          message: 'AI insights are temporarily unavailable. Showing cached data where possible.',
          actions: [{
            label: 'Refresh',
            action: () => window.location.reload(),
            style: 'secondary' as const
          }]
        };

      default:
        return {
          ...baseNotification,
          title: 'Service Error',
          message: 'A service is temporarily unavailable. Some features may be limited.',
          autoHide: true,
          duration: 8000
        };
    }
  }

  // Notification system
  public onNotification(callback: (notification: ErrorNotification) => void): () => void {
    this.notificationCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.notificationCallbacks.indexOf(callback);
      if (index > -1) {
        this.notificationCallbacks.splice(index, 1);
      }
    };
  }

  private notifyUser(notification: ErrorNotification): void {
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        console.error('Error in notification callback:', error);
      }
    });
  }

  // Status and monitoring
  public getServiceStatus(): Record<string, 'online' | 'degraded' | 'offline'> {
    // This would integrate with actual service health checks
    return {
      reasoning: 'online',
      'ai-assistant': 'online',
      'integration-manager': 'online',
      cache: 'online'
    };
  }

  public getErrorStats(): any {
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
    const recentErrors = this.errorLog.filter(entry => 
      entry.context.timestamp.getTime() > last24Hours
    );

    const errorsByService = recentErrors.reduce((acc, entry) => {
      acc[entry.context.service] = (acc[entry.context.service] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: recentErrors.length,
      errorsByService,
      lastError: this.errorLog[this.errorLog.length - 1]?.context.timestamp || null
    };
  }

  public clearErrorLog(): void {
    this.errorLog = [];
    this.retryAttempts.clear();
  }
}

export const aiErrorHandler = AIErrorHandler.getInstance();