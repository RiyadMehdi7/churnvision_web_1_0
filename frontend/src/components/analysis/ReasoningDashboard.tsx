/**
 * Reasoning Dashboard Component
 * AI-powered employee risk analysis with sophisticated slate/cyan aesthetic
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Shield,
  Activity,
  Zap,
  Target,
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

// Feature explanations
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

// Stage explanations
const STAGE_INFO: Record<string, { description: string; action: string; urgency: 'low' | 'medium' | 'high' }> = {
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

const getFeatureInfo = (feature: string) => {
  const key = feature.toLowerCase();
  return FEATURE_INFO[key] || {
    name: feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    highMeaning: 'This factor is contributing to higher risk',
    lowMeaning: 'This factor is helping reduce risk'
  };
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }
};

// Factor row component
const FactorRow: React.FC<{
  feature: string;
  value: any;
  impact: number;
  index: number;
}> = ({ feature, value, impact, index }) => {
  const isRisk = impact > 0;
  const info = getFeatureInfo(feature);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="group py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
            isRisk
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-emerald-50 dark:bg-emerald-900/20'
          }`}>
            {isRisk ? (
              <TrendingUp className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {info.name}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                {typeof value === 'number' ? value.toFixed(2) : String(value)}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {isRisk ? info.highMeaning : info.lowMeaning}
            </p>
          </div>
        </div>
        <div className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md ${
          isRisk
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
        }`}>
          {isRisk ? '+' : ''}{(impact * 100).toFixed(0)}%
        </div>
      </div>
    </motion.div>
  );
};

// Alert row component
const AlertRow: React.FC<{ alert: HeuristicAlert; index: number }> = ({ alert, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05, duration: 0.3 }}
    className="py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
  >
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {alert.rule_name}
          </span>
          <span className="text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-md">
            +{(alert.impact * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          {alert.reason}
        </p>
      </div>
    </div>
  </motion.div>
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
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
          <BarChart3 className="w-6 h-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No factors analyzed</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Run predictions to see contributing factors</p>
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
          index={index}
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
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-3 ring-1 ring-emerald-100 dark:ring-emerald-800/30">
          <CheckCircle className="w-6 h-6 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">All clear</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">No warning patterns detected</p>
      </div>
    );
  }

  return (
    <div>
      {normalizedAlerts.map((alert, index) => (
        <AlertRow key={index} alert={alert} index={index} />
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

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative w-14 h-14 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Analyzing risk factors...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Processing employee data</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-8">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4 ring-1 ring-red-100 dark:ring-red-800/30">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-base font-semibold text-slate-900 dark:text-white">Failed to load analysis</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{error}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!reasoning) {
    return (
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 ring-1 ring-slate-200 dark:ring-slate-700">
            <Brain className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No analysis available</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Run predictions to generate risk analysis</p>
        </div>
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

  // Risk configuration
  const riskScore = reasoning.churn_risk;
  const riskLevel = riskScore >= thresholds.highRisk ? 'high'
    : riskScore >= thresholds.mediumRisk ? 'medium' : 'low';

  const riskConfig = {
    high: {
      gradient: 'from-red-500 to-rose-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800/40',
      ring: 'ring-red-100 dark:ring-red-800/30',
      label: 'High Risk',
      icon: AlertTriangle,
      message: 'This employee shows significant indicators of potential departure. Review the factors below and consider taking action.',
    },
    medium: {
      gradient: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800/40',
      ring: 'ring-amber-100 dark:ring-amber-800/30',
      label: 'Medium Risk',
      icon: Activity,
      message: 'Some risk factors detected. Monitor this employee and consider proactive engagement to address concerns.',
    },
    low: {
      gradient: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800/40',
      ring: 'ring-emerald-100 dark:ring-emerald-800/30',
      label: 'Low Risk',
      icon: Shield,
      message: 'No significant risk factors detected. Continue standard engagement and recognition practices.',
    },
  }[riskLevel];

  const RiskIcon = riskConfig.icon;

  // Stage info
  const stageInfo = STAGE_INFO[reasoning.stage || ''] || {
    description: 'Unable to determine behavioral stage from available data.',
    action: 'Gather more information through check-ins',
    urgency: 'low' as const
  };

  const urgencyConfig = {
    high: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-500', ring: 'ring-red-100 dark:ring-red-800/30' },
    medium: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-500', ring: 'ring-amber-100 dark:ring-amber-800/30' },
    low: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-500', ring: 'ring-emerald-100 dark:ring-emerald-800/30' },
  }[stageInfo.urgency];

  return (
    <motion.div
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${riskConfig.gradient} flex items-center justify-center shadow-lg`}>
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                {employeeName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Analysis from {reasoning.updated_at
                  ? new Date(reasoning.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'recently'}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Risk Score Hero */}
        <motion.div
          variants={itemVariants}
          className={`${riskConfig.bg} ${riskConfig.border} border rounded-xl p-6 relative overflow-hidden`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/20 to-transparent rounded-bl-full" />
          <div className="flex items-start gap-5 relative">
            <div className="text-center">
              <div className={`text-5xl font-bold ${riskConfig.text} tracking-tight`}>
                {Math.round(riskScore * 100)}
                <span className="text-2xl">%</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <RiskIcon className={`w-4 h-4 ${riskConfig.text}`} />
                <span className={`text-sm font-semibold ${riskConfig.text}`}>
                  {riskConfig.label}
                </span>
              </div>
            </div>
            <div className="flex-1 border-l border-slate-200 dark:border-slate-700 pl-5">
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {riskConfig.message}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 text-center">
            <div className="w-9 h-9 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mx-auto mb-2 ring-1 ring-cyan-200 dark:ring-cyan-800/30">
              <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {Math.round(reasoning.ml_score * 100)}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ML Analysis</div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 text-center">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-2 ring-1 ring-amber-200 dark:ring-amber-800/30">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {businessRulesNotUsed ? '0' : heuristicAlerts.length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pattern Alerts</div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 text-center">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-2 ring-1 ring-violet-200 dark:ring-violet-800/30">
              <Target className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {reasoning.confidence_level != null
                ? (reasoning.confidence_level > 1
                    ? Math.round(reasoning.confidence_level)
                    : Math.round(reasoning.confidence_level * 100))
                : 70}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Confidence</div>
          </div>
        </motion.div>

        {/* Behavioral Stage */}
        <motion.div
          variants={itemVariants}
          className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 p-5"
        >
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl ${urgencyConfig.bg} flex items-center justify-center flex-shrink-0 ring-1 ${urgencyConfig.ring}`}>
              <Users className={`w-5 h-5 ${urgencyConfig.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {reasoning.stage || 'Unknown Stage'}
                </h3>
                {reasoning.stage_score != null && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {Math.round(reasoning.stage_score * 100)}% stage risk
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {stageInfo.description}
              </p>
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
                <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Recommended Action</span>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">{stageInfo.action}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Calculation Breakdown */}
        {reasoning.calculation_breakdown && (
          <motion.div
            variants={itemVariants}
            className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
          >
            <button
              onClick={() => setShowCalculation(!showCalculation)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  How the score is calculated
                </span>
              </div>
              <motion.div
                animate={{ rotate: showCalculation ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-5 h-5 text-slate-400" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showCalculation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      The risk score combines three weighted components for comprehensive analysis:
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-cyan-500" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">ML Analysis</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            × {(reasoning.calculation_breakdown.weights.ml_weight * 100)}%
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {(reasoning.calculation_breakdown.ml_contribution * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Pattern Alerts</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            × {(reasoning.calculation_breakdown.weights.heuristic_weight * 100)}%
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {businessRulesNotUsed ? '0%' : `${(reasoning.calculation_breakdown.heuristic_contribution * 100).toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-violet-500" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Stage Factor</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            × {(reasoning.calculation_breakdown.weights.stage_weight * 100)}%
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {(reasoning.calculation_breakdown.stage_contribution * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">Total Risk Score</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">
                          {(reasoning.churn_risk * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Factors & Alerts Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Contributing Factors */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Contributing Factors
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Data points influencing the score
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <MLFactorsList contributors={mlContributors} />
            </div>
          </div>

          {/* Pattern Alerts */}
          <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Pattern Alerts
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Warning signs from HR expertise
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <BusinessRulesList alerts={heuristicAlerts} />
            </div>
          </div>
        </motion.div>

        {/* Legend */}
        <motion.div
          variants={itemVariants}
          className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/60 px-5 py-3.5"
        >
          <div className="flex items-center justify-center gap-8 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-red-500" />
              </div>
              <span>Increases risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <TrendingDown className="w-3 h-3 text-emerald-500" />
              </div>
              <span>Decreases risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              </div>
              <span>Warning pattern</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
