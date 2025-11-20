import { createFileRoute } from '@tanstack/react-router'
import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    TrendingUp,
    AlertTriangle,
    Search,
    Info,
    Bot,
    Loader2,
    FlaskConical,
    Calculator,
    Users,
    GitCompare,
    Zap,
    Activity,
    CheckCircle,
    RefreshCw,
    Plus,
    Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProject } from '@/contexts/ProjectContext';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { Employee } from '@/types/employee';
import type { TreatmentOptions, TreatmentSuggestion, ApplyTreatmentResult } from '@/types/treatment';
import { RiskIndicator } from '@/components/RiskIndicator';
import TreatmentTracker from '@/components/TreatmentTracker';
import { useDynamicRiskRanges } from '@/hooks/useDynamicRiskThresholds';
// import ReactWindow from 'react-window';
// const { FixedSizeList: List } = ReactWindow;

// Mock List component to bypass react-window build issues
const List = ({ height, itemCount, itemSize, width, children }: any) => (
    <div style={{ height, width, overflow: 'auto' }}>
        <div style={{ height: itemCount * itemSize, position: 'relative' }}>
            {Array.from({ length: itemCount }).map((_, index) => (
                <div key={index} style={{ position: 'absolute', top: index * itemSize, width: '100%', height: itemSize }}>
                    {children({ index, style: { width: '100%', height: itemSize } })}
                </div>
            ))}
        </div>
    </div>
);
import AutoSizer from 'react-virtualized-auto-sizer';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sidebar } from "@/components/layout/Sidebar";

export const Route = createFileRoute('/playground')({
    component: Playground,
})

// --- What‑If Adjustments State ---
interface WhatIfState {
    tenure: number | null;
    employee_cost: number | null;
}

// --- Local Types ---
interface SurvivalProbabilities { [key: string]: number; }

interface PlaygroundEmployeeData {
    employee_id: string;
    current_features: any;
    current_churn_probability: number;
    current_eltv: number;
    current_survival_probabilities: SurvivalProbabilities;
    shap_values: { [featureName: string]: number };
    normalized_position_level?: string;
}

// Utility functions
function formatCurrency(value: number): string {
    if (value === undefined || value === null || isNaN(value)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function convertELTVToCategory(eltv: number): 'high' | 'medium' | 'low' {
    if (eltv >= 100000) return 'high';
    if (eltv >= 50000) return 'medium';
    return 'low';
}

function formatELTVByMode(eltv: number, mode: 'quantification' | 'quality'): string {
    if (mode === 'quality') {
        const category = convertELTVToCategory(eltv);
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
    return formatCurrency(eltv);
}

// Mock Data Generation for Charts
const generateMockChartData = (baseRetention: number = 0.85) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, index) => {
        const decay = index * 0.02;
        return {
            month,
            retention: Math.max(0, (baseRetention - decay) * 100),
            treatedRetention: Math.max(0, (baseRetention - decay * 0.5) * 100) // Slower decay
        };
    });
};

function Playground() {
    const { toast } = useToast();
    const { projectId } = useProject();
    const { data: employees = [], isLoading: isDataLoading } = useGlobalDataCache();
    const riskRanges = useDynamicRiskRanges();

    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTreatments, setActiveTreatments] = useState<ApplyTreatmentResult[]>([]);
    const [whatIfState, setWhatIfState] = useState<WhatIfState>({ tenure: null, employee_cost: null });
    const [chartData, setChartData] = useState<any[]>([]);

    const selectedEmployee = useMemo(() =>
        employees.find(e => e.id === selectedEmployeeId),
        [employees, selectedEmployeeId]);

    const filteredEmployees = useMemo(() => {
        if (!searchQuery) return employees;
        const lower = searchQuery.toLowerCase();
        return employees.filter(emp =>
            emp.name.toLowerCase().includes(lower) ||
            emp.position.toLowerCase().includes(lower) ||
            emp.department.toLowerCase().includes(lower)
        );
    }, [employees, searchQuery]);

    useEffect(() => {
        if (selectedEmployee) {
            // Generate mock chart data based on employee's risk
            const baseRetention = 1 - (selectedEmployee.churnProbability || 0.2);
            setChartData(generateMockChartData(baseRetention));
        } else {
            setChartData([]);
        }
    }, [selectedEmployee]);

    const handleApplyTreatment = (treatmentName: string, cost: number, riskReduction: number) => {
        if (!selectedEmployee) return;

        const newTreatment: ApplyTreatmentResult = {
            treatmentId: Date.now(),
            treatmentName,
            cost,
            projectedRiskReduction: riskReduction,
            newChurnProbability: Math.max(0, (selectedEmployee.churnProbability || 0.5) - riskReduction),
            roi: (riskReduction * 100000) / cost, // Mock ROI calculation
            status: 'active',
            appliedAt: new Date().toISOString(),
            success: true,
            newProbability: Math.max(0, (selectedEmployee.churnProbability || 0.5) - riskReduction),
            newELTV: (selectedEmployee.eltv || 0) * (1 + riskReduction) // Mock ELTV increase
        };

        setActiveTreatments(prev => [...prev, newTreatment]);

        toast({
            title: "Treatment Applied",
            description: `Applied ${treatmentName} to ${selectedEmployee.name}`,
        });
    };

    const handleRemoveTreatment = (id: string) => {
        setActiveTreatments(prev => prev.filter(t => t.treatmentId !== Number(id)));
    };

    const EmployeeRow = ({ index, style }: { index: number, style: any }) => {
        const employee = filteredEmployees[index];
        const isSelected = selectedEmployeeId === employee.id;

        return (
            <div style={style} className="px-2 py-1">
                <button
                    onClick={() => setSelectedEmployeeId(employee.id)}
                    className={cn(
                        "w-full p-3 rounded-lg text-left transition-all flex items-center justify-between group",
                        isSelected
                            ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 border"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent"
                    )}
                >
                    <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{employee.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{employee.position}</div>
                    </div>
                    <RiskIndicator riskScore={employee.churnProbability || 0} size="sm" showIcon={false} />
                </button>
            </div>
        );
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
            {/* Sidebar */}
            <div className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="font-semibold mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        Team Members
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search employees..."
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex-1">
                    <AutoSizer>
                        {({ height, width }) => (
                            <List
                                height={height}
                                itemCount={filteredEmployees.length}
                                itemSize={70}
                                width={width}
                            >
                                {EmployeeRow}
                            </List>
                        )}
                    </AutoSizer>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-auto p-8 space-y-6">
                {/* Header */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">ELTV Treatment Playground</h1>
                        <Badge variant="secondary" className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 hover:bg-teal-200 border-0">Atlas by ChurnVision</Badge>
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 border-0">Beta</Badge>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 max-w-3xl">
                        Simulate retention scenarios. Select an employee, choose a treatment, and see the projected impact on ELTV and churn risk.
                    </p>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chart Section */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle>Scenario Comparison - Retention Probability</CardTitle>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-8">
                                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!selectedEmployee ? (
                                <div className="h-[300px] flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-3 text-blue-600 dark:text-blue-400">
                                        <Activity className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-medium text-slate-900 dark:text-slate-100">No Employee Selected</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                                        Select an employee from the sidebar to view their retention curve and simulate treatments.
                                    </p>
                                </div>
                            ) : (
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorRetention" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorTreated" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={value => `${value}%`} />
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                            />
                                            <Legend />
                                            <Area
                                                type="monotone"
                                                dataKey="retention"
                                                name="Baseline Retention"
                                                stroke="#3b82f6"
                                                strokeWidth={2}
                                                fillOpacity={1}
                                                fill="url(#colorRetention)"
                                            />
                                            {activeTreatments.length > 0 && (
                                                <Area
                                                    type="monotone"
                                                    dataKey="treatedRetention"
                                                    name="With Treatments"
                                                    stroke="#10b981"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                    fill="url(#colorTreated)"
                                                />
                                            )}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* AI Treatments */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500" />
                                AI Suggestions
                            </CardTitle>
                            <CardDescription>Recommended actions to reduce churn risk</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!selectedEmployee ? (
                                <div className="flex flex-col items-center justify-center h-[300px] text-center text-muted-foreground">
                                    <Bot className="w-8 h-8 mb-2 opacity-50" />
                                    <p className="text-sm">Select an employee to generate suggestions</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {[
                                        { name: 'Salary Adjustment', cost: 5000, impact: 0.15, type: 'Financial' },
                                        { name: 'Leadership Training', cost: 2000, impact: 0.08, type: 'Development' },
                                        { name: 'Remote Work Option', cost: 0, impact: 0.12, type: 'Policy' },
                                        { name: 'Mentorship Program', cost: 500, impact: 0.05, type: 'Support' },
                                    ].map((treatment, idx) => (
                                        <div key={idx} className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-md transition-all">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100">{treatment.name}</h4>
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">{treatment.type}</span>
                                                </div>
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                                    -{Math.round(treatment.impact * 100)}% Risk
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between mt-3">
                                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                                                    Est. Cost: ${treatment.cost}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                                    onClick={() => handleApplyTreatment(treatment.name, treatment.cost, treatment.impact)}
                                                >
                                                    Apply
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* What-If Analysis */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FlaskConical className="w-5 h-5 text-orange-500" />
                            What-If Analysis
                        </CardTitle>
                        <CardDescription>Adjust parameters to see potential impact on risk score</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tenure (Months)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Current"
                                        value={whatIfState.tenure || ''}
                                        onChange={(e) => setWhatIfState(prev => ({ ...prev, tenure: parseInt(e.target.value) || null }))}
                                    />
                                    <span className="text-sm text-slate-500">months</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Salary ($)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Current"
                                        value={whatIfState.employee_cost || ''}
                                        onChange={(e) => setWhatIfState(prev => ({ ...prev, employee_cost: parseInt(e.target.value) || null }))}
                                    />
                                    <span className="text-sm text-slate-500">/year</span>
                                </div>
                            </div>
                            <div className="flex items-end">
                                <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                                    <Calculator className="w-4 h-4 mr-2" />
                                    Recalculate Risk
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Treatment Tracker Overlay */}
            <TreatmentTracker
                activeTreatments={activeTreatments}
                onRemoveTreatment={handleRemoveTreatment}
            />
        </div>
    );
}
