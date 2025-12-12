import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, LoginCredentials, RegisterData, UserData } from '../services/authService';
import { UNAUTHORIZED_EVENT } from '../services/api';

interface AuthContextType {
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Permission helpers
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasAllPermissions: (...permissions: string[]) => boolean;
  hasAdminAccess: boolean;
  userRole: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async (): Promise<UserData> => {
    const service: any = authService;
    if (typeof service.getCurrentUserExtended === 'function') {
      return service.getCurrentUserExtended();
    }
    if (typeof service.getCurrentUser === 'function') {
      return service.getCurrentUser();
    }
    throw new Error('Auth service does not implement getCurrentUserExtended/getCurrentUser');
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = authService.getAccessToken();
      const storedUser = authService.getUser();

      if (token && storedUser) {
        try {
          // Verify token is still valid by fetching current user with extended info
          // Add timeout to prevent indefinite loading
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth check timeout')), 5000)
          );
          const currentUser = await Promise.race([
            fetchCurrentUser(),
            timeoutPromise
          ]) as typeof storedUser;
          setUser(currentUser);
        } catch (error) {
          console.error('Token validation failed:', error);
          authService.clearAuth();
          setUser(null);
        }
      }

      setIsLoading(false);
    };

    initializeAuth();

    // Listen for forced logout events from the API layer (401 responses)
    const handleUnauthorized = () => {
      authService.clearAuth();
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [fetchCurrentUser]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const result = await authService.login(credentials);
      setUser(result.user);

      // Optionally refresh with extended role/permission info (don't block login UX)
      try {
        const extendedUser = await fetchCurrentUser();
        if (extendedUser) setUser(extendedUser);
      } catch {
        // Keep user from login response
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      await authService.register(data);
      // After registration, automatically log in
      await login({ username: data.username, password: data.password });
    } catch (error) {
      console.error('Registration error:', error);
      setIsLoading(false);
      throw error;
    }
  }, [login]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      // Fetch extended user info with role and permissions
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Refresh user error:', error);
      authService.clearAuth();
      setUser(null);
    }
  }, [fetchCurrentUser]);

  // Permission checking helpers
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  }, [user]);

  const hasAnyPermission = useCallback((...permissions: string[]): boolean => {
    if (!user?.permissions) return false;
    return permissions.some(p => user.permissions?.includes(p));
  }, [user]);

  const hasAllPermissions = useCallback((...permissions: string[]): boolean => {
    if (!user?.permissions) return false;
    return permissions.every(p => user.permissions?.includes(p));
  }, [user]);

  const hasAdminAccess = user?.has_admin_access ?? false;
  const userRole = user?.role?.role_id ?? null;

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    // Permission helpers
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasAdminAccess,
    userRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
