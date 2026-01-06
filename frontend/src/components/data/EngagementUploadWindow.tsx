import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, X, AlertCircle, FileText, BarChart3, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { engagementDataService } from '@/services/engagementDataService';
import { 
  parseFile
} from '@/services/fileParsingService';

interface EngagementUploadWindowProps {
  show: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export function EngagementUploadWindow({ 
  show, 
  onClose, 
  onUploadSuccess 
}: EngagementUploadWindowProps): React.ReactElement | null {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);

  // Data preview state
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!show) {
      // Reset state when closing the window
      setFile(null);
      setError(null);
      setParsedData([]);
      setShowPreview(false);
      setValidationErrors({});
      setIsParsing(false);
    }
  }, [show]);

  // Download template function
  const downloadTemplate = () => {
    const csvContent = `employee_id,survey_date,overall_satisfaction,work_life_balance,career_development,management_rating,team_collaboration,compensation_satisfaction
EMP001,2024-01-15,8,7,6,8,9,7
EMP002,2024-01-15,6,5,7,6,8,5
EMP003,2024-01-16,9,8,9,9,8,8`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engagement_survey_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles[0]);
    }
  };

  // Handle file selection
  const handleFileSelect = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    
    // Validate file type
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
    
    if (!validTypes.includes(fileExtension)) {
      setError('Please upload a CSV or Excel file');
      return;
    }

    // Parse and preview the file
    await parseAndPreviewFile(selectedFile);
  };

  // Parse and preview file
  const parseAndPreviewFile = async (file: File) => {
    setIsParsing(true);
    setParseProgress(0);
    
    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setParseProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const result = await parseFile(file);
      
      clearInterval(progressInterval);
      setParseProgress(100);
      
      if (result.data && result.data.length > 0) {
        setParsedData(result.data);
        
        // Auto-map columns for engagement surveys
        // const autoMapped = autoMapColumns(result.columns, 'employee'); // Unused
        
        // setMappedColumns(autoMapped); // Unused variable
        
        // Validate the data
        const validation = engagementDataService.validateEngagementFormat(result.data);
        setValidationErrors(validation.errors);
        
        setShowPreview(true);
      } else {
        setError('No data found in the file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setIsParsing(false);
      setTimeout(() => setParseProgress(0), 1000);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const result = await engagementDataService.uploadEngagementData(file);
      
      if (result.success) {
        onUploadSuccess?.();
        onClose();
      } else {
        setError(result.errors?.[0]?.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Upload Engagement Survey Data
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload employee engagement and satisfaction survey data
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 space-y-6 max-h-[calc(90vh-120px)] overflow-y-auto">
            {/* Template Download */}
            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">Need a template?</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Download our sample CSV template with the correct format
                  </p>
                </div>
              </div>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
            </div>

            {/* File Upload Area */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                dragActive
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
              )}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
            >
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {file ? file.name : 'Drop your engagement survey file here'}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    or{' '}
                    <label className="text-blue-600 hover:text-blue-700 cursor-pointer">
                      browse to upload
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    Supports CSV and Excel files (max 10MB)
                  </p>
                </div>
              </div>
            </div>

            {/* Parsing Progress */}
            {isParsing && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-blue-600 animate-pulse" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Parsing engagement survey data...
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${parseProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Data Preview */}
            {showPreview && parsedData.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Data Preview ({parsedData.length} records)
                </h3>
                
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        {Object.keys(parsedData[0] || {}).slice(0, 6).map((header) => (
                          <th key={header} className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-b border-gray-100 dark:border-gray-700">
                          {Object.values(row).slice(0, 6).map((value: any, i) => (
                            <td key={i} className="p-2 text-gray-600 dark:text-gray-400">
                              {String(value).length > 30 ? String(value).substring(0, 30) + '...' : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Validation Errors */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <h4 className="font-medium text-red-900 dark:text-red-100">Validation Issues</h4>
                </div>
                <div className="space-y-1">
                  {Object.entries(validationErrors).map(([key, errors]) => (
                    <div key={key}>
                      {errors.map((error, index) => (
                        <p key={index} className="text-sm text-red-700 dark:text-red-300">• {error}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Error */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              </div>
            )}

            {/* Required Fields Info */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Required Fields</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Required:</strong> employee_id, survey_date, overall_satisfaction
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                <strong>Optional:</strong> work_life_balance, career_development, management_rating, team_collaboration, compensation_satisfaction
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading || Object.keys(validationErrors).length > 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Engagement Data
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}