/**
 * Knowledge Base Management Page
 *
 * Manages company documents, custom HR rules, and RAG settings.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  BookOpen,
  Settings as SettingsIcon,
  Upload,
  Trash2,
  Plus,
  Edit2,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Search,
  Filter,
  RefreshCw,
  Database,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import ragService, {
  type RAGDocument,
  type CustomHRRule,
  type KnowledgeBaseSettings,
  type DocumentType,
  type RuleCategory,
} from '@/services/rag';

// ============================================================================
// Types
// ============================================================================

type Tab = 'documents' | 'rules' | 'settings';

// ============================================================================
// Tab Navigation
// ============================================================================

const tabs: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'documents', label: 'Documents', icon: FileText, description: 'Company policies & documentation' },
  { id: 'rules', label: 'Custom Rules', icon: BookOpen, description: 'HR rules & constraints' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, description: 'RAG configuration' },
];

// ============================================================================
// Document Section
// ============================================================================

function DocumentsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all');

  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['rag-documents', filterType],
    queryFn: () => ragService.listDocuments(filterType === 'all' ? undefined : { document_type: filterType }),
  });

  const deleteMutation = useMutation({
    mutationFn: ragService.deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      toast({ title: 'Document deleted', description: 'The document has been removed from the knowledge base.' });
      setDeleteDocId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await ragService.uploadDocument(file, {
          document_type: 'general',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      toast({ title: 'Upload successful', description: `${files.length} document(s) uploaded and processing.` });
    } catch (error) {
      toast({ title: 'Upload failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [queryClient, toast]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Upload company policies, HR documents, and benefit guides (PDF, DOCX, TXT, MD)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              "hover:border-primary hover:bg-primary/5",
              isUploading && "opacity-50 pointer-events-none"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={handleFileUpload}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading documents...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, MD up to 50MB</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Document List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Uploaded Documents</CardTitle>
              <CardDescription>{documents.length} document(s) in knowledge base</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={(v) => setFilterType(v as DocumentType | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="policy">Policies</SelectItem>
                  <SelectItem value="benefit">Benefits</SelectItem>
                  <SelectItem value="rule">Rules</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet</p>
              <p className="text-sm">Upload your first document to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(doc.status)}
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {ragService.getDocumentTypeLabel(doc.document_type as DocumentType)} •{' '}
                        {ragService.formatFileSize(doc.size_bytes)} •{' '}
                        {doc.chunk_count} chunks
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteDocId(doc.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDocId !== null} onOpenChange={() => setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the document and its chunks from the knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDocId && deleteMutation.mutate(deleteDocId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Rules Section
// ============================================================================

function RulesSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomHRRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: '' as RuleCategory | '',
    rule_text: '',
    priority: 5,
  });

  const { data: rules = [], isLoading, refetch } = useQuery({
    queryKey: ['rag-rules'],
    queryFn: () => ragService.listRules(),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => ragService.createRule({
      name: data.name,
      rule_text: data.rule_text,
      category: data.category || undefined,
      priority: data.priority,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-rules'] });
      toast({ title: 'Rule created', description: 'The custom rule has been added.' });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof formData> }) =>
      ragService.updateRule(id, {
        name: data.name,
        rule_text: data.rule_text,
        category: data.category || undefined,
        priority: data.priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-rules'] });
      toast({ title: 'Rule updated', description: 'The rule has been updated.' });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ragService.deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-rules'] });
      toast({ title: 'Rule deleted', description: 'The rule has been removed.' });
      setDeleteRuleId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      ragService.updateRule(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-rules'] });
    },
  });

  const handleOpenDialog = (rule?: CustomHRRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        category: rule.category || '',
        rule_text: rule.rule_text,
        priority: rule.priority,
      });
    } else {
      setEditingRule(null);
      setFormData({ name: '', category: '', rule_text: '', priority: 5 });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setFormData({ name: '', category: '', rule_text: '', priority: 5 });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.rule_text) {
      toast({ title: 'Validation Error', description: 'Name and rule text are required.', variant: 'destructive' });
      return;
    }

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Custom HR Rules
              </CardTitle>
              <CardDescription>
                Define company-specific rules that override or complement document-based knowledge
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Active Rules ({rules.filter(r => r.is_active).length})</CardTitle>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No custom rules defined</p>
              <p className="text-sm">Add rules to customize AI behavior for your company</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    rule.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{rule.name}</h4>
                        {rule.category && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                            {ragService.getRuleCategoryLabel(rule.category)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">Priority: {rule.priority}/10</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{rule.rule_text}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(rule)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteRuleId(rule.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Add Custom Rule'}</DialogTitle>
            <DialogDescription>
              Define a rule that the AI must follow when generating recommendations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Maximum Bonus Limit"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v as RuleCategory })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="benefit">Benefit</SelectItem>
                  <SelectItem value="restriction">Restriction</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="process">Process</SelectItem>
                  <SelectItem value="eligibility">Eligibility</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule_text">Rule Text</Label>
              <Textarea
                id="rule_text"
                value={formData.rule_text}
                onChange={(e) => setFormData({ ...formData, rule_text: e.target.value })}
                placeholder="Describe the rule in detail..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority: {formData.priority}</Label>
              <Slider
                value={[formData.priority]}
                onValueChange={([v]) => setFormData({ ...formData, priority: v })}
                min={1}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">Higher priority rules take precedence</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRule ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteRuleId !== null} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will be permanently removed and will no longer affect AI recommendations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRuleId && deleteMutation.mutate(deleteRuleId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Settings Section
// ============================================================================

function SettingsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['rag-settings'],
    queryFn: () => ragService.getSettings(),
  });

  const { data: stats } = useQuery({
    queryKey: ['rag-stats'],
    queryFn: () => ragService.getStats(),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<KnowledgeBaseSettings>) => ragService.updateSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-settings'] });
      toast({ title: 'Settings saved', description: 'Knowledge base settings have been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Documents', value: stats.ready_documents, icon: FileText },
            { label: 'Total Chunks', value: stats.total_chunks, icon: Search },
            { label: 'Custom Rules', value: stats.active_rules, icon: BookOpen },
            { label: 'Processing', value: stats.total_documents - stats.ready_documents, icon: Clock },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base Mode</CardTitle>
          <CardDescription>Choose how the AI uses your knowledge base</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={settings.mode}
            onValueChange={(v) => updateMutation.mutate({ mode: v as KnowledgeBaseSettings['mode'] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">Automatic - Use uploaded documents only</SelectItem>
              <SelectItem value="custom">Custom - Use custom rules only</SelectItem>
              <SelectItem value="hybrid">Hybrid - Use both documents and rules</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Retrieval Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Retrieval Settings</CardTitle>
          <CardDescription>Configure how documents are searched and retrieved</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Results per Query: {settings.retrieval_top_k}</Label>
            <Slider
              value={[settings.retrieval_top_k]}
              onValueChange={([v]) => updateMutation.mutate({ retrieval_top_k: v })}
              min={1}
              max={20}
              step={1}
            />
            <p className="text-xs text-muted-foreground">Number of document chunks to retrieve per query</p>
          </div>

          <div className="space-y-2">
            <Label>Similarity Threshold: {(settings.similarity_threshold * 100).toFixed(0)}%</Label>
            <Slider
              value={[settings.similarity_threshold * 100]}
              onValueChange={([v]) => updateMutation.mutate({ similarity_threshold: v / 100 })}
              min={50}
              max={100}
              step={5}
            />
            <p className="text-xs text-muted-foreground">Minimum similarity score for retrieved chunks</p>
          </div>
        </CardContent>
      </Card>

      {/* Behavior Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Behavior Settings</CardTitle>
          <CardDescription>Control AI behavior and compliance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Use General HR Knowledge</Label>
              <p className="text-sm text-muted-foreground">Allow AI to use general HR best practices</p>
            </div>
            <Switch
              checked={settings.use_general_hr_knowledge}
              onCheckedChange={(checked) => updateMutation.mutate({ use_general_hr_knowledge: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Strict Policy Mode</Label>
              <p className="text-sm text-muted-foreground">Only allow recommendations documented in policies</p>
            </div>
            <Switch
              checked={settings.strict_policy_mode}
              onCheckedChange={(checked) => updateMutation.mutate({ strict_policy_mode: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function KnowledgeBase() {
  const [activeTab, setActiveTab] = useState<Tab>('documents');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeader
        title="Knowledge Base"
        subtitle="Manage company documents, rules, and AI behavior"
        icon={Database}
        badges={[
          { label: 'RAG', variant: 'emerald' },
          { label: 'AI Context', variant: 'purple' },
        ]}
      />

      <div className="container mx-auto py-6 space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'documents' && <DocumentsSection />}
          {activeTab === 'rules' && <RulesSection />}
          {activeTab === 'settings' && <SettingsSection />}
        </motion.div>
      </AnimatePresence>
      </div>
    </div>
  );
}
