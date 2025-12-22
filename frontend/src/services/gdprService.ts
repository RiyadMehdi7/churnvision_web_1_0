/**
 * GDPR Service
 *
 * Frontend service for GDPR compliance operations.
 * Handles data subject requests, consent management, erasure, and breach reporting.
 */

import api from './apiService';

// ============================================================================
// Types
// ============================================================================

export type RequestType = 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';
export type ConsentType = 'hr_data_processing' | 'analytics' | 'ai_processing' | 'data_sharing' | 'marketing';
export type LawfulBasis = 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type BreachStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';

export interface GDPRComplianceStatus {
  overall_status: 'compliant' | 'needs_attention' | 'critical';
  pending_requests: number;
  overdue_requests: number;
  open_breaches: number;
  consent_coverage: number;
  last_audit_date?: string;
  recommendations: string[];
}

export interface DataCategory {
  name: string;
  description: string;
  tables: string[];
  contains_pii: boolean;
}

export interface DataSubjectRequest {
  id: number;
  request_id: string;
  data_subject_id: string;
  data_subject_name?: string;
  data_subject_email?: string;
  request_type: RequestType;
  request_status: RequestStatus;
  description?: string;
  scope?: string[];
  identity_verified: boolean;
  verification_method?: string;
  verified_at?: string;
  assigned_to?: string;
  due_date?: string;
  completed_at?: string;
  response_summary?: string;
  response_file_path?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface DataExportResponse {
  hr_code: string;
  export_date: string;
  format: string;
  categories_included: string[];
  data: Record<string, unknown>;
  record_counts: Record<string, number>;
}

export interface DataErasureResponse {
  hr_code: string;
  request_id?: string;
  erasure_date: string;
  dry_run: boolean;
  results: Record<string, { deleted: number; anonymized: number }>;
  total_records_deleted: number;
  excluded_categories: string[];
  verification_hash?: string;
}

export interface ConsentRecord {
  id: number;
  data_subject_id: string;
  data_subject_name?: string;
  consent_type: ConsentType;
  consent_status: 'granted' | 'withdrawn' | 'expired';
  purpose: string;
  lawful_basis: LawfulBasis;
  granted_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
  recorded_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface ConsentSummary {
  data_subject_id: string;
  data_subject_name?: string;
  consents: ConsentRecord[];
  all_required_granted: boolean;
  last_updated?: string;
}

export interface ProcessingRecord {
  id: number;
  activity_name: string;
  activity_description?: string;
  controller_name: string;
  controller_contact?: string;
  dpo_contact?: string;
  purpose: string;
  lawful_basis: LawfulBasis;
  data_categories: string[];
  special_categories?: boolean;
  data_subject_categories?: string;
  recipients?: string[];
  third_country_transfers?: boolean;
  transfer_safeguards?: string;
  retention_period?: string;
  retention_criteria?: string;
  security_measures?: string;
  is_active: boolean;
  last_reviewed?: string;
  next_review_date?: string;
  created_at: string;
  updated_at?: string;
}

export interface DataBreach {
  id: number;
  breach_id: string;
  title: string;
  description?: string;
  detected_at: string;
  occurred_at?: string;
  data_categories_affected?: string[];
  data_subjects_affected_count?: number;
  risk_level: RiskLevel;
  cause?: string;
  root_cause_analysis?: string;
  containment_actions?: string;
  remediation_actions?: string;
  authority_notified: boolean;
  authority_notification_date?: string;
  authority_reference?: string;
  subjects_notified: boolean;
  subjects_notification_date?: string;
  notification_method?: string;
  status: BreachStatus;
  resolved_at?: string;
  reported_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface ErasureLog {
  id: number;
  request_id?: string;
  data_subject_id: string;
  data_category: string;
  table_name: string;
  records_deleted: number;
  erasure_type: string;
  performed_by?: string;
  performed_at?: string;
  verification_hash?: string;
  notes?: string;
}

// ============================================================================
// Compliance Dashboard
// ============================================================================

export async function getComplianceStatus(): Promise<GDPRComplianceStatus> {
  const response = await api.get<GDPRComplianceStatus>('/gdpr/status');
  return response.data;
}

export async function getDataCategories(): Promise<{ categories: DataCategory[] }> {
  const response = await api.get<{ categories: DataCategory[] }>('/gdpr/categories');
  return response.data;
}

// ============================================================================
// Data Export Operations
// ============================================================================

export async function exportData(
  hrCode: string,
  options?: { format?: 'json' | 'csv'; include_categories?: string[] }
): Promise<DataExportResponse> {
  const response = await api.post<DataExportResponse>('/gdpr/export', {
    hr_code: hrCode,
    format: options?.format || 'json',
    include_categories: options?.include_categories,
  });
  return response.data;
}

export async function exportEmployeeData(
  hrCode: string,
  params?: { format?: string; categories?: string }
): Promise<DataExportResponse> {
  const response = await api.get<DataExportResponse>(`/gdpr/export/${hrCode}`, { params });
  return response.data;
}

// ============================================================================
// Data Erasure Operations
// ============================================================================

export async function eraseData(
  hrCode: string,
  options?: { exclude_categories?: string[]; dry_run?: boolean; reason?: string }
): Promise<DataErasureResponse> {
  const response = await api.post<DataErasureResponse>('/gdpr/erase', {
    hr_code: hrCode,
    exclude_categories: options?.exclude_categories,
    dry_run: options?.dry_run ?? true,
    reason: options?.reason,
  });
  return response.data;
}

export async function deleteEmployeeData(
  hrCode: string,
  params?: { reason?: string; dry_run?: boolean }
): Promise<DataErasureResponse> {
  const response = await api.delete<DataErasureResponse>(`/gdpr/employees/${hrCode}`, { params });
  return response.data;
}

// ============================================================================
// Data Subject Requests (DSARs)
// ============================================================================

export async function listRequests(params?: {
  status?: RequestStatus;
  limit?: number;
  offset?: number;
}): Promise<DataSubjectRequest[]> {
  const response = await api.get<DataSubjectRequest[]>('/gdpr/requests', { params });
  return response.data;
}

export async function createRequest(request: {
  data_subject_id: string;
  request_type: RequestType;
  data_subject_name?: string;
  data_subject_email?: string;
  description?: string;
  scope?: string[];
}): Promise<DataSubjectRequest> {
  const response = await api.post<DataSubjectRequest>('/gdpr/requests', request);
  return response.data;
}

export async function getRequest(requestId: string): Promise<DataSubjectRequest> {
  const response = await api.get<DataSubjectRequest>(`/gdpr/requests/${requestId}`);
  return response.data;
}

export async function updateRequest(
  requestId: string,
  updates: {
    request_status?: RequestStatus;
    identity_verified?: boolean;
    verification_method?: string;
    assigned_to?: string;
    response_summary?: string;
    rejection_reason?: string;
  }
): Promise<DataSubjectRequest> {
  const response = await api.patch<DataSubjectRequest>(`/gdpr/requests/${requestId}`, updates);
  return response.data;
}

export async function processRequest(requestId: string): Promise<{ status: string; result?: unknown }> {
  const response = await api.post<{ status: string; result?: unknown }>(`/gdpr/requests/${requestId}/process`);
  return response.data;
}

// ============================================================================
// Consent Management
// ============================================================================

export async function getConsentStatus(dataSubjectId: string): Promise<ConsentSummary> {
  const response = await api.get<ConsentSummary>(`/gdpr/consent/${dataSubjectId}`);
  return response.data;
}

export async function recordConsent(consent: {
  data_subject_id: string;
  consent_type: ConsentType;
  purpose: string;
  lawful_basis: LawfulBasis;
  data_subject_name?: string;
  expires_at?: string;
  notes?: string;
}): Promise<ConsentRecord> {
  const response = await api.post<ConsentRecord>('/gdpr/consent', consent);
  return response.data;
}

export async function withdrawConsent(
  dataSubjectId: string,
  consentType: ConsentType,
  notes?: string
): Promise<{ message: string; consent_type: string }> {
  const response = await api.post<{ message: string; consent_type: string }>(
    `/gdpr/consent/${dataSubjectId}/withdraw`,
    null,
    { params: { consent_type: consentType, notes } }
  );
  return response.data;
}

// ============================================================================
// Records of Processing Activities (ROPA)
// ============================================================================

export async function listProcessingRecords(activeOnly = true): Promise<ProcessingRecord[]> {
  const response = await api.get<ProcessingRecord[]>('/gdpr/ropa', { params: { active_only: activeOnly } });
  return response.data;
}

export async function createProcessingRecord(record: {
  activity_name: string;
  controller_name: string;
  purpose: string;
  lawful_basis: LawfulBasis;
  data_categories: string[];
  activity_description?: string;
}): Promise<ProcessingRecord> {
  const response = await api.post<ProcessingRecord>('/gdpr/ropa', record);
  return response.data;
}

export async function exportROPA(): Promise<{
  export_date: string;
  total_activities: number;
  processing_activities: ProcessingRecord[];
}> {
  const response = await api.get<{
    export_date: string;
    total_activities: number;
    processing_activities: ProcessingRecord[];
  }>('/gdpr/ropa/export');
  return response.data;
}

// ============================================================================
// Data Breach Management
// ============================================================================

export async function listBreaches(params?: { status?: BreachStatus; limit?: number }): Promise<DataBreach[]> {
  const response = await api.get<DataBreach[]>('/gdpr/breaches', { params });
  return response.data;
}

export async function reportBreach(breach: {
  title: string;
  description?: string;
  detected_at: string;
  occurred_at?: string;
  data_categories_affected?: string[];
  data_subjects_affected_count?: number;
  risk_level: RiskLevel;
  cause?: string;
  containment_actions?: string;
}): Promise<DataBreach> {
  const response = await api.post<DataBreach>('/gdpr/breaches', breach);
  return response.data;
}

export async function updateBreach(
  breachId: string,
  updates: Partial<{
    description: string;
    root_cause_analysis: string;
    remediation_actions: string;
    authority_notified: boolean;
    authority_notification_date: string;
    subjects_notified: boolean;
    status: BreachStatus;
    resolved_at: string;
  }>
): Promise<DataBreach> {
  const response = await api.patch<DataBreach>(`/gdpr/breaches/${breachId}`, updates);
  return response.data;
}

// ============================================================================
// Erasure Audit Log
// ============================================================================

export async function getErasureLogs(params?: { data_subject_id?: string; limit?: number }): Promise<ErasureLog[]> {
  const response = await api.get<ErasureLog[]>('/gdpr/erasure-logs', { params });
  return response.data;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getRequestTypeLabel(type: RequestType): string {
  const labels: Record<RequestType, string> = {
    access: 'Access Request',
    rectification: 'Rectification',
    erasure: 'Erasure (Right to be Forgotten)',
    portability: 'Data Portability',
    restriction: 'Restriction of Processing',
    objection: 'Objection to Processing',
  };
  return labels[type] || type;
}

export function getRequestStatusLabel(status: RequestStatus): string {
  const labels: Record<RequestStatus, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    rejected: 'Rejected',
  };
  return labels[status] || status;
}

export function getRequestStatusColor(status: RequestStatus): string {
  const colors: Record<RequestStatus, string> = {
    pending: 'text-yellow-600 bg-yellow-100',
    in_progress: 'text-blue-600 bg-blue-100',
    completed: 'text-green-600 bg-green-100',
    rejected: 'text-red-600 bg-red-100',
  };
  return colors[status] || 'text-gray-600 bg-gray-100';
}

export function getRiskLevelColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    low: 'text-green-600 bg-green-100',
    medium: 'text-yellow-600 bg-yellow-100',
    high: 'text-orange-600 bg-orange-100',
    critical: 'text-red-600 bg-red-100',
  };
  return colors[level] || 'text-gray-600 bg-gray-100';
}

export function getBreachStatusLabel(status: BreachStatus): string {
  const labels: Record<BreachStatus, string> = {
    open: 'Open',
    investigating: 'Investigating',
    contained: 'Contained',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return labels[status] || status;
}

export function getLawfulBasisLabel(basis: LawfulBasis): string {
  const labels: Record<LawfulBasis, string> = {
    consent: 'Consent',
    contract: 'Contract',
    legal_obligation: 'Legal Obligation',
    vital_interests: 'Vital Interests',
    public_task: 'Public Task',
    legitimate_interests: 'Legitimate Interests',
  };
  return labels[basis] || basis;
}

const gdprService = {
  getComplianceStatus,
  getDataCategories,
  exportData,
  exportEmployeeData,
  eraseData,
  deleteEmployeeData,
  listRequests,
  createRequest,
  getRequest,
  updateRequest,
  processRequest,
  getConsentStatus,
  recordConsent,
  withdrawConsent,
  listProcessingRecords,
  createProcessingRecord,
  exportROPA,
  listBreaches,
  reportBreach,
  updateBreach,
  getErasureLogs,
  getRequestTypeLabel,
  getRequestStatusLabel,
  getRequestStatusColor,
  getRiskLevelColor,
  getBreachStatusLabel,
  getLawfulBasisLabel,
};

export default gdprService;
