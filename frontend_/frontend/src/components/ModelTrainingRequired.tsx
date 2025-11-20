import React from 'react';
import { Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ModelTrainingRequiredProps {
  status?: string;
  message?: string;
}

export function ModelTrainingRequired({
  status,
  message,
}: ModelTrainingRequiredProps): React.ReactElement {
  const navigate = useNavigate();
  const helperMessage =
    message ||
    'No churn model has been trained for this project yet. Please run training from the Data Management page to unlock scores and risk levels.';

  return (
    <div
      className="h-full w-full flex items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900"
      style={{
        minHeight: '400px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
      }}
    >
      <div className="max-w-md mx-auto">
        <Brain className="mx-auto h-16 w-16 text-amber-500 dark:text-amber-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Model Training Required
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-3">{helperMessage}</p>
        {status && (
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            Current status: {status.replace(/_/g, ' ')}
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate('/data-management')}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 transition-colors"
        >
          Open Data Management
        </button>
      </div>
    </div>
  );
}
