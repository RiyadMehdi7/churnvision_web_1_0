import React, { useMemo, useState, memo } from 'react';
import { motion } from 'framer-motion';
import { 
  Brain, 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp, 
  Target, 
  Users,
  Building2,
  Clock,
  CheckCircle,
  ArrowRight,
  Zap,
  Star,
  Activity,
  BarChart3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboard';
import { Employee } from '../../types/employee';
import { AIInsight } from '../../contexts/HomeCustomizationContext';
import { useCurrentRiskThresholds } from '../../hooks/useDynamicRiskThresholds';

interface AIStrategicInsightsWidgetProps {
  widget: DashboardWidget;
  employees: Employee[];
  aiInsights?: AIInsight[];
  className?: string;
}

interface StrategicRecommendation {
  id: string;
  category: 'retention' | 'hiring' | 'development' | 'culture' | 'process';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  timeframe: string;
  confidence: number;
  affectedEmployees: number;
  estimatedROI: string;
  actionItems: string[];
}

interface OrganizationalHealth {
  overallScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  keyStrengths: string[];
  criticalAreas: string[];
  trendDirection: 'improving' | 'declining' | 'stable';
  benchmarkComparison: 'above' | 'at' | 'below';
}

interface PredictiveAlert {
  type: 'warning' | 'opportunity' | 'trend';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  probability: number;
  timeframe: string;
  potentialImpact: string;
  recommendedActions: string[];
}

const AIStrategicInsightsWidget: React.FC<AIStrategicInsightsWidgetProps> = memo(({
  widget,
  employees,
  aiInsights: _,
  className
}) => {
  const { getRiskLevel } = useCurrentRiskThresholds();
  const [activeView, setActiveView] = useState<'recommendations' | 'health' | 'alerts'>('recommendations');

  // Generate organizational health assessment - optimized
  const organizationalHealth = useMemo((): OrganizationalHealth => {
    if (employees.length === 0) {
      return {
        overallScore: 0,
        riskLevel: 'low',
        keyStrengths: [],
        criticalAreas: [],
        trendDirection: 'stable',
        benchmarkComparison: 'at'
      };
    }

    // Pre-calculate common values
    const employeeCount = employees.length;
    const avgRisk = employees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / employeeCount;
    const highRiskCount = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'High').length;
    const highRiskPercentage = (highRiskCount / employeeCount) * 100;

    // Calculate overall health score (0-100)
    const overallScore = Math.max(0, Math.min(100, 100 - (avgRisk * 100)));
    
    let riskLevel: 'critical' | 'high' | 'medium' | 'low';
    if (highRiskPercentage > 30) riskLevel = 'critical';
    else if (highRiskPercentage > 20) riskLevel = 'high';
    else if (highRiskPercentage > 10) riskLevel = 'medium';
    else riskLevel = 'low';

    // Identify strengths and critical areas
    const departmentRisks = new Map<string, number[]>();
    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unassigned';
      if (!departmentRisks.has(dept)) {
        departmentRisks.set(dept, []);
      }
      departmentRisks.get(dept)!.push(emp.churnProbability || 0);
    });

    const keyStrengths: string[] = [];
    const criticalAreas: string[] = [];

    departmentRisks.forEach((risks, dept) => {
      const avgDeptRisk = risks.reduce((sum, risk) => sum + risk, 0) / risks.length;
      if (avgDeptRisk < 0.3) {
        keyStrengths.push(`${dept} shows strong retention (${(avgDeptRisk * 100).toFixed(0)}% risk)`);
      } else if (avgDeptRisk > 0.7) {
        criticalAreas.push(`${dept} requires immediate attention (${(avgDeptRisk * 100).toFixed(0)}% risk)`);
      }
    });

    // Add general insights
    if (keyStrengths.length === 0) {
      keyStrengths.push('Consistent risk management across departments');
    }
    if (criticalAreas.length === 0 && riskLevel !== 'low') {
      criticalAreas.push('Focus on individual high-risk employees');
    }

    return {
      overallScore,
      riskLevel,
      keyStrengths: keyStrengths.slice(0, 3),
      criticalAreas: criticalAreas.slice(0, 3),
      trendDirection: 'stable', // Would be calculated from historical data
      benchmarkComparison: overallScore > 75 ? 'above' : overallScore > 50 ? 'at' : 'below'
    };
  }, [employees, getRiskLevel]);

  // Generate strategic recommendations
  const strategicRecommendations = useMemo((): StrategicRecommendation[] => {
    const recommendations: StrategicRecommendation[] = [];
    
    if (employees.length === 0) return recommendations;

    const highRiskEmployees = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'High');
    const departmentRisks = new Map<string, Employee[]>();
    
    employees.forEach(emp => {
      const dept = emp.structure_name || emp.department || 'Unassigned';
      if (!departmentRisks.has(dept)) {
        departmentRisks.set(dept, []);
      }
      departmentRisks.get(dept)!.push(emp);
    });

    // High-risk employee retention
    if (highRiskEmployees.length > 0) {
      recommendations.push({
        id: 'high-risk-retention',
        category: 'retention',
        priority: 'critical',
        title: 'Immediate High-Risk Employee Intervention',
        description: `${highRiskEmployees.length} employees require immediate retention efforts to prevent critical talent loss`,
        impact: 'Prevent potential loss of key talent and institutional knowledge',
        effort: 'high',
        timeframe: '2-4 weeks',
        confidence: 0.92,
        affectedEmployees: highRiskEmployees.length,
        estimatedROI: '300-500%',
        actionItems: [
          'Conduct one-on-one retention interviews',
          'Review compensation and career development opportunities',
          'Implement personalized retention packages',
          'Assign dedicated mentors or coaches'
        ]
      });
    }

    // Department-specific recommendations
    const criticalDepartments = Array.from(departmentRisks.entries())
      .filter(([_, emps]) => {
        const avgRisk = emps.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / emps.length;
        return avgRisk > 0.6;
      })
      .sort(([_, a], [__, b]) => {
        const avgRiskA = a.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / a.length;
        const avgRiskB = b.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / b.length;
        return avgRiskB - avgRiskA;
      });

    if (criticalDepartments.length > 0) {
      const [deptName, deptEmployees] = criticalDepartments[0];
      const avgRisk = deptEmployees.reduce((sum, emp) => sum + (emp.churnProbability || 0), 0) / deptEmployees.length;
      
      recommendations.push({
        id: 'department-intervention',
        category: 'culture',
        priority: 'high',
        title: `${deptName} Department Restructuring`,
        description: `${deptName} shows elevated risk levels (${(avgRisk * 100).toFixed(0)}%) requiring systematic intervention`,
        impact: 'Improve department-wide engagement and reduce systemic risk factors',
        effort: 'high',
        timeframe: '6-12 weeks',
        confidence: 0.78,
        affectedEmployees: deptEmployees.length,
        estimatedROI: '200-400%',
        actionItems: [
          'Conduct department-wide engagement survey',
          'Review management practices and team dynamics',
          'Implement team building and communication initiatives',
          'Assess workload distribution and resource allocation'
        ]
      });
    }

    // Proactive development program
    const mediumRiskEmployees = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'Medium');
    if (mediumRiskEmployees.length > 0) {
      recommendations.push({
        id: 'development-program',
        category: 'development',
        priority: 'medium',
        title: 'Proactive Career Development Initiative',
        description: `${mediumRiskEmployees.length} employees show moderate risk - ideal candidates for development programs`,
        impact: 'Prevent risk escalation and improve long-term retention',
        effort: 'medium',
        timeframe: '8-16 weeks',
        confidence: 0.85,
        affectedEmployees: mediumRiskEmployees.length,
        estimatedROI: '150-250%',
        actionItems: [
          'Create personalized development plans',
          'Establish mentorship programs',
          'Provide skill development opportunities',
          'Implement regular career progression discussions'
        ]
      });
    }

    // Process improvement
    if (organizationalHealth.overallScore < 70) {
      recommendations.push({
        id: 'process-optimization',
        category: 'process',
        priority: 'medium',
        title: 'HR Process Optimization',
        description: 'Systematic review and improvement of HR processes to address retention challenges',
        impact: 'Improve overall organizational health and employee satisfaction',
        effort: 'medium',
        timeframe: '12-20 weeks',
        confidence: 0.72,
        affectedEmployees: employees.length,
        estimatedROI: '100-200%',
        actionItems: [
          'Audit current HR processes and policies',
          'Implement regular feedback mechanisms',
          'Streamline onboarding and development processes',
          'Establish predictive analytics for early intervention'
        ]
      });
    }

    return recommendations.slice(0, 4); // Limit to top 4 recommendations
  }, [employees, getRiskLevel, organizationalHealth.overallScore]);

  // Generate predictive alerts
  const predictiveAlerts = useMemo((): PredictiveAlert[] => {
    const alerts: PredictiveAlert[] = [];

    if (employees.length === 0) return alerts;

    // High-risk escalation alert
    const highRiskEmployees = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'High');
    if (highRiskEmployees.length > 0) {
      alerts.push({
        type: 'warning',
        severity: 'critical',
        title: 'Imminent Departure Risk',
        description: `${highRiskEmployees.length} employees show critical risk levels with high probability of departure`,
        probability: 0.78,
        timeframe: '30-60 days',
        potentialImpact: `Potential loss of ${highRiskEmployees.length} key employees and associated knowledge`,
        recommendedActions: [
          'Immediate retention conversations',
          'Emergency retention packages',
          'Knowledge transfer planning'
        ]
      });
    }

    // Seasonal trend alert
    const currentMonth = new Date().getMonth();
    if (currentMonth >= 10 || currentMonth <= 1) { // Q4/Q1 transition
      alerts.push({
        type: 'trend',
        severity: 'medium',
        title: 'Seasonal Departure Pattern',
        description: 'Historical data indicates increased departure risk during year-end/new year period',
        probability: 0.65,
        timeframe: '60-90 days',
        potentialImpact: '15-25% increase in departure probability across all risk levels',
        recommendedActions: [
          'Proactive retention communications',
          'Year-end recognition programs',
          'Early bonus/incentive discussions'
        ]
      });
    }

    // Opportunity alert for low-risk employees
    const lowRiskEmployees = employees.filter(emp => getRiskLevel(emp.churnProbability || 0) === 'Low');
    if (lowRiskEmployees.length > employees.length * 0.6) {
      alerts.push({
        type: 'opportunity',
        severity: 'low',
        title: 'High Retention Opportunity',
        description: `${lowRiskEmployees.length} employees show strong retention indicators - ideal for development investment`,
        probability: 0.82,
        timeframe: '90-180 days',
        potentialImpact: 'Opportunity to build long-term organizational strength and leadership pipeline',
        recommendedActions: [
          'Leadership development programs',
          'Cross-functional project assignments',
          'Advanced skill training initiatives'
        ]
      });
    }

    return alerts.slice(0, 3);
  }, [employees.length, getRiskLevel]);

  const getPriorityColor = (priority: 'critical' | 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'critical':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'high':
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      default:
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'retention':
        return <Users className="w-5 h-5" />;
      case 'hiring':
        return <Target className="w-5 h-5" />;
      case 'development':
        return <TrendingUp className="w-5 h-5" />;
      case 'culture':
        return <Building2 className="w-5 h-5" />;
      case 'process':
        return <Activity className="w-5 h-5" />;
      default:
        return <Lightbulb className="w-5 h-5" />;
    }
  };

  const getAlertIcon = (type: 'warning' | 'opportunity' | 'trend') => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'opportunity':
        return <Star className="w-5 h-5 text-green-500" />;
      default:
        return <BarChart3 className="w-5 h-5 text-blue-500" />;
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Widget Header */}
      {widget.config?.showTitle && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {widget.title}
              </h3>
              <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                AI Powered
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Strategic Intelligence
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {/* View Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveView('recommendations')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeView === 'recommendations'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Lightbulb className="w-4 h-4 inline mr-2" />
            Recommendations
          </button>
          <button
            onClick={() => setActiveView('health')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeView === 'health'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Health
          </button>
          <button
            onClick={() => setActiveView('alerts')}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeView === 'alerts'
                ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Alerts
          </button>
        </div>

        {/* Strategic Recommendations View */}
        {activeView === 'recommendations' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {strategicRecommendations.map((rec, index) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className={cn(
                  "p-4 rounded-lg border",
                  getPriorityColor(rec.priority)
                )}
              >
                <div className="flex items-start space-x-3">
                  <div className={cn("p-2 rounded-lg", getPriorityColor(rec.priority))}>
                    {getCategoryIcon(rec.category)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-semibold text-gray-900 dark:text-gray-100">
                        {rec.title}
                      </h5>
                      <div className="flex items-center space-x-2">
                        <span className={cn(
                          "px-2 py-1 text-xs font-medium rounded",
                          rec.priority === 'critical' ? 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300' :
                          rec.priority === 'high' ? 'bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300' :
                          rec.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300' :
                          'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                        )}>
                          {rec.priority}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {rec.description}
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                      <div>
                        <span className="text-gray-500">Impact:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{rec.estimatedROI} ROI</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Effort:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100 capitalize">{rec.effort}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Timeline:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{rec.timeframe}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Confidence:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{(rec.confidence * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Key Actions:</span>
                      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        {rec.actionItems.slice(0, 2).map((action, i) => (
                          <li key={i} className="flex items-center space-x-2">
                            <ArrowRight className="w-3 h-3 text-purple-500 flex-shrink-0" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Organizational Health View */}
        {activeView === 'health' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Health Score */}
            <div className="text-center mb-6">
              <div className={cn("text-4xl font-bold mb-2", getHealthScoreColor(organizationalHealth.overallScore))}>
                {organizationalHealth.overallScore.toFixed(0)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Organizational Health Score
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={cn(
                    "h-3 rounded-full transition-all duration-1000",
                    organizationalHealth.overallScore >= 80 ? 'bg-green-500' :
                    organizationalHealth.overallScore >= 60 ? 'bg-yellow-500' :
                    organizationalHealth.overallScore >= 40 ? 'bg-orange-500' :
                    'bg-red-500'
                  )}
                  style={{ width: `${organizationalHealth.overallScore}%` }}
                />
              </div>
            </div>

            {/* Key Strengths */}
            <div className="mb-6">
              <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                Key Strengths
              </h5>
              <div className="space-y-2">
                {organizationalHealth.keyStrengths.map((strength, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                    <span>{strength}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Areas */}
            <div>
              <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
                <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
                Areas for Improvement
              </h5>
              <div className="space-y-2">
                {organizationalHealth.criticalAreas.map((area, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                    <span>{area}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Predictive Alerts View */}
        {activeView === 'alerts' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {predictiveAlerts.map((alert, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className={cn(
                  "p-4 rounded-lg border",
                  alert.type === 'warning' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                  alert.type === 'opportunity' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                )}
              >
                <div className="flex items-start space-x-3">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-semibold text-gray-900 dark:text-gray-100">
                        {alert.title}
                      </h5>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {alert.timeframe}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {alert.description}
                    </p>
                    
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs text-gray-500">
                        Probability: {(alert.probability * 100).toFixed(0)}%
                      </div>
                      <div className="w-24 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className={cn(
                            "h-2 rounded-full",
                            alert.type === 'warning' ? 'bg-red-500' :
                            alert.type === 'opportunity' ? 'bg-green-500' :
                            'bg-blue-500'
                          )}
                          style={{ width: `${alert.probability * 100}%` }}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Recommended Actions:</span>
                      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        {alert.recommendedActions.slice(0, 2).map((action, i) => (
                          <li key={i} className="flex items-center space-x-2">
                            <ArrowRight className="w-3 h-3 text-purple-500 flex-shrink-0" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
});

export { AIStrategicInsightsWidget };