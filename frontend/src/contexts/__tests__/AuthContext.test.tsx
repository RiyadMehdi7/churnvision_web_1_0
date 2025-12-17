/**
 * Tests for AuthContext - Authentication state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import { authService } from '../../services/authService';
import { UNAUTHORIZED_EVENT } from '../../services/apiService';

// Mock authService
vi.mock('../../services/authService', () => ({
  authService: {
    getAccessToken: vi.fn(),
    getUser: vi.fn(),
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    clearAuth: vi.fn(),
  },
}));

// Mock api module
vi.mock('../../services/apiService', () => ({
  UNAUTHORIZED_EVENT: 'churnvision:unauthorized',
  default: {},
}));

const mockUser = {
  id: 1,
  email: 'test@example.com',
  username: 'testuser',
  full_name: 'Test User',
  is_active: true,
  is_superuser: false,
  tenant_id: 'test-tenant',
};

// Test component that uses the auth context
const TestConsumer: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'authenticated' : 'not-authenticated'}</div>
      <div data-testid="user">{user ? user.username : 'no-user'}</div>
      <button onClick={() => login({ username: 'test', password: 'pass' })}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.mocked(authService.getAccessToken).mockReturnValue(null);
    vi.mocked(authService.getUser).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        const TestComponent = () => {
          useAuth();
          return null;
        };
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('AuthProvider initialization', () => {
    it('should initialize with no user when no token exists', async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('not-authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });

    it('should restore user from storage on mount', async () => {
      vi.mocked(authService.getAccessToken).mockReturnValue('token');
      vi.mocked(authService.getUser).mockReturnValue(mockUser);
      vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(screen.getByTestId('authenticated')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('user')).toHaveTextContent('testuser');
    });

    it('should clear auth if token validation fails', async () => {
      vi.mocked(authService.getAccessToken).mockReturnValue('expired-token');
      vi.mocked(authService.getUser).mockReturnValue(mockUser);
      vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('Token expired'));

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      expect(authService.clearAuth).toHaveBeenCalled();
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });
  });

  describe('login', () => {
    it('should login successfully and update state', async () => {
      vi.mocked(authService.login).mockResolvedValue({
        tokens: { accessToken: 'token', tokenType: 'bearer', expiresIn: 1800 },
        user: mockUser,
      });

      const user = userEvent.setup();

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      expect(authService.login).toHaveBeenCalledWith({
        username: 'test',
        password: 'pass',
      });
    });

    it('should handle login errors', async () => {
      vi.mocked(authService.login).mockRejectedValue(new Error('Invalid credentials'));

      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      });

      await expect(async () => {
        await user.click(screen.getByText('Login'));
        // Need to wait for the error to propagate
        await new Promise((r) => setTimeout(r, 100));
      }).rejects.toBeDefined;

      consoleSpy.mockRestore();
    });
  });

  describe('logout', () => {
    it('should logout and clear user state', async () => {
      vi.mocked(authService.getAccessToken).mockReturnValue('token');
      vi.mocked(authService.getUser).mockReturnValue(mockUser);
      vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser);
      vi.mocked(authService.logout).mockResolvedValue(undefined);

      const user = userEvent.setup();

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });

      expect(authService.logout).toHaveBeenCalled();
    });
  });

  describe('unauthorized event handling', () => {
    it('should clear auth on unauthorized event', async () => {
      vi.mocked(authService.getAccessToken).mockReturnValue('token');
      vi.mocked(authService.getUser).mockReturnValue(mockUser);
      vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('testuser');
      });

      // Dispatch unauthorized event
      act(() => {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });

      expect(authService.clearAuth).toHaveBeenCalled();
    });
  });
});
