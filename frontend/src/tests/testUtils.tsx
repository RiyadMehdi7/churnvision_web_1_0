/**
 * Test utilities for ChurnVision frontend tests.
 * Provides common test helpers, wrappers, and mock data.
 */
import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Create a fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Mock user data
export const mockUser = {
  id: 1,
  email: 'test@example.com',
  username: 'testuser',
  full_name: 'Test User',
  is_active: true,
  is_superuser: false,
  tenant_id: 'test-tenant',
};

export const mockSuperUser = {
  ...mockUser,
  id: 2,
  email: 'admin@example.com',
  username: 'admin',
  is_superuser: true,
};

// Mock auth tokens
export const mockTokens = {
  accessToken: 'mock-access-token-12345',
  tokenType: 'bearer',
  expiresIn: 1800,
};

// Mock employee features
export const mockEmployeeFeatures = {
  satisfaction_level: 0.5,
  last_evaluation: 0.7,
  number_project: 3,
  average_monthly_hours: 160,
  time_spend_company: 3,
  work_accident: false,
  promotion_last_5years: false,
  department: 'sales',
  salary_level: 'medium' as const,
};

export const mockHighRiskEmployee = {
  ...mockEmployeeFeatures,
  satisfaction_level: 0.1,
  last_evaluation: 0.3,
  number_project: 7,
  average_monthly_hours: 280,
  salary_level: 'low' as const,
};

export const mockLowRiskEmployee = {
  ...mockEmployeeFeatures,
  satisfaction_level: 0.9,
  last_evaluation: 0.85,
  number_project: 4,
  average_monthly_hours: 160,
  promotion_last_5years: true,
  salary_level: 'high' as const,
};

// Mock prediction response
export const mockPredictionResponse = {
  employee_id: 'emp-123',
  churn_probability: 0.65,
  risk_level: 'HIGH',
  contributing_factors: [
    {
      feature: 'satisfaction_level',
      value: 0.3,
      impact: 'critical',
      message: 'Very low satisfaction level (0.30)',
    },
  ],
  recommendations: [
    'Schedule immediate one-on-one meeting to discuss employee satisfaction and concerns',
  ],
  predicted_at: new Date().toISOString(),
};

// Mock training response
export const mockTrainingResponse = {
  model_id: 'xgboost_20240101_120000',
  model_type: 'xgboost',
  accuracy: 0.85,
  precision: 0.82,
  recall: 0.88,
  f1_score: 0.85,
  trained_at: new Date().toISOString(),
  training_samples: 1000,
  feature_importance: {
    satisfaction_level: 0.25,
    last_evaluation: 0.15,
    number_project: 0.12,
    average_monthly_hours: 0.18,
    time_spend_company: 0.10,
    work_accident: 0.05,
    promotion_last_5years: 0.08,
    department: 0.04,
    salary_level: 0.03,
  },
};

// Provider wrapper for tests
interface WrapperProps {
  children: ReactNode;
}

export const TestWrapper: React.FC<WrapperProps> = ({ children }) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Custom render function with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: TestWrapper, ...options });

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };

// Helper to wait for async operations
export const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

// Helper to mock axios responses
export const createAxiosMock = () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  create: vi.fn().mockReturnThis(),
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  },
  defaults: {
    headers: {
      common: {},
    },
  },
});

// Helper to setup localStorage mock with initial data
export const setupLocalStorage = (initialData: Record<string, string> = {}) => {
  Object.entries(initialData).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
};

// Helper to create mock API error
export const createApiError = (status: number, message: string) => ({
  isAxiosError: true,
  response: {
    status,
    data: { detail: message },
  },
  message,
});
