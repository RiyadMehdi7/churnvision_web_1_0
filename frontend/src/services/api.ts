import axios from 'axios';

// Resolve backend base URL - FastAPI backend on port 8000
const ENV_BASE_URL = import.meta.env.VITE_API_URL as string | undefined;
const DEBUG = import.meta.env.DEV;

const api = axios.create({
  baseURL: ENV_BASE_URL || '/api/v1',
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

// Add authentication token to requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
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

      try {
        const refreshToken =
          localStorage.getItem('refresh_token') || localStorage.getItem('churnvision_refresh_token');
        if (refreshToken) {
          const response = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            { refresh_token: refreshToken }
          );

          const { access_token, refresh_token: newRefreshToken } = response.data;
          localStorage.setItem('access_token', access_token);
          if (newRefreshToken) {
            localStorage.setItem('refresh_token', newRefreshToken);
          }

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api.request(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
