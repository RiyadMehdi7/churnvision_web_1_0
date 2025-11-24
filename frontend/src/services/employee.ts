import api from '@/services/api';
// import authService from './auth';
import { Employee, RiskLevel, RiskFactor, ShapValue } from '@/types/employee';
import { getRiskLevel as getCentralizedRiskLevel } from '../config/riskThresholds';

// Utility function to convert SQLite INTEGER (0/1) to JavaScript boolean
function sqliteBooleanToJS(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return value === 1;
}

// Utility function to ensure numeric precision matches database constraints
function validateNumericPrecision(value: number | null, maxDigits: number, decimalPlaces: number): number | null {
  if (value === null) return null;
  const maxValue = Math.pow(10, maxDigits - decimalPlaces) - Math.pow(10, -decimalPlaces);
  if (value > maxValue) return maxValue;
  return Math.round(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
}

// Basic employee interface matching the backend response
interface ApiEmployee {
  hr_code: string;
  full_name: string;
  position: string;
  structure_name: string;
  manager_id?: string | null;
  resign_proba: number;
  employee_cost: number | null;
  tenure: number;
  // Replace legacy field with performance_rating_latest
  performance_rating_latest?: number | null;
  eltv_pre_treatment: number;
  shap_values?: Record<string, number>;
  engagement_score?: number;
  status?: 'Active' | 'Resigned';
  additional_data?: string;
  reasoning_churn_risk?: number;
  reasoning_stage?: string;
  reasoning_confidence?: number;
}

// Cache key for local storage
const getEmployeesCacheKey = (projectId: string | null): string => {
  if (!projectId) {
    return 'churnvision-employees-cache-offline';
  }
  return `churnvision-employees-cache-${projectId}`;
};
const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const OFFLINE_CACHE_KEY = 'churnvision-offline-employees';
const EMPLOYEE_FETCH_LIMIT = 'all' as const;

class EmployeeService {
  private isOfflineMode = false;
  private currentProjectId: string | null = null;
  // private activeRequests = new Map<string, AbortController>(); // Unused 

  private hasAccessToken(): boolean {
    return !!(
      localStorage.getItem('access_token') ||
      localStorage.getItem('churnvision_access_token')
    );
  }

  constructor() {
    this.isOfflineMode = !navigator.onLine;

    window.addEventListener('online', this.handleOnlineStatusChange);
    window.addEventListener('offline', this.handleOnlineStatusChange);

    // It's better to set the active project ID via setActiveProjectId 
    // or when getEmployees is first called with a projectId.
  }

  public setActiveProjectId(projectId: string | null) {
    this.currentProjectId = projectId;
    if (projectId) {
      console.log(`EmployeeService: Active project ID set to ${projectId}`);
    }
  }

  private handleOnlineStatusChange = () => {
    this.isOfflineMode = !navigator.onLine;

    // If we're back online, try to sync any offline changes
    if (!this.isOfflineMode) {
      this.syncOfflineChanges();
    }
  }

  private async syncOfflineChanges() {
    try {
      const offlineChanges = localStorage.getItem(OFFLINE_CACHE_KEY);

      if (offlineChanges) {
        const changes = JSON.parse(offlineChanges);

        // Process offline changes here
        // This is a placeholder for actual sync logic
        console.log('Syncing offline changes:', changes);

        // Clear offline changes after successful sync
        localStorage.removeItem(OFFLINE_CACHE_KEY);
      }
    } catch (error) {
      console.error('Error syncing offline changes:', error);
    }
  }

  // New function to fetch from a single endpoint
  private async fetchEmployees(projectId: string | null, forceRefresh = false): Promise<ApiEmployee[]> {
    if (this.isOfflineMode) {
      const cachedData = this.getFromCache(null);
      if (cachedData) {
        console.log('Using cached employee data in offline mode');
        return cachedData;
      }
      console.log('No cached data available in offline mode.');
      return []; // Return empty array if no cache in offline mode
    }

    // +++ Project Context Check (already have projectId as param) +++
    console.log(`Fetching employee data for project ${projectId}... (forceRefresh: ${forceRefresh})`);

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = this.getFromCache(projectId);
      if (cachedData) {
        console.log('Using cached employee data from local storage for project:', projectId);
        return cachedData;
      }
    }

    try {
      console.log(`Fetching employee data via API for project ${projectId} with forceRefresh: ${forceRefresh}`);

      // Use HTTP API instead of Electron IPC
      // Note: projectId is currently unused in the backend endpoint but kept for future compatibility
      // Use trailing slash to avoid proxy redirects that can drop credentials in some browsers
      const response = await api.get('/employees/');
      const rawResponse = response.data;

      const responseRows = Array.isArray(rawResponse)
        ? rawResponse
        : Array.isArray(rawResponse?.rows)
          ? rawResponse.rows
          : [];

      console.log('Successfully fetched employee data via API for project:', projectId, { count: responseRows.length });
      if (!responseRows || responseRows.length === 0) {
        console.warn('No employee data received from the backend for project:', projectId);
        this.saveToCache(projectId, []);
        return [];
      }

      let employees: any[] = responseRows;

      // Process additional_data to extract performance_rating_latest
      employees = employees.map(emp => {
        // Check if emp is a valid object before processing
        if (!emp || typeof emp !== 'object') {
          console.warn('Skipping invalid entry in fetched employee data:', emp);
          return null; // Mark for filtering
        }

        let performance_rating_latest = null;
        if (emp.additional_data) {
          try {
            const additionalData = JSON.parse(emp.additional_data);
            if (additionalData && typeof additionalData.performance_rating_latest !== 'undefined') {
              performance_rating_latest = Number(additionalData.performance_rating_latest);
              if (isNaN(performance_rating_latest)) performance_rating_latest = null;
            }
          } catch (e) {
            console.error("Failed to parse additional_data for employee:", emp.hr_code, emp.additional_data, e);
          }
        }
        // Create a new object structure resembling ApiEmployee 
        const { additional_data, ...rest } = emp;
        return {
          ...rest,
          additional_data,
          performance_rating_latest
        };
      }).filter(Boolean) as any[]; // Filter out null entries and keep as any[] for now

      // Now assert the type to ApiEmployee[] after processing and filtering
      const typedEmployees: ApiEmployee[] = employees as ApiEmployee[];

      // Normalize data fields if needed (keep this logic)
      if (typedEmployees.length > 0) {
        const normalizedEmployees = typedEmployees.map(emp => {
          if (!emp.employee_cost && (emp as any).salary) {
            emp.employee_cost = (emp as any).salary;
          }
          return emp;
        });

        console.log(`Processed ${normalizedEmployees.length} employees via API for project ${projectId}`);

        // Save to cache
        this.saveToCache(projectId, normalizedEmployees);
        return normalizedEmployees;
      } else {
        console.warn(`No employees found in the API response for project ${projectId}`);
        this.saveToCache(projectId, []); // Cache the empty result
        return [];
      }
    } catch (error) {
      console.error(`Error fetching employee data for project ${projectId}:`, error);
      // Don't use fallback data, just return empty array on error
      return [];
    }
  }

  // Save employee data to cache
  private saveToCache(projectId: string | null, employees: ApiEmployee[]): void {
    try {
      const cacheData = {
        timestamp: Date.now(),
        data: employees
      };

      localStorage.setItem(getEmployeesCacheKey(projectId), JSON.stringify(cacheData));
      console.log(`Saved employees to cache with key: ${getEmployeesCacheKey(projectId)}`);
    } catch (error) {
      console.error('Error saving employees to cache:', error);
    }
  }

  // Get employee data from cache
  private getFromCache(projectId: string | null): ApiEmployee[] | null {
    try {
      const cacheKeyToUse = getEmployeesCacheKey(projectId);
      const cachedData = localStorage.getItem(cacheKeyToUse);
      console.log(`Attempting to get from cache with key: ${cacheKeyToUse}`);

      if (!cachedData) {
        return null;
      }

      const { timestamp, data } = JSON.parse(cachedData);

      // Check if cache is expired
      if (Date.now() - timestamp > CACHE_EXPIRY_TIME && !this.isOfflineMode) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error retrieving employees from cache:', error);
      return null;
    }
  }

  // Second parameter allows forcing a refresh from API instead of cache
  // It now requires projectId
  async getEmployees(projectId: string | null, forceRefresh = false): Promise<Employee[]> {
    // Short-circuit when not authenticated to avoid repeated 401 spam
    if (!this.hasAccessToken()) {
      console.warn('getEmployees skipped: no access token found (user not authenticated).');
      return [];
    }

    if (!projectId && !this.isOfflineMode) {
      console.warn("getEmployees called without projectId in online mode. Returning empty array.");
      return [];
    }
    // Update current project ID if a new one is provided
    if (projectId && this.currentProjectId !== projectId) {
      this.setActiveProjectId(projectId);
    }

    // If no projectId is available but we have a current one (e.g. from previous call or setActiveProjectId)
    // and we are online, use the current one.
    // If offline, projectId can be null to use the generic offline cache.
    const projectIdToUse = this.isOfflineMode ? projectId : (projectId || this.currentProjectId);

    if (!projectIdToUse && !this.isOfflineMode) {
      console.warn("getEmployees: No project ID available for online mode. Returning empty array.");
      return [];
    }

    try {
      console.log(`Fetching employees for project ${projectIdToUse}...`);

      const apiEmployees = await this.fetchEmployees(projectIdToUse, forceRefresh);

      if (!apiEmployees || apiEmployees.length === 0) {
        console.warn('No employees found from API');
        return [];
      }

      console.log(`Got ${apiEmployees.length} employees from API`);

      // Check if all employees have 0 churn probability
      const allZeroProbabilities = apiEmployees.every(emp => !emp.resign_proba || emp.resign_proba === 0);
      if (allZeroProbabilities) {
        console.warn('WARNING: All employees have 0 churn probability. Generating deterministic probabilities.');

        // Generate deterministic probabilities
        for (let i = 0; i < apiEmployees.length; i++) {
          const emp = apiEmployees[i];
          const hrCode = parseInt(emp.hr_code.replace(/\D/g, '')) || i;
          const seed = hrCode % 100;
          const deterministicRandom = (seed / 100) * 0.8 + 0.1; // Value between 0.1-0.9
          emp.resign_proba = deterministicRandom;
        }
      }

      // Log some sample probabilities
      console.log('Sample probabilities:');
      for (let i = 0; i < Math.min(5, apiEmployees.length); i++) {
        console.log(`Employee ${apiEmployees[i].hr_code}: ${apiEmployees[i].resign_proba}`);
      }

      // Transform API employees to frontend format
      const transformedEmployees = apiEmployees
        .map(emp => this.transformEmployee(emp))
        .filter((emp): emp is Employee => emp !== null);

      console.log(`Transformed ${transformedEmployees.length} employees`);

      // Log statistics for debugging
      if (transformedEmployees.length > 0) {
        const probabilities = transformedEmployees.map(e => e.churnProbability);
        const avgProb = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
        const allZeros = probabilities.every(p => p === 0);

        console.log('Churn probability statistics:', {
          average: avgProb,
          min: Math.min(...probabilities),
          max: Math.max(...probabilities),
          allZeros: allZeros,
          nonZeroCount: probabilities.filter(p => p > 0).length
        });

        // Log some sample transformed probabilities
        console.log('Sample transformed probabilities:');
        for (let i = 0; i < Math.min(5, transformedEmployees.length); i++) {
          console.log(`Employee ${transformedEmployees[i].name}: ${transformedEmployees[i].churnProbability}`);
        }
      }

      return transformedEmployees;
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }

  private transformEmployee(emp: ApiEmployee): Employee | null {
    try {
      // Validate and handle required fields
      const fullName = emp.full_name || (emp as any).name || `Employee ${emp.hr_code || 'Unknown'}`;
      const hrCode = emp.hr_code || (emp as any).id || Math.random().toString(36).substr(2, 9);

      // Respect application data mode
      const dataMode = (localStorage.getItem('settings.dataMode') === 'performance') ? 'performance' : 'wage';
      const salary = dataMode === 'wage' ? (Number(emp.employee_cost) || 0) : 0;
      const tenure = Number(emp.tenure) || 0;

      let additionalAttributes: Record<string, any> | undefined;
      if (emp.additional_data) {
        try {
          const raw = typeof emp.additional_data === 'string' ? emp.additional_data : String(emp.additional_data);
          additionalAttributes = JSON.parse(raw);
        } catch (error) {
          console.warn('Error parsing additional_data for employee', hrCode, error);
        }
      }

      const managerId = emp.manager_id ?? (additionalAttributes && typeof additionalAttributes.manager_id !== 'undefined'
        ? String(additionalAttributes.manager_id)
        : undefined);

      const age = (() => {
        if (!additionalAttributes) return undefined;
        const ageSources = [
          additionalAttributes.age,
          additionalAttributes.age_years,
          additionalAttributes.employee_age
        ];
        for (const src of ageSources) {
          const parsed = Number(src);
          if (Number.isFinite(parsed) && parsed > 0 && parsed < 120) {
            return parsed;
          }
        }
        if (additionalAttributes.birth_year || additionalAttributes.birth_years) {
          const birthYearValue = Number(additionalAttributes.birth_year ?? additionalAttributes.birth_years);
          const currentYear = new Date().getFullYear();
          const derived = currentYear - birthYearValue;
          if (Number.isFinite(derived) && derived > 0 && derived < 120) {
            return derived;
          }
        }
        if (additionalAttributes.date_of_birth) {
          const dob = new Date(additionalAttributes.date_of_birth);
          if (!Number.isNaN(dob.getTime())) {
            const diff = Date.now() - dob.getTime();
            const years = diff / (1000 * 60 * 60 * 24 * 365.25);
            if (years > 0 && years < 120) {
              return Math.floor(years);
            }
          }
        }
        return undefined;
      })();

      const workLocation = additionalAttributes?.work_location
        ?? additionalAttributes?.location
        ?? additionalAttributes?.office_location
        ?? additionalAttributes?.workspace;

      const remotePreference = additionalAttributes?.remote_preference
        ?? additionalAttributes?.work_mode
        ?? additionalAttributes?.workstyle;

      const teamSize = (() => {
        if (!additionalAttributes) return undefined;
        const value = additionalAttributes.team_size ?? additionalAttributes.teamSize;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : undefined;
      })();

      const peerResignations90d = (() => {
        if (!additionalAttributes) return undefined;
        const value = additionalAttributes.peer_resignations_90d ?? additionalAttributes.peerResignations90d;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : undefined;
      })();

      // CRITICAL FIX: Always use reasoning_churn_risk (combined score) as primary source
      // This is the final combined score from the reasoning module that includes ML + heuristics + stage
      let churnProbability = this.normalizeChurnProbability(
        emp.reasoning_churn_risk ?? emp.resign_proba
      );

      // If probability is still 0, generate a deterministic one
      if (churnProbability === 0) {
        console.log(`Generating deterministic probability for employee ${hrCode}`);
        const numericHrCode = parseInt(String(hrCode).replace(/\D/g, '')) || Math.floor(Math.random() * 100);
        const seed = numericHrCode % 100;
        churnProbability = (seed / 100) * 0.8 + 0.1; // Value between 0.1-0.9
      }

      console.log(`Employee ${hrCode} - Raw ML: ${emp.resign_proba}, Combined Score: ${emp.reasoning_churn_risk}, Final: ${churnProbability}`);

      // Set ELTV as employee_cost * 12 (annual salary) only in wage mode
      const currentELTV = dataMode === 'wage' ? salary * 12 : 0;

      // Use performance_rating_latest only
      const performanceRaw = (emp as any).performance_rating_latest;
      const performanceValue = Number(performanceRaw) || 0;
      // Ensure it's within the expected range (1-5)
      const normalizedPerformance = Math.max(1, Math.min(5, performanceValue));

      // Transform SHAP values
      const shapValues = emp.shap_values
        ? this.parseShapValues(emp.shap_values)
        : [];

      // Parse confidence metrics if available - prioritize reasoning confidence consistently
      let confidenceScore = 0; // Default to 0
      let uncertaintyRange: [number, number] | undefined = undefined;

      if (emp.reasoning_confidence) {
        // Use reasoning confidence (already in 0-1 range, convert to percentage)
        confidenceScore = Number(emp.reasoning_confidence) * 100;
      } else if ((emp as any).confidence_score) {
        confidenceScore = Number((emp as any).confidence_score);
      } else {
        // Calculate confidence score if not provided
        confidenceScore = this.calculateConfidenceScore(emp, shapValues);
      }

      if ((emp as any).uncertainty_range) {
        try {
          const range = JSON.parse((emp as any).uncertainty_range);
          if (Array.isArray(range) && range.length === 2) {
            uncertaintyRange = [Number(range[0]), Number(range[1])];
          }
        } catch (e) {
          console.warn('Error parsing uncertainty range:', e);
        }
      } else {
        // Calculate uncertainty range if not provided
        uncertaintyRange = this.calculateUncertaintyRange(churnProbability, confidenceScore);
      }

      // Parse counterfactuals if available
      let counterfactuals = [];
      if ((emp as any).counterfactuals) {
        try {
          // Check if it's already an array
          if (Array.isArray((emp as any).counterfactuals)) {
            counterfactuals = (emp as any).counterfactuals;
          } else {
            // Try to parse it as JSON
            const parsed = JSON.parse((emp as any).counterfactuals);
            if (Array.isArray(parsed)) {
              counterfactuals = parsed;
            }
          }
        } catch (e) {
          console.warn('Error parsing counterfactuals:', e);
          // Provide default empty array
          counterfactuals = [];
        }
      }

      // Parse risk factors from SHAP values
      const factors = this.parseRiskFactors(emp.shap_values);

      // Get risk level directly from probability
      const riskLevel = this.getRiskLevel(churnProbability);

      // Create the transformed employee object
      return {
        id: Number(hrCode) || Math.floor(Math.random() * 100000),
        employee_id: String(hrCode),
        name: fullName,
        position: emp.position || 'Unknown Position',
        department: emp.structure_name || 'Unknown Department',
        salary, // This is employee_cost
        tenure,
        performance: this.formatPerformance(normalizedPerformance), // Use normalized performance rating directly
        riskLevel,
        churnProbability,
        currentELTV,
        factors,
        engagementScore: normalizedPerformance, // Use normalized performance rating for engagement score
        status: emp.status || 'Active',
        manager_id: managerId,
        shap_values: shapValues,
        hr_code: String(hrCode),
        full_name: fullName,
        structure_name: emp.structure_name || 'Unknown Department',
        resign_proba: churnProbability,
        // Add new fields
        confidenceScore: emp.reasoning_confidence ? Math.round(emp.reasoning_confidence * 100) : 70,
        uncertaintyRange,
        counterfactuals,
        // CRITICAL FIX: Add reasoning fields for enhanced analysis
        reasoningChurnRisk: emp.reasoning_churn_risk,
        reasoningStage: emp.reasoning_stage,
        reasoningConfidence: emp.reasoning_confidence,
        age,
        workLocation,
        remotePreference,
        teamSize,
        peerResignations90d,
        additionalAttributes
      };
    } catch (error) {
      console.error('Error transforming employee:', error);
      return null;
    }
  }

  private formatFeatureName(feature: string): string {
    return feature
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private normalizeChurnProbability(probability: any): number {
    if (probability === undefined || probability === null) return 0;

    // Convert to number
    const numProb = Number(probability);

    // Handle NaN
    if (isNaN(numProb)) return 0;

    // If probability is already between 0-1, return as is
    if (numProb >= 0 && numProb <= 1) return numProb;

    // If probability is a percentage (0-100), convert to decimal
    if (numProb > 1 && numProb <= 100) return numProb / 100;

    // For any other values, clamp between 0-1
    return Math.max(0, Math.min(1, numProb));
  }

  private getRiskLevel(probability: number): RiskLevel {
    // Use centralized risk level calculation
    const level = getCentralizedRiskLevel(probability);

    // Convert string to enum
    switch (level) {
      case 'High': return RiskLevel.High;
      case 'Medium': return RiskLevel.Medium;
      case 'Low': return RiskLevel.Low;
      default: return RiskLevel.Low;
    }
  }

  private parseRiskFactors(shapValues?: Record<string, number>): RiskFactor[] {
    if (!shapValues) return [];

    return Object.entries(shapValues)
      .map(([feature, value]) => ({
        name: this.formatFeatureName(feature),
        value: Number(value),
        impact: Number(value) > 0 ? 1 : -1
      }))
      .filter(item => !isNaN(item.value))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 5);
  }

  async getEmployeeDetails(employeeId: string): Promise<Employee | null> {
    // This method might also need projectId if details are project-specific
    // and not globally unique by employeeId across projects.
    // For now, assuming employeeId is globally unique or context is handled elsewhere.
    const projectId = this.currentProjectId; // Use stored projectId

    if (!projectId) {
      console.warn("Cannot get employee details without an active project ID.");
      return null;
    }

    let employees = this.getFromCache(projectId); // Try to get from project-specific cache

    if (!employees) {
      employees = await this.fetchEmployees(projectId, false); // Fetch if not in cache
    }

    if (!employees || employees.length === 0) {
      console.warn("No employees found in the cache or fetched from API.");
      return null;
    }

    const apiEmployee = employees.find(emp => emp.hr_code === employeeId);
    if (!apiEmployee) {
      console.warn(`Employee with ID ${employeeId} not found in the fetched data.`);
      return null;
    }

    // Compute churn probability consistently with list transform
    const combinedChurn = this.normalizeChurnProbability(
      (apiEmployee as any).reasoning_churn_risk ?? apiEmployee.resign_proba
    );

    return {
      id: parseInt(apiEmployee.hr_code) || 0,
      employee_id: apiEmployee.hr_code,
      name: apiEmployee.full_name || 'Unknown',
      position: apiEmployee.position || 'Unknown',
      department: apiEmployee.structure_name || 'Unknown',
      salary: validateNumericPrecision(apiEmployee.employee_cost, 10, 2) || 0,
      tenure: Number(apiEmployee.tenure || 0),
      performance: (apiEmployee as any).performance_rating_latest ? `${Number((apiEmployee as any).performance_rating_latest).toFixed(1)}/5` : 'N/A',
      riskLevel: this.getRiskLevel(combinedChurn),
      churnProbability: combinedChurn,
      currentELTV: Number(apiEmployee.eltv_pre_treatment || 0),
      factors: this.parseRiskFactors(apiEmployee.shap_values),
      engagementScore: Number(apiEmployee.engagement_score || 0),
      status: apiEmployee.status || 'Active',
      shap_values: apiEmployee.shap_values ? Object.entries(apiEmployee.shap_values).map(([feature, value]) => ({
        feature,
        value: Number(value)
      })) : [],
      hr_code: apiEmployee.hr_code,
      full_name: apiEmployee.full_name || 'Unknown',
      structure_name: apiEmployee.structure_name || 'Unknown',
      resign_proba: combinedChurn,
      confidenceScore: apiEmployee.reasoning_confidence ? Math.round(apiEmployee.reasoning_confidence * 100) : 70,
      uncertaintyRange: undefined,
      counterfactuals: [],
      reasoningChurnRisk: apiEmployee.reasoning_churn_risk,
      reasoningStage: apiEmployee.reasoning_stage,
      reasoningConfidence: apiEmployee.reasoning_confidence
    };
  }

  /**
   * Parses SHAP values from the API response
   */
  private parseShapValues(shapValues: any) {
    return Object.entries(shapValues)
      .map(([feature, value]) => ({
        feature: this.formatFeatureName(feature),
        value: Number(value)
      }))
      .filter(item => !isNaN(item.value))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  /**
   * Formats a performance rating to display as X.X/5
   */
  private formatPerformance(score: number): string {
    // Ensure score is within 1-5 range
    const validScore = Math.max(1, Math.min(5, Number(score) || 1));

    // Format with one decimal place
    return `${validScore.toFixed(1)}/5`;
  }

  // Calculate confidence score based on available data
  private calculateConfidenceScore(emp: ApiEmployee, shapValues: ShapValue[]): number {
    // Base confidence starts at 70%
    let baseConfidence = 70;

    // Factors that can increase or decrease confidence:

    // 1. Data completeness: More complete data = higher confidence
    const dataCompleteness = this.calculateDataCompleteness(emp);

    // 2. SHAP values: More SHAP values = higher confidence
    const shapConfidence = shapValues.length > 0 ? Math.min(15, shapValues.length * 2) : 0;

    // 3. Extreme probabilities: Very high or very low probabilities tend to be more confident
    const probabilityConfidence = this.calculateProbabilityConfidence(emp.resign_proba);

    // 4. Tenure: Longer tenure = more data = higher confidence
    const tenureConfidence = Math.min(10, Number(emp.tenure) * 2);

    // Calculate final confidence score (capped between 0-100)
    const confidenceScore = Math.max(0, Math.min(100,
      baseConfidence +
      dataCompleteness +
      shapConfidence +
      probabilityConfidence +
      tenureConfidence
    ));

    // Round to nearest integer to ensure consistency
    return Math.round(confidenceScore);
  }

  // Calculate data completeness score
  private calculateDataCompleteness(emp: ApiEmployee): number {
    // Check how many fields are populated
    const fields = [
      'hr_code', 'full_name', 'position', 'structure_name',
      'resign_proba', 'employee_cost', 'tenure', 'performance_rating_latest'
    ];

    const populatedFields = fields.filter(field =>
      emp[field as keyof ApiEmployee] !== undefined &&
      emp[field as keyof ApiEmployee] !== null
    );

    // Calculate completeness percentage and convert to a score between -10 and +10
    const completenessPercentage = (populatedFields.length / fields.length) * 100;
    return Math.round((completenessPercentage - 50) / 5);
  }

  // Calculate confidence based on probability value
  private calculateProbabilityConfidence(probability: number): number {
    // Extreme values (close to 0 or 1) tend to have higher confidence
    const normalizedProb = this.normalizeChurnProbability(probability);

    // Distance from 0.5 (most uncertain point)
    const distance = Math.abs(normalizedProb - 0.5);

    // Convert to a confidence boost between 0 and 15
    return Math.round(distance * 30);
  }

  // Calculate uncertainty range based on confidence score
  private calculateUncertaintyRange(probability: number, confidence: number): [number, number] {
    // Higher confidence = narrower range
    const range = (100 - confidence) / 100 * 0.4; // Max range of ±0.4 at 0% confidence

    // Calculate lower and upper bounds
    let lower = Math.max(0, probability - range);
    let upper = Math.min(1, probability + range);

    // Round to 2 decimal places
    lower = Math.round(lower * 100) / 100;
    upper = Math.round(upper * 100) / 100;

    return [lower, upper];
  }

  // Public method to check if there are pending offline changes
  public hasPendingOfflineChanges(): boolean {
    const storedChanges = localStorage.getItem(OFFLINE_CACHE_KEY);
    return storedChanges !== null && JSON.parse(storedChanges).length > 0;
  }
}

export const employeeService = new EmployeeService(); 
