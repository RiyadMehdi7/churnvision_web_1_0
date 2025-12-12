import axios from 'axios';
import { API_BASE_URL } from '@config/apiConfig';
import { authService } from './authService';
import { logger } from '@/utils/clientLogger';

const DEBUG = import.meta.env.DEV;
let isRedirectingToLogin = false;
export const UNAUTHORIZED_EVENT = 'churnvision:unauthorized';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false, // Use bearer token auth; avoid CORS credential restrictions
});

// Request logging (dev only)
if (DEBUG) {
  api.interceptors.request.use((config) => {
    const method = config.method?.toUpperCase() || 'GET';
    const url = `${config.baseURL || api.defaults.baseURL || ''}${config.url || ''}`;
    logger.debug('Request', { method, url }, 'API');
    return config;
  });
  api.interceptors.response.use(
    (response) => {
      logger.debug('Response', { status: response.status, url: response.config.url }, 'API');
      return response;
    },
    (error) => {
      logger.error(
        'Request failed',
        { url: error.config?.url, status: error.response?.status, message: error.message },
        'API'
      );
      return Promise.reject(error);
    }
  );
}

// Seed default Authorization header on load if a token already exists
const initialToken = authService.getAccessToken();
if (initialToken) {
  api.defaults.headers.common.Authorization = `Bearer ${initialToken}`;
}

// Add authentication token to requests
api.interceptors.request.use(
  (config) => {
    const token = authService.getAccessToken();
    if (token) {
      // Normalize headers object before attaching Authorization to avoid AxiosHeaders mutation issues
      const normalizedHeaders =
        (config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers))
          ? { ...config.headers }
          : {};
      normalizedHeaders.Authorization = `Bearer ${token}`;
      config.headers = normalizedHeaders as any;
      if (DEBUG) {
        const preview = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : token;
        logger.debug('Attaching Authorization header', { preview }, 'API');
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

      const token = authService.getAccessToken();
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
          logger.warn(
            '401 without Authorization header; retrying once with token',
            { url: originalRequest.url },
            'API'
          );
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
