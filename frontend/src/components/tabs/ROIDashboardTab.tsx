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
  ChevronUp,
  Activity,
  Wallet,
  Clock
} from 'lucide-react';
import { cn, colors } from '@/lib/utils';
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
import api from '@/services/apiService';
import { ExecutiveSummaryCard } from '@/components/playground/redesigned/ExecutiveSummaryCard';

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

// Clean metric card component matching design system
const MetricCard: React.FC<{
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'danger' | 'success' | 'warning' | 'info';
}> = ({ label, value, subtext, icon, trend, trendValue, variant = 'default' }) => {
  const variantStyles = {
    default: 'text-gray-600 dark:text-gray-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400'
  };

  const iconBgStyles = {
    default: 'bg-gray-100 dark:bg-gray-700',
    danger: 'bg-red-50 dark:bg-red-900/20',
    success: 'bg-emerald-50 dark:bg-emerald-900/20',
    warning: 'bg-amber-50 dark:bg-amber-900/20',
    info: 'bg-blue-50 dark:bg-blue-900/20'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
          <p className={cn("text-2xl font-bold", variantStyles[variant])}>
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtext}</p>
          )}
          {trend && trendValue && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend === 'up' ? "text-emerald-600" : trend === 'down' ? "text-red-600" : "text-gray-500"
            )}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
               trend === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
              {trendValue}
            </div>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg", iconBgStyles[variant])}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
};

// Clean section card component
const SectionCard: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, children, className }) => (
  <div className={cn("bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden", className)}>
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
      )}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

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
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <span className="text-sm text-gray-600 dark:text-gray-400">Loading ROI dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Unable to load dashboard</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
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

  const subTabs = [
    { id: 'overview', label: 'Portfolio Overview', icon: PieChart },
    { id: 'departments', label: 'Department Analysis', icon: Building2 },
    { id: 'timeline', label: 'Timeline Projections', icon: Calendar }
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Executive ROI Dashboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Data as of {new Date(dashboardData.data_as_of).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "px-4 py-2.5 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeSubTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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
          {/* Executive Summary Hero Card - NEW */}
          <ExecutiveSummaryCard
            totalEmployees={portfolio_summary.total_employees}
            highRiskCount={portfolio_summary.high_risk_count}
            mediumRiskCount={portfolio_summary.medium_risk_count}
            totalEltvAtRisk={portfolio_summary.total_eltv_at_risk}
            recoveryPotential={portfolio_summary.recovery_potential}
            aggregateRoi={portfolio_summary.aggregate_roi}
            avgChurnProbability={portfolio_summary.avg_churn_probability}
            treatmentsApplied={portfolio_summary.treatments_applied}
          />

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="ELTV at Risk"
              value={formatCurrency(portfolio_summary.total_eltv_at_risk)}
              subtext={`${portfolio_summary.high_risk_count} high-risk employees`}
              icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
              variant="danger"
            />
            <MetricCard
              label="Recovery Potential"
              value={formatCurrency(portfolio_summary.recovery_potential)}
              subtext="With targeted interventions"
              icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
              variant="success"
            />
            <MetricCard
              label="Projected ROI"
              value={formatPercentage(portfolio_summary.aggregate_roi)}
              subtext="Return on treatment investment"
              icon={<Target className="w-5 h-5 text-blue-500" />}
              variant="info"
            />
            <MetricCard
              label="Total Workforce"
              value={portfolio_summary.total_employees.toLocaleString()}
              subtext={`Avg ELTV: ${formatCurrency(portfolio_summary.avg_eltv)}`}
              icon={<Users className="w-5 h-5 text-purple-500" />}
              variant="default"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Distribution */}
            <SectionCard
              title="Risk Distribution"
              icon={<PieChart className="w-4 h-4" />}
              description="Employee distribution by risk level"
            >
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
                      labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                    >
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value as number, name as string]}
                      contentStyle={{
                        backgroundColor: colors.tooltip.light,
                        border: 'none',
                        borderRadius: '8px',
                        color: '#f9fafb',
                        fontSize: '12px'
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-sm text-gray-600 dark:text-gray-400">{value}</span>}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            {/* Key Metrics */}
            <SectionCard
              title="Key Metrics"
              icon={<Activity className="w-4 h-4" />}
              description="Portfolio health indicators"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Average Churn Probability</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatPercentage(portfolio_summary.avg_churn_probability * 100)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Treatments Pending</span>
                  </div>
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {portfolio_summary.treatments_pending}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Treatments Applied</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {portfolio_summary.treatments_applied}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Cost of Inaction</span>
                  </div>
                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(portfolio_summary.total_eltv_at_risk * 0.3)} /year
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </motion.div>
      )}

      {/* Department Analysis Tab */}
      {activeSubTab === 'departments' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Department Bar Chart */}
          <SectionCard
            title="ELTV at Risk by Department"
            icon={<BarChart3 className="w-4 h-4" />}
            description="Top departments ranked by total value at risk"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={department_breakdown.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    width={120}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), 'ELTV at Risk']}
                    contentStyle={{
                      backgroundColor: colors.tooltip.light,
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="eltv_at_risk" radius={[0, 4, 4, 0]}>
                    {department_breakdown.slice(0, 8).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Department Table */}
          <SectionCard
            title="Department Details"
            icon={<Building2 className="w-4 h-4" />}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto -m-5">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employees</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">High Risk</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ELTV at Risk</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recovery</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rec. Budget</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {department_breakdown.map((dept) => (
                    <tr
                      key={dept.department}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedDepartment(expandedDepartment === dept.department ? null : dept.department)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {expandedDepartment === dept.department ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{dept.department}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">{dept.employee_count}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          dept.high_risk_count > 0
                            ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        )}>
                          {dept.high_risk_count}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-red-600 dark:text-red-400">
                        {formatCurrency(dept.eltv_at_risk)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(dept.recovery_potential)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-gray-600 dark:text-gray-400">
                        {formatCurrency(dept.recommended_budget)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, dept.priority_score * 10)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-8">
                            {dept.priority_score.toFixed(1)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
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
          <SectionCard
            title="ELTV Projection"
            icon={<TrendingUp className="w-4 h-4" />}
            description="Comparing baseline trajectory vs. with treatment interventions"
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline_projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(value as number),
                      (name as string) === 'eltv_baseline' ? 'Without Treatment' : 'With Treatment'
                    ]}
                    contentStyle={{
                      backgroundColor: colors.tooltip.light,
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px'
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend
                    formatter={(value) => value === 'eltv_baseline' ? 'Without Treatment' : 'With Treatment'}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="eltv_baseline"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 5"
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
          </SectionCard>

          {/* Cumulative Recovery Chart */}
          <SectionCard
            title="Cumulative ELTV Recovery"
            icon={<DollarSign className="w-4 h-4" />}
            description="Total value preserved through intervention over time"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline_projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(v)}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), 'Cumulative Recovery']}
                    contentStyle={{
                      backgroundColor: colors.tooltip.light,
                      border: 'none',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px'
                    }}
                  />
                  <Bar
                    dataKey="cumulative_recovery"
                    fill="#10b981"
                    name="Cumulative Recovery"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Expected Departures Table */}
          <SectionCard
            title="Expected Departures by Month"
            icon={<Users className="w-4 h-4" />}
            description="Projected headcount impact comparison"
          >
            <div className="overflow-x-auto -m-5">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Month</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Without Treatment</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">With Treatment</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employees Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {timeline_projections.slice(0, 6).map((proj) => {
                    const saved = proj.expected_departures_baseline - proj.expected_departures_treated;
                    return (
                      <tr key={proj.month} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{proj.month}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-red-600 dark:text-red-400">
                          {proj.expected_departures_baseline}
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm text-emerald-600 dark:text-emerald-400">
                          {proj.expected_departures_treated}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            saved > 0
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                          )}>
                            +{saved}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </motion.div>
      )}
    </div>
  );
}

export default ROIDashboardTab;
