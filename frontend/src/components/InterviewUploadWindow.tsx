import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InterviewUploadWindowProps {
    isOpen: boolean;
    onClose: () => void;
    onUploadComplete: (data: any) => void;
}

export const InterviewUploadWindow: React.FC<InterviewUploadWindowProps> = ({
    isOpen,
    onClose,
    onUploadComplete
}) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [uploadState, setUploadState] = React.useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [fileName, setFileName] = React.useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (file: File) => {
        setFileName(file.name);
        setUploadState('uploading');

        // Simulate upload delay
        setTimeout(() => {
            setUploadState('success');
            setTimeout(() => {
                onUploadComplete({ fileName: file.name, timestamp: new Date() });
                onClose();
            }, 1000);
        }, 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Upload Interview Transcripts</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                            isDragging
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500",
                            uploadState === 'success' && "border-green-500 bg-green-50 dark:bg-green-900/20"
                        )}
                    >
                        <input
                            type="file"
                            id="interview-upload"
                            className="hidden"
                            accept=".txt,.pdf,.docx"
                            onChange={handleFileSelect}
                            disabled={uploadState !== 'idle'}
                        />

                        <AnimatePresence mode="wait">
                            {uploadState === 'idle' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-3"
                                >
                                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                                        <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            Click to upload or drag and drop
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            TXT, PDF, or DOCX (max 10MB)
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => document.getElementById('interview-upload')?.click()}
                                    >
                                        Select File
                                    </Button>
                                </motion.div>
                            )}

                            {uploadState === 'uploading' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-3"
                                >
                                    <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin mx-auto" />
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Processing {fileName}...
                                    </p>
                                </motion.div>
                            )}

                            {uploadState === 'success' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-3"
                                >
                                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                                    </div>
                                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                        Upload Complete!
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex gap-3">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div className="text-xs text-blue-800 dark:text-blue-200">
                            <p className="font-medium mb-0.5">Privacy Note</p>
                            <p>All interview data is processed locally or via your private enterprise LLM. No data leaves your secure environment.</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
