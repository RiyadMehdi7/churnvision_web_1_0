// Logger utilities for the frontend application

// Types for Electron API
interface ElectronApi {
  logger: {
    debug: (message: string, data?: any, context?: string) => Promise<void>;
    info: (message: string, data?: any, context?: string) => Promise<void>;
    warn: (message: string, data?: any, context?: string) => Promise<void>;
    error: (message: string, data?: any, context?: string) => Promise<void>;
  };
}

// Check if the Electron API is available on the window object
const electronApi = (window as any).electronApi as ElectronApi | undefined;
// Check only for the specific logger API we need
const loggerApiAvailable = electronApi && typeof electronApi.logger === 'object';

// Performance-optimized logging detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// Helper function to format log messages consistently (only in development)
const formatMessage = (level: string, context: string | undefined, message: string, data?: any): string => {
    if (!isDevelopment) return message; // Skip formatting in production
    
    const contextStr = context ? `[${context}] ` : '';
    // Simplified data formatting to reduce performance impact
    let dataStr = '';
    if (data !== undefined) {
        try {
            if (data instanceof Error) {
                dataStr = ` | Error: ${data.name} - ${data.message}`;
            } else {
                 dataStr = ` | Data: ${typeof data === 'object' ? '[Object]' : String(data)}`; // Simplified formatting
            }
        } catch (e) {
            dataStr = ' | Data: [Unserializable]';
        }
    }
    return `${level.toUpperCase()}: ${contextStr}${message}${dataStr}`;
};

// Export logger functions
export const logger = {
    debug: (message: string, data?: any, context?: string): void => {
        // Skip debug logs in production completely
        if (isProduction) return;
        
        if (loggerApiAvailable && electronApi) { // Check both flags
            electronApi.logger.debug(message, data, context).catch(() => {
                // Silent fallback - don't log errors about logging
            });
        } else if (isDevelopment) {
            console.debug(formatMessage('debug', context, message, data)); // Only in development
        }
    },
    info: (message: string, data?: any, context?: string): void => {
        if (loggerApiAvailable && electronApi) { // Check both flags
            electronApi.logger.info(message, data, context).catch(() => {
                // Silent fallback - don't log errors about logging
            });
        } else if (isDevelopment) {
            console.info(formatMessage('info', context, message, data)); // Only in development
        }
    },
    warn: (message: string, data?: any, context?: string): void => {
        if (loggerApiAvailable && electronApi) { // Check both flags
            electronApi.logger.warn(message, data, context).catch(() => {
                // Silent fallback - don't log errors about logging
            });
        } else if (isDevelopment) {
            console.warn(formatMessage('warn', context, message, data)); // Only in development
        }
    },
    error: (message: string, data?: any, context?: string): void => {
        if (loggerApiAvailable && electronApi) { // Check both flags
            electronApi.logger.error(message, data, context).catch(() => {
                // Silent fallback - don't log errors about logging
            });
        } else if (isDevelopment) {
            // Log error object properly if data is an Error
            if (data instanceof Error) {
                 console.error(formatMessage('error', context, message), data); // Log error object separately
            } else {
                console.error(formatMessage('error', context, message, data));
            }
        }
    },
    // Production-safe logging methods
    production: {
        info: (message: string, data?: any, context?: string): void => {
            if (loggerApiAvailable && electronApi) {
                electronApi.logger.info(message, data, context).catch(() => {
                    // Silent fallback
                });
            }
        },
        warn: (message: string, data?: any, context?: string): void => {
            if (loggerApiAvailable && electronApi) {
                electronApi.logger.warn(message, data, context).catch(() => {
                    // Silent fallback
                });
            }
        },
        error: (message: string, data?: any, context?: string): void => {
            if (loggerApiAvailable && electronApi) {
                electronApi.logger.error(message, data, context).catch(() => {
                    // Silent fallback
                });
            }
        }
    }
};

// Create named logger wrappers that pass the context
export const appLogger = {
    debug: (message: string, data?: any) => logger.debug(message, data, 'app'),
    info: (message: string, data?: any) => logger.info(message, data, 'app'),
    warn: (message: string, data?: any) => logger.warn(message, data, 'app'),
    error: (message: string, data?: any) => logger.error(message, data, 'app'),
    production: {
        info: (message: string, data?: any) => logger.production.info(message, data, 'app'),
        warn: (message: string, data?: any) => logger.production.warn(message, data, 'app'),
        error: (message: string, data?: any) => logger.production.error(message, data, 'app'),
    }
};

export const apiLogger = {
    debug: (message: string, data?: any) => logger.debug(message, data, 'api'),
    info: (message: string, data?: any) => logger.info(message, data, 'api'),
    warn: (message: string, data?: any) => logger.warn(message, data, 'api'),
    error: (message: string, data?: any) => logger.error(message, data, 'api'),
    production: {
        info: (message: string, data?: any) => logger.production.info(message, data, 'api'),
        warn: (message: string, data?: any) => logger.production.warn(message, data, 'api'),
        error: (message: string, data?: any) => logger.production.error(message, data, 'api'),
    }
};

export const storeLogger = {
    debug: (message: string, data?: any) => logger.debug(message, data, 'store'),
    info: (message: string, data?: any) => logger.info(message, data, 'store'),
    warn: (message: string, data?: any) => logger.warn(message, data, 'store'),
    error: (message: string, data?: any) => logger.error(message, data, 'store'),
    production: {
        info: (message: string, data?: any) => logger.production.info(message, data, 'store'),
        warn: (message: string, data?: any) => logger.production.warn(message, data, 'store'),
        error: (message: string, data?: any) => logger.production.error(message, data, 'store'),
    }
};

export const uiLogger = {
    debug: (message: string, data?: any) => logger.debug(message, data, 'ui'),
    info: (message: string, data?: any) => logger.info(message, data, 'ui'),
    warn: (message: string, data?: any) => logger.warn(message, data, 'ui'),
    error: (message: string, data?: any) => logger.error(message, data, 'ui'),
    production: {
        info: (message: string, data?: any) => logger.production.info(message, data, 'ui'),
        warn: (message: string, data?: any) => logger.production.warn(message, data, 'ui'),
        error: (message: string, data?: any) => logger.production.error(message, data, 'ui'),
    }
};

// Security-focused logger for sensitive operations
export const securityLogger = {
    info: (message: string, data?: any) => logger.production.info(message, data, 'security'),
    warn: (message: string, data?: any) => logger.production.warn(message, data, 'security'),
    error: (message: string, data?: any) => logger.production.error(message, data, 'security'),
};

// Export default logger
export default logger; 