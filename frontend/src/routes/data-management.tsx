import { createFileRoute } from '@tanstack/react-router'
import React, { useState, ChangeEvent, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    CloudUpload, Database, AlertCircle, CheckCircle, Loader2,
    FileText, Wifi, WifiOff, LucideIcon, Trash2, RefreshCw,
    ArrowRight, Check, X, FolderPlus, Folder, FolderOpen, Info,
    Share2, Download, Upload, Clock, MessageSquare, BarChart, GitCompare
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { useProject } from '@/contexts/ProjectContext';
import { parse as csvParse } from 'papaparse';
import ExcelJS from 'exceljs';
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { InterviewUploadWindow } from '@/components/InterviewUploadWindow';
import { EngagementUploadWindow } from '@/components/EngagementUploadWindow';
import { ModelPerformanceGauge } from '@/components/ModelPerformanceGauge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute('/data-management')({
    component: DataManagement,
})

// Define accepted file types for CSV and Excel
const ACCEPTED_FILE_TYPES = [
    '.csv',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

type StatusType = 'idle' | 'uploading' | 'testing' | 'success' | 'error';
type UploadStep = 'uploading' | 'processing' | 'saving' | 'training' | 'complete';

interface ColumnMapping {
    identifier: string;
    name: string;
    department: string;
    position: string;
    cost: string;
    performance_rating_latest?: string;
    status: string;
    manager_id: string;
    tenure: string;
    termination_date?: string;
}

interface ValidationIssue {
    column: string;
    fieldName: string;
    issueType: 'empty' | 'format' | 'invalid' | 'type';
    description: string;
    rowIndices: number[];
    exampleValues: string[];
    suggestion: string;
}

interface ValidationResult {
    valid: boolean;
    columnIssues: Record<string, ValidationIssue[]>;
    totalRows: number;
}

// Configuration for mappable fields in the UI
const MAPPABLE_FIELDS_CONFIG: Array<{
    key: string;
    label: string;
    description: string;
    required: boolean;
    notes?: string;
}> = [
        { key: 'identifier', label: 'Unique Employee ID (Identifier)', description: 'Unique Employee ID/Code (e.g., HR_CODE). Must be unique for each employee.', required: true, notes: 'Data Type: Text' },
        { key: 'name', label: 'Full Name', description: 'Employee\'s full display name (e.g., FULL_NAME).', required: true, notes: 'Data Type: Text' },
        { key: 'department', label: 'Department', description: 'Department or division name (e.g., STRUCTURE_NAME).', required: true, notes: 'Data Type: Text' },
        { key: 'position', label: 'Position/Role', description: 'Job title or role (e.g., POSITION).', required: true, notes: 'Data Type: Text' },
        { key: 'cost', label: 'Employee Cost', description: 'Salary or total cost of the employee (e.g., EMPLOYEE_COST). Must be a numerical value. Required in Wage mode.', required: true, notes: 'Data Type: Number' },
        { key: 'status', label: 'Status (Target Variable)', description: 'Employment status, used as the target for churn prediction (e.g., Active, Resigned, Terminated).', required: true, notes: 'Data Type: Text' },
        { key: 'manager_id', label: 'Manager ID', description: 'Manager identifier for scoping and governance (e.g., MANAGER_ID).', required: true, notes: 'Data Type: Text' },
        { key: 'tenure', label: 'Tenure', description: 'Length of service with the company (e.g., TENURE). Should be a numerical value (e.g., years or months).', required: true, notes: 'Data Type: Number' },
        { key: 'termination_date', label: 'Termination Date', description: 'Date of employment termination (e.g., YYYY-MM-DD). This field is optional and should only be filled for terminated employees.', required: false, notes: 'Data Type: Date/Text' },
    ];

function DataManagement() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { refreshData } = useGlobalDataCache();
    const { projectId, projectName, setProjectId, setProjectName } = useProject();

    const [activeTab, setActiveTab] = useState('excel');
    const [file, setFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<StatusType>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStep, setUploadStep] = useState<UploadStep>('uploading');
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Partial<ColumnMapping>>({});
    const [showMapping, setShowMapping] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [parsedData, setParsedData] = useState<any[]>([]);

    // New upload windows state
    const [showInterviewUpload, setShowInterviewUpload] = useState(false);
    const [showEngagementUpload, setShowEngagementUpload] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            await parseFile(selectedFile);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            setFile(droppedFile);
            await parseFile(droppedFile);
        }
    };

    const parseFile = async (file: File) => {
        setUploadStatus('uploading');
        setUploadStep('processing');

        try {
            if (file.name.endsWith('.csv')) {
                csvParse(file, {
                    header: true,
                    complete: (results) => {
                        setHeaders(results.meta.fields || []);
                        setParsedData(results.data);
                        autoMapColumns(results.meta.fields || []);
                        setShowMapping(true);
                        setUploadStatus('idle');
                    },
                    error: (error) => {
                        console.error('CSV Parse Error:', error);
                        toast({
                            title: "Error parsing CSV",
                            description: error.message,
                            variant: "destructive"
                        });
                        setUploadStatus('error');
                    }
                });
            } else {
                // Excel parsing
                const buffer = await file.arrayBuffer();
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                const worksheet = workbook.getWorksheet(1);

                if (!worksheet) {
                    throw new Error("No worksheet found in Excel file");
                }

                const excelHeaders: string[] = [];
                const excelData: any[] = [];

                worksheet.getRow(1).eachCell((cell) => {
                    excelHeaders.push(cell.text);
                });

                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber > 1) {
                        const rowData: any = {};
                        row.eachCell((cell, colNumber) => {
                            rowData[excelHeaders[colNumber - 1]] = cell.text;
                        });
                        excelData.push(rowData);
                    }
                });

                setHeaders(excelHeaders);
                setParsedData(excelData);
                autoMapColumns(excelHeaders);
                setShowMapping(true);
                setUploadStatus('idle');
            }
        } catch (error: any) {
            console.error('File Parse Error:', error);
            toast({
                title: "Error parsing file",
                description: error.message,
                variant: "destructive"
            });
            setUploadStatus('error');
        }
    };

    const autoMapColumns = (fileHeaders: string[]) => {
        const newMapping: any = {};
        MAPPABLE_FIELDS_CONFIG.forEach(field => {
            // Simple fuzzy match
            const match = fileHeaders.find(h =>
                h.toLowerCase().replace(/_/g, '').includes(field.key.toLowerCase()) ||
                h.toLowerCase() === field.label.toLowerCase()
            );
            if (match) {
                newMapping[field.key] = match;
            }
        });
        setColumnMapping(newMapping);
    };

    const handleUpload = async () => {
        setUploadStatus('uploading');
        setUploadStep('uploading');

        // Simulate upload process
        const totalSteps = 4;
        let currentStep = 0;

        const interval = setInterval(() => {
            currentStep++;
            setUploadProgress((currentStep / totalSteps) * 100);

            if (currentStep === 1) setUploadStep('processing');
            if (currentStep === 2) setUploadStep('saving');
            if (currentStep === 3) setUploadStep('training');

            if (currentStep >= totalSteps) {
                clearInterval(interval);
                setUploadStatus('success');
                setUploadStep('complete');
                toast({
                    title: "Upload Complete",
                    description: "Your data has been successfully processed and the model has been updated.",
                });
                refreshData();
                setTimeout(() => {
                    setShowMapping(false);
                    setFile(null);
                    setUploadStatus('idle');
                    setUploadProgress(0);
                }, 2000);
            }
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-8">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Data Management Platform</h1>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 border-0">Enterprise-Ready</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 mb-4">
                        <Badge variant="outline" className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> 1 Dataset
                        </Badge>
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800 flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                            Active: employee_data_10000_rows (2025-11-17)
                        </Badge>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 max-w-3xl">
                        Seamlessly integrate, transform, and organize your workforce data. Our intelligent platform automates the complex data processes to bring clarity and precision to your HR analytics.
                    </p>
                </div>

                <Tabs defaultValue="excel" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100 dark:bg-slate-800">
                        <TabsTrigger value="excel" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">
                            <FileText className="h-4 w-4 mr-2" /> Excel/CSV
                        </TabsTrigger>
                        <TabsTrigger value="ml" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">
                            <BarChart className="h-4 w-4 mr-2" /> ML Models
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="excel" className="space-y-6 mt-6">
                        {/* Upload Section */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600 dark:text-blue-400">
                                        <CloudUpload className="h-5 w-5" />
                                    </div>
                                    <CardTitle>Upload Dataset</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {!showMapping ? (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                            <div>
                                                <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Data Guide & Templates</h3>
                                                <p className="text-sm text-muted-foreground mb-4">Required Columns</p>
                                                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                                                    {MAPPABLE_FIELDS_CONFIG.map(f => f.key).map(col => (
                                                        <div key={col} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">• {col}</div>
                                                    ))}
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-2">
                                                    Notes: additional columns not listed will be stored in `additional_data` and can be referenced by business rules as `emp.&lt;column_name&gt;`.
                                                </p>
                                            </div>
                                            <div>
                                                <div className="flex justify-end gap-2 mb-4">
                                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                                                        <Download className="h-3 w-3 mr-1" /> Full CSV Template
                                                    </Button>
                                                    <Button size="sm" variant="secondary">
                                                        <Download className="h-3 w-3 mr-1" /> Minimum Template
                                                    </Button>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-2">Recommended Columns</p>
                                                <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
                                                    <li><code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">salary_percentile_dept</code> Salary Percentile (Dept)</li>
                                                    <li><code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">hike_months_since</code> Months Since Last Salary Hike</li>
                                                    <li><code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">promo_months_since</code> Months Since Last Promotion</li>
                                                </ul>
                                            </div>
                                        </div>

                                        <div
                                            className={`border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center transition-colors cursor-pointer
                                                ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800'}
                                            `}
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept={ACCEPTED_FILE_TYPES}
                                                onChange={handleFileSelect}
                                            />
                                            <CloudUpload className="h-10 w-10 text-slate-400 mb-4" />
                                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                                Drag & drop or <span className="text-blue-600 dark:text-blue-400 font-semibold">click to upload</span>
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">CSV, XLS, XLSX (Max 50MB)</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-lg">Map Columns</h3>
                                            <Button variant="ghost" onClick={() => { setShowMapping(false); setFile(null); }}>Cancel</Button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {MAPPABLE_FIELDS_CONFIG.map((field) => (
                                                <div key={field.key} className="space-y-2">
                                                    <Label>{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
                                                    <select
                                                        className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                                        value={columnMapping[field.key as keyof ColumnMapping] || ''}
                                                        onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                    >
                                                        <option value="">Select Column...</option>
                                                        {headers.map(h => (
                                                            <option key={h} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                    <p className="text-xs text-gray-500">{field.description}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {uploadStatus === 'uploading' && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span>{uploadStep === 'processing' ? 'Processing Data...' : uploadStep === 'saving' ? 'Saving to Database...' : 'Training Model...'}</span>
                                                    <span>{Math.round(uploadProgress)}%</span>
                                                </div>
                                                <Progress value={uploadProgress} />
                                            </div>
                                        )}

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                onClick={handleUpload}
                                                disabled={uploadStatus === 'uploading'}
                                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                            >
                                                {uploadStatus === 'uploading' ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Processing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="mr-2 h-4 w-4" />
                                                        Import Data
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Additional Upload Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setShowInterviewUpload(true)}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md text-purple-600 dark:text-purple-400">
                                            <MessageSquare className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-base">Upload Interviews</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        Upload interview transcripts or notes to analyze qualitative sentiment and risk factors.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setShowEngagementUpload(true)}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-md text-orange-600 dark:text-orange-400">
                                            <ActivityIcon className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-base">Upload Engagement Data</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        Import engagement survey results to correlate with churn risk.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Active Dataset */}
                        <Card className="border-l-4 border-l-green-500">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-md text-green-600 dark:text-green-400">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Active Dataset</CardTitle>
                                        <CardDescription>Currently using dataset <span className="font-medium text-slate-900 dark:text-slate-100">employee_data_10000_rows (2025-11-17)</span> from project <span className="font-medium text-slate-900 dark:text-slate-100">{projectName}</span> for predictions.</CardDescription>
                                    </div>
                                </div>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <RefreshCw className="h-4 w-4 mr-2" /> Train Model
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4 mt-4">
                                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</div>
                                        <div className="font-medium">text/csv</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Uploaded</div>
                                        <div className="font-medium">Nov 17, 2025</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-100 dark:border-slate-700">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Records</div>
                                        <div className="font-medium">10,000</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Project Management */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-md text-purple-600 dark:text-purple-400">
                                        <Folder className="h-5 w-5" />
                                    </div>
                                    <CardTitle>Project Management</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-md text-sm flex items-center gap-2">
                                    <span className="font-semibold">Active Project:</span> {projectName} <span className="text-blue-500 text-xs cursor-pointer hover:underline">(Deactivate)</span>
                                </div>

                                <div className="flex gap-2">
                                    <Input placeholder="New project name..." />
                                    <Button variant="secondary" className="bg-slate-500 text-white hover:bg-slate-600">
                                        <Folder className="h-4 w-4 mr-2" /> Create
                                    </Button>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Folder className="h-4 w-4 text-blue-500" />
                                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{projectName}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="ml" className="mt-6">
                        <ModelPerformanceGauge />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Upload Modals */}
            <InterviewUploadWindow
                isOpen={showInterviewUpload}
                onClose={() => setShowInterviewUpload(false)}
            />
            <EngagementUploadWindow
                isOpen={showEngagementUpload}
                onClose={() => setShowEngagementUpload(false)}
            />
        </div>
    );
}

// Helper icon component
const ActivityIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);
