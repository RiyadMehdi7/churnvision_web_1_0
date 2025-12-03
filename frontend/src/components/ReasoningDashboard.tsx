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
} from 'lucide-react';
import { useEmployeeReasoning } from '../hooks/useReasoning';
import { MLContributor, HeuristicAlert } from '../types/reasoning';
import { getCurrentThresholds } from '../config/riskThresholds';

// --- Types from Playground ---
interface SuggestionExplanation {
  ruleId: string;
  ruleName: string;
  impact: number;
  newProbability: number;
  reason: string;
}
// --- End Types ---

interface ReasoningDashboardProps {
  hrCode: string;
  employeeName: string;
  onClose?: () => void;
  isPerformanceMode?: boolean;
}

// --- Reusable Components ---
const SimpleCard: React.FC<{ 
  title: string; 
  children: React.ReactNode; 
  className?: string;
}> = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
    <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
    {children}
  </div>
);

const ScoreCard: React.FC<{ 
  label: string; 
  score: number; 
  description?: string;
  showNotUsed?: boolean;
}> = ({ label, score, description, showNotUsed = false }) => {
  const thresholds = getCurrentThresholds();
  const percentage = Math.round(score * 100);
  const getColor = (score: number) => {
    if (score >= thresholds.highRisk) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= thresholds.mediumRisk) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getNotUsedColor = () => 'text-gray-600 bg-gray-50 border-gray-200';

  return (
    <div className={`p-3 rounded border ${showNotUsed ? getNotUsedColor() : getColor(score)}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-lg font-bold">
          {showNotUsed ? 'Not Used' : `${percentage}%`}
        </span>
      </div>
      {description && (
        <p className="text-xs mt-1 opacity-75">{description}</p>
      )}
    </div>
  );
};

const MLFactorsList: React.FC<{ contributors: MLContributor[] | string | Record<string, any> | null | undefined }> = ({ contributors }) => {
  // Handle different data formats from backend
  let normalizedContributors: MLContributor[] = [];

  if (!contributors) {
    normalizedContributors = [];
  } else if (Array.isArray(contributors)) {
    normalizedContributors = contributors;
  } else if (typeof contributors === 'string') {
    // Parse JSON string if needed
    try {
      const parsed = JSON.parse(contributors);
      if (Array.isArray(parsed)) {
        normalizedContributors = parsed;
      } else if (typeof parsed === 'object') {
        // Convert object format {feature: value} to array
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
    // Convert object format {feature: value} to array
    normalizedContributors = Object.entries(contributors).map(([feature, value]) => ({
      feature,
      value: value,
      importance: typeof value === 'number' ? value : 0.1
    }));
  }

  const topFactors = normalizedContributors
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      {topFactors.map((factor, index) => (
        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
          <div className="flex items-center gap-2">
            {factor.importance > 0 ? (
              <TrendingUp className="w-4 h-4 text-red-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-green-500" />
            )}
            <div>
              <span className="text-sm font-medium text-gray-900">
                {factor.feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
              <div className="text-xs text-gray-600">
                Value: {typeof factor.value === 'number' ? 
                  factor.value.toFixed(2) : 
                  String(factor.value)
                }
              </div>
            </div>
          </div>
          <span className={`text-xs font-mono px-2 py-1 rounded ${
            factor.importance > 0 ? 
              'bg-red-100 text-red-700' :
              'bg-green-100 text-green-700'
          }`}>
            {factor.importance > 0 ? '+' : ''}{(factor.importance * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
};

const BusinessRulesList: React.FC<{ alerts: HeuristicAlert[] | string | null | undefined }> = ({ alerts }) => {
  // Handle different data formats from backend
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
      <div className="text-center py-4">
        <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
        <p className="text-sm text-gray-600">No business rule alerts triggered</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {normalizedAlerts.map((alert, index) => (
        <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="font-medium text-orange-900">{alert.rule_name}</span>
              </div>
              <p className="text-sm text-orange-700 mt-1">{alert.reason}</p>
            </div>
            <span className="text-xs font-medium bg-orange-100 text-orange-800 px-2 py-1 rounded">
              +{(alert.impact * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const ReasoningDashboard: React.FC<ReasoningDashboardProps> = ({
  hrCode,
  employeeName,
  onClose,
  isPerformanceMode = false
}) => {
  // Removed useCurrentRiskThresholds call
  const { reasoning, isLoading, error } = useEmployeeReasoning(hrCode);
  const [showCalculation, setShowCalculation] = useState(false);
  if (isLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">Failed to load reasoning data</span>
          </div>
          <p className="text-red-600 mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!reasoning) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="text-center py-8 sm:py-12">
          <Brain className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No reasoning data available
          </h3>
          <p className="text-gray-600 text-sm sm:text-base">
            Reasoning analysis has not been computed for this employee yet.
          </p>
        </div>
      </div>
    );
  }

  // Ensure heuristic_alerts and ml_contributors are arrays (may come as JSON strings from old data)
  const heuristicAlerts = Array.isArray(reasoning.heuristic_alerts)
    ? reasoning.heuristic_alerts
    : (typeof reasoning.heuristic_alerts === 'string'
        ? (() => { try { return JSON.parse(reasoning.heuristic_alerts); } catch { return []; } })()
        : []);
  const mlContributors = Array.isArray(reasoning.ml_contributors)
    ? reasoning.ml_contributors
    : (typeof reasoning.ml_contributors === 'string'
        ? (() => { try { return JSON.parse(reasoning.ml_contributors); } catch { return []; } })()
        : []);

  // Check if business rules are actually used and calculate total impact
  const hasBusinessRuleAlerts = heuristicAlerts && heuristicAlerts.length > 0;
  const totalRuleImpact = hasBusinessRuleAlerts
    ? heuristicAlerts.reduce((sum: number, alert: any) => sum + (alert.impact || 0), 0)
    : 0;
  const businessRulesNotUsed = !hasBusinessRuleAlerts && totalRuleImpact === 0;

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Responsive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 sm:pb-4 gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">Risk Analysis: {employeeName}</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Updated: {reasoning.updated_at ? (
              `${new Date(reasoning.updated_at).toLocaleDateString()} ${new Date(reasoning.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            ) : 'Recently'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex-shrink-0 self-start sm:self-auto"
          >
            Close
          </button>
        )}
      </div>

      {/* Responsive Risk Scores Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <ScoreCard
          label="Overall Risk"
          score={reasoning.churn_risk}
          description="Final combined score"
        />
        <ScoreCard
          label="ML Model"
          score={reasoning.ml_score}
          description="Machine learning prediction"
        />
        <ScoreCard
          label="Business Rules"
          score={totalRuleImpact}
          description={businessRulesNotUsed ? "No rules triggered" : `${heuristicAlerts.length} rule${heuristicAlerts.length === 1 ? '' : 's'} triggered`}
          showNotUsed={businessRulesNotUsed}
        />
      </div>

      {/* Responsive Additional Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="p-3 bg-purple-50 border border-purple-200 rounded">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span className="font-medium text-purple-900">Behavioral Stage</span>
          </div>
          <p className="text-purple-800 font-semibold text-sm sm:text-base">{reasoning.stage || 'Unknown'}</p>
          <p className="text-xs text-purple-600 mt-1">
            Stage risk: {reasoning.stage_score != null ? Math.round(reasoning.stage_score * 100) : 0}%
          </p>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="font-medium text-blue-900">Confidence</span>
          </div>
          <p className="text-blue-800 font-semibold text-sm sm:text-base">
            {reasoning.confidence_level != null
              ? (reasoning.confidence_level > 1
                  ? Math.round(reasoning.confidence_level)
                  : Math.round(reasoning.confidence_level * 100))
              : 70}%
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Model confidence level
          </p>
        </div>
      </div>

      {/* Responsive Calculation Details - Collapsible */}
      {reasoning.calculation_breakdown && (
        <div className="border border-gray-200 rounded-lg">
          <button
            onClick={() => setShowCalculation(!showCalculation)}
            className="w-full p-3 sm:p-4 text-left flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-gray-600 flex-shrink-0" />
              <span className="font-medium text-gray-900 text-sm sm:text-base">Score Calculation</span>
            </div>
            {showCalculation ? (
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
          </button>
          
          {showCalculation && (
            <div className="border-t border-gray-200 p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="text-sm font-medium text-blue-900 mb-1">ML Model</div>
                  <div className="text-xs font-mono text-blue-800 break-all">
                    {(reasoning.ml_score * 100).toFixed(1)}% × {(reasoning.calculation_breakdown.weights.ml_weight * 100)}% = {(reasoning.calculation_breakdown.ml_contribution * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                  <div className="text-sm font-medium text-orange-900 mb-1">Business Rules</div>
                  <div className="text-xs font-mono text-orange-800 break-all">
                    {businessRulesNotUsed ? 'Not Used' : 
                      `${(reasoning.heuristic_score * 100).toFixed(1)}% × ${(reasoning.calculation_breakdown.weights.heuristic_weight * 100)}% = ${(reasoning.calculation_breakdown.heuristic_contribution * 100).toFixed(1)}%`
                    }
                  </div>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                  <div className="text-sm font-medium text-purple-900 mb-1">Behavioral Stage</div>
                  <div className="text-xs font-mono text-purple-800 break-all">
                    {(reasoning.stage_score * 100).toFixed(1)}% × {(reasoning.calculation_breakdown.weights.stage_weight * 100)}% = {(reasoning.calculation_breakdown.stage_contribution * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span className="font-medium text-gray-900">Final Risk Score:</span>
                  <span className="font-mono text-gray-900 text-sm break-all">
                    {(reasoning.calculation_breakdown.ml_contribution * 100).toFixed(1)}% + {businessRulesNotUsed ? '0' : (reasoning.calculation_breakdown.heuristic_contribution * 100).toFixed(1)}% + {(reasoning.calculation_breakdown.stage_contribution * 100).toFixed(1)}% = {(reasoning.churn_risk * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Responsive ML Factors and Business Rules Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <SimpleCard title="Top ML Risk Factors">
          <MLFactorsList contributors={mlContributors} />
        </SimpleCard>

        <SimpleCard title="Business Rule Alerts">
          <BusinessRulesList alerts={heuristicAlerts} />
        </SimpleCard>
      </div>

    </div>
  );
};
