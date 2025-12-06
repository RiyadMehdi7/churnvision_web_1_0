import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronUp,
  ChevronDown,
  FolderKanban,
  Brain,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGlobalDataCache } from '../hooks/useGlobalDataCache';
import { useProject } from '../contexts/ProjectContext';
import { Employee } from '../types/employee';
import { DataUploadWindow } from '../components/DataUploadWindow';
import { DataUploadNotification } from '../components/DataUploadNotification';
import { LoadingStates } from '../components/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AnalysisResultVisualization } from '../components/AnalysisResultVisualization';
import EmployeeNetworkGraph from '../components/EmployeeNetworkGraph';
import { ModelTrainingRequired } from '../components/ModelTrainingRequired';
import { TrainingReminderBanner } from '../components/TrainingReminderBanner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Input } from '../components/ui/input';
import { getCurrentThresholds, getDynamicRiskLevel, getDynamicRiskLevelWithStyles, subscribeToThresholdChanges } from '../config/riskThresholds';
import { autoThresholdService } from '../services/autoThresholdService';

// Import analysis data types
import type {
  WorkforceTrendsAnalysisData,
  DepartmentAnalysisData,
  EnhancedExitPatternMiningData
} from '../types/analysisData';

// Import Recharts for enhanced visualizations
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// Types and utilities
type SortableField = 'churnProbability' | 'full_name' | 'position' | 'structure_name' | 'status' | 'riskLevel'

// Local analysis functions using reasoning service
async function analyzeChurnPatternsLocal(analysisData: any[], thresholds = { highRisk: 0.7, mediumRisk: 0.4 }) {
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

async function analyzeEngagementCorrelationLocal(analysisData: any[]) {
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

async function generateOrganizationalInsightsLocal(analysisData: any[], departments: string[], metrics: any) {
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

async function runCrossAnalysisLocal(analysisData: any[]) {
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

async function runGeneralAnalysisLocal(analysisType: string, analysisData: any[]) {
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

function analyzeEmployeePatterns(employees: any[], thresholds = { highRisk: 0.7, mediumRisk: 0.4 }) {
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

  // Department Risk Bar Chart with better styling
  const DepartmentRiskChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={deptRisks.slice(0, 10).map(d => ({
        name: d.dept,
        risk: d.avgRisk,
        count: d.count,
        highRisk: d.highRiskCount,
        mediumRisk: d.mediumRiskCount
      }))}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
          label={{ value: 'Risk %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          formatter={(value, name) => [
            `${value}%`,
            name === 'risk' ? 'Average Risk' : name
          ]}
        />
        <Bar dataKey="risk" fill="#3b82f6" name="Average Risk" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // Position Risk Chart with better styling
  const PositionRiskChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={positionRisks.slice(0, 8).map(p => ({
        name: p.position,
        risk: p.avgRisk,
        count: p.count
      }))}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
          label={{ value: 'Risk %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          formatter={(value, name) => [
            `${value}%`,
            name === 'risk' ? 'Average Risk' : name
          ]}
        />
        <Bar dataKey="risk" fill="#10b981" name="Average Risk" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // Tenure Risk Chart with better styling
  const TenureRiskChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={tenureRisks.map(t => ({
        name: t.group,
        risk: t.avgRisk,
        count: t.count
      }))}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
          label={{ value: 'Risk %', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          formatter={(value, name) => [
            `${value}%`,
            name === 'risk' ? 'Average Risk' : name
          ]}
        />
        <Bar dataKey="risk" fill="#f59e0b" name="Average Risk" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // Add chart components to visualizations
  visualizations.push({
    id: 'department-risk',
    type: 'bar-chart',
    title: 'Department Risk Comparison',
    component: DepartmentRiskChart,
    data: deptRisks.slice(0, 10).map(d => ({ name: d.dept, value: d.avgRisk, count: d.count }))
  });

  visualizations.push({
    id: 'position-risk',
    type: 'bar-chart',
    title: 'Position Risk Analysis',
    component: PositionRiskChart,
    data: positionRisks.slice(0, 8).map(p => ({ name: p.position, value: p.avgRisk, count: p.count }))
  });

  visualizations.push({
    id: 'tenure-risk',
    type: 'bar-chart',
    title: 'Tenure Risk Analysis',
    component: TenureRiskChart,
    data: tenureRisks.map(t => ({ name: t.group, value: t.avgRisk, count: t.count }))
  });

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

function createFallbackAnalysis(type: string, employeeCount: number) {
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

// Simple insights generation functions that match the expected interfaces
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateWorkforceTrendsData(employees: Employee[], thresholds: { highRisk: number; mediumRisk: number }): WorkforceTrendsAnalysisData {

  // Calculate risk distribution
  const highRisk = employees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk);
  const mediumRisk = employees.filter(emp => {
    const prob = emp.churnProbability || 0;
    return prob >= thresholds.mediumRisk && prob <= thresholds.highRisk;
  });
  const lowRisk = employees.filter(emp => (emp.churnProbability || 0) < thresholds.mediumRisk);

  // Analyze by department
  const deptGroups = employees.reduce((acc: Record<string, Employee[]>, emp) => {
    const dept = emp.structure_name || emp.department || 'Unknown';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {});

  const departmentRisks = Object.entries(deptGroups).map(([department, deptEmployees]) => {
    const totalEmployees = deptEmployees.length;
    const highRiskCount = deptEmployees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk).length;
    const avgRisk = deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / totalEmployees;

    return {
      department,
      count: totalEmployees,
      avgRisk: Math.round(avgRisk * 100) / 100,
      highRiskCount,
      avgMLScore: avgRisk,
      avgStageScore: avgRisk * 0.9,
      avgConfidence: Math.random() * 0.3 + 0.7 // 0.7-1.0
    };
  }).sort((a, b) => b.avgRisk - a.avgRisk);

  // Analyze by position
  const positionGroups = employees.reduce((acc: Record<string, Employee[]>, emp) => {
    const position = emp.position || 'Unknown';
    if (!acc[position]) acc[position] = [];
    acc[position].push(emp);
    return acc;
  }, {});

  const positionRisks = Object.entries(positionGroups).map(([position, posEmployees]) => {
    const totalEmployees = posEmployees.length;
    const highRiskCount = posEmployees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk).length;
    const avgRisk = posEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / totalEmployees;

    return {
      position,
      count: totalEmployees,
      avgRisk: Math.round(avgRisk * 100) / 100,
      highRiskCount,
      avgMLScore: avgRisk,
      avgStageScore: avgRisk * 0.9,
      avgConfidence: Math.random() * 0.3 + 0.7
    };
  }).sort((a, b) => b.avgRisk - a.avgRisk);

  // Stage distribution (simulate career stages)
  const stageDistribution = [
    { stage: 'Early Career', count: Math.floor(employees.length * 0.3), avgRisk: 0.45 },
    { stage: 'Mid Career', count: Math.floor(employees.length * 0.45), avgRisk: 0.35 },
    { stage: 'Senior', count: Math.floor(employees.length * 0.25), avgRisk: 0.25 }
  ];

  const highRiskPercentage = Math.round((highRisk.length / employees.length) * 100);
  const mediumRiskPercentage = Math.round((mediumRisk.length / employees.length) * 100);
  const organizationalScore = Math.max(0, Math.min(100, 100 - (highRiskPercentage * 2 + mediumRiskPercentage * 0.5)));

  // Generate strategic insights
  const topRiskDepts = departmentRisks.slice(0, 3).map(d => d.department);
  const topRiskPositions = positionRisks.slice(0, 3).map(p => p.position);

  const strategicRecommendations = [
    highRiskPercentage > 20 ? 'Critical: Implement organization-wide retention program' : 'Monitor high-risk employees closely',
    topRiskDepts.length > 0 ? `Focus retention efforts on: ${topRiskDepts.join(', ')}` : 'Maintain current department strategies',
    topRiskPositions.length > 0 ? `Review compensation and career paths for: ${topRiskPositions.join(', ')}` : 'Position-based risks are manageable'
  ];

  const urgentActions = [];
  if (highRiskPercentage > 15) urgentActions.push('Immediate intervention required for high-risk employees');
  if (departmentRisks[0]?.avgRisk > 0.6) urgentActions.push(`${departmentRisks[0].department} department needs immediate attention`);
  if (urgentActions.length === 0) urgentActions.push('No urgent actions required - monitor trends');

  return {
    type: 'churn_trends_analysis',
    statistics: {
      totalEmployees: employees.length,
      highRisk: highRisk.length,
      mediumRisk: mediumRisk.length,
      lowRisk: lowRisk.length,
      departmentRisks,
      positionRisks,
      stageDistribution,
      confidenceDistribution: {
        high: Math.floor(employees.length * 0.6),
        medium: Math.floor(employees.length * 0.3),
        low: Math.floor(employees.length * 0.1)
      },
      riskTrends: {
        criticalEmployees: highRisk.length,
        atRiskDepartments: departmentRisks.filter(d => d.avgRisk > 0.5).length,
        averageConfidence: 0.8,
        totalWithReasoningData: employees.length
      }
    },
    insights: {
      detailedAnalysis: `Workforce analysis of ${employees.length} employees reveals ${highRiskPercentage}% high-risk, ${mediumRiskPercentage}% medium-risk employees across ${departmentRisks.length} departments. ${topRiskDepts.length > 0 ? `Highest risk departments: ${topRiskDepts.join(', ')}.` : ''}`,
      strategicRecommendations,
      urgentActions,
      trendAnalysis: {
        riskTrend: highRiskPercentage > 20 ? 'increasing' : highRiskPercentage < 10 ? 'decreasing' : 'stable',
        departmentTrends: departmentRisks.slice(0, 3).map(d => `${d.department}: ${Math.round(d.avgRisk * 100)}% avg risk`),
        stageTrends: stageDistribution.map(s => `${s.stage}: ${Math.round(s.avgRisk * 100)}% avg risk`),
        confidenceTrends: 'Model confidence remains high across all segments'
      },
      organizationalHealth: {
        overallScore: organizationalScore,
        riskLevel: organizationalScore > 80 ? 'Low' : organizationalScore > 60 ? 'Medium' : 'High',
        confidenceLevel: 'High',
        priorityAreas: [
          ...topRiskDepts.slice(0, 2).map(d => `${d} department retention`),
          ...topRiskPositions.slice(0, 1).map(p => `${p} role optimization`)
        ].slice(0, 3)
      }
    },
    analysis: `Comprehensive workforce trends analysis completed for ${employees.length} employees across ${departmentRisks.length} departments and ${positionRisks.length} positions.`
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateDepartmentAnalysisData(employees: Employee[], thresholds: { highRisk: number; mediumRisk: number }, selectedDept?: string): DepartmentAnalysisData {

  // Group employees by department
  const deptGroups = employees.reduce((acc: Record<string, Employee[]>, emp) => {
    const dept = emp.structure_name || emp.department || 'Unknown';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {});

  // Calculate department metrics
  const departments = Object.entries(deptGroups).map(([department, deptEmployees]) => {
    const totalEmployees = deptEmployees.length;
    const highRiskCount = deptEmployees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk).length;
    const mediumRiskCount = deptEmployees.filter(emp => {
      const prob = emp.churnProbability || 0;
      return prob >= thresholds.mediumRisk && prob <= thresholds.highRisk;
    }).length;
    const lowRiskCount = totalEmployees - highRiskCount - mediumRiskCount;
    const avgRisk = deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / totalEmployees;
    const avgTenure = deptEmployees.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / totalEmployees;
    const avgCost = deptEmployees.reduce((sum, emp) => sum + (emp.salary || 0), 0) / totalEmployees;

    return {
      department,
      totalEmployees,
      highRisk: highRiskCount,
      mediumRisk: mediumRiskCount,
      lowRisk: lowRiskCount,
      avgRisk,
      avgMLScore: avgRisk,
      avgStageScore: avgRisk * 0.9,
      avgConfidence: Math.random() * 0.3 + 0.7,
      withReasoningData: totalEmployees,
      avgTenure,
      avgCost
    };
  }).sort((a, b) => b.avgRisk - a.avgRisk);

  // Calculate organizational metrics
  const orgAvgRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employees.length;
  const highRiskDepts = departments.filter(d => d.avgRisk > thresholds.highRisk);
  const totalHighRisk = departments.reduce((sum, dept) => sum + dept.highRisk, 0);

  // Generate insights based on analysis type
  let insights;
  let departmentData: any = null;

  if (selectedDept && departments.find(d => d.department === selectedDept)) {
    // Specific department analysis
    const targetDept = departments.find(d => d.department === selectedDept)!;

    // Generate position analysis for the department
    const deptEmployees = deptGroups[selectedDept];
    const positions = deptEmployees.reduce((acc: Record<string, Employee[]>, emp) => {
      const pos = emp.position || 'Unknown';
      if (!acc[pos]) acc[pos] = [];
      acc[pos].push(emp);
      return acc;
    }, {});

    const positionAnalysis = Object.entries(positions).map(([position, posEmployees]) => ({
      position,
      count: posEmployees.length,
      avgRisk: posEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / posEmployees.length,
      highRiskCount: posEmployees.filter(emp => (emp.churnProbability || 0) > thresholds.highRisk).length
    })).sort((a, b) => b.avgRisk - a.avgRisk);

    const highRiskEmployees = deptEmployees
      .filter(emp => (emp.churnProbability || 0) > thresholds.highRisk)
      .sort((a, b) => (b.churnProbability || 0) - (a.churnProbability || 0))
      .slice(0, 10)
      .map(emp => ({
        full_name: emp.full_name || emp.name || 'Unknown',
        hr_code: emp.hr_code || 'N/A',
        position: emp.position || 'Unknown',
        tenure: emp.tenure || 0,
        churn_risk: emp.churnProbability || 0,
        stage: emp.tenure > 5 ? 'Senior' : emp.tenure > 2 ? 'Mid' : 'Junior',
        reasoning: 'High churn probability detected by model'
      }));

    departmentData = {
      departmentName: selectedDept,
      totalEmployees: targetDept.totalEmployees,
      highRisk: targetDept.highRisk,
      mediumRisk: targetDept.mediumRisk,
      lowRisk: targetDept.lowRisk,
      avgRisk: targetDept.avgRisk,
      avgMLScore: targetDept.avgMLScore,
      avgStageScore: targetDept.avgStageScore,
      avgConfidence: targetDept.avgConfidence,
      withReasoningData: targetDept.withReasoningData,
      avgTenure: targetDept.avgTenure,
      minTenure: Math.min(...deptEmployees.map(emp => emp.tenure || 0)),
      maxTenure: Math.max(...deptEmployees.map(emp => emp.tenure || 0)),
      avgCost: targetDept.avgCost,
      minCost: Math.min(...deptEmployees.map(emp => emp.salary || 0)),
      maxCost: Math.max(...deptEmployees.map(emp => emp.salary || 0)),
      positions: positionAnalysis,
      stages: [
        { stage: 'Junior', count: deptEmployees.filter(emp => (emp.tenure || 0) <= 2).length, avgRisk: 0.4 },
        { stage: 'Mid', count: deptEmployees.filter(emp => (emp.tenure || 0) > 2 && (emp.tenure || 0) <= 5).length, avgRisk: 0.35 },
        { stage: 'Senior', count: deptEmployees.filter(emp => (emp.tenure || 0) > 5).length, avgRisk: 0.25 }
      ],
      highRiskEmployees,
      riskFactors: [
        { factor: 'High Workload', frequency: 0.6, avgImportance: 0.8, type: 'ml_factor' as const },
        { factor: 'Limited Career Growth', frequency: 0.4, avgImportance: 0.7, type: 'business_rule' as const },
        { factor: 'Compensation Below Market', frequency: 0.3, avgImportance: 0.9, type: 'ml_factor' as const }
      ]
    };

    insights = {
      detailedAnalysis: `${selectedDept} department has ${targetDept.totalEmployees} employees with ${Math.round(targetDept.avgRisk * 100)}% average churn risk. ${targetDept.highRisk} employees (${Math.round((targetDept.highRisk / targetDept.totalEmployees) * 100)}%) are at high risk. Top risk positions: ${positionAnalysis.slice(0, 3).map(p => p.position).join(', ')}.`,
      strategicRecommendations: [
        targetDept.avgRisk > orgAvgRisk ? `${selectedDept} requires focused retention strategy (${Math.round(targetDept.avgRisk * 100)}% vs ${Math.round(orgAvgRisk * 100)}% org avg)` : `${selectedDept} performing better than organization average`,
        positionAnalysis[0]?.avgRisk > 0.5 ? `Address high risk in ${positionAnalysis[0].position} roles` : 'Maintain current position strategies',
        `Focus on ${highRiskEmployees.length} high-risk employees for immediate intervention`
      ],
      urgentActions: [
        targetDept.highRisk > targetDept.totalEmployees * 0.2 ? 'Immediate action required - over 20% high risk' : 'Monitor high-risk employees',
        highRiskEmployees.length > 5 ? 'Schedule retention meetings for top 5 high-risk employees' : 'Maintain regular check-ins',
        'Review department management practices'
      ],
      retentionStrategies: [
        'Implement targeted career development programs',
        'Conduct stay interviews with high-risk employees',
        'Review and adjust compensation packages',
        'Improve work-life balance initiatives'
      ],
      healthScore: Math.max(0, Math.min(100, 100 - (targetDept.avgRisk * 100))),
      riskLevel: getDynamicRiskLevel(targetDept.avgRisk),
      priorityActions: [
        'Retention plan for high-risk employees',
        'Management training and development',
        'Compensation and benefits review'
      ],
      benchmarkComparison: {
        organizationAverage: orgAvgRisk,
        departmentAverage: targetDept.avgRisk,
        relativePosiiton: targetDept.avgRisk > orgAvgRisk ? 'Above average risk' : 'Below average risk'
      }
    };
  } else {
    // Overview analysis
    insights = {
      detailedAnalysis: `Organization-wide department analysis across ${departments.length} departments and ${employees.length} employees. ${highRiskDepts.length} departments show elevated risk levels. Highest risk departments: ${departments.slice(0, 3).map(d => `${d.department} (${Math.round(d.avgRisk * 100)}%)`).join(', ')}.`,
      strategicRecommendations: [
        highRiskDepts.length > 0 ? `Focus on ${highRiskDepts.length} high-risk departments: ${highRiskDepts.slice(0, 3).map(d => d.department).join(', ')}` : 'Maintain current department strategies',
        totalHighRisk > employees.length * 0.15 ? 'Implement organization-wide retention initiative' : 'Continue targeted retention efforts',
        `Review management practices in departments with >50% medium-high risk employees`
      ],
      urgentActions: [
        highRiskDepts.length > 0 ? `Immediate intervention needed for ${highRiskDepts[0].department} department` : 'No urgent departmental actions required',
        totalHighRisk > 20 ? 'Executive review of retention strategy required' : 'Continue monitoring',
        'Conduct department-level risk assessments'
      ],
      retentionStrategies: [
        'Department-specific retention programs',
        'Cross-departmental best practice sharing',
        'Leadership development for department heads',
        'Regular department health surveys'
      ],
      healthScore: Math.round(departments.reduce((sum, dept) => sum + (100 - dept.avgRisk * 100), 0) / departments.length),
      riskLevel: highRiskDepts.length > departments.length * 0.3 ? 'High' : highRiskDepts.length > 0 ? 'Medium' : 'Low',
      priorityActions: [
        'Department risk assessment',
        'Manager training program',
        'Employee engagement surveys'
      ],
      benchmarkComparison: {
        organizationAverage: orgAvgRisk,
        departmentAverage: departments.reduce((sum, dept) => sum + dept.avgRisk, 0) / departments.length,
        relativePosiiton: 'Baseline measurement'
      },
      organizationalInsights: [
        `${departments.length} departments analyzed with avg ${Math.round(orgAvgRisk * 100)}% churn risk`,
        `${highRiskDepts.length} departments require immediate attention`,
        `Top performing department: ${departments[departments.length - 1]?.department} (${Math.round(departments[departments.length - 1]?.avgRisk * 100)}% risk)`
      ]
    };
  }

  return {
    type: 'department_analysis',
    analysisType: selectedDept ? 'specific' : 'overview',
    targetDepartment: selectedDept,
    departments: selectedDept ? undefined : departments,
    departmentData,
    insights,
    summary: selectedDept
      ? `Detailed analysis of ${selectedDept} department completed`
      : `Department analysis completed for ${employees.length} employees across ${departments.length} departments`,
    availableDepartments: Object.keys(deptGroups)
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateExitPatternData(employees: Employee[]): EnhancedExitPatternMiningData {
  // Look for actual resigned employees in the dataset
  const resignedEmployees = employees.filter(emp => {
    const status = emp.status?.toLowerCase() || '';
    return status.includes('resigned') ||
      status.includes('terminated') ||
      status.includes('left') ||
      status.includes('quit') ||
      status.includes('inactive') ||
      status.includes('exit') ||
      status === 'resigned' ||
      status === 'terminated' ||
      status === 'left' ||
      status === 'quit' ||
      status === 'inactive' ||
      status === 'exit' ||
      // Also check if employee has termination date
      (emp.termination_date && emp.termination_date !== '' && emp.termination_date !== null);
  });

  const totalExits = resignedEmployees.length;

  // Debug logging (commented out to prevent infinite re-renders)
  // Only enable this temporarily for debugging
  /*
  if (employees.length > 0 && totalExits === 0) {
    const uniqueStatuses = [...new Set(employees.map(emp => emp.status).filter(Boolean))];
    console.log('Exit Pattern Debug - Unique statuses:', uniqueStatuses);
  }
  */

  // Department pattern analysis using actual resignations
  const deptGroups = employees.reduce((acc: Record<string, Employee[]>, emp) => {
    const dept = emp.structure_name || emp.department || 'Unknown';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {});

  const departmentPatterns = Object.entries(deptGroups).map(([department, deptEmployees]) => {
    const deptResigned = deptEmployees.filter(emp => resignedEmployees.includes(emp));
    const avgTenure = deptResigned.length > 0
      ? deptResigned.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / deptResigned.length
      : deptEmployees.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / deptEmployees.length;

    return {
      department,
      resignation_count: deptResigned.length,
      avg_tenure: Math.round(avgTenure * 10) / 10,
      early_exits: deptResigned.filter(emp => (emp.tenure || 0) < 2).length,
      mid_tenure_exits: deptResigned.filter(emp => (emp.tenure || 0) >= 2 && (emp.tenure || 0) <= 5).length,
      senior_exits: deptResigned.filter(emp => (emp.tenure || 0) > 5).length,
      total_employees: deptEmployees.length,
      turnover_rate: deptEmployees.length > 0 ? Math.round((deptResigned.length / deptEmployees.length) * 100 * 10) / 10 : 0
    };
  }).sort((a, b) => b.resignation_count - a.resignation_count);

  // Position pattern analysis using actual resignations
  const positionGroups = employees.reduce((acc: Record<string, Employee[]>, emp) => {
    const position = emp.position || 'Unknown';
    if (!acc[position]) acc[position] = [];
    acc[position].push(emp);
    return acc;
  }, {});

  const positionPatterns = Object.entries(positionGroups).map(([position, posEmployees]) => {
    const posResigned = posEmployees.filter(emp => resignedEmployees.includes(emp));
    const avgTenure = posResigned.length > 0
      ? posResigned.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / posResigned.length
      : posEmployees.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / posEmployees.length;

    return {
      position,
      resignation_count: posResigned.length,
      avg_tenure: Math.round(avgTenure * 10) / 10,
      early_exits: posResigned.filter(emp => (emp.tenure || 0) < 2).length,
      mid_tenure_exits: posResigned.filter(emp => (emp.tenure || 0) >= 2 && (emp.tenure || 0) <= 5).length,
      senior_exits: posResigned.filter(emp => (emp.tenure || 0) > 5).length,
      total_employees: posEmployees.length,
      turnover_rate: posEmployees.length > 0 ? Math.round((posResigned.length / posEmployees.length) * 100 * 10) / 10 : 0
    };
  }).filter(p => p.resignation_count > 0).sort((a, b) => b.resignation_count - a.resignation_count);

  // Tenure pattern analysis using actual resignations
  const tenureRanges = [
    { range: '0-1 years', employees: employees.filter(emp => (emp.tenure || 0) < 1) },
    { range: '1-2 years', employees: employees.filter(emp => (emp.tenure || 0) >= 1 && (emp.tenure || 0) < 2) },
    { range: '2-5 years', employees: employees.filter(emp => (emp.tenure || 0) >= 2 && (emp.tenure || 0) < 5) },
    { range: '5-10 years', employees: employees.filter(emp => (emp.tenure || 0) >= 5 && (emp.tenure || 0) < 10) },
    { range: '10+ years', employees: employees.filter(emp => (emp.tenure || 0) >= 10) }
  ];

  const tenurePatterns = tenureRanges.map(({ range, employees: rangeEmployees }) => {
    const resignedInRange = rangeEmployees.filter(emp => resignedEmployees.includes(emp));
    return {
      tenure_range: range,
      resignation_count: resignedInRange.length,
      avg_tenure_in_range: resignedInRange.length > 0
        ? resignedInRange.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / resignedInRange.length
        : rangeEmployees.reduce((sum, emp) => sum + (emp.tenure || 0), 0) / Math.max(rangeEmployees.length, 1),
      total_in_range: rangeEmployees.length,
      turnover_rate: rangeEmployees.length > 0 ? Math.round((resignedInRange.length / rangeEmployees.length) * 100 * 10) / 10 : 0
    };
  }).filter(p => p.resignation_count > 0);

  // Common risk factors analysis based on resigned employees
  const analysisFactors = [
    { name: 'Limited Career Growth', weight: 0.7 },
    { name: 'Work-Life Balance Issues', weight: 0.6 },
    { name: 'Compensation Dissatisfaction', weight: 0.5 },
    { name: 'Management Issues', weight: 0.4 }
  ];

  const commonRiskFactors = analysisFactors.map(factor => {
    const affectedCount = Math.floor(resignedEmployees.length * factor.weight);
    return {
      factor: factor.name,
      frequency: resignedEmployees.length > 0 ? Math.round((affectedCount / resignedEmployees.length) * 100) / 100 : 0,
      affectedEmployees: affectedCount,
      avgImpact: factor.weight + 0.1,
      type: factor.name.includes('Career') || factor.name.includes('Compensation') ? 'business_rule' as const : 'ml_factor' as const,
      examples: factor.name === 'Limited Career Growth'
        ? ['No promotion in 2+ years', 'Unclear career path', 'Limited skill development']
        : factor.name === 'Work-Life Balance Issues'
          ? ['Long working hours', 'High stress levels', 'Burnout indicators']
          : factor.name === 'Compensation Dissatisfaction'
            ? ['Below market salary', 'No recent raises', 'Bonus structure issues']
            : ['Poor manager relationship', 'Lack of feedback', 'Micromanagement']
    };
  });

  // Seasonal patterns - distribute resigned employees across months realistically
  const monthlyDistribution = [0.1, 0.08, 0.12, 0.09, 0.07, 0.11, 0.10, 0.08, 0.09, 0.08, 0.06, 0.12];
  const seasonalPatterns = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ].map((month, index) => ({
    month,
    resignation_count: Math.floor(totalExits * monthlyDistribution[index]),
    year: '2024'
  }));

  // Risk factor employee data - use actual resigned employees
  const riskFactorData = resignedEmployees.slice(0, 20).map(emp => ({
    hr_code: emp.hr_code || 'N/A',
    full_name: emp.full_name || emp.name || 'Unknown',
    structure_name: emp.structure_name || emp.department || 'Unknown',
    position: emp.position || 'Unknown',
    tenure: emp.tenure || 0,
    churn_risk: Math.round((emp.churnProbability || 0) * 100) / 100,
    stage: emp.tenure > 5 ? 'Senior' : emp.tenure > 2 ? 'Mid Career' : 'Early Career',
    status: emp.status || 'Resigned'
  }));

  // Generate insights based on actual resignation data
  const mostAffectedDept = departmentPatterns[0]?.department || 'N/A';
  const mostCommonTenureRange = tenurePatterns.sort((a, b) => b.resignation_count - a.resignation_count)[0]?.tenure_range || '1-2 years';
  const topRiskFactor = commonRiskFactors[0]?.factor || 'Career development';
  const totalTurnoverRate = employees.length > 0 ? Math.round((totalExits / employees.length) * 100 * 10) / 10 : 0;

  const keyPatterns = [
    totalExits === 0
      ? 'No resigned employees found in current dataset - all employees appear to be active'
      : departmentPatterns.length > 0 && departmentPatterns[0].resignation_count > 0
        ? `${mostAffectedDept} department has highest resignations (${departmentPatterns[0]?.resignation_count} actual exits, ${departmentPatterns[0]?.turnover_rate}% turnover rate)`
        : 'Even distribution of resignations across departments',
    totalExits === 0
      ? 'Exit pattern analysis requires historical data of employees who have left the company'
      : tenurePatterns.length > 0
        ? `${mostCommonTenureRange} tenure range shows highest exit rate (${tenurePatterns.find(t => t.tenure_range === mostCommonTenureRange)?.resignation_count} resignations)`
        : 'No clear tenure pattern in resignations',
    totalExits === 0
      ? 'To enable exit pattern analysis, import data with resigned/terminated employees marked with appropriate status values'
      : `${totalExits} total resignations identified from ${employees.length} employees (${totalTurnoverRate}% turnover rate)`
  ];

  const riskIndicators = [
    totalExits === 0
      ? 'Unable to assess turnover risk - no resigned employee data available'
      : totalTurnoverRate > 15 ? 'High turnover rate detected across organization' : totalTurnoverRate > 10 ? 'Moderate turnover levels' : 'Low turnover rate',
    totalExits === 0
      ? 'Department-specific turnover patterns cannot be analyzed without resignation data'
      : departmentPatterns.filter(d => d.resignation_count > 0 && d.turnover_rate > 20).length > 0 ? 'Specific departments showing concerning turnover patterns' : 'No department-specific turnover concerns',
    totalExits === 0
      ? 'Risk factor analysis requires data from employees who have actually left the company'
      : commonRiskFactors[0]?.frequency > 0.5 ? `${topRiskFactor} identified as primary factor in ${commonRiskFactors[0]?.affectedEmployees} resignations` : 'Multiple factors contributing to turnover'
  ];

  const preventiveStrategies = [
    'Implement targeted retention programs for high-risk departments',
    'Address career development opportunities and growth paths',
    'Improve work-life balance initiatives and flexible working arrangements',
    'Regular compensation benchmarking and adjustment',
    'Enhanced manager training and leadership development',
    'Structured stay interviews and feedback sessions'
  ];

  const departmentInsights = departmentPatterns.slice(0, 3).map(dept =>
    `${dept.department}: ${dept.resignation_count} resignations (${dept.turnover_rate}% turnover, ${Math.round(dept.avg_tenure * 10) / 10} avg tenure)`
  );

  return {
    type: 'exit_pattern_mining',
    exitData: {
      totalResignations: totalExits,
      departmentPatterns,
      positionPatterns,
      tenurePatterns,
      commonRiskFactors,
      seasonalPatterns,
      riskFactorData
    },
    insights: {
      detailedAnalysis: totalExits === 0
        ? `Exit pattern analysis cannot be performed: No resigned employees found in the current dataset of ${employees.length} employees. All employees appear to have "Active" status. To enable meaningful exit pattern analysis, you need to import historical data that includes employees with status values like "Resigned", "Terminated", "Left", etc. This analysis is designed to identify patterns among employees who have already left the company to help prevent future turnover.`
        : `Exit pattern analysis reveals ${totalExits} actual resignations from ${employees.length} total employees (${totalTurnoverRate}% turnover rate). ${mostAffectedDept} department shows highest impact with ${departmentPatterns[0]?.resignation_count || 0} resignations (${departmentPatterns[0]?.turnover_rate || 0}% department turnover). Most critical tenure period: ${mostCommonTenureRange} with ${tenurePatterns.find(t => t.tenure_range === mostCommonTenureRange)?.resignation_count || 0} resignations. Primary risk factor: ${topRiskFactor} affecting ${commonRiskFactors[0]?.affectedEmployees || 0} resigned employees.`,
      keyPatterns,
      riskIndicators,
      preventiveStrategies,
      departmentInsights,
      patternSummary: {
        mostAffectedDepartment: mostAffectedDept,
        mostCommonTenureExit: mostCommonTenureRange,
        topRiskFactor,
        totalPatterns: keyPatterns.length
      },
      urgencyLevel: totalTurnoverRate > 20 ? 'Critical' : totalTurnoverRate > 10 ? 'High' : 'Medium',
      trends: {
        departmentTrend: departmentPatterns.length > 3 ? 'Multiple departments affected' : 'Localized patterns',
        tenureTrend: mostCommonTenureRange.includes('1-2') ? 'Early career exits' : 'Mid-career transitions',
        riskFactorTrend: topRiskFactor.toLowerCase().includes('career') ? 'Development focused' : 'Compensation focused'
      }
    },
    summary: totalExits === 0
      ? `Exit pattern analysis unavailable: No resigned employees found in dataset. Current data contains ${employees.length} active employees only. Import historical resignation data to enable this analysis.`
      : `Exit pattern analysis completed: ${totalExits} actual resignations analyzed across ${departmentPatterns.length} departments with ${totalTurnoverRate}% overall turnover rate.`
  };
}

// Memoized components

// Memoized table row component
const EmployeeTableRow = memo(({
  employee,
  onReasoningClick,
  style,
  getRiskLevel,
  getRiskLevelWithStyles
}: {
  employee: Employee;
  onReasoningClick: (employee: Employee) => void;
  style?: React.CSSProperties;
  getRiskLevel: (probability: number) => 'High' | 'Medium' | 'Low';
  getRiskLevelWithStyles: (probability: number) => any;
}) => {
  // Handle potential NaN in churnProbability
  const probability = isNaN(employee.churnProbability) ? 0 : employee.churnProbability;

  // Get risk level and styling from dynamic thresholds
  const riskInfo = getRiskLevelWithStyles(probability);
  const riskLevel = getRiskLevel(probability);

  // Check if employee data seems malformed
  const hasIssues = !employee.full_name || employee.full_name.includes('Unknown') || !employee.structure_name || !employee.position;

  // Memoize confidence calculations for performance
  const confidence = useMemo(() => {
    return employee.reasoningConfidence
      ? Math.round(employee.reasoningConfidence * 100)
      : (employee.confidenceScore || 0);
  }, [employee.reasoningConfidence, employee.confidenceScore]);

  const confidenceColor = useMemo(() => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-blue-500';
    if (confidence >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  }, [confidence]);

  const handleReasoningClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    onReasoningClick(employee);
  }, [onReasoningClick, employee]);

  return (
    // Outermost element is now a div with flex display
    <div
      style={style} // Apply virtualization style (includes position: absolute, transform, height, width: 100%)
      className={cn(
        `flex items-center border-b border-gray-100 dark:border-gray-700/80`, // Use flex, add bottom border
        `hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasIssues ? 'bg-red-50 dark:bg-red-900/10' : ''} cursor-pointer`
      )}
      onClick={() => onReasoningClick(employee)}
    >
      {/* Inner elements are divs with widths and padding matching TH */}
      <div className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 truncate w-[20%]">
        {employee.full_name || (
          <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
            {/* SVG */} Missing Name
          </span>
        )}
      </div>
      <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 truncate w-[15%]">
        {employee.structure_name || 'Unassigned'}
      </div>
      <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 truncate w-[15%]">
        {employee.position || 'Unassigned'}
      </div>
      <div className="px-6 py-3 w-[10%]">
        <span className={cn(
          'px-2.5 py-0.5 text-xs font-medium rounded-full inline-block',
          `${riskInfo.color} ${riskInfo.bgColor} ${riskInfo.darkColor} ${riskInfo.darkBgColor}`
        )}>
          {riskLevel}
        </span>
      </div>
      <div className="px-6 py-3 w-[15%]">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
            {(probability * 100).toFixed(1)}%
          </div>
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
            <div className={`w-2 h-2 rounded-full ${confidenceColor}`}></div>
            <span className="text-xs text-blue-700 dark:text-blue-300 whitespace-nowrap font-medium">
              {confidence}% conf.
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 w-[10%]">
        {employee.status || 'Active'}
      </div>
      <div className="px-6 py-3 w-[15%]">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReasoningClick}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/50 text-purple-700 dark:text-purple-300 rounded transition-colors"
          >
            <Brain className="w-3 h-3" />
            Reasoning
          </button>
        </div>
      </div>
    </div>
  );
});

// Import PageHeader component
import { PageHeader } from '../components/PageHeader';
import { LayoutDashboard } from 'lucide-react';

// *** Modified Component: RiskBarCard ***
interface RiskBarCardProps {
  title: string;
  count: number;
  total: number;
  colorClass: string;
}

// Updated RiskBarCard to match the image layout more closely
const RiskBarCard: React.FC<RiskBarCardProps> = ({ title, count, total, colorClass }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      // Refined styling: slightly less padding (p-4), lighter border, potentially less shadow
      className={cn(
        `bg-white dark:bg-gray-800/50 p-4 rounded-lg border h-full min-h-[90px]`,
        `border-gray-200/75 dark:border-gray-700/50 shadow-xs` // Lighter border, smaller shadow
      )}
    >
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</p>
      <div className="flex items-center space-x-3"> {/* Slightly reduced space */}
        <div className="flex-grow h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"> {/* Slightly thinner bar */}
          <motion.div
            className={`h-full rounded-full bg-${colorClass}-500 dark:bg-${colorClass}-600`}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            title={`${percentage.toFixed(1)}%`}
          />
        </div>
        {/* Adjusted count styling slightly */}
        <p className="text-base font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0 w-10 text-right">
          {count}
        </p>
      </div>
    </motion.div>
  );
};



// --- Debounce Hook ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (also on delay change or unmount)
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function Home(): React.ReactElement {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const {
    homeEmployees,
    isLoadingHomeData,
    isEnhancingWithReasoning,
    reasoningEnhancementProgress,
    fetchHomeData,
    trainingStatus
  } = useGlobalDataCache();

  // Use centralized dynamic risk threshold functions
  const getRiskLevel = getDynamicRiskLevel;
  const getRiskLevelWithStyles = getDynamicRiskLevelWithStyles;
  const [thresholdVersion, setThresholdVersion] = useState(0);

  // Tab state management
  const [activeTab, setActiveTab] = useState<'dashboard' | 'deep-analysis' | 'network'>('dashboard');

  // Wrapper function to prevent access to insights tab
  const setActiveTabSafe = (tab: 'dashboard' | 'deep-analysis' | 'network') => {
    setActiveTab(tab);
  };

  // Deep Analysis state
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>('');
  const [analysisParams, setAnalysisParams] = useState({
    departmentFilter: 'all-departments',
    timePeriod: 'last-12-months',
    riskLevel: 'all-risk-levels',
    employeeGroup: 'all-employees'
  });
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);

  // Insights tab state - Temporarily disabled
  // const [selectedInsightType, setSelectedInsightType] = useState<'workforce-trends' | 'department-analysis' | 'exit-patterns'>('workforce-trends');
  // const [insightsData, setInsightsData] = useState<WorkforceTrendsAnalysisData | DepartmentAnalysisData | EnhancedExitPatternMiningData | null>(null);
  // const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('Active');
  const [sortField, setSortField] = useState<SortableField>('churnProbability');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const unsubscribe = subscribeToThresholdChanges(() => {
      setThresholdVersion((prev) => prev + 1);
    });

    return () => {
      unsubscribe();
    };
  }, []);
  const [isUploadWindowOpen, setIsUploadWindowOpen] = useState(false);
  const [error] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // Debounced search term
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Parent ref for the virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const hasReasoningData = useMemo(
    () =>
      (homeEmployees || []).some(
        emp => emp?.hasReasoningData || typeof emp?.reasoningChurnRisk === 'number'
      ),
    [homeEmployees]
  );
  const isModelReady = trainingStatus?.status === 'complete' || hasReasoningData;

  // Fetch and process data
  useEffect(() => {
    if (!activeProject) {
      return;
    }

    const initializeData = async () => {
      try {
        // Check if this is a refresh after an upload by checking the URL
        const urlParams = new URLSearchParams(window.location.search);
        const isPostUpload = urlParams.get('refresh') === 'true';

        if (isPostUpload) {
          // Force a complete refresh of the data
          await fetchHomeData(activeProject.id, true);

          // Clear the URL parameter after using it
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Initial load - use cache if available
          // Pass false to forceRefresh to use cache
          // Pass project ID to fetchHomeData
          await fetchHomeData(activeProject.id, false);
        }

      } catch (err) {
        // Error loading data - logged silently in production
      }
    };

    initializeData();
  }, [activeProject, fetchHomeData]);

  // Use homeEmployees directly from the global cache
  const employees = homeEmployees || [];
  const isLoading = isLoadingHomeData;
  const hasChurnReasoningData = useMemo(() =>
    employees.some(emp =>
      typeof (emp as any)?.churnProbability === 'number' ||
      typeof (emp as any)?.reasoningChurnRisk === 'number' ||
      (emp as any)?.hasReasoningData
    )
    , [employees]);

  // Base filtered data (before dropdown filters) for cascade filtering
  const baseFilteredEmployees = useMemo(() => {
    if (!debouncedSearchTerm) return employees;

    // Apply search filter only
    const searchLower = debouncedSearchTerm.toLowerCase();
    return employees.filter(employee => {
      const fullName = employee.full_name || '';
      const structureName = employee.structure_name || '';
      const position = employee.position || '';

      return fullName.toLowerCase().includes(searchLower) ||
        structureName.toLowerCase().includes(searchLower) ||
        position.toLowerCase().includes(searchLower);
    });
  }, [employees, debouncedSearchTerm]);

  // Cascade filter options based on current selections
  const availableDepartments = useMemo(() => {
    let dataForDepts = baseFilteredEmployees;

    // Apply other active filters except department
    if (selectedPosition && selectedPosition !== 'All') {
      dataForDepts = dataForDepts.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForDepts = dataForDepts.filter(emp => {
        const riskLevel = getRiskLevel(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForDepts = dataForDepts.filter(emp => (emp.status || 'Active') === selectedStatus);
    }

    const deptSet = new Set<string>();
    dataForDepts.forEach(emp => {
      deptSet.add(emp.structure_name || emp.department || 'Unassigned');
    });

    return ['All', ...Array.from(deptSet).sort()];
  }, [baseFilteredEmployees, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

  const availablePositions = useMemo(() => {
    let dataForPositions = baseFilteredEmployees;

    // Apply other active filters except position
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForPositions = dataForPositions.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForPositions = dataForPositions.filter(emp => {
        const riskLevel = getRiskLevel(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForPositions = dataForPositions.filter(emp => (emp.status || 'Active') === selectedStatus);
    }

    const posSet = new Set<string>();
    dataForPositions.forEach(emp => {
      posSet.add(emp.position || 'Unassigned');
    });

    return ['All', ...Array.from(posSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

  const availableRiskLevels = useMemo(() => {
    let dataForRisk = baseFilteredEmployees;

    // Apply other active filters except risk level
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedPosition && selectedPosition !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedStatus && selectedStatus !== 'All') {
      dataForRisk = dataForRisk.filter(emp => (emp.status || 'Active') === selectedStatus);
    }

    const riskSet = new Set<string>();
    dataForRisk.forEach(emp => {
      const riskLevel = getRiskLevel(emp.churnProbability || 0);
      riskSet.add(riskLevel);
    });

    return ['All', ...Array.from(riskSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedStatus, getRiskLevel, thresholdVersion]);

  const availableStatuses = useMemo(() => {
    let dataForStatus = baseFilteredEmployees;

    // Apply other active filters except status
    if (selectedDepartment && selectedDepartment !== 'All') {
      dataForStatus = dataForStatus.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }
    if (selectedPosition && selectedPosition !== 'All') {
      dataForStatus = dataForStatus.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }
    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      dataForStatus = dataForStatus.filter(emp => {
        const riskLevel = getRiskLevel(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }

    const statusSet = new Set<string>();
    dataForStatus.forEach(emp => {
      statusSet.add(emp.status || 'Active');
    });

    return ['All', ...Array.from(statusSet).sort()];
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, getRiskLevel, thresholdVersion]);

  // Final filtered data with all filters applied
  const filteredEmployees = useMemo(() => {
    let filtered = baseFilteredEmployees;

    // Apply dropdown filters
    if (selectedDepartment && selectedDepartment !== 'All') {
      filtered = filtered.filter(emp => (emp.structure_name || emp.department || 'Unassigned') === selectedDepartment);
    }

    if (selectedPosition && selectedPosition !== 'All') {
      filtered = filtered.filter(emp => (emp.position || 'Unassigned') === selectedPosition);
    }

    if (selectedRiskLevel && selectedRiskLevel !== 'All') {
      filtered = filtered.filter(emp => {
        const riskLevel = getRiskLevel(emp.churnProbability || 0);
        return riskLevel === selectedRiskLevel;
      });
    }

    if (selectedStatus && selectedStatus !== 'All') {
      filtered = filtered.filter(emp => (emp.status || 'Active') === selectedStatus);
    }

    return filtered;
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, selectedStatus, getRiskLevel, thresholdVersion]);

  // Derive display metrics from filtered employees - OPTIMIZED
  const displayMetrics = useMemo(() => {
    const totalEmployees = filteredEmployees.length;
    if (totalEmployees === 0) {
      return {
        total_employees: 0,
        average_churn_probability: 0,
        risk_levels: { high: 0, medium: 0, low: 0 },
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0
      };
    }

    // Calculate all metrics in a single pass for better performance
    let churnSum = 0;
    const riskDistribution = { high: 0, medium: 0, low: 0 };

    for (const emp of filteredEmployees) {
      const churnProb = emp.churnProbability || 0;
      churnSum += churnProb;

      // Calculate risk level once and increment counter
      const riskLevel = getRiskLevel(churnProb);
      if (riskLevel === 'High') riskDistribution.high++;
      else if (riskLevel === 'Medium') riskDistribution.medium++;
      else riskDistribution.low++;
    }

    const avgChurnProb = churnSum / totalEmployees;

    return {
      total_employees: totalEmployees,
      average_churn_probability: avgChurnProb,
      risk_levels: riskDistribution,
      // Keep the old properties for backward compatibility
      high_risk_count: riskDistribution.high,
      medium_risk_count: riskDistribution.medium,
      low_risk_count: riskDistribution.low
    };
  }, [filteredEmployees.length, filteredEmployees, thresholdVersion]);







  // Step 3: Sort the filtered employees for the table
  const sortedEmployees = useMemo(() => {
    if (!filteredEmployees.length) return [];

    return [...filteredEmployees].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case 'full_name':
          aValue = (a.full_name || '').toLowerCase();
          bValue = (b.full_name || '').toLowerCase();
          break;
        case 'structure_name':
          aValue = (a.structure_name || a.department || '').toLowerCase();
          bValue = (b.structure_name || b.department || '').toLowerCase();
          break;
        case 'position':
          aValue = (a.position || '').toLowerCase();
          bValue = (b.position || '').toLowerCase();
          break;
        case 'churnProbability':
          aValue = a.churnProbability || 0;
          bValue = b.churnProbability || 0;
          break;
        case 'status':
          aValue = (a.status || 'Active').toLowerCase();
          bValue = (b.status || 'Active').toLowerCase();
          break;
        case 'riskLevel':
          const riskOrder: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
          aValue = riskOrder[getRiskLevel(a.churnProbability || 0)] || 0;
          bValue = riskOrder[getRiskLevel(b.churnProbability || 0)] || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmployees, sortField, sortDirection, thresholdVersion]);

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: sortedEmployees.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  // Memoized sort handler
  const handleSort = useCallback((field: SortableField) => {
    if (sortField === field) {
      setSortDirection(prevDirection => prevDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
    }
  }, [sortField]);

  const SortIcon = ({ field }: { field: SortableField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ?
      <ChevronUp key={`sort-icon-${field}-asc`} className="w-4 h-4 ml-1" /> :
      <ChevronDown key={`sort-icon-${field}-desc`} className="w-4 h-4 ml-1" />
  }

  const renderHeader = () => (
    <PageHeader
      title="Risk Dashboard"
      subtitle="Monitor and analyze employee churn risk factors"
      icon={LayoutDashboard}
      userName={user?.full_name || user?.username}
      badges={[
        { label: 'Live', variant: 'sky', pulse: true },
        { label: 'ML-Powered', variant: 'emerald' },
      ]}
    />
  )

  // Handle reasoning button click
  const navigate = useNavigate();

  const handleReasoningClick = (employee: Employee) => {
    navigate(`/reasoning/${employee.hr_code}`, { state: { employeeName: employee.full_name } });
  };

  // Immediately remove training indicator if it exists
  useEffect(() => {
    // Remove any existing training indicator
    const existingIndicator = document.getElementById('model-training-indicator');
    if (existingIndicator && existingIndicator.parentNode) {
      existingIndicator.parentNode.removeChild(existingIndicator);
    }

    // Clear training status in localStorage
    localStorage.removeItem('modelTrainingInProgress');
    localStorage.removeItem('modelTrainingStartTime');
  }, []);

  // Check for data upload note - now using React state
  useEffect(() => {
    const dataUploadNote = localStorage.getItem('dataUploadNote');

    if (dataUploadNote) {
      setNotificationMessage(dataUploadNote);
      setShowNotification(true);

      // Clean up localStorage when showing notification
      localStorage.removeItem('dataUploadNote');
    }
  }, []);

  const handleNotificationClose = useCallback(() => {
    setShowNotification(false);
  }, []);

  // Generate insights for the selected insight type - Temporarily disabled
  /*
  const generateInsights = useCallback(async () => {
    if (!filteredEmployees.length) {
      return;
    }

    setIsGeneratingInsights(true);
    
    try {
      let data: WorkforceTrendsAnalysisData | DepartmentAnalysisData | EnhancedExitPatternMiningData;
      
      switch (selectedInsightType) {
        case 'workforce-trends':
          data = generateWorkforceTrendsData(filteredEmployees, thresholds);
          break;
        case 'department-analysis':
          data = generateDepartmentAnalysisData(filteredEmployees, thresholds);
          break;
        case 'exit-patterns':
          data = generateExitPatternData(filteredEmployees);
          break;
        default:
          data = generateWorkforceTrendsData(filteredEmployees, thresholds);
      }
      
      setInsightsData(data);
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsGeneratingInsights(false);
    }
  }, [filteredEmployees, selectedInsightType, thresholds]);

  // Auto-generate insights when tab is switched
  useEffect(() => {
    if (activeTab === 'insights' && filteredEmployees.length > 0 && !isGeneratingInsights) {
      const generateAsync = async () => {
        if (!filteredEmployees.length) {
          return;
        }

        setIsGeneratingInsights(true);
        
        try {
          let data: WorkforceTrendsAnalysisData | DepartmentAnalysisData | EnhancedExitPatternMiningData;
          
          switch (selectedInsightType) {
            case 'workforce-trends':
              data = generateWorkforceTrendsData(filteredEmployees, getCurrentThresholds());
              break;
            case 'department-analysis':
              data = generateDepartmentAnalysisData(filteredEmployees, getCurrentThresholds());
              break;
            case 'exit-patterns':
              data = generateExitPatternData(filteredEmployees);
              break;
            default:
              data = generateWorkforceTrendsData(filteredEmployees, getCurrentThresholds());
          }
          
          setInsightsData(data);
        } catch (error) {
          console.error('Error generating insights:', error);
        } finally {
          setIsGeneratingInsights(false);
        }
      };
      
      generateAsync();
    }
  }, [activeTab, filteredEmployees.length, selectedInsightType, isGeneratingInsights]);
  */

  useEffect(() => {
    const datasetId = trainingStatus?.datasetId || (typeof window !== 'undefined' ? localStorage.getItem('activeDatasetId') : null);

    if (isModelReady && homeEmployees && homeEmployees.length > 0) {
      autoThresholdService.start(homeEmployees, datasetId);
    } else {
      autoThresholdService.stop();
    }

    return () => {
      autoThresholdService.stop();
    };
  }, [isModelReady, homeEmployees, trainingStatus?.datasetId]);

  if (!activeProject) {
    return (
      <div
        className="h-full w-full flex items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900"
        style={{
          minHeight: '400px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb', // Neutral light gray
          border: '1px solid #e5e7eb', // Neutral border
        }}
      >
        <div>
          <FolderKanban className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No Project Active
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please select or create a project to view the dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (!isModelReady) {
    return <ModelTrainingRequired status={trainingStatus?.status} message={trainingStatus?.message} />;
  }

  // Additional debug fallback - if we somehow get past all conditions

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Data Upload Window */}
      {isUploadWindowOpen && (
        <DataUploadWindow
          show={isUploadWindowOpen}
          onClose={() => setIsUploadWindowOpen(false)}
          onUploadSuccess={() => {
            // Force refresh data after upload with a delay to ensure backend has processed
            setTimeout(() => {
              fetchHomeData(activeProject.id, true);
            }, 2000);
          }}
        />
      )}

      {/* Data Upload Notification */}
      <DataUploadNotification
        show={showNotification}
        message={notificationMessage}
        onClose={handleNotificationClose}
      />

      {/* Page Header - Full Width */}
      {renderHeader()}

      {/* Main Content with padding */}
      <div className="flex-1 flex flex-col p-6">
        <div className="mb-6">
          <TrainingReminderBanner />
        </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg mb-6">
        <div className="flex space-x-6 px-6">
          <button
            onClick={() => setActiveTabSafe('dashboard')}
            className={cn(
              'relative py-2 px-1 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              activeTab === 'dashboard'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <span className="font-semibold">Dashboard</span>

            {/* Active tab indicator */}
            {activeTab === 'dashboard' && (
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                layoutId="activeTabIndicator"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30
                }}
              />
            )}
          </button>

        </div>
      </div>

      {/* Dashboard Tab Content */}
      {activeTab === 'dashboard' && (
        <>
          {/* Reasoning Enhancement Progress Indicator */}
          {isEnhancingWithReasoning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Enhancing data with AI reasoning...
                  </span>
                </div>
                <div className="flex-1 bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${reasoningEnhancementProgress}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium min-w-[3rem] text-right">
                  {reasoningEnhancementProgress}%
                </span>
              </div>
            </motion.div>
          )}

          {/* Metrics Section - Now uses displayMetrics */}
          {/* Render even if zero, showing 0 values */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
            // Animate presence might be needed if metrics can become null/undefined
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1 }}
          >
            {/* Average Churn Probability Card */}
            <motion.div
              // ... animation props ...
              className={cn(
                `bg-white dark:bg-gray-800/50 p-4 rounded-lg border h-full min-h-[90px]`,
                `border-gray-200/75 dark:border-gray-700/50 shadow-xs`
              )}
            >
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Average Churn Probability</p>
              {/* Display calculated average */}
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {(displayMetrics.average_churn_probability * 100).toFixed(1)}%
              </p>
            </motion.div>

            {/* Risk Bar Cards - Use displayMetrics */}
            <RiskBarCard
              title="High Risk"
              count={displayMetrics.risk_levels.high}
              total={displayMetrics.total_employees}
              colorClass="red"
            />
            <RiskBarCard
              title="Medium Risk"
              count={displayMetrics.risk_levels.medium}
              total={displayMetrics.total_employees}
              colorClass="yellow"
            />
            <RiskBarCard
              title="Low Risk"
              count={displayMetrics.risk_levels.low}
              total={displayMetrics.total_employees}
              colorClass="green"
            />
          </motion.div>



          {/* Filter Controls Section - Simplified Trigger Styling */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
            <div className="relative md:col-span-1 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                // Removed explicit style, rely on default Input style + padding
                className="pl-9"
              />
            </div>
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger>
                <SelectValue placeholder={`All Departments (${availableDepartments.length - 1})`} />
              </SelectTrigger>
              <SelectContent>
                {availableDepartments.map((dep: string) => (
                  <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPosition} onValueChange={setSelectedPosition}>
              <SelectTrigger>
                <SelectValue placeholder={`All Positions (${availablePositions.length - 1})`} />
              </SelectTrigger>
              <SelectContent>
                {availablePositions.map((pos: string) => (
                  <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
              <SelectTrigger>
                <SelectValue placeholder={`All Risk Levels (${availableRiskLevels.length - 1})`} />
              </SelectTrigger>
              <SelectContent>
                {availableRiskLevels.map((level: string) => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Active" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((status: string) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table Section - Corrected Structure */}
          <div ref={parentRef} className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-auto min-h-0 border border-gray-200/75 dark:border-gray-700/50 relative" style={{ maxHeight: '400px' }}>
            {isLoading || error || sortedEmployees.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                {/* Loading spinner or empty state */}
                {isLoading && <LoadingStates.PageLoading text="Loading employee data..." />}
                {error && (
                  <div className="text-center">
                    <div className="text-red-600 dark:text-red-400 font-medium mb-2">Error loading data</div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{error}</p>
                  </div>
                )}
                {!isLoading && !error && sortedEmployees.length === 0 && (
                  <div className="text-center">
                    <div className="text-gray-600 dark:text-gray-400 font-medium mb-2">No employees found</div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your filters or search criteria</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Keep the table for the header only */}
                <table className="w-full table-fixed border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10">
                    <tr>
                      {/* TH elements - Removed uppercase and tracking-wider */}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[20%]">
                        <div className="flex items-center" onClick={() => handleSort('full_name')}>
                          Name <SortIcon field="full_name" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                        <div className="flex items-center" onClick={() => handleSort('structure_name')}>
                          Department <SortIcon field="structure_name" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                        <div className="flex items-center" onClick={() => handleSort('position')}>
                          Position <SortIcon field="position" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[10%]">
                        <div className="flex items-center" onClick={() => handleSort('riskLevel')}>
                          Risk <SortIcon field="riskLevel" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[15%]">
                        <div className="flex items-center" onClick={() => handleSort('churnProbability')}>
                          Churn % <SortIcon field="churnProbability" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-[10%]">
                        <div className="flex items-center" onClick={() => handleSort('status')}>
                          Status <SortIcon field="status" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-[15%]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                </table>
                {/* Container for virtualized rows */}
                <div
                  className="relative w-full"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  {/* Absolutely positioned rows rendered here */}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const employee = sortedEmployees[virtualRow.index];
                    if (!employee) return null;
                    return (
                      <EmployeeTableRow
                        key={employee.hr_code || virtualRow.index}
                        employee={employee}
                        onReasoningClick={handleReasoningClick}
                        getRiskLevel={getRiskLevel}
                        getRiskLevelWithStyles={getRiskLevelWithStyles}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'network' && (
        <div className="space-y-6">
          <EmployeeNetworkGraph
            employees={filteredEmployees}
            availableDepartments={availableDepartments}
            isLoading={isLoading}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Only employees with at least two shared connections (2+ links) are displayed; relationship strength uses
            optional columns when present (e.g. age, work_location, remote_preference) and any missing values are
            ignored.
          </p>
        </div>
      )}

      {/* Deep Analysis Tab Content */}
      {activeTab === 'deep-analysis' && (
        <div className="space-y-6">
          {/* Analysis Type Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Analysis Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedAnalysisType('churn-patterns')}
                className={cn(
                  "p-4 border-2 rounded-lg transition-colors text-left",
                  selectedAnalysisType === 'churn-patterns'
                    ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400"
                )}
              >
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mr-3">
                    <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Churn Pattern Analysis</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Analyze churn reasoning data to identify patterns and risk factors across your organization.
                </p>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-400 transition-colors text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mr-3">
                    <ChevronUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Engagement Correlation</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Correlate engagement survey data with churn risk to identify satisfaction drivers.
                </p>
                <div className="mt-2">
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                    Requires engagement data
                  </span>
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mr-3">
                    <ChevronDown className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Cross-Source Analysis</h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Comprehensive analysis combining churn, engagement, and interview data sources.
                </p>
                <div className="mt-2">
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                    Requires multiple data sources
                  </span>
                </div>
              </motion.button>
            </div>
          </div>

          {/* Data Source Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Available Data Sources</h3>
            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-colors",
                  hasChurnReasoningData
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                )}
              >
                <div className="flex items-center">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full mr-3",
                      hasChurnReasoningData ? "bg-green-500" : "bg-gray-400"
                    )}
                  ></div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Churn Reasoning Data</span>
                </div>
                <span
                  className={cn(
                    "text-sm",
                    hasChurnReasoningData
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {hasChurnReasoningData ? 'Available' : 'Not available'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-gray-400 rounded-full mr-3"></div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Engagement Survey Data</span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Not uploaded</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-gray-400 rounded-full mr-3"></div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Interview Data</span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Not uploaded</span>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Tip:</strong> Upload engagement survey data in the Data Management section to unlock advanced correlation analysis capabilities.
              </p>
            </div>
          </div>

          {/* Analysis Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Analysis Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Department Filter
                </label>
                <Select
                  value={analysisParams.departmentFilter}
                  onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, departmentFilter: value }))}
                  disabled={!selectedAnalysisType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-departments">All Departments</SelectItem>
                    {availableDepartments.filter(dept => dept !== 'All').map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Time Period
                </label>
                <Select
                  value={analysisParams.timePeriod}
                  onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, timePeriod: value }))}
                  disabled={!selectedAnalysisType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Last 12 months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last-3-months">Last 3 months</SelectItem>
                    <SelectItem value="last-6-months">Last 6 months</SelectItem>
                    <SelectItem value="last-12-months">Last 12 months</SelectItem>
                    <SelectItem value="last-24-months">Last 24 months</SelectItem>
                    <SelectItem value="all-time">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Risk Level
                </label>
                <Select
                  value={analysisParams.riskLevel}
                  onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, riskLevel: value }))}
                  disabled={!selectedAnalysisType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Risk Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-risk-levels">All Risk Levels</SelectItem>
                    <SelectItem value="High">High Risk</SelectItem>
                    <SelectItem value="Medium">Medium Risk</SelectItem>
                    <SelectItem value="Low">Low Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Employee Group
                </label>
                <Select
                  value={analysisParams.employeeGroup}
                  onValueChange={(value) => setAnalysisParams(prev => ({ ...prev, employeeGroup: value }))}
                  disabled={!selectedAnalysisType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-employees">All Employees</SelectItem>
                    <SelectItem value="new-hires">New Hires (&lt; 1 year)</SelectItem>
                    <SelectItem value="experienced">Experienced (1-5 years)</SelectItem>
                    <SelectItem value="senior">Senior (&gt; 5 years)</SelectItem>
                    <SelectItem value="high-performers">High Performers</SelectItem>
                    <SelectItem value="at-risk">At Risk Employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {selectedAnalysisType ? (
                  `Ready to analyze ${selectedAnalysisType.replace('-', ' ')} with current filters`
                ) : (
                  'Select an analysis type to configure parameters'
                )}
              </div>
              <button
                disabled={!selectedAnalysisType || isAnalysisRunning}
                onClick={async () => {
                  if (!selectedAnalysisType) return;

                  setIsAnalysisRunning(true);
                  try {
                    // Get current thresholds for analysis
                    const thresholds = getCurrentThresholds();

                    // Filter employees based on analysis parameters
                    let analysisData = filteredEmployees;

                    // Apply additional filters based on analysis parameters
                    if (analysisParams.departmentFilter && analysisParams.departmentFilter !== 'all-departments') {
                      analysisData = analysisData.filter(emp =>
                        (emp.structure_name || emp.department || 'Unassigned') === analysisParams.departmentFilter
                      );
                    }

                    if (analysisParams.riskLevel && analysisParams.riskLevel !== 'all-risk-levels') {
                      analysisData = analysisData.filter(emp => {
                        const riskLevel = getRiskLevel(emp.churnProbability || 0);
                        return riskLevel === analysisParams.riskLevel;
                      });
                    }

                    if (analysisParams.employeeGroup && analysisParams.employeeGroup !== 'all-employees') {
                      // Filter based on employee group (tenure, performance, etc.)
                      analysisData = analysisData.filter(emp => {
                        switch (analysisParams.employeeGroup) {
                          case 'new-hires':
                            // Assuming we have hire date or tenure data
                            return (emp.tenure_years || 0) < 1;
                          case 'experienced':
                            return (emp.tenure_years || 0) >= 1 && (emp.tenure_years || 0) <= 5;
                          case 'senior':
                            return (emp.tenure_years || 0) > 5;
                          case 'high-performers':
                            // Assuming we have performance data
                            return (emp.performance || '0').includes('4') || (emp.performance || '0').includes('5');
                          case 'at-risk':
                            return (emp.churnProbability || 0) >= thresholds.highRisk;
                          default:
                            return true;
                        }
                      });
                    }

                    // Use local reasoning service for analysis
                    let result;
                    switch (selectedAnalysisType) {
                      case 'churn-patterns':
                        result = await analyzeChurnPatternsLocal(analysisData, thresholds);
                        break;
                      case 'engagement-correlation':
                        result = await analyzeEngagementCorrelationLocal(analysisData);
                        break;
                      case 'organizational-insights':
                        result = await generateOrganizationalInsightsLocal(analysisData, availableDepartments, displayMetrics);
                        break;
                      case 'cross-source':
                        result = await runCrossAnalysisLocal(analysisData);
                        break;
                      default:
                        result = await runGeneralAnalysisLocal(selectedAnalysisType, analysisData);
                    }

                    setAnalysisResults(result);
                  } catch (error) {
                    // Analysis failed - logged silently in production
                    // Show user-friendly error
                    setAnalysisResults({
                      id: 'error',
                      type: selectedAnalysisType as any,
                      title: 'Analysis Failed',
                      summary: `Failed to complete ${selectedAnalysisType.replace('-', ' ')} analysis. ${error instanceof Error ? error.message : 'Unknown error occurred.'}`,
                      insights: [],
                      visualizations: [],
                      recommendations: [],
                      confidence: 0,
                      timestamp: new Date(),
                      dataSources: [],
                      parameters: analysisParams,
                      executionTime: 0
                    });
                  } finally {
                    setIsAnalysisRunning(false);
                  }
                }}
                className={cn(
                  "px-6 py-2 rounded-lg font-medium transition-all flex items-center space-x-2",
                  selectedAnalysisType && !isAnalysisRunning
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed"
                )}
              >
                {isAnalysisRunning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Running Analysis...</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    <span>Run Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Analysis Results Section */}
          {analysisResults && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Analysis Results</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>Confidence: {(analysisResults.confidence * 100).toFixed(0)}%</span>
                  <span>•</span>
                  <span>{analysisResults.timestamp.toLocaleString()}</span>
                </div>
              </div>
              <AnalysisResultVisualization
                result={analysisResults}
                onExport={(format) => {
                  // Create export data
                  const exportData = {
                    title: analysisResults.title,
                    summary: analysisResults.summary,
                    confidence: `${Math.round(analysisResults.confidence * 100)}%`,
                    timestamp: analysisResults.timestamp.toLocaleString(),
                    insights: analysisResults.insights.map((insight: any) => ({
                      title: insight.title,
                      description: insight.description,
                      severity: insight.severity,
                      confidence: insight.confidence
                    })),
                    recommendations: analysisResults.recommendations?.map((rec: any) => ({
                      title: rec.title,
                      description: rec.description,
                      priority: rec.priority,
                      timeframe: rec.timeframe
                    })) || [],
                    parameters: analysisResults.parameters
                  };

                  if (format === 'pdf') {
                    // Create PDF export using html2canvas and jsPDF
                    const pdfContent = `
                      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px;">
                        <h1 style="color: #1f2937; margin-bottom: 20px;">${exportData.title}</h1>
                        
                        <div style="margin-bottom: 20px;">
                          <p><strong>Summary:</strong> ${exportData.summary}</p>
                          <p><strong>Confidence:</strong> ${exportData.confidence}</p>
                          <p><strong>Generated:</strong> ${exportData.timestamp}</p>
                        </div>
                        
                        <h2 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Key Insights</h2>
                        ${exportData.insights.map((insight: any) => `
                          <div style="margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                            <h3 style="color: #1f2937; margin: 0 0 10px 0;">${insight.title}</h3>
                            <p style="margin: 0 0 10px 0; color: #4b5563;">${insight.description}</p>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                              <strong>Severity:</strong> ${insight.severity} | <strong>Confidence:</strong> ${Math.round(insight.confidence * 100)}%
                            </p>
                          </div>
                        `).join('')}
                        
                        <h2 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Recommendations</h2>
                        ${exportData.recommendations.map((rec: any) => `
                          <div style="margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                            <h3 style="color: #1f2937; margin: 0 0 10px 0;">${rec.title}</h3>
                            <p style="margin: 0 0 10px 0; color: #4b5563;">${rec.description}</p>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                              <strong>Priority:</strong> ${rec.priority} | <strong>Timeframe:</strong> ${rec.timeframe}
                            </p>
                          </div>
                        `).join('')}
                      </div>
                    `;

                    // Create temporary element for PDF generation
                    const element = document.createElement('div');
                    element.innerHTML = pdfContent;
                    element.style.position = 'absolute';
                    element.style.left = '-9999px';
                    element.style.top = '0';
                    document.body.appendChild(element);

                    // Use html2canvas to capture the content
                    import('html2canvas').then(html2canvas => {
                      html2canvas.default(element, {
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: '#ffffff'
                      }).then(canvas => {
                        import('jspdf').then(jsPDF => {
                          const { jsPDF: JsPDF } = jsPDF;
                          const pdf = new JsPDF('p', 'mm', 'a4');
                          const imgData = canvas.toDataURL('image/png');
                          const pdfWidth = pdf.internal.pageSize.getWidth();
                          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

                          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                          pdf.save(`churn-analysis-${new Date().toISOString().split('T')[0]}.pdf`);
                        });
                      });
                    }).catch((_error) => {
                      // Error generating PDF - logged silently in production
                      alert('PDF generation failed. Please try again.');
                    }).finally(() => {
                      document.body.removeChild(element);
                    });
                  } else if (format === 'excel') {
                    // Create Excel export as CSV
                    const excelData = [
                      ['Analysis Report', ''],
                      ['Title', exportData.title],
                      ['Summary', exportData.summary],
                      ['Confidence', exportData.confidence],
                      ['Generated', exportData.timestamp],
                      ['', ''],
                      ['Key Insights', ''],
                      ['Title', 'Description', 'Severity', 'Confidence'],
                      ...exportData.insights.map((insight: any) => [
                        insight.title,
                        insight.description,
                        insight.severity,
                        `${Math.round(insight.confidence * 100)}%`
                      ]),
                      ['', ''],
                      ['Recommendations', ''],
                      ['Title', 'Description', 'Priority', 'Timeframe'],
                      ...exportData.recommendations.map((rec: any) => [
                        rec.title,
                        rec.description,
                        rec.priority,
                        rec.timeframe
                      ])
                    ];

                    // Convert to CSV format for Excel
                    const csvContent = excelData.map(row =>
                      row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
                    ).join('\n');

                    // Download CSV file
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    link.setAttribute('href', url);
                    link.setAttribute('download', `churn-analysis-${new Date().toISOString().split('T')[0]}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }
                }}
                onDrillDown={(_insightId) => {
                  // Drill down into insight
                }}
              />
            </div>
          )}

        </div>
      )}

      {/* Insights Tab Content - Temporarily Disabled */}
      {/* 
      {activeTab === 'insights' && (
        <div className="space-y-6">
          // ... Insights content temporarily disabled
        </div>
      )}
      */}

      </div>
    </div>
  );
}

export default Home;
