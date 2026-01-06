/**
 * Tests for authService.ts - Authentication service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { authService, LoginCredentials, RegisterData, UserData } from '../authService';

// Mock axios with factory function (Vitest 4.x API)
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    isAxiosError: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));
const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  isAxiosError: ReturnType<typeof vi.fn>;
};

// Mock data
const mockUser: UserData = {
  id: 1,
  email: 'test@example.com',
  username: 'testuser',
  full_name: 'Test User',
  is_active: true,
  is_superuser: false,
  tenant_id: 'test-tenant',
};

const mockLoginResponse = {
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 1800,
  user: mockUser,
};

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('login', () => {
    it('should login successfully and store tokens', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockLoginResponse });

      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
      };

      const result = await authService.login(credentials);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/login'),
        credentials
      );
      expect(result.tokens.accessToken).toBe('test-access-token');
      expect(result.user).toEqual(mockUser);
      expect(localStorage.getItem('churnvision_access_token')).toBe('test-access-token');
    });

    it('should throw error on login failure', async () => {
      const axiosError = new Error('Invalid credentials') as Error & { isAxiosError: boolean; response: { data: { detail: string } } };
      axiosError.isAxiosError = true;
      axiosError.response = { data: { detail: 'Invalid credentials' } };
      mockedAxios.post.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const credentials: LoginCredentials = {
        username: 'wrong',
        password: 'wrong',
      };

      await expect(authService.login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw generic error for network failures', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));
      mockedAxios.isAxiosError.mockReturnValue(false);

      const credentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
      };

      await expect(authService.login(credentials)).rejects.toThrow('Network error');
    });
  });

  describe('register', () => {
    it('should register user successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockUser });

      const data: RegisterData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePass123!',
        full_name: 'New User',
      };

      const result = await authService.register(data);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/register'),
        expect.objectContaining({
          ...data,
          is_active: true,
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw error on registration failure', async () => {
      const axiosError = new Error('Email already registered') as Error & { isAxiosError: boolean; response: { data: { detail: string } } };
      axiosError.isAxiosError = true;
      axiosError.response = { data: { detail: 'Email already registered' } };
      mockedAxios.post.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const data: RegisterData = {
        username: 'existing',
        email: 'existing@example.com',
        password: 'password123',
      };

      await expect(authService.register(data)).rejects.toThrow('Email already registered');
    });
  });

  describe('logout', () => {
    it('should logout and clear auth data', async () => {
      // Setup initial state
      localStorage.setItem('churnvision_access_token', 'token');
      localStorage.setItem('churnvision_user', JSON.stringify(mockUser));
      mockedAxios.post.mockResolvedValueOnce({});

      await authService.logout();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/logout'),
        {},
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        })
      );
      expect(localStorage.getItem('churnvision_access_token')).toBeNull();
      expect(localStorage.getItem('churnvision_user')).toBeNull();
    });

    it('should clear auth even if logout request fails', async () => {
      localStorage.setItem('churnvision_access_token', 'token');
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await authService.logout();

      expect(localStorage.getItem('churnvision_access_token')).toBeNull();
    });

    it('should handle logout without token gracefully', async () => {
      await authService.logout();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should fetch current user from API', async () => {
      localStorage.setItem('churnvision_access_token', 'token');
      mockedAxios.get.mockResolvedValueOnce({ data: mockUser });

      const result = await authService.getCurrentUser();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/me'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw if no token exists', async () => {
      await expect(authService.getCurrentUser()).rejects.toThrow('No access token found');
    });

    it('should clear auth on 401 response', async () => {
      localStorage.setItem('churnvision_access_token', 'expired-token');
      const axiosError = new Error('Unauthorized') as Error & { isAxiosError: boolean; response: { status: number } };
      axiosError.isAxiosError = true;
      axiosError.response = { status: 401 };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(authService.getCurrentUser()).rejects.toBeDefined();
      expect(localStorage.getItem('churnvision_access_token')).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token and store new one', async () => {
      localStorage.setItem('churnvision_access_token', 'old-token');
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'new-token', token_type: 'bearer', expires_in: 1800 },
      });

      const result = await authService.refreshToken();

      expect(result).toBe('new-token');
      expect(localStorage.getItem('churnvision_access_token')).toBe('new-token');
    });

    it('should throw if no token exists', async () => {
      await expect(authService.refreshToken()).rejects.toThrow('No access token found');
    });

    it('should clear auth on refresh failure', async () => {
      localStorage.setItem('churnvision_access_token', 'token');
      mockedAxios.post.mockRejectedValueOnce(new Error('Refresh failed'));

      await expect(authService.refreshToken()).rejects.toBeDefined();
      expect(localStorage.getItem('churnvision_access_token')).toBeNull();
    });
  });

  describe('token management', () => {
    it('should set and get access token', () => {
      authService.setAccessToken('test-token');

      expect(authService.getAccessToken()).toBe('test-token');
      expect(localStorage.getItem('access_token')).toBe('test-token');
    });

    it('should return null if no token set', () => {
      expect(authService.getAccessToken()).toBeNull();
    });
  });

  describe('user management', () => {
    it('should set and get user data', () => {
      authService.setUser(mockUser);

      const result = authService.getUser();

      expect(result).toEqual(mockUser);
    });

    it('should return null if no user data', () => {
      expect(authService.getUser()).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      localStorage.setItem('churnvision_user', 'invalid-json');

      expect(authService.getUser()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', () => {
      localStorage.setItem('churnvision_access_token', 'token');

      expect(authService.isAuthenticated()).toBe(true);
    });

    it('should return false when no token', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('clearAuth', () => {
    it('should clear all auth-related data', () => {
      localStorage.setItem('churnvision_access_token', 'token');
      localStorage.setItem('access_token', 'token');
      localStorage.setItem('refresh_token', 'refresh');
      localStorage.setItem('churnvision_refresh_token', 'refresh');
      localStorage.setItem('churnvision_user', JSON.stringify(mockUser));

      authService.clearAuth();

      expect(localStorage.getItem('churnvision_access_token')).toBeNull();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(localStorage.getItem('churnvision_refresh_token')).toBeNull();
      expect(localStorage.getItem('churnvision_user')).toBeNull();
    });
  });

  describe('getAuthHeader', () => {
    it('should return Authorization header when token exists', () => {
      localStorage.setItem('churnvision_access_token', 'token');

      expect(authService.getAuthHeader()).toEqual({
        Authorization: 'Bearer token',
      });
    });

    it('should return empty object when no token', () => {
      expect(authService.getAuthHeader()).toEqual({});
    });
  });
});
