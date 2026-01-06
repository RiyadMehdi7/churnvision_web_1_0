import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingOverlay } from '@/components/common/LoadingSpinner';

interface AuthProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Component to protect routes that require authentication
 */
export const AuthProtectedRoute: React.FC<AuthProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingOverlay isLoading={true} text="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    // Redirect to login page but save the location they were trying to access
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
