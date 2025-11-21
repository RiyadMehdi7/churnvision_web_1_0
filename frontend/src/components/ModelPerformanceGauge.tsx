import React from 'react';

export interface ModelPerformanceGaugeProps {
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1?: number | null;
  rocAuc?: number | null;
}

const normalize = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
};

const getRating = (score: number) => {
  if (score >= 0.85) return { label: 'Very good', tone: 'text-emerald-600', tip: 'Model looks healthy — keep refreshing with new hires & exits.' };
  if (score >= 0.7) return { label: 'Good', tone: 'text-emerald-500', tip: 'Results are solid. Consider adding recent exits or feedback to keep it sharp.' };
  if (score >= 0.55) return { label: 'OK', tone: 'text-amber-500', tip: 'Performance is average; enrich features (engagement, performance, training) before retraining.' };
  if (score >= 0.4) return { label: 'Bad', tone: 'text-orange-500', tip: 'Churn signal is weak — inspect data quality, normalize salaries, and trim noisy features.' };
  return { label: 'Very bad', tone: 'text-red-500', tip: 'Model needs immediate attention. Re-run training with cleaned data and balanced sampling.' };
};

export function ModelPerformanceGauge({
  accuracy,
  precision,
  recall,
  f1,
  rocAuc,
}: ModelPerformanceGaugeProps): React.ReactElement {
  const metrics = [normalize(accuracy), normalize(precision), normalize(recall), normalize(f1), normalize(rocAuc)];
  const score = metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
  const percent = Math.round(score * 100);
  const rating = getRating(score);
  const sweep = Math.round((score || 0) * 180);

  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col items-center gap-4">
      <div className="relative w-32 h-32">
        <div
          className="absolute inset-0 rounded-full bg-gray-100 dark:bg-gray-900 overflow-hidden"
          style={{
            background: `conic-gradient(var(--gauge-color) ${sweep}deg, transparent ${sweep}deg 180deg)`,
          }}
        >
          <div
            className="absolute inset-3 rounded-full bg-white dark:bg-gray-900"
            style={{ border: '1px solid rgba(0,0,0,0.05)' }}
          />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm uppercase text-gray-500 dark:text-gray-400 tracking-wide">Model health</span>
          <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{percent}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-lg font-semibold ${rating.tone}`}>{rating.label}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{rating.tip}</p>
      </div>
    </div>
  );
}
