import React from 'react';
import type { PeerRetentionComparisonData } from '@/types/analysisData';
import { Users, BarChart3 } from 'lucide-react';

const PeerRetentionComparisonRenderer: React.FC<{ data: PeerRetentionComparisonData }> = ({ data }) => {
  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      <div className="border-b p-6 bg-gray-50 dark:bg-gray-700/30 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center">
          <Users size={20} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Peer Comparison</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{data.targetEmployeeName} vs {data.retainedPeerGroupName}</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {data.comparisonFactors?.length ? data.comparisonFactors.map((f, idx) => (
          <div key={idx} className="p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">{f.factor}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <BarChart3 size={14} />
                Peer Avg: {f.peerAverage}
              </div>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">Target: {f.targetValue}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{f.insight}</div>
          </div>
        )) : (
          <div className="text-sm text-gray-600 dark:text-gray-300">No comparison factors available.</div>
        )}
      </div>
      {data.summaryInsight && (
        <div className="p-6 border-t bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200">
          {data.summaryInsight}
        </div>
      )}
    </div>
  );
};

export default PeerRetentionComparisonRenderer;

