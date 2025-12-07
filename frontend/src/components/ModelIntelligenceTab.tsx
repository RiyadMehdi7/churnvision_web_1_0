/**
 * Model Intelligence Tab Component
 * Displays backtesting results and prediction tracking
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Activity,
  Award,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { modelIntelligenceService, BacktestingResults, PredictionOutcomesResult } from '../services/modelIntelligence';

interface ModelIntelligenceTabProps {
  className?: string;
}

export function ModelIntelligenceTab({ className }: ModelIntelligenceTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'backtesting' | 'outcomes'>('backtesting');
  const [backtestingData, setBacktestingData] = useState<BacktestingResults | null>(null);
  const [outcomesData, setOutcomesData] = useState<PredictionOutcomesResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [backtesting, outcomes] = await Promise.all([
          modelIntelligenceService.getBacktestingResults(6),
          modelIntelligenceService.getPredictionOutcomes(50)
        ]);
        setBacktestingData(backtesting);
        setOutcomesData(outcomes);
      } catch (err: any) {
        console.error('Error fetching model intelligence data:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading model intelligence data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Unable to load data</h3>
        <p className="text-gray-600 dark:text-gray-400">{error}</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Historical prediction data will become available after the model has been running for some time.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Sub-tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveSubTab('backtesting')}
          className={cn(
            "pb-2 px-1 text-sm font-medium border-b-2 transition-colors",
            activeSubTab === 'backtesting'
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Backtesting Results
          </div>
        </button>
        <button
          onClick={() => setActiveSubTab('outcomes')}
          className={cn(
            "pb-2 px-1 text-sm font-medium border-b-2 transition-colors",
            activeSubTab === 'outcomes'
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Prediction History
          </div>
        </button>
      </div>

      {/* Backtesting Content */}
      {activeSubTab === 'backtesting' && backtestingData && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total Predictions</span>
                <BarChart3 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {backtestingData.aggregate.total_predictions_analyzed.toLocaleString()}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Overall Accuracy</span>
                <Award className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {(backtestingData.aggregate.overall_accuracy * 100).toFixed(1)}%
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Precision</span>
                <Target className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {(backtestingData.aggregate.overall_precision * 100).toFixed(1)}%
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Recall (Catch Rate)</span>
                <TrendingUp className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {(backtestingData.aggregate.overall_recall * 100).toFixed(1)}%
              </div>
            </motion.div>
          </div>

          {/* Catch Rate Message */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  {backtestingData.aggregate.catch_rate_message}
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Based on {backtestingData.aggregate.total_actual_churns} actual departures
                </p>
              </div>
            </div>
          </div>

          {/* Accuracy Over Time Chart */}
          {backtestingData.periods.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Accuracy Over Time
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={backtestingData.periods.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, '']}
                    labelFormatter={(label) => `Period: ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="precision"
                    name="Precision"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="recall"
                    name="Recall"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Period Details Table */}
          {backtestingData.periods.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Period Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Period</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Predictions</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">High Risk Flagged</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Actual Churns</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Correct</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {backtestingData.periods.map((period, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {period.period}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {period.total_predictions}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {period.high_risk_flagged}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {period.actual_churns}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {period.correct_predictions}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 text-xs font-medium rounded-full",
                            period.accuracy >= 0.8 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            period.accuracy >= 0.6 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          )}>
                            {(period.accuracy * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prediction Outcomes Content */}
      {activeSubTab === 'outcomes' && outcomesData && (
        <div className="space-y-6">
          {/* Show empty state if no continuous data */}
          {outcomesData.outcomes.length === 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-2">
                Continuous Data Required
              </h3>
              <p className="text-amber-700 dark:text-amber-300 mb-4 max-w-lg mx-auto">
                Prediction tracking requires historical snapshots of your employee data over time.
                This allows us to compare what we predicted vs. what actually happened.
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md mx-auto text-left">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">How to enable this:</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>• Upload employee data regularly (weekly/monthly)</li>
                  <li>• Include a date/snapshot column in your Excel files</li>
                  <li>• Or connect a database with historical records</li>
                </ul>
              </div>
            </div>
          ) : (
          <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Tracked</span>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {outcomesData.summary.total_tracked}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Accuracy</span>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {(outcomesData.summary.accuracy * 100).toFixed(1)}%
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Left</span>
                <XCircle className="w-4 h-4 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {outcomesData.summary.employees_who_left}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Caught</span>
                <Target className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {outcomesData.summary.high_risk_who_left}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Flagged high-risk before leaving
              </p>
            </motion.div>
          </div>

          {/* Outcomes Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Recent Prediction Outcomes
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Predicted Risk</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Outcome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {outcomesData.outcomes.map((outcome, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {outcome.full_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {outcome.department}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 text-xs font-medium rounded-full",
                          outcome.predicted_risk > 0.6 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          outcome.predicted_risk > 0.4 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        )}>
                          {(outcome.predicted_risk * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 text-xs font-medium rounded-full",
                          outcome.actual_outcome === 'left' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        )}>
                          {outcome.actual_outcome === 'left' ? 'Left' : 'Stayed'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {outcome.was_correct ? (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

export default ModelIntelligenceTab;
