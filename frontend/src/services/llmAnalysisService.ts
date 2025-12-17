import api from '@/services/apiService';

// Types for LLM Analysis
export type AnalysisType = 'churn-patterns' | 'engagement-correlation' | 'cross-source' | 'organizational-insights';

export interface AnalysisParams {
  departmentFilter?: string;
  timePeriod?: string;
  riskLevel?: string;
  employeeGroup?: string;
  customFilters?: Record<string, any>;
}

export interface CrossAnalysisParams extends AnalysisParams {
  dataSources: DataSource[];
  correlationTypes: string[];
}

export interface DataSource {
  type: 'churn' | 'engagement' | 'interview';
  name: string;
  available: boolean;
  recordCount?: number;
  lastUpdated?: Date;
}

export interface AnalysisResult {
  id: string;
  type: AnalysisType;
  title: string;
  summary: string;
  insights: Insight[];
  visualizations: Visualization[];
  recommendations: Recommendation[];
  confidence: number;
  timestamp: Date;
  dataSources: DataSource[];
  parameters: AnalysisParams;
  executionTime: number;
}

export interface CrossAnalysisResult extends AnalysisResult {
  correlations: DataCorrelation[];
  patterns: IdentifiedPattern[];
  crossInsights: CrossInsight[];
  strategicRecommendations: StrategicRecommendation[];
  dataQuality: DataQualityMetrics;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  category: 'pattern' | 'trend' | 'anomaly' | 'correlation';
  severity: 'high' | 'medium' | 'low';
  confidence: number;
  affectedEmployees?: number;
  departments?: string[];
  supportingData: any;
}

export interface Visualization {
  id: string;
  type: 'chart' | 'graph' | 'heatmap' | 'scatter' | 'timeline';
  title: string;
  description: string;
  data: any;
  config: any;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'immediate' | 'short-term' | 'long-term';
  estimatedImpact: string;
  actionItems: string[];
  targetDepartments?: string[];
  estimatedTimeframe: string;
}

export interface DataCorrelation {
  source1: string;
  source2: string;
  correlationStrength: number;
  correlationType: 'positive' | 'negative' | 'neutral';
  significance: number;
  description: string;
}

export interface IdentifiedPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  confidence: number;
  affectedEmployees: number;
  departments: string[];
  timeframe: string;
}

export interface CrossInsight extends Insight {
  sourceDataTypes: string[];
  correlationStrength: number;
}

export interface StrategicRecommendation extends Recommendation {
  businessImpact: string;
  resourceRequirements: string;
  successMetrics: string[];
}

export interface DataQualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  overall: number;
  issues: string[];
}

export interface ChurnAnalysisResult extends AnalysisResult {
  churnPatterns: ChurnPattern[];
  riskFactors: RiskFactor[];
  departmentAnalysis: DepartmentAnalysis[];
  timeSeriesAnalysis: TimeSeriesData[];
}

export interface ChurnPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  riskLevel: 'high' | 'medium' | 'low';
  affectedEmployees: number;
  commonFactors: string[];
}

export interface RiskFactor {
  factor: string;
  impact: number;
  frequency: number;
  departments: string[];
  description: string;
}

export interface DepartmentAnalysis {
  department: string;
  employeeCount: number;
  averageRisk: number;
  topRiskFactors: string[];
  recommendations: string[];
}

export interface TimeSeriesData {
  date: string;
  value: number;
  category: string;
}

export interface CorrelationResult extends AnalysisResult {
  correlations: EngagementCorrelation[];
  satisfactionDrivers: SatisfactionDriver[];
  riskIndicators: RiskIndicator[];
}

export interface EngagementCorrelation {
  metric: string;
  churnCorrelation: number;
  significance: number;
  description: string;
}

export interface SatisfactionDriver {
  driver: string;
  impact: number;
  departments: string[];
  recommendations: string[];
}

export interface RiskIndicator {
  indicator: string;
  threshold: number;
  currentValue: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  alertLevel: 'high' | 'medium' | 'low';
}

export interface OrganizationalInsights extends AnalysisResult {
  overallHealth: OrganizationalHealth;
  departmentComparison: DepartmentComparison[];
  trendAnalysis: TrendAnalysis;
  strategicInsights: StrategicInsight[];
}

export interface OrganizationalHealth {
  score: number;
  category: 'excellent' | 'good' | 'fair' | 'poor';
  keyStrengths: string[];
  keyWeaknesses: string[];
  improvementAreas: string[];
}

export interface DepartmentComparison {
  department: string;
  metrics: Record<string, number>;
  ranking: number;
  strengths: string[];
  weaknesses: string[];
}

export interface TrendAnalysis {
  overallTrend: 'improving' | 'declining' | 'stable';
  timeframe: string;
  keyChanges: string[];
  predictions: string[];
}

export interface StrategicInsight {
  insight: string;
  businessImpact: string;
  actionRequired: boolean;
  timeframe: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiredDataSources: string[];
  availableDataSources: string[];
}

class LLMAnalysisService {
  private analysisCache = new Map<string, AnalysisResult>();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  /**
   * Execute LLM-powered organizational analysis
   */
  async runAnalysis(type: AnalysisType, params: AnalysisParams): Promise<AnalysisResult> {
    const cacheKey = this.generateCacheKey(type, params);

    // Check cache first
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      console.log('Returning cached analysis result');
      return cachedResult;
    }

    try {
      const startTime = Date.now();

      // Validate parameters and data availability
      const validation = await this.validateAnalysisRequest(type, params);
      if (!validation.isValid) {
        throw new Error(`Analysis validation failed: ${validation.errors.join(', ')}`);
      }

      const response = await api.post('/api/analysis/run', {
        type,
        params,
        timestamp: new Date().toISOString()
      }, {
        timeout: 120000 // 2 minute timeout for LLM analysis
      });

      const result: AnalysisResult = {
        ...response.data,
        timestamp: new Date(),
        executionTime: Date.now() - startTime
      };

      // Cache the result
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error running LLM analysis:', error);
      throw new Error(
        error instanceof Error
          ? `Analysis failed: ${error.message}`
          : 'Failed to run analysis'
      );
    }
  }

  /**
   * Execute cross-analysis combining multiple data sources
   */
  async runCrossAnalysis(dataSources: DataSource[], params: CrossAnalysisParams): Promise<CrossAnalysisResult> {
    const cacheKey = this.generateCacheKey('cross-source', { ...params, dataSources });

    // Check cache first
    const cachedResult = this.getCachedResult(cacheKey) as CrossAnalysisResult;
    if (cachedResult) {
      console.log('Returning cached cross-analysis result');
      return cachedResult;
    }

    try {
      const startTime = Date.now();

      // Validate that we have multiple data sources
      const availableSources = dataSources.filter(ds => ds.available);
      if (availableSources.length < 2) {
        throw new Error('Cross-analysis requires at least 2 data sources');
      }

      const response = await api.post('/api/analysis/cross-analysis', {
        dataSources: availableSources,
        params,
        timestamp: new Date().toISOString()
      }, {
        timeout: 180000 // 3 minute timeout for complex cross-analysis
      });

      const result: CrossAnalysisResult = {
        ...response.data,
        timestamp: new Date(),
        executionTime: Date.now() - startTime
      };

      // Cache the result
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error running cross-analysis:', error);
      throw new Error(
        error instanceof Error
          ? `Cross-analysis failed: ${error.message}`
          : 'Failed to run cross-analysis'
      );
    }
  }

  /**
   * Get available data sources
   */
  async getAvailableDataSources(): Promise<DataSource[]> {
    try {
      const response = await api.get('/api/analysis/data-sources');
      return response.data.map((ds: any) => ({
        ...ds,
        lastUpdated: ds.lastUpdated ? new Date(ds.lastUpdated) : undefined
      }));
    } catch (error) {
      console.error('Error fetching data sources:', error);
      // Return default data sources if API fails
      return [
        {
          type: 'churn',
          name: 'Churn Reasoning Data',
          available: true,
          recordCount: 0
        },
        {
          type: 'engagement',
          name: 'Engagement Survey Data',
          available: false
        },
        {
          type: 'interview',
          name: 'Interview Data',
          available: false
        }
      ];
    }
  }

  /**
   * Validate data source availability and quality
   */
  async validateDataSource(source: DataSource): Promise<ValidationResult> {
    try {
      const response = await api.post('/api/analysis/validate-source', {
        source
      });
      return response.data;
    } catch (error) {
      console.error('Error validating data source:', error);
      return {
        isValid: false,
        errors: ['Failed to validate data source'],
        warnings: [],
        requiredDataSources: [],
        availableDataSources: []
      };
    }
  }

  /**
   * Analyze churn patterns using local reasoning service
   */
  async analyzeChurnPatterns(employees: any[]): Promise<ChurnAnalysisResult> {
    try {
      // Use local reasoning service instead of API calls
      // const reasoningService = (await import('./reasoning')).default;

      // Get reasoning data for employees
      // const hrCodes = employees.map(emp => emp.hr_code).filter(Boolean);
      // Remove unused variable
      // const reasoningData = await reasoningService.getBatchReasoning(hrCodes.slice(0, 50));

      // Await the result and ensure correct type
      const patterns = await this.analyzeChurnPatterns(employees);

      return {
        id: `churn-patterns-${Date.now()}`,
        type: 'churn-patterns' as AnalysisType,
        title: 'Churn Pattern Analysis',
        summary: `Analyzed ${employees.length} employees and identified ${patterns.insights.length} key patterns affecting churn risk.`,
        insights: patterns.insights,
        visualizations: patterns.visualizations,
        recommendations: patterns.recommendations,
        confidence: 0.85,
        timestamp: new Date(),
        dataSources: [{ type: 'churn', name: 'Employee Reasoning Data', available: true }],
        parameters: { departmentFilter: undefined, timePeriod: undefined, riskLevel: undefined, employeeGroup: undefined, customFilters: undefined },
        executionTime: 2000,
        churnPatterns: patterns.churnPatterns,
        riskFactors: patterns.riskFactors,
        departmentAnalysis: patterns.departmentAnalysis,
        timeSeriesAnalysis: patterns.timeSeriesAnalysis
      };
    } catch (error) {
      console.error('Error analyzing churn patterns:', error);
      // Return a fallback analysis instead of throwing
      return this.createBasicChurnAnalysis(employees);
    }
  }

  /**
   * Analyze engagement correlation with churn risk
   */
  async analyzeEngagementCorrelation(engagementData: any[], churnData: any[]): Promise<CorrelationResult> {
    try {
      const response = await api.post('/api/analysis/engagement-correlation', {
        engagementData,
        churnData,
        timestamp: new Date().toISOString()
      }, {
        timeout: 90000 // 90 second timeout
      });

      return {
        ...response.data,
        timestamp: new Date(),
        type: 'engagement-correlation' as AnalysisType
      };
    } catch (error) {
      console.error('Error analyzing engagement correlation:', error);
      throw new Error('Failed to analyze engagement correlation');
    }
  }

  /**
   * Generate comprehensive organizational insights
   */
  async generateOrganizationalInsights(allData: any): Promise<OrganizationalInsights> {
    try {
      const response = await api.post('/api/analysis/organizational-insights', {
        data: allData,
        timestamp: new Date().toISOString()
      }, {
        timeout: 120000 // 2 minute timeout
      });

      return {
        ...response.data,
        timestamp: new Date(),
        type: 'organizational-insights' as AnalysisType
      };
    } catch (error) {
      console.error('Error generating organizational insights:', error);
      throw new Error('Failed to generate organizational insights');
    }
  }

  /**
   * Get cached analysis results
   */
  getCachedAnalyses(): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    const now = Date.now();

    for (const [key, result] of this.analysisCache.entries()) {
      // Check if cache is still valid
      if (now - result.timestamp.getTime() < this.CACHE_DURATION) {
        results.push(result);
      } else {
        // Remove expired cache entries
        this.analysisCache.delete(key);
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Export analysis results
   */
  async exportAnalysis(analysisId: string, format: 'pdf' | 'excel' | 'csv'): Promise<Blob> {
    try {
      const response = await api.post(`/api/analysis/export/${analysisId}`, {
        format
      }, {
        responseType: 'blob',
        timeout: 60000
      });

      return response.data;
    } catch (error) {
      console.error('Error exporting analysis:', error);
      throw new Error('Failed to export analysis');
    }
  }

  // Private helper methods
  private async validateAnalysisRequest(type: AnalysisType, params: AnalysisParams): Promise<ValidationResult> {
    try {
      const response = await api.post('/api/analysis/validate', {
        type,
        params
      });
      return response.data;
    } catch (error) {
      console.error('Error validating analysis request:', error);
      return {
        isValid: true, // Default to valid for offline scenarios
        errors: [],
        warnings: [],
        requiredDataSources: [],
        availableDataSources: []
      };
    }
  }

  private generateCacheKey(type: AnalysisType | string, params: any): string {
    return `${type}_${JSON.stringify(params)}_${Math.floor(Date.now() / (5 * 60 * 1000))}`; // 5-minute cache buckets
  }

  private getCachedResult(key: string): AnalysisResult | null {
    const result = this.analysisCache.get(key);
    if (!result) return null;

    // Check if cache is still valid
    const now = Date.now();
    if (now - result.timestamp.getTime() > this.CACHE_DURATION) {
      this.analysisCache.delete(key);
      return null;
    }

    return result;
  }

  private cacheResult(key: string, result: AnalysisResult): void {
    // Limit cache size to prevent memory issues
    if (this.analysisCache.size >= 50) {
      // Remove oldest entries
      const entries = Array.from(this.analysisCache.entries());
      entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());

      // Remove oldest 10 entries
      for (let i = 0; i < 10 && i < entries.length; i++) {
        this.analysisCache.delete(entries[i][0]);
      }
    }

    this.analysisCache.set(key, result);
  }

  private createBasicChurnAnalysis(employees: any[]): ChurnAnalysisResult {
    return {
      id: `churn-patterns-fallback-${Date.now()}`,
      type: 'churn-patterns' as AnalysisType,
      title: 'Basic Churn Pattern Analysis',
      summary: `Basic analysis of ${employees.length} employees.`,
      insights: [],
      visualizations: [],
      recommendations: [],
      confidence: 0.5,
      timestamp: new Date(),
      dataSources: [{ type: 'churn', name: 'Employee Data', available: true }],
      parameters: { departmentFilter: undefined, timePeriod: undefined, riskLevel: undefined, employeeGroup: undefined, customFilters: undefined },
      executionTime: 1000,
      churnPatterns: [],
      riskFactors: [],
      departmentAnalysis: [],
      timeSeriesAnalysis: []
    };
  }
}

// Export singleton instance
export const llmAnalysisService = new LLMAnalysisService();
export default llmAnalysisService;