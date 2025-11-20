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
  async getEmployeeReasoning(hrCode: string): Promise<ChurnReasoning> {
    try {
      if (!window.electronApi?.reasoning?.getEmployeeReasoning) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getEmployeeReasoning(hrCode);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get employee reasoning');
    } catch (error: any) {
      console.error('Error getting employee reasoning:', error);
      throw new Error(error.message || 'Failed to get employee reasoning');
    }
  }

  /**
   * Force refresh reasoning for a specific employee
   */
  async refreshEmployeeReasoning(hrCode: string): Promise<ChurnReasoning> {
    try {
      if (!window.electronApi?.reasoning?.refreshEmployeeReasoning) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.refreshEmployeeReasoning(hrCode);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to refresh employee reasoning');
    } catch (error: any) {
      console.error('Error refreshing employee reasoning:', error);
      throw new Error(error.message || 'Failed to refresh employee reasoning');
    }
  }

  /**
   * Get reasoning for multiple employees
   */
  async getBatchReasoning(hrCodes: string[]): Promise<ChurnReasoning[]> {
    try {
      if (!window.electronApi?.reasoning?.getBatchReasoning) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getBatchReasoning(hrCodes);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get batch reasoning');
    } catch (error: any) {
      console.error('Error getting batch reasoning:', error);
      throw new Error(error.message || 'Failed to get batch reasoning');
    }
  }

  /**
   * Get reasoning summary statistics
   */
  async getReasoningSummary(limit: number = 100): Promise<ReasoningSummary> {
    try {
      if (!window.electronApi?.reasoning?.getReasoningSummary) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getReasoningSummary(limit);
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to get reasoning summary');
      }
    } catch (error) {
      console.error('Error getting reasoning summary:', error);
      throw error;
    }
  }

  // === CACHE MANAGEMENT ===

  /**
   * Invalidate cache for specific employee
   */
  async invalidateEmployeeCache(hrCode: string): Promise<void> {
    try {
      if (!window.electronApi?.reasoning?.invalidateEmployeeCache) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.invalidateEmployeeCache(hrCode);
      if (!response.success) {
        throw new Error(response.error || 'Failed to invalidate cache');
      }
    } catch (error: any) {
      console.error('Error invalidating employee cache:', error);
      throw new Error(error.message || 'Failed to invalidate cache');
    }
  }

  /**
   * Invalidate all reasoning cache
   */
  async invalidateAllCache(): Promise<void> {
    try {
      if (!window.electronApi?.reasoning?.invalidateAllCache) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.invalidateAllCache();
      if (!response.success) {
        throw new Error(response.error || 'Failed to invalidate all cache');
      }
    } catch (error: any) {
      console.error('Error invalidating all cache:', error);
      throw new Error(error.message || 'Failed to invalidate all cache');
    }
  }

  // === BUSINESS RULES MANAGEMENT ===

  /**
   * Get all business rules
   */
  async getAllRules(): Promise<BusinessRule[]> {
    try {
      if (!window.electronApi?.reasoning?.getAllRules) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getAllRules();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get business rules');
    } catch (error: any) {
      console.error('Error getting business rules:', error);
      throw new Error(error.message || 'Failed to get business rules');
    }
  }

  /**
   * Add a new custom business rule
   */
  async createRule(rule: CreateRuleRequest): Promise<{ ruleId: number }> {
    try {
      if (!window.electronApi?.reasoning?.createRule) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.createRule(rule);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to create business rule');
    } catch (error: any) {
      console.error('Error creating business rule:', error);
      throw new Error(error.message || 'Failed to create business rule');
    }
  }

  /**
   * Update an existing business rule
   */
  async updateRule(ruleId: number, updates: UpdateRuleRequest): Promise<void> {
    try {
      if (!window.electronApi?.reasoning?.updateRule) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.updateRule(String(ruleId), updates);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update business rule');
      }
    } catch (error: any) {
      console.error('Error updating business rule:', error);
      throw new Error(error.message || 'Failed to update business rule');
    }
  }

  /**
   * Delete a custom business rule
   */
  async deleteRule(ruleId: number): Promise<void> {
    try {
      if (!window.electronApi?.reasoning?.deleteRule) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.deleteRule(String(ruleId));
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete business rule');
      }
    } catch (error: any) {
      console.error('Error deleting business rule:', error);
      throw new Error(error.message || 'Failed to delete business rule');
    }
  }

  /**
   * Test a business rule with sample data
   */
  async testRule(testData: TestRuleRequest): Promise<RuleTestResult> {
    try {
      if (!window.electronApi?.reasoning?.testRule) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.testRule(testData);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to test business rule');
    } catch (error: any) {
      console.error('Error testing business rule:', error);
      throw new Error(error.message || 'Failed to test business rule');
    }
  }

  // === BEHAVIORAL STAGES MANAGEMENT ===

  /**
   * Get all behavioral stages
   */
  async getAllStages(): Promise<BehavioralStage[]> {
    try {
      if (!window.electronApi?.reasoning?.getAllStages) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getAllStages();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get behavioral stages');
    } catch (error: any) {
      console.error('Error getting behavioral stages:', error);
      throw new Error(error.message || 'Failed to get behavioral stages');
    }
  }

  /**
   * Create a new behavioral stage
   */
  async createStage(stage: CreateStageRequest): Promise<{ stageId: number }> {
    try {
      if (!window.electronApi?.reasoning?.createStage) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.createStage(stage);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to create behavioral stage');
    } catch (error: any) {
      console.error('Error creating behavioral stage:', error);
      throw new Error(error.message || 'Failed to create behavioral stage');
    }
  }

  /**
   * Test stage inference for specific employee
   */
  async testStageInference(hrCode: string): Promise<StageTestResult> {
    try {
      if (!window.electronApi?.reasoning?.testStageInference) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.testStageInference(hrCode);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to test stage inference');
    } catch (error: any) {
      console.error('Error testing stage inference:', error);
      throw new Error(error.message || 'Failed to test stage inference');
    }
  }

  // === LLM INTEGRATION ===

  /**
   * Get LLM status and availability
   */
  async getLLMStatus(): Promise<{ isAvailable: boolean; isReady: boolean; modelPath: string | null; error: string | null }> {
    try {
      if (!window.electronApi?.reasoning?.getLLMStatus) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.getLLMStatus();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get LLM status');
    } catch (error: any) {
      console.error('Error getting LLM status:', error);
      throw new Error(error.message || 'Failed to get LLM status');
    }
  }

  /**
   * Ask a question to the LLM
   */
  async askLLMQuestion(questionData: LLMQuestionRequest): Promise<string> {
    try {
      if (!window.electronApi?.reasoning?.askLLMQuestion) {
        throw new Error('Electron API not available');
      }
      const response = await window.electronApi.reasoning.askLLMQuestion(questionData);
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to ask LLM question');
    } catch (error: any) {
      console.error('Error asking LLM question:', error);
      throw new Error(error.message || 'Failed to ask LLM question');
    }
  }
}

const reasoningService = new ReasoningService();
export default reasoningService; 