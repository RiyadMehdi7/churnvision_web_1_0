import api from '@/services/api';
import {
  ChurnReasoning,
  BusinessRule,
  BehavioralStage,
  CreateRuleRequest,
  UpdateRuleRequest,
  CreateStageRequest,
  TestRuleRequest,
  LLMQuestionRequest,
  RuleTestResult,
  StageTestResult,
  ReasoningSummary
} from '../types/reasoning';

class ReasoningService {

  // === EMPLOYEE REASONING ===

  /**
   * Get or compute reasoning for a specific employee
   */
  async getEmployeeReasoning(hrCode: string): Promise<ChurnReasoning | null> {
    try {
      // Use the intelligent-chat/analyze-risk endpoint
      const response = await api.post('/intelligent-chat/analyze-risk', null, {
        params: { hr_code: hrCode }
      });

      if (response.data && response.data.context && response.data.context.reasoning) {
        return response.data.context.reasoning as ChurnReasoning;
      }

      // If no reasoning data exists yet (model not trained or no predictions), return null
      // This is a valid state - reasoning data is generated after model training
      if (response.data && response.data.context && !response.data.context.reasoning) {
        return null;
      }

      // Fallback if we have analysis text but no structured reasoning
      if (response.data && response.data.analysis) {
        // Return null instead of throwing - reasoning will be available after training
        return null;
      }

      return null;
    } catch (error: any) {
      // Log but don't throw - this allows the UI to gracefully handle missing reasoning
      console.warn('Reasoning data not available for employee:', hrCode, error.message);
      return null;
    }
  }

  /**
   * Force refresh reasoning for a specific employee
   */
  async refreshEmployeeReasoning(hrCode: string): Promise<ChurnReasoning | null> {
    // The analyze-risk endpoint performs a fresh analysis
    return this.getEmployeeReasoning(hrCode);
  }

  /**
   * Get reasoning for multiple employees
   */
  async getBatchReasoning(hrCodes: string[]): Promise<ChurnReasoning[]> {
    // Backend doesn't have a batch endpoint yet, so we'll process sequentially or in parallel
    // This might be slow for large batches, but acceptable for now
    try {
      const promises = hrCodes.map(code => this.getEmployeeReasoning(code).catch(() => null));
      const results = await Promise.all(promises);
      return results.filter(Boolean) as ChurnReasoning[];
    } catch (error: any) {
      console.error('Error getting batch reasoning:', error);
      return [];
    }
  }

  /**
   * Get reasoning summary statistics
   */
  async getReasoningSummary(limit: number = 100): Promise<ReasoningSummary> {
    try {
      // Map to exit-patterns endpoint which provides some summary
      const response = await api.get('/intelligent-chat/exit-patterns');

      if (response.data && response.data.data) {
        const data = response.data.data;
        // Transform backend data to ReasoningSummary format
        // This is a best-effort mapping
        return {
          total_employees: data.total_resignations || 0,
          high_risk_count: 0, // Not available in exit-patterns
          medium_risk_count: 0, // Not available
          low_risk_count: 0, // Not available
          avg_confidence: 0, // Not available
          top_risk_factors: [], // Not available
          stage_distribution: data.stages || {},
          recent_updates: 0
        };
      }

      return {
        total_employees: 0,
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0,
        avg_confidence: 0,
        top_risk_factors: [],
        stage_distribution: {},
        recent_updates: 0
      };
    } catch (error) {
      console.error('Error getting reasoning summary:', error);
      // Return empty summary instead of throwing to avoid breaking UI
      return {
        total_employees: 0,
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0,
        avg_confidence: 0,
        top_risk_factors: [],
        stage_distribution: {},
        recent_updates: 0
      };
    }
  }

  // === CACHE MANAGEMENT ===

  /**
   * Invalidate cache for specific employee
   */
  async invalidateEmployeeCache(hrCode: string): Promise<void> {
    // Client-side cache invalidation if needed, or no-op if server handles it
    console.log('invalidateEmployeeCache called (no-op for API)');
  }

  /**
   * Invalidate all reasoning cache
   */
  async invalidateAllCache(): Promise<void> {
    console.log('invalidateAllCache called (no-op for API)');
  }

  // === BUSINESS RULES MANAGEMENT ===

  /**
   * Get all business rules
   */
  async getAllRules(): Promise<BusinessRule[]> {
    // Stub: Backend doesn't support custom rules yet
    return [];
  }

  /**
   * Add a new custom business rule
   */
  async createRule(rule: CreateRuleRequest): Promise<{ ruleId: number }> {
    // Stub
    console.warn('createRule not implemented in backend');
    return { ruleId: Math.floor(Math.random() * 1000) };
  }

  /**
   * Update an existing business rule
   */
  async updateRule(ruleId: number, updates: UpdateRuleRequest): Promise<void> {
    // Stub
    console.warn('updateRule not implemented in backend');
  }

  /**
   * Delete a custom business rule
   */
  async deleteRule(ruleId: number): Promise<void> {
    // Stub
    console.warn('deleteRule not implemented in backend');
  }

  /**
   * Test a business rule with sample data
   */
  async testRule(testData: TestRuleRequest): Promise<RuleTestResult> {
    // Stub
    return {
      condition_result: false,
      original_score: 0,
      adjusted_score: 0,
      impact: 0
    };
  }

  // === BEHAVIORAL STAGES MANAGEMENT ===

  /**
   * Get all behavioral stages
   */
  async getAllStages(): Promise<BehavioralStage[]> {
    // Stub
    return [];
  }

  /**
   * Create a new behavioral stage
   */
  async createStage(stage: CreateStageRequest): Promise<{ stageId: number }> {
    // Stub
    return { stageId: Math.floor(Math.random() * 1000) };
  }

  /**
   * Test stage inference for specific employee
   */
  async testStageInference(hrCode: string): Promise<StageTestResult> {
    // Stub
    return {
      matched_stage: 'Unknown',
      tenure_match: null,
      special_conditions: [],
      final_score: 0,
      reasoning: []
    };
  }

  // === LLM INTEGRATION ===

  /**
   * Get LLM status and availability
   */
  async getLLMStatus(): Promise<{ isAvailable: boolean; isReady: boolean; modelPath: string | null; error: string | null }> {
    // Assume always available for web API
    return {
      isAvailable: true,
      isReady: true,
      modelPath: 'remote-model',
      error: null
    };
  }

  /**
   * Ask a question to the LLM
   */
  async askLLMQuestion(questionData: LLMQuestionRequest): Promise<string> {
    try {
      const response = await api.post('/intelligent-chat/chat', {
        message: questionData.question, // Changed from prompt to question
        session_id: 'reasoning-session', // Use a dedicated session for reasoning queries
        // context: questionData.context // If backend supports context in body
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      throw new Error('No response from LLM');
    } catch (error: any) {
      console.error('Error asking LLM question:', error);
      throw new Error(error.message || 'Failed to ask LLM question');
    }
  }
}

const reasoningService = new ReasoningService();
export default reasoningService; 