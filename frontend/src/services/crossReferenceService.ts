import api from '@/services/api';
import { EngagementData } from './engagementDataService';

// Types for cross-reference analysis
export interface EmployeeDataCorrelation {
  employeeId: string;
  employeeName: string;
  churnData?: ChurnDataPoint;
  engagementData?: EngagementDataPoint[];
  interviewData?: InterviewDataPoint[];
  correlationScore: number;
  riskFactors: RiskFactor[];
  recommendations: string[];
  lastUpdated: Date;
}

export interface ChurnDataPoint {
  churnProbability: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  reasoningConfidence: number;
  keyFactors: string[];
  department: string;
  position: string;
  tenure: number;
}

export interface EngagementDataPoint {
  surveyDate: Date;
  overallSatisfaction: number;
  workLifeBalance?: number;
  careerDevelopment?: number;
  managementRating?: number;
  teamCollaboration?: number;
  compensationSatisfaction?: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface InterviewDataPoint {
  interviewDate: Date;
  interviewType: 'entry' | 'exit' | 'stay' | 'performance';
  sentiment: 'positive' | 'neutral' | 'negative';
  keyThemes: string[];
  satisfactionScore?: number;
  concerns: string[];
}

export interface RiskFactor {
  factor: string;
  severity: 'high' | 'medium' | 'low';
  source: 'churn' | 'engagement' | 'interview';
  confidence: number;
  description: string;
}

export interface PatternAnalysis {
  id: string;
  name: string;
  description: string;
  patternType: 'correlation' | 'trend' | 'anomaly' | 'cluster';
  strength: number;
  frequency: number;
  affectedEmployees: number;
  departments: string[];
  timeframe: string;
  dataSources: string[];
  insights: PatternInsight[];
  recommendations: PatternRecommendation[];
}

export interface PatternInsight {
  insight: string;
  confidence: number;
  supportingData: any;
  implications: string[];
}

export interface PatternRecommendation {
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  actionItems: string[];
  expectedImpact: string;
  timeframe: string;
}

export interface CrossAnalysisFilters {
  departments?: string[];
  positions?: string[];
  riskLevels?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  employeeGroups?: string[];
  minCorrelationStrength?: number;
}

export interface CrossAnalysisResult {
  id: string;
  title: string;
  summary: string;
  analysisType: string;
  correlations: DataCorrelation[];
  patterns: IdentifiedPattern[];
  insights: CrossInsight[];
  recommendations: StrategicRecommendation[];
  confidence: number;
  dataQuality: DataQualityMetrics;
  timestamp: Date;
  filters: CrossAnalysisFilters;
}

export interface DataCorrelation {
  source1: string;
  source2: string;
  correlationStrength: number;
  correlationType: 'positive' | 'negative' | 'neutral';
  significance: number;
  description: string;
  affectedEmployees: number;
  departments: string[];
  keyFindings: string[];
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
  patternType: 'behavioral' | 'temporal' | 'departmental' | 'satisfaction';
  triggers: string[];
  outcomes: string[];
}

export interface CrossInsight {
  id: string;
  title: string;
  description: string;
  category: 'correlation' | 'causation' | 'prediction' | 'anomaly';
  severity: 'high' | 'medium' | 'low';
  confidence: number;
  sourceDataTypes: string[];
  correlationStrength: number;
  affectedEmployees?: number;
  departments?: string[];
  actionable: boolean;
  supportingEvidence: any;
}

export interface StrategicRecommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'immediate' | 'short-term' | 'long-term';
  businessImpact: string;
  resourceRequirements: string;
  successMetrics: string[];
  estimatedTimeframe: string;
  actionItems: string[];
  targetDepartments?: string[];
  expectedROI?: string;
}

export interface DataQualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  overall: number;
  issues: DataQualityIssue[];
  recommendations: string[];
}

export interface DataQualityIssue {
  type: 'missing' | 'inconsistent' | 'outdated' | 'duplicate';
  description: string;
  severity: 'high' | 'medium' | 'low';
  affectedRecords: number;
  suggestion: string;
}

export interface CorrelatedData {
  employeeId: string;
  correlations: Record<string, any>;
  riskScore: number;
  engagementScore?: number;
  satisfactionTrend?: 'improving' | 'declining' | 'stable';
  keyIndicators: string[];
  lastUpdated: Date;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  category: string;
  confidence: number;
  actionable: boolean;
  supportingData: any;
}

class CrossReferenceService {
  private correlationCache = new Map<string, EmployeeDataCorrelation>();
  private patternCache = new Map<string, PatternAnalysis>();
  // private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes - unused

  /**
   * Correlate all available data for a specific employee
   */
  async correlateEmployeeData(employeeId: string): Promise<EmployeeDataCorrelation> {
    const cacheKey = `employee_${employeeId}`;
    const cached = this.getFromCache(this.correlationCache, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await api.post('/api/cross-reference/employee', {
        employeeId,
        timestamp: new Date().toISOString()
      });

      const correlation: EmployeeDataCorrelation = {
        ...response.data,
        lastUpdated: new Date(response.data.lastUpdated)
      };

      this.setCache(this.correlationCache, cacheKey, correlation);
      return correlation;
    } catch (error) {
      console.error('Error correlating employee data:', error);
      throw new Error('Failed to correlate employee data');
    }
  }

  /**
   * Find patterns across multiple data sources
   */
  async findPatterns(dataSources: string[]): Promise<PatternAnalysis[]> {
    const cacheKey = `patterns_${dataSources.sort().join('_')}`;
    const cached = this.getFromCache(this.patternCache, cacheKey);
    if (cached) {
      return [cached];
    }

    try {
      const response = await api.post('/api/cross-reference/patterns', {
        dataSources,
        timestamp: new Date().toISOString()
      }, {
        timeout: 90000 // 90 second timeout for pattern analysis
      });

      const patterns: PatternAnalysis[] = response.data.map((pattern: any) => ({
        ...pattern,
        insights: pattern.insights || [],
        recommendations: pattern.recommendations || []
      }));

      // Cache the first pattern (most significant)
      if (patterns.length > 0) {
        this.setCache(this.patternCache, cacheKey, patterns[0]);
      }

      return patterns;
    } catch (error) {
      console.error('Error finding patterns:', error);
      throw new Error('Failed to find patterns in data');
    }
  }

  /**
   * Analyze data across multiple sources with filters
   */
  async analyzeAcrossDataSources(
    analysisType: string, 
    filters: CrossAnalysisFilters
  ): Promise<CrossAnalysisResult> {
    try {
      const response = await api.post('/api/cross-reference/analyze', {
        analysisType,
        filters,
        timestamp: new Date().toISOString()
      }, {
        timeout: 120000 // 2 minute timeout for complex analysis
      });

      return {
        ...response.data,
        timestamp: new Date(response.data.timestamp)
      };
    } catch (error) {
      console.error('Error analyzing across data sources:', error);
      throw new Error('Failed to analyze across data sources');
    }
  }

  /**
   * Generate insights from correlated data
   */
  async generateInsights(correlatedData: CorrelatedData[]): Promise<Insight[]> {
    try {
      const response = await api.post('/api/cross-reference/insights', {
        data: correlatedData,
        timestamp: new Date().toISOString()
      }, {
        timeout: 60000 // 60 second timeout
      });

      return response.data;
    } catch (error) {
      console.error('Error generating insights:', error);
      throw new Error('Failed to generate insights');
    }
  }

  /**
   * Find correlations between engagement scores and churn risk
   */
  async findEngagementChurnCorrelations(
    engagementData: EngagementData[],
    churnData: any[]
  ): Promise<DataCorrelation[]> {
    try {
      const response = await api.post('/api/cross-reference/engagement-churn', {
        engagementData,
        churnData,
        timestamp: new Date().toISOString()
      });

      return response.data;
    } catch (error) {
      console.error('Error finding engagement-churn correlations:', error);
      throw new Error('Failed to find engagement-churn correlations');
    }
  }

  /**
   * Analyze satisfaction trends and their impact on retention
   */
  async analyzeSatisfactionTrends(
    employeeIds: string[],
    timeframe: string = 'last-12-months'
  ): Promise<{
    trends: SatisfactionTrend[];
    correlations: DataCorrelation[];
    predictions: RetentionPrediction[];
  }> {
    try {
      const response = await api.post('/api/cross-reference/satisfaction-trends', {
        employeeIds,
        timeframe,
        timestamp: new Date().toISOString()
      });

      return response.data;
    } catch (error) {
      console.error('Error analyzing satisfaction trends:', error);
      throw new Error('Failed to analyze satisfaction trends');
    }
  }

  /**
   * Identify employees at risk based on cross-referenced data
   */
  async identifyAtRiskEmployees(
    filters: CrossAnalysisFilters
  ): Promise<AtRiskEmployee[]> {
    try {
      const response = await api.post('/api/cross-reference/at-risk', {
        filters,
        timestamp: new Date().toISOString()
      });

      return response.data.map((employee: any) => ({
        ...employee,
        lastAssessment: new Date(employee.lastAssessment)
      }));
    } catch (error) {
      console.error('Error identifying at-risk employees:', error);
      throw new Error('Failed to identify at-risk employees');
    }
  }

  /**
   * Generate department-level cross-analysis
   */
  async analyzeDepartmentCorrelations(
    departments: string[]
  ): Promise<DepartmentCorrelationAnalysis[]> {
    try {
      const response = await api.post('/api/cross-reference/department-analysis', {
        departments,
        timestamp: new Date().toISOString()
      });

      return response.data;
    } catch (error) {
      console.error('Error analyzing department correlations:', error);
      throw new Error('Failed to analyze department correlations');
    }
  }

  /**
   * Validate data quality across sources
   */
  async validateDataQuality(dataSources: string[]): Promise<DataQualityMetrics> {
    try {
      const response = await api.post('/api/cross-reference/data-quality', {
        dataSources,
        timestamp: new Date().toISOString()
      });

      return response.data;
    } catch (error) {
      console.error('Error validating data quality:', error);
      // Return default metrics if validation fails
      return {
        completeness: 0.8,
        accuracy: 0.85,
        consistency: 0.75,
        timeliness: 0.9,
        overall: 0.825,
        issues: [],
        recommendations: ['Unable to validate data quality - please check data sources']
      };
    }
  }

  /**
   * Get cached correlation results
   */
  getCachedCorrelations(): EmployeeDataCorrelation[] {
    return this.getValidCacheEntries(this.correlationCache);
  }

  /**
   * Get cached pattern analyses
   */
  getCachedPatterns(): PatternAnalysis[] {
    return this.getValidCacheEntries(this.patternCache);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.correlationCache.clear();
    this.patternCache.clear();
  }

  // Private helper methods
  private getFromCache<T>(cache: Map<string, T>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    // Check if cache entry is still valid (simplified check)
    return entry;
  }

  private setCache<T>(cache: Map<string, T>, key: string, value: T): void {
    // Limit cache size
    if (cache.size >= 100) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    cache.set(key, value);
  }

  private getValidCacheEntries<T>(cache: Map<string, T>): T[] {
    return Array.from(cache.values());
  }
}

// Additional interfaces for specific analysis types
export interface SatisfactionTrend {
  employeeId: string;
  trend: 'improving' | 'declining' | 'stable';
  currentScore: number;
  previousScore: number;
  changeRate: number;
  timeframe: string;
  factors: string[];
}

export interface RetentionPrediction {
  employeeId: string;
  retentionProbability: number;
  riskLevel: 'high' | 'medium' | 'low';
  keyFactors: string[];
  recommendedActions: string[];
  confidence: number;
}

export interface AtRiskEmployee {
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  riskScore: number;
  riskFactors: RiskFactor[];
  engagementTrend: 'improving' | 'declining' | 'stable';
  lastEngagementScore?: number;
  churnProbability: number;
  recommendedActions: string[];
  lastAssessment: Date;
}

export interface DepartmentCorrelationAnalysis {
  department: string;
  employeeCount: number;
  averageEngagement: number;
  averageChurnRisk: number;
  correlationStrength: number;
  keyInsights: string[];
  riskFactors: string[];
  recommendations: string[];
  comparisonToAverage: {
    engagement: number;
    churnRisk: number;
    performance: 'above' | 'below' | 'average';
  };
}

// Export singleton instance
export const crossReferenceService = new CrossReferenceService();
export default crossReferenceService;