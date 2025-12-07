import React, { Suspense, lazy, useEffect, ComponentType, LazyExoticComponent, ReactElement, useState, useMemo } from 'react';
import { Navigate, useLocation, useParams, useNavigate, type RouteObject } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { PageTransition } from './components/PageTransition';
import { LoadingOverlay } from './components/LoadingOverlay';
import { AppLaunchAnimation } from './components/AppLaunchAnimation';
import { useGlobalDataCache } from './hooks/useGlobalDataCache';
import { useOnboarding } from './hooks/useOnboarding';
import { OnboardingTutorial } from './components/OnboardingTutorial';

import { SkipToContent } from './components/SkipToContent';
import { DataManagement } from './pages/DataManagement';
import { ActivationComponent } from './components/ActivationComponent';
import { LicenseProvider, useLicense } from './providers/LicenseProvider';
import { Settings } from './pages/Settings';
import { ModelDownloadPrompt } from './components/ModelDownloadPrompt';
import { Toaster } from "@/components/ui/toaster";
import { ProjectProvider, useProject } from './contexts/ProjectContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProtectedRoute } from './components/AuthProtectedRoute';
import { ReasoningDashboard } from './components/ReasoningDashboard';
import { subscribeToThresholdChanges } from './config/riskThresholds';
import { useToast } from './hooks/use-toast';
import { appLogger } from './utils/logger';
import thresholdSyncService from './services/thresholdSyncService';
import ErrorBoundary from './components/ErrorBoundary';
import { errorReporter } from './utils/errorReporting';
import { KeepAliveRoutes } from './components/KeepAliveRoutes';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a stable QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});


// Web application - not running in Electron
const isElectron = false;

// Get the app version from environment variable or default
const envVersion = import.meta.env.VITE_APP_VERSION;
const appVersion = envVersion || '1.0.0';

// Environment information logged silently in production

// Define AIModelType locally since we're not importing AIModelSelection
type AIModelType =
  | 'local'
  | 'openai'
  | 'auto'
  | 'microsoft'
  | 'qwen'
  | 'mistral'
  | 'ibm';

const VALID_AI_MODEL_TYPES: readonly AIModelType[] = (
  ['local', 'openai', 'auto', 'microsoft', 'qwen', 'mistral', 'ibm'] as const
);

const isValidAiModelType = (value: unknown): value is AIModelType =>
  typeof value === 'string' && (VALID_AI_MODEL_TYPES as readonly string[]).includes(value as string);

// Define extended type for lazy components with preload capability
interface PreloadableComponent<T extends ComponentType<any>> extends LazyExoticComponent<T> {
  preload: () => Promise<{ default: T }>;
}

// Preload components in the background
const preloadComponent = <T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): PreloadableComponent<T> => {
  const Component = lazy(factory) as PreloadableComponent<T>;
  Component.preload = factory;
  return Component;
};

// Lazy load pages (excluding Settings)
const Home = preloadComponent(() => import('./pages/Home').then(module => ({ default: module.Home })));
const AIAssistant = preloadComponent(() => import('./pages/AIAssistant').then(module => ({ default: module.AIAssistant })));
const Playground = preloadComponent(() => import('./pages/Playground').then(module => ({ default: module.Playground })));
const Diagnostics = preloadComponent(() => import('./pages/Diagnostics').then(module => ({ default: module.default })));
const KnowledgeBase = preloadComponent(() => import('./pages/KnowledgeBase').then(module => ({ default: module.default })));
const Admin = preloadComponent(() => import('./pages/admin/Admin').then(module => ({ default: module.Admin })));

// Start preloading main components in the background
Home.preload();
AIAssistant.preload();
Playground.preload();

// Simple wrapper for the reasoning dashboard route
const ReasoningRoute: React.FC = () => {
  const { hrCode } = useParams<{ hrCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const employeeName = (location.state as { employeeName?: string } | null)?.employeeName ?? '';

  const handleClose = () => navigate(-1);

  if (!hrCode) {
    return <div className="p-4 text-center text-red-600">Invalid employee code</div>;
  }

  return (
    <ReasoningDashboard
      hrCode={hrCode}
      employeeName={employeeName}
      onClose={handleClose}
      isPerformanceMode={(typeof window !== 'undefined') && (localStorage.getItem('settings.dataMode') === 'performance')}
    />
  );
};

// Inner component to render UI based on auth state (license checks disabled)
function AppContent(): ReactElement {
  const location = useLocation();
  const { apiAvailable: licenseApiAvailable } = useLicenseProviderStateCheck();
  const { fetchHomeData, fetchAIAssistantData, fetchPlaygroundData } = useGlobalDataCache();
  const { showOnboarding, completeOnboarding } = useOnboarding();
  // DISABLED: License checks - keeping for future use
  // const { licenseStatus, isLoading: isLicenseLoading, error: licenseError, isLicensed, gracePeriodEnds } = useLicense();
  const { licenseTier } = useLicense(); // Keep licenseTier for Header display
  // Get project context
  const { activeProject, isLoadingProject } = useProject();
  const { toast } = useToast();
  // Get auth context
  const { isAuthenticated } = useAuth();

  // --- State for LLM Model Handling ---
  const [isModelMissing, setIsModelMissing] = useState<boolean>(false);
  const [llmInitError, setLlmInitError] = useState<string | null>(null);
  const [selectedAIModel, setSelectedAIModel] = useState<AIModelType | null>(null);
  const [hasLoadedAiPreference, setHasLoadedAiPreference] = useState<boolean>(false);
  const [hasShownModelSelection, setHasShownModelSelection] = useState<boolean>(true); // Skip model selection
  // LLM API is handled server-side via FastAPI
  // --- End State for LLM Model Handling ---

  useEffect(() => {
    // Load AI model preference from localStorage
    const stored = localStorage.getItem('churnvision-ai-model-type');
    let resolved: AIModelType = 'local'; // Default to local (ChurnVision Local - Qwen 3 4B)

    if (stored && isValidAiModelType(stored)) {
      resolved = stored as AIModelType;
    }

    if (resolved === 'auto') {
      resolved = 'local'; // Auto resolves to local (ChurnVision Local - Qwen 3 4B)
    }

    setSelectedAIModel(resolved);
    setHasShownModelSelection(true);
    setHasLoadedAiPreference(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleProviderBroadcast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isValidAiModelType(detail)) {
        setSelectedAIModel(detail);
        setHasShownModelSelection(true);
        setHasLoadedAiPreference(true);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'churnvision-ai-model-type' && event.newValue && isValidAiModelType(event.newValue)) {
        setSelectedAIModel(event.newValue);
        setHasShownModelSelection(true);
        setHasLoadedAiPreference(true);
      }
    };

    window.addEventListener('churnvision:ai-provider-changed', handleProviderBroadcast);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('churnvision:ai-provider-changed', handleProviderBroadcast);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Effect to preload data when authenticated AND project is ready
  useEffect(() => {
    const abortController = new AbortController();

    const preloadAppData = async () => {
      // Ensure we have a project ID before fetching
      const projectId = activeProject?.id;
      if (!projectId) {
        // No active project ID found, skipping data preload
        return;
      }

      try {
        // Preloading application data silently in production
        // Pass projectId to fetch functions with abort signal
        await Promise.all([
          fetchHomeData(projectId),
          fetchAIAssistantData(projectId),
          fetchPlaygroundData(projectId)
        ]);

        if (!abortController.signal.aborted) {
          appLogger.info(`[AppContent Preload] Application data preloaded for projectId: ${projectId}.`);
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          appLogger.error('Error preloading application data:', error as any);
        }
      }
    };

    // Trigger preload only if authenticated and project context is loaded and a project is active
    if (isAuthenticated && !isLoadingProject && activeProject) {
      preloadAppData();
    } else if (isAuthenticated && !isLoadingProject && !activeProject) {
      // Handle case where user is authenticated but no project is active
      // Authenticated but no active project after loading - handled silently in production
    }

    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [isAuthenticated, activeProject, isLoadingProject, fetchHomeData, fetchAIAssistantData, fetchPlaygroundData]);

  // Effect for prefetching components
  useEffect(() => {
    const prefetchNextComponents = () => {
      if (location.pathname === '/') {
        AIAssistant.preload();
        Playground.preload();
      } else if (location.pathname === '/ai-assistant') {
        Playground.preload();
        Home.preload();
      } else if (location.pathname === '/playground') {
        AIAssistant.preload();
        Home.preload();
      } else if (location.pathname.startsWith('/reasoning')) {
        AIAssistant.preload();
        Home.preload();
      } else if (location.pathname.startsWith('/diagnostics')) {
        Home.preload();
      }
    };
    prefetchNextComponents();
  }, [location.pathname]);

  // === LLM Status Handling (Server-Side) ===
  // LLM status is now managed by the FastAPI backend
  // No client-side listeners needed for web application
  useEffect(() => {
    // For web application, LLM is always available via API
    setIsModelMissing(false);
    setLlmInitError(null);
  }, []);

  // === Effect for Risk Threshold Change Notifications ===
  useEffect(() => {
    // Subscribe globally to risk threshold changes and show a subtle toast
    const unsubscribe = subscribeToThresholdChanges((newConfig) => {
      const highPct = Math.round(newConfig.current.highRisk * 100);
      const medPct = Math.round(newConfig.current.mediumRisk * 100);
      toast({
        title: 'Risk thresholds recalibrated',
        description: `High > ${highPct}%, Medium > ${medPct}%`,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [toast]);

  // === Effect for Threshold Synchronization ===
  useEffect(() => {
    // Sync thresholds with backend when project loads
    // This ensures risk levels are consistent with backend calculations
    if (activeProject?.id) {
      // Immediate sync on project load
      thresholdSyncService.syncWithBackend().then((result) => {
        if (result.success) {
          appLogger.info('Risk thresholds synced with backend:', result.message);
        }
      });

      // Start automatic threshold sync with backend every 30 minutes
      thresholdSyncService.startAutoSync(30);
      appLogger.info('Started threshold sync service');
    }

    return () => {
      thresholdSyncService.stopAutoSync();
    };
  }, [activeProject?.id]);

  // === Effect for AI Model Type Selection - Web Default ===
  useEffect(() => {
    // For web application, ensure defaults are set
    if (!hasShownModelSelection && hasLoadedAiPreference && selectedAIModel === null) {
      // Default to local (ChurnVision Local - Qwen 3 4B)
      setSelectedAIModel('local');
      setHasShownModelSelection(true);
      localStorage.setItem('churnvision-first-launch', 'completed');
      localStorage.setItem('churnvision-ai-model-type', 'local');
    }
  }, [
    hasShownModelSelection,
    hasLoadedAiPreference,
    selectedAIModel,
  ]);

  // Memoize routes before any conditional returns so hook order stays consistent
  const allRoutes = useMemo<RouteObject[]>(() => [
    // Public routes (login/register)
    {
      path: '/login',
      element: isAuthenticated ? <Navigate to="/" replace /> : <Login />,
    },
    {
      path: '/register',
      element: isAuthenticated ? <Navigate to="/" replace /> : <Register />,
    },
    // Protected routes (require authentication)
    {
      path: '/',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <Home />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/ai-assistant',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <ProtectedRoute feature="ai-assistant">
              <AIAssistant />
            </ProtectedRoute>
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/playground',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <ProtectedRoute feature="playground">
              <Playground />
            </ProtectedRoute>
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/data-management',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <DataManagement />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/reasoning/:hrCode',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <ReasoningRoute />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/settings',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <Settings />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/diagnostics',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <Diagnostics />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/knowledge-base',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <KnowledgeBase />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '/admin',
      element: (
        <AuthProtectedRoute>
          <PageTransition>
            <Admin />
          </PageTransition>
        </AuthProtectedRoute>
      ),
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ], [isAuthenticated]);

  // === Conditional Rendering (using context values) ===

  // DISABLED: License checks - now using authentication instead
  // Keeping license code for future use but currently bypassed
  /*
  if (isLicenseLoading) {
    return (
      <div className="fixed inset-0 flex flex-col">
        <LoadingOverlay isLoading={true} text="Initializing application..." />
      </div>
    );
  }

  // Handle critical license errors
  if (licenseStatus === 'ERROR' || licenseError) {
     return (
       <div className="fixed inset-0 flex items-center justify-center p-4 bg-red-100">
         <div className="text-center text-red-700">
           <h2 className="text-xl font-bold mb-2">Application Error</h2>
           <p>{licenseError || 'A critical error occurred with the license system.'}</p>
           <p>Please restart the application or contact support.</p>
         </div>
       </div>
     );
  }

  // --- License / Activation Checks ---
  // Show activation only (1) on first app launch, or (2) when license time has passed (expired/revoked).
  if (!isLicensed) {
    // First-launch detection stored in localStorage so it only triggers once per user profile
    const FIRST_RUN_KEY = 'cv-license-first-run-shown';
    const hasShownFirstRun = typeof window !== 'undefined' && window.localStorage?.getItem(FIRST_RUN_KEY) === '1';

    // If license is expired or revoked, block with activation screen
    if (licenseStatus === 'EXPIRED' || licenseStatus === 'REVOKED') {
      return (
        <div className="h-full flex items-center justify-center bg-surface-muted text-neutral-muted">
          {licenseStatus === 'EXPIRED' && (
            <div className="text-center p-4">
              <h2 className="text-xl font-semibold mb-2">License Expired</h2>
              <p className="mb-4">Your license has expired. Please activate with a new key.</p>
              <ActivationComponent />
            </div>
          )}
          {licenseStatus === 'REVOKED' && (
            <div className="text-center p-4">
              <h2 className="text-xl font-semibold mb-2">License Revoked</h2>
              <p>Your license has been revoked. Please contact support.</p>
            </div>
          )}
        </div>
      );
    }

    // Show activation screen only once on the first ever launch when unlicensed
    if (!hasShownFirstRun && (licenseStatus === 'UNLICENSED' || licenseStatus === 'UNKNOWN' || licenseStatus === 'INACTIVE' || licenseStatus === 'PENDING' || licenseStatus === 'INVALID')) {
      // Set the flag so we don't show it on subsequent launches unless expired/revoked
      try { window.localStorage?.setItem(FIRST_RUN_KEY, '1'); } catch {}
      return (
        <div className="h-full flex items-center justify-center bg-surface-muted text-neutral-muted">
          <ActivationComponent />
        </div>
      );
    }
    // Otherwise, do not block the app UI for unlicensed state; allow usage with feature gating elsewhere
  }
  // --- End License / Activation Checks ---
  */

  // DISABLED: LLM Model Checks - keeping for future use
  /*
  // --- LLM Model Checks (Only if licensed and local model selected) ---
  if (isLicensed && selectedAIModel === 'local' && isModelMissing) {
    return <ModelDownloadPrompt />;
  }

  // Check if we should show LLM errors
  const shouldShowLlmError = isLicensed && llmInitError && (() => {
    const isLocalModelError = llmInitError.includes('native AI module') || llmInitError.includes('LLM service failed to load');

      appLogger.debug('AppContent: Error check - isLicensed:', { isLicensed, hasLlmInitError: !!llmInitError, selectedAIModel });
      appLogger.debug('AppContent: Error check - isLocalModelError:', { isLocalModelError });

    // For all cases, show the error
    // Will show LLM error silently in production
    return true;
  })();

  if (shouldShowLlmError) {
      // Display error for legitimate initialization failures
      return (
        <div className="flex-1 flex flex-col">
            <div role="alert" className="m-4 p-4 rounded-lg border bg-destructive/10 border-destructive text-destructive">
              <strong className="font-semibold">AI Assistant Error</strong>
              <div className="text-sm">
                The AI service failed to initialize: {llmInitError}
                <br />AI features may be unavailable. Please check your configuration or contact support.
              </div>
            </div>
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                 <p>AI Features are currently unavailable.</p>
            </main>
        </div>
      );
  }
  // --- End LLM Model Checks ---
  */

  // Check if current route is auth page (login/register)
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  // === Main Return (after loading and error checks) ===
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground transition-colors duration-300">
      <SkipToContent />
      {/* Render based on authentication - license checks disabled */}
      <>
        {!isAuthPage && <Header />}
        <main id="main-content" className={`flex-1 ${isAuthPage ? 'bg-background' : 'bg-surface-subtle'} overflow-auto transition-colors duration-300`} tabIndex={-1}>
          <Suspense
            fallback={
              <div
                style={{
                  willChange: 'transform, opacity',
                  transform: 'translate3d(0, 0, 0)',
                  backfaceVisibility: 'hidden',
                }}
              >
                <LoadingOverlay isLoading={true} text="Loading page..." />
              </div>
            }
          >
            <KeepAliveRoutes routes={allRoutes} />
          </Suspense>
        </main>
        {!isAuthPage && <Footer />}
      </>

      {import.meta.env.DEV && (
        <div
          className="fixed bottom-0 right-0 bg-yellow-500 text-black px-2 py-1 text-xs font-mono z-50 cursor-pointer"
        >
          {isElectron ? 'Electron' : 'Browser'} v{appVersion}
        </div>
      )}
      <OnboardingTutorial
        isOpen={showOnboarding}
        onClose={() => completeOnboarding()}
        onComplete={completeOnboarding}
        currentMode="d-level"
      />
    </div>
  );
}

// Helper Hook - no longer needed for web application (removed Electron API check)
const useLicenseProviderStateCheck = () => {
  return { apiAvailable: true }; // Always available via backend API
}

// Main App component now wraps content with the provider
// Explicitly type the component
export const App: React.FC = (): React.ReactElement => {
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setShowLaunchAnimation(false);
      return;
    }

    const minVisibleMs = 2800; // ~2.8 seconds for full animation
    const startTime = performance.now();
    let hasCompleted = false;

    const hideOverlay = () => {
      if (hasCompleted) {
        return;
      }
      hasCompleted = true;

      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, minVisibleMs - elapsed);
      window.setTimeout(() => setShowLaunchAnimation(false), remaining);
    };

    // Don't hide on load - wait for the full animation
    const fallbackTimeout = window.setTimeout(hideOverlay, 3500);

    return () => {
      window.removeEventListener('load', hideOverlay);
      window.clearTimeout(fallbackTimeout);
    };
  }, []);

  // === Effect Hooks (must be unconditional at top level) ===
  // Keep simple effects like keydown listener here if they don't depend on license state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Wrap the AppContent with the imported providers and error boundaries
  return (
    <>
      <AppLaunchAnimation
        isVisible={showLaunchAnimation}
        versionLabel={appVersion ? `v${appVersion}` : undefined}
      />
      <ErrorBoundary
        level="critical"
        showDetails={process.env.NODE_ENV === 'development'}
        onError={(error, errorInfo) => {
          errorReporter.report({
            message: error.message,
            stack: error.stack,
            context: 'App Root',
            level: 'error',
            source: 'boundary',
            metadata: {
              componentStack: errorInfo.componentStack,
            },
          });
        }}
      >
        <LicenseProvider>
          <ErrorBoundary level="page" showDetails={process.env.NODE_ENV === 'development'}>
            <ProjectProvider>
              <QueryClientProvider client={queryClient}>
                <ErrorBoundary level="component">
                  <AppContent />
                </ErrorBoundary>
                <Toaster />
              </QueryClientProvider>
            </ProjectProvider>
          </ErrorBoundary>
        </LicenseProvider>
      </ErrorBoundary>
    </>
  );
};

export default App;
