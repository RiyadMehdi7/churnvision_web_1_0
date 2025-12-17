import { useState, useEffect, useCallback } from 'react';
import { parseFile, autoMapColumns, validateData } from '../services/fileParsingService';

// Note: 'engagement' uses custom validation via onValidate callback
export type DataUploadType = 'employee' | 'interview';

export interface FileUploadState {
  file: File | null;
  uploading: boolean;
  error: string | null;
  dragActive: boolean;
  isParsing: boolean;
  parseProgress: number;
  parsedData: any[];
  showPreview: boolean;
  mappedColumns: Record<string, string>;
  validationErrors: Record<string, string[]>;
}

export interface UseFileUploadOptions {
  show: boolean;
  dataType?: DataUploadType;
  onValidate?: (data: any[], columns: Record<string, string>) => { errors: Record<string, string[]> };
}

export interface UseFileUploadReturn extends FileUploadState {
  setFile: (file: File | null) => void;
  setError: (error: string | null) => void;
  setUploading: (uploading: boolean) => void;
  setShowPreview: (show: boolean) => void;
  setDragActive: (active: boolean) => void;
  setMappedColumns: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setValidationErrors: (errors: Record<string, string[]>) => void;
  setParsedData: (data: any[]) => void;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFile: (file: File) => Promise<void>;
  updateMapping: (originalColumn: string, mappedColumn: string) => void;
  reset: () => void;
}

const VALID_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

const VALID_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

const initialState: FileUploadState = {
  file: null,
  uploading: false,
  error: null,
  dragActive: false,
  isParsing: false,
  parseProgress: 0,
  parsedData: [],
  showPreview: false,
  mappedColumns: {},
  validationErrors: {},
};

export function useFileUpload(options: UseFileUploadOptions): UseFileUploadReturn {
  const { show, dataType = 'employee', onValidate } = options;

  const [state, setState] = useState<FileUploadState>(initialState);

  // Reset state when closing
  useEffect(() => {
    if (!show) {
      setState(initialState);
    }
  }, [show]);

  const setFile = useCallback((file: File | null) => {
    setState(prev => ({ ...prev, file }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const setUploading = useCallback((uploading: boolean) => {
    setState(prev => ({ ...prev, uploading }));
  }, []);

  const setShowPreview = useCallback((showPreview: boolean) => {
    setState(prev => ({ ...prev, showPreview }));
  }, []);

  const setDragActive = useCallback((dragActive: boolean) => {
    setState(prev => ({ ...prev, dragActive }));
  }, []);

  const setMappedColumns = useCallback<React.Dispatch<React.SetStateAction<Record<string, string>>>>((action) => {
    setState(prev => ({
      ...prev,
      mappedColumns: typeof action === 'function' ? action(prev.mappedColumns) : action
    }));
  }, []);

  const setValidationErrors = useCallback((validationErrors: Record<string, string[]>) => {
    setState(prev => ({ ...prev, validationErrors }));
  }, []);

  const setParsedData = useCallback((parsedData: any[]) => {
    setState(prev => ({ ...prev, parsedData }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setState(prev => ({ ...prev, dragActive: true }));
    } else if (e.type === 'dragleave') {
      setState(prev => ({ ...prev, dragActive: false }));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState(prev => ({ ...prev, dragActive: false }));

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!VALID_MIME_TYPES.includes(file.type) && !VALID_EXTENSIONS.includes(fileExtension)) {
      setState(prev => ({ ...prev, error: 'Please upload a CSV or Excel file' }));
      return;
    }

    setState(prev => ({
      ...prev,
      file,
      error: null,
      isParsing: true,
      parseProgress: 10,
    }));

    try {
      const result = await parseFile(file);

      setState(prev => ({ ...prev, parseProgress: 50 }));

      if (result.error) {
        setState(prev => ({
          ...prev,
          error: result.error ?? null,
          isParsing: false,
          parseProgress: 0,
        }));
        return;
      }

      if (result.data.length === 0) {
        setState(prev => ({
          ...prev,
          error: 'The file contains no data',
          isParsing: false,
          parseProgress: 0,
        }));
        return;
      }

      setState(prev => ({ ...prev, parseProgress: 70 }));

      // Auto-map columns
      const autoMapped = autoMapColumns(result.columns, dataType);

      setState(prev => ({ ...prev, parseProgress: 90 }));

      // Validate data
      let validation: { errors: Record<string, string[]> };
      if (onValidate) {
        validation = onValidate(result.data, autoMapped);
      } else {
        validation = validateData(result.data, autoMapped, dataType);
      }

      setState(prev => ({
        ...prev,
        parsedData: result.data,
        mappedColumns: autoMapped,
        validationErrors: validation.errors,
        parseProgress: 100,
        isParsing: false,
        showPreview: true,
      }));
    } catch (error) {
      console.error('Error parsing file:', error);
      setState(prev => ({
        ...prev,
        error: `Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isParsing: false,
        parseProgress: 0,
      }));
    }
  }, [dataType, onValidate]);

  const updateMapping = useCallback((originalColumn: string, mappedColumn: string) => {
    setState(prev => {
      const newMappings = { ...prev.mappedColumns };

      if (mappedColumn) {
        newMappings[originalColumn] = mappedColumn;
      } else {
        delete newMappings[originalColumn];
      }

      // Re-validate with new mappings
      let validation: { errors: Record<string, string[]> };
      if (onValidate) {
        validation = onValidate(prev.parsedData, newMappings);
      } else {
        validation = validateData(prev.parsedData, newMappings, dataType);
      }

      return {
        ...prev,
        mappedColumns: newMappings,
        validationErrors: validation.errors,
      };
    });
  }, [dataType, onValidate]);

  return {
    ...state,
    setFile,
    setError,
    setUploading,
    setShowPreview,
    setDragActive,
    setMappedColumns,
    setValidationErrors,
    setParsedData,
    handleDrag,
    handleDrop,
    handleFileChange,
    handleFile,
    updateMapping,
    reset,
  };
}
