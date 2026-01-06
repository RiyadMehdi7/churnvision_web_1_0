import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('apiConfig', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('API_BASE_URL', () => {
    it('should use /api/v1 when VITE_API_URL is empty', async () => {
      vi.stubEnv('VITE_API_URL', '');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('/api/v1');
    });

    it('should use VITE_API_URL when it includes /api/v1', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:8001/api/v1');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('http://localhost:8001/api/v1');
    });

    it('should append /api/v1 when VITE_API_URL does not include it', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:8001');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('http://localhost:8001/api/v1');
    });

    it('should handle VITE_API_URL with trailing slash', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:8001/');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('http://localhost:8001/api/v1');
    });

    it('should handle /api proxy prefix', async () => {
      vi.stubEnv('VITE_API_URL', '/api');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('/api/v1');
    });
  });

  describe('AUTH_BASE_URL', () => {
    it('should be API_BASE_URL with /auth suffix', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:8001');
      const { API_BASE_URL, AUTH_BASE_URL } = await import('../apiConfig');
      expect(AUTH_BASE_URL).toBe(`${API_BASE_URL}/auth`);
    });
  });

  describe('API_VERSION_PATH', () => {
    it('should export the API version path constant', async () => {
      const { API_VERSION_PATH } = await import('../apiConfig');
      expect(API_VERSION_PATH).toBe('/api/v1');
    });
  });

  describe('URL normalization', () => {
    it('should trim whitespace from VITE_API_URL', async () => {
      vi.stubEnv('VITE_API_URL', '  http://localhost:8001  ');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('http://localhost:8001/api/v1');
    });

    it('should remove multiple trailing slashes', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:8001///');
      const { API_BASE_URL } = await import('../apiConfig');
      expect(API_BASE_URL).toBe('http://localhost:8001/api/v1');
    });
  });
});
