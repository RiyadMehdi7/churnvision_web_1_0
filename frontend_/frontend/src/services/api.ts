import axios from 'axios';

// Resolve backend base URL
const ENV_BASE_URL = import.meta.env.VITE_API_URL as string | undefined;
const DEBUG = import.meta.env.DEV;

const api = axios.create({
  baseURL: ENV_BASE_URL || 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

let hasResolvedBackendPort = false;
let resolvingBackendPort = false;
let lastResolvedBaseURL: string | null = null;

async function ensureBackendPort(): Promise<void> {
  if (ENV_BASE_URL) { hasResolvedBackendPort = true; lastResolvedBaseURL = ENV_BASE_URL; return; }
  if (hasResolvedBackendPort || resolvingBackendPort) return;
  if (!(window as any).electronApi?.backend?.getPort) return;
  try {
    resolvingBackendPort = true;
    const port = await (window as any).electronApi.backend.getPort();
    if (port && Number(port) > 0) {
      const newBase = `http://localhost:${port}`;
      api.defaults.baseURL = newBase;
      lastResolvedBaseURL = newBase;
      hasResolvedBackendPort = true;
      if (DEBUG) console.log(`[API] Backend port resolved → ${newBase}`);
    }
  } catch (e) {
    if (DEBUG) console.warn('[API] Failed to resolve backend port via Electron:', e);
  } finally {
    resolvingBackendPort = false;
  }
}

// Request logging (dev only)
if (DEBUG) {
  api.interceptors.request.use((config) => {
    try { console.log(`API → ${config.method?.toUpperCase()} ${(config.baseURL || api.defaults.baseURL) + (config.url || '')}`); } catch {}
    return config;
  });
  api.interceptors.response.use(
    (response) => { try { console.log(`API ← ${response.status} ${response.config.url}`); } catch {} return response; },
    (error) => { try { console.error(`API × ${error.config?.url}`, error.response?.data || error.message); } catch {} return Promise.reject(error); }
  );
}

// Project context header
api.interceptors.request.use(
  async (config) => {
    await ensureBackendPort();
    if ((window as any).electronApi?.projects?.getActiveProjectDbPath) {
      try {
        const activeDbPath = await (window as any).electronApi.projects.getActiveProjectDbPath();
        config.headers = config.headers || {};
        if (activeDbPath) {
          if (DEBUG) console.log(`[API Interceptor] Adding project DB header`);
          (config.headers as any)['X-Project-DB-Path'] = activeDbPath;
        } else {
          delete (config.headers as any)['X-Project-DB-Path'];
        }
      } catch (error) {
        if (DEBUG) console.warn('[API Interceptor] Error getting active project:', error);
        config.headers = config.headers || {};
        delete (config.headers as any)['X-Project-DB-Path'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-retry once on network error after refreshing backend port
api.interceptors.response.use(undefined, async (error) => {
  const isNetworkError = error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error');
  const originalRequest = error.config;
  if (isNetworkError && originalRequest && !originalRequest.__retried) {
    originalRequest.__retried = true;
    await ensureBackendPort();
    if (lastResolvedBaseURL) originalRequest.baseURL = lastResolvedBaseURL;
    return api.request(originalRequest);
  }
  throw error;
});

export default api;