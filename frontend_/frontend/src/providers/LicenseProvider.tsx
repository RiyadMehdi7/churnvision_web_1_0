import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import type { LicenseState } from '../types/electron'; // Import the type

// --- License Tier Types ---
export type LicenseTier = 'starter' | 'pro' | 'enterprise';

// Define feature access by license tier
const FEATURE_ACCESS: Record<LicenseTier, string[]> = {
  starter: ['home', 'data-management', 'settings'],
  pro: ['home', 'data-management', 'settings', 'ai-assistant'],
  enterprise: ['home', 'data-management', 'settings', 'ai-assistant', 'playground']
};

// --- Define the expected API shape from Preload ---
// IMPORTANT: Keep this in sync with preload.ts exposeInMainWorld
// Consider placing this in a shared types file (e.g., src/types/electron.d.ts)
// and declaring it globally on the Window interface.
interface ElectronLicenseApi {
  activate: (
    activationKey: string
  ) => Promise<{ success: boolean; licenseData: any | null; error: string | null }>;
  getStatus: () => Promise<{ // The getStatus IPC handler now returns the *local* state after refresh attempt
    status: string;
    data: any | null;
    gracePeriodEnds?: number;
    error?: string; // Include potential error from getLocalState
  }>;
  getLocalState: () => Promise<LicenseState>; // Use imported type
  getInstallationId: () => Promise<string>;
  onStateChange: (callback: (state: LicenseState) => void) => () => void; // Returns cleanup function
  removeStateChangedListener: (callback: (...args: any[]) => void) => void;
}

// --- Augment the Window interface (optional but good practice) ---
// Create a file like src/types/electron.d.ts and add:
/*
declare global {
  interface Window {
    electronLicenseApi: ElectronLicenseApi;
  }
}
export {}; // Make it a module
*/

// --- Context Setup ---
interface LicenseContextType {
  licenseStatus: string; // Changed from licenseState to avoid naming clash with state variable
  licenseData: any | null;
  isLoading: boolean;
  error: string | null;
  isLicensed: boolean; // Convenience flag derived from status
  gracePeriodEnds?: number;
  installationId: string | null;
  activateLicense: (key: string) => Promise<boolean>; // Returns success status
  refreshStatus: () => Promise<void>; // Made async to allow awaiting
  // License tier functionality
  licenseTier: LicenseTier;
  hasAccess: (feature: string) => boolean;
  setLicenseTier: (tier: LicenseTier) => void;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

interface LicenseProviderProps {
  children: ReactNode;
}

export const LicenseProvider: React.FC<LicenseProviderProps> = ({ children }) => {
  // Renamed state variable for clarity
  const [currentLicenseState, setCurrentLicenseState] = useState<LicenseState>({ status: 'UNKNOWN', data: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installationId, setInstallationId] = useState<string | null>(null);
  
  // License tier state
  const [licenseTier, setLicenseTierState] = useState<LicenseTier>('starter');

  // Check for API availability only once on mount
  const [apiAvailable, setApiAvailable] = useState(false);

  // Function to detect license tier from license data
  const detectLicenseTier = useCallback((licenseData: any): LicenseTier => {
    if (!licenseData) return 'starter';

    // Check for tier in license data
    if (licenseData.tier) {
      const tier = licenseData.tier.toLowerCase();
      if (['starter', 'pro', 'enterprise'].includes(tier)) {
        return tier as LicenseTier;
      }
    }

    // Check for plan or product field
    if (licenseData.plan) {
      const plan = licenseData.plan.toLowerCase();
      if (plan.includes('enterprise') || plan.includes('corporate')) return 'enterprise';
      if (plan.includes('advanced') || plan.includes('pro')) return 'pro';
      return 'starter';
    }

    // Check for product field
    if (licenseData.product) {
      const product = licenseData.product.toLowerCase();
      if (product.includes('enterprise') || product.includes('corporate')) return 'enterprise';
      if (product.includes('advanced') || product.includes('pro')) return 'pro';
      return 'starter';
    }

    // Default to starter if no tier information found
    return 'starter';
  }, []);

  // Update license tier when license data changes
  useEffect(() => {
    const newTier = detectLicenseTier(currentLicenseState.data);
    setLicenseTierState(newTier);
    
    // Also store in localStorage for persistence
    localStorage.setItem('licenseTier', newTier);
  }, [currentLicenseState.data, detectLicenseTier]);

  // Load cached license tier on mount
  useEffect(() => {
    const cachedTier = localStorage.getItem('licenseTier') as LicenseTier;
    if (cachedTier && ['starter', 'pro', 'enterprise'].includes(cachedTier)) {
      setLicenseTierState(cachedTier);
    }
  }, []);

  const setLicenseTier = useCallback((tier: LicenseTier) => {
    setLicenseTierState(tier);
    localStorage.setItem('licenseTier', tier);
  }, []);

  const hasAccess = useCallback((feature: string): boolean => {
    return FEATURE_ACCESS[licenseTier].includes(feature);
  }, [licenseTier]);

  useEffect(() => {
    // Check if the API is exposed by the preload script
    // Use type assertion for safety when accessing window properties
    const api = (window as any).electronLicenseApi as ElectronLicenseApi | undefined;
    if (api && typeof api === 'object') {
      // Electron License API found silently in production
      setApiAvailable(true);
    } else {
      // Electron License API not found - logged silently in production
      // Instead of setting a critical error, set a default non-licensed state
      // setError('Critical error: Application bridge not loaded. Cannot manage license.');
      setCurrentLicenseState({ status: 'INACTIVE', data: null }); // Default to INACTIVE
      setIsLoading(false);
      setApiAvailable(false); // Explicitly mark API as unavailable
    }
  }, []);


  // Fetch initial state and installation ID once API is confirmed available
  useEffect(() => {
    if (!apiAvailable) return; // Don't proceed if API isn't there

    let isMounted = true;
    const api = (window as any).electronLicenseApi as ElectronLicenseApi; // API is available here

    const fetchInitialData = async () => {
      if (!isMounted) return; // Prevent updates if unmounted
      setIsLoading(true);
      setError(null);
      try {
        // Fetch Installation ID
        const id = await api.getInstallationId();
        if (isMounted) {
            setInstallationId(id);
            // Fetched Installation ID silently in production
        } else return;

        // Fetch local state
        // Fetching initial license state silently in production
        const initialState = await api.getLocalState();
        if (isMounted) {
            // Received initial license state silently in production
            setCurrentLicenseState(initialState);

            // Trigger a background refresh *after* setting initial state
            // No need to await this here, let the listener handle updates
             api.getStatus().catch(() => {
                // Initial background status refresh failed silently in production
                // State will be updated via listener if main process determines change needed
             });
        }

      } catch (err: any) { // Catch unknown
        // Error fetching initial license state silently in production
        if (isMounted) {
          setError(err?.message || "Could not load license information.");
          setCurrentLicenseState({ status: 'ERROR', data: null });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchInitialData();

    return () => { isMounted = false; }; // Cleanup mount flag

  }, [apiAvailable]); // Depend only on apiAvailable


  // Listen for state changes pushed from the main process
  useEffect(() => {
    if (!apiAvailable) return; // Don't attach listener if API isn't there

    const api = (window as any).electronLicenseApi as ElectronLicenseApi; // API is available here
    // Setting up state change listener silently in production

    // The callback receives the *entire* new state object from main process
    const handleStateChange = (newState: LicenseState) => {
      // Received license-state-changed event silently in production
      setCurrentLicenseState(newState); // Update state directly
      setError(null); // Clear previous errors on state update
      setIsLoading(false); // Ensure loading is stopped if state updates
    };

    // Subscribe and get the cleanup function
    const unsubscribe = api.onStateChange(handleStateChange);
    // Listener attached silently in production

    // Cleanup listener on component unmount
    return () => {
      // Cleaning up state change listener silently in production
      unsubscribe(); // Call the cleanup function returned by onStateChange
    };
  }, [apiAvailable]); // Depend only on apiAvailable


  // --- Exposed Actions ---
  const activateLicense = useCallback(async (key: string): Promise<boolean> => {
    const api = (window as any).electronLicenseApi as ElectronLicenseApi | undefined;
    if (!api) {
      setError("Cannot activate: Application bridge not available.");
      return false;
    }
    setIsLoading(true);
    setError(null);
    try {
        // Call the exposed API function via the bridge
        const result = await api.activate(key);
        // Activation result silently in production
        if (result.success) {
            // No need to manually set state here, main process should broadcast
            // the new state via 'license-state-changed' event after successful activation.
            setError(null);
            // setIsLoading(false); // Let listener handle this
            return true;
        } else {
            setError(result.error || 'Activation failed.');
            setIsLoading(false); // Stop loading on failure
            return false;
      }
    } catch (err: any) { // catch unknown
      // Error calling activate IPC silently in production
      setError(err.message || 'An unexpected error occurred during activation.');
      setIsLoading(false); // Stop loading on error
      return false;
    }
    // Let the listener handle setting isLoading to false upon state update
  }, [apiAvailable]); // Dependency on apiAvailable

  const refreshStatus = useCallback(async (): Promise<void> => {
    const api = (window as any).electronLicenseApi as ElectronLicenseApi | undefined;
    if (!api) {
      setError("Cannot refresh status: Application bridge not available.");
      return;
    }
    if (isLoading) return; // Prevent multiple refreshes

    // Manually refreshing status silently in production
    setIsLoading(true);
    setError(null);
    try {
        // Call the exposed API function via the bridge
        // The main process handler will call the license service,
        // and if the state changes, the 'license-state-changed' event will fire,
        // updating our state via the listener useEffect.
        await api.getStatus();
        // No need to manually set state here, listener handles it.
        // setIsLoading(false) will be handled by the listener callback.
    } catch(err: any) { // catch unknown
        // Error calling getStatus IPC silently in production
        setError(err.message || "Failed to trigger status refresh.");
        setIsLoading(false); // Ensure loading stops on direct error
    }
    // Loading will be set to false by the listener upon receiving state update or if error caught above
  }, [apiAvailable, isLoading]); // Dependencies


  // Derived state to easily check if the user is licensed
  const isLicensed = useMemo(() => {
      // Consider grace period as licensed for UI purposes
      return currentLicenseState.status === 'ACTIVE' || currentLicenseState.status === 'GRACE_PERIOD';
  }, [currentLicenseState.status]);

  // Memoize the context value
  const value = useMemo(() => ({
    licenseStatus: currentLicenseState.status, // Expose the status string
    licenseData: currentLicenseState.data,
    isLoading,
    error,
    isLicensed,
    // Ensure gracePeriodEnds is treated as a number or undefined
    gracePeriodEnds: typeof currentLicenseState.gracePeriodEnds === 'string'
                        ? parseInt(currentLicenseState.gracePeriodEnds, 10)
                        : currentLicenseState.gracePeriodEnds ?? undefined, // Use nullish coalescing for null/undefined -> undefined
    installationId,
    activateLicense,
    refreshStatus,
    // License tier functionality
    licenseTier,
    hasAccess,
    setLicenseTier
  }), [
      currentLicenseState, // Depend on the whole state object
      isLoading,
      error,
      isLicensed,
      installationId,
      activateLicense,
      refreshStatus,
      licenseTier,
      hasAccess,
      setLicenseTier
    ]);

  return (
    <LicenseContext.Provider value={value}>
      {children}
    </LicenseContext.Provider>
  );
};

// Custom hook to use the LicenseContext
export const useLicense = (): LicenseContextType => {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
};

// Helper function to get license tier display name
export function getLicenseTierDisplayName(tier: LicenseTier): string {
  switch (tier) {
    case 'starter':
      return 'Starter';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return 'Starter';
  }
}

// Helper function to get license tier color classes
export function getLicenseTierColor(tier: LicenseTier): string {
  switch (tier) {
    case 'starter':
      return 'text-gray-600 bg-gray-100 border-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600';
    case 'pro':
      return 'text-blue-600 bg-blue-100 border-blue-300 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-600';
    case 'enterprise':
      return 'text-purple-600 bg-purple-100 border-purple-300 dark:text-purple-400 dark:bg-purple-900/30 dark:border-purple-600';
    default:
      return 'text-gray-600 bg-gray-100 border-gray-300 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600';
  }
} 