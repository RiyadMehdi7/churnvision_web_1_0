/**
 * Cohort Analysis Tab Component
 * Displays cohort comparisons and similar employee journeys
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserMinus,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Building2,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Lightbulb,
  Target
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { modelIntelligenceService, CohortOverview, CohortAnalysis } from '../services/modelIntelligenceService';

interface CohortAnalysisTabProps {
  className?: string;
  selectedEmployeeHrCode?: string;
}

const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981'
};

export function CohortAnalysisTab({ className, selectedEmployeeHrCode }: CohortAnalysisTabProps) {
  const [cohortOverview, setCohortOverview] = useState<CohortOverview | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<CohortAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHrCode, setSelectedHrCode] = useState<string | null>(selectedEmployeeHrCode || null);

  useEffect(() => {
    const fetchOverview = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await modelIntelligenceService.getCohortOverview();
        setCohortOverview(data);
      } catch (err: any) {
        console.error('Error fetching cohort overview:', err);
        setError(err.message || 'Failed to load cohort data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverview();
  }, []);

  // Fetch individual cohort analysis when an employee is selected
  useEffect(() => {
    if (selectedHrCode) {
      const fetchCohortDetails = async () => {
        setIsLoadingDetails(true);
        try {
          const data = await modelIntelligenceService.getCohortAnalysis(selectedHrCode);
          setSelectedCohort(data);
        } catch (err: any) {
          console.error('Error fetching cohort details:', err);
        } finally {
          setIsLoadingDetails(false);
        }
      };
      fetchCohortDetails();
    }
  }, [selectedHrCode]);

  const getRiskColor = (risk: number): string => {
    if (risk >= 0.6) return RISK_COLORS.high;
    if (risk >= 0.4) return RISK_COLORS.medium;
    return RISK_COLORS.low;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading cohort analysis...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Unable to load cohort data</h3>
        <p className="text-gray-600 dark:text-gray-400">{error}</p>
      </div>
    );
  }

  // Check if there's no cohort data at all
  const hasNoCohortData = cohortOverview &&
    cohortOverview.department_cohorts.length === 0 &&
    cohortOverview.tenure_cohorts.length === 0;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Empty state when no cohort data exists */}
      {hasNoCohortData ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Cohort Data Available
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-lg mx-auto">
            Cohort analysis will be available once you upload employee data and run predictions.
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md mx-auto text-left">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">To see cohort analysis:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>1. Go to Data Management and upload your employee data</li>
              <li>2. Train the prediction model</li>
              <li>3. Return here to view cohort breakdowns</li>
            </ul>
          </div>
        </div>
      ) : (
      <>
      {/* Overview Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Cohorts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Department Risk Overview
            </h3>
          </div>

          {cohortOverview && cohortOverview.department_cohorts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={cohortOverview.department_cohorts.slice(0, 8)}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  stroke="#6b7280"
                />
                <YAxis
                  dataKey="department"
                  type="category"
                  stroke="#6b7280"
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  formatter={(value) => [`${((value as number) * 100).toFixed(1)}%`, 'Avg Risk']}
                  labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="avg_risk" name="Average Risk">
                  {cohortOverview.department_cohorts.slice(0, 8).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getRiskColor(entry.avg_risk)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-500">
              No department data available
            </div>
          )}
        </div>

        {/* Tenure Cohorts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Tenure Risk Distribution
            </h3>
          </div>

          {cohortOverview && cohortOverview.tenure_cohorts.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cohortOverview.tenure_cohorts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="range" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  stroke="#6b7280"
                />
                <Tooltip
                  formatter={(value) => [`${((value as number) * 100).toFixed(1)}%`, 'Avg Risk']}
                />
                <Bar dataKey="avg_risk" name="Average Risk">
                  {cohortOverview.tenure_cohorts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getRiskColor(entry.avg_risk)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-500">
              No tenure data available
            </div>
          )}
        </div>
      </div>

      {/* Cohort Statistics */}
      {cohortOverview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Highest Risk Dept</span>
              <TrendingUp className="w-4 h-4 text-red-500" />
            </div>
            {cohortOverview.department_cohorts[0] && (
              <>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {cohortOverview.department_cohorts[0].department}
                </div>
                <div className="text-sm text-red-600 dark:text-red-400">
                  {(cohortOverview.department_cohorts[0].avg_risk * 100).toFixed(1)}% avg risk
                </div>
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Lowest Risk Dept</span>
              <TrendingDown className="w-4 h-4 text-emerald-500" />
            </div>
            {cohortOverview.department_cohorts.length > 0 && (
              <>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {cohortOverview.department_cohorts[cohortOverview.department_cohorts.length - 1].department}
                </div>
                <div className="text-sm text-emerald-600 dark:text-emerald-400">
                  {(cohortOverview.department_cohorts[cohortOverview.department_cohorts.length - 1].avg_risk * 100).toFixed(1)}% avg risk
                </div>
              </>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Total Departments</span>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {cohortOverview.department_cohorts.length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Being analyzed
            </div>
          </motion.div>
        </div>
      )}

      {/* Individual Cohort Analysis (when employee selected) */}
      {selectedCohort && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Similar Employee Journey Analysis
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Comparing {selectedCohort.target_employee.full_name}'s profile with similar employees
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedCohort(null);
                setSelectedHrCode(null);
              }}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Similar Who Left */}
            <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/10">
              <div className="flex items-center gap-2 mb-4">
                <UserMinus className="w-5 h-5 text-red-500" />
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  Similar Employees Who Left ({selectedCohort.similar_who_left.length})
                </h4>
              </div>

              {selectedCohort.similar_who_left.length > 0 ? (
                <div className="space-y-3">
                  {selectedCohort.similar_who_left.map((member, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {member.full_name}
                        </span>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {(member.similarity_score * 100).toFixed(0)}% similar
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {member.department} • {member.position} • {member.tenure.toFixed(1)}y tenure
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.key_factors.map((factor, i) => (
                          <span
                            key={i}
                            className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded"
                          >
                            {factor}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No similar employees who left found
                </p>
              )}
            </div>

            {/* Similar Who Stayed */}
            <div className="border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 bg-emerald-50/50 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2 mb-4">
                <UserCheck className="w-5 h-5 text-emerald-500" />
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  Similar Employees Who Stayed ({selectedCohort.similar_who_stayed.length})
                </h4>
              </div>

              {selectedCohort.similar_who_stayed.length > 0 ? (
                <div className="space-y-3">
                  {selectedCohort.similar_who_stayed.map((member, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {member.full_name}
                        </span>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {(member.similarity_score * 100).toFixed(0)}% similar
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {member.department} • {member.position} • {member.tenure.toFixed(1)}y tenure
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.key_factors.map((factor, i) => (
                          <span
                            key={i}
                            className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded"
                          >
                            {factor}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No similar employees who stayed found
                </p>
              )}
            </div>
          </div>

          {/* Insights */}
          {selectedCohort.retention_insights.length > 0 && (
            <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-blue-500" />
                <h4 className="font-medium text-blue-900 dark:text-blue-100">Retention Insights</h4>
              </div>
              <ul className="space-y-2">
                {selectedCohort.retention_insights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200">
                    <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Actions */}
          {selectedCohort.recommended_actions.length > 0 && (
            <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-purple-500" />
                <h4 className="font-medium text-purple-900 dark:text-purple-100">Recommended Actions</h4>
              </div>
              <ul className="space-y-2">
                {selectedCohort.recommended_actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-purple-800 dark:text-purple-200">
                    <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}

      {/* Info about individual analysis - only show if there are cohorts but no employee selected */}
      {!selectedCohort && cohortOverview && cohortOverview.department_cohorts.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                Tip: Individual Employee Analysis
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Click on any employee in the Dashboard to see their detailed cohort comparison,
                including similar employees who left or stayed and personalized retention insights.
              </p>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default CohortAnalysisTab;
