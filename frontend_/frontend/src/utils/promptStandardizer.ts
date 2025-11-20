/**
 * Prompt Standardization Utility
 * Ensures all quick actions use consistent, backend-supported prompt formats
 */

export interface StandardizedPrompt {
  action: string;
  prompt: string;
  employeeNames?: string[];
  isMultiEmployee?: boolean;
}

export const STANDARD_PROMPTS = {
  // Individual employee actions
  diagnose: "Analyze the churn risk factors for {name}",
  retention: "Generate a retention plan for {name}",
  similarity_stayed: "Show me employees similar to {name} who stayed, using AI reasoning and behavioral data",
  similarity_resigned: "Compare employee {name} with similar employees who resigned",
  
  // Multi-employee actions
  diagnose_multiple: "Analyze the churn risk factors for the following employees: {names}. What are the key patterns and recommendations?",
  retention_multiple: "Create personalized retention strategies for these employees: {names}. Focus on their specific risk factors and career development.",
  
  // Organizational analysis
  trends: "Show me current workforce churn trends and risk distribution across all employees",
  departments: "Compare churn risk across different departments and positions. Create charts showing risk distribution",
  patterns: "Show common exit patterns across resigned employees",
  
  // Executive actions
  organizational_health: "Provide a comprehensive organizational health assessment for our {count} employees. Include: 1) Overall workforce stability analysis, 2) Department-by-department risk assessment, 3) Key performance indicators and benchmarks, 4) Strategic recommendations for leadership team, 5) Risk mitigation priorities. Focus on executive-level insights and actionable strategies.",
  workforce_trends: "Analyze strategic workforce trends and provide executive insights on: 1) Historical churn patterns and seasonal variations, 2) Predictive analysis for next 6-12 months, 3) Industry benchmarking and competitive positioning, 4) Emerging risks and opportunities, 5) Strategic workforce planning recommendations. Include data-driven insights and executive summary.",
  critical_intervention: "Create an executive-level critical risk intervention plan for our {count} highest-risk employees. Include: 1) Immediate retention strategies and timeline, 2) Resource allocation and budget considerations, 3) Executive sponsor assignments, 4) Success metrics and KPIs, 5) Escalation procedures and contingency plans. Focus on business impact and ROI.",
  department_review: "Conduct a strategic department performance review focusing on retention and organizational health. Analyze: 1) Department-level risk assessment and benchmarking, 2) Leadership effectiveness and management practices, 3) Resource allocation and operational efficiency, 4) Cross-departmental collaboration and dependencies, 5) Strategic recommendations for department heads and executive team.",
  board_report: "Generate a board-ready executive report on workforce retention and organizational health. Include: 1) Executive summary with key findings and recommendations, 2) Financial impact analysis and ROI projections, 3) Competitive benchmarking and industry positioning, 4) Risk assessment and mitigation strategies, 5) Strategic initiatives and resource requirements. Format for C-suite and board presentation.",
  quarterly_summary: "Create a quarterly workforce summary for executive review. Cover: 1) Quarterly performance metrics and trend analysis, 2) Achievement against retention targets and KPIs, 3) Strategic initiatives progress and outcomes, 4) Emerging challenges and opportunities, 5) Next quarter priorities and resource needs. Focus on strategic insights and business impact.",
  competitive_benchmarking: "Conduct a competitive benchmarking analysis for workforce retention and organizational health. Analyze: 1) Industry retention benchmarks and best practices, 2) Competitive positioning and market analysis, 3) Emerging trends and innovative approaches, 4) Strategic opportunities and threats, 5) Recommendations for competitive advantage. Include executive insights and strategic implications.",
  strategic_planning: "Develop a strategic workforce planning framework for executive decision-making. Include: 1) Long-term workforce projections and scenario planning, 2) Talent acquisition and retention strategies, 3) Succession planning and leadership development, 4) Organizational design and structure optimization, 5) Investment priorities and resource allocation. Focus on strategic alignment and business objectives.",
  roi_analysis: "Conduct ROI and investment analysis for workforce retention initiatives. Analyze: 1) Cost-benefit analysis of retention programs and interventions, 2) Financial impact of turnover and replacement costs, 3) Investment priorities and budget allocation recommendations, 4) Performance metrics and success indicators, 5) Long-term financial projections and business case development.",
  
  // General insights
  ai_insights: "Based on the current employee data and risk patterns, what are your top AI-powered insights and recommendations for reducing churn risk?",
  team_overview: "Provide a comprehensive team risk overview by department. Which teams have the highest churn risk and what are the recommended actions for each department?",
  generate_report: "Generate an executive summary report on current churn risk status. Include key metrics, trends, high-risk areas, and strategic recommendations."
} as const;

export type PromptAction = keyof typeof STANDARD_PROMPTS;

/**
 * Standardize a prompt based on action type and parameters
 */
export const standardizePrompt = (
  action: PromptAction, 
  employeeName?: string, 
  employeeNames?: string[],
  count?: number
): StandardizedPrompt => {
  let prompt = STANDARD_PROMPTS[action];
  
  // Replace placeholders
  if (employeeName) {
    (prompt as any) = (prompt as any).replace('{name}', employeeName);
  }
  
  if (employeeNames && employeeNames.length > 0) {
    const namesString = employeeNames.join(', ');
    (prompt as any) = (prompt as any).replace('{names}', namesString);
  }
  
  if (count !== undefined) {
    (prompt as any) = (prompt as any).replace('{count}', count.toString());
  }
  
  const isMultiEmployee = action.includes('_multiple') || (employeeNames && employeeNames.length > 1);
  
  return {
    action,
    prompt,
    employeeNames: employeeNames || (employeeName ? [employeeName] : undefined),
    isMultiEmployee
  };
};

/**
 * Get the appropriate prompt action based on context
 */
export const getPromptAction = (
  context: 'individual' | 'multiple' | 'organizational' | 'executive',
  baseAction: 'diagnose' | 'retention' | 'similarity' | 'analysis'
): PromptAction => {
  switch (context) {
    case 'individual':
      return baseAction as PromptAction;
    case 'multiple':
      return `${baseAction}_multiple` as PromptAction;
    case 'organizational':
      switch (baseAction) {
        case 'analysis': return 'trends';
        default: return 'trends';
      }
    case 'executive':
      switch (baseAction) {
        case 'diagnose': return 'organizational_health';
        case 'retention': return 'critical_intervention';
        case 'analysis': return 'workforce_trends';
        default: return 'organizational_health';
      }
    default:
      return 'trends';
  }
}; 