// SECURITY: Replaced vulnerable xlsx with secure exceljs
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

interface ParsedData {
  data: any[];
  columns: string[];
  error?: string;
}

interface InterviewData {
  hrcode: string;
  date: string;
  notes: string;
  interview_type?: 'stay' | 'exit';
  sentiment_score?: number;
  processed_insights?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  mappedColumns: Record<string, string>;
}

/**
 * Parse a file (CSV or Excel) and return the data
 * @param file The file to parse
 * @returns Promise with parsed data
 */
export const parseFile = async (file: File): Promise<ParsedData> => {
  try {
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      return parseCSV(file);
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      return parseExcel(file);
    } else {
      return {
        data: [],
        columns: [],
        error: 'Unsupported file type. Please upload a CSV or Excel file.'
      };
    }
  } catch (error) {
    // Error parsing file - logged silently in production
    return {
      data: [],
      columns: [],
      error: `Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Parse a CSV file
 * @param file The CSV file to parse
 * @returns Promise with parsed data
 */
const parseCSV = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          // CSV parsing warnings - logged silently in production
        }
        
        const data = results.data as any[];
        const columns = results.meta.fields || [];
        
        resolve({
          data,
          columns
        });
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      }
    });
  });
};

/**
 * Parse an Excel file
 * @param file The Excel file to parse
 * @returns Promise with parsed data
 */
const parseExcel = async (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }
        
        // SECURITY: Use secure ExcelJS instead of vulnerable xlsx
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data as ArrayBuffer);
        
        const worksheet = workbook.getWorksheet(1); // Get first worksheet
        if (!worksheet) {
          reject(new Error('No worksheet found in Excel file'));
          return;
        }
        
        const rows: any[] = [];
        const headers: string[] = [];
        
        // Extract headers from first row
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.text || `Column${colNumber}`;
        });
        
        // Extract data rows
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header row
          
          const rowData: Record<string, any> = {};
          row.eachCell((cell, colNumber) => {
            const headerKey = headers[colNumber - 1];
            if (headerKey) {
              rowData[headerKey] = cell.value;
            }
          });
          rows.push(rowData);
        });
        
        resolve({
          data: rows,
          columns: headers
        });
      } catch (error) {
        reject(new Error(`Excel parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    // SECURITY: Use ArrayBuffer instead of binary string for better security
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Auto-map columns based on similarity to standard columns
 * @param columns The columns to map
 * @param dataType The type of data being imported ('employee' or 'interview')
 * @returns Mapped columns
 */
export const autoMapColumns = (columns: string[], dataType: 'employee' | 'interview' = 'employee'): Record<string, string> => {
  const standardColumns = dataType === 'interview' ? [
    'hrcode',
    'hr_code',
    'date',
    'interview_date',
    'notes',
    'interview_notes',
    'interview_type',
    'type'
  ] : [
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
  
  const mappedColumns: Record<string, string> = {};
  
  columns.forEach(column => {
    const normalizedColumn = column.toLowerCase().replace(/[_\s-]/g, '');
    
    // Try to find an exact match first
    let match = standardColumns.find(std => std.toLowerCase() === column.toLowerCase());
    
    // If no exact match, try to find a match without special characters
    if (!match) {
      match = standardColumns.find(std => 
        std.toLowerCase().replace(/[_\s-]/g, '') === normalizedColumn
      );
    }
    
    // If still no match, try to find a partial match
    if (!match) {
      match = standardColumns.find(std => 
        normalizedColumn.includes(std.toLowerCase().replace(/[_\s-]/g, '')) ||
        std.toLowerCase().replace(/[_\s-]/g, '').includes(normalizedColumn)
      );
    }
    
    if (match) {
      mappedColumns[column] = match;
    } else {
      // Legacy column support: map 'final_fq' to 'performance_rating_latest'
      const legacy = normalizedColumn;
      if (legacy === 'finalfq') {
        mappedColumns[column] = 'performance_rating_latest';
      }
    }
  });
  
  return mappedColumns;
};

/**
 * Validate interview data specifically
 * @param data The interview data to validate
 * @param mappedColumns The column mappings
 * @returns Validation result
 */
export const validateInterviewData = (
  data: any[],
  mappedColumns: Record<string, string>
): ValidationResult => {
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  
  // Check for required interview columns
  const requiredColumns = ['hrcode', 'date', 'notes'];
  requiredColumns.forEach(required => {
    const hasColumn = Object.values(mappedColumns).some(
      mappedCol => mappedCol.toLowerCase() === required.toLowerCase()
    );
    
    if (!hasColumn) {
      errors['_global'] = [
        ...(errors['_global'] || []),
        `Required column "${required}" is missing. Please map a column to "${required}".`
      ];
    }
  });
  
  // Validate data in each column
  Object.keys(mappedColumns).forEach(column => {
    const mappedColumn = mappedColumns[column];
    
    if (!mappedColumn) return;
    
    // Check for empty values in required columns
    if (['hrcode', 'date', 'notes'].includes(mappedColumn.toLowerCase())) {
      const emptyCount = data.filter(row => !row[column] || String(row[column]).trim() === '').length;
      if (emptyCount > 0) {
        errors[column] = [
          ...(errors[column] || []),
          `${emptyCount} rows have empty values in the ${mappedColumn} column`
        ];
      }
    }
    
    // Validate date format
    if (mappedColumn.toLowerCase() === 'date' || mappedColumn.toLowerCase() === 'interview_date') {
      const invalidDateCount = data.filter(row => {
        if (!row[column]) return false;
        const date = new Date(row[column]);
        return isNaN(date.getTime());
      }).length;
      
      if (invalidDateCount > 0) {
        errors[column] = [
          ...(errors[column] || []),
          `${invalidDateCount} rows have invalid date values in the ${mappedColumn} column`
        ];
      }
    }
    
    // Validate interview type if present
    if (mappedColumn.toLowerCase() === 'interview_type' || mappedColumn.toLowerCase() === 'type') {
      const validTypes = ['stay', 'exit'];
      const invalidTypeCount = data.filter(row => {
        if (!row[column]) return false;
        return !validTypes.includes(String(row[column]).toLowerCase());
      }).length;
      
      if (invalidTypeCount > 0) {
        warnings[column] = [
          ...(warnings[column] || []),
          `${invalidTypeCount} rows have invalid interview type values. Valid types: ${validTypes.join(', ')}`
        ];
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
    mappedColumns
  };
};

/**
 * Validate the data and column mappings
 * @param data The data to validate
 * @param mappedColumns The column mappings
 * @param dataType The type of data being validated
 * @returns Validation result
 */
export const validateData = (
  data: any[],
  mappedColumns: Record<string, string>,
  dataType: 'employee' | 'interview' = 'employee'
): ValidationResult => {
  if (dataType === 'interview') {
    return validateInterviewData(data, mappedColumns);
  }
  const errors: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  
  // Check if there's a Status column mapped
  const hasStatusColumn = Object.values(mappedColumns).some(
    mappedCol => mappedCol.toLowerCase() === 'status'
  );
  
  if (!hasStatusColumn) {
    errors['_global'] = ['Status column is required. Please map a column to "status".'];
  }
  
  // Check for duplicate mappings
  const mappedValues = Object.values(mappedColumns);
  const duplicates = mappedValues.filter(
    (value, index, self) => value && self.indexOf(value) !== index
  );
  
  if (duplicates.length > 0) {
    duplicates.forEach(duplicate => {
      const columns = Object.keys(mappedColumns).filter(
        key => mappedColumns[key] === duplicate
      );
      
      columns.forEach(column => {
        errors[column] = [
          ...(errors[column] || []),
          `Duplicate mapping: "${duplicate}" is also mapped to ${
            columns.filter(c => c !== column).join(', ')
          }`
        ];
      });
    });
  }
  
  // Validate data in each column
  Object.keys(mappedColumns).forEach(column => {
    const mappedColumn = mappedColumns[column];
    
    if (!mappedColumn) {
      return; // Skip unmapped columns
    }
    
    // Check for empty values in required columns
    if (mappedColumn === 'status') {
      const emptyCount = data.filter(row => !row[column]).length;
      if (emptyCount > 0) {
        errors[column] = [
          ...(errors[column] || []),
          `${emptyCount} rows have empty values in the Status column`
        ];
      }
    }
    
    // Validate numeric columns
    if ([
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
      'performance_rating_latest',
      'employee_cost'
    ].includes(mappedColumn)) {
      const nonNumericCount = data.filter(
        row => row[column] !== undefined && row[column] !== null && row[column] !== '' && isNaN(Number(row[column]))
      ).length;
      
      if (nonNumericCount > 0) {
        warnings[column] = [
          ...(warnings[column] || []),
          `${nonNumericCount} rows have non-numeric values in the ${mappedColumn} column`
        ];
      }
    }
    
    // Validate date columns
    if (mappedColumn === 'report_date') {
      const invalidDateCount = data.filter(row => {
        if (!row[column]) return false;
        const date = new Date(row[column]);
        return isNaN(date.getTime());
      }).length;
      
      if (invalidDateCount > 0) {
        warnings[column] = [
          ...(warnings[column] || []),
          `${invalidDateCount} rows have invalid date values in the ${mappedColumn} column`
        ];
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
    mappedColumns
  };
};

/**
 * Transform interview data based on column mappings
 * @param data The interview data to transform
 * @param mappedColumns The column mappings
 * @returns Transformed interview data
 */
export const transformInterviewData = (
  data: any[],
  mappedColumns: Record<string, string>
): InterviewData[] => {
  return data.map(row => {
    const transformedRow: any = {};
    
    Object.keys(mappedColumns).forEach(originalColumn => {
      const mappedColumn = mappedColumns[originalColumn];
      if (!mappedColumn) return;
      
      const value = row[originalColumn];
      
      if (value === undefined || value === null) {
        transformedRow[mappedColumn] = null;
        return;
      }
      
      let processedValue = value;
      
      // Process based on mapped column type
      if (mappedColumn.toLowerCase() === 'date' || mappedColumn.toLowerCase() === 'interview_date') {
        try {
          const date = new Date(value);
          processedValue = isNaN(date.getTime()) ? null : date.toISOString();
        } catch (e) {
          processedValue = null;
        }
      } else if (mappedColumn.toLowerCase() === 'interview_type' || mappedColumn.toLowerCase() === 'type') {
        const normalizedType = String(value).toLowerCase();
        processedValue = ['stay', 'exit'].includes(normalizedType) ? normalizedType : 'exit';
      } else {
        processedValue = String(value).trim();
      }
      
      // Map to standard column names
      if (mappedColumn.toLowerCase() === 'hr_code') {
        transformedRow.hrcode = processedValue;
      } else if (mappedColumn.toLowerCase() === 'interview_date') {
        transformedRow.date = processedValue;
      } else if (mappedColumn.toLowerCase() === 'interview_notes') {
        transformedRow.notes = processedValue;
      } else if (mappedColumn.toLowerCase() === 'type') {
        transformedRow.interview_type = processedValue;
      } else {
        transformedRow[mappedColumn] = processedValue;
      }
    });
    
    // Ensure required fields have defaults
    if (!transformedRow.hrcode) transformedRow.hrcode = 'Unknown';
    if (!transformedRow.date) transformedRow.date = new Date().toISOString();
    if (!transformedRow.notes) transformedRow.notes = '';
    if (!transformedRow.interview_type) transformedRow.interview_type = 'exit';
    
    return transformedRow as InterviewData;
  });
};

/**
 * Transform data based on column mappings
 * @param data The data to transform
 * @param mappedColumns The column mappings
 * @param dataType The type of data being transformed
 * @returns Transformed data
 */
export const transformData = (
  data: any[],
  mappedColumns: Record<string, string>,
  dataType: 'employee' | 'interview' = 'employee'
): any[] => {
  if (dataType === 'interview') {
    return transformInterviewData(data, mappedColumns);
  }
  return data.map(row => {
    // Start by copying ALL original data from the row
    const transformedRow: Record<string, any> = { ...row }; 

    // Now, iterate through the MAPPED columns to potentially:
    // 1. Rename a column (if originalColumn !== mappedColumn)
    // 2. Ensure correct data type for known fields
    Object.keys(mappedColumns).forEach(originalColumn => {
      const mappedColumn = mappedColumns[originalColumn];
      if (!mappedColumn) return; // Should not happen if mapping exists, but safeguard
      
      // Get the value using the original column name
      const value = row[originalColumn];
      
      // Skip undefined/null values for processing, but they are already in transformedRow
      if (value === undefined || value === null) {
        // Ensure the mapped key exists, potentially with null value if renaming
        if (mappedColumn !== originalColumn) {
            transformedRow[mappedColumn] = null;
            delete transformedRow[originalColumn];
        }
        return;
      }
      
      let processedValue = value; // Start with original value
      
      // Convert to appropriate type based on the TARGET field name (mappedColumn)
      if ([
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
        'performance_rating_latest',
        'employee_cost'
      ].includes(mappedColumn)) {
        // Try converting to number, default to null if invalid (backend handles NaN)
        const numValue = Number(value);
        processedValue = isNaN(numValue) ? null : numValue; 
      } else if (mappedColumn === 'report_date') {
        try {
          const date = new Date(value);
          // Send ISO string if valid, otherwise null (backend handles default)
          processedValue = isNaN(date.getTime()) ? null : date.toISOString(); 
        } catch (e) {
          processedValue = null;
        }
      } else {
        // Ensure it's a string for other mapped fields
        processedValue = String(value); 
      }
      
      // Assign the processed value to the mapped column name
      transformedRow[mappedColumn] = processedValue;

      // If the column was renamed, remove the original key
      if (mappedColumn !== originalColumn && originalColumn in transformedRow) {
          delete transformedRow[originalColumn];
      }
    });
    
    // Ensure all mandatory backend fields have at least a default value 
    // if they weren't present or mapped from the source
    // (This provides fallback values if mapping was incomplete, backend validation is primary)
    const mandatoryBackendCols = [
       'hr_code', 'full_name', 'structure_name', 'position', 'status', 'tenure', 'employee_cost', 'performance_rating_latest'
    ];
    mandatoryBackendCols.forEach(col => {
       if (!(col in transformedRow)) {
          // Assign a sensible default based on expected type for backend
          if ([ 'tenure', 'employee_cost'].includes(col)) {
             transformedRow[col] = 0; // Or null/NaN as appropriate
          } else {
             transformedRow[col] = 'Unknown'; // Default for strings
          }
          // Mandatory column not found in source or mapping - logged silently in production
       }
    });

    return transformedRow;
  });
}; 