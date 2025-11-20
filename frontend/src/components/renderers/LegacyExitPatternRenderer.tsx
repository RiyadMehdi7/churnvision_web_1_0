import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, AlertTriangle } from 'lucide-react';

interface Props {
    data: any;
}

const LegacyExitPatternRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Exit Pattern Analysis (Legacy)
                </h3>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Identified Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3">
                        {data.patterns && data.patterns.map((pattern: any, idx: number) => (
                            <li key={idx} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">{pattern.name || pattern.pattern}</div>
                                    <div className="text-sm text-gray-500 mt-1">{pattern.description}</div>
                                    {pattern.frequency && (
                                        <div className="text-xs text-gray-400 mt-2">Frequency: {pattern.frequency}</div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
};

export default LegacyExitPatternRenderer;
