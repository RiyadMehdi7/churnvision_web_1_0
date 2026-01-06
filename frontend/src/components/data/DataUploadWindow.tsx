import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, AlertCircle, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../services/apiService';
import DataPreviewTable from './DataPreviewTable';
import { parseFile, autoMapColumns, validateData, transformData } from '../services/fileParsingService';

type DataUploadType = 'employee' | 'engagement';

interface DataUploadWindowProps {
  show: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
  defaultTab?: DataUploadType;
}

export function DataUploadWindow({ show, onClose, onUploadSuccess, defaultTab = 'employee' }: DataUploadWindowProps): React.ReactElement | null {
  // Tab state
  const [activeTab, setActiveTab] = useState<DataUploadType>(defaultTab);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
      setActiveTab(defaultTab);
    }
  }, [show, defaultTab]);

  // Reset form when switching tabs
  useEffect(() => {
    setFile(null);
    setError(null);
    setParsedData([]);
    setShowPreview(false);
    setMappedColumns({});
    setValidationErrors({});
  }, [activeTab]);

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

    // Also check file extension for cases where MIME type is not correctly set
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setError('Please upload a CSV or Excel file');
      return;
    }

    setFile(file);
    setError(null);

    // Parse the file
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

      if (result.data.length === 0) {
        setError('The file contains no data');
        setIsParsing(false);
        return;
      }

      setParsedData(result.data);

      // Auto-map columns
      setParseProgress(70);
      const autoMapped = autoMapColumns(result.columns);
      setMappedColumns(autoMapped);

      // Validate data
      setParseProgress(90);
      const validation = validateData(result.data, autoMapped);
      setValidationErrors(validation.errors);

      setParseProgress(100);
      setIsParsing(false);

      // Show preview
      setShowPreview(true);
    } catch (error) {
      console.error('Error parsing file:', error);
      setError(`Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsParsing(false);
    }
  };

  const handleUpdateMapping = (originalColumn: string, mappedColumn: string) => {
    const newMappings = { ...mappedColumns };

    if (mappedColumn) {
      newMappings[originalColumn] = mappedColumn;
    } else {
      delete newMappings[originalColumn];
    }

    setMappedColumns(newMappings);

    // Re-validate with new mappings
    const validation = validateData(parsedData, newMappings);
    setValidationErrors(validation.errors);
  };

  const handleClosePreview = () => {
    setShowPreview(false);
  };

  const handleConfirmUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    // Different validation for different data types
    if (activeTab === 'employee') {
      const hasStatusColumn = Object.values(mappedColumns).some(
        mappedCol => mappedCol.toLowerCase() === 'status'
      );
      if (!hasStatusColumn) {
        setError('Status column is required. Please map a column to "status".');
        return;
      }
    } else if (activeTab === 'engagement') {
      const hasEmployeeIdColumn = Object.values(mappedColumns).some(
        mappedCol => mappedCol.toLowerCase().includes('employee') || mappedCol.toLowerCase().includes('id')
      );
      if (!hasEmployeeIdColumn) {
        setError('Employee ID column is required for engagement surveys.');
        return;
      }
    }

    setUploading(true);
    setError(null);

    try {
      const transformedData = transformData(parsedData, mappedColumns);
      const formData = new FormData();
      formData.append('file', file);

      const dataStr = JSON.stringify(transformedData);
      if (dataStr.length > 10 * 1024 * 1024) {
        const chunkSize = 1000;
        const chunks = [];
        for (let i = 0; i < transformedData.length; i += chunkSize) {
          chunks.push(transformedData.slice(i, i + chunkSize));
        }
        formData.append('mappedData', JSON.stringify(chunks[0]));
        formData.append('totalChunks', String(chunks.length));
        formData.append('currentChunk', '0');
      } else {
        formData.append('mappedData', dataStr);
      }

      // Use different endpoints based on data type
      const uploadEndpoint = activeTab === 'engagement'
        ? '/api/data/upload/engagement'
        : '/api/data/upload/confirm';

      // Add data type to form data
      formData.append('dataType', activeTab);

      const response = await api.post(uploadEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // ... onUploadProgress, timeout ...
      });

      if (response.data.error) { throw new Error(response.data.error); }

      if (dataStr.length > 10 * 1024 * 1024) {
        const chunks = [];
        const chunkSize = 1000;
        for (let i = 0; i < transformedData.length; i += chunkSize) {
          chunks.push(transformedData.slice(i, i + chunkSize));
        }
        for (let i = 1; i < chunks.length; i++) {
          const chunkFormData = new FormData();
          chunkFormData.append('mappedData', JSON.stringify(chunks[i]));
          chunkFormData.append('totalChunks', String(chunks.length));
          chunkFormData.append('currentChunk', String(i));
          chunkFormData.append('uploadId', response.data.uploadId);

          console.log(`Uploading chunk ${i + 1} of ${chunks.length}`);
          const chunkResponse = await api.post('/api/data/upload-chunk', chunkFormData, { /* ... headers, timeout ... */ });
          if (chunkResponse.data.error) { throw new Error(chunkResponse.data.error); }
        }
      }

      // Clear caches
      try {
        console.log('Clearing all caches...');
        sessionStorage.clear();
        // ... localStorage clearing ...
      } catch (e) { console.error('Error clearing cache:', e); }

      setUploading(false);
      setFile(null);
      setShowPreview(false);
      setParsedData([]);
      setMappedColumns({});
      if (onUploadSuccess) { onUploadSuccess(); }
      onClose();

    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);

      // Improved error message handling
      let errorMessage = 'An unknown error occurred during upload';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for the specific backend validation error
        if (errorMessage.startsWith('Validation Failed: Missing MANDATORY columns')) {
          errorMessage += ' Please ensure the required column names match exactly (case-insensitive) and do not contain extra spaces. Required columns are typically: hr_code, full_name, structure_name, position, status, tenure, employee_cost.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('timeout')) {
          errorMessage = `Network Error: ${error.message}. Please check your connection and try again.`;
        } else if (error.message.includes('file type')) {
          // Use a user-friendly message for file type errors
          errorMessage = 'Invalid file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls).';
        }
      }
      setError(errorMessage);
    }
  };

  const handleDownloadTemplate = () => {
    window.open('/api/data/download-template', '_blank', 'noopener,noreferrer');
  };

  if (!show) return null;

  // Show data preview if available
  if (showPreview && parsedData.length > 0) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <DataPreviewTable
            data={parsedData}
            mappedColumns={mappedColumns}
            validationErrors={validationErrors}
            onClose={handleClosePreview}
            onConfirm={handleConfirmUpload}
            onUpdateMapping={handleUpdateMapping}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Upload Data</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
              <button
                onClick={() => setActiveTab('employee')}
                className={cn(
                  'relative py-2 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none',
                  activeTab === 'employee'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Employee Data
                {activeTab === 'employee' && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                    layoutId="uploadTabIndicator"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30
                    }}
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab('engagement')}
                className={cn(
                  'relative py-2 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none',
                  activeTab === 'engagement'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Engagement Surveys
                {activeTab === 'engagement' && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                    layoutId="uploadTabIndicator"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30
                    }}
                  />
                )}
              </button>
            </div>

            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-app-green-light dark:bg-app-green-darkmode-light border border-app-green/20 dark:border-app-green-darkmode/30 rounded-lg p-4">
                <h3 className="text-sm font-medium text-app-green dark:text-app-green-darkmode mb-2">Instructions</h3>
                {activeTab === 'employee' ? (
                  <ul className="text-sm text-app-green dark:text-app-green-darkmode space-y-1">
                    <li>Upload your employee data in CSV or Excel format</li>
                    <li>File must contain a <strong>Status</strong> column</li>
                    <li>You'll be able to map columns before final upload</li>
                    <li>Maximum file size: 10MB</li>
                  </ul>
                ) : (
                  <ul className="text-sm text-app-green dark:text-app-green-darkmode space-y-1">
                    <li>Upload engagement survey data in CSV or Excel format</li>
                    <li>Include columns like: employee_id, survey_date, satisfaction_score</li>
                    <li>Optional columns: work_life_balance, career_development, management_rating</li>
                    <li>Data will be used for Deep Analysis correlations</li>
                    <li>Maximum file size: 10MB</li>
                  </ul>
                )}
              </div>

              {/* File Upload Area */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragActive
                    ? "border-app-green bg-app-green-light dark:bg-app-green-darkmode-light"
                    : "border-gray-300 dark:border-gray-600 hover:border-app-green dark:hover:border-app-green-darkmode"
                )}
              >
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  id="file-upload"
                  disabled={isParsing || uploading}
                />
                <label
                  htmlFor="file-upload"
                  className={cn(
                    "cursor-pointer flex flex-col items-center",
                    (isParsing || uploading) && "opacity-50 pointer-events-none"
                  )}
                >
                  {isParsing ? (
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 border-4 border-app-green dark:border-app-green-darkmode border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Parsing file... {parseProgress}%
                      </p>
                    </div>
                  ) : file ? (
                    <div className="flex flex-col items-center">
                      <FileText
                        size={32}
                        className="mb-4 text-app-green dark:text-app-green-darkmode"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 mt-2"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload
                        size={32}
                        className="mb-4 text-gray-400 dark:text-gray-500"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Drag and drop your file here or click to browse
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Supports CSV and Excel files
                        </p>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle size={16} />
                  <p>{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4">
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <Download size={16} className="mr-2" />
                  Download Template
                </button>
                <div className="space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    disabled={uploading || isParsing}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => file && setShowPreview(true)}
                    disabled={!file || uploading || isParsing}
                    className={cn(
                      "px-4 py-2 text-sm font-medium text-white rounded-lg transition-all",
                      !file || uploading || isParsing
                        ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
                        : "bg-app-green hover:bg-app-green-hover dark:bg-app-green-darkmode dark:hover:bg-app-green-darkmode-hover"
                    )}
                  >
                    {isParsing ? "Parsing..." : "Preview Data"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 