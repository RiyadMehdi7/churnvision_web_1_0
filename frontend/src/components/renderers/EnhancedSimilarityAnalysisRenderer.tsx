import React from 'react';
import { EnhancedSimilarityAnalysisData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, GitCompare, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    data: EnhancedSimilarityAnalysisData;
}

export const EnhancedSimilarityAnalysisRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <GitCompare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Similarity Analysis
                    </h3>
                    <p className="text-sm text-gray-500">
                        Comparing <span className="font-medium">{data.targetEmployee.name}</span> with similar profiles
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Similar Employees</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.similarEmployees.map((employee: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium">
                                            {employee.name?.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
                                            <div className="text-xs text-gray-500">{employee.position}</div>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "text-xs font-medium px-2 py-1 rounded",
                                        employee.similarity > 0.8 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                    )}>
                                        {(employee.similarity * 100).toFixed(0)}% Match
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Shared Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {data.patterns && Object.entries(data.patterns).map(([key, value]: [string, any], idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <span>
                                        <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">{key.replace(/_/g, ' ')}:</span> {String(value)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Analysis Summary</h4>
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                    {data.analysis}
                </p>
            </div>
        </div>
    );
};
