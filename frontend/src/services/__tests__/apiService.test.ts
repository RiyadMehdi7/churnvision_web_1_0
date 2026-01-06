import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Due to the complexity of mocking axios interceptors in isolation,
// these tests focus on verifying the module exports and constants
// rather than the full interceptor behavior.

describe('apiService exports', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export UNAUTHORIZED_EVENT constant', async () => {
    const { UNAUTHORIZED_EVENT } = await import('../apiService');
    expect(UNAUTHORIZED_EVENT).toBe('churnvision:unauthorized');
  });

  it('should export default api instance', async () => {
    const apiModule = await import('../apiService');
    expect(apiModule.default).toBeDefined();
  });
});

describe('UNAUTHORIZED_EVENT', () => {
  it('should be a valid custom event name', async () => {
    const { UNAUTHORIZED_EVENT } = await import('../apiService');

    // Should be a string that can be used as an event name
    expect(typeof UNAUTHORIZED_EVENT).toBe('string');
    expect(UNAUTHORIZED_EVENT.length).toBeGreaterThan(0);

    // Should follow the namespaced pattern
    expect(UNAUTHORIZED_EVENT).toContain(':');
    expect(UNAUTHORIZED_EVENT.startsWith('churnvision:')).toBe(true);
  });
});
