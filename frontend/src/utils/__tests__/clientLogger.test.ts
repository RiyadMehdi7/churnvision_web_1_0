import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clientLogger', () => {
  const originalEnv = { ...import.meta.env };
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('in development mode', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv('DEV', true);
      vi.stubEnv('PROD', false);
    });

    it('should log debug messages', async () => {
      const { logger } = await import('../clientLogger');
      logger.debug('test debug message');
      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('should log info messages', async () => {
      const { logger } = await import('../clientLogger');
      logger.info('test info message');
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should log warn messages', async () => {
      const { logger } = await import('../clientLogger');
      logger.warn('test warn message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should log error messages', async () => {
      const { logger } = await import('../clientLogger');
      logger.error('test error message');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should include data in log output', async () => {
      const { logger } = await import('../clientLogger');
      logger.info('test message', { key: 'value' });
      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain('Data:');
      expect(call).toContain('key');
    });

    it('should include context in log output', async () => {
      const { logger } = await import('../clientLogger');
      logger.info('test message', null, 'TestContext');
      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain('[TestContext]');
    });

    it('should handle Error objects in data', async () => {
      const { logger } = await import('../clientLogger');
      const error = new Error('Test error');
      logger.error('error occurred', error);
      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toContain('Error:');
      expect(call).toContain('Test error');
    });
  });

  describe('namespaced loggers', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv('DEV', true);
      vi.stubEnv('PROD', false);
    });

    it('should have router namespace', async () => {
      const { logger } = await import('../clientLogger');
      expect(logger.router).toBeDefined();
      expect(typeof logger.router.debug).toBe('function');
      expect(typeof logger.router.info).toBe('function');
      expect(typeof logger.router.warn).toBe('function');
      expect(typeof logger.router.error).toBe('function');
    });

    it('should have ui namespace', async () => {
      const { logger } = await import('../clientLogger');
      expect(logger.ui).toBeDefined();
      logger.ui.info('UI message');
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should have project namespace', async () => {
      const { logger } = await import('../clientLogger');
      expect(logger.project).toBeDefined();
      logger.project.warn('Project warning');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should have cache namespace', async () => {
      const { logger } = await import('../clientLogger');
      expect(logger.cache).toBeDefined();
    });

    it('should have app namespace', async () => {
      const { logger } = await import('../clientLogger');
      expect(logger.app).toBeDefined();
    });
  });

  describe('compatibility aliases', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv('DEV', true);
      vi.stubEnv('PROD', false);
    });

    it('should export appLogger', async () => {
      const { appLogger } = await import('../clientLogger');
      expect(appLogger).toBeDefined();
      expect(typeof appLogger.info).toBe('function');
      expect(typeof appLogger.warn).toBe('function');
      expect(typeof appLogger.error).toBe('function');
      expect(typeof appLogger.debug).toBe('function');
    });

    it('should export uiLogger', async () => {
      const { uiLogger } = await import('../clientLogger');
      expect(uiLogger).toBeDefined();
      expect(typeof uiLogger.info).toBe('function');
      expect(typeof uiLogger.warn).toBe('function');
      expect(typeof uiLogger.error).toBe('function');
      expect(typeof uiLogger.debug).toBe('function');
    });

    it('appLogger should log with App context', async () => {
      const { appLogger } = await import('../clientLogger');
      appLogger.info('app message');
      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain('[App]');
    });

    it('uiLogger should log with UI context', async () => {
      const { uiLogger } = await import('../clientLogger');
      uiLogger.warn('ui warning');
      expect(consoleSpy.warn).toHaveBeenCalled();
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('[UI]');
    });
  });

  describe('message formatting', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.stubEnv('DEV', true);
      vi.stubEnv('PROD', false);
    });

    it('should include timestamp in message', async () => {
      const { logger } = await import('../clientLogger');
      logger.info('timestamped message');
      const call = consoleSpy.info.mock.calls[0][0];
      // Check for ISO timestamp format
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include log level in message', async () => {
      const { logger } = await import('../clientLogger');
      logger.warn('level test');
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('WARN:');
    });

    it('should handle unserializable data gracefully', async () => {
      const { logger } = await import('../clientLogger');
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      // Should not throw
      expect(() => logger.info('circular data', circular)).not.toThrow();
    });

    it('should truncate long data strings', async () => {
      const { logger } = await import('../clientLogger');
      const longData = { content: 'a'.repeat(300) };
      logger.info('long data', longData);
      const call = consoleSpy.info.mock.calls[0][0];
      // Data should be truncated at 200 chars
      expect(call.length).toBeLessThan(500);
    });
  });
});
