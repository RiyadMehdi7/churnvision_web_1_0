/**
 * Cohort Analysis Tab Component
 * Professional analytics dashboard for cohort comparisons and employee journey analysis
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
  Target,
  BarChart3,
  X,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { modelIntelligenceService, CohortOverview, CohortAnalysis } from '@/services/modelIntelligenceService';

interface CohortAnalysisTabProps {
  className?: string;
  selectedEmployeeHrCode?: string;
}

// Refined color palette matching data preview modal
const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981'
};

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const riskLevel = value >= 0.6 ? 'High' : value >= 0.4 ? 'Medium' : 'Low';
    const riskColor = value >= 0.6 ? 'text-red-500' : value >= 0.4 ? 'text-amber-500' : 'text-emerald-500';

    return (
      <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${riskColor}`}>
            {(value * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {riskLevel} Risk
          </span>
        </div>
      </div>
    );
  }
  return null;
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-80">
        <div className="relative w-14 h-14 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading cohort analysis...</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Analyzing employee segments</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 ring-1 ring-amber-200 dark:ring-amber-800/40">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Unable to load cohort data</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">{error}</p>
      </div>
    );
  }

  const hasNoCohortData = cohortOverview &&
    cohortOverview.department_cohorts.length === 0 &&
    cohortOverview.tenure_cohorts.length === 0;

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }
  };

  return (
    <motion.div
      className={cn("space-y-6", className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Empty state */}
      {hasNoCohortData ? (
        <motion.div
          variants={itemVariants}
          className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-10 text-center"
        >
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-slate-200 dark:ring-slate-600">
            <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2 tracking-tight">
            No Cohort Data Available
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto text-sm leading-relaxed">
            Cohort analysis will be available once you upload employee data and run predictions.
          </p>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 max-w-sm mx-auto text-left border border-slate-200 dark:border-slate-700">
            <h4 className="font-medium text-slate-900 dark:text-white mb-3 text-sm">Getting Started</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs font-medium">1</span>
                <span>Upload employee data in Data Management</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs font-medium">2</span>
                <span>Train the prediction model</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs font-medium">3</span>
                <span>Return here to view cohort breakdowns</span>
              </li>
            </ul>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Department Cohorts Chart */}
            <motion.div
              variants={itemVariants}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Building2 className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
                      Department Risk Overview
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Average churn risk by department
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {cohortOverview && cohortOverview.department_cohorts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={cohortOverview.department_cohorts.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        horizontal={true}
                        vertical={false}
                        className="dark:stroke-slate-700/50"
                      />
                      <XAxis
                        type="number"
                        domain={[0, 1]}
                        tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        dataKey="department"
                        type="category"
                        stroke="#94a3b8"
                        fontSize={11}
                        width={100}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                      <Bar
                        dataKey="avg_risk"
                        name="Average Risk"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={28}
                      >
                        {cohortOverview.department_cohorts.slice(0, 8).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getRiskColor(entry.avg_risk)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[280px] text-slate-400 dark:text-slate-500">
                    <BarChart3 className="w-10 h-10 mb-2 opacity-40" />
                    <span className="text-sm">No department data available</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Tenure Cohorts Chart */}
            <motion.div
              variants={itemVariants}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <Clock className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
                      Tenure Risk Distribution
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Risk levels across experience bands
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                {cohortOverview && cohortOverview.tenure_cohorts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={cohortOverview.tenure_cohorts} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        vertical={false}
                        className="dark:stroke-slate-700/50"
                      />
                      <XAxis
                        dataKey="range"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                      <Bar
                        dataKey="avg_risk"
                        name="Average Risk"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      >
                        {cohortOverview.tenure_cohorts.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getRiskColor(entry.avg_risk)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[280px] text-slate-400 dark:text-slate-500">
                    <BarChart3 className="w-10 h-10 mb-2 opacity-40" />
                    <span className="text-sm">No tenure data available</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Statistics Cards */}
          {cohortOverview && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Highest Risk Department */}
              <motion.div
                variants={itemVariants}
                className="group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-5 overflow-hidden hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-500/5 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Highest Risk
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center ring-1 ring-red-100 dark:ring-red-800/30">
                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                  </div>
                </div>
                {cohortOverview.department_cohorts[0] && (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white truncate mb-1">
                      {cohortOverview.department_cohorts[0].department}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-red-500">
                        {(cohortOverview.department_cohorts[0].avg_risk * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">avg risk</span>
                    </div>
                  </>
                )}
              </motion.div>

              {/* Lowest Risk Department */}
              <motion.div
                variants={itemVariants}
                className="group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-5 overflow-hidden hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-colors"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Lowest Risk
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center ring-1 ring-emerald-100 dark:ring-emerald-800/30">
                    <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                {cohortOverview.department_cohorts.length > 0 && (
                  <>
                    <div className="text-lg font-bold text-slate-900 dark:text-white truncate mb-1">
                      {cohortOverview.department_cohorts[cohortOverview.department_cohorts.length - 1].department}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-emerald-500">
                        {(cohortOverview.department_cohorts[cohortOverview.department_cohorts.length - 1].avg_risk * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">avg risk</span>
                    </div>
                  </>
                )}
              </motion.div>

              {/* Total Departments */}
              <motion.div
                variants={itemVariants}
                className="group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 p-5 overflow-hidden hover:border-cyan-200 dark:hover:border-cyan-800/40 transition-colors"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Segments
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center ring-1 ring-cyan-100 dark:ring-cyan-800/30">
                    <Users className="w-4 h-4 text-cyan-500" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                  {cohortOverview.department_cohorts.length}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Departments being analyzed
                </div>
              </motion.div>
            </div>
          )}

          {/* Individual Cohort Analysis */}
          {selectedCohort && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                        Similar Employee Journey Analysis
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Comparing <span className="font-medium text-slate-700 dark:text-slate-300">{selectedCohort.target_employee.full_name}</span> with similar profiles
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCohort(null);
                      setSelectedHrCode(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Similar Who Left */}
                  <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-gradient-to-br from-red-50/50 to-white dark:from-red-900/10 dark:to-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                          <UserMinus className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                            Employees Who Left
                          </h4>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {selectedCohort.similar_who_left.length} similar profiles
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
                      {selectedCohort.similar_who_left.length > 0 ? (
                        selectedCohort.similar_who_left.map((member, idx) => (
                          <div
                            key={idx}
                            className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-slate-900 dark:text-white text-sm">
                                {member.full_name}
                              </span>
                              <span className="text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md">
                                {(member.similarity_score * 100).toFixed(0)}% match
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                              {member.department} • {member.position} • {member.tenure.toFixed(1)}y tenure
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {member.key_factors.map((factor, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-md font-medium"
                                >
                                  {factor}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                          No similar employees who left found
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Similar Who Stayed */}
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-900/10 dark:to-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                          <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                            Employees Who Stayed
                          </h4>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            {selectedCohort.similar_who_stayed.length} similar profiles
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
                      {selectedCohort.similar_who_stayed.length > 0 ? (
                        selectedCohort.similar_who_stayed.map((member, idx) => (
                          <div
                            key={idx}
                            className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800/40 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-slate-900 dark:text-white text-sm">
                                {member.full_name}
                              </span>
                              <span className="text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md">
                                {(member.similarity_score * 100).toFixed(0)}% match
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                              {member.department} • {member.position} • {member.tenure.toFixed(1)}y tenure
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {member.key_factors.map((factor, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md font-medium"
                                >
                                  {factor}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                          No similar employees who stayed found
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Insights Section */}
                {selectedCohort.retention_insights.length > 0 && (
                  <div className="mt-5 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-900/20 dark:to-slate-900 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                        Retention Insights
                      </h4>
                    </div>
                    <ul className="space-y-2.5">
                      {selectedCohort.retention_insights.map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-sm text-blue-800 dark:text-blue-200">
                          <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended Actions */}
                {selectedCohort.recommended_actions.length > 0 && (
                  <div className="mt-4 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-900/20 dark:to-slate-900 p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                        <Target className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <h4 className="font-semibold text-violet-900 dark:text-violet-100 text-sm">
                        Recommended Actions
                      </h4>
                    </div>
                    <ul className="space-y-2.5">
                      {selectedCohort.recommended_actions.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-sm text-violet-800 dark:text-violet-200">
                          <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-violet-500" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Tip Card */}
          {!selectedCohort && cohortOverview && cohortOverview.department_cohorts.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="rounded-xl border border-cyan-200 dark:border-cyan-900/40 bg-gradient-to-br from-cyan-50/80 to-white dark:from-cyan-900/20 dark:to-slate-900 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-cyan-900 dark:text-cyan-100 mb-1">
                    Pro Tip: Individual Employee Analysis
                  </h4>
                  <p className="text-sm text-cyan-700 dark:text-cyan-300 leading-relaxed">
                    Click on any employee in the Dashboard to see their detailed cohort comparison,
                    including similar employees who left or stayed and personalized retention insights.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default CohortAnalysisTab;
