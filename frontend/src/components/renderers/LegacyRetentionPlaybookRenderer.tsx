import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, CheckSquare } from 'lucide-react';

interface Props {
    data: any;
}

export const LegacyRetentionPlaybookRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <BookOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Retention Playbook (Legacy)
                </h3>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recommended Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3">
                        {data.actions && data.actions.map((action: any, idx: number) => (
                            <li key={idx} className="flex items-start gap-3">
                                <CheckSquare className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{action}</span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
};
