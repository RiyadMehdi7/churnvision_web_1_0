import React, { useState, ChangeEvent, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '@/services/api';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    UploadCloud as CloudUploadIcon, Database, AlertCircle, CheckCircle, Loader2,
    FileText, Wifi, WifiOff, LucideIcon, Trash2, RefreshCw,
    ArrowRight, Check, X, FolderPlus, Folder, FolderOpen, Info, // ADDED Info icon
    Share2, // Import Share2 icon
    Download, Upload, Clock, MessageSquare, BarChart, GitCompare, // Added Clock icon for Coming Soon and MessageSquare for interviews
    HardDrive // Added for PageHeader icon
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useNavigate } from 'react-router-dom';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { useProject } from '@/contexts/ProjectContext'; // Import from local context
import { parse as csvParse } from 'papaparse';
// Excel parsing is handled by FastAPI backend
import ExcelJS from 'exceljs';
import { logger } from '@/utils/logger'; // Import frontend logger
// // import type { ConnectionTestParams } from '@/types/electron'; // Removed ConnectionCreateParams
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
// Removed unused: import { useBatchReasoning } from '../hooks/useReasoning';
import { InterviewUploadWindow } from '../components/InterviewUploadWindow';
import { EngagementUploadWindow } from '../components/EngagementUploadWindow';
import { ModelPerformanceGauge } from '../components/ModelPerformanceGauge';

// Define accepted file types for CSV and Excel
const ACCEPTED_FILE_TYPES = [
    '.csv', // Comma Separated Values
    'text/csv',
    'application/vnd.ms-excel', // Older Excel (.xls)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Newer Excel (.xlsx)
].join(',');

// Define supported database types (match backend capabilities)
const SUPPORTED_DB_TYPES = ['Oracle', 'PostgreSQL', 'MySQL', 'SQL Server'] as const;

// Type definitions
type DbType = typeof SUPPORTED_DB_TYPES[number];
type StatusType = 'idle' | 'uploading' | 'testing' | 'success' | 'error';
type UploadStep = 'uploading' | 'processing' | 'saving' | 'training' | 'complete';

interface InputFieldProps {
    id: string;
    label: string;
    type?: string;
    name: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    required?: boolean;
    icon?: LucideIcon;
    min?: string;
    max?: string;
}

interface StatusMessageProps {
    status: StatusType;
    message: string;
    type: 'upload' | 'connection';
}

interface ColumnMapping {
    identifier: string; // Corresponds to backend hr_code (Required)
    name: string;       // Corresponds to backend full_name (Required)
    department: string; // Corresponds to backend structure_name (Required)
    position: string;   // Corresponds to backend position (Required)
    cost: string;       // Corresponds to backend employee_cost (Required in Wage mode)
    performance_rating_latest?: string; // Used in Performance mode
    status: string;     // Corresponds to backend status (Required)
    manager_id: string; // Corresponds to backend manager_id (Required)
    tenure: string;     // Corresponds to backend tenure (Required)
    termination_date?: string; // Corresponds to backend termination_date (Optional)
}

interface DataPreview {
    headers: string[];
    rows: string[][];
    totalRows: number;
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

// Revert to local Project interface definition
interface Project {
    id: string;
    name: string;
    path: string; // Directory path
    dbPath: string; // Path to database.db file
    exists?: boolean; // Whether the db file exists
    active?: boolean; // Whether the project is currently active
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

// Derive visible mappable fields based on data mode
const DATA_MODE: 'wage' | 'performance' = (localStorage.getItem('settings.dataMode') === 'performance') ? 'performance' : 'wage';
const VISIBLE_MAPPABLE_FIELDS: Array<{ key: string; label: string; description: string; required: boolean; notes?: string; }> =
    DATA_MODE === 'performance'
        ? [
            { key: 'identifier', label: 'Unique Employee ID (Identifier)', description: '', required: true },
            { key: 'name', label: 'Full Name', description: '', required: true },
            { key: 'department', label: 'Department', description: '', required: true },
            { key: 'position', label: 'Position/Role', description: '', required: true },
            { key: 'performance_rating_latest', label: 'Latest Performance Rating', description: 'Numeric rating (e.g., 1-5). Required in Performance mode.', required: true },
            { key: 'status', label: 'Status (Target Variable)', description: '', required: true },
            { key: 'manager_id', label: 'Manager ID', description: '', required: true },
            { key: 'tenure', label: 'Tenure', description: '', required: true },
            { key: 'termination_date', label: 'Termination Date', description: '', required: false }
        ]
        : MAPPABLE_FIELDS_CONFIG;

// Canonical headers for templates and guidance (base, mode-specific handled at render time)
const TEMPLATE_HEADERS_REQUIRED_BASE: string[] = [
    'hr_code',
    'full_name',
    'structure_name',
    'position',
    'status',
    'manager_id',
    'tenure',
    'termination_date'
];

// Recommended optional headers that will be captured into additional_data automatically
const TEMPLATE_HEADERS_RECOMMENDED: Array<{
    key: string;
    label: string;
    type: 'number' | 'string' | 'date' | 'boolean';
    example?: string | number | boolean;
    why: string;
}> = [
        // Compensation & growth
        { key: 'salary_percentile_dept', label: 'Salary Percentile (Dept)', type: 'number', example: 0.42, why: 'Peer-relative pay positioning' },
        { key: 'hike_months_since', label: 'Months Since Last Salary Hike', type: 'number', example: 14, why: 'Pay stagnation signal' },
        { key: 'promo_months_since', label: 'Months Since Last Promotion', type: 'number', example: 28, why: 'Career stagnation risk' },
        { key: 'equity_value_usd', label: 'Equity Value (USD)', type: 'number', example: 25000, why: 'Golden handcuffs effect' },
        { key: 'equity_refresh_date', label: 'Equity Refresh Date', type: 'date', example: '2024-06-01', why: 'Recent refresh reduces risk' },

        // Performance & engagement
        { key: 'performance_rating_latest', label: 'Latest Performance Rating', type: 'number', example: 4.2, why: 'Risk stabilizer/trigger' },
        { key: 'performance_trend_4q', label: 'Performance Trend (4 quarters)', type: 'number', example: -0.4, why: 'Downward trend increases risk' },
        { key: 'engagement_score', label: 'Engagement Score', type: 'number', example: 58, why: 'Low engagement raises risk' },
        { key: 'engagement_trend_6m', label: 'Engagement Trend (6 months)', type: 'number', example: -0.6, why: 'Recent drop is a warning' },

        // Work patterns
        { key: 'overtime_hours_90d', label: 'Overtime Hours (90 days)', type: 'number', example: 55, why: 'Overwork/burnout risk' },
        { key: 'after_hours_ratio_90d', label: 'After-hours Work Ratio (90 days)', type: 'number', example: 0.32, why: 'Sustained after-hours pattern' },
        { key: 'absences_90d', label: 'Absences (90 days)', type: 'number', example: 3, why: 'Attendance signals' },
        { key: 'unscheduled_absences_90d', label: 'Unscheduled Absences (90 days)', type: 'number', example: 1, why: 'Potential disengagement' },

        // Manager/team
        { key: 'manager_id', label: 'Manager ID', type: 'string', example: 'M-102', why: 'Manager relationship rules' },
        { key: 'manager_feedback_freq_90d', label: 'Manager 1:1s (90 days)', type: 'number', example: 1, why: 'Low cadence is a risk' },
        { key: 'manager_span', label: 'Manager Span of Control', type: 'number', example: 14, why: 'High span reduces attention' },
        { key: 'team_size', label: 'Team Size', type: 'number', example: 9, why: 'Context for span/peer effects' },
        { key: 'peer_resignations_90d', label: 'Peer Resignations (90 days)', type: 'number', example: 2, why: 'Contagion effect' },

        // Mobility & market
        { key: 'promotions_24m', label: 'Promotions (24 months)', type: 'number', example: 0, why: 'Progress opportunity' },
        { key: 'role_market_heat_index', label: 'Market Heat Index (1-10)', type: 'number', example: 8, why: 'External demand' },
        { key: 'internal_mobility_attempts_12m', label: 'Internal Applications (12 months)', type: 'number', example: 2, why: 'Blocked mobility increases risk' },

        // Work mode & commute
        { key: 'work_location', label: 'Work Location', type: 'string', example: 'onsite|remote|hybrid', why: 'Fit with preference/policy' },
        { key: 'commute_time_min', label: 'Daily Commute (minutes)', type: 'number', example: 70, why: 'Commute fatigue' },

        // Learning & PTO
        { key: 'training_hours_12m', label: 'Training Hours (12 months)', type: 'number', example: 6, why: 'Investment perception' },
        { key: 'last_training_date', label: 'Last Training Date', type: 'date', example: '2024-03-15', why: 'Recency matters' },
        { key: 'pto_balance_days', label: 'PTO Balance (days)', type: 'number', example: 24, why: 'High unused PTO can signal issues' },
        { key: 'pto_carryover_flag', label: 'PTO Carryover', type: 'boolean', example: true, why: 'Delayed usage warning' },

        // Sentiment
        { key: 'sentiment_composite', label: 'Composite Sentiment', type: 'number', example: -0.45, why: 'Surveys + interviews' },

        // Manager/department health
        { key: 'manager_churn_risk', label: 'Manager Churn Risk', type: 'number', example: 0.62, why: 'Manager risk contagion' },
        { key: 'department_budget_change_pct_12m', label: 'Dept Budget Change % (12m)', type: 'number', example: -12, why: 'Downsizing stress' },
        { key: 'hiring_freeze_flag', label: 'Hiring Freeze Flag', type: 'boolean', example: true, why: 'Growth stagnation signal' },
        { key: 'layoff_event_recent_180d', label: 'Layoff Event in Last 180 Days', type: 'boolean', example: false, why: 'Psychological safety' },

        // Compliance/HR actions
        { key: 'warnings_12m', label: 'Written Warnings (12m)', type: 'number', example: 1, why: 'HR risk marker' },
        { key: 'pip_active_flag', label: 'Performance Improvement Plan Active', type: 'boolean', example: false, why: 'Very high churn risk' },
        { key: 'policy_violations_12m', label: 'Policy Violations (12m)', type: 'number', example: 0, why: 'Employment risk' },
        { key: 'grievance_count_12m', label: 'Grievances Filed (12m)', type: 'number', example: 0, why: 'Employee relations strain' },

        // On-call/operations/customer impact
        { key: 'on_call_shifts_90d', label: 'On-call Shifts (90d)', type: 'number', example: 8, why: 'Fatigue and stress' },
        { key: 'incident_pages_90d', label: 'Incident Pages (90d)', type: 'number', example: 4, why: 'Sleep disruption risk' },
        { key: 'customer_escalations_90d', label: 'Customer Escalations (90d)', type: 'number', example: 3, why: 'High pressure exposure' },
        { key: 'deadline_slips_90d', label: 'Project Deadline Slips (90d)', type: 'number', example: 2, why: 'Delivery stress' },
        { key: 'project_cancellation_180d', label: 'Project Cancellations (180d)', type: 'number', example: 1, why: 'Motivation impact' },

        // Travel & scheduling
        { key: 'travel_days_12m', label: 'Travel Days (12m)', type: 'number', example: 35, why: 'Travel fatigue' },
        { key: 'travel_fatigue_score', label: 'Travel Fatigue Score (0-1)', type: 'number', example: 0.7, why: 'Sustained travel burden' },
        { key: 'schedule_change_count_90d', label: 'Schedule Changes (90d)', type: 'number', example: 8, why: 'Instability' },
        { key: 'shift_variability_index', label: 'Shift Variability Index (0-1)', type: 'number', example: 0.5, why: 'Irregular hours stress' },
        { key: 'flexible_schedule_flag', label: 'Flexible Schedule', type: 'boolean', example: true, why: 'Stabilizes work-life fit' },
        { key: 'remote_preference', label: 'Remote Preference', type: 'string', example: 'remote', why: 'Policy/preference alignment' },

        // Mobility & employment constraints
        { key: 'external_offer_flag', label: 'External Offer in Hand', type: 'boolean', example: false, why: 'Immediate churn risk' },
        { key: 'internal_offer_flag', label: 'Internal Offer in Hand', type: 'boolean', example: false, why: 'Retention lever' },
        { key: 'visa_dependency_flag', label: 'Visa Dependency', type: 'boolean', example: false, why: 'Sensitivity to org changes' },
        { key: 'location_change_12m', label: 'Location Changes (12m)', type: 'number', example: 1, why: 'Instability indicator' },

        // Role criticality & utilization (esp. services/engineering)
        { key: 'coverage_ratio', label: 'Role Coverage Ratio (0-1)', type: 'number', example: 0.6, why: 'Single point of failure pressure' },
        { key: 'utilization_rate', label: 'Utilization Rate (0-1)', type: 'number', example: 0.45, why: 'Low utilization discouragement' },
        { key: 'bench_time_days_90d', label: 'Bench Time Days (90d)', type: 'number', example: 25, why: 'Idle time risk' },

        // Recognition/enablement
        { key: 'recognition_events_12m', label: 'Recognition Events (12m)', type: 'number', example: 0, why: 'Appreciation signal' },
        { key: 'mentor_assigned_flag', label: 'Mentor Assigned', type: 'boolean', example: true, why: 'Support reduces risk' },

        // Certifications/skills
        { key: 'certs_12m', label: 'Certifications Earned (12m)', type: 'number', example: 1, why: 'Growth indicator' },
        { key: 'months_since_last_cert', label: 'Months Since Last Certification', type: 'number', example: 16, why: 'Learning gap' },

        // Equity vesting timing
        { key: 'months_to_next_vest', label: 'Months to Next Equity Vest', type: 'number', example: 2, why: 'Near-term vesting retains' },

        // Feedback & safety
        { key: 'feedback_negative_ratio_12m', label: '360 Negative Feedback Ratio (12m)', type: 'number', example: 0.65, why: 'Risk of performance mgmt' },
        { key: 'safety_incidents_12m', label: 'Safety Incidents (12m)', type: 'number', example: 0, why: 'Operational stressor' },

        // Benefits
        { key: 'benefits_change_recent', label: 'Recent Benefits Change', type: 'boolean', example: false, why: 'Perceived value shift' },
        { key: 'benefits_change_type', label: 'Benefits Change Type', type: 'string', example: 'reduction|improvement', why: 'Direction of change' },

        // Workload proxy
        { key: 'ticket_backlog_delta_30d', label: 'Ticket Backlog Δ (30d)', type: 'number', example: 25, why: 'Workload surge' }
    ];

// Helper component for input fields
const InputField: React.FC<InputFieldProps> = ({
    id,
    label,
    type = 'text',
    name,
    value,
    onChange,
    placeholder,
    required = true,
    icon: Icon,
    ...props
}) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {label}
        </label>
        <div className="relative">
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />}
            <input
                type={type}
                id={id}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200 shadow-sm text-sm`}
                {...props}
            />
        </div>
    </div>
);

// Helper component for status messages
export const StatusMessage: React.FC<StatusMessageProps> = ({ status, message }) => {
    if (!message) return null;

    const isError = status === 'error';
    const Icon = isError ? AlertCircle : CheckCircle;
    const bgColor = isError ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20';
    const textColor = isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
    const iconColor = isError ? 'text-red-500' : 'text-green-500';

    // Format message for display if it contains line breaks
    const hasLineBreaks = message.includes('\n');

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3 rounded-lg flex ${hasLineBreaks ? 'flex-col' : 'items-center gap-2.5'} text-sm ${bgColor}`}
        >
            <div className={`${hasLineBreaks ? 'mb-2 flex items-center gap-2.5' : 'flex items-center gap-2.5'}`}>
                <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                <span className={textColor}>
                    {hasLineBreaks ? message.split('\n')[0] : message}
                </span>
            </div>

            {hasLineBreaks && (
                <ul className={`${textColor} mt-1 ml-7 list-disc space-y-1`}>
                    {message.split('\n').slice(1).map((line, idx) => (
                        line.trim() && <li key={idx}>{line.trim()}</li>
                    ))}
                </ul>
            )}
        </motion.div>
    );
};

interface DbConfig {
    host: string;
    port: string;
    username: string;
    password: string;
    databaseName: string;
}

// Add interfaces for dataset and connection
interface Dataset {
    id: string;
    name: string;
    type: string;
    size: number;
    uploadedAt: string;
    rowCount?: number;
    active?: boolean;
    isSnapshot?: boolean;
    snapshotGroup?: string | null;
    snapshotPairDatasetId?: string | null;
    description?: string;
}

interface Connection {
    id: string;
    name: string;
    type: DbType;
    host: string;
    lastConnected: string;
    status: 'active' | 'inactive';
}

// Coming Soon Overlay Component
const ComingSoonOverlay: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title = "Coming Soon" }) => (
    <div className="relative">
        {/* Original content with reduced opacity */}
        <div className="opacity-40 pointer-events-none select-none">
            {children}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 rounded-xl">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-white dark:bg-gray-800 rounded-lg px-6 py-4 shadow-lg border border-gray-200 dark:border-gray-700"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                        <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            This feature is under development
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    </div>
);

export function DataManagement(): React.ReactElement {
    const navigate = useNavigate();
    const { toast } = useToast();
    // Use the project context
    const { activeProject, isLoadingProject, setActiveProject } = useProject();

    // Get the action from the global cache hook
    const startGlobalPolling = useGlobalDataCache(state => state.startPollingTrainingStatus);
    // Get training status from the global store
    const trainingStatus = useGlobalDataCache(state => state.trainingStatus);

    // File upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<StatusType>('idle');
    const [uploadMessage, setUploadMessage] = useState('');
    const [dbType, setDbType] = useState<DbType>(SUPPORTED_DB_TYPES[0]);
    const [dbConfig, setDbConfig] = useState<DbConfig>({
        host: '',
        port: '',
        username: '',
        password: '',
        databaseName: '',
    });
    const [connectionStatus, setConnectionStatus] = useState<StatusType>('idle');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [generalError, setGeneralError] = useState('');

    // State for managing datasets and connections
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
    const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
    const [connections, setConnections] = useState<Connection[]>([]);
    const datasetLookup = useMemo(() => new Map(datasets.map(ds => [ds.id, ds])), [datasets]);

    // const [activeConnectionTab, setActiveConnectionTab] = useState<'details' | 'actions'>('actions'); // Unused

    // State for Database Import/Export Actions
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [importDatasetName, setImportDatasetName] = useState<string>('');
    const [availableTables, setAvailableTables] = useState<string[]>([]);
    const [dbImportQuery, setDbImportQuery] = useState<string>('');
    const [dbImportLimit, setDbImportLimit] = useState<number>(100000);
    const [syncManagersAfterImport, setSyncManagersAfterImport] = useState<boolean>(false);
    const [isListingTables, setIsListingTables] = useState<boolean>(false);

    // New state for column mapping and file processing
    const [dataPreview, setDataPreview] = useState<DataPreview | null>(null);
    const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);
    const [fixedPreview, setFixedPreview] = useState<DataPreview | null>(null);
    const [autoFixWarnings, setAutoFixWarnings] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
        identifier: '',
        name: '',
        department: '',
        position: '',
        cost: '',
        status: '',
        manager_id: '',
        tenure: '',
        termination_date: '' // Added termination_date to initial state
    });
    const [showMappingUI, setShowMappingUI] = useState(false);
    const [processingStep, setProcessingStep] = useState<UploadStep>('uploading');
    const [uploadProgress, setUploadProgress] = useState(0);

    // Add state to track validation results

    // Interview and engagement upload window state
    const [showInterviewUpload, setShowInterviewUpload] = useState(false);
    const [showEngagementUpload, setShowEngagementUpload] = useState(false);
    const [showDiagnosisResults, setShowDiagnosisResults] = useState<boolean>(false);

    // --- Project Management State (Local to this component, related to UI interaction) ---
    const [projects, setProjects] = useState<Project[]>([]); // List of all projects
    // REMOVED: activeProject state (comes from context)
    // REMOVED: isProjectLoading state (comes from context)
    const [isProjectListLoading, setIsProjectListLoading] = useState(true); // Separate loading for project list fetch
    const [projectError, setProjectError] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    // --- States for Project Import/Export Modal ---
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isProjectActionLoading, setIsProjectActionLoading] = useState(false);
    // Ref to prevent double deletion
    const deletingProjectRef = useRef<string | null>(null);
    // Ref to track current active project ID to avoid dependency in fetchProjects
    const activeProjectIdRef = useRef<string | null>(null);
    activeProjectIdRef.current = activeProject?.id ?? null;
    // ---------------------------------------

    // --- NEW States for DB Actions ---
    // const [isListingTables, setIsListingTables] = useState<boolean>(false); // Unused
    // --- END NEW States ---

    // Main tab state for the interface
    const [activeMainTab, setActiveMainTab] = useState<'files' | 'database' | 'api' | 'mlmodels'>('files');

    // ML Models state
    const [modelMetrics, setModelMetrics] = useState<any[]>([]);
    const [isMetricsLoading, setIsMetricsLoading] = useState(false);
    const [metricsError, setMetricsError] = useState<string>('');

    // Fetch model metrics via IPC
    const fetchModelMetrics = useCallback(async () => {
        if (!activeProject) return;
        setIsMetricsLoading(true);
        setMetricsError('');
        try {
            // getModelMetrics may not be typed on ElectronAPI
            const response = await api.get('/churn/model/metrics');
            const result = response.data;
            if (result?.success) {
                setModelMetrics(result.data || []);
            } else {
                setMetricsError(result?.error || 'Failed to load model metrics');
            }
        } catch (error: any) {
            logger.error('Failed to fetch model metrics', error);
            setMetricsError('Failed to load model metrics');
        } finally {
            setIsMetricsLoading(false);
        }
    }, [activeProject]);

    // Load metrics when ML Models tab is active
    useEffect(() => {
        if (activeMainTab === 'mlmodels') {
            fetchModelMetrics();
        }
    }, [activeMainTab, fetchModelMetrics]);

    // MetricPill component for displaying model metrics
    const MetricPill: React.FC<{ label: string; value: number | string }> = ({ label, value }) => {
        const display = typeof value === 'number' ? (Math.round(Number(value) * 1000) / 1000).toFixed(3) : String(value);
        return (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-xs">
                <span className="text-gray-600 dark:text-gray-300">{label}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{display}</span>
            </div>
        );
    };

    // --- Data Guide helpers ---
    const downloadCsvTemplate = useCallback((includeRecommended: boolean = true) => {
        const isPerformance = localStorage.getItem('settings.dataMode') === 'performance';
        const required = isPerformance
            ? [...TEMPLATE_HEADERS_REQUIRED_BASE, 'performance_rating_latest']
            : [...TEMPLATE_HEADERS_REQUIRED_BASE, 'employee_cost'];
        const headers = includeRecommended
            ? [...required, ...TEMPLATE_HEADERS_RECOMMENDED.map((h) => h.key)]
            : [...required];
        const csv = headers.join(',') + '\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = includeRecommended ? 'churnvision_template_full.csv' : 'churnvision_template_minimum.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    const renderDataGuideCard = () => (
        <div className="mt-4 border border-gray-200 dark:border-gray-700/60 rounded-lg p-4 bg-white/70 dark:bg-gray-800/60">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Data Guide & Templates</h3>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => downloadCsvTemplate(true)}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1"
                    >
                        <Download className="w-3.5 h-3.5" /> Full CSV Template
                    </button>
                    <button
                        type="button"
                        onClick={() => downloadCsvTemplate(false)}
                        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800 flex items-center gap-1"
                    >
                        <Download className="w-3.5 h-3.5" /> Minimum Template
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                    <div className="text-gray-900 dark:text-gray-100 font-medium mb-1">Required Columns</div>
                    <ul className="list-disc ml-5 space-y-1 text-gray-700 dark:text-gray-300">
                        {(localStorage.getItem('settings.dataMode') === 'performance'
                            ? [...TEMPLATE_HEADERS_REQUIRED_BASE, 'performance_rating_latest']
                            : [...TEMPLATE_HEADERS_REQUIRED_BASE, 'employee_cost']
                        ).map((h) => (
                            <li key={h}><code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{h}</code></li>
                        ))}
                    </ul>
                </div>
                <div>
                    <div className="text-gray-900 dark:text-gray-100 font-medium mb-1">Recommended Columns</div>
                    <div className="max-h-40 overflow-y-auto pr-1">
                        <ul className="list-disc ml-5 space-y-1 text-gray-700 dark:text-gray-300">
                            {TEMPLATE_HEADERS_RECOMMENDED.map((f) => (
                                <li key={f.key}>
                                    <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded mr-1">{f.key}</code>
                                    <span className="opacity-80">{f.label} — {f.why}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-3">
                Notes: additional columns not listed will be stored in <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">additional_data</code> and can be referenced by business rules as <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">emp.&lt;column_name&gt;</code>.
            </p>
        </div>
    );

    // Helper to check if the Electron API is available - REMOVED
    // const getElectronApi = useCallback(() => { ... }, []);

    // Add header section with stylish title and subtitle
    const renderHeader = () => {
        const activeDataset = datasets.find(d => d.active);
        const datasetCount = datasets.length;

        // Build dynamic badges based on data state
        const badges: Array<{ label: string; variant: 'emerald' | 'purple' | 'blue' | 'sky' | 'amber'; pulse?: boolean }> = [
            { label: 'Enterprise-Ready', variant: 'purple' },
        ];

        if (datasetCount > 0) {
            badges.push({ label: `${datasetCount} Dataset${datasetCount !== 1 ? 's' : ''}`, variant: 'blue' });
        }

        if (activeDataset) {
            badges.push({ label: `Active: ${activeDataset.name}`, variant: 'emerald', pulse: true });
        }

        return (
            <PageHeader
                title="Data Management"
                subtitle="Import, transform, and organize your workforce data"
                icon={HardDrive}
                badges={badges}
            />
        );
    };

    // Initial fetch effect - Simplified to fetch project list
    useEffect(() => {
        logger.info('DataManagement: Component mounted, fetching project list...', undefined, 'DataManagement');
        setGeneralError('');

        fetchProjects().catch(err => {
            logger.error('DataManagement: Error fetching initial project list', err, 'DataManagement');
            setProjectError('Failed to load initial project list.');
        });
    }, []);

    // Fetch datasets/connections based on activeProject from CONTEXT
    useEffect(() => {
        if (activeProject?.dbPath) {
            logger.info('DataManagement: Active project context changed, fetching related data...', { activeProject: activeProject.name }, 'DataManagement');
            fetchDatasets();
            fetchConnections();
        } else {
            logger.info('DataManagement: No active project in context, clearing datasets/connections.', undefined, 'DataManagement');
            // Clear data when project becomes null
            setDatasets([]);
            setSelectedDataset(null);
            setSelectedConnection(null);
            setIsLoading(false); // Stop loading if no project
        }
        // Add fetchDatasets/fetchConnections to dependency array if they aren't stable references (though useCallback should handle this)
    }, [activeProject]); // Re-run when activeProject from context changes

    // --- Project API Functions ---
    // Fetch project list (now uses isProjectListLoading state)
    const fetchProjects = useCallback(async () => {
        const hasToken = !!(localStorage.getItem('access_token') || localStorage.getItem('churnvision_access_token'));
        if (!hasToken) {
            logger.warn('DataManagement: fetchProjects skipped - no access token present.', undefined, 'DataManagement');
            setProjects([]);
            setIsProjectListLoading(false);
            return;
        }

        setIsProjectListLoading(true); // Use specific loading state
        setProjectError(null);
        try {
            const response = await api.get('/data-management/projects');
            const fetchedProjects = response.data;
            logger.info('DataManagement: Fetched projects', { count: fetchedProjects.length }, 'DataManagement');
            setProjects(fetchedProjects || []);

            // Sync active project with context: prefer active flag, otherwise keep current
            // Only update if the active project actually changed (compare by id to avoid infinite loops)
            // Use ref to access current value without creating a dependency
            const currentActiveId = activeProjectIdRef.current;
            const activeFromApi = (fetchedProjects || []).find((p: Project) => p.active);
            if (activeFromApi && activeFromApi.id !== currentActiveId) {
                setActiveProject(activeFromApi);
            } else if (!currentActiveId && fetchedProjects?.length) {
                setActiveProject(fetchedProjects[0]);
            }
        } catch (err: any) {
            logger.error('DataManagement: Error fetching projects', err, 'DataManagement');
            setProjectError(err.message || 'Failed to load projects.');
            setProjects([]);
        } finally {
            setIsProjectListLoading(false); // Use specific loading state
        }
    }, [setActiveProject]); // Removed activeProject from deps, using ref instead

    // handleSetActiveProject - Calls API, context listener will update the state
    const handleSetActiveProject = useCallback(async (dbPath: string | null) => {
        setProjectError(null);
        // Optional: Set a temporary loading state if needed
        try {
            const response = await api.post('/data-management/projects/active', { dbPath });
            const result = response.data;
            if (!result.success) {
                throw new Error(result.error || 'Failed to set active project.');
            }
            logger.info(`DataManagement: Set active project requested`, { dbPath }, 'DataManagement');

            // Update context active project immediately for UI unlock
            const matching = projects.find(p => p.dbPath === dbPath) || null;
            setActiveProject(matching);
        } catch (err: any) {
            logger.error('DataManagement: Error setting active project', err, 'DataManagement');
            setProjectError(err.message || 'Could not set active project.');
        } finally {
            // Optional: Clear temporary loading state
        }
    }, [projects, setActiveProject]);

    // handleCreateProject - Refreshes list, optionally sets active via API call
    const handleCreateProject = useCallback(async () => {
        if (!newProjectName.trim()) {
            setProjectError('Project name cannot be empty.');
            return;
        }
        setIsCreatingProject(true);
        setProjectError(null);
        try {
            const response = await api.post('/data-management/projects', { name: newProjectName.trim() });
            const result = response.data;
            if (result.success) {
                logger.info('DataManagement: Project created successfully', result.project, 'DataManagement');
                setNewProjectName(''); // Clear input
                await fetchProjects(); // Refresh the list (will sync context)
                // Optionally set the new project as active via API call
                if (result.project?.dbPath) {
                    await handleSetActiveProject(result.project.dbPath);
                }
            } else {
                throw new Error(result.error || 'Failed to create project.');
            }
        } catch (err: any) {
            logger.error('DataManagement: Error creating project', err, 'DataManagement');
            setProjectError(err.message || 'Could not create project.');
        } finally {
            setIsCreatingProject(false);
        }
    }, [newProjectName, fetchProjects, handleSetActiveProject]);

    // handleDeleteProject - Refreshes list, relies on context listener for active state change
    const handleDeleteProject = useCallback(async (project: Project) => {
        // Prevent double deletion
        if (deletingProjectRef.current === project.path) {
            return;
        }

        setProjectError(null);
        setIsProjectListLoading(true); // Indicate loading while deleting/refreshing
        deletingProjectRef.current = project.path; // Mark as deleting

        try {
            const response = await api.delete(`/data-management/projects/${encodeURIComponent(project.path)}`);
            const result = response.data;
            if (result.success) {
                logger.info(`DataManagement: Project "${project.name}" deleted`, undefined, 'DataManagement');
                await fetchProjects(); // Refresh list
                if (activeProject?.path === project.path) {
                    setActiveProject(null);
                }
                // Active project state update is handled by the context listener if the deleted project was active
            } else {
                throw new Error(result.error || 'Failed to delete project.');
            }
        } catch (err: any) {
            logger.error('DataManagement: Error deleting project', err, 'DataManagement');
            setProjectError(err.message || 'Could not delete project.');
        } finally {
            setIsProjectListLoading(false); // Clear loading state
            deletingProjectRef.current = null; // Reset guard
        }
    }, [activeProject, fetchProjects, setActiveProject]);

    // --- End Project API Functions ---

    // --- Project Import/Export Handlers (similar to Playground) ---
    const handleExportProject = useCallback(async () => {
        if (!activeProject) {
            setProjectError("Active project is required to export.");
            return;
        }
        setIsProjectActionLoading(true);
        setProjectError(null);
        try {
            const response = await api.post('/data-management/projects/export', {
                projectName: activeProject.name,
                projectPath: activeProject.path
            });
            const result = response.data;
            if (result.success) {
                logger.info('DataManagement: Project exported successfully', { filePath: result.filePath }, 'DataManagement');
                // toast({ title: "Export Successful", description: `Project exported to ${result.filePath}`, variant: "default" });
                setIsProjectModalOpen(false);
            } else {
                throw new Error(result.error || "Unknown error during project export.");
            }
        } catch (err: any) {
            logger.error('DataManagement: Error exporting project', err, 'DataManagement');
            setProjectError(err.message || 'Could not export project.');
            // toast({ title: "Export Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsProjectActionLoading(false);
        }
    }, [activeProject]);

    const handleImportProject = useCallback(async () => {
        setIsProjectActionLoading(true);
        setProjectError(null);
        try {
            const response = await api.post('/data-management/projects/import');
            const result = response.data;
            if (result.success && result.importedProject) {
                logger.info('DataManagement: Project imported successfully', result.importedProject, 'DataManagement');
                // toast({ title: "Import Successful", description: `Project "${result.importedProject.name}" imported.`, variant: "default" });
                await fetchProjects(); // Refresh the project list
                // Optionally, set the new project as active if the context has such a function and it's desired
                // if (activeProjectContext.setActiveProject && result.importedProject.dbPath) {
                //   await activeProjectContext.setActiveProject(result.importedProject.dbPath);
                // }
                setIsProjectModalOpen(false);
            } else {
                throw new Error(result.error || "Unknown error during project import.");
            }
        } catch (err: any) {
            logger.error('DataManagement: Error importing project', err, 'DataManagement');
            setProjectError(err.message || 'Could not import project.');
            // toast({ title: "Import Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsProjectActionLoading(false);
        }
    }, [fetchProjects]);
    // --- End Project Import/Export Handlers ---

    // Function to fetch datasets (depends on activeProject from context)
    const fetchDatasets = useCallback(async () => {
        // Use activeProject from context
        if (!activeProject) {
            logger.warn('fetchDatasets skipped: No active project in context', undefined, 'DataManagement');
            setDatasets([]); // Ensure datasets are cleared
            setIsLoading(false); // Update general loading state
            return;
        }

        setIsLoading(true); // Set general loading true
        try {
            setGeneralError('');
            logger.info('Fetching datasets via API for context project...', { activeProject: activeProject.name }, 'DataManagement');
            const response = await api.get('/data-management/datasets');
            const fetchedDatasetsRaw = response.data;
            logger.info('Datasets received via API', { count: fetchedDatasetsRaw.length }, 'DataManagement');

            const mappedDatasets: Dataset[] = fetchedDatasetsRaw.map((raw: any) => ({
                id: raw.id, // Changed from dataset_id to id as per schema
                name: raw.name,
                type: raw.type || 'Unknown', // Changed from file_type
                size: raw.size || 0,
                uploadedAt: raw.uploadedAt, // Changed from upload_date
                rowCount: raw.rowCount, // Changed from row_count
                active: raw.active, // Changed from is_active
                isSnapshot: raw.isSnapshot, // Changed from is_snapshot
                snapshotGroup: raw.snapshotGroup || null, // Changed from snapshot_group
                snapshotPairDatasetId: raw.snapshotPairDatasetId || null, // Changed from snapshot_pair_dataset_id
                description: raw.description
            }));

            const currentActiveDataset = mappedDatasets.find(d => d.active);
            if (currentActiveDataset) {
                setSelectedDataset(currentActiveDataset.id);
                try { localStorage.setItem('activeDatasetId', currentActiveDataset.id); } catch { /* ignore */ }
                logger.info(`Active dataset set: ${currentActiveDataset.name} (ID: ${currentActiveDataset.id})`, undefined, 'DataManagement');
            } else {
                setSelectedDataset(null);
                try { localStorage.removeItem('activeDatasetId'); } catch { /* ignore */ }
                if (mappedDatasets.length > 0) {
                    logger.warn('No active dataset found in the fetched list.', undefined, 'DataManagement');
                }
            }
            setDatasets(mappedDatasets);
        } catch (error: any) {
            logger.error('Error fetching datasets via API:', error, 'DataManagement');
            setDatasets([]);
            setGeneralError(error.message || 'Failed to fetch datasets via API.');
        } finally {
            setIsLoading(false); // Update general loading state
        }
    }, [activeProject]);

    // Function to delete dataset (fetchDatasets depends on context project now)
    const handleDeleteDataset = useCallback(async (datasetId: string) => {
        if (!window.confirm('Are you sure you want to delete this dataset and its associated model? This action cannot be undone.')) {
            return;
        }
        try {
            logger.info(`Requesting dataset deletion via API: ${datasetId}`, undefined, 'DataManagement');
            const response = await api.delete(`/data-management/datasets/${datasetId}`);
            const result = response.data;
            if (result?.success) {
                logger.info(`Dataset ${datasetId} deleted successfully via API. Refreshing list.`, { cancelled: result.cancelled }, 'DataManagement');
                fetchDatasets(); // Refresh list (will use current context project)
            } else {
                throw new Error(result?.message || 'Failed to delete dataset via API');
            }
        } catch (error: any) {
            logger.error(`Error deleting dataset ${datasetId} via API:`, error, 'DataManagement');
            setGeneralError(error.message || 'Could not delete dataset.');
        }
    }, [fetchDatasets]); // fetchDatasets is now stable due to useCallback

    // Function to fetch connections (depends on activeProject from context)
    const fetchConnections = useCallback(async () => {
        // Use activeProject from context
        if (!activeProject) {
            logger.warn('fetchConnections skipped: No active project in context', undefined, 'DataManagement');
            setSelectedConnection(null);
            // Consider setting isLoading false here too if it was set true before
            return;
        }
        setIsLoading(true); // Use general loading state
        try {
            logger.info('Fetching connections via API for context project...', { activeProject: activeProject.name }, 'DataManagement');
            const response = await api.get('/data-management/connections');
            const fetchedConnections = response.data;
            logger.info(`Connections received via API: ${fetchedConnections.length}`, undefined, 'DataManagement');
            const mappedConnections: Connection[] = fetchedConnections.map((shortConn: any) => ({ // Add type safety if possible
                id: shortConn.id, // Changed from connection_id
                name: shortConn.name,
                type: shortConn.type as DbType,
                host: shortConn.host,
                lastConnected: shortConn.lastConnected || '', // Changed from lastConnected
                status: shortConn.status || 'inactive' // Changed from status
            }));
            setConnections(mappedConnections); // Store connections in state
            setSelectedConnection(mappedConnections[0]?.id); // Set selected connection
        } catch (error: any) {
            logger.error('Error fetching connections via API:', error, 'DataManagement');
            setConnections([]);
            setSelectedConnection(null);
            // Consider setting general error
        } finally {
            setIsLoading(false); // Use general loading state
        }
    }, [activeProject]);

    // --- NEW Database Action Handlers (Import/Export) ---
    // Handler to list tables for a selected connection
    const handleListTables = useCallback(async (connectionId: string) => {
        if (!connectionId) return;

        setIsListingTables(true);
        setSelectedTable('');

        try {
            logger.info(`Requesting table list for connection: ${connectionId}`);
            const response = await api.get(`/data-management/connections/${connectionId}/tables`);
            const tables = response.data;
            logger.info(`Received ${tables?.length ?? 0} tables.`);
            setAvailableTables(tables || []);
        } catch (error: any) {
            logger.error(`Error listing tables for connection ${connectionId}:`, error, 'DataManagement');
            setIsListingTables(false);
        } finally {
            setIsListingTables(false);
        }
    }, []);

    // Handler to import data from selected connection/table
    const handleImportData = useCallback(async () => {
        if (!selectedConnection || !selectedTable || !importDatasetName) {
            setGeneralError('Connection, Table, and Dataset Name required.');
            return;
        }

        setIsListingTables(true);

        try {
            logger.info(`Starting import from connection ${selectedConnection}, table ${selectedTable}, dataset ${importDatasetName}`);
            const response = await api.post('/data-management/import/db', {
                connectionId: selectedConnection,
                tableName: selectedTable,
                datasetName: importDatasetName
            });
            const result = response.data;

            if (result.success) {
                logger.info(`Import successful: ${result.message}`);
                fetchDatasets(); // Refresh dataset list
                setSelectedTable(''); // Close import UI on success
                toast({
                    title: "Import Successful",
                    description: `Imported data from ${selectedTable} table`,
                });
            } else {
                throw new Error(result.error || result.message || 'Import failed.');
            }
        } catch (error: any) {
            logger.error(`Error importing data:`, error, 'DataManagement');
            setGeneralError(error.message || 'Failed to import data.');
            toast({
                title: "Import Failed",
                description: error.message || 'Failed to import data from database',
                variant: "destructive",
            });
        } finally {
            setIsListingTables(false);
        }
    }, [selectedConnection, selectedTable, importDatasetName, fetchDatasets, toast]);

    // Function to handle opening the import/export UI sections
    const handleDbActionClick = (actionType: 'import' | 'export') => {
        if (!selectedConnection) return;
        setSelectedTable(''); // Clear previous table
        setImportDatasetName(''); // Clear dataset name
        setIsListingTables(true); // Immediately list tables for the selected connection
        handleListTables(selectedConnection);
    };
    // --- END NEW Database Action Handlers ---

    // Function to handle saving a connection
    const handleSaveConnection = useCallback(async () => {
        if (!dbConfig.host || !dbConfig.port || !dbConfig.username || !dbConfig.password || !dbConfig.databaseName) {
            setConnectionMessage('All fields are required.');
            setConnectionStatus('error'); // Added to show error state visually
            return;
        }
        try {
            logger.info(`Requesting connection creation via API: ${dbConfig.host}:${dbConfig.port}`, undefined, 'DataManagement');
            const connectionName = `${dbType} @ ${dbConfig.host}`; // Generate name
            const response = await api.post('/data-management/connections', {
                name: connectionName, // Add name property
                type: dbType,
                host: dbConfig.host,
                port: parseInt(dbConfig.port), // Ensure port is number
                username: dbConfig.username,
                password: dbConfig.password,
                databaseName: dbConfig.databaseName
            });
            const result = response.data;
            if (result?.success) {
                logger.info(`Connection created successfully via API. Refreshing list.`, undefined, 'DataManagement');
                fetchConnections(); // Refresh list (will use current context project)
                setConnectionMessage('Connection created successfully.');
            } else {
                throw new Error(result?.message || 'Failed to create connection via API');
            }
        } catch (error: any) {
            logger.error(`Error creating connection via API:`, error, 'DataManagement');
            setConnectionMessage(error.message || 'Could not create connection.');
            setConnectionStatus('error'); // Added to show error state visually
        }
    }, [dbType, dbConfig, fetchConnections]);

    // Modified upload handler to integrate data diagnosis
    const handleUpload = async () => {
        setShowDiagnosisResults(false);
        setValidationResults(null);

        if (!selectedFile || !isColumnMappingComplete()) {
            setUploadStatus('error');
            setUploadMessage('Please select a file and map all required columns.');
            return;
        }

        try {
            setUploadStatus('testing');
            setUploadMessage('Running data validation checks...');

            const datasetForValidation = await loadValidationDataset(selectedFile);

            const deepValidation = performDeepValidation(datasetForValidation, columnMapping);
            setValidationResults(deepValidation);

            if (!deepValidation.valid) {
                setShowDiagnosisResults(true);
                setUploadStatus('error');
                setUploadMessage('Validation failed. Please review the detected issues.');
                return;
            }

            setUploadStatus('uploading');
            setUploadMessage('Validation passed. Uploading dataset...');
            await uploadData();
        } catch (error) {
            setUploadStatus('error');
            setUploadMessage(`Diagnosis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    // Check if all required columns are mapped
    const isColumnMappingComplete = () => {
        // Use MAPPABLE_FIELDS_CONFIG to dynamically check required fields
        return MAPPABLE_FIELDS_CONFIG.every(field =>
            !field.required || !!columnMapping[field.key as keyof ColumnMapping]
        );
    };

    // Function to navigate to Home with refresh parameter
    const navigateToHomeWithRefresh = () => {
        navigate('/?refresh=true');
    };

    // Auto-fix common issues in preview based on mapping (applied to full dataset during upload)
    const autoFixPreview = (preview: DataPreview, mapping: ColumnMapping): { preview: DataPreview; warnings: string[] } => {
        const warnings: string[] = [];
        const headers = [...preview.headers];
        const rows = preview.rows.map(r => [...r]);

        const getIndex = (colName?: string) => (colName ? headers.indexOf(colName) : -1);

        const deptIdx = getIndex(mapping.department);
        const mgrIdx = getIndex(mapping.manager_id);
        const costIdx = getIndex(mapping.cost);

        // 1) manager_id: fill empties with UNKNOWN or last known per department
        if (mgrIdx >= 0) {
            const lastManagerByDept = new Map<string, string>();
            for (let i = 0; i < rows.length; i++) {
                const dept = deptIdx >= 0 ? String(rows[i][deptIdx] ?? '').trim() : '';
                const curMgr = String(rows[i][mgrIdx] ?? '').trim();
                if (curMgr) {
                    if (dept) lastManagerByDept.set(dept, curMgr);
                } else {
                    const fallback = dept && lastManagerByDept.get(dept) ? lastManagerByDept.get(dept)! : 'UNKNOWN';
                    rows[i][mgrIdx] = fallback;
                }
            }
            warnings.push('Filled missing manager_id values with last known per department or UNKNOWN.');
        }

        // 2) cost: strip currency and normalize; set 0 for blanks
        if (costIdx >= 0) {
            for (let i = 0; i < rows.length; i++) {
                const raw = rows[i][costIdx];
                const normalized = normalizeNumericValue(String(raw ?? ''));
                rows[i][costIdx] = normalized === null ? '0' : String(normalized);
            }
            warnings.push('Normalized employee_cost values and filled blanks with 0.');
        }

        return {
            preview: {
                headers,
                rows,
                totalRows: rows.length
            },
            warnings
        };
    };

    // Extracted upload logic to a separate function for reuse
    const uploadData = useCallback(async (): Promise<void> => {
        if (!selectedFile || !dataPreview || !isColumnMappingComplete()) {
            setUploadMessage('Please select a file and complete column mapping.');
            setUploadStatus('error');
            return;
        }

        setUploadStatus('uploading');
        setUploadMessage('Preparing data for upload...');
        setUploadProgress(0);
        setProcessingStep('uploading');
        setGeneralError(''); // Clear general errors before starting

        const currentDatasetName = selectedFile.name;
        const backendMappings = {
            hr_code: columnMapping.identifier,
            full_name: columnMapping.name,
            structure_name: columnMapping.department,
            position: columnMapping.position,
            employee_cost: columnMapping.cost,
            status: columnMapping.status,
            manager_id: columnMapping.manager_id,
            tenure: columnMapping.tenure
        };

        try {
            // --- Read file buffer --- START ---
            setProcessingStep('uploading'); // Indicate reading buffer as part of upload
            setUploadMessage('Reading file data...');
            // If we have an auto-fixed preview, apply the fixes to the full dataset (not just the preview)
            const buildUploadBuffer = async (): Promise<{ buffer: Uint8Array; filename: string; mimeType: string }> => {
                const toCsvBuffer = (headers: string[], rows: string[][]): Uint8Array => {
                    const lines = [headers.join(',')].concat(
                        rows.map(r => r.map(v => {
                            const s = v == null ? '' : String(v);
                            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                        }).join(','))
                    );
                    return new TextEncoder().encode(lines.join('\n'));
                };

                const fallback = async () => {
                    const originalBuffer = new Uint8Array(await selectedFile.arrayBuffer());
                    return {
                        buffer: originalBuffer,
                        filename: selectedFile.name,
                        mimeType: selectedFile.type || 'text/csv'
                    };
                };

                if (!fixedPreview) {
                    return fallback();
                }

                try {
                    const lowerName = selectedFile.name.toLowerCase();

                    if (lowerName.endsWith('.csv')) {
                        const text = await selectedFile.text();
                        const parsed = csvParse(text, { skipEmptyLines: false, dynamicTyping: false });
                        const rawData = (parsed.data || []) as any[];
                        if (!rawData || rawData.length === 0) {
                            throw new Error('No data rows found in CSV.');
                        }
                        const headers = (rawData[0] || []).map((cell: any) => (cell ?? '').toString());
                        const rows = rawData.slice(1).map((row: any[]) => row.map(cell => (cell ?? '').toString()));
                        const { preview: fixedFull } = autoFixPreview({ headers, rows, totalRows: rows.length }, columnMapping);
                        const buffer = toCsvBuffer(fixedFull.headers, fixedFull.rows);
                        return {
                            buffer,
                            filename: `autofixed_${selectedFile.name.replace(/\.(csv|xlsx|xls)$/i, '')}.csv`,
                            mimeType: 'text/csv'
                        };
                    }

                    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                        const workbook = new ExcelJS.Workbook();
                        await workbook.xlsx.load(await selectedFile.arrayBuffer());
                        const worksheet = workbook.getWorksheet(1);
                        if (!worksheet) {
                            throw new Error('No worksheet found in Excel file');
                        }

                        const headers: string[] = [];
                        const rows: string[][] = [];

                        const headerRow = worksheet.getRow(1);
                        headerRow.eachCell((cell: any, colNumber: number) => {
                            headers[colNumber - 1] = cell.text || `Column${colNumber}`;
                        });

                        worksheet.eachRow((row: any, rowNumber: number) => {
                            if (rowNumber === 1) return; // Skip header
                            const rowData: string[] = [];
                            row.eachCell((cell: any, colNumber: number) => {
                                rowData[colNumber - 1] = cell.text || '';
                            });
                            rows.push(rowData);
                        });

                        const { preview: fixedFull } = autoFixPreview({ headers, rows, totalRows: rows.length }, columnMapping);
                        const buffer = toCsvBuffer(fixedFull.headers, fixedFull.rows);
                        return {
                            buffer,
                            filename: `autofixed_${selectedFile.name.replace(/\.(csv|xlsx|xls)$/i, '')}.csv`,
                            mimeType: 'text/csv'
                        };
                    }
                } catch (fixError) {
                    console.warn('Auto-fix failed on full dataset, using original file instead.', fixError);
                }

                return fallback();
            };

            const { buffer: fileDataBuffer, filename: uploadFilename, mimeType } = await buildUploadBuffer();
            const fileSize = fileDataBuffer.byteLength; // Use new buffer size if fixed
            setUploadProgress(10); // Show some progress after reading
            // --- Read file buffer --- END ---

            setUploadMessage('Sending file to backend...');
            logger.info('Sending file data via IPC...', {
                filename: uploadFilename,
                size: fileSize, // Use file size
                type: mimeType,
                datasetName: currentDatasetName.trim(),
                mappings: JSON.stringify(backendMappings)
            }, 'DataManagement');

            // Upload file via FastAPI
            const formData = new FormData();
            const blob = new Blob([new Uint8Array(fileDataBuffer)], {
                type: mimeType
            });
            const filename = uploadFilename;

            formData.append('file', blob, filename);
            formData.append('mappings', JSON.stringify(backendMappings));
            formData.append('datasetName', currentDatasetName.trim());
            formData.append('xDataMode', (localStorage.getItem('settings.dataMode') === 'performance') ? 'performance' : 'wage');
            if (activeProject) {
                formData.append('projectName', activeProject.name);
            }

            const response = await api.post('/data-management/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
                    setUploadProgress(Math.max(10, percentCompleted));
                }
            });
            const result = response.data;

            // Assuming the IPC handler returns the structure from processUploadedFile
            if (!result?.success) {
                throw new Error((result as any)?.error || (result as any)?.message || 'File processing failed.');
            }

            setProcessingStep('saving');
            setUploadMessage('Data saved.');
            setUploadProgress(100);

            const needsTraining = (result as any).needsTraining;
            await fetchDatasets(); // Refresh dataset list regardless of training status
            logger.info("Upload successful via IPC, datasets refreshed.", { result }, 'DataManagement');

            if (needsTraining) {
                setProcessingStep('training');
                setUploadMessage('Data saved. Starting model training...');
                if (activeProject?.id) {
                    startGlobalPolling(activeProject.id);
                }
                setFixedPreview(null);
                setAutoFixWarnings([]);
            } else {
                setProcessingStep('complete');
                setUploadStatus('success');
                setUploadMessage((result as any).message || 'File uploaded and processed successfully!');
                setSelectedFile(null); // Clear file input
                setShowMappingUI(false); // Hide mapping
                setDataPreview(null); // Clear preview
                setValidationResults(null);
                setFixedPreview(null);
                setAutoFixWarnings([]);
                // Optionally navigate or reset further state
                // navigateToHomeWithRefresh(); // Commented out to stay on page
            }

        } catch (error: unknown) { // Catch unknown
            logger.error('File upload via IPC failed:', error, 'DataManagement');
            setUploadStatus('error');
            setUploadProgress(0);
            setProcessingStep('uploading'); // Reset step on error

            let errorMessage = 'Unknown error occurred during upload via IPC';
            if (error instanceof Error) { // Standard JavaScript Error
                errorMessage = error.message;
            } else if (typeof error === 'string') { // Check if it's just a string
                errorMessage = error;
            }

            setUploadMessage(errorMessage);
            setGeneralError(errorMessage); // Also show general error if applicable
        }
        // Add activeProject to dependencies if needed, though projectId is captured
    }, [selectedFile, dataPreview, columnMapping, isColumnMappingComplete, fetchDatasets, startGlobalPolling, activeProject, fixedPreview, autoFixPreview]); // Removed getElectronApi from dependencies

    // Run DB Import using current mapping
    const handleRunDbImport = useCallback(async () => {
        try {
            if (!activeProject) return;
            if (!selectedConnection) {
                setGeneralError('Select a connection first');
                return;
            }
            if (!isColumnMappingComplete()) {
                setGeneralError('Complete required column mappings first');
                return;
            }
            if (!importDatasetName.trim()) {
                setGeneralError('Enter a dataset name');
                return;
            }

            setIsLoading(true);
            setGeneralError('');

            const backendMappings = {
                hr_code: columnMapping.identifier,
                full_name: columnMapping.name,
                structure_name: columnMapping.department,
                position: columnMapping.position,
                employee_cost: columnMapping.cost,
                status: columnMapping.status,
                manager_id: columnMapping.manager_id,
                tenure: columnMapping.tenure
            } as Record<string, string>;

            const payload: any = {
                datasetName: importDatasetName.trim(),
                mappings: backendMappings,
                limit: dbImportLimit
            };
            if (dbImportQuery && dbImportQuery.trim().length > 0) payload.query = dbImportQuery.trim();
            else if (selectedTable) payload.table = selectedTable;
            else {
                setGeneralError('Provide a SQL query or select a table');
                setIsLoading(false);
                return;
            }

            const resp = await api.post(`/api/data/connections/${selectedConnection}/import`, payload);
            if (resp.data?.success) {
                if (syncManagersAfterImport) {
                    try { await api.post('/api/data/datasets/export-scoped/all-managers', {}); } catch { }
                }
                await fetchDatasets();
                setUploadMessage(`Imported ${resp.data.recordCount} rows from DB`);
                setUploadStatus('success');
            } else {
                setGeneralError(resp.data?.error || 'Import failed');
            }
        } catch (e: any) {
            setGeneralError(e?.response?.data?.error || e?.message || 'DB import failed');
        } finally {
            setIsLoading(false);
        }
    }, [activeProject, selectedConnection, isColumnMappingComplete, importDatasetName, columnMapping, dbImportQuery, selectedTable, dbImportLimit, syncManagersAfterImport, fetchDatasets]);

    // Test database connection via API
    const handleTestConnection = useCallback(async () => {
        setConnectionStatus('testing');
        setConnectionMessage('');

        try {
            // Prepare params matching ConnectionTestParams
            interface ConnectionTestParams {
                type: string;
                host: string;
                port: string;
                username: string;
                password?: string;
                databaseName: string;
            }
            const params: ConnectionTestParams = {
                type: dbType,
                host: dbConfig.host,
                port: dbConfig.port,
                username: dbConfig.username,
                password: dbConfig.password,
                databaseName: dbConfig.databaseName
            };

            logger.info('Testing connection via API...', { params }, 'DataManagement');
            const response = await api.post('/data-management/test-connection', params);
            const result = response.data;

            if (result?.success) {
                setConnectionStatus('success');
                setConnectionMessage(result.message || 'Connection successful!');
            } else {
                // IPC handler throws on error, so we catch it below
                // This else block might not be reached unless the handler returns { success: false }
                setConnectionStatus('error');
                setConnectionMessage((result as any)?.error || 'Connection test failed (via IPC)'); // Type assertion if needed
            }
        } catch (error: any) {
            logger.error('Error testing connection via IPC:', error, 'DataManagement');
            setConnectionStatus('error');
            setConnectionMessage(error.message || 'Error testing connection via IPC.');
        }
    }, [dbConfig, dbType]); // Removed getElectronApi dependency, Added dbType dependency

    // Handle file selection
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }

        // Reset states
        setUploadStatus('idle');
        setUploadMessage('');
        setGeneralError('');
        setShowMappingUI(false);
        setDataPreview(null);
        setValidationResults(null);
        setColumnMapping({
            identifier: '',
            name: '',
            department: '',
            position: '',
            cost: '',
            status: '',
            manager_id: '',
            tenure: '',
            termination_date: '' // Added termination_date to initial state
        });

        const file = files[0];
        setSelectedFile(file);

        try {
            setUploadStatus('uploading');
            setUploadMessage('Processing file...');

            // Parse the file to get headers and preview data
            const preview = await parseFile(file);
            setDataPreview(preview);

            // Check for potential data issues
            const dataIssues = checkForDataIssues(preview);

            // Show mapping UI
            setUploadStatus('success');

            if (dataIssues.length > 0) {
                // Display warnings about potential data issues
                let warningMessage = 'File processed with warnings. Please check your data:';
                dataIssues.forEach(issue => {
                    warningMessage += `\n- ${issue}`;
                });
                setUploadMessage(warningMessage);
            } else {
                setUploadMessage('File uploaded successfully! Please map the columns below to continue.');
            }

            setShowMappingUI(true);

            // Try to auto-map columns if possible
            autoMapColumns(preview.headers);

        } catch (error) {
            setUploadStatus('error');
            setUploadMessage(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    // Auto-map columns based on common header names
    const autoMapColumns = (headers: string[]) => {
        const newMapping: ColumnMapping = {
            identifier: '',
            name: '', // Added name
            department: '',
            position: '',
            cost: '',
            status: '',
            manager_id: '',
            tenure: '',
            termination_date: '' // Added termination_date to initial state
        };

        headers.forEach(header => {
            const headerLower = header.toLowerCase();

            // Map identifier (employee id, name, etc.) - Prioritize non-name IDs
            if (
                !newMapping.identifier &&
                (headerLower.includes('id') || headerLower.includes('code') || headerLower.includes('number')) &&
                !headerLower.includes('name') // Avoid mapping 'name' as identifier if possible
            ) {
                newMapping.identifier = header;
            }

            // Map full name - Look for name, fullname, etc.
            if (
                !newMapping.name &&
                (headerLower.includes('name') || headerLower.includes('employee') || headerLower.includes('emp')) &&
                headerLower !== newMapping.identifier?.toLowerCase() // Don't map the same column twice
            ) {
                newMapping.name = header;
            }

            // Fallback for identifier if specific ID columns not found
            if (!newMapping.identifier && !newMapping.name && headerLower.includes('name')) {
                newMapping.identifier = header; // Use name as identifier as last resort
            }

            // Map department
            if (
                !newMapping.department &&
                (headerLower.includes('department') ||
                    headerLower.includes('dept') ||
                    headerLower.includes('division') ||
                    headerLower.includes('unit'))
            ) {
                newMapping.department = header;
            }

            // Map position/role
            if (
                !newMapping.position &&
                (headerLower.includes('position') ||
                    headerLower.includes('title') ||
                    headerLower.includes('role') ||
                    headerLower.includes('job'))
            ) {
                newMapping.position = header;
            }

            // Map cost/salary
            if (
                !newMapping.cost &&
                (headerLower.includes('cost') ||
                    headerLower.includes('salary') ||
                    headerLower.includes('wage') ||
                    headerLower.includes('pay'))
            ) {
                newMapping.cost = header;
            }

            // Map status
            if (
                !newMapping.status &&
                (headerLower.includes('status') ||
                    headerLower.includes('state') ||
                    headerLower.includes('employed') ||
                    headerLower.includes('active'))
            ) {
                newMapping.status = header;
            }

            // Map tenure
            if (
                !newMapping.tenure &&
                (headerLower.includes('tenure') ||
                    headerLower.includes('years') ||
                    headerLower.includes('months') ||
                    headerLower.includes('duration'))
            ) {
                newMapping.tenure = header;
            }

            // Map manager_id
            if (
                !newMapping.manager_id &&
                (headerLower === 'manager_id' || headerLower.includes('manager'))
            ) {
                newMapping.manager_id = header;
            }
        });

        setColumnMapping(newMapping);
    };

    // Database config change handlers
    const handleDbConfigChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = event.target;
        setDbConfig(prevConfig => ({
            ...prevConfig,
            [name]: value
        }));
        setConnectionStatus('idle');
        setConnectionMessage('');
        setGeneralError('');
    };

    const handleDbTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedType = event.target.value as DbType;
        setDbType(selectedType);

        // Update port placeholder based on database type
        const newPort = getDefaultPort(selectedType);
        setDbConfig({
            ...dbConfig,
            port: newPort
        });
    };

    // Helper function to get default port for a database type
    const getDefaultPort = (dbType: DbType): string => {
        switch (dbType) {
            case 'PostgreSQL': return '5432';
            case 'MySQL': return '3306';
            case 'SQL Server': return '1433';
            case 'Oracle': return '1521';
            default: return '';
        }
    };

    // Helper function to clean and format numeric values
    const normalizeNumericValue = (value: string | number): number | null => {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        // Convert to string if it's not already
        const strValue = value.toString().trim();

        // Handle special cases like 'N/A', '-', etc.
        if (['n/a', 'na', '-', 'null', 'none', 'unknown'].includes(strValue.toLowerCase())) {
            return null;
        }

        try {
            // First attempt: Try direct conversion for clean numbers
            const directNum = Number(strValue);
            if (!isNaN(directNum)) {
                return directNum;
            }

            // Second attempt: Remove currency symbols, commas, spaces, and other non-numeric characters
            // Keep decimal points and negative signs
            let cleanedValue = strValue.replace(/[^0-9.-]/g, '');

            // Handle cases with multiple decimal points (take the first one)
            const decimalPoints = cleanedValue.match(/\./g);
            if (decimalPoints && decimalPoints.length > 1) {
                const parts = cleanedValue.split('.');
                cleanedValue = parts[0] + '.' + parts.slice(1).join('');
            }

            // Parse to number
            const numValue = parseFloat(cleanedValue);

            // Return null if it's NaN, otherwise return the number
            return isNaN(numValue) ? null : numValue;
        } catch (e) {
            return null;
        }
    };

    // Function to check for potential data issues
    const checkForDataIssues = (preview: DataPreview): string[] => {
        const issues: string[] = [];

        // Check for potential header issues
        const commonHeaderNames = [
            'employee', 'name', 'id', 'emp', 'code', 'department', 'dept',
            'division', 'position', 'title', 'role', 'salary', 'cost',
            'status', 'state'
        ];

        let foundMatchingHeaders = 0;
        preview.headers.forEach(header => {
            const headerLower = header.toLowerCase();
            if (commonHeaderNames.some(name => headerLower.includes(name))) {
                foundMatchingHeaders++;
            }
        });

        if (foundMatchingHeaders < 3 && preview.headers.length > 0) {
            issues.push("Your headers don't appear to match expected column names. Verify your file has employee, department, position, cost, and status information.");
        }

        // Check if there might be an extra header row
        if (preview.rows.length > 0) {
            const firstRowMayBeHeader = preview.rows[0].some((cell, index) => {
                const headerValue = preview.headers[index].toLowerCase();
                const cellValue = String(cell).toLowerCase();
                return (
                    cellValue.includes('employee') ||
                    cellValue.includes('dept') ||
                    cellValue.includes('id') ||
                    cellValue.includes('position') ||
                    cellValue.includes('status')
                ) && headerValue !== cellValue;
            });

            if (firstRowMayBeHeader) {
                issues.push("First data row might be another header row. Check if your file has multiple header rows.");
            }
        }

        // Check for potential empty columns
        preview.headers.forEach((header, index) => {
            const allEmpty = preview.rows.every(row => !row[index]);
            if (allEmpty) {
                issues.push(`Column "${header}" appears to be empty in the preview data.`);
            }
        });

        // Check for potential numeric columns with non-numeric data
        preview.headers.forEach((header, index) => {
            const headerLower = header.toLowerCase();
            if (
                headerLower.includes('salary') ||
                headerLower.includes('cost') ||
                headerLower.includes('wage') ||
                headerLower.includes('amount')
            ) {
                const nonNumericValues = preview.rows.some(row => {
                    const value = row[index];
                    return value && isNaN(Number(value.toString().replace(/[$,]/g, '')));
                });

                if (nonNumericValues) {
                    issues.push(`Column "${header}" appears to contain non-numeric values but looks like it should be numeric.`);
                }
            }
        });

        return issues;
    };

    // Parse the uploaded file to extract headers and preview data
    const parseFile = async (file: File): Promise<DataPreview> => {
        return new Promise((resolve, reject) => {
            if (file.name.endsWith('.csv')) {
                // Parse CSV file
                csvParse(file, {
                    preview: 5, // Read first 5 rows for preview
                    complete: (results) => {
                        try {
                            const headers = results.data[0] as string[];
                            const rows = results.data.slice(1) as string[][];

                            checkForDataIssues({ headers, rows, totalRows: results.data.length - 1 });

                            resolve({
                                headers,
                                rows,
                                totalRows: results.data.length - 1
                            });
                        } catch (error) {
                            reject(new Error('Failed to parse CSV file'));
                        }
                    },
                    error: (error) => {
                        reject(error);
                    }
                });
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // SECURITY: Parse Excel file using secure ExcelJS instead of vulnerable xlsx
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = e.target?.result;
                        if (!data) {
                            reject(new Error('Failed to read Excel file'));
                            return;
                        }

                        const workbook = new ExcelJS.Workbook();
                        await workbook.xlsx.load(data as ArrayBuffer);

                        const worksheet = workbook.getWorksheet(1); // Get first worksheet
                        if (!worksheet) {
                            reject(new Error('No worksheet found in Excel file'));
                            return;
                        }

                        const headers: string[] = [];
                        const rows: string[][] = [];

                        // Extract headers from first row
                        const headerRow = worksheet.getRow(1);
                        headerRow.eachCell((cell, colNumber) => {
                            headers[colNumber - 1] = cell.text || `Column${colNumber}`;
                        });

                        // Extract data rows (first 5 for preview)
                        let rowCount = 0;
                        worksheet.eachRow((row, rowNumber) => {
                            if (rowNumber === 1) return; // Skip header row
                            if (rowCount >= 5) return; // Only get first 5 rows for preview

                            const rowData: string[] = [];
                            row.eachCell((cell, colNumber) => {
                                rowData[colNumber - 1] = cell.text || '';
                            });
                            rows.push(rowData);
                            rowCount++;
                        });

                        const totalRows = worksheet.rowCount - 1; // Exclude header row

                        checkForDataIssues({ headers, rows, totalRows });

                        resolve({
                            headers,
                            rows,
                            totalRows
                        });
                    } catch (error) {
                        reject(new Error('Failed to parse Excel file'));
                    }
                };
                reader.onerror = () => {
                    reject(new Error('Failed to read Excel file'));
                };
                reader.readAsArrayBuffer(file);
            } else {
                reject(new Error('Unsupported file format'));
            }
        });
    };

    const loadValidationDataset = async (file: File): Promise<DataPreview> => {
        if (file.name.endsWith('.csv')) {
            return new Promise((resolve, reject) => {
                csvParse(file, {
                    skipEmptyLines: false,
                    dynamicTyping: false,
                    complete: (results) => {
                        try {
                            if (!results.data || results.data.length === 0) {
                                reject(new Error('No data rows found in file'));
                                return;
                            }
                            const rawRows = results.data as string[][];
                            const headers = rawRows[0]?.map(cell => (cell ?? '').toString().trim()) ?? [];
                            const rows = rawRows.slice(1).map(row =>
                                row.map(cell => (cell ?? '').toString())
                            );
                            resolve({ headers, rows, totalRows: rows.length });
                        } catch (error) {
                            reject(new Error('Failed to parse CSV file for validation'));
                        }
                    },
                    error: (error) => reject(error)
                });
            });
        }

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = async (e) => {
                    try {
                        const data = e.target?.result;
                        if (!data) {
                            reject(new Error('Failed to read Excel file for validation'));
                            return;
                        }

                        const workbook = new ExcelJS.Workbook();
                        await workbook.xlsx.load(data as ArrayBuffer);
                        const worksheet = workbook.getWorksheet(1);
                        if (!worksheet) {
                            reject(new Error('No worksheet found in Excel file')); return;
                        }

                        const headers: string[] = [];
                        const rows: string[][] = [];

                        const headerRow = worksheet.getRow(1);
                        headerRow.eachCell((cell: any, colNumber: number) => {
                            headers[colNumber - 1] = cell.text || `Column${colNumber}`;
                        });

                        worksheet.eachRow((row: any, rowNumber: number) => {
                            if (rowNumber === 1) return;
                            const rowData: string[] = [];
                            row.eachCell((cell: any, colNumber: number) => {
                                rowData[colNumber - 1] = cell.text || '';
                            });
                            rows.push(rowData);
                        });

                        resolve({ headers, rows, totalRows: rows.length });
                    } catch (error) {
                        reject(new Error('Failed to parse Excel file for validation'));
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read Excel file for validation'));
                reader.readAsArrayBuffer(file);
            });
        }

        throw new Error('Unsupported file format');
    };

    // Handle column mapping changes
    const handleColumnMappingChange = (mappingKey: keyof ColumnMapping, value: string) => {
        setColumnMapping(prev => ({
            ...prev,
            [mappingKey]: value
        }));
    };

    // New function to validate data before upload

    // Helper functions for database fields
    const getPortPlaceholder = () => {
        switch (dbType) {
            case 'PostgreSQL': return '5432';
            case 'MySQL': return '3306';
            case 'SQL Server': return '1433';
            case 'Oracle': return '1521';
            default: return 'e.g., 5432';
        }
    };

    const getDbNameLabel = () => dbType === 'Oracle' ? 'Service Name / SID' : 'Database Name';
    const getDbNamePlaceholder = () => dbType === 'Oracle' ? 'e.g., ORCLPDB1' : 'e.g., my_database';

    // Handle mapping change

    // Update setActiveDataset to use API
    const setActiveDataset = useCallback(async (datasetId: string) => {
        // Use activeProject from context
        if (!activeProject) {
            setGeneralError('Cannot activate dataset: No active project selected.');
            return;
        }
        const currentProjectId = activeProject.id; // Use project ID

        setGeneralError('');
        try {
            logger.info('Setting active dataset via API...', { datasetId }, 'DataManagement');
            const response = await api.post(`/data-management/datasets/${datasetId}/activate`);
            const result = response.data;

            if (result?.success) {
                fetchDatasets(); // Refresh list (uses context project implicitly)
                // Ensure projectId is passed to fetchHomeData
                useGlobalDataCache.getState().fetchHomeData(currentProjectId, true);
                try { localStorage.setItem('activeDatasetId', datasetId); } catch { /* noop */ }
                setUploadMessage('Dataset set as active.');
                setUploadStatus('success');
            } else {
                throw new Error(result?.error || 'Failed to set active dataset via IPC');
            }
        } catch (err: any) {
            logger.error('Error setting active dataset via IPC:', err, 'DataManagement');
            setGeneralError(err.message || 'Could not set active dataset via IPC.');
        }
    }, [activeProject, fetchDatasets]); // fetchDatasets is stable

    // Add useEffect to fetch training status on mount - Pass project ID
    useEffect(() => {
        // Get the function from the global state
        const globalFetchTrainingStatus = useGlobalDataCache.getState().fetchTrainingStatus;
        // Call it only if project is loaded and active
        if (activeProject && !isLoadingProject) {
            globalFetchTrainingStatus(activeProject.id);
        }
    }, [activeProject, isLoadingProject]); // Add dependencies

    // Add helper functions for formatting
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Add active dataset stats component
    const ActiveDatasetStats = ({ datasets }: { datasets: Dataset[] }): React.ReactElement | null => {
        const activeDataset = datasets.find(d => d.active);

        // Use activeProject from context
        if (!activeProject) return null;

        return (
            <motion.section
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg border border-green-300 dark:border-emerald-800 border-l-4 border-l-green-500 dark:border-l-emerald-500 mb-6"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-emerald-900/40 rounded-lg">
                            <Database className="w-5 h-5 text-green-700 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Active Dataset</h2>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {activeDataset
                                    ? <>Currently using dataset <span className="font-medium text-gray-800 dark:text-gray-100">{activeDataset.name}</span> from project <span className="font-medium text-gray-800 dark:text-gray-100">{activeProject.name}</span> for predictions.</>
                                    : <>No active dataset selected in project <span className="font-medium text-gray-800 dark:text-gray-100">{activeProject.name}</span>.</>
                                }
                            </p>
                        </div>
                    </div>
                    {/* Train Model / Retrain Button */}
                    {/* Show button when there's an active dataset and training is not currently in progress */}
                    {activeDataset && trainingStatus && trainingStatus.status !== 'in_progress' && trainingStatus.status !== 'queued' && (
                        <button
                            onClick={handleStartTraining}
                            disabled={isLoading}
                            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors disabled:bg-blue-400 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1.5 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-700"
                        >
                            {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            {trainingStatus.status === 'complete' ? 'Retrain Model' : 'Train Model'}
                        </button>
                    )}
                </div>
                {/* Active Dataset Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="border border-gray-200 dark:border-slate-700 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/80">
                        <span className="text-xs uppercase text-gray-500 dark:text-slate-400">Type</span>
                        <p className="font-medium text-gray-800 dark:text-slate-100">{activeDataset?.type || 'N/A'}</p>
                    </div>
                    <div className="border border-gray-200 dark:border-slate-700 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/80">
                        <span className="text-xs uppercase text-gray-500 dark:text-slate-400">Uploaded</span>
                        <p className="font-medium text-gray-800 dark:text-slate-100">{activeDataset ? formatDate(activeDataset.uploadedAt) : 'N/A'}</p>
                    </div>
                    <div className="border border-gray-200 dark:border-slate-700 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/80">
                        <span className="text-xs uppercase text-gray-500 dark:text-slate-400">Records</span>
                        <p className="font-medium text-gray-800 dark:text-slate-100">{activeDataset?.rowCount?.toLocaleString() || 'N/A'}</p>
                    </div>
                </div>
                {/* Read status from global store for TrainingStatusDisplay - check if trainingStatus exists */}
                {activeDataset && trainingStatus && <TrainingStatusDisplay />}
            </motion.section>
        );
    };

    // Function to run deep validation on dataset and identify specific issues
    const performDeepValidation = (preview: DataPreview, mapping: ColumnMapping): ValidationResult => {
        const issues: Record<string, ValidationIssue[]> = {};

        let hasIssues = false;
        const MAX_ROW_EXAMPLES = 25;
        const fieldDisplayNames: Record<string, string> = {
            'identifier': 'Employee Identifier',
            'name': 'Employee Name',
            'department': 'Department',
            'position': 'Position',
            'cost': 'Employee Cost',
            'status': 'Employment Status',
            'manager_id': 'Manager ID',
            'tenure': 'Tenure',
            'termination_date': 'Termination Date',
            'performance_rating_latest': 'Latest Performance Rating'
        };

        if (!preview || preview.totalRows === 0) {
            return {
                valid: false,
                totalRows: preview?.totalRows ?? 0,
                columnIssues: {
                    general: [{
                        column: 'general',
                        fieldName: 'Dataset',
                        issueType: 'invalid',
                        description: 'No data rows detected in the uploaded file.',
                        rowIndices: [],
                        exampleValues: [],
                        suggestion: 'Ensure the file contains data below the header row.'
                    }]
                }
            };
        }

        // Check all mapped columns
        Object.entries(mapping).forEach(([fieldName, columnName]) => {
            if (!columnName) return; // Skip unmapped fields

            const columnIndex = preview.headers.indexOf(columnName);
            if (columnIndex === -1) {
                hasIssues = true;
                issues[columnName] = [
                    {
                        column: columnName,
                        fieldName: fieldDisplayNames[fieldName] || fieldName,
                        issueType: 'invalid',
                        description: 'Mapped column not found in uploaded file headers.',
                        rowIndices: [],
                        exampleValues: [],
                        suggestion: 'Verify the column mapping matches the file headers exactly.'
                    }
                ];
                return;
            }

            // Find the field configuration to check if it's required
            const fieldConfig = MAPPABLE_FIELDS_CONFIG.find(config => config.key === fieldName);
            const isFieldRequired = fieldConfig?.required ?? true; // Default to required if not found

            // Initialize issues array for this column
            if (!issues[columnName]) issues[columnName] = [];

            // Check for empty values only if the field is required
            if (isFieldRequired) {
                const emptyRowIndices: number[] = [];
                let emptyCount = 0;
                preview.rows.forEach((row, rowIndex) => {
                    // Use strict equality and explicit type checking
                    const cellValue = row[columnIndex];
                    const isEmpty = cellValue === undefined ||
                        cellValue === null ||
                        cellValue === '' ||
                        (typeof cellValue === 'string' && cellValue.trim() === '');

                    // Convert to string for consistent comparison
                    const stringValue = String(cellValue).trim();
                    const isZero = stringValue === '0' || Number(stringValue) === 0;

                    if (isEmpty && !isZero) {
                        emptyCount += 1;
                        if (emptyRowIndices.length < MAX_ROW_EXAMPLES) emptyRowIndices.push(rowIndex + 2); // +2 for 1-indexed display and header row
                    }
                });

                if (emptyCount > 0) {
                    hasIssues = true;
                    issues[columnName].push({
                        column: columnName,
                        fieldName: fieldDisplayNames[fieldName] || fieldName,
                        issueType: 'empty',
                        description: `${emptyCount} empty value${emptyCount !== 1 ? 's' : ''} found`,
                        rowIndices: emptyRowIndices,
                        exampleValues: [],
                        suggestion: 'Fill in missing values or ensure the correct column is mapped'
                    });
                }
            }

            // Special validation for cost column - check numeric values
            if (fieldName === 'cost') {
                const nonNumericRows: number[] = [];
                let nonNumericCount = 0;
                const problematicValues: string[] = [];

                preview.rows.forEach((row, rowIndex) => {
                    const value = row[columnIndex];
                    if (value && normalizeNumericValue(value) === null) {
                        nonNumericCount += 1;
                        if (nonNumericRows.length < MAX_ROW_EXAMPLES) nonNumericRows.push(rowIndex + 2); // +2 for 1-indexed display and header row
                        if (problematicValues.length < 5) {
                            problematicValues.push(value.toString());
                        }
                    }
                });

                if (nonNumericCount > 0) {
                    hasIssues = true;
                    issues[columnName].push({
                        column: columnName,
                        fieldName: fieldDisplayNames[fieldName],
                        issueType: 'type',
                        description: `${nonNumericCount} non-numeric value${nonNumericCount !== 1 ? 's' : ''} found`,
                        rowIndices: nonNumericRows,
                        exampleValues: problematicValues,
                        suggestion: 'Remove currency symbols, commas, or text. Ensure values are numbers only.'
                    });
                }
            }

            // Check for status values consistency
            if (fieldName === 'status') {
                const statusValues = new Map<string, number>();

                // Count frequency of each status value
                preview.rows.forEach((row) => {
                    const value = row[columnIndex];
                    if (value) {
                        const normalized = value.toString().trim().toLowerCase();
                        statusValues.set(normalized, (statusValues.get(normalized) || 0) + 1);
                    }
                });

                // Check if there are too many unique status values (> 10 is suspicious)
                // Use Number for explicit type conversion to avoid linter errors
                if (Number(statusValues.size) > 10) {
                    hasIssues = true;
                    issues[columnName].push({
                        column: columnName,
                        fieldName: fieldDisplayNames[fieldName],
                        issueType: 'format',
                        description: `${statusValues.size} unique status values found (unusually high)`,
                        rowIndices: [],
                        exampleValues: Array.from(statusValues.keys()).slice(0, 5),
                        suggestion: 'Status should typically be limited values like "Active", "Resigned", "Terminated". Verify column mapping.'
                    });
                }
            }
        });

        return {
            valid: !hasIssues,
            columnIssues: issues,
            totalRows: preview.totalRows
        };
    };

    // Helper component for displaying column diagnosis
    const DataDiagnosisDialog: React.FC<{
        results: ValidationResult;
        onClose: () => void;
        onProceed: () => void;
    }> = ({ results, onClose, onProceed }) => {
        const [expandedColumns, setExpandedColumns] = useState<{ [key: string]: boolean }>({});

        const toggleColumn = (column: string) => {
            setExpandedColumns(prev => ({
                ...prev,
                [column]: !prev[column]
            }));
        };

        // Count total issues
        const totalIssues = Object.values(results.columnIssues).reduce(
            (sum: number, issues: any) => sum + (issues as any[]).length, 0
        );

        // Format column issues for display
        const columnIssueList = Object.entries(results.columnIssues)
            .filter(([_, issues]) => (issues as any[]).length > 0)
            .map(([column, issues]) => ({ column, issues }));

        // Check if issues can be auto-fixed
        const canAutoFix = !columnIssueList.some(({ issues }) =>
            (issues as any[]).some((issue: any) =>
                issue.issueType === 'format' ||
                (issue.issueType === 'empty' && issue.fieldName.toString() === 'Employee Identifier')
            )
        );

        return (
            <div className="fixed inset-0 bg-black/60 dark:bg-black/70 z-50 flex items-center justify-center p-4"> {/* Adjusted dark overlay opacity */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700"> {/* Added border */}
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                Data Diagnosis Results
                            </h2>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 transition-colors" /* Improved hover for dark */
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">
                            {results.valid
                                ? 'Your data passed all validation checks!'
                                : `Found ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} in ${columnIssueList.length} column${columnIssueList.length !== 1 ? 's' : ''}. Review below or proceed with caution.` /* Clarified message */}
                        </p>
                    </div>

                    <div className="p-4 overflow-y-auto flex-grow bg-gray-50 dark:bg-gray-800/50 rounded-b-xl"> {/* Added bg for content area */}
                        {!results.valid && (
                            <div className="space-y-4">
                                {columnIssueList.map(({ column, issues }) => (
                                    <div key={column} className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 shadow-sm"> {/* Card style for each column */}
                                        <button
                                            onClick={() => toggleColumn(column)}
                                            className="w-full p-4 flex items-center justify-between bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-600/70 text-left transition-colors" /* Enhanced header */
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-800 dark:text-gray-100">{column}</span>
                                                <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-500/30 text-red-700 dark:text-red-300 rounded-full border border-red-300 dark:border-red-500/50"> {/* Enhanced badge */}
                                                    {(issues as any[]).length} issue{(issues as any[]).length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <svg
                                                className={`h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform ${expandedColumns[column] ? 'transform rotate-180' : ''}`}
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>

                                        {expandedColumns[column] && (
                                            <div className="p-4 border-t border-gray-300 dark:border-gray-600 space-y-3 bg-white dark:bg-gray-700/50"> {/* Content area bg */}
                                                {(issues as any[]).map((issue: any, i: number) => (
                                                    <div key={i} className="space-y-2 p-3 bg-gray-50 dark:bg-gray-600/30 rounded-md border border-gray-200 dark:border-gray-500/50"> {/* Individual issue card */}
                                                        <div className="flex items-start gap-2">
                                                            <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full ${issue.issueType === 'empty' ? 'bg-yellow-400 dark:bg-yellow-500' :
                                                                issue.issueType === 'type' ? 'bg-purple-400 dark:bg-purple-500' :
                                                                    issue.issueType === 'format' ? 'bg-blue-400 dark:bg-blue-500' : 'bg-red-400 dark:bg-red-500'
                                                                }`} />
                                                            <div>
                                                                <p className="font-medium text-gray-800 dark:text-gray-100">
                                                                    {issue.description}
                                                                </p>
                                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                    {issue.fieldName} field
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {issue.exampleValues.length > 0 && (
                                                            <div className="ml-6 p-2 bg-gray-100 dark:bg-gray-500/30 rounded text-sm border border-gray-200 dark:border-gray-600/50"> {/* Example values card */}
                                                                <span className="font-medium text-gray-700 dark:text-gray-300">Example values:</span>
                                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                                    {issue.exampleValues.map((val: any, j: number) => (
                                                                        <span key={j} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded text-xs shadow-sm"> {/* Value chip */}
                                                                            {val}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="ml-6 text-sm">
                                                            <span className="font-medium text-blue-600 dark:text-blue-400">Suggestion:</span>
                                                            <span className="text-gray-700 dark:text-gray-300"> {issue.suggestion}</span>
                                                        </div>

                                                        {issue.rowIndices.length > 0 && (
                                                            <div className="ml-6 text-sm text-gray-600 dark:text-gray-400">
                                                                <span className="font-medium">Found in rows:</span>{' '}
                                                                {issue.rowIndices.length > 5
                                                                    ? `${issue.rowIndices.slice(0, 5).join(', ')} and ${issue.rowIndices.length - 5} more`
                                                                    : issue.rowIndices.join(', ')
                                                                }
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl"> {/* Adjusted gap and bg */}
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 transition-colors shadow-sm" /* Consistent button styling */
                        >
                            Cancel
                        </button>

                        {!results.valid && canAutoFix && (
                            <button
                                onClick={onProceed}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 border border-blue-700 dark:border-blue-500 transition-colors shadow-sm" /* Consistent button styling */
                            >
                                Try Automatic Fix
                            </button>
                        )}

                        {!results.valid && !canAutoFix && (
                            <button
                                onClick={onProceed}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 border border-red-700 dark:border-red-500 transition-colors shadow-sm" /* Consistent button styling */
                            >
                                Upload Anyway
                            </button>
                        )}

                        {results.valid && (
                            <button
                                onClick={onProceed}
                                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 border border-green-700 dark:border-green-500 transition-colors shadow-sm" /* Consistent button styling */
                            >
                                Continue Upload
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Handler for closing the diagnosis dialog
    const handleCloseDiagnosis = () => {
        setShowDiagnosisResults(false);
        setUploadStatus('idle');
        setValidationResults(null);
    };

    // Handler for proceeding with upload despite diagnosis issues
    const handleProceedAnyway = () => {
        setShowDiagnosisResults(false);
        // Continue with upload
        handleUpload();
    };

    // Add function to fetch model training status

    // Add a TrainingStatusDisplay component - reads from global trainingStatus now
    const TrainingStatusDisplay = () => {
        // Subscribe directly to the store for proper reactivity
        const currentTrainingStatus = useGlobalDataCache(state => state.trainingStatus);

        // Use global trainingStatus, check if null before accessing properties
        if (!currentTrainingStatus || currentTrainingStatus.status === 'idle') return null;

        let statusColor = 'gray';
        let statusIcon = <Loader2 className="w-4 h-4 animate-spin" />;
        let bgColor = 'bg-gray-50 dark:bg-slate-800/80'; // Darker background for dark mode
        let borderColor = 'border-gray-200 dark:border-slate-600';
        let textColor = 'text-gray-700 dark:text-slate-200';

        if (currentTrainingStatus.status === 'in_progress' || currentTrainingStatus.status === 'queued') {
            statusColor = 'blue';
            statusIcon = <Loader2 className="w-4 h-4 animate-spin" />;
            bgColor = 'bg-blue-50 dark:bg-blue-950/50';
            borderColor = 'border-blue-300 dark:border-blue-800';
            textColor = 'text-blue-700 dark:text-blue-300';
        } else if (currentTrainingStatus.status === 'complete') {
            statusColor = 'green';
            statusIcon = <Check className="w-4 h-4" />;
            bgColor = 'bg-green-50 dark:bg-emerald-950/50';
            borderColor = 'border-green-300 dark:border-emerald-800';
            textColor = 'text-green-700 dark:text-emerald-300';
        } else if (currentTrainingStatus.status === 'error') {
            statusColor = 'red';
            statusIcon = <X className="w-4 h-4" />;
            bgColor = 'bg-red-50 dark:bg-red-950/50';
            borderColor = 'border-red-300 dark:border-red-800';
            textColor = 'text-red-700 dark:text-red-300';
        }

        return (
            <div className={`mt-4 p-4 border rounded-lg ${bgColor} ${borderColor}`}>
                <div className={`flex items-center gap-2 mb-2 ${textColor}`}>
                    {statusIcon}
                    <span className="font-medium">
                        Model Training: {currentTrainingStatus.status.charAt(0).toUpperCase() + currentTrainingStatus.status.slice(1)}
                    </span>
                </div>

                <p className={`text-sm mb-2 ${textColor}`}>
                    {currentTrainingStatus.message || 'Loading status...'}
                </p>

                {currentTrainingStatus.status === 'complete' && (
                    <p className={`text-xs ${textColor} opacity-75`}>
                        Model is ready for predictions. You can retrain with new data if needed.
                    </p>
                )}

                {(currentTrainingStatus.status === 'in_progress' || currentTrainingStatus.status === 'queued') && (
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5 mb-2">
                        <div
                            className={`h-2.5 rounded-full ${statusColor === 'blue' ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-500'}`}
                            style={{ width: `${currentTrainingStatus.progress || 0}%` }}
                        ></div>
                    </div>
                )}

                {currentTrainingStatus.error && (
                    <p className={`text-sm mt-2 ${statusColor === 'red' ? 'text-red-600 dark:text-red-400' : textColor}`}>{currentTrainingStatus.error}</p>
                )}
            </div>
        );
    };

    // Add the handleStartTraining function within the DataManagement component
    const handleStartTraining = useCallback(async () => {
        const activeDataset = datasets.find(ds => ds.active);
        // Use activeProject from context
        if (!activeProject || !activeDataset || (trainingStatus && (trainingStatus.status === 'in_progress' || trainingStatus.status === 'queued'))) {
            setGeneralError('Please ensure an active project and dataset are selected, and no training is currently running.');
            logger.warn('handleStartTraining: Preconditions not met.', { hasProject: !!activeProject, hasActiveDataset: !!activeDataset, trainingStatus }, 'DataManagement');
            return;
        }
        const projectId = activeProject.id; // Get project ID

        setGeneralError('');

        try {
            // Start model training via API
            const response = await api.post('/churn/train');
            const result = response.data;
            if (result.success && result.status) {
                logger.info('Training successfully queued via API.', { status: result.status }, 'DataManagement');
                // Start GLOBAL POLLING - PASS PROJECT ID
                logger.info(`Triggering global cache polling for training status (Project: ${projectId}).`, undefined, 'DataManagement');
                startGlobalPolling(projectId, activeDataset.id);
            } else {
                const errorMessage = result.error || 'Failed to start training (unknown reason)';
                throw new Error(errorMessage);
            }
        } catch (error: any) {
            logger.error('Error starting training via API:', error, 'DataManagement');
            setGeneralError(error.response?.data?.detail || error.message || 'Could not start training via API.');
        }
        // Ensure dependencies are correct
    }, [activeProject, datasets, startGlobalPolling, trainingStatus]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"> {/* ADJUSTED main background and text for consistency */}
            {renderHeader()}
            <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
                {/* General Error Display */}
                {generalError && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-4 p-4 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-600/50 rounded-lg flex items-center gap-3 shadow-sm flex-shrink-0"
                    >
                        <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-300 flex-shrink-0" />
                        <p className="text-sm text-red-800 dark:text-red-200">{generalError}</p>
                    </motion.div>
                )}

                {/* Active Dataset Stats - uses activeProject from context */}
                {!isLoadingProject && activeProject && ( // Show only when project is loaded and exists
                    <ActiveDatasetStats datasets={datasets} />
                )}

                {/* Project Management Card */}
                <motion.section
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="mb-6 bg-white dark:bg-gray-800/70 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-700/50 flex-shrink-0" /* Adjusted dark bg and border */
                >
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-600/20 rounded-lg">
                                <FolderOpen className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Project Management</h2>
                        </div>
                        <button
                            onClick={fetchProjects}
                            disabled={isProjectListLoading || isLoadingProject} // Disable if context is loading project OR list is loading
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
                            title="Refresh project list"
                        >
                            {/* Use isProjectListLoading for the spin animation */}
                            <RefreshCw className={`w-5 h-5 ${isProjectListLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {/* Active Project Display - uses activeProject from context */}
                    <div className="mb-4 p-3 rounded-lg border border-blue-300 dark:border-blue-600/80 bg-blue-50 dark:bg-blue-900/40"> {/* Adjusted dark bg */}
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">Active Project:</span>
                        <span className="ml-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                            {isLoadingProject ? <Loader2 className="w-4 h-4 inline animate-spin" /> : activeProject ? activeProject.name : 'None selected'}
                        </span>
                        {!isLoadingProject && activeProject && ( // Show deactivate only when loaded and active
                            <button
                                onClick={() => handleSetActiveProject(null)} // API call
                                className="ml-3 text-xs text-blue-700 dark:text-blue-300 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 rounded" /* Added dark focus ring */
                                title="Deactivate project"
                            >
                                (Deactivate)
                            </button>
                        )}
                    </div>

                    {/* Create Project Form */}
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="New project name..."
                            disabled={isCreatingProject}
                            className="flex-grow px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500 dark:focus:ring-purple-400 text-sm" /* Adjusted dark focus ring */
                        />
                        <button
                            onClick={handleCreateProject}
                            disabled={!newProjectName.trim() || isCreatingProject}
                            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 dark:disabled:opacity-70 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800" /* Adjusted dark disabled and focus */
                        >
                            {isCreatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                            Create
                        </button>
                    </div>

                    {projectError && (
                        <p className="text-sm text-red-700 dark:text-red-300 mb-3">Error: {projectError}</p> /* Adjusted dark error text */
                    )}

                    {/* Project List - uses activeProject from context for highlighting */}
                    <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2 space-y-2 bg-gray-100 dark:bg-gray-700/60"> {/* Adjusted dark bg */}
                        {isProjectListLoading ? ( // Use specific loading state
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="w-5 h-5 animate-spin text-gray-400 dark:text-gray-500" /> /* Adjusted dark spinner color */
                            </div>
                        ) : projects.length === 0 ? (
                            <p className="text-sm text-center text-gray-500 dark:text-gray-400 p-4">No projects found. Create one above.</p>
                        ) : (projects.map(proj => (
                            <div
                                key={proj.path}
                                // Highlight based on activeProject from context
                                className={`flex items-center justify-between p-4 rounded-md transition-all duration-150 ${activeProject?.path === proj.path ? 'bg-blue-100 dark:bg-blue-800/70 ring-1 ring-blue-500 dark:ring-blue-400' : 'bg-white dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600/80'}`} /* Increased padding from p-3 to p-4 */
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Icon based on activeProject from context */}
                                    {activeProject?.path === proj.path ? (
                                        <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-300 flex-shrink-0" />
                                    ) : (
                                        <Folder className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={proj.name}>{proj.name}</span>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={proj.id}>{proj.id}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {/* Activate button based on activeProject from context */}
                                    {!isLoadingProject && activeProject?.path !== proj.path && ( // Don't show activate if context is loading or already active
                                        <button
                                            onClick={() => handleSetActiveProject(proj.dbPath)} // API Call
                                            className="p-1.5 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-300 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-green-500 dark:focus:ring-green-400" /* Adjusted dark focus ring */
                                            title="Set as active project"
                                            disabled={isLoadingProject} // Disable if context is busy
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                        </button>
                                    )}
                                    {/* Delete button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteProject(proj);
                                        }}
                                        className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-red-500 dark:focus:ring-red-400" /* Adjusted dark focus ring */
                                        title="Delete project"
                                        disabled={isLoadingProject || isProjectListLoading} // Disable if context/list is busy
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )))
                        }
                    </div>
                    {/* Add Import/Export Buttons here */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex items-center justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setIsProjectModalOpen(true)}
                            disabled={isProjectActionLoading}
                            className="dark:text-gray-300 dark:border-gray-500 dark:hover:bg-gray-700"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Import/Export Project
                        </Button>
                    </div>
                </motion.section>

                {/* Data Diagnosis Dialog */}
                {showDiagnosisResults && dataPreview && validationResults && (
                    <DataDiagnosisDialog
                        results={validationResults}
                        onClose={handleCloseDiagnosis}
                        onProceed={() => {
                            // Try auto-fix first
                            const { preview: fixed, warnings } = autoFixPreview(dataPreview, columnMapping);
                            setFixedPreview(fixed);
                            setAutoFixWarnings(warnings);
                            setShowDiagnosisResults(false);
                            setValidationResults(null);
                            // Proceed with upload using fixed preview
                            uploadData();
                        }}
                    />
                )}

                {/* Main Content Area */}
                <div className={`relative ${!activeProject && !isLoadingProject ? 'opacity-50 pointer-events-none' : ''}`}>
                    {/* Show overlay if project is loaded but null */}
                    {!activeProject && !isLoadingProject && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 dark:bg-gray-900/90 z-10 rounded-lg">
                            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-300 dark:border-gray-600">
                                Please select or create a project to manage data.
                            </p>
                        </div>
                    )}
                    {/* Show loading indicator if project context is loading */}
                    {isLoadingProject && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 dark:bg-gray-900/90 z-10 rounded-lg">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-500 dark:text-gray-400" />
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <motion.section
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6 bg-white dark:bg-gray-800/70 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-700/50"
                    >
                        <div className="flex mb-6 border-b border-gray-200 dark:border-gray-600">
                            <button
                                onClick={() => setActiveMainTab('files')}
                                className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 rounded-t-lg ${activeMainTab === 'files'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-50/30 dark:bg-gray-700/10'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <CloudUploadIcon className="w-4 h-4" />
                                    Excel/CSV
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveMainTab('database')}
                                title="Database Connection - Live HR System Integration"
                                className={`hidden px-4 py-2 text-sm font-medium border-b-2 rounded-t-lg cursor-pointer transition-all ${activeMainTab === 'database'
                                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 bg-gray-50/30 dark:bg-gray-700/10 hover:bg-gray-100 dark:hover:bg-gray-600/30'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Database className="w-4 h-4" />
                                    DB Connection
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveMainTab('mlmodels')}
                                title="ML Models - View Model Performance and Results"
                                className={`px-4 py-2 text-sm font-medium border-b-2 rounded-t-lg cursor-pointer transition-all ${activeMainTab === 'mlmodels'
                                    ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/20'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 bg-gray-50/30 dark:bg-gray-700/10 hover:bg-gray-100 dark:hover:bg-gray-600/30'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <BarChart className="w-4 h-4" />
                                    ML Models
                                </div>
                            </button>
                            <button
                                title="API & System Connections - External Integrations"
                                aria-disabled="true"
                                disabled
                                className={`hidden px-4 py-2 text-sm font-medium border-b-2 rounded-t-lg transition-all border-transparent text-gray-400 dark:text-gray-500 bg-gray-50/30 dark:bg-gray-700/10 cursor-not-allowed`}
                            >
                                <div className="flex items-center gap-2">
                                    <Share2 className="w-4 h-4" />
                                    External/API
                                </div>
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="tab-content">
                            {/* Excel/CSV Tab */}
                            {activeMainTab === 'files' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    {/* File Upload Card */}
                                    <motion.section
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5 }}
                                        className="bg-white dark:bg-gray-800/70 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-700/50"
                                    >
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                                                <CloudUploadIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Upload Dataset</h2>
                                        </div>

                                        <div className="space-y-4 flex-grow">
                                            {renderDataGuideCard()}
                                            {/* Custom File Input Area */}
                                            <label htmlFor="file-upload-input" className="relative block w-full p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors duration-200 bg-gray-50 dark:bg-gray-700/40">
                                                <input
                                                    id="file-upload-input"
                                                    type="file"
                                                    accept={ACCEPTED_FILE_TYPES}
                                                    onChange={handleFileSelect}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                    aria-label="Select dataset file (CSV or Excel)"
                                                />
                                                <CloudUploadIcon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-2" />
                                                <span className="mt-2 block text-sm font-medium text-gray-600 dark:text-gray-400">
                                                    Drag & drop or <span className="text-blue-600 dark:text-blue-400">click to upload</span>
                                                </span>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                                    CSV, XLS, XLSX (Max 50MB)
                                                </p>
                                            </label>

                                            {/* Display Selected File */}
                                            {selectedFile && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center gap-2.5 text-sm border border-blue-200 dark:border-blue-700/50"
                                                >
                                                    <FileText className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                                                    <span className="text-blue-700 dark:text-blue-300 flex-grow truncate">
                                                        {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                                                    </span>
                                                </motion.div>
                                            )}

                                            {/* Column Mapping UI */}
                                            {showMappingUI && dataPreview && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="mt-6 space-y-6 border border-gray-200 dark:border-gray-700/50 rounded-xl p-6 bg-white dark:bg-gray-800/80 shadow-lg"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-2">
                                                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                                                Configure Column Mapping
                                                            </h3>
                                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                Please map the columns from your dataset to the required fields for analysis.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setShowMappingUI(false);
                                                                setDataPreview(null);
                                                                setValidationResults(null);
                                                                setSelectedFile(null);
                                                                setUploadStatus('idle');
                                                                setUploadMessage('');
                                                            }}
                                                            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            title="Cancel and start over"
                                                        >
                                                            <X className="w-5 h-5" />
                                                        </button>
                                                    </div>

                                                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700/60">
                                                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-200 mb-2 flex items-center">
                                                            <Info className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-300" />
                                                            Column Mapping Guide
                                                        </h4>
                                                        <p className="text-xs text-blue-600 dark:text-blue-300 mb-3">
                                                            Map your file columns to the required data fields. Required fields are marked with an asterisk (*).
                                                        </p>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                            {(DATA_MODE === 'performance' ? VISIBLE_MAPPABLE_FIELDS : MAPPABLE_FIELDS_CONFIG).map(field => (
                                                                <div key={field.key} className="flex items-start gap-2">
                                                                    <span className="font-medium text-blue-700 dark:text-blue-200 flex-shrink-0">
                                                                        {field.required && <span className="text-red-500 dark:text-red-400">*</span>}
                                                                        {field.label.split(' ')[0]}:
                                                                    </span>
                                                                    <span className="text-blue-600 dark:text-blue-300 text-xs">
                                                                        {field.key === 'identifier' && 'Unique employee ID or code'}
                                                                        {field.key === 'name' && 'Full employee name'}
                                                                        {field.key === 'department' && 'Department or division'}
                                                                        {field.key === 'position' && 'Job title or role'}
                                                                        {field.key === 'cost' && 'Salary or cost (numeric)'}
                                                                        {field.key === 'status' && 'Employment status'}
                                                                        {field.key === 'tenure' && 'Years/months of service'}
                                                                        {field.key === 'termination_date' && 'Exit date (if applicable)'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                                                            Dataset Preview
                                                        </h4>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            Showing first 5 rows of {dataPreview.totalRows} total rows. Scroll to see more columns if needed.
                                                        </p>
                                                        <div className="border border-gray-200 dark:border-gray-700/50 rounded-lg overflow-hidden shadow-sm bg-gray-50 dark:bg-gray-800/50 max-h-72 overflow-y-auto">
                                                            <div className="overflow-x-auto">
                                                                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                                                                    <thead className="bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10">
                                                                        <tr>
                                                                            {dataPreview.headers.map((header, index) => (
                                                                                <th
                                                                                    key={index}
                                                                                    className="px-4 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                                                                                >
                                                                                    {header}
                                                                                </th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                                                                        {dataPreview.rows.map((row, rowIndex) => (
                                                                            <tr key={rowIndex} className="odd:bg-gray-50 dark:odd:bg-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors duration-150">
                                                                                {row.map((cell, cellIndex) => (
                                                                                    <td
                                                                                        key={cellIndex}
                                                                                        className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 max-w-[200px] truncate"
                                                                                        title={String(cell)}
                                                                                    >
                                                                                        {String(cell)}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700/50">
                                                        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                                                            Map Data Fields
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                                            {(DATA_MODE === 'performance' ? VISIBLE_MAPPABLE_FIELDS : MAPPABLE_FIELDS_CONFIG).map(field => (
                                                                <div key={field.key} className="space-y-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <label htmlFor={`map-${field.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                            {field.label}
                                                                            {field.required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
                                                                        </label>
                                                                        <span title={field.description + (field.notes ? ` (${field.notes})` : '')}>
                                                                            <Info className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help" />
                                                                        </span>
                                                                    </div>
                                                                    <select
                                                                        id={`map-${field.key}`}
                                                                        value={columnMapping[field.key as keyof ColumnMapping] || ''}
                                                                        onChange={(e) => handleColumnMappingChange(field.key as keyof ColumnMapping, e.target.value)}
                                                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200 shadow-sm text-sm"
                                                                        aria-label={`Map column for ${field.label}`}
                                                                    >
                                                                        <option value="">Select column...</option>
                                                                        {dataPreview.headers.map((header, index) => (
                                                                            <option key={index} value={header}>
                                                                                {header}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700/50">
                                                        <button
                                                            type="button"
                                                            onClick={handleUpload}
                                                            disabled={!isColumnMappingComplete() || uploadStatus === 'uploading'}
                                                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-70 dark:disabled:bg-gray-500/80 dark:hover:bg-blue-500 dark:disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                                                        >
                                                            {uploadStatus === 'uploading' ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    Processing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ArrowRight className="w-4 h-4" />
                                                                    Upload & Process Data
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Progress Tracking */}
                                            {uploadStatus === 'uploading' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="mt-6 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4 bg-white dark:bg-gray-800/80 shadow"
                                                >
                                                    <div className="space-y-4">
                                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                            Processing Status
                                                        </h3>

                                                        <div className="relative">
                                                            <div className="absolute left-5 top-0 h-full w-0.5 bg-gray-200 dark:bg-gray-700"></div>

                                                            <div className="relative flex items-center mb-6">
                                                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/40`}>
                                                                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                                                </div>
                                                                <div className="ml-4 flex-grow">
                                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                        Uploading File
                                                                    </h4>
                                                                    <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                                                        <div
                                                                            className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                                                                            style={{ width: `${uploadProgress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="relative flex items-center mb-6">
                                                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${processingStep === 'processing'
                                                                    ? 'bg-blue-100 dark:bg-blue-900/40'
                                                                    : 'bg-gray-100 dark:bg-gray-700/60'
                                                                    }`}>
                                                                    {processingStep === 'processing' ? (
                                                                        <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                                                    ) : (
                                                                        <div className="w-5 h-5 text-gray-400 dark:text-gray-500"></div>
                                                                    )}
                                                                </div>
                                                                <div className="ml-4">
                                                                    <h4 className="text-sm font-medium text-gray-400 dark:text-gray-500">
                                                                        Validating & Processing Data
                                                                    </h4>
                                                                </div>
                                                            </div>

                                                            <div className="relative flex items-center mb-6">
                                                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${processingStep === 'saving'
                                                                    ? 'bg-blue-100 dark:bg-blue-900/40'
                                                                    : 'bg-gray-100 dark:bg-gray-700/60'
                                                                    }`}>
                                                                    {processingStep === 'saving' ? (
                                                                        <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                                                    ) : (
                                                                        <div className="w-5 h-5 text-gray-400 dark:text-gray-500"></div>
                                                                    )}
                                                                </div>
                                                                <div className="ml-4">
                                                                    <h4 className={`text-sm font-medium text-gray-400 dark:text-gray-500`}>
                                                                        Saving to Database
                                                                    </h4>
                                                                </div>
                                                            </div>

                                                            <div className="relative flex items-center">
                                                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${processingStep === 'training'
                                                                    ? 'bg-blue-100 dark:bg-blue-900/40'
                                                                    : processingStep === 'complete'
                                                                        ? 'bg-green-100 dark:bg-green-900/40'
                                                                        : 'bg-gray-100 dark:bg-gray-700/60'
                                                                    }`}>
                                                                    {processingStep === 'training' ? (
                                                                        <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                                                    ) : processingStep === 'complete' ? (
                                                                        <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                                                                    ) : (
                                                                        <div className="w-5 h-5 text-gray-400 dark:text-gray-500"></div>
                                                                    )}
                                                                </div>
                                                                <div className="ml-4 flex-grow">
                                                                    <h4 className={`text-sm font-medium ${(processingStep === 'training' || processingStep === 'complete')
                                                                        ? 'text-gray-900 dark:text-gray-100'
                                                                        : 'text-gray-400 dark:text-gray-500'
                                                                        }`}>
                                                                        Training ML Model
                                                                    </h4>
                                                                    {processingStep === 'training' && trainingStatus?.status !== 'idle' && (
                                                                        <div className="mt-2">
                                                                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-1">
                                                                                <div
                                                                                    className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                                                                                    style={{ width: `${trainingStatus?.progress || 0}%` }}
                                                                                ></div>
                                                                            </div>
                                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                                {trainingStatus?.message || 'Starting training...'}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}

                                            <StatusMessage
                                                status={uploadStatus}
                                                message={uploadMessage}
                                                type="upload"
                                            />
                                        </div>
                                    </motion.section>

                                    {/* Interview & Survey Data Upload Card */}
                                    <motion.section
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: 0.05 }}
                                        className="hidden bg-white dark:bg-gray-800/70 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-700/50"
                                    >
                                        <div className="mb-5">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                                    <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <div className="flex-1">
                                                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Support Data</h2>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Upload interview and engagement survey data to enrich insights.</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                                                <Button
                                                    onClick={() => {
                                                        setShowInterviewUpload(true);
                                                    }}
                                                    className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2.5 border border-emerald-600 dark:border-emerald-700"
                                                >
                                                    <Upload className="w-4 h-4 mr-2" />
                                                    Stay Interview
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        setShowInterviewUpload(true);
                                                    }}
                                                    className="w-full justify-center bg-rose-600 hover:bg-rose-700 text-white text-sm py-2.5 border border-rose-600 dark:border-rose-700"
                                                >
                                                    <Upload className="w-4 h-4 mr-2" />
                                                    Exit Interview
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        setShowEngagementUpload(true);
                                                    }}
                                                    className="w-full justify-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2.5 border border-indigo-600 dark:border-indigo-700"
                                                >
                                                    <Upload className="w-4 h-4 mr-2" />
                                                    Engagement Survey
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                                <h3 className="font-medium text-green-900 dark:text-green-100 mb-1">Stay Interviews</h3>
                                                <p className="text-green-700 dark:text-green-300">Retention feedback from current employees</p>
                                            </div>
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                                <h3 className="font-medium text-red-900 dark:text-red-100 mb-1">Exit Interviews</h3>
                                                <p className="text-red-700 dark:text-red-300">Departure feedback from leaving employees</p>
                                            </div>
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Engagement Surveys</h3>
                                                <p className="text-blue-700 dark:text-blue-300">Employee satisfaction and engagement metrics</p>
                                            </div>
                                            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                                <h3 className="font-medium text-purple-900 dark:text-purple-100 mb-1">AI Analysis</h3>
                                                <p className="text-purple-700 dark:text-purple-300">Automated sentiment and theme extraction</p>
                                            </div>
                                        </div>

                                        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
                                            <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Info className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Interview Columns</span>
                                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">CSV/XLSX</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-xs">
                                                    {['hrcode', 'date', 'notes'].map((c) => (
                                                        <span key={c} className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">{c}</span>
                                                    ))}
                                                    <span className="px-2 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200">Optional</span>
                                                    <span className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">interview_type (stay/exit)</span>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-blue-50 dark:bg-blue-700/30 rounded-lg border border-blue-200 dark:border-blue-700/60">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                                                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Engagement Columns</span>
                                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">CSV/XLSX</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-xs">
                                                    {['employee_id', 'survey_date', 'overall_satisfaction'].map((c) => (
                                                        <span key={c} className="px-2 py-0.5 rounded bg-white/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100">{c}</span>
                                                    ))}
                                                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300">Optional</span>
                                                    {['work_life_balance', 'career_development', 'management_rating'].map((c) => (
                                                        <span key={c} className="px-2 py-0.5 rounded bg-white/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100">{c}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.section>

                                    {/* Datasets Management Card */}
                                    <motion.section
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: 0.1 }}
                                        className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-slate-700 flex-1 overflow-hidden flex flex-col"
                                    >
                                        <div className="flex items-center justify-between mb-5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                                                    <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                                                </div>
                                                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Datasets</h2>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => navigateToHomeWithRefresh()}
                                                    className="p-2 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded-md transition-colors"
                                                    title="Refresh data on Home page"
                                                >
                                                    <ArrowRight className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={fetchDatasets}
                                                    className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                                                    title="Refresh dataset list"
                                                >
                                                    <RefreshCw className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                                            {isLoading ? (
                                                <div className="flex items-center justify-center h-32">
                                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
                                                </div>
                                            ) : datasets.length === 0 ? (
                                                <div className="text-center py-8 text-gray-500 dark:text-gray-400 space-y-3">
                                                    <p>
                                                        No datasets yet. Upload a file from the Excel/CSV tab above or import data from a connection.
                                                    </p>
                                                    <div className="flex justify-center">
                                                        <Button size="sm" variant="outline" onClick={() => setActiveMainTab('files')}>
                                                            Go to Excel/CSV upload
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                datasets.map(dataset => {
                                                    const pairedDataset = dataset.snapshotPairDatasetId
                                                        ? datasetLookup.get(dataset.snapshotPairDatasetId)
                                                        : undefined;
                                                    return (
                                                        <div
                                                            key={dataset.id}
                                                            className={`p-4 rounded-lg border transition-all duration-200 shadow-sm ${dataset.active
                                                                ? 'bg-green-50 dark:bg-emerald-950/50 border-green-400 dark:border-emerald-700'
                                                                : selectedDataset === dataset.id
                                                                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-700'
                                                                    : 'bg-white dark:bg-slate-800/80 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
                                                                }`}
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <h3 className={`text-sm font-medium ${dataset.active ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}`}>
                                                                            {dataset.name}
                                                                        </h3>
                                                                        {dataset.active && (
                                                                            <span className="bg-green-100 text-green-700 dark:bg-green-600/30 dark:text-green-300 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-green-300 dark:border-green-500">
                                                                                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                                                Active Dataset
                                                                            </span>
                                                                        )}
                                                                        {dataset.isSnapshot && (
                                                                            <span className="bg-blue-100 text-blue-700 dark:bg-blue-600/30 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-blue-300 dark:border-blue-500">
                                                                                <Clock className="h-3 w-3" />
                                                                                Snapshot Dataset
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className={`text-xs ${dataset.active ? 'text-green-700 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                        <span className="inline-block">
                                                                            {dataset.type} • {formatBytes(dataset.size)}
                                                                        </span>
                                                                        <span className="block mt-1">
                                                                            Uploaded {formatDate(dataset.uploadedAt)}
                                                                        </span>
                                                                        {dataset.rowCount !== undefined && dataset.rowCount !== null && (
                                                                            <span className="ml-1">
                                                                                &bull; {dataset.rowCount.toLocaleString()} rows
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {dataset.active && (
                                                                        <div className="mt-2 text-xs text-green-700 dark:text-green-300">
                                                                            <p>This dataset is currently being used for predictions and analytics.</p>
                                                                        </div>
                                                                    )}
                                                                    {dataset.isSnapshot && (
                                                                        <div className="mt-2 space-y-1 text-xs text-blue-700 dark:text-blue-300">
                                                                            {dataset.snapshotGroup && (
                                                                                <p className="flex items-center gap-1">
                                                                                    <Clock className="h-3 w-3" />
                                                                                    Snapshot group: <span className="font-medium">{dataset.snapshotGroup}</span>
                                                                                </p>
                                                                            )}
                                                                            {pairedDataset && (
                                                                                <p className="flex items-center gap-1">
                                                                                    <GitCompare className="h-3 w-3" />
                                                                                    Paired with{' '}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setSelectedDataset(pairedDataset.id)}
                                                                                        className="text-blue-600 dark:text-blue-300 underline-offset-2 hover:underline focus:outline-none"
                                                                                    >
                                                                                        {pairedDataset.name}
                                                                                    </button>
                                                                                    for delta comparisons.
                                                                                </p>
                                                                            )}
                                                                            {!pairedDataset && dataset.snapshotPairDatasetId && (
                                                                                <p className="text-blue-600/80 dark:text-blue-200/80">
                                                                                    Snapshot pair detected but companion dataset is not currently available.
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                    {!dataset.active && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => setActiveDataset(dataset.id)}
                                                                                className="p-1.5 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-300 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-green-500 dark:focus:ring-green-400"
                                                                                title="Set as active dataset"
                                                                            >
                                                                                <Check className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteDataset(dataset.id)}
                                                                                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-300 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-red-500 dark:focus:ring-red-400"
                                                                                title="Delete dataset"
                                                                            >
                                                                                <Trash2 className="w-4 h-4" />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    <button
                                                                        onClick={() => setSelectedDataset(dataset.id === selectedDataset ? null : dataset.id)}
                                                                        className={`p-1.5 rounded-md transition-colors ${selectedDataset === dataset.id
                                                                            ? 'text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-700/50'
                                                                            : 'text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400'
                                                                            }`}
                                                                        title={selectedDataset === dataset.id ? "Hide details" : "Show details"}
                                                                    >
                                                                        <FileText className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </motion.section>
                                </motion.div>
                            )}

                            {/* Database Tab */}
                            {activeMainTab === 'database' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="hidden space-y-6"
                                >
                                    {/* Database Connection Form */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                                <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Database Connection</h3>
                                        </div>

                                        <div>
                                            <label htmlFor="dbType" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                                Database Type
                                            </label>
                                            <select
                                                id="dbType"
                                                name="dbType"
                                                value={dbType}
                                                onChange={handleDbTypeChange}
                                                className="w-full pl-3 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all duration-200 shadow-sm text-sm"
                                            >
                                                {SUPPORTED_DB_TYPES.map(type => (
                                                    <option key={type} value={type}>{type}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <InputField
                                                id="dbHost"
                                                label="Host Address"
                                                name="host"
                                                value={dbConfig.host}
                                                onChange={handleDbConfigChange}
                                                placeholder="e.g., db.example.com"
                                            />
                                            <InputField
                                                id="dbPort"
                                                label="Port"
                                                type="number"
                                                name="port"
                                                value={dbConfig.port}
                                                onChange={handleDbConfigChange}
                                                placeholder={getPortPlaceholder()}
                                                min="1" max="65535"
                                            />
                                        </div>

                                        <InputField
                                            id="dbUsername"
                                            label="Username"
                                            name="username"
                                            value={dbConfig.username}
                                            onChange={handleDbConfigChange}
                                            placeholder="e.g., admin_user"
                                        />

                                        <InputField
                                            id="dbPassword"
                                            label="Password"
                                            type="password"
                                            name="password"
                                            value={dbConfig.password}
                                            onChange={handleDbConfigChange}
                                            placeholder="••••••••"
                                        />

                                        <InputField
                                            id="dbName"
                                            label={getDbNameLabel()}
                                            name="databaseName"
                                            value={dbConfig.databaseName}
                                            onChange={handleDbConfigChange}
                                            placeholder={getDbNamePlaceholder()}
                                        />

                                        <div className="mt-6">
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={handleTestConnection}
                                                disabled={connectionStatus === 'testing'}
                                                className={`w-full px-5 py-3 rounded-lg text-white text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800
                                                        ${connectionStatus === 'testing'
                                                        ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                                                        : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:ring-indigo-500 dark:focus:ring-indigo-400'}`}
                                            >
                                                {connectionStatus === 'testing' ? (
                                                    <>
                                                        <Loader2 className="animate-spin h-4 w-4" />
                                                        Testing...
                                                    </>
                                                ) : (
                                                    <>
                                                        {connectionStatus === 'success' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                                                        Test Connection
                                                    </>
                                                )}
                                            </motion.button>

                                            <StatusMessage status={connectionStatus} message={connectionMessage} type="connection" />

                                            {connectionStatus === 'success' && (
                                                <motion.div
                                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                                                    className="mt-4 text-center"
                                                >
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                        Connection verified. You can now save this connection for later use.
                                                    </p>
                                                    <Button
                                                        onClick={handleSaveConnection}
                                                        disabled={!dbConfig.host || !dbConfig.port || !dbConfig.username || !dbConfig.password || !dbConfig.databaseName || connectionStatus !== 'success'}
                                                        className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white dark:disabled:bg-green-700/70"
                                                    >
                                                        <FolderPlus className="w-4 h-4 mr-2" />
                                                        Save Connection
                                                    </Button>
                                                </motion.div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Database Import Section */}
                                    {connections.length > 0 && (
                                        <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                                                    <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Database Import</h3>
                                            </div>

                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                                Import data directly from your connected databases into ChurnVision.
                                            </p>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                                                        Select Connection
                                                    </label>
                                                    <select
                                                        value={selectedConnection || ''}
                                                        onChange={(e) => {
                                                            setSelectedConnection(e.target.value);
                                                            if (e.target.value) {
                                                                handleListTables(e.target.value);
                                                            }
                                                        }}
                                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="">Select a connection...</option>
                                                        {connections.map(conn => (
                                                            <option key={conn.id} value={conn.id}>
                                                                {conn.name} ({conn.type})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {selectedConnection && (
                                                    <>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                                                                Select Table
                                                            </label>
                                                            <select
                                                                value={selectedTable}
                                                                onChange={(e) => setSelectedTable(e.target.value)}
                                                                disabled={isListingTables}
                                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                                                            >
                                                                <option value="">
                                                                    {isListingTables ? 'Loading tables...' : 'Select a table...'}
                                                                </option>
                                                                {availableTables.map(table => (
                                                                    <option key={table} value={table}>
                                                                        {table}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {selectedTable && (
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                                                                    Dataset Name
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={importDatasetName}
                                                                    onChange={(e) => setImportDatasetName(e.target.value)}
                                                                    placeholder={`Import_${selectedTable}_${new Date().toISOString().split('T')[0]}`}
                                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                                                />
                                                            </div>
                                                        )}

                                                        <Button
                                                            onClick={handleImportData}
                                                            disabled={!selectedConnection || !selectedTable || !importDatasetName || isListingTables}
                                                            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                                                        >
                                                            {isListingTables ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                                    Importing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Download className="w-4 h-4 mr-2" />
                                                                    Import Data
                                                                </>
                                                            )}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ML Models Tab */}
                            {activeMainTab === 'mlmodels' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                                            <BarChart className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">ML Model Performance</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">View latest model evaluation metrics and performance results</p>
                                        </div>
                                        <div className="ml-auto">
                                            <button
                                                onClick={fetchModelMetrics}
                                                disabled={isMetricsLoading}
                                                className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md transition-colors flex items-center gap-2"
                                            >
                                                <RefreshCw className={`w-4 h-4 ${isMetricsLoading ? 'animate-spin' : ''}`} />
                                                Refresh
                                            </button>
                                        </div>
                                    </div>

                                    {isMetricsLoading && (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-green-600" />
                                            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading model metrics...</span>
                                        </div>
                                    )}

                                    {metricsError && (
                                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                                                <AlertCircle className="w-4 h-4" />
                                                <span className="text-sm font-medium">Error loading metrics</span>
                                            </div>
                                            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{metricsError}</p>
                                        </div>
                                    )}

                                    {!isMetricsLoading && !metricsError && (
                                        <div className="space-y-4">
                                            {modelMetrics.length === 0 ? (
                                                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                                                    <BarChart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <h4 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No Model Results Yet</h4>
                                                    <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Train a model to see performance metrics and evaluation results here.</p>
                                                    <button
                                                        onClick={() => navigate('/model-training')}
                                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center gap-2 mx-auto"
                                                    >
                                                        <ArrowRight className="w-4 h-4" />
                                                        Go to Model Training
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="grid gap-4 md:grid-cols-[minmax(280px,320px)_1fr]">
                                                        <ModelPerformanceGauge
                                                            accuracy={modelMetrics[0].accuracy}
                                                            precision={modelMetrics[0].precision_score}
                                                            recall={modelMetrics[0].recall_score}
                                                            f1={modelMetrics[0].f1_score}
                                                            rocAuc={modelMetrics[0].roc_auc}
                                                        />
                                                        <div className="space-y-4">
                                                            {modelMetrics.map((metric: any) => (
                                                                <div key={metric.id} className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
                                                                    <div className="flex items-center justify-between mb-4">
                                                                        <div>
                                                                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                                                Model v{metric.model_version}
                                                                            </h4>
                                                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                                                Evaluated on {new Date(metric.evaluation_date).toLocaleDateString()}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                                                                            <div>Total Predictions: {metric.total_predictions}</div>
                                                                            <div>Correct: {metric.correct_predictions}</div>
                                                                            <div className="text-red-600 dark:text-red-400">FP: {metric.false_positives} | FN: {metric.false_negatives}</div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                                                                        <MetricPill label="Accuracy" value={metric.accuracy} />
                                                                        <MetricPill label="Precision" value={metric.precision_score} />
                                                                        <MetricPill label="Recall" value={metric.recall_score} />
                                                                        <MetricPill label="F1 Score" value={metric.f1_score} />
                                                                        <MetricPill label="ROC AUC" value={metric.roc_auc} />
                                                                        {metric.calibration_score != null && (
                                                                            <MetricPill label="Calibration" value={metric.calibration_score} />
                                                                        )}
                                                                        {metric.drift_score != null && (
                                                                            <MetricPill label="Drift Score" value={metric.drift_score} />
                                                                        )}
                                                                    </div>

                                                                    {metric.recommendations && (
                                                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                                                                            <div className="flex items-start gap-2">
                                                                                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                                                                <div>
                                                                                    <h5 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">Recommendations</h5>
                                                                                    <p className="text-xs text-blue-700 dark:text-blue-400">{metric.recommendations}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* API Tab */}
                            {activeMainTab === 'api' && (
                                <div className="hidden">
                                    <ComingSoonOverlay title="API & System Connections">
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="space-y-6"
                                        >
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="p-2 bg-teal-100 dark:bg-teal-900/40 rounded-lg">
                                                    <Share2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">API & System Connections</h3>
                                            </div>

                                            <div className="space-y-4">
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Connect directly to external HR systems (e.g., SAP SuccessFactors, BambooHR) for automated data synchronization.
                                                </p>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                                                                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                            </div>
                                                            <h4 className="font-medium text-gray-800 dark:text-gray-100">SAP SuccessFactors</h4>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                            Direct integration with SAP HR system for real-time data sync.
                                                        </p>
                                                        <Button variant="outline" disabled className="w-full">
                                                            <Clock className="w-4 h-4 mr-2" />
                                                            Coming Soon
                                                        </Button>
                                                    </div>

                                                    <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                                                                <Share2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                            </div>
                                                            <h4 className="font-medium text-gray-800 dark:text-gray-100">BambooHR</h4>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                            Connect to BambooHR for automated employee data import.
                                                        </p>
                                                        <Button variant="outline" disabled className="w-full">
                                                            <Clock className="w-4 h-4 mr-2" />
                                                            Coming Soon
                                                        </Button>
                                                    </div>

                                                    <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                                                <Wifi className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                                            </div>
                                                            <h4 className="font-medium text-gray-800 dark:text-gray-100">Workday</h4>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                            Integration with Workday HCM for comprehensive HR data.
                                                        </p>
                                                        <Button variant="outline" disabled className="w-full">
                                                            <Clock className="w-4 h-4 mr-2" />
                                                            Coming Soon
                                                        </Button>
                                                    </div>

                                                    <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
                                                                <Share2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                                            </div>
                                                            <h4 className="font-medium text-gray-800 dark:text-gray-100">Custom API</h4>
                                                        </div>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                            Connect to your custom HR API endpoints.
                                                        </p>
                                                        <Button variant="outline" disabled className="w-full">
                                                            <Clock className="w-4 h-4 mr-2" />
                                                            Coming Soon
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/60">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                        <h4 className="font-medium text-blue-800 dark:text-blue-200">API Integration Benefits</h4>
                                                    </div>
                                                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                                                        <li>• Real-time data synchronization</li>
                                                        <li>• Automated data updates</li>
                                                        <li>• Reduced manual data entry</li>
                                                        <li>• Enhanced data accuracy</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </ComingSoonOverlay>
                                </div>
                            )}
                        </div>
                    </motion.section>




                </div>
            </div>

            {/* Project Import/Export Modal */}
            {isProjectModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/50 p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        style={{ willChange: 'opacity' }}
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Import or Export Project
                            </h2>
                            <button
                                onClick={() => setIsProjectModalOpen(false)}
                                disabled={isProjectActionLoading}
                                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-full"
                                aria-label="Close modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Export the currently active project data to a file, or import a previously exported project from a file.
                        </p>

                        <div className="space-y-4">
                            <Button
                                onClick={handleExportProject}
                                disabled={!activeProject || isProjectActionLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white dark:disabled:bg-blue-700/70"
                            >
                                {isProjectActionLoading && activeProject ? ( // Check if this is the action loading
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4 mr-2" />
                                )}
                                Export Active Project
                            </Button>

                            <Button
                                onClick={handleImportProject}
                                disabled={isProjectActionLoading}
                                variant="outline"
                                className="w-full dark:text-gray-300 dark:border-gray-500 dark:hover:bg-gray-700"
                            >
                                {isProjectActionLoading && !activeProject ? ( // Heuristic to check if import is loading
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                )}
                                Import Project from File
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-6 text-center">
                            Importing will add the project to your list. Exporting creates a sharable <code>.zip</code> file.
                        </p>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* Interview Upload Window */}
            <InterviewUploadWindow
                show={showInterviewUpload}
                onClose={() => setShowInterviewUpload(false)}
                onUploadSuccess={() => {
                    setShowInterviewUpload(false);
                    // You can add success notification here if needed
                }}
            />

            {/* Engagement Upload Window */}
            <EngagementUploadWindow
                show={showEngagementUpload}
                onClose={() => setShowEngagementUpload(false)}
                onUploadSuccess={() => {
                    setShowEngagementUpload(false);
                    // You can add success notification here if needed
                }}
            />
        </div>
    );
}

export default DataManagement;
