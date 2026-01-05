import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    useMemo,
    useCallback,
    ReactNode,
} from 'react';
import api from '@/services/apiService';

interface LicenseState {
    status: string;
    data: any | null;
}

// --- License Tier Types ---
export type LicenseTier = 'starter' | 'pro' | 'enterprise';

// Define feature access by license tier
const FEATURE_ACCESS: Record<LicenseTier, string[]> = {
    starter: ['home', 'data-management', 'settings'],
    pro: ['home', 'data-management', 'settings', 'ai-assistant', 'knowledge-base'],
    enterprise: ['home', 'data-management', 'settings', 'ai-assistant', 'playground', 'knowledge-base', 'gdpr']
};

// --- Context Setup ---
// SECURITY: setLicenseTier removed from public interface to prevent privilege escalation
interface LicenseContextType {
    licenseStatus: string;
    licenseData: any | null;
    isLoading: boolean;
    error: string | null;
    isLicensed: boolean;
    gracePeriodEnds?: number;
    installationId: string | null;
    activateLicense: (key: string) => Promise<boolean>;
    refreshStatus: () => Promise<void>;
    licenseTier: LicenseTier;
    hasAccess: (feature: string) => boolean;
    // SECURITY: setLicenseTier intentionally NOT exposed - tier is server-authoritative
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

interface LicenseProviderProps {
    children: ReactNode;
}

export const LicenseProvider: React.FC<LicenseProviderProps> = ({ children }) => {
    const [currentLicenseState, setCurrentLicenseState] = useState<LicenseState>({ status: 'UNKNOWN', data: null });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installationId, setInstallationId] = useState<string | null>(null);

    // License tier state - ONLY set from server response
    const [licenseTier, setLicenseTierState] = useState<LicenseTier>('starter');

    // Function to detect license tier from license data (server response only)
    const detectLicenseTier = useCallback((licenseData: any): LicenseTier => {
        // SECURITY: Only trust tier from server response, never localStorage
        if (!licenseData) return 'starter';

        // Check for tier in license data (server-provided)
        if (licenseData.tier) {
            const tier = licenseData.tier.toLowerCase();
            if (['starter', 'pro', 'enterprise'].includes(tier)) {
                return tier as LicenseTier;
            }
        }

        // Check for license_type field (from backend LicenseInfo)
        if (licenseData.license_type) {
            const licenseType = licenseData.license_type.toLowerCase();
            if (['starter', 'pro', 'enterprise'].includes(licenseType)) {
                return licenseType as LicenseTier;
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

        // Default to starter (most restrictive)
        return 'starter';
    }, []);

    // Update license tier when license data changes (from server only)
    useEffect(() => {
        const newTier = detectLicenseTier(currentLicenseState.data);
        setLicenseTierState(newTier);
        // SECURITY: Do NOT persist to localStorage - tier must always come from server
    }, [currentLicenseState.data, detectLicenseTier]);

    // SECURITY: No localStorage tier loading - always start at 'starter' until server confirms

    const hasAccess = useCallback((feature: string): boolean => {
        return FEATURE_ACCESS[licenseTier].includes(feature);
    }, [licenseTier]);

    // Fetch initial installation ID and license status
    useEffect(() => {
        let isMounted = true;

        const fetchInitialData = async () => {
            // SECURITY: No DEV_MODE bypass - always validate with server
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);

            try {
                // Fetch Installation ID from backend
                const idResponse = await api.get('/license/installation-id');
                if (isMounted && idResponse.data?.installation_id) {
                    const id = idResponse.data.installation_id;
                    setInstallationId(id);

                    // Fetch license status using the installation ID
                    const statusResponse = await api.get('/license/status', {
                        params: { installation_id: id }
                    });

                    if (isMounted && statusResponse.data) {
                        const { status, tier, license_type, expires_at, grace_period_ends, is_licensed } = statusResponse.data;

                        setCurrentLicenseState({
                            status: status || 'UNLICENSED',
                            data: {
                                tier: tier || license_type,
                                license_type,
                                expires_at,
                                is_licensed
                            }
                        });
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    console.error('Error fetching license data:', err);
                    setError(err.response?.data?.detail || err.message || 'Could not load license information.');
                    setCurrentLicenseState({ status: 'ERROR', data: null });
                    // SECURITY: On error, tier remains at 'starter' (most restrictive)
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchInitialData();

        return () => { isMounted = false; };
    }, []);

    // Listen for license activation events
    useEffect(() => {
        const handleLicenseActivated = (event: CustomEvent) => {
            const licenseData = event.detail;
            setCurrentLicenseState({
                status: 'ACTIVE',
                data: licenseData
            });
            setError(null);

            // Refresh status from backend to confirm (server-authoritative)
            refreshStatus();
        };

        window.addEventListener('license:activated', handleLicenseActivated as EventListener);

        return () => {
            window.removeEventListener('license:activated', handleLicenseActivated as EventListener);
        };
    }, []);

    // --- Exposed Actions ---
    const activateLicense = useCallback(async (key: string): Promise<boolean> => {
        if (!installationId) {
            setError('Installation ID not available. Cannot activate license.');
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await api.post('/license/activate', {
                license_key: key,
                installation_id: installationId
            });

            const result = response.data;

            if (result.success) {
                setCurrentLicenseState({
                    status: 'ACTIVE',
                    data: result.license_data
                });
                setError(null);
                setIsLoading(false);
                return true;
            } else {
                setError(result.message || result.error || 'Activation failed.');
                setIsLoading(false);
                return false;
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || err.message || 'An unexpected error occurred during activation.';
            setError(errorMsg);
            setIsLoading(false);
            return false;
        }
    }, [installationId]);

    const refreshStatus = useCallback(async (): Promise<void> => {
        if (!installationId) {
            setError('Installation ID not available. Cannot refresh status.');
            return;
        }

        if (isLoading) return; // Prevent multiple refreshes

        setIsLoading(true);
        setError(null);

        try {
            const statusResponse = await api.get('/license/status', {
                params: { installation_id: installationId }
            });

            if (statusResponse.data) {
                const { status, tier, license_type, expires_at, grace_period_ends, is_licensed } = statusResponse.data;

                setCurrentLicenseState({
                    status: status || 'UNLICENSED',
                    data: {
                        tier: tier || license_type,
                        license_type,
                        expires_at,
                        is_licensed
                    }
                });
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || err.message || 'Failed to refresh license status.';
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    }, [installationId, isLoading]);

    // --- Derived State ---
    const isLicensed = useMemo(() => {
        const licensedStatuses = ['ACTIVE', 'GRACE_PERIOD'];
        return licensedStatuses.includes(currentLicenseState.status);
    }, [currentLicenseState.status]);

    const gracePeriodEnds = useMemo(() => {
        return currentLicenseState.data?.grace_period_ends || undefined;
    }, [currentLicenseState.data]);

    // --- Context Value ---
    // SECURITY: setLicenseTier NOT included - tier is server-authoritative only
    const value = useMemo<LicenseContextType>(
        () => ({
            licenseStatus: currentLicenseState.status,
            licenseData: currentLicenseState.data,
            isLoading,
            error,
            isLicensed,
            gracePeriodEnds,
            installationId,
            activateLicense,
            refreshStatus,
            licenseTier,
            hasAccess,
        }),
        [
            currentLicenseState,
            isLoading,
            error,
            isLicensed,
            gracePeriodEnds,
            installationId,
            activateLicense,
            refreshStatus,
            licenseTier,
            hasAccess,
        ]
    );

    return (
        <LicenseContext.Provider value={value}>
            {children}
        </LicenseContext.Provider>
    );
};

// --- Custom Hook ---
export const useLicense = (): LicenseContextType => {
    const context = useContext(LicenseContext);
    if (!context) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};

// --- Utility Functions ---
export const getLicenseTierDisplayName = (tier: LicenseTier): string => {
    const displayNames: Record<LicenseTier, string> = {
        starter: 'Starter',
        pro: 'Professional',
        enterprise: 'Enterprise'
    };
    return displayNames[tier];
};

export const getLicenseTierColor = (tier: LicenseTier): string => {
    const colors: Record<LicenseTier, string> = {
        starter: 'text-blue-600',
        pro: 'text-purple-600',
        enterprise: 'text-amber-600'
    };
    return colors[tier];
};
