/**
 * Client-side logging utility for ChurnVision frontend
 * Provides structured logging that can be controlled by environment
 *
 * This is the canonical logger for the frontend.
 *
 * API:
 *   logger.info(message, data?)           - Log with 'General' context
 *   logger.ui.info(message, data?)        - Log with 'UI' context
 *   logger.project.info(message, data?)   - Log with 'Project' context
 *   appLogger.info(message, data?)        - Alias for logger with 'App' context
 *   uiLogger.info(message, data?)         - Alias for logger with 'UI' context
 */

// Use Vite's import.meta.env for environment detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// Helper function to format log messages consistently
const formatMessage = (level: string, context: string | undefined, message: string, data?: any): string => {
  if (!isDevelopment) return message;

  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}] ` : '';
  let dataStr = '';
  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        dataStr = ` | Error: ${data.name} - ${data.message}`;
      } else {
        dataStr = ` | Data: ${typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)}`;
      }
    } catch {
      dataStr = ' | Data: [Unserializable]';
    }
  }
  return `[${timestamp}] ${level.toUpperCase()}: ${contextStr}${message}${dataStr}`;
};

// Create namespaced logger factory
const createNamespacedLogger = (context: string) => ({
  debug: (message: string, data?: any): void => {
    if (isProduction) return;
    console.debug(formatMessage('debug', context, message, data));
  },
  info: (message: string, data?: any): void => {
    if (isDevelopment) {
      console.info(formatMessage('info', context, message, data));
    }
  },
  warn: (message: string, data?: any): void => {
    console.warn(formatMessage('warn', context, message, data));
  },
  error: (message: string, data?: any): void => {
    console.error(formatMessage('error', context, message, data));
  },
});

// Main logger with backwards-compatible API: logger.info(message, data?)
export const logger = {
  debug: (message: string, data?: any, context?: string): void => {
    if (isProduction) return;
    console.debug(formatMessage('debug', context, message, data));
  },

  info: (message: string, data?: any, context?: string): void => {
    if (isDevelopment) {
      console.info(formatMessage('info', context, message, data));
    }
  },

  warn: (message: string, data?: any, context?: string): void => {
    console.warn(formatMessage('warn', context, message, data));
  },

  error: (message: string, data?: any, context?: string): void => {
    console.error(formatMessage('error', context, message, data));
  },

  // Namespaced loggers for specific contexts
  router: createNamespacedLogger('Router'),
  serviceWorker: createNamespacedLogger('ServiceWorker'),
  project: createNamespacedLogger('Project'),
  cache: createNamespacedLogger('Cache'),
  ui: createNamespacedLogger('UI'),
  app: createNamespacedLogger('App'),
};

// Compatibility aliases matching the old logger.ts exports
export const appLogger = {
  info: (message: string, data?: any) => logger.info(message, data, 'App'),
  warn: (message: string, data?: any) => logger.warn(message, data, 'App'),
  error: (message: string, data?: any) => logger.error(message, data, 'App'),
  debug: (message: string, data?: any) => logger.debug(message, data, 'App'),
};

export const uiLogger = {
  info: (message: string, data?: any) => logger.info(message, data, 'UI'),
  warn: (message: string, data?: any) => logger.warn(message, data, 'UI'),
  error: (message: string, data?: any) => logger.error(message, data, 'UI'),
  debug: (message: string, data?: any) => logger.debug(message, data, 'UI'),
};

export default logger;
