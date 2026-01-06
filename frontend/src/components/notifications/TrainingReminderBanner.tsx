import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGlobalDataCache } from '../../hooks/useGlobalDataCache';
import { useProject } from '../../contexts/ProjectContext';

export function TrainingReminderBanner(): React.ReactElement | null {
  const { activeProject } = useProject();
  const trainingStatus = useGlobalDataCache(state => state.trainingStatus);
  const navigate = useNavigate();

  const shouldShowReminder = Boolean(
    activeProject &&
      (!trainingStatus || trainingStatus.status === 'idle' || trainingStatus.status === 'error')
  );

  if (!shouldShowReminder) return null;

  const isError = trainingStatus?.status === 'error';
  const helperMessage = isError
    ? trainingStatus.error || trainingStatus.message || 'There was an issue with the previous training run.'
    : 'No churn model has been trained for this project yet.';

  return (
    <div className="w-full px-4 py-3 mb-6 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-900 flex flex-col md:flex-row gap-3 items-start md:items-center shadow-sm">
      <div className="flex items-center gap-2 flex-1">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <div>
          <p className="text-sm font-semibold">Training required</p>
          <p className="text-sm text-yellow-800">{helperMessage} Visit Data Management to train the model.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/data-management')}
        className="text-sm font-semibold text-yellow-800 hover:text-yellow-900 underline underline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
      >
        {isError ? 'Retry training' : 'Train model'}
      </button>
    </div>
  );
}
