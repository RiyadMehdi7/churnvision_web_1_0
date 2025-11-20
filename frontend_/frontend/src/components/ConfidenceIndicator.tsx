import React from 'react';

interface ConfidenceIndicatorProps {
  confidenceScore: number;
  uncertaintyRange?: [number, number];
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({ 
  confidenceScore, 
  uncertaintyRange 
}) => {
  // Determine color based on confidence score
  const getColor = () => {
    if (confidenceScore >= 80) return 'bg-green-500';
    if (confidenceScore >= 60) return 'bg-blue-500';
    if (confidenceScore >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${getColor()}`}></div>
        <span className="text-sm font-medium">
          {confidenceScore}% confidence
        </span>
      </div>
      {uncertaintyRange && (
        <div className="text-xs text-gray-500 mt-1">
          Range: {(uncertaintyRange[0] * 100).toFixed(1)}% - {(uncertaintyRange[1] * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}; 