import React from 'react';
import { EnhancedRetentionPlaybookData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Target, Shield, ListChecks } from 'lucide-react';

interface Props {
    data: EnhancedRetentionPlaybookData;
}

export const EnhancedRetentionPlaybookRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Retention Playbook: {data.targetEmployeeName}
                    </h3>
                    <p className="text-sm text-gray-500">
                        Stage: <span className="font-medium text-blue-600">{data.stage}</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Target className="w-4 h-4 text-red-500" />
                            Primary Risk Factors
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            {data.primaryRiskFactors.map((factor, idx) => (
                                <li key={idx}>{factor}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Shield className="w-4 h-4 text-green-500" />
                            Success Indicators
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            {data.successIndicators.map((indicator, idx) => (
                                <li key={idx}>{indicator}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <ListChecks className="w-4 h-4" />
                        Action Plan
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {data.actionPlan.map((action: any, idx: number) => (
                            <div key={idx} className="flex gap-3 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                </div>
                                <div>
                                    <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {action.title || action.step || action}
                                    </h5>
                                    {action.description && (
                                        <p className="text-xs text-gray-500 mt-1">{action.description}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg text-sm text-gray-600 dark:text-gray-300 italic">
                "{data.summary}"
            </div>
        </div>
    );
};
