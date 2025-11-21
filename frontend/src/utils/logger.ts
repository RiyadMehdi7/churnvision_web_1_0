// Logger utilities for the frontend web application
// Simplified console-based logging (no Electron dependency)

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

// Helper function to format log messages consistently
const formatMessage = (level: string, context: string | undefined, message: string, data?: any): string => {
    if (!isDevelopment) return message;

    const contextStr = context ? `[${context}] ` : '';
    let dataStr = '';
    if (data !== undefined) {
        try {
            if (data instanceof Error) {
                dataStr = ` | Error: ${data.name} - ${data.message}`;
            } else {
                dataStr = ` | Data: ${typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : String(data)}`;
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

        // TODO: Send critical errors to backend logging endpoint
        // if (isProduction) {
        //   api.post('/logs/error', { message, data, context });
        // }
    },
};

// Create namespaced loggers for different parts of the app
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
