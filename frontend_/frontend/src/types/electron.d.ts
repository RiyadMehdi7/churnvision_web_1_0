import type { LicenseData } from '../../electron/licenseService'; // Assuming type export exists

// Define the structure for License Data (mirroring main process if possible)
// This might need adjustment based on what licenseService actually returns/stores
export interface LicenseStateData {
  key: string | null;
  tier: string | null;
  activationDate: string | null;
  expiryDate: string | null;
  lastCheckTime: number | null;
  offlineGraceUntil: number | null;
  features: { [key: string]: boolean } | null;
  deviceId: string | null;
  // Add other relevant fields returned by getLocalState
}

// Define possible license statuses
export type LicenseStatus = 
  | 'UNKNOWN'      // Initial state before verification
  | 'INACTIVE'     // No valid key entered or activated
  | 'PENDING'      // Activation in progress
  | 'ACTIVE'       // Valid and active license
  | 'EXPIRED'      // License validity period has passed
  | 'GRACE_PERIOD' // Offline or check failed, operating in grace period
  | 'INVALID'      // Key was checked and found invalid
  | 'REVOKED'      // License was revoked by the server
  | 'ERROR';       // An error occurred during check/activation

// Define the overall License State structure used in App.tsx
export interface LicenseState {
  status: LicenseStatus;
  data: LicenseStateData | null; // Holds details when status is relevant (e.g., ACTIVE, GRACE_PERIOD)
  error?: string | null; // Holds error message if status is ERROR or INVALID
  gracePeriodEnds?: string | null; // Specific field for grace period end time
}

// Type for combined data (matches backend route query)
export interface CombinedEmployeeData {
    hr_code: string;
    full_name: string;
    position: string | null;
    structure_name: string | null;
    manager_id?: string | null;
    employee_cost: number | null;
    tenure: number | null;
    resign_proba: number | null;
    eltv_pre_treatment: number | null;
    additional_data: string | null; // Stored as JSON string
    status: string | null;
    shap_values: string | null; // Stored as JSON string
    engagement_score: number | null; // Mapped from eltv_post_treatment
    uncertainty_range: string | null;
    counterfactuals: string | null;
    reasoning_churn_risk: number | null;
    reasoning_stage: string | null;
    reasoning_confidence: number | null;
    dataset_id?: string | null;
    eltv_post_treatment?: number | null;
    prediction_date?: string | null;
    reasoning_updated_at?: string | null;
}

// Type for Data Connection (subset)
export interface DataConnectionShort {
    connection_id: string;
    name: string;
    type: string;
    host: string;
}

// Type for Connection Test Parameters
export interface ConnectionTestParams {
    type: string;
    host: string;
    port: number | string;
    username: string;
    password?: string; // Optional
    databaseName: string;
}

// Type for Creating Connection (similar to TestParams, but ID generated backend)
export interface ConnectionCreateParams {
    name: string;
    type: string;
    host: string;
    port: number | string;
    username: string;
    password?: string;
    databaseName: string;
}

// Type for Model Training Status
export interface ModelTrainingStatus {
  status: 'idle' | 'queued' | 'in_progress' | 'complete' | 'error';
  progress: number; // Percentage 0-100
  message: string;
  error?: string | null;
  startTime?: string | Date | null; // Use string for ISO format if needed
  endTime?: string | Date | null;
}

// Type for raw employee data upload (matches backend route)
export interface HRDataInputRaw {
    hr_code: string; 
    full_name: string; 
    structure_name: string; 
    position: string; 
    status: string;
    tenure?: number | string | null; 
    employee_cost?: number | string | null; 
    [key: string]: any; // Allow additional fields
}

// Type for Treatment Result (subset needed by Playground)
export interface TreatmentResult {
    employee_id: number;
    eltv_post_treatment: number;
    treatment_effect: number;
    new_survival_probabilities: Record<string, number>;
    // Add other fields if needed from eltvService.ts TreatmentResult
}

// Type for Churn Output Data (define based on expected columns)
export interface ChurnOutputData {
    hr_code: string;
    resign_proba: number | null;
    shap_values: string | null; // JSON string
    uncertainty_range: string | null; 
    counterfactuals: string | null;
    // Add other columns from churn_output table if needed
}

// === Diagnostics / Security ===
export interface DbHealth {
  ok: boolean;
  error?: string;
  missing?: string[];
  counts?: Record<string, number>;
  dbPath?: string;
}

export interface LlmStatus {
  ready: boolean;
  reason?: string;
  modelType: string;
}

// Uplift types
export interface UpliftRow {
  treatment_id: number;
  treatment_name: string;
  n_treatment: number;
  n_control: number;
  retention_rate_t: number;
  retention_rate_c: number;
  uplift: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  power_80?: boolean;
  roi_ratio?: number;
  uplift_cuped?: number;
  cuped_theta?: number;
  cuped_variance_reduction?: number;
}

export interface SecurityState {
  strictOfflineMode: boolean;
  csp: Record<string, string[]>;
  allowedProtocols: string[];
}

export interface TreatmentApplicationInput {
  hr_code: string;
  treatment_id: number;
  treatment_name: string;
  cost: number;
  pre_churn_probability: number;
  post_churn_probability: number;
  pre_eltv: number;
  post_eltv: number;
  roi: number;
  success_indicator?: 'pending' | 'successful' | 'failed' | 'ongoing';
  notes?: string | null;
  applied_by?: string;
  is_simulation?: boolean;
}

declare global {
  interface Window {
    electronApi?: ElectronAPI;
  }
}

// Type for Chat Messages (from backend/src/types/chat.js)
export interface ChatMessage {
  sessionId: string;
  employeeId?: number | string | null;
  role: 'user' | 'assistant' | 'system';
  message: string;
  timestamp: string | Date; // Allow Date or ISO string
  // Add other fields if present in backend type (e.g., messageId, context)
}

// Interfaces used specifically by Playground
interface SurvivalProbabilities { [key: string]: number; }
interface EmployeeDataStrict { // Copying from Playground.tsx for clarity
    hr_code: string;
    full_name: string;
    structure_name: string;
    position: string;
    status: string;
    tenure: number;
    employee_cost: number;
    report_date: string;
    normalized_position_level?: string;
    termination_date: string | null;
}
interface TreatmentOptions { // Copying from Playground.tsx
    id: number;
    name: string;
    description: string;
    cost: number;
    effectSize?: number;
    targetedVariables?: string[];
    bestFor?: string[];
    timeToEffect?: string;
    riskLevels?: string[];
    impactFactors?: { /* ... */ };
}
// Use shared types for treatments
import type { TreatmentSuggestion, ApplyTreatmentResult, TreatmentOptions } from '@/types/treatment';
import type { Employee } from '@/types/employee';
type PlaygroundEmployeeData = any;
interface ManualSimulationResult { // Copying from Playground.tsx
    employee_id: string;
    pre_eltv: number;
    post_eltv: number;
    pre_churn_probability: number;
    post_churn_probability: number;
    pre_survival_probabilities: SurvivalProbabilities;
    post_survival_probabilities: SurvivalProbabilities;
}

export interface ElectronAPI {
  shell: any;
  getLicenseStatus: () => Promise<{ 
    valid: boolean;
    error?: string | null;
    validUntil?: string;
    features?: string[];
    offlineMode?: boolean;
  }>;
  validateLicense: (licenseKey: string) => Promise<boolean>;
  getBackendStatus: () => Promise<{ running: boolean }>;
  restartBackend: () => Promise<{ success: boolean }>;
  getBackendPort: () => Promise<string>;
  setBackendPort: (port: string | number) => Promise<{
    success: boolean;
    changed?: boolean;
    error?: string;
  }>;
  openBackendLogs: () => Promise<{ success: boolean; error?: string }>;
  getFeatureFlags: () => Promise<Record<string, boolean>>;
  getUserProfile: () => Promise<{
    id: string;
    installDate: string;
    lastActive: string;
    tier: string;
    buildChannel: string;
    configVersion: string;
    customizations: Record<string, any>;
    preferences: {
      theme: string;
      language: string;
      notifications: boolean;
      [key: string]: any;
    };
  }>;
  updateUserPreferences: (preferences: Record<string, any>) => Promise<Record<string, any>>;
  logFeatureUsage: (feature: string, data?: Record<string, any>) => Promise<boolean>;
  checkForUpdates: () => Promise<boolean>;
  trackAnalytics: (event: {
    type: string;
    name: string;
    properties?: Record<string, any>;
    timestamp: number;
  }) => Promise<boolean>;
  trackPerformance: (metrics: {
    pageLoadTime: number;
    timeToInteractive: number;
    firstContentfulPaint: number;
  }) => Promise<boolean>;
  onBackendStatusChange: (callback: (status: { 
    running: boolean; 
    error?: string;
    code?: number;
  }) => void) => () => void;
  onLicenseStatusChange: (callback: (status: { 
    valid: boolean;
    error?: string | null;
    validUntil?: string;
    features?: string[];
    offlineMode?: boolean;
  }) => void) => () => void;
  onUpdateAvailable: (callback: (info: {
    version: string;
    releaseDate: string;
    releaseNotes?: string;
  }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: {
    version: string;
    releaseDate: string;
    releaseNotes?: string;
  }) => void) => () => void;
  onConfigUpdated: (callback: (config: {
    configVersion: string;
    tier: string;
    buildChannel: string;
    featureFlags: Record<string, boolean>;
  }) => void) => () => void;
  logger: {
    debug: (message: string, data?: any, context?: any) => Promise<boolean>;
    info: (message: string, data?: any, context?: any) => Promise<boolean>;
    warn: (message: string, data?: any, context?: any) => Promise<boolean>;
    error: (message: string, data?: any, context?: any) => Promise<boolean>;
    fatal: (message: string, data?: any, context?: any) => Promise<boolean>;
    exportLogs: (includeSystem?: boolean) => Promise<{ success: boolean; path: string }>;
  };
  getAppVersion: () => string;

  // Uplift summary and optimization
  uplift?: {
    summary: () => Promise<{ success: boolean; results?: UpliftRow[]; cuped?: UpliftRow[]; error?: string }>;
    optimize: (budget: number) => Promise<{ success: boolean; optimization?: any; error?: string }>;
  };

  // === Project Management ===
  projects?: {
    list: () => Promise<any[]>; // Replace any with actual Project type
    create: (projectName: string) => Promise<{ success: boolean; project?: any; error?: string }>;
    delete: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    setActive: (projectDbPath: string | null) => Promise<{ success: boolean }>;
    getActive: () => Promise<{ name: string; dbPath: string } | null>;
    onActiveChange: (callback: (projectInfo: { name: string; dbPath: string } | null) => void) => () => void;
    getActiveProjectDbPath: () => Promise<string | null>;
  };

  // === App Management (Example) ===
  app?: {
    resetPreferences: () => Promise<void>; // Add the method used in Settings.tsx
    // Add other app-level methods if needed (e.g., getInstallationId)
    getInstallationId: () => Promise<string | null>;
  };

  // === Backend Management ===
  backend?: {
     getStatus: () => Promise<{ running: boolean }>;
  };

  // Add signature for checking project data
  checkProjectData: () => Promise<{ hasData: boolean }>;

  // Add signature for extracting headers
  extractHeaders: (args: { 
    fileDataBuffer: Buffer; 
    mimeType: string; 
    originalFilename: string; 
  }) => Promise<{ success: boolean; headers: string[]; error?: string }>;

  // --- Database Connections ---
  listConnections: () => Promise<DataConnectionShort[]>;
  testConnection: (params: ConnectionTestParams) => Promise<{ success: boolean; message: string }>;
  createConnection: (details: ConnectionCreateParams) => Promise<{ success: boolean; message: string; connectionId: string }>;
  deleteConnection: (connectionId: string) => Promise<{ success: boolean; message?: string }>; // Error handled via Promise reject
  checkDatabaseConnection: () => Promise<{ connected: boolean; message?: string }>;

  // --- Data Handling ---
  uploadFile: (args: {
    fileDataBuffer: Uint8Array;
    originalFilename: string; 
    mimeType: string; 
    size: number; 
    mappings: Record<string, string>; 
    datasetName: string;
    xDataMode?: 'wage' | 'performance';
  }) => Promise<{ 
    success: boolean; 
    datasetId: string; 
    recordCount: number; 
    error?: string; 
    details?: string; 
  }>;
  uploadEmployeesJson: (args: { 
    employees: HRDataInputRaw[]; 
    datasetName: string; 
  }) => Promise<{ 
    success: boolean; 
    datasetId: string; 
    recordCount: number; 
    message: string; 
    warnings?: any; 
  }>;
  getCombinedData: (projectId?: string | null) => Promise<CombinedEmployeeData[]>;
  getCombinedDataSchema: () => Promise<any>;
  getColumnDistinctValues: (columnName: string) => Promise<string[]>;
  listDatasets: () => Promise<any[]>; // Define specific Dataset type later if needed
  activateDataset: (datasetId: string) => Promise<{ success: boolean; message: string }>;
  deleteDataset: (datasetId: string) => Promise<{ success: boolean; cancelled?: boolean; message: string }>;
  listTables: (connectionId: number | string) => Promise<string[]>;
  getTableColumns: (args: { connectionId: number | string; tableName: string }) => Promise<string[]>;

  // --- ELTV Processing ---
  calculateELTV: (employeeId: number | string) => Promise<any>; // Use 'any' for now, define ELTVResult type later if needed
  getEltvStatus: () => Promise<any>;
  runEltv: () => Promise<void>;
  getEltvResults: () => Promise<any>;
  getEltvColumnMapping: () => Promise<any>;
  saveEltvColumnMapping: (mapping: any) => Promise<void>;
  getEltvConfig: () => Promise<any>;
  saveEltvConfig: (config: any) => Promise<void>;
  applyTreatment: (args: { employeeId: number; treatmentId?: number }) => Promise<any>; // Update type if more specific

  // --- Model Training ---
  trainModel: () => Promise<{ success: boolean; message: string; status: ModelTrainingStatus }>;
  getModelTrainingStatus: () => Promise<{ success: boolean; status: ModelTrainingStatus }>;

  // --- Chatbot ---
  sendChatMessage: (args: { 
    message: string; 
    sessionId: string; 
    employeeId?: number | string | null; 
  }) => Promise<any>; // Define a specific response type later if needed
  getChatHistory: (sessionId: string) => Promise<ChatMessage[]>;

  // --- Combined Employee Data (from employees.ts)
  listEmployees: (options?: {
    limit?: number | 'all';
    offset?: number;
    fields?: string[];
    sortBy?: 'full_name' | 'structure_name' | 'tenure' | 'employee_cost' | 'resign_proba' | 'churn_risk' | 'reasoning_churn_risk';
    sortDir?: 'ASC' | 'DESC';
    includeTotal?: boolean;
    includeSummary?: boolean;
  }) => Promise<{
    rows: CombinedEmployeeData[];
    limit: number | null;
    offset: number;
    total?: number;
    hasMore: boolean;
    datasetId: string | null;
    fields: string[];
    summary?: {
      total_employees: number;
      average_churn_probability: number;
      high_risk_count: number;
    };
  }>;
  listCombinedEmployees: (options?: {
    limit?: number;
    offset?: number;
    fields?: string[];
  }) => Promise<any[]>; // Legacy helper

  // --- Output Data ---
  listChurnOutput: () => Promise<ChurnOutputData[]>;
  listRawHrInput: () => Promise<any[]>; // Consider if this is still needed if datasets are used

  // --- License (Ensure these match preload.js implementation) ---
  verifyLicense: (key: string) => Promise<{ valid: boolean; data?: LicenseData }>;
  getLicenseData: () => Promise<LicenseData | null>;
  activateLicenseOfflineStep1: () => Promise<string>;
  activateLicenseOfflineStep2: (filePath: string) => Promise<{ success: boolean; message: string }>;

  // +++ Add Chatbot Interface +++
  chatbot: {
    sendMessage: (payload: { sessionId: string; employeeId?: string | number | null; content: string; }) => Promise<import('./chat').ChatResponse>;
    getHistory: (sessionId: string) => Promise<import('./chat').ChatMessage[]>;
  };

  // --- Playground Specific API ---
  getPlaygroundData: (employeeId: string) => Promise<PlaygroundEmployeeData | null>;
  getTreatmentSuggestions: (employeeId: string) => Promise<{ suggestions: TreatmentSuggestion[] } | null>;
  applySelectedTreatment: (employeeId: string, treatmentId: number) => Promise<ApplyTreatmentResult | null>;
  calculateELTV: () => Promise<{ success: boolean; count: number; errors: string[] }>;
  manualSimulate: (simulationInput: { employeeId: string; changedFeatures: any }) => Promise<ManualSimulationResult | null>;
  saveScenario: (scenarioData: any) => Promise<{ scenarioId: string }>;
  exportScenario: (scenarioId: number) => Promise<any>;

  // --- NEW Database Data Transfer ---
  importFromDb: (args: { 
    connectionId: string; 
    tableName: string; 
    datasetName: string; 
    // Add mapping configuration later if needed
  }) => Promise<{ 
    success: boolean; 
    message: string; 
    datasetId?: string; 
    recordCount?: number; 
    error?: string; 
  }>;
  exportToDb: (args: { 
    connectionId: string; 
    tableName: string; 
    data: any[]; // Type this more strictly later based on results data structure
    createTable?: boolean; // Add optional flag
    // Add export options later if needed (e.g., overwrite, append)
  }) => Promise<{ 
    success: boolean; 
    message: string; 
    error?: string; 
  }>;
  // --- END NEW Database Data Transfer ---

  // Project Management
  exportProject: (projectName: string, projectPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  importProject: () => Promise<{ success: boolean; importedProject?: { id: string; name: string; dbPath: string }; error?: string }>;

  // --- Reasoning Module ---
  reasoning?: {
    getEmployeeReasoning: (hrCode: string) => Promise<any>;
    refreshEmployeeReasoning: (hrCode: string) => Promise<any>;
    getBatchReasoning: (hrCodes: string[]) => Promise<any>;
    getReasoningSummary: (limit?: number) => Promise<any>;
    invalidateEmployeeCache: (hrCode: string) => Promise<any>;
    invalidateAllCache: () => Promise<any>;
    getAllRules: () => Promise<any>;
    createRule: (rule: any) => Promise<any>;
    updateRule: (ruleId: string, updates: any) => Promise<any>;
    deleteRule: (ruleId: string) => Promise<any>;
    testRule: (testData: any) => Promise<any>;
    getAllStages: () => Promise<any>;
    createStage: (stage: any) => Promise<any>;
    testStageInference: (hrCode: string) => Promise<any>;
    getLLMStatus: () => Promise<any>;
    askLLMQuestion: (questionData: any) => Promise<any>;
  };

  // --- General Invoke Method ---
  invoke?: (channel: string, ...args: any[]) => Promise<any>;
}

declare global {
  interface Window {
    electronApi?: ElectronAPI;
  }
}

// export {}; 
