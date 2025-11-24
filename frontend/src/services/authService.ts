import axios from 'axios';
import { AUTH_BASE_URL } from '@config/apiConfig';

const AUTH_ENDPOINT = AUTH_BASE_URL;

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  tenant_id?: string;
  is_active?: boolean;
}

export interface UserData {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  tenant_id: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserData;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

class AuthService {
  private readonly TOKEN_KEY = 'churnvision_access_token';
  private readonly USER_KEY = 'churnvision_user';

  /**
   * Login user with username/email and password
   */
  async login(credentials: LoginCredentials): Promise<{ tokens: AuthTokens; user: UserData }> {
    try {
      const response = await axios.post<LoginResponse>(`${AUTH_ENDPOINT}/login`, credentials);

      const { access_token, token_type, expires_in, user } = response.data;

      // Store tokens and user data
      this.setAccessToken(access_token);
      this.setUser(user);

      return {
        tokens: {
          accessToken: access_token,
          tokenType: token_type,
          expiresIn: expires_in,
        },
        user,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Login failed');
      }
      throw error;
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<UserData> {
    try {
      const response = await axios.post<UserData>(`${AUTH_ENDPOINT}/register`, {
        ...data,
        is_active: data.is_active ?? true,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Registration failed');
      }
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      const token = this.getAccessToken();
      if (token) {
        await axios.post(
          `${AUTH_ENDPOINT}/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage
      this.clearAuth();
    }
  }

  /**
   * Get current user from API
   */
  async getCurrentUser(): Promise<UserData> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('No access token found');
    }

    try {
      const response = await axios.get<UserData>(`${AUTH_ENDPOINT}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      this.setUser(response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.clearAuth();
      }
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<string> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('No access token found');
    }

    try {
      const response = await axios.post<{ access_token: string; token_type: string; expires_in: number }>(
        `${AUTH_ENDPOINT}/refresh`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      this.setAccessToken(response.data.access_token);
      return response.data.access_token;
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  }

  /**
   * Store access token in localStorage
   */
  setAccessToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    // Also set a generic key for consumers expecting 'access_token'
    localStorage.setItem('access_token', token);
  }

  /**
   * Get access token from localStorage
   */
  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Store user data in localStorage
   */
  setUser(user: UserData): void {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  /**
   * Get user data from localStorage
   */
  getUser(): UserData | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Clear all auth data
   */
  clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('churnvision_refresh_token');
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Get authorization header
   */
  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();
