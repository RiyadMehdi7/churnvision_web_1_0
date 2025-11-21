/**
 * Centralized Error Reporting Utility
 * Handles error collection, reporting, and analytics
 */

export interface ErrorReport {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  context?: string;
  level: 'error' | 'warning' | 'info';
  source: 'boundary' | 'manual' | 'promise' | 'network' | 'validation';
  metadata?: Record<string, any>;
  url: string;
  userAgent: string;
  userId?: string;
  sessionId?: string;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByLevel: Record<string, number>;
  errorsBySource: Record<string, number>;
  commonErrors: Array<{ message: string; count: number }>;
  recentErrors: ErrorReport[];
}

class ErrorReportingService {
  private reports: ErrorReport[] = [];
  private maxReports = 100;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.loadStoredReports();
    this.setupGlobalErrorHandlers();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadStoredReports(): void {
    try {
      const stored = localStorage.getItem('error_reports');
      if (stored) {
        const parsedReports = JSON.parse(stored);
        this.reports = Array.isArray(parsedReports) ? parsedReports : [];
        // Clean old reports (older than 7 days)
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        this.reports = this.reports.filter(report => 
          new Date(report.timestamp).getTime() > weekAgo
        );
      }
    } catch (error) {
      console.warn('Failed to load stored error reports:', error);
      this.reports = [];
    }
  }

  private saveReports(): void {
    try {
      localStorage.setItem('error_reports', JSON.stringify(this.reports.slice(-this.maxReports)));
    } catch (error) {
      console.warn('Failed to save error reports:', error);
    }
  }

  private setupGlobalErrorHandlers(): void {
    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
      this.report({
        message: event.message,
        stack: event.error?.stack,
        context: `${event.filename}:${event.lineno}:${event.colno}`,
        level: 'error',
        source: 'manual',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      this.report({
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        context: 'Unhandled Promise Rejection',
        level: 'error',
        source: 'promise',
        metadata: {
          reason: error,
        },
      });
    });
  }

  /**
   * Report an error to the centralized system
   */
  public report(params: Partial<ErrorReport> & { message: string }): string {
    const errorId = this.generateErrorId();
    
    const report: ErrorReport = {
      id: errorId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      level: 'error',
      source: 'manual',
      ...params,
    };

    // Add to local collection
    this.reports.push(report);

    // Keep only recent reports
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(-this.maxReports);
    }

    // Save to localStorage
    this.saveReports();

    // Send to Electron logger if available
    this.sendToBackend(report);

    // Log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error Report: ${report.id}`);
      console.error('Message:', report.message);
      console.error('Stack:', report.stack);
      console.error('Context:', report.context);
      console.error('Metadata:', report.metadata);
      console.groupEnd();
    }

    return errorId;
  }

  private sendToBackend(report: ErrorReport): void {
    try {
      // TODO: Implement backend error reporting endpoint
      // api.post('/logs/error', { errorReport: report });
      console.error('Error Report:', report);
    } catch (error) {
      console.warn('Failed to send error report:', error);
    }
  }

  /**
   * Report a network error with additional context
   */
  public reportNetworkError(
    url: string, 
    status: number, 
    statusText: string, 
    context?: string
  ): string {
    return this.report({
      message: `Network Error: ${status} ${statusText}`,
      context: context || `Request to ${url}`,
      level: 'error',
      source: 'network',
      metadata: {
        url,
        status,
        statusText,
        method: context?.includes('POST') ? 'POST' : 'GET', // Simple heuristic
      },
    });
  }

  /**
   * Report a validation error
   */
  public reportValidationError(field: string, value: any, rule: string): string {
    return this.report({
      message: `Validation Error: ${field} failed ${rule}`,
      context: `Field validation failure`,
      level: 'warning',
      source: 'validation',
      metadata: {
        field,
        value: typeof value === 'string' ? value.substring(0, 100) : value,
        rule,
      },
    });
  }

  /**
   * Get error statistics and analytics
   */
  public getStats(): ErrorStats {
    const totalErrors = this.reports.length;
    
    const errorsByLevel: Record<string, number> = {};
    const errorsBySource: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};

    this.reports.forEach(report => {
      // Count by level
      errorsByLevel[report.level] = (errorsByLevel[report.level] || 0) + 1;
      
      // Count by source
      errorsBySource[report.source] = (errorsBySource[report.source] || 0) + 1;
      
      // Count by message for common errors
      const key = report.message.substring(0, 100); // Truncate for grouping
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    const commonErrors = Object.entries(errorCounts)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentErrors = this.reports
      .slice(-10)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      totalErrors,
      errorsByLevel,
      errorsBySource,
      commonErrors,
      recentErrors,
    };
  }

  /**
   * Clear all error reports
   */
  public clearReports(): void {
    this.reports = [];
    this.saveReports();
  }

  /**
   * Export error reports for debugging
   */
  public exportReports(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      stats: this.getStats(),
      reports: this.reports,
    }, null, 2);
  }

  /**
   * Get reports filtered by criteria
   */
  public getReports(filters?: {
    level?: 'error' | 'warning' | 'info';
    source?: string;
    since?: Date;
    limit?: number;
  }): ErrorReport[] {
    let filtered = [...this.reports];

    if (filters?.level) {
      filtered = filtered.filter(report => report.level === filters.level);
    }

    if (filters?.source) {
      filtered = filtered.filter(report => report.source === filters.source);
    }

    if (filters?.since) {
      filtered = filtered.filter(report => 
        new Date(report.timestamp) >= filters.since!
      );
    }

    if (filters?.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

// Create singleton instance
export const errorReporter = new ErrorReportingService();

// Convenience functions for common use cases
export const reportError = (error: Error | string, context?: string, metadata?: Record<string, any>) => {
  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;
  
  return errorReporter.report({
    message,
    stack,
    context,
    level: 'error',
    source: 'manual',
    metadata,
  });
};

export const reportWarning = (message: string, context?: string, metadata?: Record<string, any>) => {
  return errorReporter.report({
    message,
    context,
    level: 'warning',
    source: 'manual',
    metadata,
  });
};

export const reportInfo = (message: string, context?: string, metadata?: Record<string, any>) => {
  return errorReporter.report({
    message,
    context,
    level: 'info',
    source: 'manual',
    metadata,
  });
};

// React hook for error reporting
export const useErrorReporting = () => {
  return {
    reportError,
    reportWarning,
    reportInfo,
    reportNetworkError: errorReporter.reportNetworkError.bind(errorReporter),
    reportValidationError: errorReporter.reportValidationError.bind(errorReporter),
    getStats: errorReporter.getStats.bind(errorReporter),
    clearReports: errorReporter.clearReports.bind(errorReporter),
    exportReports: errorReporter.exportReports.bind(errorReporter),
  };
};