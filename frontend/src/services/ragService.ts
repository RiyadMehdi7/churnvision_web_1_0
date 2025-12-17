/**
 * RAG Service
 *
 * Frontend service for the Retrieval-Augmented Generation subsystem.
 * Handles document management, custom rules, and knowledge base queries.
 */

import api from './apiService';

// ============================================================================
// Types
// ============================================================================

export type DocumentType = 'policy' | 'benefit' | 'rule' | 'general';
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';
export type RuleCategory = 'benefit' | 'restriction' | 'policy' | 'process' | 'eligibility';
export type KnowledgeBaseMode = 'automatic' | 'custom' | 'hybrid';

export interface RAGDocument {
  id: number;
  title: string;
  source_path?: string;
  mime_type?: string;
  size_bytes?: number;
  status: DocumentStatus;
  error_message?: string;
  document_type: DocumentType;
  tags?: string;
  chunk_count: number;
  created_at: string;
  updated_at?: string;
  project_id?: string;
  user_id?: number;
}

export interface CustomHRRule {
  id: number;
  name: string;
  category?: RuleCategory;
  rule_text: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  project_id?: string;
}

export interface KnowledgeBaseSettings {
  id: number;
  // Company context (for AI personalization)
  company_name?: string;
  industry?: string;
  company_size?: string;
  company_description?: string;
  // RAG configuration
  mode: KnowledgeBaseMode;
  chunk_size: number;
  chunk_overlap: number;
  retrieval_top_k: number;
  similarity_threshold: number;
  use_general_hr_knowledge: boolean;
  strict_policy_mode: boolean;
  project_id?: string;
  user_id?: number;
  created_at: string;
  updated_at?: string;
}

export interface RAGChunkResult {
  content: string;
  source: string;
  document_id?: number;
  document_type: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface RAGQueryResponse {
  documents: RAGChunkResult[];
  custom_rules: CustomHRRule[];
  sources: Array<{ name: string; document_id?: number; document_type?: string }>;
  query: string;
  total_chunks: number;
  total_rules: number;
}

export interface TreatmentValidationResult {
  is_valid: boolean;
  treatment_name: string;
  violations: Array<{ rule?: string; source?: string; reason: string }>;
  adaptations: Array<{ field?: string; original?: unknown; adapted?: unknown; note?: string; reason?: string }>;
  reasoning: string;
  adapted_treatment?: Record<string, unknown>;
}

export interface RAGStats {
  total_documents: number;
  ready_documents: number;
  total_chunks: number;
  total_rules: number;
  active_rules: number;
  collection_stats: Record<string, unknown>;
}

// ============================================================================
// Document Operations
// ============================================================================

/**
 * Upload a document to the knowledge base.
 */
export async function uploadDocument(
  file: File,
  options: {
    title?: string;
    document_type?: DocumentType;
    tags?: string;
    project_id?: string;
  } = {}
): Promise<RAGDocument> {
  const formData = new FormData();
  formData.append('file', file);

  if (options.title) formData.append('title', options.title);
  if (options.document_type) formData.append('document_type', options.document_type);
  if (options.tags) formData.append('tags', options.tags);
  if (options.project_id) formData.append('project_id', options.project_id);

  const response = await api.post<RAGDocument>('/rag/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

/**
 * List all documents in the knowledge base.
 */
export async function listDocuments(params?: {
  document_type?: DocumentType;
  status?: DocumentStatus;
  project_id?: string;
}): Promise<RAGDocument[]> {
  const response = await api.get<RAGDocument[]>('/rag/documents', { params });
  return response.data;
}

/**
 * Get a specific document by ID.
 */
export async function getDocument(documentId: number): Promise<RAGDocument> {
  const response = await api.get<RAGDocument>(`/rag/documents/${documentId}`);
  return response.data;
}

/**
 * Delete a document from the knowledge base.
 */
export async function deleteDocument(documentId: number): Promise<void> {
  await api.delete(`/rag/documents/${documentId}`);
}

// ============================================================================
// Custom Rules Operations
// ============================================================================

/**
 * Create a new custom HR rule.
 */
export async function createRule(rule: {
  name: string;
  rule_text: string;
  category?: RuleCategory;
  priority?: number;
  project_id?: string;
}): Promise<CustomHRRule> {
  const response = await api.post<CustomHRRule>('/rag/rules', rule);
  return response.data;
}

/**
 * List custom HR rules.
 */
export async function listRules(params?: {
  category?: RuleCategory;
  is_active?: boolean;
  project_id?: string;
}): Promise<CustomHRRule[]> {
  const response = await api.get<CustomHRRule[]>('/rag/rules', { params });
  return response.data;
}

/**
 * Get a specific rule by ID.
 */
export async function getRule(ruleId: number): Promise<CustomHRRule> {
  const response = await api.get<CustomHRRule>(`/rag/rules/${ruleId}`);
  return response.data;
}

/**
 * Update an existing rule.
 */
export async function updateRule(
  ruleId: number,
  updates: Partial<{
    name: string;
    rule_text: string;
    category: RuleCategory;
    priority: number;
    is_active: boolean;
  }>
): Promise<CustomHRRule> {
  const response = await api.put<CustomHRRule>(`/rag/rules/${ruleId}`, updates);
  return response.data;
}

/**
 * Delete a custom rule.
 */
export async function deleteRule(ruleId: number): Promise<void> {
  await api.delete(`/rag/rules/${ruleId}`);
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Query the knowledge base for relevant context.
 */
export async function queryKnowledgeBase(
  query: string,
  options?: {
    document_types?: DocumentType[];
    include_rules?: boolean;
    top_k?: number;
    project_id?: string;
  }
): Promise<RAGQueryResponse> {
  const response = await api.post<RAGQueryResponse>('/rag/query', {
    query,
    ...options,
  });
  return response.data;
}

/**
 * Validate a treatment against company policies.
 */
export async function validateTreatment(
  treatment: Record<string, unknown>,
  projectId?: string
): Promise<TreatmentValidationResult> {
  const response = await api.post<TreatmentValidationResult>('/rag/validate-treatment', {
    treatment,
    project_id: projectId,
  });
  return response.data;
}

// ============================================================================
// Settings Operations
// ============================================================================

/**
 * Get knowledge base settings.
 */
export async function getSettings(projectId?: string): Promise<KnowledgeBaseSettings> {
  const response = await api.get<KnowledgeBaseSettings>('/rag/settings', {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Update knowledge base settings.
 */
export async function updateSettings(
  updates: Partial<{
    // Company context
    company_name: string;
    industry: string;
    company_size: string;
    company_description: string;
    // RAG configuration
    mode: KnowledgeBaseMode;
    chunk_size: number;
    chunk_overlap: number;
    retrieval_top_k: number;
    similarity_threshold: number;
    use_general_hr_knowledge: boolean;
    strict_policy_mode: boolean;
  }>,
  projectId?: string
): Promise<KnowledgeBaseSettings> {
  const response = await api.put<KnowledgeBaseSettings>('/rag/settings', updates, {
    params: { project_id: projectId },
  });
  return response.data;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get RAG system statistics.
 */
export async function getStats(projectId?: string): Promise<RAGStats> {
  const response = await api.get<RAGStats>('/rag/stats', {
    params: { project_id: projectId },
  });
  return response.data;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format file size for display.
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get display label for document type.
 */
export function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    policy: 'Policy',
    benefit: 'Benefit',
    rule: 'Rule',
    general: 'General',
  };
  return labels[type] || type;
}

/**
 * Get display label for rule category.
 */
export function getRuleCategoryLabel(category?: RuleCategory): string {
  if (!category) return 'General';
  const labels: Record<RuleCategory, string> = {
    benefit: 'Benefit',
    restriction: 'Restriction',
    policy: 'Policy',
    process: 'Process',
    eligibility: 'Eligibility',
  };
  return labels[category] || category;
}

/**
 * Get status color for document status.
 */
export function getStatusColor(status: DocumentStatus): string {
  const colors: Record<DocumentStatus, string> = {
    pending: 'text-yellow-600',
    processing: 'text-blue-600',
    ready: 'text-green-600',
    error: 'text-red-600',
  };
  return colors[status] || 'text-gray-600';
}

// Export as default object for convenience
export const ragService = {
  // Documents
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  // Rules
  createRule,
  listRules,
  getRule,
  updateRule,
  deleteRule,
  // Query
  queryKnowledgeBase,
  validateTreatment,
  // Settings
  getSettings,
  updateSettings,
  // Stats
  getStats,
  // Utils
  formatFileSize,
  getDocumentTypeLabel,
  getRuleCategoryLabel,
  getStatusColor,
};

export default ragService;
