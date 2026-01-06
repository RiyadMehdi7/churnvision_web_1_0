import React, { useState } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Users,
  Calculator,
  ChevronDown,
  ChevronRight,
  X,
  Lightbulb,
} from 'lucide-react';
import { useEmployeeReasoning } from '@/hooks/useReasoning';
import { MLContributor, HeuristicAlert } from '@/types/reasoning';
import { getCurrentThresholds } from '@/config/riskThresholds';

interface ReasoningDashboardProps {
  hrCode: string;
  employeeName: string;
  onClose?: () => void;
  isPerformanceMode?: boolean;
}

// Feature explanations - what each factor means and why it matters
const FEATURE_INFO: Record<string, { name: string; highMeaning: string; lowMeaning: string }> = {
  satisfaction_level: {
    name: 'Job Satisfaction',
    highMeaning: 'Low satisfaction is often a leading indicator of departure',
    lowMeaning: 'High satisfaction suggests strong engagement with work'
  },
  last_evaluation: {
    name: 'Performance Review',
    highMeaning: 'Performance issues may indicate role mismatch or disengagement',
    lowMeaning: 'Strong performance suggests good fit and motivation'
  },
  number_project: {
    name: 'Project Workload',
    highMeaning: 'Too many or too few projects can lead to burnout or boredom',
    lowMeaning: 'Balanced workload indicates sustainable pace'
  },
  average_monthly_hours: {
    name: 'Monthly Hours',
    highMeaning: 'Unusual hours may signal overwork or underutilization',
    lowMeaning: 'Normal hours indicate healthy work-life balance'
  },
  time_spend_company: {
    name: 'Tenure',
    highMeaning: 'Certain tenure periods have historically higher turnover',
    lowMeaning: 'This tenure range shows strong retention historically'
  },
  work_accident: {
    name: 'Workplace Safety',
    highMeaning: 'Past incidents may affect engagement and trust',
    lowMeaning: 'Clean safety record is a positive indicator'
  },
  promotion_last_5years: {
    name: 'Career Progression',
    highMeaning: 'Lack of advancement may cause frustration',
    lowMeaning: 'Recent promotion indicates career growth'
  },
  salary_level: {
    name: 'Compensation',
    highMeaning: 'Pay concerns may be driving dissatisfaction',
    lowMeaning: 'Competitive compensation supports retention'
  },
  department: {
    name: 'Department',
    highMeaning: 'This department has higher historical turnover',
    lowMeaning: 'This department has strong retention'
  },
};

// Stage explanations with actionable insights
// Includes both tenure-based stages (from backend) and risk-based stages
const STAGE_INFO: Record<string, { description: string; action: string; urgency: 'low' | 'medium' | 'high' }> = {
  // Tenure-based stages from backend
  'Onboarding': {
    description: 'New employee in adjustment period (0-6 months). Higher turnover risk is normal during this phase.',
    action: 'Assign mentor, schedule regular check-ins, clarify role expectations',
    urgency: 'medium'
  },
  'Early Career': {
    description: 'Building skills and seeking growth (6 months - 2 years). Looking for learning opportunities.',
    action: 'Provide skill development, discuss career path, consider stretch assignments',
    urgency: 'low'
  },
  'Established': {
    description: 'Stable contributor with institutional knowledge (2-5 years). May be seeking advancement.',
    action: 'Discuss promotion timeline, provide leadership opportunities, recognize contributions',
    urgency: 'low'
  },
  'Senior': {
    description: 'Experienced professional with deep expertise (5-10 years). May seek new challenges if unchallenged.',
    action: 'Ensure meaningful projects, consider leadership roles, competitive compensation review',
    urgency: 'medium'
  },
  'Veteran': {
    description: 'Long-tenured employee (10+ years). Critical knowledge holder, may consider retirement or change.',
    action: 'Knowledge transfer planning, succession discussions, flexible arrangements',
    urgency: 'medium'
  },
  // Risk-based stages (legacy)
  'Stable': {
    description: 'Employee shows strong engagement and commitment signals.',
    action: 'Maintain regular check-ins and recognition',
    urgency: 'low'
  },
  'Early Warning': {
    description: 'Some early disengagement patterns detected. Intervention now is most effective.',
    action: 'Schedule a 1-on-1 to discuss satisfaction and goals',
    urgency: 'medium'
  },
  'At Risk': {
    description: 'Multiple warning signs present. This employee may be actively considering leaving.',
    action: 'Prioritize a retention conversation this week',
    urgency: 'high'
  },
  'Critical': {
    description: 'Strong departure indicators. Without action, departure is likely.',
    action: 'Immediate manager intervention recommended',
    urgency: 'high'
  },
};

// Get feature info with fallback
const getFeatureInfo = (feature: string) => {
  const key = feature.toLowerCase();
  return FEATURE_INFO[key] || {
    name: feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    highMeaning: 'This factor is contributing to higher risk',
    lowMeaning: 'This factor is helping reduce risk'
  };
};

// Clean card component with optional description
const Card: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, icon, children }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-50">
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <h3 className="font-medium text-gray-800">{title}</h3>
      </div>
      {description && (
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      )}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// Factor row with explanation
const FactorRow: React.FC<{
  feature: string;
  value: any;
  impact: number;
}> = ({ feature, value, impact }) => {
  const isRisk = impact > 0;
  const info = getFeatureInfo(feature);

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {isRisk ? (
            <TrendingUp className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{info.name}</span>
              <span className="text-xs text-gray-400">
                {typeof value === 'number' ? value.toFixed(2) : String(value)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isRisk ? info.highMeaning : info.lowMeaning}
            </p>
          </div>
        </div>
        <div className={`text-xs font-semibold px-2 py-1 rounded ${
          isRisk ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
        }`}>
          {isRisk ? '+' : ''}{(impact * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};

// Alert row with clear explanation
const AlertRow: React.FC<{ alert: HeuristicAlert }> = ({ alert }) => (
  <div className="py-3 border-b border-gray-50 last:border-0">
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700">{alert.rule_name}</span>
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            +{(alert.impact * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{alert.reason}</p>
      </div>
    </div>
  </div>
);

// ML Factors List
const MLFactorsList: React.FC<{ contributors: MLContributor[] | string | Record<string, any> | null | undefined }> = ({ contributors }) => {
  let normalizedContributors: MLContributor[] = [];

  if (!contributors) {
    normalizedContributors = [];
  } else if (Array.isArray(contributors)) {
    normalizedContributors = contributors;
  } else if (typeof contributors === 'string') {
    try {
      const parsed = JSON.parse(contributors);
      if (Array.isArray(parsed)) {
        normalizedContributors = parsed;
      } else if (typeof parsed === 'object') {
        normalizedContributors = Object.entries(parsed).map(([feature, value]) => ({
          feature,
          value: value,
          importance: typeof value === 'number' ? value : 0.1
        }));
      }
    } catch {
      normalizedContributors = [];
    }
  } else if (typeof contributors === 'object') {
    normalizedContributors = Object.entries(contributors).map(([feature, value]) => ({
      feature,
      value: value,
      importance: typeof value === 'number' ? value : 0.1
    }));
  }

  const topFactors = normalizedContributors
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 6);

  if (topFactors.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">No factors analyzed yet</p>
        <p className="text-xs mt-1">Run predictions to see contributing factors</p>
      </div>
    );
  }

  return (
    <div>
      {topFactors.map((factor, index) => (
        <FactorRow
          key={index}
          feature={factor.feature}
          value={factor.value}
          impact={factor.importance}
        />
      ))}
    </div>
  );
};

// Business Rules List
const BusinessRulesList: React.FC<{ alerts: HeuristicAlert[] | string | null | undefined }> = ({ alerts }) => {
  let normalizedAlerts: HeuristicAlert[] = [];

  if (!alerts) {
    normalizedAlerts = [];
  } else if (Array.isArray(alerts)) {
    normalizedAlerts = alerts;
  } else if (typeof alerts === 'string') {
    try {
      const parsed = JSON.parse(alerts);
      if (Array.isArray(parsed)) {
        normalizedAlerts = parsed;
      }
    } catch {
      normalizedAlerts = [];
    }
  }

  if (normalizedAlerts.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
        <p className="text-sm font-medium text-emerald-600">All clear</p>
        <p className="text-xs text-gray-400 mt-1">No warning patterns detected</p>
      </div>
    );
  }

  return (
    <div>
      {normalizedAlerts.map((alert, index) => (
        <AlertRow key={index} alert={alert} />
      ))}
    </div>
  );
};

export const ReasoningDashboard: React.FC<ReasoningDashboardProps> = ({
  hrCode,
  employeeName,
  onClose,
  isPerformanceMode: _isPerformanceMode = false
}) => {
  const { reasoning, isLoading, error } = useEmployeeReasoning(hrCode);
  const [showCalculation, setShowCalculation] = useState(false);
  const thresholds = getCurrentThresholds();

  // Loading
  if (isLoading) {
    return (
      <div className="bg-gray-50/50 rounded-2xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => <div key={i} className="h-40 bg-gray-200 rounded-xl"></div>)}
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="bg-gray-50/50 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium">Failed to load analysis</span>
        </div>
        <p className="text-gray-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  // No data
  if (!reasoning) {
    return (
      <div className="bg-gray-50/50 rounded-2xl p-6 text-center py-12">
        <Brain className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No analysis available</p>
        <p className="text-gray-400 text-sm mt-1">Run predictions to generate risk analysis</p>
      </div>
    );
  }

  // Parse data
  const heuristicAlerts = Array.isArray(reasoning.heuristic_alerts)
    ? reasoning.heuristic_alerts
    : typeof reasoning.heuristic_alerts === 'string'
      ? (() => { try { return JSON.parse(reasoning.heuristic_alerts); } catch { return []; } })()
      : [];

  const mlContributors = Array.isArray(reasoning.ml_contributors)
    ? reasoning.ml_contributors
    : typeof reasoning.ml_contributors === 'string'
      ? (() => { try { return JSON.parse(reasoning.ml_contributors); } catch { return []; } })()
      : [];

  const hasBusinessRuleAlerts = heuristicAlerts && heuristicAlerts.length > 0;
  const totalRuleImpact = hasBusinessRuleAlerts
    ? heuristicAlerts.reduce((sum: number, alert: any) => sum + (alert.impact || 0), 0)
    : 0;
  const businessRulesNotUsed = !hasBusinessRuleAlerts && totalRuleImpact === 0;

  // Risk level
  const riskScore = reasoning.churn_risk;
  const riskLevel = riskScore >= thresholds.highRisk ? 'high'
    : riskScore >= thresholds.mediumRisk ? 'medium' : 'low';

  const riskConfig = {
    high: {
      bg: 'bg-red-50',
      text: 'text-red-600',
      border: 'border-red-200',
      label: 'High Risk',
      message: 'This employee shows significant indicators of potential departure. Review the factors below and consider taking action.',
    },
    medium: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-200',
      label: 'Medium Risk',
      message: 'Some risk factors detected. Monitor this employee and consider proactive engagement to address concerns.',
    },
    low: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-200',
      label: 'Low Risk',
      message: 'No significant risk factors detected. Continue standard engagement and recognition practices.',
    },
  }[riskLevel];

  // Stage info
  const stageInfo = STAGE_INFO[reasoning.stage || ''] || {
    description: 'Unable to determine behavioral stage from available data.',
    action: 'Gather more information through check-ins',
    urgency: 'low' as const
  };

  return (
    <div className="bg-gray-50/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${riskConfig.bg} flex items-center justify-center`}>
            <Brain className={`w-5 h-5 ${riskConfig.text}`} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{employeeName}</h1>
            <p className="text-xs text-gray-400">
              Analysis from {reasoning.updated_at
                ? new Date(reasoning.updated_at).toLocaleDateString()
                : 'recently'}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Risk Summary - Main insight */}
        <div className={`${riskConfig.bg} ${riskConfig.border} border rounded-xl p-5`}>
          <div className="flex items-start gap-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${riskConfig.text}`}>
                {Math.round(riskScore * 100)}%
              </div>
              <div className={`text-xs font-medium ${riskConfig.text} mt-1`}>
                {riskConfig.label}
              </div>
            </div>
            <div className="flex-1 border-l border-gray-200 pl-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                {riskConfig.message}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-semibold text-gray-800">
              {Math.round(reasoning.ml_score * 100)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">Data Analysis</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-semibold text-gray-800">
              {businessRulesNotUsed ? '0' : heuristicAlerts.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Pattern Alerts</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-semibold text-gray-800">
              {reasoning.confidence_level != null
                ? (reasoning.confidence_level > 1
                    ? Math.round(reasoning.confidence_level)
                    : Math.round(reasoning.confidence_level * 100))
                : 70}%
            </div>
            <div className="text-xs text-gray-500 mt-1">Confidence</div>
          </div>
        </div>

        {/* Behavioral Stage with Action */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              stageInfo.urgency === 'high' ? 'bg-red-50' :
              stageInfo.urgency === 'medium' ? 'bg-amber-50' : 'bg-emerald-50'
            }`}>
              <Users className={`w-5 h-5 ${
                stageInfo.urgency === 'high' ? 'text-red-500' :
                stageInfo.urgency === 'medium' ? 'text-amber-500' : 'text-emerald-500'
              }`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-800">{reasoning.stage || 'Unknown'}</h3>
                <span className="text-xs text-gray-400">
                  {reasoning.stage_score != null ? `${Math.round(reasoning.stage_score * 100)}% stage risk` : ''}
                </span>
              </div>
              <p className="text-sm text-gray-600">{stageInfo.description}</p>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Lightbulb className="w-4 h-4 text-blue-500" />
                <span className="text-blue-600 font-medium">Recommended:</span>
                <span className="text-gray-600">{stageInfo.action}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown - Collapsible */}
        {reasoning.calculation_breakdown && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowCalculation(!showCalculation)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-2 text-gray-600">
                <Calculator className="w-4 h-4" />
                <span className="text-sm font-medium">How the score is calculated</span>
              </div>
              {showCalculation ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showCalculation && (
              <div className="px-5 pb-5 border-t border-gray-50">
                <p className="text-xs text-gray-500 pt-4 pb-3">
                  The risk score combines three weighted components to give a comprehensive view:
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-700 font-medium">Data Analysis</span>
                      <span className="text-gray-400 ml-2">× {(reasoning.calculation_breakdown.weights.ml_weight * 100)}% weight</span>
                    </div>
                    <span className="font-medium text-gray-700">{(reasoning.calculation_breakdown.ml_contribution * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-700 font-medium">Pattern Alerts</span>
                      <span className="text-gray-400 ml-2">× {(reasoning.calculation_breakdown.weights.heuristic_weight * 100)}% weight</span>
                    </div>
                    <span className="font-medium text-gray-700">
                      {businessRulesNotUsed ? '0%' : `${(reasoning.calculation_breakdown.heuristic_contribution * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-700 font-medium">Stage Factor</span>
                      <span className="text-gray-400 ml-2">× {(reasoning.calculation_breakdown.weights.stage_weight * 100)}% weight</span>
                    </div>
                    <span className="font-medium text-gray-700">{(reasoning.calculation_breakdown.stage_contribution * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-100">
                    <span className="font-semibold text-gray-800">Total Risk Score</span>
                    <span className="font-bold text-gray-900">{(reasoning.churn_risk * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Factors & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card
            title="Contributing Factors"
            description="Data points that influence the risk score — see why each matters"
            icon={<TrendingUp className="w-4 h-4" />}
          >
            <MLFactorsList contributors={mlContributors} />
          </Card>
          <Card
            title="Pattern Alerts"
            description="Known warning signs identified by HR experts"
            icon={<AlertTriangle className="w-4 h-4" />}
          >
            <BusinessRulesList alerts={heuristicAlerts} />
          </Card>
        </div>

        {/* Legend / Help */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-red-400" />
              <span>Increases risk</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>Decreases risk</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Warning pattern</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
