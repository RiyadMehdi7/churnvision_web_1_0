import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, AlertCircle, FileText, MessageSquare, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/services/apiService';
import { 
  parseFile, 
  autoMapColumns, 
  validateData, 
  transformData 
} from '@/services/fileParsingService';

interface InterviewUploadWindowProps {
  show: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export function InterviewUploadWindow({ 
  show, 
  onClose, 
  onUploadSuccess 
}: InterviewUploadWindowProps): React.ReactElement | null {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Data preview state
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [mappedColumns, setMappedColumns] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);

  useEffect(() => {
    if (!show) {
      // Reset state when closing the window
      setFile(null);
      setError(null);
      setParsedData([]);
      setShowPreview(false);
      setMappedColumns({});
      setValidationErrors({});
      setProcessing(false);
    }
  }, [show]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    const validTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setError('Please upload a CSV or Excel file');
      return;
    }

    setFile(file);
    setError(null);
    
    try {
      setIsParsing(true);
      setParseProgress(10);
      
      const result = await parseFile(file);
      
      setParseProgress(50);
      
      if (result.error) {
        setError(result.error);
        setIsParsing(false);
        return;
      }
      
      setParseProgress(70);
      
      // Auto-map columns for interview data
      const autoMapped = autoMapColumns(result.columns, 'interview');
      setMappedColumns(autoMapped);
      
      setParseProgress(90);
      
      // Validate the data
      const validation = validateData(result.data, autoMapped, 'interview');
      setValidationErrors(validation.errors);
      
      setParsedData(result.data.slice(0, 10)); // Preview first 10 rows
      setShowPreview(true);
      setParseProgress(100);
      setIsParsing(false);
    } catch (error) {
      setError(`Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsParsing(false);
    }
  };

  const handleColumnMapping = (originalColumn: string, mappedColumn: string) => {
    setMappedColumns(prev => ({
      ...prev,
      [originalColumn]: mappedColumn
    }));
    
    // Re-validate with new mapping
    const validation = validateData(parsedData, {
      ...mappedColumns,
      [originalColumn]: mappedColumn
    }, 'interview');
    setValidationErrors(validation.errors);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Re-parse the full file
      const result = await parseFile(file);
      if (result.error) {
        setError(result.error);
        setUploading(false);
        return;
      }

      // Transform the data
      const transformedData = transformData(result.data, mappedColumns, 'interview');
      
      setProcessing(true);
      
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('data', JSON.stringify(transformedData));
      formData.append('type', 'interview');

      // Upload to backend
      const response = await api.post('/api/data/interviews/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        onUploadSuccess?.();
        onClose();
      } else {
        setError(response.data.error || 'Upload failed');
      }
    } catch (error: any) {
      setError(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      ['hrcode', 'date', 'notes', 'interview_type'],
      ['EMP001', '2024-01-15', 'Employee expressed satisfaction with current role and team dynamics. Mentioned interest in professional development opportunities.', 'stay'],
      ['EMP002', '2024-01-20', 'Leaving due to better opportunity elsewhere. Feedback on management style and lack of growth opportunities.', 'exit'],
      ['EMP003', '2024-01-25', 'Positive feedback about work-life balance. Suggested improvements in team communication.', 'stay']
    ];

    const csvContent = templateData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'interview_data_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  const canUpload = showPreview && !hasValidationErrors && !uploading && !processing;

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center space-x-3">
              <MessageSquare className="h-6 w-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Upload Interview Data</h2>
                <p className="text-sm text-gray-500">Import stay and exit interview data for analysis</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* Template Download */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Need a template?</span>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Template</span>
                </button>
              </div>
              <p className="text-xs text-blue-700 mt-1">
                Required columns: hrcode, date, notes. Optional: interview_type
              </p>
            </div>

            {/* File Upload */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300",
                file ? "border-green-500 bg-green-50" : ""
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="interview-file-input"
                disabled={uploading || processing}
              />
              
              <div className="space-y-4">
                {file ? (
                  <div className="flex items-center justify-center space-x-2">
                    <FileText className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900">{file.name}</p>
                      <p className="text-xs text-green-600">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                    <div>
                      <p className="text-lg font-medium text-gray-700">Drop your interview data file here</p>
                      <p className="text-sm text-gray-500">or click to browse</p>
                    </div>
                  </>
                )}
                
                <label
                  htmlFor="interview-file-input"
                  className={cn(
                    "inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium cursor-pointer transition-colors",
                    uploading || processing ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {file ? 'Change File' : 'Select File'}
                </label>
              </div>
            </div>

            {/* Parsing Progress */}
            {isParsing && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm font-medium text-gray-700">Parsing file...</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${parseProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-sm font-medium text-red-900">Error</span>
                </div>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            )}

            {/* Validation Errors */}
            {hasValidationErrors && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-900">Validation Issues</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(validationErrors).map(([column, errors]) => (
                    <div key={column} className="text-sm text-yellow-700">
                      <strong>{column}:</strong> {errors.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column Mapping */}
            {showPreview && (
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Column Mapping</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(mappedColumns).map(originalColumn => (
                    <div key={originalColumn} className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 w-32 truncate">{originalColumn}</span>
                      <span className="text-gray-400">→</span>
                      <select
                        value={mappedColumns[originalColumn] || ''}
                        onChange={(e) => handleColumnMapping(originalColumn, e.target.value)}
                        className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Skip this column</option>
                        <option value="hrcode">HR Code</option>
                        <option value="date">Interview Date</option>
                        <option value="notes">Interview Notes</option>
                        <option value="interview_type">Interview Type</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Preview */}
            {showPreview && parsedData.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Data Preview</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(parsedData[0]).map(column => (
                            <th key={column} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {parsedData.map((row, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {Object.values(row).map((value: any, cellIndex) => (
                              <td key={cellIndex} className="px-4 py-2 text-sm text-gray-900 max-w-xs truncate">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t bg-gray-50">
            <div className="flex items-center space-x-2">
              {processing && (
                <>
                  <Brain className="h-5 w-5 text-blue-600 animate-pulse" />
                  <span className="text-sm text-gray-600">Processing with AI...</span>
                </>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
                  canUpload
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                )}
              >
                {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Upload & Process'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default InterviewUploadWindow;