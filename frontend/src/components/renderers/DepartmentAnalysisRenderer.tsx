import React from 'react';
import { DepartmentAnalysisData } from '@/types/analysisData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, TrendingDown } from 'lucide-react';

interface Props {
    data: DepartmentAnalysisData;
}

export const DepartmentAnalysisRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Department Analysis
                </h3>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {data.summary}
                    </p>
                </CardContent>
            </Card>

            {/* Render additional dynamic fields if present */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(data).map(([key, value], idx) => {
                    if (['type', 'analysisType', 'summary'].includes(key)) return null;
                    if (typeof value === 'object') return null; // Skip complex objects for now

                    return (
                        <Card key={idx}>
                            <CardContent className="pt-6">
                                <div className="text-sm text-gray-500 capitalize mb-1">{key.replace(/_/g, ' ')}</div>
                                <div className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                    {String(value)}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};
