import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    Database,
    CheckCircle,
    XCircle,
    Clock,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Users,
    DollarSign,
    AlertTriangle,
    Wifi,
    WifiOff,
    RefreshCw,
    Calendar,
    Target,
    Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import treatmentTrackingService, { TreatmentApplication as AppType, TreatmentEffectiveness as EffType, ABTestResult as ABType } from '@/services/treatmentTrackingService';
import api from '@/services/apiService';
import { useProject } from '@/contexts/ProjectContext';

interface TreatmentApplication {
    id: number;
    employee_id: string;
    hr_code: string;
    treatment_name: string;
    treatment_type: string;
    predicted_churn_reduction: number;
    predicted_cost: number;
    predicted_roi: number;
    actual_cost?: number;
    applied_date: string;
    status: 'applied' | 'active' | 'completed' | 'cancelled';
    ab_group: 'control' | 'treatment';
}

interface TreatmentEffectiveness {
    treatment_type: string;
    treatment_name: string;
    total_applications: number;
    successful_retentions: number;
    effectiveness_rate: number;
    average_cost: number;
    roi_ratio: number;
    statistical_significance: boolean;
    sample_size: number;
}

interface ABTestResult {
    test_name: string;
    group_assignment: 'control' | 'treatment';
    group_size: number;
    avg_baseline_risk: number;
    retained_count: number;
    churned_count: number;
    retention_rate: number;
}

interface TreatmentTrackerProps {
    selectedEmployee?: {
        hr_code: string;
        name: string;
        churn_probability: number;
    };
    isVisible: boolean;
    hasDBConnection: boolean;
    isPerformanceMode?: boolean;
}

export const TreatmentTracker: React.FC<TreatmentTrackerProps> = ({
    selectedEmployee,
    isVisible,
    hasDBConnection,
    isPerformanceMode = false
}) => {
    const { toast } = useToast();

    // State management
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'tracking' | 'effectiveness' | 'ab-tests' | 'uplift'>('tracking');
    const [employeeTreatments, setEmployeeTreatments] = useState<AppType[]>([]);
    const [treatmentEffectiveness, setTreatmentEffectiveness] = useState<EffType[]>([]);
    const [abTestResults, setAbTestResults] = useState<ABType[]>([]);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(hasDBConnection);
    const [upliftBasic, setUpliftBasic] = useState<any[]>([]);
    const [upliftCuped, setUpliftCuped] = useState<any[]>([]);
    const { activeProject } = useProject();

    // Load data when component becomes visible
    useEffect(() => {
        if (isVisible && hasDBConnection) {
            loadTreatmentData();
        }
    }, [isVisible, hasDBConnection, selectedEmployee]);

    // Load treatment tracking data
    const loadTreatmentData = async () => {
        if (!hasDBConnection || !activeProject?.id) return;

        setIsLoading(true);
        try {
            // Load employee treatments if selected
            if (selectedEmployee) {
                const apps = await treatmentTrackingService.getEmployeeApplications(activeProject.id, selectedEmployee.hr_code);
                setEmployeeTreatments(apps);
            }

            // Load overall effectiveness data
            const effectiveness = await treatmentTrackingService.getEffectiveness(activeProject.id);
            setTreatmentEffectiveness(effectiveness);

            // Load A/B test results
            const abTests = await treatmentTrackingService.getABTests(activeProject.id);
            setAbTestResults(abTests);

            // Get last sync time
            const syncTime = await treatmentTrackingService.getLastSync(activeProject.id);
            setLastSyncTime(syncTime);

            // Load uplift summary via API
            try {
                const basic = await api.get('/api/eltv/uplift/basic', { params: { projectId: activeProject.id } });
                setUpliftBasic(basic.data?.data || []);
                const tr = await api.get('/api/eltv/uplift/tr', { params: { projectId: activeProject.id } });
                setUpliftCuped(tr.data?.data || []);
            } catch (e) {
                console.warn('Failed to load uplift summary', e);
            }

            setIsConnected(true);
        } catch (error) {
            console.error('Failed to load treatment data:', error);
            setIsConnected(false);
            toast({
                title: "Error",
                description: "Failed to load treatment tracking data",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Sync with HR system
    const syncWithHR = async () => {
        if (!hasDBConnection || !activeProject?.id) return;

        setIsLoading(true);
        try {
            // Get connection details from API or use default
            const connectionDetails = {};
            const result = await treatmentTrackingService.syncHR(activeProject.id, connectionDetails);

            if (result?.records_updated !== undefined) {
                toast({
                    title: "Sync Completed",
                    description: `Updated ${result.records_updated} employee records`,
                });

                // Reload data after sync
                await loadTreatmentData();
            } else {
                throw new Error('Sync failed');
            }
        } catch (error: any) {
            toast({
                title: "Sync Failed",
                description: error?.message || "Failed to sync with HR system",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Apply treatment to selected employee (enhanced with tracking)
    const applyTreatmentWithTracking = async (treatment: any, abGroup: 'control' | 'treatment' = 'treatment') => {
        if (!selectedEmployee || !hasDBConnection) return;

        try {
            // Apply treatment through API
            const response = await api.post('/playground/apply-treatment', {
                hr_code: selectedEmployee.hr_code,
                treatment_id: treatment.id
            });
            const result = response.data;

            // Record treatment application for tracking
            if (result) {
                try {
                    const r: any = result as any;
                    const preProb = r.pre_churn_probability ?? r.preChurnProbability ?? selectedEmployee.churn_probability;
                    const postProb = r.post_churn_probability ?? r.postChurnProbability ?? Math.max(0, (preProb || 0) * (1 - (treatment.effectSize || 0)));
                    const preEltv = r.pre_eltv ?? r.eltv_pre_treatment ?? 0;
                    const postEltv = r.post_eltv ?? r.eltv_post_treatment ?? 0;
                    const roi = result.roi ?? 0;

                    await api.post('/treatment/record-application', {
                        hr_code: selectedEmployee.hr_code,
                        treatment_id: treatment.id,
                        treatment_name: treatment.name,
                        cost: treatment.cost || result.treatment_cost || 0,
                        pre_churn_probability: preProb || 0,
                        post_churn_probability: postProb || 0,
                        pre_eltv: preEltv,
                        post_eltv: postEltv,
                        roi,
                        success_indicator: 'pending',
                        notes: `AB: ${abGroup}`,
                        applied_by: 'user',
                        is_simulation: false,
                    });
                } catch (err) {
                    console.error('Failed to record treatment application:', err);
                }
                // Reload treatment data
                await loadTreatmentData();
            }

            return result;
        } catch (error) {
            console.error('Failed to apply treatment with tracking:', error);
            throw error;
        }
    };

    // Create A/B test
    const createABTest = async () => {
        if (!hasDBConnection || !activeProject?.id) return;

        try {
            const created = await treatmentTrackingService.createABTest(activeProject.id);
            if (created?.testName) {
                toast({
                    title: "A/B Test Created",
                    description: `Created test "${created.testName}" with ${created.control?.length || 0} control and ${created.treatment?.length || 0} treatment employees`,
                });

                await loadTreatmentData();
            }
        } catch (error: any) {
            toast({
                title: "Failed to Create A/B Test",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    if (!isVisible) return null;

    if (!hasDBConnection) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-6"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                        <Database className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                            Database Connection Required
                        </h3>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            Treatment tracking requires an active database connection to your HR system.
                            Connect to enable real-time validation and A/B testing.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Treatment Validation & A/B Testing
                            </h2>
                            <div className="flex items-center gap-4 mt-1">
                                <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                    {isConnected ? (
                                        <>
                                            <Wifi className="w-4 h-4 text-green-500" />
                                            <span>Connected</span>
                                        </>
                                    ) : (
                                        <>
                                            <WifiOff className="w-4 h-4 text-red-500" />
                                            <span>Disconnected</span>
                                        </>
                                    )}
                                </div>
                                {lastSyncTime && (
                                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                        <Clock className="w-4 h-4" />
                                        <span>Last sync: {new Date(lastSyncTime).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={syncWithHR}
                            disabled={isLoading || !isConnected}
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Sync HR
                        </Button>

                        <Button
                            onClick={createABTest}
                            disabled={isLoading || !isConnected}
                            size="sm"
                            className="flex items-center gap-2"
                        >
                            <Target className="w-4 h-4" />
                            Create A/B Test
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex gap-1">
                    {[
                        { id: 'tracking', label: 'Active Treatments', icon: Activity },
                        { id: 'effectiveness', label: 'Effectiveness', icon: BarChart3 },
                        { id: 'ab-tests', label: 'A/B Tests', icon: Users },
                        { id: 'uplift', label: 'Uplift', icon: BarChart3 }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === tab.id
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
                <AnimatePresence mode="wait">
                    {activeTab === 'tracking' && (
                        <motion.div
                            key="tracking"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                {selectedEmployee ? `Treatments for ${selectedEmployee.name}` : 'Select an employee to view treatments'}
                            </h3>

                            {selectedEmployee && employeeTreatments.length > 0 ? (
                                <div className="space-y-3">
                                    {employeeTreatments.map(treatment => (
                                        <div
                                            key={treatment.id}
                                            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                                            {treatment.treatment_name}
                                                        </span>
                                                        <span className={`px-2 py-1 text-xs rounded-full ${treatment.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                                                treatment.status === 'active' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                                    treatment.status === 'applied' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                                                        'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                                            }`}>
                                                            {treatment.status}
                                                        </span>
                                                        <span className={`px-2 py-1 text-xs rounded-full ${treatment.ab_group === 'treatment'
                                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                                            }`}>
                                                            {treatment.ab_group}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                        <div>
                                                            <span className="text-gray-500 dark:text-gray-400">Applied:</span>
                                                            <p className="font-medium">{new Date(treatment.applied_date).toLocaleDateString()}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 dark:text-gray-400">Predicted Impact:</span>
                                                            <p className="font-medium">{(treatment.predicted_churn_reduction * 100).toFixed(1)}%</p>
                                                        </div>
                                                        {!isPerformanceMode && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Cost:</span>
                                                                <p className="font-medium">${treatment.actual_cost || treatment.predicted_cost}</p>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="text-gray-500 dark:text-gray-400">Predicted ROI:</span>
                                                            <p className="font-medium">{treatment.predicted_roi.toFixed(1)}x</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : selectedEmployee ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No treatments applied to this employee yet
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    Select an employee from the list to view their treatment history
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'effectiveness' && (
                        <motion.div
                            key="effectiveness"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                Treatment Effectiveness Analysis
                            </h3>

                            {treatmentEffectiveness.length > 0 ? (
                                <div className="space-y-4">
                                    {treatmentEffectiveness.map((item, index) => (
                                        <div
                                            key={index}
                                            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                                    {item.treatment_name}
                                                </h4>
                                                <div className="flex items-center gap-2">
                                                    {item.statistical_significance && (
                                                        <Award className="w-4 h-4 text-green-500" />
                                                    )}
                                                    <span className={`px-2 py-1 text-xs rounded-full ${item.effectiveness_rate > 0.7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                                            item.effectiveness_rate > 0.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                        }`}>
                                                        {(item.effectiveness_rate * 100).toFixed(1)}% effective
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Applications:</span>
                                                    <p className="font-medium">{item.total_applications}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Successful:</span>
                                                    <p className="font-medium text-green-600 dark:text-green-400">
                                                        {item.successful_retentions}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Avg Cost:</span>
                                                    <p className="font-medium">${item.average_cost.toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">ROI Ratio:</span>
                                                    <p className="font-medium">{item.roi_ratio.toFixed(1)}x</p>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400">Sample Size:</span>
                                                    <p className="font-medium">{item.sample_size}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No effectiveness data available yet. Apply treatments and sync with HR to see results.
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'ab-tests' && (
                        <motion.div
                            key="ab-tests"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                A/B Test Results
                            </h3>

                            {abTestResults.length > 0 ? (
                                <div className="space-y-6">
                                    {/* Group A/B test results by test name */}
                                    {Object.entries(
                                        abTestResults.reduce((acc, result) => {
                                            if (!acc[result.test_name]) acc[result.test_name] = [];
                                            acc[result.test_name].push(result);
                                            return acc;
                                        }, {} as Record<string, ABTestResult[]>)
                                    ).map(([testName, results]) => (
                                        <div
                                            key={testName}
                                            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                                        >
                                            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                                                {testName}
                                            </h4>

                                            <div className="grid md:grid-cols-2 gap-4">
                                                {results.map(result => (
                                                    <div
                                                        key={`${testName}-${result.group_assignment}`}
                                                        className={`p-3 rounded border ${result.group_assignment === 'treatment'
                                                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                                : 'bg-gray-100 dark:bg-gray-600/50 border-gray-300 dark:border-gray-500'
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="font-medium capitalize">
                                                                {result.group_assignment} Group
                                                            </span>
                                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                                {result.group_size} employees
                                                            </span>
                                                        </div>

                                                        <div className="space-y-1 text-sm">
                                                            <div className="flex justify-between">
                                                                <span>Retained:</span>
                                                                <span className="font-medium text-green-600 dark:text-green-400">
                                                                    {result.retained_count}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span>Churned:</span>
                                                                <span className="font-medium text-red-600 dark:text-red-400">
                                                                    {result.churned_count}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span>Retention Rate:</span>
                                                                <span className="font-medium">
                                                                    {result.retention_rate.toFixed(1)}%
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span>Avg Baseline Risk:</span>
                                                                <span className="font-medium">
                                                                    {(result.avg_baseline_risk * 100).toFixed(1)}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Calculate and show comparison */}
                                            {results.length === 2 && (
                                                <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded border">
                                                    <div className="text-sm">
                                                        <span className="font-medium">Treatment Effect: </span>
                                                        {(() => {
                                                            const treatment = results.find(r => r.group_assignment === 'treatment');
                                                            const control = results.find(r => r.group_assignment === 'control');
                                                            if (treatment && control) {
                                                                const effect = treatment.retention_rate - control.retention_rate;
                                                                return (
                                                                    <span className={`font-medium ${effect > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                                        }`}>
                                                                        {effect > 0 ? '+' : ''}{effect.toFixed(1)}% retention improvement
                                                                    </span>
                                                                );
                                                            }
                                                            return 'Calculating...';
                                                        })()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No A/B tests created yet. Create a test to compare treatment effectiveness.
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'uplift' && (
                        <motion.div
                            key="uplift"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Uplift Summary</h3>
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Baseline (Diff-in-Proportions)</h4>
                                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-800">
                                            <tr>
                                                <th className="px-2 py-2 text-left">Treatment</th>
                                                <th className="px-2 py-2 text-right">T</th>
                                                <th className="px-2 py-2 text-right">C</th>
                                                <th className="px-2 py-2 text-right">Rate T</th>
                                                <th className="px-2 py-2 text-right">Rate C</th>
                                                <th className="px-2 py-2 text-right">Uplift</th>
                                                <th className="px-2 py-2 text-right">95% CI</th>
                                                <th className="px-2 py-2 text-right">p</th>
                                                <th className="px-2 py-2 text-right">Power≥80%</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {upliftBasic.length === 0 ? (
                                                <tr><td className="px-2 py-3 text-gray-500" colSpan={9}>No data</td></tr>
                                            ) : upliftBasic.map((r, idx) => (
                                                <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                                                    <td className="px-2 py-2">{r.treatment_name}</td>
                                                    <td className="px-2 py-2 text-right">{r.n_treatment}</td>
                                                    <td className="px-2 py-2 text-right">{r.n_control}</td>
                                                    <td className="px-2 py-2 text-right">{(r.retention_rate_t * 100).toFixed(1)}%</td>
                                                    <td className="px-2 py-2 text-right">{(r.retention_rate_c * 100).toFixed(1)}%</td>
                                                    <td className="px-2 py-2 text-right">{(r.uplift * 100).toFixed(1)}%</td>
                                                    <td className="px-2 py-2 text-right">[{(r.ci_low * 100).toFixed(1)}%, {(r.ci_high * 100).toFixed(1)}%]</td>
                                                    <td className="px-2 py-2 text-right">{r.p_value?.toFixed(3)}</td>
                                                    <td className="px-2 py-2 text-right">{r.power_80 ? 'Yes' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold mb-2">CUPED-Adjusted</h4>
                                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-800">
                                            <tr>
                                                <th className="px-2 py-2 text-left">Treatment</th>
                                                <th className="px-2 py-2 text-right">Uplift (CUPED)</th>
                                                <th className="px-2 py-2 text-right">θ</th>
                                                <th className="px-2 py-2 text-right">Variance Reduction</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {upliftCuped.length === 0 ? (
                                                <tr><td className="px-2 py-3 text-gray-500" colSpan={4}>No data</td></tr>
                                            ) : upliftCuped.map((r, idx) => (
                                                <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                                                    <td className="px-2 py-2">{r.treatment_name}</td>
                                                    <td className="px-2 py-2 text-right">{(r.uplift_cuped * 100).toFixed(1)}%</td>
                                                    <td className="px-2 py-2 text-right">{r.cuped_theta?.toFixed(3)}</td>
                                                    <td className="px-2 py-2 text-right">{((r.cuped_variance_reduction || 0) * 100).toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">CUPED adjusts for baseline differences to reduce variance.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default TreatmentTracker;
