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
import { ReasoningDashboard } from './components/ReasoningDashboard';
import { subscribeToThresholdChanges } from './config/riskThresholds';
import { useToast } from './hooks/use-toast';
import { appLogger } from './utils/logger';
import thresholdSyncService from './services/thresholdSyncService';
import ErrorBoundary from './components/ErrorBoundary';
import { errorReporter } from './utils/errorReporting';
import { KeepAliveRoutes } from './components/KeepAliveRoutes';


// Check if we're running in Electron - use the environment variable from Vite config
const isElectron = import.meta.env.VITE_IS_ELECTRON === true ||
                  (typeof window !== 'undefined' && (window as any).electronApi !== undefined); // Use type assertion as fallback

// Check for version override in URL parameters
const getVersionFromUrl = () => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('appVersion');
  }
  return null;
};

// Get version from Electron directly if available
const getElectronVersion = () => {
  if (typeof window !== 'undefined' && (window as any).electronApi && (window as any).electronApi.getAppVersion) {
    return (window as any).electronApi.getAppVersion();
  }
  return null;
};

// Get the app version from different sources in priority order:
// 1. Electron API (most authoritative)
// 2. URL parameter (passed by Electron main process)
// 3. Environment variable (from build)
// 4. Default fallback
const electronVersion = getElectronVersion();
const urlVersion = getVersionFromUrl();
const envVersion = import.meta.env.VITE_APP_VERSION;
const appVersion = electronVersion || urlVersion || envVersion || '1.0.0';

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

// Inner component to render UI based on license state from context
function AppContent(): ReactElement {
  const location = useLocation();
  const { apiAvailable: licenseApiAvailable } = useLicenseProviderStateCheck();
  const { fetchHomeData, fetchAIAssistantData, fetchPlaygroundData } = useGlobalDataCache();
  const { showOnboarding, completeOnboarding } = useOnboarding();
  const { licenseStatus, isLoading: isLicenseLoading, error: licenseError, isLicensed, gracePeriodEnds } = useLicense();
  // Get project context
  const { activeProject, isLoadingProject } = useProject(); 
  const { toast } = useToast();

  // --- State for LLM Model Handling ---
  const [isModelMissing, setIsModelMissing] = useState<boolean>(false);
  const [llmInitError, setLlmInitError] = useState<string | null>(null);
  const [selectedAIModel, setSelectedAIModel] = useState<AIModelType | null>(null);
  const [hasLoadedAiPreference, setHasLoadedAiPreference] = useState<boolean>(false);
  const [hasShownModelSelection, setHasShownModelSelection] = useState<boolean>(true); // Skip model selection
  const llmApi = (window as any)?.electronApi?.llm;
  // --- End State for LLM Model Handling ---

  useEffect(() => {
    let isMounted = true;

    const resolvePreferredModel = async () => {
      let resolved: AIModelType | null = null;

      try {
        if (typeof window !== 'undefined' && (window as any).electronApi?.ai?.getModelType) {
          const response = await (window as any).electronApi.ai.getModelType();
          if (isValidAiModelType(response?.modelType)) {
            resolved = response.modelType;
          }
        }
      } catch (error) {
        // Ignore errors and fall back to stored preference/local default
      }

      if (!resolved && typeof window !== 'undefined') {
        const stored = localStorage.getItem('churnvision-ai-model-type');
        if (stored && isValidAiModelType(stored)) {
          resolved = stored as AIModelType;
        }
      }

      if (!resolved) {
        resolved = 'local';
      }

      if (resolved === 'auto') {
        resolved = 'local';
      }

      if (isMounted) {
        setSelectedAIModel(resolved);
        setHasShownModelSelection(true);
        setHasLoadedAiPreference(true);
      }
    };

    resolvePreferredModel();

    return () => {
      isMounted = false;
    };
  }, [licenseApiAvailable]);

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

  // Effect to preload data when licensed AND project is ready
  useEffect(() => {
    const abortController = new AbortController();
    
    const preloadAppData = async () => {
      // Ensure we have a project ID before fetching
      const projectId = activeProject?.dbPath;
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

    // Trigger preload only if licensed and project context is loaded and a project is active
    if (isLicensed && !isLoadingProject && activeProject) {
      preloadAppData();
    } else if (isLicensed && !isLoadingProject && !activeProject) {
        // Handle case where user is licensed but no project is active (e.g., clear data?)
        // Licensed but no active project after loading - handled silently in production
        // Example: useGlobalDataCache.getState().resetCache(); // Reverted: Let ProjectProvider handle this.
    }
    
    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [isLicensed, activeProject, isLoadingProject, fetchHomeData, fetchAIAssistantData, fetchPlaygroundData]);

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

  // === Effect for LLM Status Listeners ===
  useEffect(() => {
    // Only run listeners if in Electron environment and API is available
    if (!licenseApiAvailable || !llmApi) {
        // LLM API not available, skipping listeners
        return;
    }

    // Setting up LLM status listeners silently in production

    const handleModelMissing = () => {
        // LLM Model Missing detected - handled silently in production
        // If local model was selected but is missing, show download prompt
        if (selectedAIModel === 'local') {
          setIsModelMissing(true);
        } else if (!hasShownModelSelection) {
          // If no model type selected yet, show selection
          setHasShownModelSelection(true);
        }
        setLlmInitError(null); // Clear any previous init error as model is confirmed missing
    };
    const unsubscribeMissing = llmApi.onModelMissing(handleModelMissing);

    const handleInitFailed = (errorDetails: { error: string }) => {
        // LLM Initialization Failed - logged silently in production
        
        // Local model error detected - logged silently in production
        
        // For legitimate errors, set the error state
        setLlmInitError(errorDetails.error);
        // If initialization failed, the model is not ready.
        // Do not set isModelMissing to false here.
        // The ModelDownloadPrompt might still be relevant if the failure is due to a missing/corrupt model.
        // If llm-model-missing was received, isModelMissing will be true.
        // If llm-model-missing was NOT received, and init fails for other reasons,
        // we are not in a "model missing" state for the download prompt, but an "init error" state.
        // The prompt is specifically for "missing model".
    };
    const unsubscribeFailed = llmApi.onInitializationFailed(handleInitFailed);

    const handleStatusUpdate = (status: { ready: boolean; error: string | null }) => {
        // LLM Status Update Received - logged silently in production
        if (status.ready) {
            setIsModelMissing(false); // Model is confirmed ready and loaded
            setLlmInitError(null);
        } else {
            // If status is not ready, the model is not usable.
            // Do not set isModelMissing to false. It should remain true if previously set by onModelMissing.
            if (status.error) {
                setLlmInitError(status.error); // Store the error
            }
            // isModelMissing should not be flipped to false here, as the model is not ready.
        }
    };
    const unsubscribeStatus = llmApi.onLlmStatusUpdate(handleStatusUpdate);

    // After listeners are set up, proactively request current LLM status from main process
    // Requesting current LLM status from main process silently in production
    llmApi.requestLlmStatusUpdate()
      .then(() => {
        // LLM status update response received silently in production
      })
      .catch(() => {
        // Error requesting LLM status - logged silently in production
      });

    // Cleanup
    return () => {
      // Cleaning up LLM status listeners silently in production
      unsubscribeMissing();
      unsubscribeFailed();
      unsubscribeStatus();
    };
    // Rerun if licenseApiAvailable or llmApi changes (though unlikely)
  }, [licenseApiAvailable, llmApi]);

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
    // Start automatic threshold sync with backend every 30 minutes
    // Only start if we have a project database path
    if (activeProject?.dbPath) {
      thresholdSyncService.startAutoSync(30, activeProject.dbPath);
      appLogger.info('Started threshold sync service');
    }

    return () => {
      thresholdSyncService.stopAutoSync();
    };
  }, [activeProject?.dbPath]);

  // === Effect for AI Model Type Selection - Auto-set to Local ===
  useEffect(() => {
    // Only check for AI model selection if licensed and in Electron environment
    if (
      !isLicensed ||
      !licenseApiAvailable ||
      hasShownModelSelection ||
      !hasLoadedAiPreference ||
      selectedAIModel !== null
    ) {
      return;
    }

    const autoSetLocal = async () => {
      // Auto-setting AI model to local silently in production
      setSelectedAIModel('local');
      setHasShownModelSelection(true);
      
      // Mark first launch as complete
      localStorage.setItem('churnvision-first-launch', 'completed');
      
      // Save preference for future sessions
      try {
        // First try to save via Electron API if available
        if (licenseApiAvailable && (window as any).electronApi?.ai) {
          await (window as any).electronApi.ai.setModelType('local');
          // AI model type saved via Electron API silently in production
          
          // Test local connection after setting the type
          try {
            const testResult = await (window as any).electronApi.ai.testOllamaConnection();
            if (testResult.success) {
              // Local connection test successful after auto-set silently in production
            } else {
              // Local connection test failed after auto-set silently in production
            }
          } catch (testError) {
            // Error testing local connection after auto-set silently in production
          }
        } else {
          // Fallback to localStorage
          localStorage.setItem('churnvision-ai-model-type', 'local');
          // AI model type saved via localStorage silently in production
        }
      } catch (error) {
        // Failed to save AI model type silently in production
        // Always try localStorage as backup
        localStorage.setItem('churnvision-ai-model-type', 'local');
      }
    };

    autoSetLocal();
  }, [
    isLicensed,
    licenseApiAvailable,
    hasShownModelSelection,
    hasLoadedAiPreference,
    selectedAIModel,
  ]);

  // Memoize routes before any conditional returns so hook order stays consistent
  const licensedRoutes = useMemo<RouteObject[]>(() => [
    {
      path: '/',
      element: (
        <PageTransition>
          <Home />
        </PageTransition>
      ),
    },
    {
      path: '/ai-assistant',
      element: (
        <PageTransition>
          <ProtectedRoute feature="ai-assistant">
            <AIAssistant />
          </ProtectedRoute>
        </PageTransition>
      ),
    },
    {
      path: '/playground',
      element: (
        <PageTransition>
          <ProtectedRoute feature="playground">
            <Playground />
          </ProtectedRoute>
        </PageTransition>
      ),
    },
    {
      path: '/data-management',
      element: (
        <PageTransition>
          <DataManagement />
        </PageTransition>
      ),
    },
    {
      path: '/reasoning/:hrCode',
      element: (
        <PageTransition>
          <ReasoningRoute />
        </PageTransition>
      ),
    },
    {
      path: '/settings',
      element: (
        <PageTransition>
          <Settings />
        </PageTransition>
      ),
    },
    {
      path: '/diagnostics',
      element: (
        <PageTransition>
          <Diagnostics />
        </PageTransition>
      ),
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ], []);

  // === Conditional Rendering (using context values) ===
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
            {/* Render the rest of the UI below the error */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                 {/* Fallback content or disable AI features in child components */}
                 <p>AI Features are currently unavailable.</p>
            </main>
        </div>
      );
  }
  // --- End LLM Model Checks ---

  // === Main Return (after loading and error checks) ===
  return (
      <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground transition-colors duration-300">
        <SkipToContent />
        {/* Render based on license status */}
        {isLicensed ? (
          <>
            <Header />
            <main id="main-content" className="flex-1 bg-surface-subtle overflow-auto transition-colors duration-300" tabIndex={-1}>
              {licenseStatus === 'GRACE_PERIOD' && gracePeriodEnds &&
                 <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-2 text-sm text-center" role="alert"> 
                     Warning: Operating in grace period. Connection to license server needed soon. Expires: {new Date(gracePeriodEnds).toLocaleString()}
                 </div>
              }
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
                <KeepAliveRoutes routes={licensedRoutes} />
              </Suspense>
            </main>
            <Footer />
          </>
        ) : (
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
              {licenseStatus === 'ERROR' && (
                   <div className="text-center p-4">
                      <h2 className="text-xl font-semibold mb-2">Application Error</h2>
                      <p className="mb-4">{licenseError || "An error occurred checking the license."}</p>
                  </div>
              )}
              {licenseStatus === 'INVALID' && (
                   <div className="text-center p-4">
                      <h2 className="text-xl font-semibold mb-2">Invalid License</h2>
                      <p className="mb-4">{licenseError || "The provided license key is invalid."}</p>
                      <ActivationComponent />
                  </div>
              )}
              {(licenseStatus === 'UNKNOWN' || licenseStatus === 'INACTIVE' || licenseStatus === 'PENDING' || licenseStatus === 'UNLICENSED') && (
                  <ActivationComponent />
              )}
          </div>
        )}
        
        {import.meta.env.DEV && (
           <div 
             className="fixed bottom-0 right-0 bg-yellow-500 text-black px-2 py-1 text-xs font-mono z-50 cursor-pointer"
           >
             {isElectron ? 'Electron' : 'Browser'} v{appVersion}
           </div>
        )}
        {isLicensed && (
          <OnboardingTutorial 
            isOpen={showOnboarding} 
            onClose={() => completeOnboarding()}
            onComplete={completeOnboarding} 
            currentMode="d-level"
          />
        )}

      </div>
  );
}

// Helper Hook to check API availability (avoids repeating window check)
const useLicenseProviderStateCheck = () => {
    const [apiAvailable, setApiAvailable] = useState(false);
    useEffect(() => {
        const api = (window as any).electronLicenseApi as any | undefined;
        setApiAvailable(!!(api && typeof api === 'object'));
    }, []);
    return { apiAvailable };
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

    const minVisibleMs = 900;
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

    if (document.readyState === 'complete') {
      requestAnimationFrame(hideOverlay);
    } else {
      window.addEventListener('load', hideOverlay, { once: true });
    }

    const fallbackTimeout = window.setTimeout(hideOverlay, 2400);

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
              <ErrorBoundary level="component">
                <AppContent />
              </ErrorBoundary>
              <Toaster />
            </ProjectProvider>
          </ErrorBoundary>
        </LicenseProvider>
      </ErrorBoundary>
    </>
  );
};

export default App;
