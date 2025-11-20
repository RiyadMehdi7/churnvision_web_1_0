import React from 'react';
import { WorkforceTrendsAnalysisData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Users, TrendingUp } from 'lucide-react';

interface Props {
    data: WorkforceTrendsAnalysisData;
}

export const WorkforceTrendsAnalysisRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <BarChart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Workforce Trends Analysis
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <div className="text-sm text-gray-500 mb-1">Total Employees</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {data.statistics.totalEmployees.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
                {/* Add more stat cards based on available data in statistics object */}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>{data.analysis}</p>
                    </div>
                </CardContent>
            </Card>

            {data.insights && (
                <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-purple-700 dark:text-purple-300">
                            <TrendingUp className="w-4 h-4" />
                            Key Insights
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            {Array.isArray(data.insights) ? data.insights.map((insight: any, idx: number) => (
                                <li key={idx}>{insight}</li>
                            )) : (
                                <li>{JSON.stringify(data.insights)}</li>
                            )}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
