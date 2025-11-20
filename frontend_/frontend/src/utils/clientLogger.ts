/**
 * Client-side logging utility for ChurnVision frontend
 * Provides structured logging that can be controlled by environment
 */

interface LogLevel {
  DEBUG: 0;
  INFO: 1;
  WARN: 2;
  ERROR: 3;
}

const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class ClientLogger {
  private currentLevel: number;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.currentLevel = this.isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
  }

  private shouldLog(level: number): boolean {
    return level >= this.currentLevel;
  }

  private formatMessage(level: string, context: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${context}]`;
    
    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  debug(context: string, message: string, data?: any): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      this.formatMessage('DEBUG', context, message, data);
    }
  }

  info(context: string, message: string, data?: any): void {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      this.formatMessage('INFO', context, message, data);
    }
  }

  warn(context: string, message: string, data?: any): void {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      this.formatMessage('WARN', context, message, data);
    }
  }

  error(context: string, message: string, error?: Error | any): void {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [ERROR] [${context}]`;
      
      if (error instanceof Error) {
        console.error(`${prefix} ${message}`, {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      } else if (error) {
        console.error(`${prefix} ${message}`, error);
      } else {
        console.error(`${prefix} ${message}`);
      }
    }
  }

  // Specialized loggers for different contexts
  router = {
    info: (message: string, data?: any) => this.info('Router', message, data),
    debug: (message: string, data?: any) => this.debug('Router', message, data),
    warn: (message: string, data?: any) => this.warn('Router', message, data),
    error: (message: string, error?: Error | any) => this.error('Router', message, error)
  };

  serviceWorker = {
    info: (message: string, data?: any) => this.info('ServiceWorker', message, data),
    debug: (message: string, data?: any) => this.debug('ServiceWorker', message, data),
    warn: (message: string, data?: any) => this.warn('ServiceWorker', message, data),
    error: (message: string, error?: Error | any) => this.error('ServiceWorker', message, error)
  };

  project = {
    info: (message: string, data?: any) => this.info('Project', message, data),
    debug: (message: string, data?: any) => this.debug('Project', message, data),
    warn: (message: string, data?: any) => this.warn('Project', message, data),
    error: (message: string, error?: Error | any) => this.error('Project', message, error)
  };

  cache = {
    info: (message: string, data?: any) => this.info('Cache', message, data),
    debug: (message: string, data?: any) => this.debug('Cache', message, data),
    warn: (message: string, data?: any) => this.warn('Cache', message, data),
    error: (message: string, error?: Error | any) => this.error('Cache', message, error)
  };

  ui = {
    info: (message: string, data?: any) => this.info('UI', message, data),
    debug: (message: string, data?: any) => this.debug('UI', message, data),
    warn: (message: string, data?: any) => this.warn('UI', message, data),
    error: (message: string, error?: Error | any) => this.error('UI', message, error)
  };
}

// Export singleton instance
export const logger = new ClientLogger();
export default logger;