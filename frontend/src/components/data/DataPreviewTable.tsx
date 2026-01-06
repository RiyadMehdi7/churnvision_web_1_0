import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DataPreviewTableProps {
  data: any[];
  mappedColumns: Record<string, string>;
  validationErrors: Record<string, string[]>;
  onClose: () => void;
  onConfirm: () => void;
  onUpdateMapping: (originalColumn: string, mappedColumn: string) => void;
}

const DataPreviewTable: React.FC<DataPreviewTableProps> = ({
  data,
  mappedColumns,
  validationErrors,
  onClose,
  onConfirm,
  onUpdateMapping
}) => {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [hasStatusColumn, setHasStatusColumn] = useState<boolean>(false);
  
  // Check if there's a Status column mapped
  useEffect(() => {
    const statusMapped = Object.values(mappedColumns).some(
      mappedCol => mappedCol.toLowerCase() === 'status'
    );
    setHasStatusColumn(statusMapped);
  }, [mappedColumns]);

  // Get all available columns from the data
  const originalColumns = data.length > 0 ? Object.keys(data[0]) : [];
  
  // Standard column options for mapping
  const standardColumns = [
    'full_name',
    'structure_name',
    'section_name',
    'position',
    'sex',
    'status',
    'age',
    'tenure',
    'last_salary_increase',
    'last_position_change',
    'vacation_usage_rate',
    'one_or_two_day_vacations',
    'last_debt_10',
    'last_debt_90',
    'total_trainings',
    'total_personal_cost_azn',
    'position_level',
    'performance_rating_latest',
    'employee_cost',
    'report_date'
  ];

  // Handle column mapping change
  const handleMappingChange = (originalColumn: string, mappedColumn: string) => {
    onUpdateMapping(originalColumn, mappedColumn);
    setSelectedColumn(null);
  };

  // Get validation status for a column
  const getColumnValidationStatus = (column: string) => {
    if (validationErrors[column] && validationErrors[column].length > 0) {
      return 'error';
    }
    if (mappedColumns[column]) {
      return 'mapped';
    }
    return 'unmapped';
  };

  // Get CSS class for column header based on validation status
  const getColumnHeaderClass = (column: string) => {
    const status = getColumnValidationStatus(column);
    return cn(
      'px-3 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer',
      status === 'error' ? 'text-red-600 bg-red-50' : 
      status === 'mapped' ? 'text-app-green bg-app-green-light' : 
      'text-gray-500 bg-gray-50'
    );
  };

  // Get CSS class for column mapping indicator
  const getMappingIndicatorClass = (column: string) => {
    const status = getColumnValidationStatus(column);
    return cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      status === 'error' ? 'bg-red-100 text-red-800' : 
      status === 'mapped' ? 'bg-app-green-light text-app-green' : 
      'bg-gray-100 text-gray-800'
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-6xl w-full max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Data Preview and Column Mapping</h2>
          <p className="text-sm text-gray-500 mt-1">
            Verify your data and map columns to the correct fields
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-500 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* Validation summary */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {!hasStatusColumn ? (
              <div className="flex items-center text-amber-600">
                <AlertCircle size={16} className="mr-1" />
                <span className="text-sm font-medium">Status column is required</span>
              </div>
            ) : (
              <div className="flex items-center text-app-green">
                <CheckCircle size={16} className="mr-1" />
                <span className="text-sm font-medium">Status column is mapped</span>
              </div>
            )}
            
            {Object.keys(validationErrors).length > 0 && (
              <div className="flex items-center text-red-600">
                <AlertCircle size={16} className="mr-1" />
                <span className="text-sm font-medium">
                  {Object.keys(validationErrors).length} column(s) with validation issues
                </span>
              </div>
            )}
          </div>
          
          <button
            onClick={onConfirm}
            disabled={!hasStatusColumn}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md",
              hasStatusColumn
                ? "bg-app-green text-white hover:bg-app-green-hover"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            )}
          >
            Confirm and Upload
          </button>
        </div>
      </div>

      {/* Table container with horizontal and vertical scrolling */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {originalColumns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={getColumnHeaderClass(column)}
                  onClick={() => setSelectedColumn(column === selectedColumn ? null : column)}
                >
                  <div className="flex items-center justify-between">
                    <span>{column}</span>
                    <div className={getMappingIndicatorClass(column)}>
                      {mappedColumns[column] || 'Not mapped'}
                    </div>
                  </div>
                  
                  {/* Column mapping dropdown */}
                  {selectedColumn === column && (
                    <div className="absolute mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                      <div className="py-1 max-h-60 overflow-auto">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                          Map to standard column:
                        </div>
                        {standardColumns.map((stdColumn) => (
                          <button
                            key={stdColumn}
                            className={cn(
                              "block w-full text-left px-4 py-2 text-sm hover:bg-gray-100",
                              mappedColumns[column] === stdColumn ? "bg-app-green-light text-app-green" : "text-gray-700"
                            )}
                            onClick={() => handleMappingChange(column, stdColumn)}
                          >
                            {stdColumn}
                          </button>
                        ))}
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={() => handleMappingChange(column, '')}
                          >
                            Clear mapping
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Validation errors */}
                  {validationErrors[column] && validationErrors[column].length > 0 && (
                    <div className="text-xs text-red-600 mt-1">
                      {validationErrors[column][0]}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.slice(0, 10).map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {originalColumns.map((column) => (
                  <td key={`${rowIndex}-${column}`} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                    {row[column] !== undefined && row[column] !== null ? String(row[column]) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer with preview info */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        Showing preview of first 10 rows out of {data.length} total rows
      </div>
    </div>
  );
};

export default DataPreviewTable; 