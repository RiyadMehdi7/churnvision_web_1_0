import React from 'react';
import { BookOpen, CheckSquare } from 'lucide-react';
import type { LegacyRetentionPlaybookData } from '@/types/analysisData';

export const LegacyRetentionPlaybookRenderer: React.FC<{ data: LegacyRetentionPlaybookData }> = ({ data }) => {
  const title = data.targetDescription || 'Retention Playbook';
  return (
    <div className="border rounded-2xl bg-white dark:bg-gray-800 shadow-2xl my-6 overflow-hidden">
      <div className="border-b p-6 bg-gray-50 dark:bg-gray-700/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-500 text-white flex items-center justify-center">
            <BookOpen size={20} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Retention Strategy</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{title}</p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-4">
        {data.playbook?.length ? (
          data.playbook.sort((a, b) => (a.step || 0) - (b.step || 0)).map((item) => (
            <div key={item.step} className="p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 flex items-center justify-center text-sm font-bold">
                    {item.step}
                  </div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{item.action}</div>
                </div>
                <CheckSquare className="w-5 h-5 text-gray-400" />
              </div>
              {item.rationale && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{item.rationale}</div>
              )}
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-300">No actions provided.</div>
        )}
      </div>
      {data.summary && (
        <div className="p-6 border-t bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-700 dark:text-gray-200">{data.summary}</div>
        </div>
      )}
    </div>
  );
};

export default LegacyRetentionPlaybookRenderer;

