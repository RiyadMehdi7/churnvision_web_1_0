import api from '@/services/api';

// Types for engagement data
export interface EngagementData {
  employeeId: string;
  surveyDate: Date;
  overallSatisfaction: number;
  workLifeBalance?: number;
  careerDevelopment?: number;
  managementRating?: number;
  teamCollaboration?: number;
  compensationSatisfaction?: number;
  additionalMetrics?: Record<string, any>;
}

export interface EngagementUploadResult {
  success: boolean;
  recordsProcessed: number;
  errors: EngagementUploadError[];
  warnings: EngagementUploadWarning[];
  dataPreview: any[];
  validationResults: EngagementValidationResult;
}

export interface EngagementUploadError {
  row: number;
  column: string;
  message: string;
  value?: any;
}

export interface EngagementUploadWarning {
  row: number;
  column: string;
  message: string;
  value?: any;
}

export interface EngagementValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  requiredColumns: string[];
  optionalColumns: string[];
  detectedColumns: string[];
}

export interface EngagementFilters {
  employeeId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  satisfactionRange?: {
    min: number;
    max: number;
  };
  department?: string;
}

export interface EngagementSummary {
  totalRecords: number;
  averageSatisfaction: number;
  satisfactionDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  latestSurveyDate: Date;
  oldestSurveyDate: Date;
  employeesWithData: number;
}

export interface AnalysisReadyData {
  employeeId: string;
  metrics: Record<string, number>;
  surveyDate: Date;
  overallScore: number;
}

// Required columns for engagement surveys
const REQUIRED_COLUMNS = [
  'employee_id',
  'survey_date',
  'overall_satisfaction'
];

// Optional columns that can enhance analysis
const OPTIONAL_COLUMNS = [
  'work_life_balance',
  'career_development',
  'management_rating',
  'team_collaboration',
  'compensation_satisfaction'
];

// Column mappings for common variations
const COLUMN_MAPPINGS: Record<string, string[]> = {
  employee_id: ['employee_id', 'emp_id', 'id', 'employee', 'worker_id', 'staff_id'],
  survey_date: ['survey_date', 'date', 'survey_time', 'timestamp', 'created_date'],
  overall_satisfaction: ['overall_satisfaction', 'satisfaction', 'overall_score', 'total_satisfaction', 'general_satisfaction'],
  work_life_balance: ['work_life_balance', 'wlb', 'balance', 'work_balance', 'life_balance'],
  career_development: ['career_development', 'career', 'development', 'growth', 'career_growth'],
  management_rating: ['management_rating', 'management', 'manager_rating', 'supervisor_rating', 'leadership'],
  team_collaboration: ['team_collaboration', 'collaboration', 'teamwork', 'team_work', 'team_rating'],
  compensation_satisfaction: ['compensation_satisfaction', 'compensation', 'salary_satisfaction', 'pay_satisfaction', 'benefits']
};

class EngagementDataService {
  /**
   * Upload engagement survey data
   */
  async uploadEngagementData(file: File): Promise<EngagementUploadResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataType', 'engagement');

      const response = await api.post('/api/data/upload/engagement', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // 60 second timeout for large files
      });

      return response.data;
    } catch (error) {
      console.error('Error uploading engagement data:', error);
      throw new Error(
        error instanceof Error 
          ? `Upload failed: ${error.message}` 
          : 'Failed to upload engagement data'
      );
    }
  }

  /**
   * Validate engagement data format
   */
  validateEngagementFormat(data: any[]): EngagementValidationResult {
    const errors: Record<string, string[]> = {};
    const warnings: Record<string, string[]> = {};
    
    if (!data || data.length === 0) {
      errors.general = ['No data provided'];
      return {
        isValid: false,
        errors,
        warnings,
        requiredColumns: REQUIRED_COLUMNS,
        optionalColumns: OPTIONAL_COLUMNS,
        detectedColumns: []
      };
    }

    // Get column names from first row
    const detectedColumns = Object.keys(data[0] || {});
    
    // Check for required columns
    const missingRequired: string[] = [];
    for (const requiredCol of REQUIRED_COLUMNS) {
      const found = this.findColumnMatch(requiredCol, detectedColumns);
      if (!found) {
        missingRequired.push(requiredCol);
      }
    }

    if (missingRequired.length > 0) {
      errors.columns = [`Missing required columns: ${missingRequired.join(', ')}`];
    }

    // Validate data types and ranges
    data.forEach((row, index) => {
      // Validate employee ID
      const empId = this.extractValue(row, 'employee_id', detectedColumns);
      if (!empId || empId.toString().trim() === '') {
        if (!errors[`row_${index}`]) errors[`row_${index}`] = [];
        errors[`row_${index}`].push('Employee ID is required');
      }

      // Validate survey date
      const surveyDate = this.extractValue(row, 'survey_date', detectedColumns);
      if (!surveyDate || isNaN(Date.parse(surveyDate))) {
        if (!errors[`row_${index}`]) errors[`row_${index}`] = [];
        errors[`row_${index}`].push('Invalid survey date format');
      }

      // Validate satisfaction scores (should be numeric and in reasonable range)
      const satisfaction = this.extractValue(row, 'overall_satisfaction', detectedColumns);
      if (satisfaction !== null && satisfaction !== undefined) {
        const numSatisfaction = Number(satisfaction);
        if (isNaN(numSatisfaction)) {
          if (!errors[`row_${index}`]) errors[`row_${index}`] = [];
          errors[`row_${index}`].push('Overall satisfaction must be numeric');
        } else if (numSatisfaction < 1 || numSatisfaction > 10) {
          if (!warnings[`row_${index}`]) warnings[`row_${index}`] = [];
          warnings[`row_${index}`].push('Satisfaction score outside typical range (1-10)');
        }
      }

      // Validate optional numeric columns
      for (const optionalCol of OPTIONAL_COLUMNS.slice(1)) { // Skip employee_id and survey_date
        const value = this.extractValue(row, optionalCol, detectedColumns);
        if (value !== null && value !== undefined && value !== '') {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            if (!warnings[`row_${index}`]) warnings[`row_${index}`] = [];
            warnings[`row_${index}`].push(`${optionalCol} should be numeric`);
          }
        }
      }
    });

    const isValid = Object.keys(errors).length === 0;

    return {
      isValid,
      errors,
      warnings,
      requiredColumns: REQUIRED_COLUMNS,
      optionalColumns: OPTIONAL_COLUMNS,
      detectedColumns
    };
  }

  /**
   * Process raw engagement data into standardized format
   */
  async processEngagementData(rawData: any[]): Promise<EngagementData[]> {
    if (!rawData || rawData.length === 0) {
      throw new Error('No data to process');
    }

    const detectedColumns = Object.keys(rawData[0] || {});
    const processedData: EngagementData[] = [];

    for (const row of rawData) {
      try {
        const employeeId = this.extractValue(row, 'employee_id', detectedColumns);
        const surveyDateStr = this.extractValue(row, 'survey_date', detectedColumns);
        const overallSatisfaction = Number(this.extractValue(row, 'overall_satisfaction', detectedColumns));

        if (!employeeId || !surveyDateStr || isNaN(overallSatisfaction)) {
          continue; // Skip invalid rows
        }

        const surveyDate = new Date(surveyDateStr);
        if (isNaN(surveyDate.getTime())) {
          continue; // Skip rows with invalid dates
        }

        const engagementRecord: EngagementData = {
          employeeId: employeeId.toString(),
          surveyDate,
          overallSatisfaction,
        };

        // Add optional metrics
        const workLifeBalance = this.extractNumericValue(row, 'work_life_balance', detectedColumns);
        if (workLifeBalance !== null) engagementRecord.workLifeBalance = workLifeBalance;

        const careerDevelopment = this.extractNumericValue(row, 'career_development', detectedColumns);
        if (careerDevelopment !== null) engagementRecord.careerDevelopment = careerDevelopment;

        const managementRating = this.extractNumericValue(row, 'management_rating', detectedColumns);
        if (managementRating !== null) engagementRecord.managementRating = managementRating;

        const teamCollaboration = this.extractNumericValue(row, 'team_collaboration', detectedColumns);
        if (teamCollaboration !== null) engagementRecord.teamCollaboration = teamCollaboration;

        const compensationSatisfaction = this.extractNumericValue(row, 'compensation_satisfaction', detectedColumns);
        if (compensationSatisfaction !== null) engagementRecord.compensationSatisfaction = compensationSatisfaction;

        // Collect any additional metrics not in standard columns
        const additionalMetrics: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!this.isStandardColumn(key) && value !== null && value !== undefined && value !== '') {
            additionalMetrics[key] = value;
          }
        }
        if (Object.keys(additionalMetrics).length > 0) {
          engagementRecord.additionalMetrics = additionalMetrics;
        }

        processedData.push(engagementRecord);
      } catch (error) {
        console.warn('Error processing engagement data row:', error);
        continue; // Skip problematic rows
      }
    }

    return processedData;
  }

  /**
   * Get engagement data with optional filters
   */
  async getEngagementData(filters?: EngagementFilters): Promise<EngagementData[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.employeeId) {
        params.append('employeeId', filters.employeeId);
      }
      
      if (filters?.dateRange) {
        params.append('startDate', filters.dateRange.start.toISOString());
        params.append('endDate', filters.dateRange.end.toISOString());
      }
      
      if (filters?.satisfactionRange) {
        params.append('minSatisfaction', filters.satisfactionRange.min.toString());
        params.append('maxSatisfaction', filters.satisfactionRange.max.toString());
      }
      
      if (filters?.department) {
        params.append('department', filters.department);
      }

      const response = await api.get(`/api/data/engagement?${params.toString()}`);
      return response.data.map((item: any) => ({
        ...item,
        surveyDate: new Date(item.surveyDate)
      }));
    } catch (error) {
      console.error('Error fetching engagement data:', error);
      throw new Error('Failed to fetch engagement data');
    }
  }

  /**
   * Get engagement data summary statistics
   */
  async getEngagementSummary(): Promise<EngagementSummary> {
    try {
      const response = await api.get('/api/data/engagement/summary');
      return {
        ...response.data,
        latestSurveyDate: new Date(response.data.latestSurveyDate),
        oldestSurveyDate: new Date(response.data.oldestSurveyDate)
      };
    } catch (error) {
      console.error('Error fetching engagement summary:', error);
      throw new Error('Failed to fetch engagement summary');
    }
  }

  /**
   * Prepare engagement data for analysis
   */
  prepareForAnalysis(data: EngagementData[]): AnalysisReadyData[] {
    return data.map(record => {
      const metrics: Record<string, number> = {
        overall_satisfaction: record.overallSatisfaction
      };

      if (record.workLifeBalance !== undefined) {
        metrics.work_life_balance = record.workLifeBalance;
      }
      if (record.careerDevelopment !== undefined) {
        metrics.career_development = record.careerDevelopment;
      }
      if (record.managementRating !== undefined) {
        metrics.management_rating = record.managementRating;
      }
      if (record.teamCollaboration !== undefined) {
        metrics.team_collaboration = record.teamCollaboration;
      }
      if (record.compensationSatisfaction !== undefined) {
        metrics.compensation_satisfaction = record.compensationSatisfaction;
      }

      // Include additional metrics if available
      if (record.additionalMetrics) {
        for (const [key, value] of Object.entries(record.additionalMetrics)) {
          if (typeof value === 'number') {
            metrics[key] = value;
          }
        }
      }

      // Calculate overall score as average of available metrics
      const metricValues = Object.values(metrics);
      const overallScore = metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;

      return {
        employeeId: record.employeeId,
        metrics,
        surveyDate: record.surveyDate,
        overallScore
      };
    });
  }

  // Helper methods
  private findColumnMatch(targetColumn: string, availableColumns: string[]): string | null {
    const possibleMatches = COLUMN_MAPPINGS[targetColumn] || [targetColumn];
    
    for (const match of possibleMatches) {
      const found = availableColumns.find(col => 
        col.toLowerCase().trim() === match.toLowerCase().trim()
      );
      if (found) return found;
    }
    
    return null;
  }

  private extractValue(row: any, targetColumn: string, availableColumns: string[]): any {
    const matchedColumn = this.findColumnMatch(targetColumn, availableColumns);
    return matchedColumn ? row[matchedColumn] : null;
  }

  private extractNumericValue(row: any, targetColumn: string, availableColumns: string[]): number | null {
    const value = this.extractValue(row, targetColumn, availableColumns);
    if (value === null || value === undefined || value === '') return null;
    
    const numValue = Number(value);
    return isNaN(numValue) ? null : numValue;
  }

  private isStandardColumn(columnName: string): boolean {
    const allStandardColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
    return allStandardColumns.some(stdCol => 
      this.findColumnMatch(stdCol, [columnName]) !== null
    );
  }
}

// Export singleton instance
export const engagementDataService = new EngagementDataService();
export default engagementDataService;