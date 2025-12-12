/**
 * Tests for Login page component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the auth context
const mockLogin = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isLoading: false,
    isAuthenticated: false,
  }),
}));

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// Import after mocks
import Login from '../Login';

const renderLogin = () => {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
};

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render login form', () => {
      renderLogin();

      expect(screen.getByLabelText(/username/i) || screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    });

    it('should render login button', () => {
      renderLogin();

      expect(screen.getByRole('button', { name: /log\s?in|sign\s?in/i })).toBeInTheDocument();
    });

    it('should render link to register page', () => {
      renderLogin();

      expect(
        screen.getByRole('link', { name: /register|sign up|create (an )?account/i })
      ).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should call login with credentials on submit', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();

      renderLogin();

      const usernameInput = screen.getByLabelText(/username/i) || screen.getByPlaceholderText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /log\s?in|sign\s?in/i });

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          username: 'testuser',
          password: 'password123',
        });
      });
    });

    it('should navigate to home on successful login', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();

      renderLogin();

      const usernameInput = screen.getByLabelText(/username/i) || screen.getByPlaceholderText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /log\s?in|sign\s?in/i });

      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
    });

    it('should display error message on login failure', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
      const user = userEvent.setup();

      renderLogin();

      const usernameInput = screen.getByLabelText(/username/i) || screen.getByPlaceholderText(/username/i);
      const passwordInput = screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /log\s?in|sign\s?in/i });

      await user.type(usernameInput, 'wronguser');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessage = screen.queryByText(/invalid|error|failed/i);
        // Error should be displayed somewhere
        expect(errorMessage || screen.queryByRole('alert')).toBeTruthy();
      });
    });
  });

  describe('form validation', () => {
    it('should require username field', async () => {
      const user = userEvent.setup();

      renderLogin();

      const passwordInput = screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /log\s?in|sign\s?in/i });

      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // Login should not be called with empty username
      await waitFor(() => {
        expect(mockLogin).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('should require password field', async () => {
      const user = userEvent.setup();

      renderLogin();

      const usernameInput = screen.getByLabelText(/username/i) || screen.getByPlaceholderText(/username/i);
      const submitButton = screen.getByRole('button', { name: /log\s?in|sign\s?in/i });

      await user.type(usernameInput, 'testuser');
      await user.click(submitButton);

      // Login should not be called with empty password
      await waitFor(() => {
        expect(mockLogin).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });
  });
});
