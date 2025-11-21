import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  level?: 'page' | 'component' | 'critical';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // Log error details
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error Info:', errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send error to logging service
    this.logError(error, errorInfo);
  }

  private logError = (error: Error, errorInfo: ErrorInfo) => {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        level: this.props.level || 'component',
        retryCount: this.retryCount,
      };

      // Log to console
      console.error('Error Boundary Log:', errorData);

      // TODO: Send to backend logging endpoint if needed
      // await api.post('/logs/error', errorData);

      // Store error in localStorage for debugging
      const storedErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      storedErrors.push(errorData);
      // Keep only last 50 errors
      if (storedErrors.length > 50) {
        storedErrors.splice(0, storedErrors.length - 50);
      }
      localStorage.setItem('app_errors', JSON.stringify(storedErrors));
      
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  };

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
      });
    } else {
      // Max retries reached, redirect to home or show different message
      window.location.href = '/';
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private copyErrorDetails = () => {
    const errorText = [
      `Error ID: ${this.state.errorId}`,
      `Message: ${this.state.error?.message}`,
      `Stack: ${this.state.error?.stack}`,
      `Component Stack: ${this.state.errorInfo?.componentStack}`,
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
    ].join('\\n\\n');

    navigator.clipboard.writeText(errorText).then(() => {
      // Could show a toast here if toast context is available
      console.log('Error details copied to clipboard');
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { level = 'component' } = this.props;
      const canRetry = this.retryCount < this.maxRetries;
      const errorMessage = this.state.error?.message || 'An unexpected error occurred';

      // Critical level errors get full page treatment
      if (level === 'critical' || level === 'page') {
        return (
          <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
            <Card className="w-full max-w-2xl border-red-200 dark:border-red-800">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-red-900 dark:text-red-100">
                  {level === 'critical' ? 'Critical Application Error' : 'Page Error'}
                </CardTitle>
                <CardDescription className="text-red-700 dark:text-red-300">
                  {level === 'critical' 
                    ? 'A critical error has occurred that prevents the application from continuing.' 
                    : 'An error occurred while loading this page.'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200 font-mono">
                    {errorMessage}
                  </p>
                  {this.state.errorId && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      Error ID: {this.state.errorId}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {canRetry && (
                    <Button onClick={this.handleRetry} variant="outline" className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Try Again ({this.maxRetries - this.retryCount} left)
                    </Button>
                  )}
                  <Button onClick={this.handleReload} variant="outline" className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Reload Page
                  </Button>
                  <Button onClick={this.handleGoHome} className="flex items-center gap-2">
                    <Home className="w-4 h-4" />
                    Go Home
                  </Button>
                </div>

                {this.props.showDetails && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-red-700 dark:text-red-300 font-medium mb-2 flex items-center gap-2">
                      <Bug className="w-4 h-4" />
                      Technical Details
                    </summary>
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg font-mono text-xs overflow-auto max-h-40">
                      <p><strong>Error:</strong> {this.state.error?.message}</p>
                      <p><strong>Stack:</strong></p>
                      <pre className="whitespace-pre-wrap">{this.state.error?.stack}</pre>
                      {this.state.errorInfo?.componentStack && (
                        <>
                          <p><strong>Component Stack:</strong></p>
                          <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                        </>
                      )}
                    </div>
                    <Button
                      onClick={this.copyErrorDetails}
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Copy Error Details
                    </Button>
                  </details>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }

      // Component level errors get smaller inline treatment
      return (
        <div className="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                Component Error
              </h3>
              <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                {errorMessage}
              </p>
              <div className="flex gap-2">
                {canRetry && (
                  <Button 
                    onClick={this.handleRetry} 
                    size="sm" 
                    variant="outline"
                    className="text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
                {this.state.errorId && (
                  <span className="text-xs text-red-600 dark:text-red-400 self-center">
                    ID: {this.state.errorId}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Convenience HOC for wrapping components
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Hook for manual error reporting
export const useErrorHandler = () => {
  return (error: Error, context?: string) => {
    console.error(`Manual error report${context ? ` (${context})` : ''}:`, error);

    // Log error data
    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };

    // TODO: Send to backend logging endpoint if needed
    // api.post('/logs/error', errorData);
  };
};