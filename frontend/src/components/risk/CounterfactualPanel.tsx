import React from 'react';
// Removed import as Counterfactual is not exported from the target file
// import { Counterfactual } from '@/types/employee';

// Define the Counterfactual type locally based on usage
type Counterfactual = {
  description: string;
  feasibility: number;
  impact: number;
  difficulty: number;
};

interface CounterfactualPanelProps {
  counterfactuals: Counterfactual[];
  employeeName: string;
}

export const CounterfactualPanel: React.FC<CounterfactualPanelProps> = ({
  counterfactuals,
  employeeName
}) => {
  if (!counterfactuals || counterfactuals.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-gray-500 italic">No retention recommendations available.</p>
      </div>
    );
  }
  
  // Helper function to get difficulty level text
  const getDifficultyText = (difficulty: number): string => {
    if (difficulty <= 0.33) return 'low';
    if (difficulty <= 0.66) return 'medium';
    return 'high';
  };
  
  // Helper function to get feasibility text
  const getFeasibilityText = (feasibility: number): string => {
    if (feasibility >= 0.8) return 'Highly feasible';
    if (feasibility >= 0.5) return 'Moderately feasible';
    return 'Challenging to implement';
  };
  
  return (
    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
      <h3 className="text-lg font-semibold mb-3">Retention Recommendations for {employeeName}</h3>
      
      <div className="space-y-3">
        {counterfactuals.map((cf, index) => (
          <div key={index} className="bg-white p-3 rounded-md shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{cf.description}</p>
                <p className="text-sm text-gray-500 mt-1">{getFeasibilityText(cf.feasibility)}</p>
              </div>
              <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                -{cf.impact.toFixed(1)}% risk
              </div>
            </div>
            
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">Difficulty:</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      getDifficultyText(cf.difficulty) === 'low' ? 'bg-green-500' : 
                      getDifficultyText(cf.difficulty) === 'medium' ? 'bg-yellow-500' : 
                      'bg-red-500'
                    }`}
                    style={{ 
                      width: `${cf.difficulty * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-sm text-gray-600">
        <p>These recommendations are based on data patterns and may require further evaluation.</p>
      </div>
    </div>
  );
}; 