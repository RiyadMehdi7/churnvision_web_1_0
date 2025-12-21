/**
 * Model Selection Card Component
 * Displays how the AI automatically selected the optimal algorithm
 * for the current dataset - without exposing internal model names
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Sparkles,
  CheckCircle,
  Database,
  BarChart3,
  Shield,
  Layers,
  TrendingUp,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import { modelIntelligenceService, RoutingInfo } from '../services/modelIntelligenceService';

interface ModelSelectionCardProps {
  className?: string;
  compact?: boolean;
}

// Map internal reasoning to user-friendly messages
function humanizeReasoning(reasons: string[]): string[] {
  return reasons.map(reason => {
    // Remove specific model names and technical jargon
    let humanized = reason
      .replace(/TabPFN/gi, 'advanced neural approach')
      .replace(/XGBoost/gi, 'gradient-based approach')
      .replace(/Random Forest/gi, 'ensemble tree approach')
      .replace(/Logistic/gi, 'statistical approach')
      .replace(/tabpfn/gi, 'neural approach')
      .replace(/xgboost/gi, 'gradient approach')
      .replace(/random_forest/gi, 'ensemble approach')
      .replace(/logistic/gi, 'statistical approach')
      .replace(/\bmodel\b/gi, 'algorithm')
      .replace(/pre-trained transformer/gi, 'pre-trained AI');

    return humanized;
  });
}

// Get confidence level label
function getConfidenceLevel(confidence: number): { label: string; color: string } {
  if (confidence >= 0.85) return { label: 'Very High', color: 'text-emerald-600 dark:text-emerald-400' };
  if (confidence >= 0.7) return { label: 'High', color: 'text-green-600 dark:text-green-400' };
  if (confidence >= 0.5) return { label: 'Moderate', color: 'text-amber-600 dark:text-amber-400' };
  return { label: 'Low', color: 'text-red-600 dark:text-red-400' };
}

// Get quality level
function getQualityLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 0.8) return { label: 'Excellent', color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' };
  if (score >= 0.6) return { label: 'Good', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/30' };
  if (score >= 0.4) return { label: 'Fair', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/30' };
  return { label: 'Needs Improvement', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/30' };
}

export function ModelSelectionCard({ className, compact = false }: ModelSelectionCardProps) {
  const [routingInfo, setRoutingInfo] = useState<RoutingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);

  useEffect(() => {
    const fetchRoutingInfo = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await modelIntelligenceService.getRoutingInfo();
        setRoutingInfo(data);
      } catch (err: any) {
        console.error('Error fetching routing info:', err);
        // Don't show error for 404 (no model trained yet)
        if (err.response?.status === 404) {
          setError('Train a model first to see optimization details.');
        } else {
          setError(err.message || 'Failed to load optimization info');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoutingInfo();
  }, []);

  if (isLoading) {
    return (
      <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6", className)}>
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-gray-600 dark:text-gray-400">Loading optimization details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6", className)}>
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!routingInfo) return null;

  const { profile, routing } = routingInfo;
  const confidenceLevel = getConfidenceLevel(routing.confidence);
  const qualityLevel = getQualityLevel(profile.overall_quality_score);
  const humanReasons = humanizeReasoning(routing.reasoning);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-6 py-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer",
          "hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30">
              <Brain className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Intelligent Algorithm Selection
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI automatically optimized for your data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className={cn("text-sm font-medium", confidenceLevel.color)}>
                {confidenceLevel.label} Confidence
              </span>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="p-6 space-y-6"
        >
          {/* Selection Summary */}
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-sm">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {routing.is_ensemble ? 'Ensemble Approach Selected' : 'Optimal Algorithm Selected'}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {routing.is_ensemble
                    ? 'Multiple algorithms combined for best accuracy'
                    : 'Single best algorithm chosen based on your data characteristics'
                  }
                </p>
                {routing.is_ensemble && (
                  <div className="mt-2 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-purple-600 dark:text-purple-400">
                      {routing.ensemble_models?.length || 2} algorithms working together
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Data Profile Grid */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Dataset Analysis
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {profile.n_samples.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Records</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {profile.n_features}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Features Analyzed</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className={cn("text-2xl font-bold", qualityLevel.color)}>
                  {Math.round(profile.overall_quality_score * 100)}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Data Quality</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {Math.round(routing.confidence * 100)}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Selection Confidence</div>
              </div>
            </div>
          </div>

          {/* Data Quality Indicators */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Data Characteristics
            </h4>
            <div className="flex flex-wrap gap-2">
              {profile.is_severely_imbalanced && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Class Imbalance Detected
                </span>
              )}
              {profile.has_outliers && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  Outliers Present
                </span>
              )}
              {profile.missing_ratio > 0.05 && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {Math.round(profile.missing_ratio * 100)}% Missing Data
                </span>
              )}
              {profile.missing_ratio <= 0.05 && (
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Complete Data
                </span>
              )}
              <span className={cn("px-3 py-1 text-xs font-medium rounded-full", qualityLevel.bgColor, qualityLevel.color)}>
                {qualityLevel.label} Quality
              </span>
            </div>
          </div>

          {/* Selection Reasoning */}
          {humanReasons.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Why This Was Chosen
              </h4>
              <ul className="space-y-2">
                {humanReasons.slice(0, 4).map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Optimization Score Bar */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Overall Optimization Score
              </span>
              <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                {Math.round(routing.confidence * 100)}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${routing.confidence * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default ModelSelectionCard;
