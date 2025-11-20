import React from 'react';
import { EnhancedExitPatternMiningData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Search, AlertCircle } from 'lucide-react';

interface Props {
    data: EnhancedExitPatternMiningData;
}

export const EnhancedExitPatternMiningRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Exit Pattern Mining
                </h3>
            </div>

            {data.summary && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pattern Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            {data.summary}
                        </p>
                    </CardContent>
                </Card>
            )}

            {data.insights && (
                <Card className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
                            <Search className="w-4 h-4" />
                            Identified Patterns
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
