import React from 'react';
import { EnhancedChurnRiskDiagnosisData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, TrendingUp, Activity, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    data: EnhancedChurnRiskDiagnosisData;
}

export const EnhancedChurnRiskDiagnosisRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Risk Diagnosis: {data.targetEmployeeName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        AI-Enhanced Analysis
                    </p>
                </div>
                <div className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium border",
                    data.overallRisk > 0.7 ? "bg-red-50 text-red-700 border-red-200" :
                        data.overallRisk > 0.4 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            "bg-green-50 text-green-700 border-green-200"
                )}>
                    Risk Score: {(data.overallRisk * 100).toFixed(0)}%
                </div>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">ML Score</span>
                            <Activity className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {(data.mlScore * 100).toFixed(0)}%
                        </div>
                        <Progress value={data.mlScore * 100} className="mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">Heuristic Score</span>
                            <Brain className="w-4 h-4 text-purple-500" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {(data.heuristicScore * 100).toFixed(0)}%
                        </div>
                        <Progress value={data.heuristicScore * 100} className="mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">Confidence</span>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {(data.confidenceLevel * 100).toFixed(0)}%
                        </div>
                        <Progress value={data.confidenceLevel * 100} className="mt-2" />
                    </CardContent>
                </Card>
            </div>

            {/* Contributors & Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Key Risk Contributors</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {data.mlContributors.map((contributor: any, idx: number) => (
                                <li key={idx} className="flex items-center justify-between text-sm">
                                    <span>{contributor.feature || contributor}</span>
                                    <span className="font-medium text-red-600">
                                        {contributor.impact ? `+${(contributor.impact * 100).toFixed(1)}%` : 'High'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Heuristic Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {data.heuristicAlerts.map((alert: any, idx: number) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <span>{alert.message || alert}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {/* Reasoning & Recommendations */}
            <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        AI Reasoning
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                        {data.reasoning || data.explanation}
                    </p>
                </div>

                {data.recommendations && data.recommendations.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
                        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Recommended Actions
                        </h4>
                        <ul className="list-disc list-inside space-y-1">
                            {data.recommendations.map((rec, idx) => (
                                <li key={idx} className="text-sm text-green-800 dark:text-green-200">
                                    {rec}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};
