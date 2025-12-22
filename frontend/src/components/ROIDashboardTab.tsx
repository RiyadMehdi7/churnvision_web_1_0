/**
 * ROI Dashboard Tab Component
 * Executive-focused financial metrics view for CFO/leadership
 * Shows portfolio ELTV at risk, department breakdowns, and timeline projections
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  AlertTriangle,
  Building2,
  Calendar,
  Loader2,
  Target,
  PieChart,
  BarChart3,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';
import api from '../services/apiService';

// Types matching backend schemas
interface PortfolioSummary {
  total_employees: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  total_eltv_at_risk: number;
  recovery_potential: number;
  aggregate_roi: number;
  treatments_applied: number;
  treatments_pending: number;
  avg_churn_probability: number;
  avg_eltv: number;
}

interface DepartmentROI {
  department: string;
  employee_count: number;
  high_risk_count: number;
  eltv_at_risk: number;
  avg_churn_probability: number;
  recovery_potential: number;
  recommended_budget: number;
  risk_concentration: number;
  priority_score: number;
}

interface MonthlyProjection {
  month: string;
  month_index: number;
  eltv_baseline: number;
  eltv_with_treatment: number;
  cumulative_loss_baseline: number;
  cumulative_recovery: number;
  expected_departures_baseline: number;
  expected_departures_treated: number;
}

interface TreatmentROISummary {
  total_treatment_cost: number;
  total_eltv_preserved: number;
  net_benefit: number;
  overall_roi_percentage: number;
  treatments_by_type: Record<string, number>;
  avg_treatment_effectiveness: number;
}

interface ROIDashboardData {
  portfolio_summary: PortfolioSummary;
  department_breakdown: DepartmentROI[];
  timeline_projections: MonthlyProjection[];
  treatment_roi_summary: TreatmentROISummary;
  data_as_of: string;
  projection_horizon_months: number;
}

interface ROIDashboardTabProps {
  className?: string;
}

const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981'
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function ROIDashboardTab({ className }: ROIDashboardTabProps) {
  const [dashboardData, setDashboardData] = useState<ROIDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'departments' | 'timeline'>('overview');
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/playground/roi-dashboard');
      setDashboardData(response.data);
    } catch (err: any) {
      console.error('Error fetching ROI dashboard:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleExportCSV = () => {
    if (!dashboardData) return;

    const csvRows = [
      ['Department', 'Employees', 'High Risk', 'ELTV at Risk', 'Recovery Potential', 'Recommended Budget', 'Priority Score'],
      ...dashboardData.department_breakdown.map(d => [
        d.department,
        d.employee_count,
        d.high_risk_count,
        d.eltv_at_risk,
        d.recovery_potential,
        d.recommended_budget,
        d.priority_score
      ])
    ];

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `roi_dashboard_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading ROI dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Unable to load dashboard</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!dashboardData) return null;

  const { portfolio_summary, department_breakdown, timeline_projections } = dashboardData;

  // Prepare pie chart data for risk distribution
  const riskDistribution = [
    { name: 'High Risk', value: portfolio_summary.high_risk_count, color: RISK_COLORS.high },
    { name: 'Medium Risk', value: portfolio_summary.medium_risk_count, color: RISK_COLORS.medium },
    { name: 'Low Risk', value: portfolio_summary.low_risk_count, color: RISK_COLORS.low }
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Executive ROI Dashboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Data as of {new Date(dashboardData.data_as_of).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'overview', label: 'Portfolio Overview', icon: PieChart },
          { id: 'departments', label: 'Department Analysis', icon: Building2 },
          { id: 'timeline', label: 'Timeline Projections', icon: Calendar }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-4 py-2 flex items-center gap-2 border-b-2 transition-colors",
              activeSubTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Portfolio Overview Tab */}
      {activeSubTab === 'overview' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total ELTV at Risk */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-5 border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-red-600 dark:text-red-400 text-sm font-medium">ELTV at Risk</span>
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {formatCurrency(portfolio_summary.total_eltv_at_risk)}
              </div>
              <div className="text-sm text-red-600/70 dark:text-red-400/70 mt-1">
                {portfolio_summary.high_risk_count} high-risk employees
              </div>
            </div>

            {/* Recovery Potential */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-5 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">Recovery Potential</span>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {formatCurrency(portfolio_summary.recovery_potential)}
              </div>
              <div className="text-sm text-green-600/70 dark:text-green-400/70 mt-1">
                With targeted interventions
              </div>
            </div>

            {/* Aggregate ROI */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">Projected ROI</span>
                <Target className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatPercentage(portfolio_summary.aggregate_roi)}
              </div>
              <div className="text-sm text-blue-600/70 dark:text-blue-400/70 mt-1">
                Return on treatment investment
              </div>
            </div>

            {/* Total Employees */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-5 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">Total Workforce</span>
                <Users className="w-5 h-5 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {portfolio_summary.total_employees}
              </div>
              <div className="text-sm text-purple-600/70 dark:text-purple-400/70 mt-1">
                Avg ELTV: {formatCurrency(portfolio_summary.avg_eltv)}
              </div>
            </div>
          </div>

          {/* Risk Distribution Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Risk Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={riskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                      contentStyle={{
                        backgroundColor: 'var(--tooltip-bg, #1f2937)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--tooltip-text, #f9fafb)'
                      }}
                    />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Key Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Average Churn Probability</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatPercentage(portfolio_summary.avg_churn_probability * 100)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Treatments Pending</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {portfolio_summary.treatments_pending}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Treatments Applied</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {portfolio_summary.treatments_applied}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Cost of Inaction</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(portfolio_summary.total_eltv_at_risk * 0.3)} /year
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Department Analysis Tab */}
      {activeSubTab === 'departments' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Department Bar Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              ELTV at Risk by Department
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={department_breakdown.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="department" width={120} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb'
                    }}
                  />
                  <Bar dataKey="eltv_at_risk" name="ELTV at Risk">
                    {department_breakdown.slice(0, 8).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Department Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Department</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Employees</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">High Risk</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ELTV at Risk</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Recovery</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rec. Budget</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {department_breakdown.map((dept, idx) => (
                    <tr
                      key={dept.department}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => setExpandedDepartment(expandedDepartment === dept.department ? null : dept.department)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {expandedDepartment === dept.department ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="font-medium text-gray-900 dark:text-gray-100">{dept.department}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{dept.employee_count}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          dept.high_risk_count > 0
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        )}>
                          {dept.high_risk_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                        {formatCurrency(dept.eltv_at_risk)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(dept.recovery_potential)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {formatCurrency(dept.recommended_budget)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, dept.priority_score * 10)}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {dept.priority_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Timeline Projections Tab */}
      {activeSubTab === 'timeline' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* ELTV Projection Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              ELTV Projection: Baseline vs. With Treatment
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline_projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'eltv_baseline' ? 'Without Treatment' : 'With Treatment'
                    ]}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb'
                    }}
                  />
                  <Legend
                    formatter={(value) => value === 'eltv_baseline' ? 'Without Treatment' : 'With Treatment'}
                  />
                  <Line
                    type="monotone"
                    dataKey="eltv_baseline"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="eltv_baseline"
                  />
                  <Line
                    type="monotone"
                    dataKey="eltv_with_treatment"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="eltv_with_treatment"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cumulative Recovery Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Cumulative ELTV Recovery Over Time
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline_projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb'
                    }}
                  />
                  <Bar dataKey="cumulative_recovery" fill="#10b981" name="Cumulative Recovery" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Expected Departures Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Expected Departures by Month
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Without Treatment</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">With Treatment</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {timeline_projections.slice(0, 6).map((proj) => (
                    <tr key={proj.month}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{proj.month}</td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                        {proj.expected_departures_baseline}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                        {proj.expected_departures_treated}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                        {proj.expected_departures_baseline - proj.expected_departures_treated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default ROIDashboardTab;
