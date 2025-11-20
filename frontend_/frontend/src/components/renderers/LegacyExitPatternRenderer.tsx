import React from 'react';
import type { LegacyExitPatternData } from '@/types/analysisData';
import { LineChart } from 'lucide-react';

const LegacyExitPatternRenderer: React.FC<{ data: LegacyExitPatternData }> = ({ data }) => {
  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      <div className="border-b p-6 bg-gray-50 dark:bg-gray-700/30 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center">
          <LineChart size={20} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Exit Pattern Mining</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">AI-identified organizational exit patterns</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {data.patterns?.length ? data.patterns.map((p, idx) => (
          <div key={idx} className="p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <div className="font-semibold text-gray-900 dark:text-gray-100">{p.pattern}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {typeof p.percentage === 'number' ? `Frequency: ${(p.percentage * 100).toFixed(1)}%` : ''}
              {typeof p.count === 'number' ? ` • Count: ${p.count}` : ''}
              {p.context ? ` • ${p.context}` : ''}
            </div>
          </div>
        )) : (
          <div className="text-sm text-gray-600 dark:text-gray-300">No patterns found.</div>
        )}
      </div>
      {data.summary && (
        <div className="p-6 border-t bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200">
          {data.summary}
        </div>
      )}
    </div>
  );
};

export default LegacyExitPatternRenderer;

