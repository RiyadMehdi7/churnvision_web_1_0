import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, AlertCircle } from 'lucide-react';

// Define a local type if not available in shared types yet, or use 'any' for flexibility during porting
interface Props {
    data: any;
}

const PeerRetentionComparisonRenderer: React.FC<Props> = ({ data }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Peer Retention Comparison
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Retention Rate vs Peers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-4">
                            <div>
                                <div className="text-sm text-gray-500 mb-1">Target Group</div>
                                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                    {data.targetGroupRetention ? `${(data.targetGroupRetention * 100).toFixed(1)}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
                            <div>
                                <div className="text-sm text-gray-500 mb-1">Peer Average</div>
                                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                                    {data.peerAverageRetention ? `${(data.peerAverageRetention * 100).toFixed(1)}%` : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Key Differentiators</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {data.differentiators && data.differentiators.map((item: any, idx: number) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {data.analysis && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2">Comparative Insight</h4>
                    <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">
                        {data.analysis}
                    </p>
                </div>
            )}
        </div>
    );
};

export default PeerRetentionComparisonRenderer;
