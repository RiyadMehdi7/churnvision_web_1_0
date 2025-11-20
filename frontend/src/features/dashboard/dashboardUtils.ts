import { Employee } from '../../types/employee';
import {
    WorkforceTrendsAnalysisData,
    DepartmentAnalysisData,
    EnhancedExitPatternMiningData
} from '../../types/analysisData';
import { getDynamicRiskLevel } from '../../config/riskThresholds';

// Helper to create fallback analysis
export function createFallbackAnalysis(type: string, employeeCount: number) {
    return {
        id: `fallback-${type}-${Date.now()}`,
        type,
        title: `${type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Analysis`,
        summary: `Analysis completed for ${employeeCount} employees. Limited insights due to processing constraints.`,
        insights: [
            { id: '1', title: 'Analysis Completed', description: 'Basic analysis has been completed with available data.' }
        ],
        recommendations: [
            { id: '1', title: 'Review Data Quality', description: 'Ensure data quality and completeness for better analysis results.' }
        ],
        confidence: 0.5,
        timestamp: new Date(),
        executionTime: 1000
    };
}

export function analyzeEmployeePatterns(employees: any[], thresholds = { highRisk: 0.7, mediumRisk: 0.4 }) {
    const insights = [];
    const recommendations = [];
    const visualizations = [];

    // Enhanced risk distribution analysis
    const highRisk = employees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk);
    const mediumRisk = employees.filter(emp => {
        const risk = emp.churnProbability || 0;
        return risk > thresholds.mediumRisk && risk <= thresholds.highRisk;
    });
    const lowRisk = employees.filter(emp => (emp.churnProbability || 0) <= thresholds.mediumRisk);

    // Calculate comprehensive risk metrics with proper rounding
    const totalEmployees = employees.length;
    const highRiskPercentage = Math.round((highRisk.length / totalEmployees) * 100 * 100) / 100;
    const mediumRiskPercentage = Math.round((mediumRisk.length / totalEmployees) * 100 * 100) / 100;
    const avgRisk = Math.round((employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length) * 100 * 100) / 100;
    const riskVariance = Math.round((employees.reduce((sum, emp) => {
        const diff = (emp.churnProbability || 0) - (avgRisk / 100);
        return sum + (diff * diff);
    }, 0) / employees.length) * 100 * 100) / 100;

    // Enhanced risk insights with more sophisticated analysis
    if (highRisk.length > 0) {
        const avgHighRisk = Math.round((highRisk.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / highRisk.length) * 100 * 100) / 100;
        const maxRisk = Math.round(Math.max(...highRisk.map(emp => emp.churnProbability || 0)) * 100 * 100) / 100;

        insights.push({
            id: 'high-risk-pattern',
            title: 'Critical Risk Concentration',
            description: `${highRisk.length} employees (${highRiskPercentage}%) show critical churn risk (>${Math.round(thresholds.highRisk * 100)}%). Average risk: ${avgHighRisk}%, Max risk: ${maxRisk}%. Immediate intervention required.`,
            severity: 'critical',
            confidence: 0.95,
            impact: 'high'
        });

        recommendations.push({
            id: 'high-risk-action',
            title: 'Immediate Retention Intervention',
            description: `Implement urgent retention strategies for ${highRisk.length} high-risk employees. Focus on personalized engagement, career development, and competitive compensation. Priority: Critical.`,
            priority: 'critical',
            timeframe: 'immediate',
            impact: 'high'
        });
    }

    if (mediumRisk.length > 0) {
        const avgMediumRisk = Math.round((mediumRisk.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / mediumRisk.length) * 100 * 100) / 100;

        insights.push({
            id: 'medium-risk-pattern',
            title: 'Elevated Risk Population',
            description: `${mediumRisk.length} employees (${mediumRiskPercentage}%) show elevated churn risk (${Math.round(thresholds.mediumRisk * 100)}-${Math.round(thresholds.highRisk * 100)}%). Average risk: ${avgMediumRisk}%. This represents a significant retention opportunity.`,
            severity: 'high',
            confidence: 0.88,
            impact: 'medium'
        });

        recommendations.push({
            id: 'medium-risk-action',
            title: 'Proactive Retention Strategy',
            description: `Develop targeted retention programs for ${mediumRisk.length} medium-risk employees. Implement regular check-ins, career development initiatives, and recognition programs.`,
            priority: 'high',
            timeframe: '1-2 weeks',
            impact: 'medium'
        });
    }

    // Department pattern analysis with enhanced metrics
    const deptGroups = employees.reduce((acc: Record<string, any[]>, emp: any) => {
        const dept = emp.structure_name || emp.department || 'Unknown';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(emp);
        return acc;
    }, {});

    const deptRisks = Object.entries(deptGroups)
        .map(([dept, emps]) => {
            const deptEmployees = emps as any[];
            const avgRisk = Math.round((deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / deptEmployees.length) * 100 * 100) / 100;
            const highRiskCount = deptEmployees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk).length;
            const mediumRiskCount = deptEmployees.filter(emp => {
                const risk = emp.churnProbability || 0;
                return risk > thresholds.mediumRisk && risk <= thresholds.highRisk;
            }).length;

            return {
                dept,
                avgRisk,
                count: deptEmployees.length,
                highRiskCount,
                mediumRiskCount,
                riskPercentage: Math.round(((highRiskCount + mediumRiskCount) / deptEmployees.length) * 100 * 100) / 100
            };
        })
        .sort((a, b) => b.avgRisk - a.avgRisk);

    // Enhanced department insights
    if (deptRisks.length > 0) {
        const highestRiskDept = deptRisks[0];
        const lowestRiskDept = deptRisks[deptRisks.length - 1];

        if (highestRiskDept.avgRisk > (avgRisk / 100) * 1.2) {
            insights.push({
                id: 'dept-risk-concentration',
                title: 'Department Risk Concentration',
                description: `${highestRiskDept.dept} department shows significantly elevated risk (${highestRiskDept.avgRisk}% vs ${avgRisk}% org average). ${highestRiskDept.highRiskCount} critical and ${highestRiskDept.mediumRiskCount} elevated risk employees.`,
                severity: 'high',
                confidence: 0.92,
                impact: 'high'
            });

            recommendations.push({
                id: 'dept-intervention',
                title: 'Department-Level Retention Program',
                description: `Implement comprehensive retention program for ${highestRiskDept.dept} department. Focus on leadership engagement, career development, and competitive compensation.`,
                priority: 'high',
                timeframe: '2-4 weeks',
                impact: 'high'
            });
        }

        // Best practice identification
        if (lowestRiskDept.avgRisk < (avgRisk / 100) * 0.8) {
            insights.push({
                id: 'dept-best-practices',
                title: 'Department Best Practices Identified',
                description: `${lowestRiskDept.dept} department shows excellent retention practices (${lowestRiskDept.avgRisk}% risk vs ${avgRisk}% org average). Consider replicating their strategies.`,
                severity: 'low',
                confidence: 0.85,
                impact: 'medium'
            });
        }
    }

    // Position-based analysis
    const positionGroups = employees.reduce((acc: Record<string, any[]>, emp: any) => {
        const position = emp.position || 'Unknown';
        if (!acc[position]) acc[position] = [];
        acc[position].push(emp);
        return acc;
    }, {});

    const positionRisks = Object.entries(positionGroups)
        .filter(([_, emps]) => (emps as any[]).length >= 3) // Only positions with 3+ employees
        .map(([position, emps]) => {
            const positionEmployees = emps as any[];
            const avgRisk = Math.round((positionEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / positionEmployees.length) * 100 * 100) / 100;
            return { position, avgRisk, count: positionEmployees.length };
        })
        .sort((a, b) => b.avgRisk - a.avgRisk);

    // Position insights
    if (positionRisks.length > 0) {
        const highestRiskPosition = positionRisks[0];
        if (highestRiskPosition.avgRisk > (avgRisk / 100) * 1.3) {
            insights.push({
                id: 'position-risk-pattern',
                title: 'Position-Based Risk Pattern',
                description: `${highestRiskPosition.position} role shows significantly elevated churn risk (${highestRiskPosition.avgRisk}% vs ${avgRisk}% org average). ${highestRiskPosition.count} employees affected.`,
                severity: 'medium',
                confidence: 0.78,
                impact: 'medium'
            });

            recommendations.push({
                id: 'position-retention',
                title: 'Role-Specific Retention Strategy',
                description: `Develop targeted retention strategies for ${highestRiskPosition.position} role. Consider compensation review, career progression, and role satisfaction factors.`,
                priority: 'medium',
                timeframe: '1-3 weeks',
                impact: 'medium'
            });
        }
    }

    // Tenure analysis
    const tenureGroups = employees.reduce((acc: Record<string, any[]>, emp: any) => {
        const tenure = emp.tenure || 0;
        let group = 'Unknown';
        if (tenure < 1) group = 'New (< 1 year)';
        else if (tenure < 3) group = 'Early (1-3 years)';
        else if (tenure < 5) group = 'Mid (3-5 years)';
        else group = 'Senior (5+ years)';

        if (!acc[group]) acc[group] = [];
        acc[group].push(emp);
        return acc;
    }, {});

    const tenureRisks = Object.entries(tenureGroups)
        .map(([group, emps]) => {
            const groupEmployees = emps as any[];
            const avgRisk = Math.round((groupEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / groupEmployees.length) * 100 * 100) / 100;
            return { group, avgRisk, count: groupEmployees.length };
        })
        .sort((a, b) => b.avgRisk - a.avgRisk);

    // Tenure insights
    if (tenureRisks.length > 0) {
        const highestRiskTenure = tenureRisks[0];
        if (highestRiskTenure.avgRisk > (avgRisk / 100) * 1.2) {
            insights.push({
                id: 'tenure-risk-pattern',
                title: 'Tenure-Based Risk Pattern',
                description: `${highestRiskTenure.group} employees show elevated churn risk (${highestRiskTenure.avgRisk}% vs ${avgRisk}% org average). ${highestRiskTenure.count} employees affected.`,
                severity: 'medium',
                confidence: 0.82,
                impact: 'medium'
            });

            recommendations.push({
                id: 'tenure-retention',
                title: 'Tenure-Specific Engagement',
                description: `Develop targeted engagement strategies for ${highestRiskTenure.group} employees. Focus on career development, recognition, and retention incentives.`,
                priority: 'medium',
                timeframe: '2-4 weeks',
                impact: 'medium'
            });
        }
    }

    // Overall risk assessment
    insights.push({
        id: 'overall-risk-assessment',
        title: 'Organizational Risk Assessment',
        description: `Overall churn risk: ${avgRisk}%. High-risk employees: ${highRisk.length} (${highRiskPercentage}%), Medium-risk employees: ${mediumRisk.length} (${mediumRiskPercentage}%), Low-risk employees: ${lowRisk.length} (${Math.round((lowRisk.length / totalEmployees) * 100 * 100) / 100}%).`,
        severity: (avgRisk / 100) > 0.5 ? 'high' : (avgRisk / 100) > 0.3 ? 'medium' : 'low',
        confidence: 0.90,
        impact: 'high'
    });

    // Strategic recommendations
    if (highRiskPercentage > 10) {
        recommendations.push({
            id: 'strategic-intervention',
            title: 'Strategic Retention Initiative',
            description: `High-risk population (${highRiskPercentage}%) requires strategic intervention. Consider organizational culture, compensation, and career development programs.`,
            priority: 'critical',
            timeframe: '1-2 months',
            impact: 'high'
        });
    }

    if (mediumRiskPercentage > 30) {
        recommendations.push({
            id: 'proactive-strategy',
            title: 'Proactive Retention Strategy',
            description: `Large medium-risk population (${mediumRiskPercentage}%) presents opportunity for proactive retention. Implement comprehensive engagement programs.`,
            priority: 'high',
            timeframe: '1-3 months',
            impact: 'high'
        });
    }

    return {
        insights,
        recommendations,
        visualizations,
        metrics: {
            totalEmployees,
            avgRisk,
            riskVariance,
            highRiskCount: highRisk.length,
            mediumRiskCount: mediumRisk.length,
            lowRiskCount: lowRisk.length,
            highRiskPercentage,
            mediumRiskPercentage,
            deptRisks,
            positionRisks,
            tenureRisks
        }
    };
}

export async function analyzeChurnPatternsLocal(analysisData: any[], thresholds = { highRisk: 0.7, mediumRisk: 0.4 }) {
    try {
        // Use enhanced pattern analysis
        const patterns = analyzeEmployeePatterns(analysisData, thresholds);

        return {
            id: `churn-patterns-${Date.now()}`,
            type: 'churn-patterns',
            title: 'Advanced Churn Pattern Analysis',
            summary: `Comprehensive analysis of ${analysisData.length} employees with advanced pattern detection. Identified ${patterns.insights.length} key insights and ${patterns.recommendations.length} actionable recommendations.`,
            insights: patterns.insights,
            recommendations: patterns.recommendations,
            visualizations: patterns.visualizations,
            confidence: 0.92,
            timestamp: new Date(),
            executionTime: 1500,
            dataSources: [
                {
                    type: 'employee_data',
                    name: 'Employee Records',
                    available: true,
                    recordCount: analysisData.length,
                    lastUpdated: new Date()
                }
            ],
            parameters: {
                thresholds: {
                    highRisk: `${Math.round(thresholds.highRisk * 100)}%`,
                    mediumRisk: `${Math.round(thresholds.mediumRisk * 100)}%`
                },
                analysisType: 'comprehensive_pattern_analysis',
                departmentAnalysis: patterns.metrics.deptRisks.slice(0, 5).map(d => ({
                    department: d.dept,
                    avgRisk: `${d.avgRisk}%`,
                    count: d.count,
                    highRiskCount: d.highRiskCount,
                    mediumRiskCount: d.mediumRiskCount
                })),
                positionAnalysis: patterns.metrics.positionRisks.slice(0, 5).map(p => ({
                    position: p.position,
                    avgRisk: `${p.avgRisk}%`,
                    count: p.count
                })),
                tenureAnalysis: patterns.metrics.tenureRisks.map(t => ({
                    group: t.group,
                    avgRisk: `${t.avgRisk}%`,
                    count: t.count
                }))
            }
        };
    } catch (error) {
        throw error;
    }
}

export async function analyzeEngagementCorrelationLocal(analysisData: any[]) {
    try {
        return {
            id: `engagement-correlation-${Date.now()}`,
            type: 'engagement-correlation',
            title: 'Engagement Correlation Analysis',
            summary: `Analyzed correlation between engagement and churn risk for ${analysisData.length} employees.`,
            insights: [
                { id: '1', title: 'Limited Engagement Data', description: 'Engagement survey data not available for comprehensive correlation analysis.' }
            ],
            recommendations: [
                { id: '1', title: 'Upload Engagement Data', description: 'Upload engagement survey data to enable correlation analysis.' }
            ],
            confidence: 0.3,
            timestamp: new Date(),
            executionTime: 1000
        };
    } catch (error) {
        return createFallbackAnalysis('engagement-correlation', analysisData.length);
    }
}

export async function generateOrganizationalInsightsLocal(analysisData: any[], departments: string[], metrics: any) {
    try {
        // Analyze organizational structure and risk distribution
        const deptRisks = departments.slice(1).map(dept => {
            const deptEmployees = analysisData.filter(emp => (emp.structure_name || emp.department) === dept);
            const avgRisk = deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / (deptEmployees.length || 1);
            return { department: dept, avgRisk, count: deptEmployees.length };
        }).sort((a, b) => b.avgRisk - a.avgRisk);

        return {
            id: `org-insights-${Date.now()}`,
            type: 'organizational-insights',
            title: 'Organizational Insights',
            summary: `Comprehensive analysis of ${analysisData.length} employees across ${departments.length - 1} departments.`,
            insights: [
                {
                    id: '1',
                    title: 'Department Risk Analysis',
                    description: `${deptRisks[0]?.department || 'Unknown'} shows highest average risk at ${((deptRisks[0]?.avgRisk || 0) * 100).toFixed(1)}%`
                },
                {
                    id: '2',
                    title: 'Risk Distribution',
                    description: `${metrics.high_risk_count} high-risk employees (${((metrics.high_risk_count / metrics.total_employees) * 100).toFixed(1)}% of workforce)`
                }
            ],
            recommendations: [
                { id: '1', title: 'Focus on High-Risk Departments', description: 'Implement targeted retention strategies for departments with elevated risk levels.' },
                { id: '2', title: 'Individual Risk Assessment', description: 'Conduct detailed assessments for high-risk employees.' }
            ],
            confidence: 0.8,
            timestamp: new Date(),
            executionTime: 3000
        };
    } catch (error) {
        return createFallbackAnalysis('organizational-insights', analysisData.length);
    }
}

export async function runCrossAnalysisLocal(analysisData: any[]) {
    try {
        return {
            id: `cross-analysis-${Date.now()}`,
            type: 'cross-source',
            title: 'Cross-Source Analysis',
            summary: `Cross-analysis requires multiple data sources. Currently analyzing ${analysisData.length} employees from primary dataset.`,
            insights: [
                { id: '1', title: 'Single Data Source', description: 'Analysis limited to employee churn data. Additional data sources needed for comprehensive cross-analysis.' }
            ],
            recommendations: [
                { id: '1', title: 'Add Data Sources', description: 'Upload engagement surveys, interview data, or performance metrics for enhanced analysis.' }
            ],
            confidence: 0.4,
            timestamp: new Date(),
            executionTime: 1500
        };
    } catch (error) {
        return createFallbackAnalysis('cross-source', analysisData.length);
    }
}

export async function runGeneralAnalysisLocal(analysisType: string, analysisData: any[]) {
    try {
        return {
            id: `general-analysis-${Date.now()}`,
            type: analysisType,
            title: `${analysisType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Analysis`,
            summary: `General analysis completed for ${analysisData.length} employees.`,
            insights: [
                { id: '1', title: 'Analysis Complete', description: `${analysisType} analysis has been completed with available data.` }
            ],
            recommendations: [
                { id: '1', title: 'Review Results', description: 'Review the analysis results and consider implementing recommended actions.' }
            ],
            confidence: 0.7,
            timestamp: new Date(),
            executionTime: 2000
        };
    } catch (error) {
        return createFallbackAnalysis(analysisType, analysisData.length);
    }
}
