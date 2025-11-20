import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DataUploadWindowProps {
    isOpen: boolean;
    onClose: () => void;
    onUploadComplete: (data: any) => void;
}

export const DataUploadWindow: React.FC<DataUploadWindowProps> = ({ isOpen, onClose, onUploadComplete }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const { toast } = useToast();

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
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        // Simulate upload
        await new Promise(resolve => setTimeout(resolve, 1500));
        setUploading(false);

        toast({
            title: "Upload Successful",
            description: `${file.name} has been processed successfully.`,
        });

        onUploadComplete({ fileName: file.name, timestamp: new Date() });
        onClose();
        setFile(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Upload Employee Data</DialogTitle>
                    <DialogDescription>
                        Upload a CSV or Excel file containing employee records to update the dashboard.
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={`
            mt-4 border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700'}
            ${file ? 'bg-gray-50 dark:bg-gray-800' : ''}
          `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {file ? (
                        <div className="flex flex-col items-center space-y-2">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                                <FileText className="w-6 h-6" />
                            </div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                            <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-2">
                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-500">
                                <Upload className="w-6 h-6" />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Drag and drop your file here, or
                                <label className="mx-1 text-blue-600 hover:underline cursor-pointer">
                                    browse
                                    <input type="file" className="hidden" accept=".csv,.xlsx" onChange={handleFileChange} />
                                </label>
                            </p>
                            <p className="text-xs text-gray-400">Supports CSV, Excel</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="sm:justify-between items-center">
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Data is processed locally</span>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleUpload} disabled={!file || uploading}>
                            {uploading ? 'Uploading...' : 'Upload Data'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
