// Data processing web worker to prevent main thread blocking
// This handles heavy data transformations and calculations

export interface WorkerMessage {
  type: 'PROCESS_EMPLOYEES' | 'CALCULATE_METRICS' | 'FILTER_DATA';
  data: any;
  requestId: string;
}

export interface WorkerResponse {
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  data: any;
  requestId: string;
  progress?: number;
}

// Process employees with reasoning data
function processEmployeesWithReasoning(employees: any[], reasoningData: any[]): any[] {
  const reasoningMap = new Map(reasoningData.map(r => [r.hr_code, r]));
  
  return employees.map(emp => {
    const reasoning = reasoningMap.get(emp.hr_code);
    return {
      ...emp,
      reasoningChurnRisk: reasoning?.churn_risk,
      hasReasoningData: !!reasoning,
      churnProbability: reasoning?.churn_risk ?? emp.churnProbability ?? emp.resign_proba ?? 0,
      reasoningConfidence: reasoning?.confidence_level,
      confidenceScore: reasoning?.confidence_level ? Math.round(reasoning.confidence_level * 100) : emp.confidenceScore
    };
  });
}

// Calculate metrics in optimized single pass
function calculateMetrics(employees: any[], thresholds = { highRisk: 0.7, mediumRisk: 0.4 }): any {
  if (employees.length === 0) {
    return {
      total_employees: 0,
      average_churn_probability: 0,
      risk_levels: { high: 0, medium: 0, low: 0 }
    };
  }
  
  let churnSum = 0;
  const riskDistribution = { high: 0, medium: 0, low: 0 };
  
  for (const emp of employees) {
    const churnProb = emp.churnProbability || 0;
    churnSum += churnProb;
    
    // Calculate risk level
    if (churnProb >= thresholds.highRisk) riskDistribution.high++;
    else if (churnProb >= thresholds.mediumRisk) riskDistribution.medium++;
    else riskDistribution.low++;
  }
  
  return {
    total_employees: employees.length,
    average_churn_probability: churnSum / employees.length,
    risk_levels: riskDistribution
  };
}

// Filter data with optimized algorithms
function filterData(employees: any[], filters: any, thresholds = { highRisk: 0.7, mediumRisk: 0.4 }): any[] {
  const { searchTerm, selectedDepartment, selectedRiskLevel, selectedStatus } = filters;
  
  const searchLower = searchTerm ? searchTerm.toLowerCase() : '';
  const hasSearch = Boolean(searchLower);
  const hasDepartmentFilter = Boolean(selectedDepartment && selectedDepartment !== 'All');
  const hasRiskLevelFilter = Boolean(selectedRiskLevel && selectedRiskLevel !== 'All');
  const hasStatusFilter = Boolean(selectedStatus && selectedStatus !== 'All');
  
  if (!hasSearch && !hasDepartmentFilter && !hasRiskLevelFilter && !hasStatusFilter) {
    return employees;
  }
  
  const filtered = [];
  
  for (const emp of employees) {
    // Search filter
    if (hasSearch) {
      const name = (emp.full_name || emp.name || '').toLowerCase();
      const position = (emp.position || '').toLowerCase();
      const department = (emp.structure_name || emp.department || '').toLowerCase();
      
      if (!name.includes(searchLower) && 
          !position.includes(searchLower) && 
          !department.includes(searchLower)) {
        continue;
      }
    }
    
    // Department filter
    if (hasDepartmentFilter && (emp.structure_name || emp.department || 'Unassigned') !== selectedDepartment) {
      continue;
    }
    
    // Risk level filter
    if (hasRiskLevelFilter) {
      const probability = emp.churnProbability || 0;
      const riskLevel = probability >= thresholds.highRisk ? 'High' : probability >= thresholds.mediumRisk ? 'Medium' : 'Low';
      if (riskLevel !== selectedRiskLevel) {
        continue;
      }
    }
    
    // Status filter
    if (hasStatusFilter && (emp.status || 'Active') !== selectedStatus) {
      continue;
    }
    
    filtered.push(emp);
  }
  
  return filtered;
}

// Main worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, data, requestId } = event.data;
  
  try {
    let result: any;
    
    switch (type) {
      case 'PROCESS_EMPLOYEES':
        result = processEmployeesWithReasoning(data.employees, data.reasoningData);
        break;
        
      case 'CALCULATE_METRICS':
        result = calculateMetrics(data.employees, data.thresholds);
        break;
        
      case 'FILTER_DATA':
        result = filterData(data.employees, data.filters, data.thresholds);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    const response: WorkerResponse = {
      type: 'SUCCESS',
      data: result,
      requestId
    };
    
    self.postMessage(response);
    
  } catch (error) {
    const response: WorkerResponse = {
      type: 'ERROR',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
      requestId
    };
    
    self.postMessage(response);
  }
};

// Export for TypeScript
export {};