import { create } from 'zustand';
import { employeeService } from '../services/employeeService';
import { Employee } from '@/types/employee';
import reasoningService from '../services/reasoningService';
import { ChurnReasoning } from '@/types/reasoning';
import api from '../services/apiService';
import { calculateRiskDistribution } from '../config/riskThresholds';
import { filterActiveEmployees } from '../utils/employeeFilters';
import { authService } from '@/services/authService';

const DEBUG = import.meta.env.DEV;

// Define the structure for the model training status
interface ModelTrainingStatus {
    status: 'idle' | 'queued' | 'in_progress' | 'complete' | 'error';
    progress: number;
    message: string;
    error?: string;
    startTime?: Date;
    endTime?: Date;
    companyId: string; // legacy naming, now holds active datasetId for caching
    datasetId?: string;
    modelVersion?: string;
}

// Enhanced Employee interface that includes reasoning data
interface EnhancedEmployee extends Omit<Employee, 'confidenceScore'> {
    tenure_years?: number; // Make optional since it might not be in the original data
    reasoningChurnRisk?: number; // Combined churn risk from reasoning module
    hasReasoningData?: boolean;
    reasoningConfidence?: number; // Confidence from reasoning module (0-1 range)
    confidenceScore?: number; // Confidence as percentage (0-100 range), made optional
}

interface GlobalCacheState {
    // Home page data
    homeEmployees: EnhancedEmployee[] | null;
    homeMetrics: any | null;

    // AIAssistant page data
    aiAssistantEmployees: EnhancedEmployee[] | null;

    // Playground page data
    playgroundEmployees: EnhancedEmployee[] | null;
    playgroundTreatments: any[] | null;

    // Loading states
    isLoadingHomeData: boolean;
    isLoadingAIAssistantData: boolean;
    isLoadingPlaygroundData: boolean;

    // Reasoning enhancement progress
    isEnhancingWithReasoning: boolean;
    reasoningEnhancementProgress: number; // 0-100

    // Model Training Status
    trainingStatus: ModelTrainingStatus | null;
    isTrainingComplete: boolean; // Flag to track completion transition
    pollingIntervalId: NodeJS.Timeout | null; // Store interval ID
    activeDatasetId: string | null;

    // Actions
    fetchHomeData: (projectId: string | null, forceRefresh?: boolean) => Promise<void>;
    fetchAIAssistantData: (projectId: string | null, forceRefresh?: boolean) => Promise<void>;
    fetchPlaygroundData: (projectId: string | null, forceRefresh?: boolean) => Promise<void>;
    resetCache: () => void;
    fetchTrainingStatus: (projectId: string | null, datasetId?: string | null) => Promise<void>;
    startPollingTrainingStatus: (projectId: string | null, datasetId?: string | null, intervalMs?: number) => void;
    stopPollingTrainingStatus: () => void;
}

// Optimized session storage reading with error handling
const getSessionStorageData = (key: string, forceRefresh = false): any[] | null => {
    // Skip cache if forceRefresh is true
    if (forceRefresh) {
        console.log(`Force refresh requested, skipping cache for ${key}`);
        return null;
    }

    try {
        const cached = sessionStorage.getItem(key);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        if (!parsed || !parsed.data || !parsed.timestamp) return null;

        // Consider data valid for 15 minutes to reduce unnecessary re-enhancement
        if (Date.now() - parsed.timestamp < 15 * 60 * 1000) {
            return parsed.data;
        }

        // Remove expired data
        sessionStorage.removeItem(key);
        return null;
    } catch (e) {
        // Remove corrupted data
        try {
            sessionStorage.removeItem(key);
        } catch { }
        return null;
    }
};

// Optimized session storage with async operations
const saveToSessionStorage = (key: string, data: any) => {
    // Use setTimeout to make storage operation non-blocking
    setTimeout(() => {
        try {
            // Skip caching if data is too large (arrays with >5000 items)
            // This prevents quota exceeded errors for large datasets
            if (Array.isArray(data) && data.length > 5000) {
                console.log(`[saveToSessionStorage] Skipping cache for large dataset (${data.length} items)`);
                return;
            }

            const payload = JSON.stringify({
                data,
                timestamp: Date.now()
            });

            // Also check payload size - skip if > 2MB
            if (payload.length > 2 * 1024 * 1024) {
                console.log(`[saveToSessionStorage] Skipping cache for large payload (${(payload.length / 1024 / 1024).toFixed(2)}MB)`);
                return;
            }

            sessionStorage.setItem(key, payload);
        } catch (e) {
            // If storage quota is exceeded, clear only old items
            try {
                const now = Date.now();
                const keysToRemove: string[] = [];

                for (let i = 0; i < sessionStorage.length; i++) {
                    const storageKey = sessionStorage.key(i);
                    if (storageKey) {
                        try {
                            const item = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
                            // Remove items older than 1 hour
                            if (item.timestamp && (now - item.timestamp) > 60 * 60 * 1000) {
                                keysToRemove.push(storageKey);
                            }
                        } catch { }
                    }
                }

                // Remove old items
                keysToRemove.forEach(k => sessionStorage.removeItem(k));

                // Try again only if we removed something
                if (keysToRemove.length > 0) {
                    sessionStorage.setItem(key, JSON.stringify({
                        data,
                        timestamp: Date.now()
                    }));
                }
            } catch (retryError) {
                console.warn('Storage quota exceeded, continuing without cache');
            }
        }
    }, 0);
};

// Helper function to setup IPC listener within the Zustand store initializer
const setupCacheResetListener = (): (() => void) => {
    // Simplified version without electron API dependency
    console.log('[setupCacheResetListener] Setting up cache reset listener...');
    return () => { }; // Return a no-op function
};

export const useGlobalDataCache = create<GlobalCacheState>((set, get) => {
    // Setup listener when store is created
    setupCacheResetListener();

    return {
        // Initial states
        homeEmployees: null,
        homeMetrics: null,
        aiAssistantEmployees: null,
        playgroundEmployees: null,
        playgroundTreatments: null,

        isLoadingHomeData: false,
        isLoadingAIAssistantData: false,
        isLoadingPlaygroundData: false,

        // Initial Training Status state
        trainingStatus: null,
        isTrainingComplete: false, // Initialize as false
        pollingIntervalId: null,
        activeDatasetId: null,

        // Reasoning enhancement progress
        isEnhancingWithReasoning: false,
        reasoningEnhancementProgress: 0, // Initialize as 0

        // Fetch Home page data
        fetchHomeData: async (projectId, forceRefresh = false) => {
            const hasToken = authService.isAuthenticated();

            if (!hasToken) {
                console.log('[fetchHomeData] No access token, skipping fetch.');
                set({
                    homeEmployees: [],
                    homeMetrics: null,
                    isLoadingHomeData: false,
                    isLoadingAIAssistantData: false,
                    isLoadingPlaygroundData: false,
                });
                return;
            }

            if (!projectId) {
                console.log('[fetchHomeData] No projectId, resetting data.');
                set({ homeEmployees: null, homeMetrics: null, isLoadingHomeData: false });
                return;
            }

            console.log(`[fetchHomeData] Triggered for projectId: ${projectId}. ForceRefresh: ${forceRefresh}.`);

            const currentTrainingStatus = get().trainingStatus;
            if (!currentTrainingStatus || (currentTrainingStatus.datasetId && currentTrainingStatus.datasetId !== get().activeDatasetId)) {
                try {
                    get().fetchTrainingStatus(projectId);
                } catch (statusError) {
                    console.warn('[fetchHomeData] Failed to trigger training status fetch:', statusError);
                }
            }
            let modelReady = currentTrainingStatus?.status === 'complete';

            // Resolve active dataset for cache scoping
            const storedDatasetId = localStorage.getItem('activeDatasetId');
            const datasetId = currentTrainingStatus?.datasetId || get().activeDatasetId || storedDatasetId || null;
            const datasetKey = datasetId || 'no-dataset';
            if (datasetId && datasetId !== get().activeDatasetId) {
                set({ activeDatasetId: datasetId });
            }

            // Generate cache keys based on projectId + datasetId
            const employeeCacheKey = `home_employees_${projectId}_${datasetKey}`;
            const metricsCacheKey = `home_metrics_${projectId}_${datasetKey}`;

            // If forcing refresh, clear sessionStorage for this project
            if (forceRefresh) {
                console.log(`[fetchHomeData] Force refresh: clearing sessionStorage for projectId: ${projectId}`);
                try {
                    sessionStorage.removeItem(employeeCacheKey);
                    sessionStorage.removeItem(metricsCacheKey);
                } catch (e) {
                    console.warn('[fetchHomeData] Failed to clear sessionStorage:', e);
                }
            }

            // Check store state cache first (only if not forcing refresh)
            if (!forceRefresh && get().homeEmployees && get().homeEmployees!.length > 0 && get().homeMetrics && get().activeDatasetId === datasetId) {
                console.log(`[fetchHomeData] Using existing store cache for projectId: ${projectId}`);
                return;
            }

            // Check sessionStorage cache (pass projectId-specific keys)
            const cachedEmployees = getSessionStorageData(employeeCacheKey, forceRefresh);
            const cachedMetrics = getSessionStorageData(metricsCacheKey, forceRefresh);
            if (cachedEmployees && cachedMetrics && !forceRefresh) {
                console.log(`[fetchHomeData] Using sessionStorage cache for projectId: ${projectId}`);
                set({
                    homeEmployees: cachedEmployees,
                    homeMetrics: cachedMetrics,
                    aiAssistantEmployees: cachedEmployees, // Keep consistent
                    playgroundEmployees: cachedEmployees, // Keep consistent
                    isLoadingHomeData: false,
                    isLoadingAIAssistantData: false,
                    isLoadingPlaygroundData: false,
                    activeDatasetId: datasetId || null,
                });
                return;
            }

            // --- Fetch from API --- 
            console.log(`[fetchHomeData] Setting isLoadingHomeData = true for projectId: ${projectId}`);
            set({ isLoadingHomeData: true });

            try {
                console.log(`[fetchHomeData] Fetching fresh data from employeeService for projectId: ${projectId}`);
                // Pass projectId and datasetId to keep caches scoped correctly
                const data = await employeeService.getEmployees(projectId, datasetId, forceRefresh);
                console.log(`[fetchHomeData] Received ${data?.length ?? 0} employees for projectId: ${projectId}`);

                if (!data || data.length === 0) {
                    console.log(`[fetchHomeData] No employee data returned for projectId: ${projectId}. Setting empty state.`);
                    set({
                        homeEmployees: [],
                        homeMetrics: modelReady ? { total_employees: 0, average_churn_probability: 0, risk_levels: { high: 0, medium: 0, low: 0 } } : null,
                        aiAssistantEmployees: [],
                        playgroundEmployees: [],
                        isLoadingHomeData: false,
                        isLoadingAIAssistantData: false,
                        isLoadingPlaygroundData: false,
                    });
                    // Cache the empty state to avoid refetching immediately
                    saveToSessionStorage(employeeCacheKey, []);
                    if (modelReady) {
                        saveToSessionStorage(metricsCacheKey, { total_employees: 0, average_churn_probability: 0, risk_levels: { high: 0, medium: 0, low: 0 } });
                    } else {
                        sessionStorage.removeItem(metricsCacheKey);
                    }
                    return;
                }

                // PROGRESSIVE LOADING: Show basic data immediately, enhance with reasoning in background
                console.log(`[fetchHomeData] Showing basic employee data immediately for ${data.length} employees`);

                // Filter for active employees only (except for exit pattern analysis)
                const activeEmployees = filterActiveEmployees(data);

                const hasCachedReasoning = activeEmployees.some(emp => emp && typeof emp.reasoningChurnRisk === 'number');
                const allHaveReasoning = hasCachedReasoning &&
                    activeEmployees.filter(emp => emp && typeof emp.reasoningChurnRisk === 'number').length >= activeEmployees.length * 0.9;
                modelReady = modelReady || hasCachedReasoning;

                // Calculate basic metrics only if the churn model is ready
                const totalEmployees = activeEmployees.length;
                const validEmployees = modelReady
                    ? activeEmployees.filter((emp: any) =>
                        emp &&
                        typeof emp.churnProbability !== 'undefined' &&
                        !isNaN(parseFloat(String(emp.churnProbability)))
                    )
                    : [];

                let basicMetrics: {
                    total_employees: number;
                    average_churn_probability: number;
                    risk_levels: ReturnType<typeof calculateRiskDistribution>;
                } | null = null;

                if (modelReady) {
                    let sum = 0;
                    for (const emp of validEmployees) {
                        const probValue = typeof emp.churnProbability === 'number'
                            ? emp.churnProbability
                            : parseFloat(String(emp.churnProbability));
                        sum += isNaN(probValue) ? 0 : probValue;
                    }
                    const avgChurnProb = validEmployees.length > 0 ? sum / validEmployees.length : 0;
                    const riskLevels = calculateRiskDistribution(validEmployees);

                    basicMetrics = {
                        total_employees: totalEmployees,
                        average_churn_probability: avgChurnProb,
                        risk_levels: riskLevels
                    };
                }

                // Show basic data immediately with loading state false - ONLY ACTIVE EMPLOYEES
                const basicEmployees = activeEmployees.map(emp => ({
                    ...emp,
                    hasReasoningData: false,
                    tenure_years: emp.tenure || 0,
                    churnProbability: modelReady ? (emp.reasoningChurnRisk ?? emp.resign_proba ?? 0) : 0,
                    reasoningConfidence: modelReady ? emp.reasoningConfidence : undefined,
                    confidenceScore: modelReady ? emp.confidenceScore : undefined,
                }));

                set({
                    homeEmployees: basicEmployees,
                    homeMetrics: basicMetrics,
                    aiAssistantEmployees: basicEmployees,
                    playgroundEmployees: basicEmployees,
                    isLoadingHomeData: false, // Set to false to show data immediately
                    isLoadingAIAssistantData: false,
                    isLoadingPlaygroundData: false,
                });

                console.log(`[fetchHomeData] Basic data displayed. Starting reasoning enhancement in background...`);

                // Skip enhancement if 90%+ of employees already have reasoning data
                if (allHaveReasoning) {
                    console.log(`[fetchHomeData] Skipping enhancement - ${activeEmployees.length} employees already have reasoning data`);

                    // Use the existing data with reasoning as final
                    const enhancedEmployees = activeEmployees.map(emp => ({
                        ...emp,
                        tenure_years: emp.tenure || 0,
                        hasReasoningData: typeof emp.reasoningChurnRisk === 'number',
                        churnProbability: emp.reasoningChurnRisk ?? emp.churnProbability ?? emp.resign_proba ?? 0,
                    }));

                    set({
                        homeEmployees: enhancedEmployees,
                        homeMetrics: basicMetrics,
                        aiAssistantEmployees: enhancedEmployees,
                        playgroundEmployees: enhancedEmployees,
                        isEnhancingWithReasoning: false,
                        reasoningEnhancementProgress: 100,
                        activeDatasetId: datasetId || null,
                    });

                    saveToSessionStorage(employeeCacheKey, enhancedEmployees);
                    if (modelReady && basicMetrics) {
                        saveToSessionStorage(metricsCacheKey, basicMetrics);
                    }
                    return;
                }

                // Enhance with reasoning data in the background (non-blocking)
                if (modelReady) {
                    set({ isEnhancingWithReasoning: true, reasoningEnhancementProgress: 0 });
                }

                const reasoningPromise = modelReady
                    ? enhanceEmployeesWithReasoning(
                        activeEmployees,
                        progress => {
                            console.log(`[fetchHomeData] Background reasoning enhancement progress: ${progress}%`);
                            // Update progress on every callback to ensure UI reflects actual state
                            set({ reasoningEnhancementProgress: progress });
                        },
                        { modelReady }
                    )
                    : Promise.resolve(basicEmployees);

                reasoningPromise.then(enhancedEmployees => {
                    console.log(`[fetchHomeData] Background reasoning enhancement completed for ${enhancedEmployees.length} employees`);

                    let finalMetrics = basicMetrics;
                    if (modelReady) {
                        const enhancedAvgChurnProb = enhancedEmployees.length > 0
                            ? enhancedEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / enhancedEmployees.length
                            : 0;
                        finalMetrics = {
                            total_employees: enhancedEmployees.length,
                            average_churn_probability: enhancedAvgChurnProb,
                            risk_levels: calculateRiskDistribution(enhancedEmployees)
                        };
                    }

                    set(state => ({
                        ...state,
                        homeEmployees: enhancedEmployees,
                        homeMetrics: finalMetrics,
                        aiAssistantEmployees: enhancedEmployees,
                        playgroundEmployees: enhancedEmployees,
                        isEnhancingWithReasoning: false,
                        reasoningEnhancementProgress: modelReady ? 100 : 0,
                        activeDatasetId: datasetId || null,
                    }));

                    saveToSessionStorage(employeeCacheKey, enhancedEmployees);
                    if (modelReady && finalMetrics) {
                        saveToSessionStorage(metricsCacheKey, finalMetrics);
                    } else {
                        sessionStorage.removeItem(metricsCacheKey);
                    }

                    console.log(`[fetchHomeData] Enhanced data cached and displayed`);
                }).catch(error => {
                    console.warn(`[fetchHomeData] Background reasoning enhancement failed:`, error);
                    // Clear enhancement state even on error
                    set({ isEnhancingWithReasoning: false, reasoningEnhancementProgress: 0 });
                    // Keep the basic data that's already displayed
                });

            } catch (error) {
                console.error(`[fetchHomeData] Error fetching home data for projectId: ${projectId}:`, error);
                set({ isLoadingHomeData: false }); // Ensure loading is false on error
                // Optionally clear state or set error state here
                set({
                    homeEmployees: null,
                    homeMetrics: null,
                    aiAssistantEmployees: null,
                    playgroundEmployees: null,
                    // Consider adding an error field to the state
                });
            }
        },

        // Fetch AIAssistant page data
        fetchAIAssistantData: async (projectId, forceRefresh = false) => {
            if (!projectId) {
                console.log('[fetchAIAssistantData] No projectId, resetting data.');
                set({ aiAssistantEmployees: null, isLoadingAIAssistantData: false });
                return;
            }
            console.log(`[fetchAIAssistantData] Triggered for projectId: ${projectId}. ForceRefresh: ${forceRefresh}.`);
            // If forcing refresh, use home fetch for consistency
            if (forceRefresh) {
                console.log('[fetchAIAssistantData] Redirecting to fetchHomeData for consistency.');
                await get().fetchHomeData(projectId, true);
                return;
            }
            // Use existing home data if available and matches current projectId context (implicitly handled by calling fetchHomeData)
            if (!get().aiAssistantEmployees) {
                console.log('[fetchAIAssistantData] No cached AI data, calling fetchHomeData...');
                await get().fetchHomeData(projectId, false); // Fetch if not already cached
            } else {
                console.log('[fetchAIAssistantData] Using existing cached AI data.');
            }
        },

        // Fetch Playground page data
        fetchPlaygroundData: async (projectId, forceRefresh = false) => {
            if (!projectId) {
                console.log('[fetchPlaygroundData] No projectId, resetting data.');
                set({ playgroundEmployees: null, playgroundTreatments: null, isLoadingPlaygroundData: false });
                return;
            }
            console.log(`[fetchPlaygroundData] Triggered for projectId: ${projectId}. ForceRefresh: ${forceRefresh}.`);
            if (forceRefresh) {
                console.log('[fetchPlaygroundData] Redirecting to fetchHomeData for employee consistency.');
                await get().fetchHomeData(projectId, true);
                // TODO: Still need to fetch/refresh treatments if applicable
                // set({ playgroundTreatments: null }); // Example: clear treatments for refresh
                return;
            }
            // Use existing home data if available
            if (!get().playgroundEmployees) {
                console.log('[fetchPlaygroundData] No cached playground employees, calling fetchHomeData...');
                await get().fetchHomeData(projectId, false); // Fetch if not already cached
            } else {
                console.log('[fetchPlaygroundData] Using existing cached playground employees.');
            }
            // TODO: Fetch treatments if they are not cached or need refresh
            // if (!get().playgroundTreatments) { ... fetch treatments ... }
        },

        // Reset all cache
        resetCache: () => {
            console.log('[DataCache] Resetting global cache...');
            // Clear Zustand store state
            set({
                homeEmployees: null,
                homeMetrics: null,
                aiAssistantEmployees: null,
                playgroundEmployees: null,
                playgroundTreatments: null,
                isLoadingHomeData: false,
                isLoadingAIAssistantData: false,
                isLoadingPlaygroundData: false,
                activeDatasetId: null,
                // Don't reset trainingStatus here as it might be independent of project data
                // or handled elsewhere if needed.
                // trainingStatus: null, 
                // isTrainingComplete: false,
            });

            // Clear known sessionStorage & localStorage keys
            const sessionStoragePrefixes = [
                'home_employees_',
                'home_metrics_',
                // Add other sessionStorage prefixes if known
            ];
            const localStoragePrefixes = [
                'churnvision-employees-cache-'
                // Add other localStorage prefixes if known
            ];

            try {
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && sessionStoragePrefixes.some(prefix => key.startsWith(prefix))) {
                        sessionStorage.removeItem(key);
                        console.log(`[DataCache] Removed sessionStorage item: ${key}`);
                        i--; // Adjust index as sessionStorage.length changes
                    }
                }
            } catch (e) {
                console.warn('[DataCache] Error clearing sessionStorage:', e);
            }

            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && localStoragePrefixes.some(prefix => key.startsWith(prefix))) {
                        localStorage.removeItem(key);
                        console.log(`[DataCache] Removed localStorage item: ${key}`);
                        i--; // Adjust index as localStorage.length changes
                    }
                }
            } catch (e) {
                console.warn('[DataCache] Error clearing localStorage:', e);
            }

            console.log('[DataCache] Global cache state reset. Known persistent storage items cleared.');
        },

        // --- Model Training Status Actions - Modified ---
        fetchTrainingStatus: async (projectId, datasetIdOverride = null) => {
            if (!projectId) {
                console.log('[fetchTrainingStatus] No projectId, skipping status fetch.');
                return;
            }

            const hasToken = authService.isAuthenticated();
            if (!hasToken) {
                console.log('[fetchTrainingStatus] No access token found, skipping status fetch.');
                return;
            }

            const fallbackDatasetId = datasetIdOverride || localStorage.getItem('activeDatasetId') || undefined;

            try {
                const response = await api.get('/churn/train/status');
                const statusPayload = response.data || {};

                const status = (statusPayload.status as ModelTrainingStatus['status']) || 'idle';
                const progress = typeof statusPayload.progress === 'number' ? statusPayload.progress : 0;
                const datasetId = statusPayload.dataset_id || statusPayload.datasetId || datasetIdOverride || localStorage.getItem('activeDatasetId') || projectId;

                if (statusPayload.dataset_id) {
                    try { localStorage.setItem('activeDatasetId', statusPayload.dataset_id); } catch { /* ignore */ }
                }

                const newStatus: ModelTrainingStatus = {
                    status,
                    progress,
                    message: statusPayload.message || (status === 'complete' ? 'Model trained successfully' : 'Checking training status'),
                    companyId: datasetId || projectId,
                    datasetId: datasetId || undefined,
                    modelVersion: statusPayload.model_version,
                    startTime: statusPayload.started_at ? new Date(statusPayload.started_at) : undefined,
                    endTime: statusPayload.finished_at ? new Date(statusPayload.finished_at) : undefined,
                };

                if (status === 'error' && statusPayload.message) {
                    newStatus.error = statusPayload.message;
                }

                const previousStatus = get().trainingStatus?.status;
                const justCompleted = status === 'complete' && previousStatus !== 'complete';

                set({ trainingStatus: newStatus, isTrainingComplete: status === 'complete', activeDatasetId: datasetId || null });

                // Only trigger data refresh when training JUST completed (status transitions to complete)
                if (justCompleted) {
                    console.log(`[DataCache] Model training just completed for dataset ${datasetId || 'unknown'}. Forcing data refresh.`);
                    setTimeout(() => {
                        get().fetchHomeData(projectId, true);
                        get().fetchAIAssistantData(projectId, true);
                        get().fetchPlaygroundData(projectId, true);
                    }, 100);
                }
            } catch (error: any) {
                if (error.response && error.response.status === 404) {
                    if (DEBUG) console.info('[fetchTrainingStatus] Model not trained yet, setting idle.');
                    set({
                        trainingStatus: {
                            status: 'idle',
                            progress: 0,
                            message: 'No model trained',
                            companyId: fallbackDatasetId || projectId,
                            datasetId: fallbackDatasetId,
                        },
                        isTrainingComplete: false,
                    });
                } else {
                    console.error(`[DataCache] Failed to get training status:`, error);
                    set({
                        trainingStatus: {
                            status: 'error',
                            progress: 0,
                            message: 'Failed to fetch status',
                            error: error.message,
                            companyId: fallbackDatasetId || projectId,
                            datasetId: fallbackDatasetId,
                        },
                        isTrainingComplete: false,
                    });
                }
            }
        },

        startPollingTrainingStatus: (projectId, datasetId = null, intervalMs = 1000) => {
            if (!projectId) {
                console.log('[startPollingTrainingStatus] No projectId, cannot start polling.');
                return;
            }
            get().stopPollingTrainingStatus();
            console.log(`[DataCache] Starting training status polling for projectId: ${projectId} every ${intervalMs}ms`);

            // Seed UI with immediate in-progress status so users see progress bar instantly
            const optimisticStatus: ModelTrainingStatus = {
                status: 'queued',
                progress: 5,
                message: 'Starting model training...',
                companyId: datasetId || projectId,
                datasetId: datasetId || undefined,
            };
            set({ trainingStatus: optimisticStatus, activeDatasetId: datasetId || null });

            // Fetch immediately first time
            get().fetchTrainingStatus(projectId, datasetId);

            const intervalId = setInterval(() => {
                const currentStatus = get().trainingStatus?.status;
                if (currentStatus !== 'complete' && currentStatus !== 'error') {
                    get().fetchTrainingStatus(projectId, datasetId);
                } else {
                    console.log(`[DataCache] Training status for projectId ${projectId} is ${currentStatus}, stopping polling.`);
                    get().stopPollingTrainingStatus();
                }
            }, intervalMs);

            set({ pollingIntervalId: intervalId });
        },

        stopPollingTrainingStatus: () => {
            const intervalId = get().pollingIntervalId;
            if (intervalId) {
                console.log('[DataCache] Stopping training status polling.');
                clearInterval(intervalId);
                set({ pollingIntervalId: null });
            }
        }
    };
});

// Web worker for data processing to prevent main thread blocking
// Note: Currently unused but kept for future optimization
// let dataWorker: Worker | null = null;

// Function to enhance employees with reasoning data - HEAVILY OPTIMIZED
const enhanceEmployeesWithReasoning = async (
    employees: Employee[],
    onProgress?: (progress: number) => void,
    options?: { modelReady?: boolean }
): Promise<EnhancedEmployee[]> => {
    try {
        console.log(`Starting reasoning enhancement for ${employees.length} employees`);
        const startTime = Date.now();

        // If no employees, return empty array immediately
        if (employees.length === 0) {
            return [];
        }

        if (!options?.modelReady) {
            console.log('Skipping reasoning enhancement because the churn model is not trained.');
            onProgress?.(100);
            return employees.map(emp => ({
                ...emp,
                tenure_years: emp.tenure || 0,
                hasReasoningData: false,
                churnProbability: 0,
                reasoningConfidence: undefined,
                confidenceScore: undefined,
            } as EnhancedEmployee));
        }

        // For small datasets, process all at once
        if (employees.length <= 50) {
            try {
                const hrCodes = employees.map(emp => emp.hr_code);
                console.log(`Small dataset (${employees.length} employees), processing all at once`);
                onProgress?.(10); // Starting

                const reasoningData: ChurnReasoning[] = await reasoningService.getBatchReasoning(hrCodes);
                onProgress?.(80); // Processing complete

                // Use optimized processing - simpler and faster
                const reasoningMap = new Map(reasoningData.map((r: ChurnReasoning) => [r.hr_code, r]));

                const enhancedEmployeesResult = employees.map(emp => {
                    const reasoning = reasoningMap.get(emp.hr_code);
                    return {
                        ...emp,
                        tenure_years: emp.tenure || 0, // Map tenure to tenure_years
                        reasoningChurnRisk: reasoning?.churn_risk,
                        hasReasoningData: !!reasoning,
                        churnProbability: reasoning?.churn_risk ?? emp.churnProbability ?? emp.resign_proba ?? 0,
                        reasoningConfidence: reasoning?.confidence_level,
                        confidenceScore: reasoning?.confidence_level ? Math.round(reasoning.confidence_level * 100) : emp.confidenceScore
                    } as EnhancedEmployee;
                });

                onProgress?.(100); // Complete

                const processingTime = Date.now() - startTime;
                const reasoningCount = enhancedEmployeesResult.filter(e => e.hasReasoningData).length;
                console.log(`Enhanced ${enhancedEmployeesResult.length} employees with reasoning data in ${processingTime}ms. ${reasoningCount} have reasoning data.`);

                return enhancedEmployeesResult;
            } catch (error) {
                console.warn('Failed to get reasoning data for small dataset, falling back to original data:', error);
                onProgress?.(100); // Complete even on error
                return employees.map(emp => ({
                    ...emp,
                    tenure_years: emp.tenure || 0, // Map tenure to tenure_years
                    hasReasoningData: false,
                    churnProbability: emp.churnProbability ?? emp.resign_proba ?? 0,
                    reasoningConfidence: undefined,
                    confidenceScore: emp.confidenceScore
                } as EnhancedEmployee));
            }
        }

        // For larger datasets, use conservative batching to prevent UI freezing
        const hrCodes = employees.map(emp => emp.hr_code);
        const batchSize = 50; // Smaller batches for better responsiveness
        const enhancedEmployees: EnhancedEmployee[] = [];

        // Process in smaller, sequential batches for stability
        const batches: string[][] = [];
        for (let i = 0; i < hrCodes.length; i += batchSize) {
            batches.push(hrCodes.slice(i, i + batchSize));
        }

        onProgress?.(5); // Starting batches

        // Process batches sequentially to prevent UI blocking
        let completedBatches = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            try {
                console.log(`Processing reasoning batch ${i + 1}/${batches.length} (${batch.length} employees)`);

                // Add small delay to prevent UI blocking
                if (i > 0 && i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                const reasoningData: ChurnReasoning[] = await reasoningService.getBatchReasoning(batch);

                // Create a map for quick lookup
                const reasoningMap = new Map(reasoningData.map((r: ChurnReasoning) => [r.hr_code, r]));

                // Enhance employees in this batch
                const batchEmployees = employees.filter(emp => batch.includes(emp.hr_code));
                const batchResult = batchEmployees.map(emp => {
                    const reasoning = reasoningMap.get(emp.hr_code);
                    return {
                        ...emp,
                        tenure_years: emp.tenure || 0, // Map tenure to tenure_years
                        reasoningChurnRisk: reasoning?.churn_risk,
                        hasReasoningData: !!reasoning,
                        churnProbability: reasoning?.churn_risk ?? emp.churnProbability ?? emp.resign_proba ?? 0,
                        reasoningConfidence: reasoning?.confidence_level,
                        confidenceScore: reasoning?.confidence_level ? Math.round(reasoning.confidence_level * 100) : emp.confidenceScore
                    } as EnhancedEmployee;
                });

                enhancedEmployees.push(...batchResult);
            } catch (batchError) {
                console.warn(`Failed to get reasoning data for batch ${i + 1}:`, batchError);
                // Fall back to original employee data for this batch
                const batchEmployees = employees.filter(emp => batch.includes(emp.hr_code));
                const fallbackResult = batchEmployees.map(emp => ({
                    ...emp,
                    tenure_years: emp.tenure || 0, // Map tenure to tenure_years
                    hasReasoningData: false,
                    churnProbability: emp.churnProbability ?? emp.resign_proba ?? 0,
                    reasoningConfidence: undefined,
                    confidenceScore: emp.confidenceScore
                } as EnhancedEmployee));

                enhancedEmployees.push(...fallbackResult);
            }

            completedBatches++;
            const progress = Math.min(95, 5 + (completedBatches / batches.length) * 90);

            // Report progress: first batch, every 2nd batch, and final batch
            if (completedBatches === 1 || completedBatches % 2 === 0 || completedBatches === batches.length) {
                onProgress?.(progress);
            }
        }

        onProgress?.(100); // Complete

        const processingTime = Date.now() - startTime;
        const reasoningCount = enhancedEmployees.filter(e => e.hasReasoningData).length;
        console.log(`Enhanced ${enhancedEmployees.length} employees with reasoning data in ${processingTime}ms. ${reasoningCount} have reasoning data.`);

        return enhancedEmployees;
    } catch (error) {
        console.error('Error enhancing employees with reasoning:', error);
        onProgress?.(100); // Complete even on error
        // Fall back to original employee data
        return employees.map(emp => ({
            ...emp,
            tenure_years: emp.tenure || 0, // Map tenure to tenure_years
            hasReasoningData: false,
            churnProbability: emp.churnProbability ?? emp.resign_proba ?? 0,
            reasoningConfidence: undefined,
            confidenceScore: emp.confidenceScore
        } as EnhancedEmployee));
    }
}; 
