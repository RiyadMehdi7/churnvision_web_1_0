import axios from 'axios';
import { API_BASE_URL } from '@config/apiConfig';
import { authService } from './authService';

const DEBUG = import.meta.env.DEV;
let isRedirectingToLogin = false;
export const UNAUTHORIZED_EVENT = 'churnvision:unauthorized';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Enable cookies for session management
});

// Request logging (dev only)
if (DEBUG) {
  api.interceptors.request.use((config) => {
    try {
      console.log(`API → ${config.method?.toUpperCase()} ${(config.baseURL || api.defaults.baseURL) + (config.url || '')}`);
    } catch { }
    return config;
  });
  api.interceptors.response.use(
    (response) => {
      try {
        console.log(`API ← ${response.status} ${response.config.url}`);
      } catch { }
      return response;
    },
    (error) => {
      try {
        console.error(`API × ${error.config?.url}`, error.response?.data || error.message);
      } catch { }
      return Promise.reject(error);
    }
  );
}

const getStoredAccessToken = (): string | null => {
  return (
    localStorage.getItem('access_token') ||
    localStorage.getItem('churnvision_access_token') || // legacy key used by authService
    null
  );
};

// Seed default Authorization header on load if a token already exists
const initialToken = getStoredAccessToken();
if (initialToken) {
  api.defaults.headers.common.Authorization = `Bearer ${initialToken}`;
}

// Add authentication token to requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token) {
      // Normalize headers object before attaching Authorization to avoid AxiosHeaders mutation issues
      const normalizedHeaders =
        (config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers))
          ? { ...config.headers }
          : {};
      normalizedHeaders.Authorization = `Bearer ${token}`;
      config.headers = normalizedHeaders as any;
      if (DEBUG) {
        try {
          const preview = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : token;
          console.log(`[API] Attaching Authorization header: Bearer ${preview}`);
        } catch { }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token refresh on 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const token = getStoredAccessToken();
      const hasAuthHeader =
        !!(originalRequest?.headers?.Authorization || originalRequest?.headers?.authorization);

      // If we somehow sent the request without an Authorization header but have a token, retry once with it.
      if (token && !hasAuthHeader && !originalRequest._retryAttach) {
        originalRequest._retryAttach = true;
        const retryHeaders =
          (originalRequest.headers && typeof originalRequest.headers === 'object' && !Array.isArray(originalRequest.headers))
            ? { ...originalRequest.headers }
            : {};
        retryHeaders.Authorization = `Bearer ${token}`;
        originalRequest.headers = retryHeaders as any;
        if (DEBUG) {
          try {
            console.warn('[API] 401 without Authorization header; retrying once with token for', originalRequest.url);
          } catch { }
        }
        return api(originalRequest);
      }

      // No refresh-token flow is supported by the backend; clear stored tokens and user data.
      authService.clearAuth();

      // Broadcast unauthorized so contexts can react (e.g., clear user, show toast)
      try {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      } catch { /* window may be unavailable in tests */ }

      // Redirect to login once to prevent confusing 401 loops across pages
      if (typeof window !== 'undefined' && token) {
        const path = window.location.pathname + window.location.search;
        const isAuthRoute = path.startsWith('/login') || path.startsWith('/register');
        if (!isRedirectingToLogin && !isAuthRoute) {
          isRedirectingToLogin = true;
          const returnTo = encodeURIComponent(path || '/');
          window.location.replace(`/login?from=${returnTo}`);
        }
      }

      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
