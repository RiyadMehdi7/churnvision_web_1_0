/**
 * Data Quality Report Component
 * 
 * Displays ML readiness assessment for uploaded data or database connections.
 * Shows score, issues, recommendations, and feature availability.
 */

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  TrendingUp,
  Database,
  Zap,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DataQualityIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  recommendation: string;
  affected_column?: string;
}

interface FeatureAvailability {
  feature_name: string;
  required: boolean;
  found: boolean;
  mapped_column?: string;
  quality_score: number;
  issues: string[];
}

export interface DataQualityData {
  ml_readiness_score: number;
  can_train_model: boolean;
  confidence_level: 'high' | 'medium' | 'low' | 'insufficient';
  total_rows: number;
  total_columns: number;
  churn_events: number;
  churn_rate: number;
  critical_issues: DataQualityIssue[];
  warnings: DataQualityIssue[];
  info: DataQualityIssue[];
  features: FeatureAvailability[];
  missing_required_features: string[];
  missing_optional_features: string[];
  top_recommendations: string[];
  assessed_at: string;
  data_source: string;
}

interface DataQualityReportProps {
  data: DataQualityData;
  onDismiss?: () => void;
  compact?: boolean;
}

function ScoreGauge({ score, size = 'large' }: { score: number; size?: 'small' | 'large' }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    if (score >= 40) return 'bg-orange-100 dark:bg-orange-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const sizeClasses = size === 'large' 
    ? 'w-24 h-24 text-3xl' 
    : 'w-16 h-16 text-xl';

  return (
    <div className={`${sizeClasses} ${getScoreBgColor(score)} rounded-full flex items-center justify-center`}>
      <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'High Confidence' },
    medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'Medium Confidence' },
    low: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'Low Confidence' },
    insufficient: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Insufficient Data' },
  };

  const { bg, text, label } = config[level] || config.insufficient;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
}

function IssueCard({ issue }: { issue: DataQualityIssue }) {
  const iconMap = {
    critical: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgMap = {
    critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  return (
    <div className={`p-4 rounded-lg border ${bgMap[issue.severity]}`}>
      <div className="flex items-start gap-3">
        {iconMap[issue.severity]}
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">{issue.message}</p>
          {issue.affected_column && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Column: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{issue.affected_column}</code>
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
            <span className="font-medium">Recommendation:</span> {issue.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureList({ features }: { features: FeatureAvailability[] }) {
  return (
    <div className="space-y-2">
      {features.map((feature) => (
        <div
          key={feature.feature_name}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
        >
          <div className="flex items-center gap-3">
            {feature.found ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {feature.feature_name.replace(/_/g, ' ')}
                {feature.required && <span className="text-red-500 ml-1">*</span>}
              </p>
              {feature.mapped_column && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mapped to: {feature.mapped_column}
                </p>
              )}
            </div>
          </div>
          {feature.found && (
            <div className="flex items-center gap-2">
              <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    feature.quality_score >= 80
                      ? 'bg-green-500'
                      : feature.quality_score >= 50
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${feature.quality_score}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 w-12">
                {feature.quality_score}%
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DataQualityReport({ data, onDismiss, compact = false }: DataQualityReportProps) {
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    issues: true,
    features: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ScoreGauge score={data.ml_readiness_score} size="small" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                ML Readiness Score
              </h3>
              <ConfidenceBadge level={data.confidence_level} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.can_train_model ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="w-5 h-5" />
                Ready to Train
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <AlertCircle className="w-5 h-5" />
                Issues Found
              </span>
            )}
          </div>
        </div>
        {data.critical_issues.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              {data.critical_issues.length} critical issue(s) must be resolved before training.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <ScoreGauge score={data.ml_readiness_score} />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Data Quality Report
              </h2>
              <div className="flex items-center gap-3 mt-2">
                <ConfidenceBadge level={data.confidence_level} />
                {data.can_train_model ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Ready for ML Training
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Not Ready - Fix Issues Below
                  </span>
                )}
              </div>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XCircle className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Database className="w-4 h-4" />
            <span className="text-sm">Rows</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {data.total_rows.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <FileCheck className="w-4 h-4" />
            <span className="text-sm">Columns</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {data.total_columns}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Churn Events</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {data.churn_events.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Churn Rate</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {data.churn_rate}%
          </p>
        </div>
      </div>

      {/* Recommendations */}
      {data.top_recommendations.length > 0 && (
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Top Recommendations
          </h3>
          <ul className="space-y-2">
            {data.top_recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-sm font-medium">
                  {idx + 1}
                </span>
                <span className="text-gray-700 dark:text-gray-300">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues Section */}
      {(data.critical_issues.length > 0 || data.warnings.length > 0) && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => toggleSection('issues')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-gray-500" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                Issues ({data.critical_issues.length + data.warnings.length})
              </span>
              {data.critical_issues.length > 0 && (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded-full">
                  {data.critical_issues.length} critical
                </span>
              )}
            </div>
            {expandedSections.issues ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {expandedSections.issues && (
            <div className="p-4 pt-0 space-y-3">
              {data.critical_issues.map((issue, idx) => (
                <IssueCard key={`critical-${idx}`} issue={issue} />
              ))}
              {data.warnings.map((issue, idx) => (
                <IssueCard key={`warning-${idx}`} issue={issue} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Features Section */}
      <div>
        <button
          onClick={() => toggleSection('features')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              Feature Availability ({data.features.filter((f) => f.found).length}/{data.features.length})
            </span>
          </div>
          {expandedSections.features ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
        {expandedSections.features && (
          <div className="p-4 pt-0">
            <FeatureList features={data.features} />
            {data.missing_required_features.length > 0 && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                Missing required features: {data.missing_required_features.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DataQualityReport;
