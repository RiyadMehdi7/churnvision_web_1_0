// Centralized API base resolution so every service hits the same backend URL
// Handles cases where VITE_API_URL already includes /api/v1 or just the host.
const API_VERSION_PATH = '/api/v1';

const normalizeBaseUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, ''); // drop trailing slashes
  if (!trimmed) return '';
  return trimmed;
};

const rawEnvBase = import.meta.env.VITE_API_URL || '';
const normalizedEnvBase = normalizeBaseUrl(rawEnvBase);
const baseHasVersion = normalizedEnvBase.endsWith(API_VERSION_PATH);

// Ensure the resolved base always includes the API version prefix exactly once
export const API_BASE_URL = baseHasVersion
  ? normalizedEnvBase
  : `${normalizedEnvBase || ''}${API_VERSION_PATH}`;

// Auth endpoints hang off the same base
export const AUTH_BASE_URL = `${API_BASE_URL}/auth`;

export { API_VERSION_PATH };
