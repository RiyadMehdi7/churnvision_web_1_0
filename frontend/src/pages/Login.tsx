import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert } from '../components/ui/alert';
import { Eye, EyeOff, Loader2, LogIn, KeyRound } from 'lucide-react';
import api from '../services/apiService';

interface SSOStatus {
  sso_enabled: boolean;
  provider: string;
  login_url?: string;
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<SSOStatus | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);

  // Check SSO status on mount
  useEffect(() => {
    const checkSSOStatus = async () => {
      try {
        const response = await api.get<SSOStatus>('/auth/sso/status');
        setSsoStatus(response.data);
      } catch {
        // SSO not available, that's fine
        setSsoStatus(null);
      }
    };
    checkSSOStatus();
  }, []);

  const handleSSOLogin = () => {
    if (ssoStatus?.login_url) {
      setSsoLoading(true);
      window.location.href = ssoStatus.login_url;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setIsLoading(true);

    try {
      await login({ username, password });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-launch-overlay">
      {/* Animated background particles */}
      <div className="app-launch-particles" aria-hidden="true">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="app-launch-particle"
            initial={{
              opacity: 0,
              x: Math.random() * 100 - 50,
              y: Math.random() * 100 - 50,
            }}
            animate={{
              opacity: [0, 0.6, 0],
              y: [0, -100 - Math.random() * 100],
              x: Math.random() * 40 - 20,
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'easeOut',
            }}
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${60 + Math.random() * 30}%`,
            }}
          />
        ))}
      </div>

      <div className="app-launch-backdrop" aria-hidden="true" />

      {/* Ambient glow rings */}
      <div className="app-launch-glow-container" aria-hidden="true">
        <motion.div
          className="app-launch-glow-ring app-launch-glow-ring-1"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="app-launch-glow-ring app-launch-glow-ring-2"
          animate={{
            scale: [1.1, 0.9, 1.1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
      </div>

      <motion.div
        className="app-launch-card"
        style={{ width: 'min(420px, 90vw)', padding: '2rem 2.5rem' }}
        initial={{ opacity: 0, y: 30, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.34, 1.56, 0.64, 1],
        }}
      >
        {/* Animated corner accents */}
        <div className="app-launch-corner app-launch-corner-tl" />
        <div className="app-launch-corner app-launch-corner-br" />

        {/* Logo with gradient */}
        <motion.div
          className="app-launch-logo-container"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <motion.div
            className="app-launch-logo-icon"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <svg viewBox="0 0 40 40" className="w-10 h-10">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#6ee7b7" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="20" r="18" fill="none" stroke="url(#logoGrad)" strokeWidth="2" opacity="0.3" />
              <circle cx="20" cy="20" r="12" fill="none" stroke="url(#logoGrad)" strokeWidth="2" opacity="0.5" />
              <circle cx="20" cy="20" r="6" fill="url(#logoGrad)" />
            </svg>
          </motion.div>
          <div className="app-launch-logo">
            <span className="app-launch-logo-text">Churn</span>
            <span className="app-launch-logo-text-accent">Vision</span>
          </div>
        </motion.div>

        {/* Welcome text */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">
            Welcome back
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sign in to continue to your dashboard
          </p>
        </motion.div>

        {/* Login form */}
        <motion.form
          onSubmit={handleSubmit}
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          {error && (
            <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50">
              <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Username or Email
            </Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="username"
              autoFocus
              className="h-11 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="current-password"
                className="h-11 pr-10 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 hover:transform-none"
                style={{ transform: 'translateY(-50%)' }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 rounded-lg mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </>
            )}
          </Button>
        </motion.form>

        {/* SSO Login Button */}
        {ssoStatus?.sso_enabled && ssoStatus.login_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500 font-medium">
                  or
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleSSOLogin}
              disabled={ssoLoading}
              className="w-full h-11 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all duration-200 rounded-lg"
            >
              {ssoLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Sign in with {ssoStatus.provider === 'oidc' ? 'SSO' : ssoStatus.provider.toUpperCase()}
                </>
              )}
            </Button>
          </motion.div>
        )}

        {/* Divider */}
        <motion.div
          className="relative my-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200 dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500 font-medium">
              New here?
            </span>
          </div>
        </motion.div>

        {/* Register link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Link
            to="/register"
            className="flex items-center justify-center w-full py-2.5 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-emerald-300 dark:hover:border-emerald-700 font-medium transition-all duration-200 text-sm"
          >
            Create an account
          </Link>
        </motion.div>

        {/* Footer text */}
        <motion.p
          className="text-center text-slate-400 dark:text-slate-500 text-xs mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          Enterprise Employee Retention Platform
        </motion.p>
      </motion.div>
    </div>
  );
};

export default Login;
