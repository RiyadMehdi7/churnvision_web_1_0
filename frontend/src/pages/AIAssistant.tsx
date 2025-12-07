import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import chatbotService from '../services/chatbot';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Send,
  AlertTriangle,
  Users,
  CheckCircle,
  TrendingUp,
  BarChart,
  BookOpen,
  Lightbulb,
  User,
  ChevronDown,
  ChevronUp,
  Expand,
  X,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import type { Components } from 'react-markdown';
import { RiskIndicator } from '../components/RiskIndicator';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalDataCache } from '../hooks/useGlobalDataCache';
import { useBatchReasoning } from '../hooks/useReasoning'; // Added reasoning hooks
import { FixedSizeList as List } from 'react-window';
import { AutoSizer } from 'react-virtualized';
import { v4 as uuidv4 } from 'uuid';
import { useLocation } from 'react-router-dom';
import { ChatMessage as GlobalChatMessage } from '@/types/chat';
import { Employee } from '@/types/employee';
import { useProject } from '@/contexts/ProjectContext';
import SimilarityTable from '../components/SimilarityTable';
import { ChurnReasoning } from '@/types/reasoning'; // Fixed import path
import { getCurrentThresholds, getDynamicRiskLevel } from '@/config/riskThresholds';
import { standardizePrompt } from '../utils/promptStandardizer';
import { TrainingReminderBanner } from '../components/TrainingReminderBanner';
import { ModelTrainingRequired } from '../components/ModelTrainingRequired';

// Import agentic AI components
import { AgentExecutionPanel, AgentContextPanel, ActionProposalCard, EmailComposer, TeamsComposer } from '../components/agent';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useActionProposals } from '../hooks/useActionProposals';
import { useAgentMemory } from '../hooks/useAgentMemory';
import type { AgentContext, ActionProposal } from '@/types/agent';

// Import analysis data types
import type { 
  PossibleStructuredData,
  EnhancedChurnRiskDiagnosisData,
  EnhancedRetentionPlaybookData,
  EnhancedSimilarityAnalysisData,
  WorkforceTrendsAnalysisData,
  DepartmentAnalysisData,
  EnhancedExitPatternMiningData,
  AIReasoningAnalysisData,
  SimilarityAnalysisData
} from '@/types/analysisData';

// Import renderer components
import { EnhancedChurnRiskDiagnosisRenderer } from '../components/renderers/EnhancedChurnRiskDiagnosisRenderer';
import { EnhancedRetentionPlaybookRenderer } from '../components/renderers/EnhancedRetentionPlaybookRenderer';
import { LegacyRetentionPlaybookRenderer } from '../components/renderers/LegacyRetentionPlaybookRenderer';
import { EnhancedSimilarityAnalysisRenderer } from '../components/renderers/EnhancedSimilarityAnalysisRenderer';
import { WorkforceTrendsAnalysisRenderer } from '../components/renderers/WorkforceTrendsAnalysisRenderer';
import { DepartmentAnalysisRenderer } from '../components/renderers/DepartmentAnalysisRenderer';
import { EnhancedExitPatternMiningRenderer } from '../components/renderers/EnhancedExitPatternMiningRenderer';
import PeerRetentionComparisonRenderer from '../components/renderers/PeerRetentionComparisonRenderer';
import LegacyExitPatternRenderer from '../components/renderers/LegacyExitPatternRenderer';

// Note: All analysis data types are now imported from @/types/analysisData

type ResponseKind = 'analysis' | 'chat';

// --- Update ExtendedChatMessage ---
// Update GlobalChatMessage to potentially hold structured data
interface ExtendedChatMessage extends GlobalChatMessage {
  // structuredData?: SimilarityAnalysisData; // Old
  structuredData?: PossibleStructuredData; // New: Union Type
  isOptimistic?: boolean;
  responseKind?: ResponseKind;
  responseTimeMs?: number;
}

// --- Local Type Definitions (TODO: Move to dedicated types file) ---

interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} className="text-app-green hover:underline dark:text-app-green-darkmode" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ children, inline, ...props }: CodeProps) =>
    inline ? (
      <code className="bg-gray-100 px-1 rounded dark:bg-dark-700 dark:text-gray-100" {...props}>
        {children}
      </code>
    ) : (
      <code className="block bg-gray-100 p-2 rounded dark:bg-dark-700 dark:text-gray-100" {...props}>
        {children}
      </code>
    )
};

const ANALYSIS_KEYWORDS = ['analyze', 'analysis', 'diagnose', 'compare', 'plan', 'pattern', 'trend', 'insight', 'strategy', 'playbook', 'recommend'];

// Helper to detect pattern type from user message for agent execution visualization
const detectPatternFromMessage = (message: string, hasEmployeeContext: boolean): string => {
  const lower = message.toLowerCase();

  if (lower.includes('diagnose') || lower.includes('risk') || lower.includes('why is')) {
    return 'churn_risk_diagnosis';
  }
  if (lower.includes('retention') || lower.includes('plan') || lower.includes('playbook')) {
    return 'retention_plan';
  }
  if ((lower.includes('compare') || lower.includes('similar')) && lower.includes('stayed')) {
    return 'employee_comparison_stayed';
  }
  if (lower.includes('compare') || lower.includes('similar') || lower.includes('resigned')) {
    return 'employee_comparison';
  }
  if (lower.includes('exit') || lower.includes('pattern') || lower.includes('departure')) {
    return 'exit_pattern_mining';
  }
  if (lower.includes('trend') || lower.includes('workforce') || lower.includes('overall')) {
    return 'workforce_trends';
  }
  if (lower.includes('department') || lower.includes('team')) {
    return 'department_analysis';
  }
  if (hasEmployeeContext) {
    return 'churn_risk_diagnosis';
  }
  return 'general_chat';
};

const inferResponseKind = (content: string, hasEmployeeContext: boolean): ResponseKind => {
  const lower = content.toLowerCase();
  if (ANALYSIS_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'analysis';
  }
  return hasEmployeeContext ? 'analysis' : 'chat';
};

const normalizeChatMessage = (msg: GlobalChatMessage, index: number, hasEmployeeContext: boolean): ExtendedChatMessage => {
  const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
  const id = msg.id ? String(msg.id) : `msg-${index}-${timestamp.getTime()}`;
  return {
    ...msg,
    id,
    timestamp,
    responseKind: msg.role === 'assistant' ? inferResponseKind(msg.message, hasEmployeeContext) : 'chat'
  };
};

// +++ Echo AI Avatar Component - ChurnVision branded +++
const EchoAvatar = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeConfig = {
    sm: { container: 'w-7 h-7', svg: 20 },
    md: { container: 'w-8 h-8', svg: 24 },
    lg: { container: 'w-16 h-16', svg: 48 },
  };
  const { container, svg } = sizeConfig[size];

  return (
    <div className={`${container} rounded-xl bg-[#75caa9] flex items-center justify-center flex-shrink-0 shadow-md`}>
      <svg width={svg} height={svg} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8" fill="white" />
        <path
          d="M8 12L11 15L16 9"
          stroke="#75caa9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// +++ Add TypingIndicator Component +++
const TypingIndicator = () => (
  <div className="p-4 mb-4 ml-2 mr-12 flex items-center space-x-2">
    <EchoAvatar size="md" />
    <div className="flex space-x-1">
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
    </div>
  </div>
);
// +++ End TypingIndicator Component +++

const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-app-green dark:border-gray-700 dark:border-t-app-green-darkmode" />
);

// EnhancedExitPatternMiningRenderer moved to external component file

// DepartmentAnalysisRenderer moved to external component file

// Memoized employee row component
const EmployeeRow = memo(({ 
  employee, 
  isSelected, 
  onClick,
  reasoningData 
}: { 
  employee: Employee;
  isSelected: boolean;
  onClick: () => void;
  reasoningData?: ChurnReasoning;
}) => {
  // Use reasoning data for risk score, fallback to churnProbability if not available
  const riskScore = reasoningData?.churn_risk ?? employee.churnProbability ?? 0;
  
  return (
    <motion.button
      onClick={onClick}
      className={`
        w-full p-3 rounded-lg text-left
        transition-all duration-300
        ${isSelected
          ? 'bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-900/30 dark:to-transparent border-emerald-200 dark:border-emerald-700'
          : 'hover:bg-gray-50 dark:hover:bg-slate-700 border-transparent'
        }
        border relative group overflow-hidden
        dark:bg-slate-800 dark:text-slate-100
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-employee-id={employee.id}
      data-component="employee-row"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent dark:from-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {employee.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {employee.position}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {employee.department}
            </p>
          </div>
          <RiskIndicator riskScore={riskScore} size="sm" showIcon={true} />
        </div>
      </div>
    </motion.button>
  );
});

// Old ChurnRiskDiagnosisRenderer removed - using EnhancedChurnRiskDiagnosisRenderer instead

// Old RetentionPlaybookRenderer removed - using EnhancedRetentionPlaybookRenderer instead

// Old ExitPatternRenderer removed - using EnhancedExitPatternMiningRenderer instead

// Old PeerRetentionComparisonRenderer removed - functionality integrated into enhanced renderers

// --- Enhanced Rendering Component for Churn Risk Diagnosis ---
// EnhancedChurnRiskDiagnosisRenderer extracted to separate file

// --- Enhanced Rendering Component for Retention Playbook ---
// EnhancedRetentionPlaybookRenderer extracted to separate file

// Old AIReasoningAnalysisRenderer removed - functionality integrated into enhanced renderers

// --- Enhanced Rendering Component for Workforce Trends Analysis ---
// WorkforceTrendsAnalysisRenderer extracted to separate file

// --- Enhanced Rendering Component for Similarity Analysis ---
// EnhancedSimilarityAnalysisRenderer extracted to separate file

// High-performance true full-screen modal component
const FullScreenModal = memo(({ 
  isOpen, 
  onClose, 
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Add full-screen class to html element for true full-screen
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900"
      style={{
        // Ensure true full-screen coverage
        width: '100vw',
        height: '100vh',
        top: 0,
        left: 0,
        position: 'fixed',
      }}
    >
      {/* Minimal header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-white">
            <BarChart size={14} />
          </div>
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">Analysis View</h2>
        </div>
        
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          aria-label="Close full-screen view"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content area - full screen minus header */}
      <div 
        className="overflow-auto bg-gray-50 dark:bg-gray-900"
        style={{
          height: 'calc(100vh - 48px)', // Subtract header height
          width: '100vw',
        }}
      >
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
});

// Message component with improved styling and alignment
const ChatMessageComponent = memo<{ message: ExtendedChatMessage; isContinuation?: boolean }>(({ message, isContinuation = false }) => {
  const isBot = message.role === 'assistant';
  const [isCollapsed, setIsCollapsed] = useState(false); // State for collapsing
  const [isFullScreen, setIsFullScreen] = useState(false); // State for full-screen modal
  
  // Function to safely parse JSON and identify the type
  const tryParseStructuredData = (text: string): PossibleStructuredData => {
    // First, try to parse as direct JSON
    try {
      const parsed = JSON.parse(text);
      // Check for specific 'type' fields to identify the structure
      switch (parsed?.type) {
        case 'similarityAnalysis':
          if (parsed.targetEmployeeName && Array.isArray(parsed.similarEmployees) && parsed.explanation) {
            return parsed as SimilarityAnalysisData;
          }
          break;
        case 'enhancedSimilarityAnalysis':
          if (parsed.targetEmployee && parsed.comparisonType && Array.isArray(parsed.similarEmployees) && parsed.patterns && parsed.insights && parsed.analysis) {
            return parsed as EnhancedSimilarityAnalysisData;
          }
          break;
        case 'peerRetentionComparison':
          if (parsed.targetEmployeeName && parsed.retainedPeerGroupName && Array.isArray(parsed.comparisonFactors)) {
            return parsed as any; // PeerRetentionComparisonData
          }
          break;
        case 'enhancedChurnRiskDiagnosis':
          if (parsed.targetEmployeeName && typeof parsed.overallRisk === 'number' && typeof parsed.mlScore === 'number' && typeof parsed.heuristicScore === 'number' && typeof parsed.stageScore === 'number' && typeof parsed.confidenceLevel === 'number' && Array.isArray(parsed.mlContributors) && Array.isArray(parsed.heuristicAlerts) && parsed.reasoning && Array.isArray(parsed.recommendations) && parsed.explanation) {
            return parsed as EnhancedChurnRiskDiagnosisData;
          }
          break;
        case 'enhancedRetentionPlaybook':
          if (parsed.targetEmployeeName && typeof parsed.currentRisk === 'number' && typeof parsed.stage === 'string' && Array.isArray(parsed.primaryRiskFactors) && Array.isArray(parsed.actionPlan) && Array.isArray(parsed.monitoringMetrics) && Array.isArray(parsed.successIndicators) && typeof parsed.summary === 'string') {
            return parsed as EnhancedRetentionPlaybookData;
          }
          break;
        case 'retentionPlaybook':
          if (Array.isArray(parsed.playbook)) {
            return parsed as any; // LegacyRetentionPlaybookData
          }
          break;
        case 'aiReasoningAnalysis':
          if (parsed.targetEmployeeName && typeof parsed.reasoning.churn_risk === 'number' && typeof parsed.reasoning.stage === 'string' && typeof parsed.reasoning.stage_score === 'number' && typeof parsed.reasoning.ml_score === 'number' && typeof parsed.reasoning.heuristic_score === 'number' && Array.isArray(parsed.reasoning.ml_contributors) && Array.isArray(parsed.reasoning.heuristic_alerts) && typeof parsed.reasoning.reasoning === 'string' && typeof parsed.reasoning.recommendations === 'string' && typeof parsed.reasoning.confidence_level === 'number') {
            return parsed as AIReasoningAnalysisData;
          }
          break;
        case 'churn_trends_analysis':
          if (parsed.statistics && typeof parsed.statistics.totalEmployees === 'number' && typeof parsed.analysis === 'string') {
            return parsed as WorkforceTrendsAnalysisData;
          }
          break;
        case 'department_analysis':
          if (parsed.analysisType && parsed.summary) {
            return parsed as DepartmentAnalysisData;
          }
          break;
        case 'exit_pattern_mining':
          if (parsed.exitData || parsed.insights || parsed.summary) {
            return parsed as EnhancedExitPatternMiningData;
          }
          break;
        case 'exitPatternMining':
          if (Array.isArray(parsed.patterns) && parsed.summary) {
            return parsed as any; // LegacyExitPatternData
          }
          break;
      }
    } catch (e) {
      // Not direct JSON, try other parsing methods
    }

    // Try to extract JSON from mixed text content with improved regex
    try {
      // Look for JSON blocks that might be embedded in text
      const jsonMatches = text.match(/\{[\s\S]*?\}(?=\s*$|\s*[^}])/g);
      if (jsonMatches) {
        for (const jsonMatch of jsonMatches) {
          try {
            const parsed = JSON.parse(jsonMatch);
            if (parsed?.type) {
              const result = tryParseStructuredData(jsonMatch);
              if (result) return result;
            }
          } catch (e) {
            continue;
          }
        }
      }
    } catch (e) {
      // JSON extraction failed
    }

    return null;
  };

  // Use structuredData from backend if available, otherwise try to parse from message text
  const structuredData = isBot ? (() => {
    // First check if structuredData was passed directly from the backend response
    if (message.structuredData && message.structuredData.type) {
      return message.structuredData;
    }
    // Fall back to parsing the message text for legacy responses
    const result = tryParseStructuredData(message.message);
    return result;
  })() : null;

  const renderContent = () => {
    if (isCollapsed && isBot) { // Only bot messages can be collapsed, and only if isCollapsed is true
      return (
        <p className="italic text-gray-500 dark:text-gray-400 text-sm">
          AI response hidden. Click to expand.
        </p>
      );
    }
    if (structuredData) {
      const renderStructuredContent = () => {
      switch (structuredData.type) {
        case 'similarityAnalysis':
          return (
            <SimilarityTable 
              targetEmployeeName={structuredData.targetEmployeeName}
              similarEmployees={structuredData.similarEmployees}
              explanation={structuredData.explanation}
              comparisonType={structuredData.comparisonType}
            />
          );
          case 'enhancedSimilarityAnalysis':
            return <EnhancedSimilarityAnalysisRenderer data={structuredData} />;
        // Old renderer cases removed - using enhanced renderers instead
        // case 'churnRiskDiagnosis': - use 'enhancedChurnRiskDiagnosis' instead
        // case 'retentionPlaybook': - use 'enhancedRetentionPlaybook' instead  
        // case 'exitPatternMining': - use 'exit_pattern_mining' instead
        // case 'peerRetentionComparison': - functionality integrated into enhanced renderers
        case 'enhancedChurnRiskDiagnosis':
          return <EnhancedChurnRiskDiagnosisRenderer data={structuredData} />;
        case 'enhancedRetentionPlaybook':
          return <EnhancedRetentionPlaybookRenderer data={structuredData} />;
        case 'retentionPlaybook':
          return <LegacyRetentionPlaybookRenderer data={structuredData as any} />;
        // case 'aiReasoningAnalysis': // Old AIReasoningAnalysisRenderer removed - using enhanced renderers instead
          case 'churn_trends_analysis':
            return <WorkforceTrendsAnalysisRenderer data={structuredData} />;
          case 'department_analysis':
            return <DepartmentAnalysisRenderer data={structuredData} />;
          case 'exit_pattern_mining':
            return <EnhancedExitPatternMiningRenderer data={structuredData} />;
          case 'peerRetentionComparison':
            return <PeerRetentionComparisonRenderer data={structuredData as any} />;
          case 'exitPatternMining':
            return <LegacyExitPatternRenderer data={structuredData as any} />;
          case 'email_action':
            // Render EmailComposer for email action responses
            return (
              <div className="w-full">
                <EmailComposer
                  to={structuredData.emailData?.to || []}
                  cc={structuredData.emailData?.cc || []}
                  subject={structuredData.emailData?.subject || ''}
                  body={structuredData.emailData?.body || ''}
                  employeeName={structuredData.targetEmployeeName}
                />
              </div>
            );
          case 'meeting_action':
            // Render TeamsComposer for meeting action responses
            return (
              <div className="w-full">
                <TeamsComposer
                  subject={structuredData.meetingData?.title || ''}
                  attendees={structuredData.meetingData?.attendees || []}
                  duration={structuredData.meetingData?.duration || 30}
                  message={structuredData.meetingData?.agenda || ''}
                  employeeName={structuredData.targetEmployeeName}
                  mode="meeting"
                />
              </div>
            );
          case 'employee_info':
            // Render employee info summary as a nice card
            return (
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                    {structuredData.targetEmployeeName?.split(' ').map((n: string) => n[0]).join('') || '?'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{structuredData.targetEmployeeName}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{structuredData.profile?.position} • {structuredData.profile?.department}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <span className="text-gray-500 dark:text-gray-400">Tenure</span>
                    <p className="font-medium text-gray-900 dark:text-white">{structuredData.profile?.tenure?.toFixed(1) || 0} years</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <span className="text-gray-500 dark:text-gray-400">Risk Level</span>
                    <p className={`font-medium ${structuredData.riskAssessment?.riskLevel === 'High' ? 'text-red-600' : structuredData.riskAssessment?.riskLevel === 'Medium' ? 'text-yellow-600' : 'text-green-600'}`}>
                      {structuredData.riskAssessment?.riskLevel} ({(structuredData.riskAssessment?.overallRisk * 100)?.toFixed(0)}%)
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <span className="text-gray-500 dark:text-gray-400">Stage</span>
                    <p className="font-medium text-gray-900 dark:text-white">{structuredData.riskAssessment?.stage}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <span className="text-gray-500 dark:text-gray-400">HR Code</span>
                    <p className="font-medium text-gray-900 dark:text-white">{structuredData.targetHrCode}</p>
                  </div>
                </div>
                {structuredData.riskAssessment?.topRiskFactors?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Top Risk Factors</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {structuredData.riskAssessment.topRiskFactors.map((factor: string, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">
                          {factor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
        default:
          return (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.message}
            </ReactMarkdown>
          );
      }
      };

      return (
        <div className="relative">
          {renderStructuredContent()}
          {/* Simple expand button for full-screen experience */}
          <div className="absolute top-2 right-2 z-20">
            <button
              onClick={() => setIsFullScreen(true)}
              className="p-2 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              aria-label="Open in full-screen view"
              title="Full Screen"
            >
              <Expand size={16} />
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.message}
        </ReactMarkdown>
      );
    }
  };

  const timestampLabel = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const confidenceValue = typeof message.confidence === 'number'
    ? (message.confidence > 1 ? message.confidence : message.confidence * 100)
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }}
      className={`flex mb-4 ${isBot ? 'justify-start' : 'justify-end'}`}
      data-message-id={message.id}
    >
      <div
        className={`relative max-w-[85%] ${
          isBot
            ? 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 shadow-sm'
            : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md'
        } rounded-2xl overflow-hidden transition-shadow ${message.isOptimistic ? 'opacity-80' : ''}`}
      >
        {isBot && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 z-10"
            aria-label={isCollapsed ? 'Expand message' : 'Collapse message'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}

        <div className={`flex items-start gap-3 p-3 ${isBot ? '' : 'flex-row-reverse'}`}>
          <div className={`flex-shrink-0 mt-0.5 ${isContinuation ? 'invisible' : ''}`}>
            {isBot ? (
              <EchoAvatar size="sm" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-md">
                <User size={14} />
              </div>
            )}
          </div>

          <div className={`flex-1 min-w-0 ${isBot && isCollapsed ? 'pr-8' : ''}`}>
            <div className={`text-xs font-medium mb-1 flex items-center gap-2 ${isBot ? 'text-gray-700 dark:text-gray-300' : 'text-white/90'}`}>
              <span>{isBot ? 'AI Assistant' : 'You'}</span>
              {isBot && message.responseKind === 'analysis' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] uppercase tracking-wide">
                  Analysis
                </span>
              )}
            </div>
            <div className={`prose prose-sm max-w-none ${isBot ? 'dark:prose-dark text-gray-800 dark:text-gray-200' : 'prose-invert text-white'}`}>
              {renderContent()}
            </div>

            {isBot && (message.intent || confidenceValue !== null || message.responseTimeMs) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {message.intent && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
                    <span className="font-medium">Intent</span>
                    <span>{message.intent}</span>
                  </span>
                )}
                {confidenceValue !== null && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
                    <CheckCircle size={12} className="text-emerald-500" />
                    <span>{confidenceValue.toFixed(1)}% confidence</span>
                  </span>
                )}
                {message.responseTimeMs && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
                    <span>~{Math.round(message.responseTimeMs)}ms</span>
                  </span>
                )}
              </div>
            )}

            {timestampLabel && (
              <div className={`mt-3 flex ${isBot ? 'justify-start' : 'justify-end'}`}>
                <span className={`${isBot ? 'text-gray-400 dark:text-gray-500' : 'text-white/60'} text-[10px] uppercase tracking-wide`}>
                  {timestampLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {isFullScreen && (
        <FullScreenModal isOpen={isFullScreen} onClose={() => setIsFullScreen(false)}>
          {structuredData && (() => {
            switch (structuredData.type) {
              case 'similarityAnalysis':
                return (
                  <SimilarityTable
                    targetEmployeeName={structuredData.targetEmployeeName}
                    similarEmployees={structuredData.similarEmployees}
                    explanation={structuredData.explanation}
                    comparisonType={structuredData.comparisonType}
                  />
                );
              case 'enhancedSimilarityAnalysis':
                return <EnhancedSimilarityAnalysisRenderer data={structuredData} />;
              case 'enhancedChurnRiskDiagnosis':
                return <EnhancedChurnRiskDiagnosisRenderer data={structuredData} />;
              case 'enhancedRetentionPlaybook':
                return <EnhancedRetentionPlaybookRenderer data={structuredData} />;
              case 'retentionPlaybook':
                return <LegacyRetentionPlaybookRenderer data={structuredData as any} />;
              case 'churn_trends_analysis':
                return <WorkforceTrendsAnalysisRenderer data={structuredData} />;
              case 'department_analysis':
                return <DepartmentAnalysisRenderer data={structuredData} />;
              case 'exit_pattern_mining':
                return <EnhancedExitPatternMiningRenderer data={structuredData} />;
              case 'peerRetentionComparison':
                return <PeerRetentionComparisonRenderer data={structuredData as any} />;
              case 'exitPatternMining':
                return <LegacyExitPatternRenderer data={structuredData as any} />;
              default:
                return null;
            }
          })()}
        </FullScreenModal>
      )}
    </motion.div>
  );
});

interface ChatState {
    messages: ExtendedChatMessage[];
    input: string;
    isLoading: boolean;
    error: string | null;
    sessionId: string;
    pendingResponseKind?: ResponseKind;
}

// Define Employee and ChatMessage interfaces locally...

// --- Constants ---
const sortOptions = [
  { id: 'risk', label: 'Risk Level' },
  { id: 'name', label: 'Name' },
  { id: 'department', label: 'Department' },
  { id: 'eltv', label: 'Current ELTV' } // Note: ELTV sorting might not be available in AIAssistant data
];
// --- End Constants ---

// +++ Start AnalysisInProgressIndicator Component +++
const AnalysisStep = ({ text, isComplete }: { text: string; isComplete: boolean }) => {
  const [internalComplete, setInternalComplete] = useState(false);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setInternalComplete(true), 200); // Small delay for visual effect
      return () => clearTimeout(timer);
    } else {
      setInternalComplete(false); // Reset when not complete
    }
  }, [isComplete]);

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1.5">
      {internalComplete ? (
        <CheckCircle size={16} className="text-emerald-500" />
      ) : (
        <LoadingSpinner />
      )}
      <span>{text}</span>
    </div>
  );
};

interface AnalysisInProgressIndicatorProps {
  isLoading: boolean;
}

const AnalysisInProgressIndicator: React.FC<AnalysisInProgressIndicatorProps> = ({ isLoading }) => {
  const [step, setStep] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Quick progression for first two steps
    const timer1 = setTimeout(() => setStep(1), 500);   // Access data quickly
    const timer2 = setTimeout(() => setStep(2), 1000);  // Start comparison
    
    // Don't auto-complete the final step - wait for actual response
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Complete final step only when loading is actually done
  useEffect(() => {
    if (!isLoading && step >= 2) {
      // Add a small delay to feel natural, but sync with actual completion
      const elapsed = Date.now() - startTime;
      const minDelay = elapsed > 2000 ? 0 : 300; // If it took long enough, complete immediately
      
      const timer = setTimeout(() => setStep(3), minDelay);
      return () => clearTimeout(timer);
    }
  }, [isLoading, step, startTime]);

  return (
    <div className="p-4 mb-4 ml-2 mr-12 flex items-start space-x-3">
      <EchoAvatar size="md" />
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Performing Analysis...</p>
        <AnalysisStep text="Accessing employee data..." isComplete={step >= 1} />
        <AnalysisStep text="Comparing profiles..." isComplete={step >= 2} />
        <AnalysisStep text="Generating insights..." isComplete={step >= 3} />
      </div>
    </div>
  );
};
// +++ End AnalysisInProgressIndicator Component +++

export function AIAssistant(): React.ReactElement {
  // --- State Management ---
  const { activeProject } = useProject();
  
  // Declare selectedEmployees first before using it in hooks
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);

  // Add reasoning hooks for enhanced AI responses
  const { 
    fetchBatchReasoning, 
    reasoningData  } = useBatchReasoning();

  // --- Global Data Cache ---
  const { aiAssistantEmployees, fetchAIAssistantData, isLoadingAIAssistantData, trainingStatus } = useGlobalDataCache();

  // Normalize employee lists to strip null/undefined entries
  const safeEmployees = useMemo(
    () => (aiAssistantEmployees || []).filter((e): e is Employee => Boolean(e && (e as any).hr_code)),
    [aiAssistantEmployees]
  );
  const hasReasoningData = useMemo(
    () =>
      safeEmployees.some(
        emp => typeof emp?.reasoningChurnRisk === 'number'
      ),
    [safeEmployees]
  );
  const isModelReady = trainingStatus?.status === 'complete' || hasReasoningData;
  // Use centralized dynamic risk threshold functions
  const getRiskLevel = getDynamicRiskLevel;
  const thresholds = getCurrentThresholds();

  // Helper function to get reasoning data for an employee
  // Uses the reasoning data already loaded with the employee from the API
  const getEmployeeReasoning = useCallback((hrCode: string | undefined | null): ChurnReasoning | undefined => {
    if (!hrCode) return undefined;
    // First check if we have fresh data from batch fetch
    const batchData = reasoningData?.find(r => r && r.hr_code === hrCode);
    if (batchData) return batchData;
    // Otherwise, construct from employee's pre-loaded reasoning fields
    const emp = safeEmployees.find(e => e.hr_code === hrCode);
    if (emp && typeof emp.reasoningChurnRisk === 'number') {
      return {
        hr_code: hrCode,
        churn_risk: emp.reasoningChurnRisk,
        stage: emp.reasoningStage || 'Unknown',
        confidence_level: emp.reasoningConfidence || 0.7,
      } as ChurnReasoning;
    }
    return undefined;
  }, [reasoningData, safeEmployees]);

  // Helper function to get risk score from reasoning data
  const getEmployeeRiskScore = useCallback((employee: Employee): number => {
    // Use pre-loaded reasoning data from employee object first
    return employee.reasoningChurnRisk ?? employee.churnProbability ?? 0;
  }, []);

  // Only fetch detailed reasoning when specific employees are selected (on-demand)
  // Don't fetch for ALL employees - that data already comes from the employees API
  useEffect(() => {
    if (selectedEmployees.length > 0 && selectedEmployees.length <= 5) {
      // Only fetch detailed reasoning for small selections (on-demand)
      const hrCodes = selectedEmployees
        .map(emp => emp?.hr_code)
        .filter((code): code is string => Boolean(code));
      fetchBatchReasoning(hrCodes);
    }
    // Removed: bulk fetching for all employees - data already in employee objects
  }, [selectedEmployees, fetchBatchReasoning]);
  
  const [chatState, setChatState] = useState<ChatState>(() => ({
    messages: [],
    input: '',
    isLoading: false,
    error: null,
    sessionId: uuidv4(),
    pendingResponseKind: undefined,
  }));
  const location = useLocation();
  useEffect(() => {
    const incomingPrompt = (location.state as any)?.prompt;
    if (incomingPrompt) {
      setChatState(prev => ({ ...prev, input: incomingPrompt }));
    }
  }, [location.state]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
  const [sortBy, setSortBy] = useState('risk');
  const [isSorting, setIsSorting] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false); // Default to closed on small screens
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Agentic AI State ---
  const { execution, isExecuting, startExecution, completeExecution, resetExecution } = useAgentExecution();

  // --- Agent Memory (with localStorage persistence & insights extraction) ---
  const {
    context: agentContext,
    addEmployeeDiscussed,
    extractInsightsFromResponse,
    clearMemory,
  } = useAgentMemory();

  // --- Action Proposals ---
  const {
    proposals: actionProposals,
    isGenerating: isGeneratingActions,
    error: actionError,
    generateEmail,
    generateMeeting,
    generateSuite,
    approveAction,
    rejectAction,
    editAction,
    clearProposals,
  } = useActionProposals();

  // Log action errors for debugging
  useEffect(() => {
    if (actionError) {
      console.error('[ActionProposals] Error:', actionError);
    }
  }, [actionError]);

  useEffect(() => {
    if (!activeProject) {
      setChatState(prev => ({ ...prev, messages: [], isLoading: false, error: null }));
      return;
    }

    const initializePage = async () => {
      if (!safeEmployees || safeEmployees.length === 0) {
        await fetchAIAssistantData(activeProject?.dbPath || null);
      } 
      loadChatHistory(/* activeProject?.dbPath || null */);
    };
    
    initializePage();
  }, [fetchAIAssistantData, safeEmployees, activeProject]);
  
  useEffect(() => {
    scrollToBottom();
  }, [chatState.messages]);

  const loadChatHistory = async () => {
    if (!activeProject) {
      setChatState(prev => ({ ...prev, messages: [], isLoading: false, error: null }));
      return;
    }
    try {
      setChatState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));
      const history = await chatbotService.getChatHistory(chatState.sessionId);
      const normalizedHistory = history.map((msg, index) => normalizeChatMessage(msg, index, selectedEmployees.length > 0));
      setChatState(prev => ({
        ...prev,
        messages: normalizedHistory,
        isLoading: false,
        pendingResponseKind: undefined,
      }));
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setChatState(prev => ({
          ...prev,
          isLoading: false,
          error: null,
        }));
      } else {
        let errorMessage = 'Failed to load chat history';
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
          errorMessage = String(err.message);
        }
        setChatState(prev => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
        }));
      }
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Quick action handler - sends message with specific action type for structured cards
  const handleQuickAction = async (actionType: string, displayMessage: string) => {
    if (chatState.isLoading || !selectedEmployees[0]) return;

    // Set the display message and trigger send with action type
    setChatState(prev => ({ ...prev, input: displayMessage }));
    // Small delay to allow state update, then send
    setTimeout(() => handleSendMessage(actionType), 50);
  };

  const handleSendMessage = async (actionType?: string) => {
    if (!chatState.input.trim() || chatState.isLoading) return;

    const userMessage = chatState.input.trim();
    const hasEmployeeContext = selectedEmployees.length > 0;
    const pendingKind = actionType ? 'analysis' : inferResponseKind(userMessage, hasEmployeeContext);
    const sessionId = chatState.sessionId;
    const userMessageId = `user-${uuidv4()}`;
    const optimisticUserMessage: ExtendedChatMessage = {
      id: userMessageId,
      role: 'user',
      message: userMessage,
      timestamp: new Date(),
      sessionId,
      isOptimistic: true,
      responseKind: 'chat'
    };

    setChatState(prev => ({
      ...prev,
      input: '',
      isLoading: true,
      error: null,
      pendingResponseKind: pendingKind,
      messages: [...prev.messages, optimisticUserMessage],
    }));

    // Start agent execution visualization with context
    const agentContextData = {
      employeeName: hasEmployeeContext ? selectedEmployees[0]?.name : undefined,
      riskScore: hasEmployeeContext ? getEmployeeRiskScore(selectedEmployees[0]) : undefined,
      department: hasEmployeeContext ? selectedEmployees[0]?.department : undefined,
    };

    const datasetId = trainingStatus?.datasetId || (typeof window !== 'undefined' ? localStorage.getItem('activeDatasetId') : null);

    // Determine pattern type from the message for agent execution
    const patternType = pendingKind === 'analysis'
      ? detectPatternFromMessage(userMessage, hasEmployeeContext)
      : 'general_chat';

    startExecution(userMessage, patternType, agentContextData);

    try {
      // Two modes:
      // 1. Quick Action (actionType provided): Returns structured data cards
      // 2. Chat (no actionType): Uses LLM with full employee context for natural responses
      const response = await chatbotService.sendMessage({
        sessionId,
        content: userMessage,
        employeeId: hasEmployeeContext ? selectedEmployees[0]?.hr_code : undefined,
        datasetId,
        actionType: actionType || undefined, // Quick action type for structured responses
      });

      // Build assistant message with structured data if available
      const assistantMessage: ExtendedChatMessage = {
        id: response.botMessageId || `bot-${uuidv4()}`,
        role: 'assistant',
        message: (() => {
          if (typeof response.response === 'string') return response.response;
          if (typeof response.response?.message === 'string') return response.response.message;
          return 'No response available.';
        })(),
        timestamp: new Date(),
        sessionId,
        intent: response.response?.intent,
        confidence: response.response?.confidence,
        responseKind: pendingKind,
        responseTimeMs: response.response?.responseTime,
        // Include structured data from intelligent chatbot for specialized renderers
        structuredData: response.response?.structuredData as PossibleStructuredData | undefined,
      };

      setChatState(prev => {
        const updatedMessages = prev.messages.map(msg =>
          msg.id === userMessageId ? { ...msg, isOptimistic: false } : msg
        );
        return {
          ...prev,
          isLoading: false,
          pendingResponseKind: undefined,
          messages: [...updatedMessages, assistantMessage],
        };
      });

      // Complete agent execution visualization
      completeExecution();

      // Update agent memory with discussed employee
      if (hasEmployeeContext && selectedEmployees[0]) {
        const emp = selectedEmployees[0];
        const riskScore = getEmployeeRiskScore(emp);
        addEmployeeDiscussed({
          hrCode: emp.hr_code || '',
          name: emp.name,
          riskLevel: riskScore >= 0.7 ? 'High' : riskScore >= 0.4 ? 'Medium' : 'Low',
        });
      }

      // Extract and store insights from the AI response
      const responseText = assistantMessage.message;
      if (responseText && responseText.length > 50) {
        extractInsightsFromResponse(
          responseText,
          hasEmployeeContext ? selectedEmployees[0]?.name : undefined
        );
      }

      // Auto-scroll to bottom after adding message to ensure result is visible
      setTimeout(scrollToBottom, 100);
    } catch (err: any) {
      let errorMessage = 'Failed to send message';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.response?.data?.error) {
        errorMessage = err.response.data.error;
      }

      setChatState(prev => {
        const updatedMessages = prev.messages.map(msg =>
          msg.id === userMessageId ? { ...msg, isOptimistic: false } : msg
        );
        return {
          ...prev,
          isLoading: false,
          pendingResponseKind: undefined,
          error: errorMessage,
          messages: [...updatedMessages, {
            id: `error-${uuidv4()}`,
            role: 'assistant',
            message: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
            timestamp: new Date(),
            sessionId,
            responseKind: 'chat'
          }],
        };
      });

      // Reset agent execution on error
      resetExecution();
    }
  };

  const handleEmployeeSelect = useCallback((employee: Employee) => {
    setSelectedEmployees([employee]);
  }, []);

  // Handle sort changes with better user feedback (copied from Playground)
  const handleSortChange = useCallback((value: string) => {
    if (safeEmployees && safeEmployees.length > 500) {
      setIsSorting(true);
      // Use setTimeout to allow the UI to update before doing expensive operation
      setTimeout(() => {
        setSortBy(value);
        setIsSorting(false);
      }, 0);
    } else {
      setSortBy(value);
    }
  }, [safeEmployees]);

  // Base filtered data (before dropdown filters) for cascade filtering
  const baseFilteredEmployees = useMemo(() => {
    let filtered = safeEmployees ? [...safeEmployees] : [];

    // Filter for active employees first
    filtered = filtered.filter(emp => !emp || emp.status === 'Active');

    // Apply search filter only
    if (searchTerm.trim()) {
      const searchTermLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(searchTermLower) ||
        (emp.position || '').toLowerCase().includes(searchTermLower) ||
        (emp.department || '').toLowerCase().includes(searchTermLower)
      );
    }

    return filtered;
  }, [safeEmployees, searchTerm]);

  // Cascade filter options based on current selections
  const availableDepartments = useMemo(() => {
    let dataForDepts = baseFilteredEmployees;
    
    // Apply other active filters except department
    if (selectedPosition) {
      dataForDepts = dataForDepts.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }
    if (selectedRiskLevel) {
      dataForDepts = dataForDepts.filter(emp => {
        const riskScore = getEmployeeRiskScore(emp);
        const calculatedRiskLevel = getRiskLevel(riskScore);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }
    
    return Array.from(new Set(dataForDepts.map(emp => emp.department || 'N/A'))).sort();
  }, [baseFilteredEmployees, selectedPosition, selectedRiskLevel, getEmployeeRiskScore, getRiskLevel]);

  const availablePositions = useMemo(() => {
    let dataForPositions = baseFilteredEmployees;
    
    // Apply other active filters except position
    if (selectedDepartment) {
      dataForPositions = dataForPositions.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }
    if (selectedRiskLevel) {
      dataForPositions = dataForPositions.filter(emp => {
        const riskScore = getEmployeeRiskScore(emp);
        const calculatedRiskLevel = getRiskLevel(riskScore);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }
    
    return Array.from(new Set(dataForPositions.map(emp => emp.position || 'N/A'))).sort();
  }, [baseFilteredEmployees, selectedDepartment, selectedRiskLevel, getEmployeeRiskScore, getRiskLevel]);

  const availableRiskLevels = useMemo(() => {
    let dataForRisk = baseFilteredEmployees;
    
    // Apply other active filters except risk level
    if (selectedDepartment) {
      dataForRisk = dataForRisk.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }
    if (selectedPosition) {
      dataForRisk = dataForRisk.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }
    
    const riskLevels = dataForRisk.map(emp => {
      const riskScore = getEmployeeRiskScore(emp);
      return getRiskLevel(riskScore);
    });
    
    return Array.from(new Set(riskLevels)).sort();
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, getEmployeeRiskScore, getRiskLevel]);

  // Final filtered data with all filters applied
  const filteredEmployeesMemo = useMemo(() => {
    let filtered = baseFilteredEmployees;

    // Apply dropdown filters
    if (selectedDepartment) {
      filtered = filtered.filter(emp => (emp.department || 'N/A') === selectedDepartment);
    }

    if (selectedPosition) {
      filtered = filtered.filter(emp => (emp.position || 'N/A') === selectedPosition);
    }

    if (selectedRiskLevel) {
      filtered = filtered.filter(emp => {
        // Use reasoning data for risk calculation
        const riskScore = getEmployeeRiskScore(emp);
        const calculatedRiskLevel = getRiskLevel(riskScore);
        return calculatedRiskLevel === selectedRiskLevel;
      });
    }

    return filtered;
  }, [baseFilteredEmployees, selectedDepartment, selectedPosition, selectedRiskLevel, getEmployeeRiskScore, getRiskLevel]);

  // Refactored sorting logic using reasoning data
  const sortedEmployeesMemo = useMemo(() => {
    if (!filteredEmployeesMemo.length) return [];

    const sorted = [...filteredEmployeesMemo];

    if (sortBy === 'risk') {
      sorted.sort((a, b) => getEmployeeRiskScore(b) - getEmployeeRiskScore(a));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'department') {
      sorted.sort((a, b) => (a.department || '').localeCompare(b.department || ''));
    }

    return sorted;
  }, [filteredEmployeesMemo, sortBy, getEmployeeRiskScore]);

  const EmployeeRowRenderer = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const employee = sortedEmployeesMemo[index];
    if (!employee) return null;
    
    const employeeReasoning = getEmployeeReasoning(employee.hr_code);
    
    return (
      <div style={style}>
        <EmployeeRow 
          key={employee.id}
          employee={employee} 
          isSelected={selectedEmployees.some(emp => emp.id === employee.id)}
          onClick={() => handleEmployeeSelect(employee)}
          reasoningData={employeeReasoning}
        />
      </div>
    );
  }, [sortedEmployeesMemo, selectedEmployees, handleEmployeeSelect, getEmployeeReasoning]);

  const ROW_HEIGHT = 95;

  const MemoizedEmployeeList = useMemo(() => (
    <AutoSizer>
      {({ height, width }) => (
        <List
          height={height}
          width={width}
          itemCount={sortedEmployeesMemo.length} // Use sortedEmployeesMemo
          itemSize={ROW_HEIGHT}
          overscanCount={5}
          className="bg-transparent dark:bg-transparent"
        >
          {EmployeeRowRenderer}
        </List>
      )}
    </AutoSizer>
  ), [sortedEmployeesMemo, selectedEmployees, EmployeeRowRenderer]); // Depend on sortedEmployeesMemo

  const renderChatInput = () => (
    <div className="flex-none bg-gradient-to-t from-white via-white to-white/80 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900/80 pt-4 pb-6 px-4">
      <div className="max-w-3xl mx-auto">
        {/* ChatGPT-style centered input */}
        <div className="relative">
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg shadow-gray-200/50 dark:shadow-black/20 transition-shadow duration-200 hover:shadow-xl hover:shadow-gray-200/60 dark:hover:shadow-black/30 focus-within:shadow-xl focus-within:shadow-gray-300/50 dark:focus-within:shadow-black/40 focus-within:border-gray-300 dark:focus-within:border-gray-600">
            <textarea
              value={chatState.input}
              onChange={(e) => setChatState(prev => ({ ...prev, input: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={selectedEmployees[0] ? `Message about ${selectedEmployees[0].name}...` : "Message ChurnVision..."}
              disabled={chatState.isLoading}
              rows={1}
              className="w-full px-4 py-4 pr-14 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none min-h-[56px] max-h-[200px] text-base"
              style={{
                height: 'auto',
                minHeight: '56px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
            <button
              onClick={() => {
                handleSendMessage();
              }}
              disabled={chatState.isLoading || !chatState.input.trim()}
              className="absolute right-3 bottom-3 p-2 rounded-full bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-200 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white dark:text-gray-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {chatState.isLoading ? <LoadingSpinner /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {/* Unified Quick Actions Section - Animation Fixed */}
        {(!chatState.isLoading && (selectedEmployees[0] || chatState.messages.length > 0)) && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent flex-1"></div>
              <button
                onClick={() => setShowQuickActions(!showQuickActions)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 rounded hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                aria-label={showQuickActions ? 'Hide quick actions' : 'Show quick actions'}
              >
                <span>Quick Actions</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showQuickActions ? 'rotate-180' : ''}`} />
              </button>
              <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent flex-1"></div>
            </div>
            
            {showQuickActions && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Employee-specific actions (shown when employee selected) */}
              {selectedEmployees[0] && (
                <>
                  {/* Diagnose Risk Button */}
                  <button
                    onClick={() => handleQuickAction('diagnose', `Analyze risk for ${selectedEmployees[0].name}`)}
                    className="group relative overflow-hidden bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-red-500/20 dark:hover:shadow-red-400/20 hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-red-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 group-hover:bg-red-200 dark:group-hover:bg-red-800/60 transition-colors">
                          <BarChart size={14} />
                        </div>
                        <span className="font-semibold text-red-700 dark:text-red-300 text-xs">Diagnose Risk</span>
                      </div>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 leading-relaxed">
                        Analyze why at risk
                      </p>
                    </div>
                  </button>

                  {/* Create Plan Button */}
                  <button
                    onClick={() => handleQuickAction('retention_plan', `Create retention plan for ${selectedEmployees[0].name}`)}
                    className="group relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-purple-500/20 dark:hover:shadow-purple-400/20 hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/60 transition-colors">
                          <BookOpen size={14} />
                        </div>
                        <span className="font-semibold text-purple-700 dark:text-purple-300 text-xs">Create Plan</span>
                      </div>
                      <p className="text-xs text-purple-600/80 dark:text-purple-400/80 leading-relaxed">
                        Generate strategy
                      </p>
                    </div>
                  </button>

                  {/* Compare (Resigned) Button */}
                  <button
                    onClick={() => handleQuickAction('compare_resigned', `Compare ${selectedEmployees[0].name} with resigned employees`)}
                    className="group relative overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border border-orange-200 dark:border-orange-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-orange-500/20 dark:hover:shadow-orange-400/20 hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/60 transition-colors">
                          <Search size={14} />
                        </div>
                        <span className="font-semibold text-orange-700 dark:text-orange-300 text-xs">Compare (Left)</span>
                      </div>
                      <p className="text-xs text-orange-600/80 dark:text-orange-400/80 leading-relaxed">
                        Find similar resigned
                      </p>
                    </div>
                  </button>

                  {/* Compare (Stayed) Button */}
                  <button
                    onClick={() => handleQuickAction('compare_stayed', `Compare ${selectedEmployees[0].name} with retained employees`)}
                    className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-emerald-500/20 dark:hover:shadow-emerald-400/20 hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/60 transition-colors">
                          <Users size={14} />
                        </div>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-xs">Compare (Stayed)</span>
                      </div>
                      <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 leading-relaxed">
                        Find similar retained
                      </p>
                    </div>
                  </button>
                </>
              )}

              {/* General analytics actions (shown when conversation started OR no employee selected) */}
              <button
                onClick={() => {
                  const standardized = standardizePrompt('trends');
                  setInputFromSuggestion(standardized.prompt);
                }}
                className="group relative overflow-hidden bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-green-500/20 dark:hover:shadow-green-400/20 hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-md bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 group-hover:bg-green-200 dark:group-hover:bg-green-800/60 transition-colors">
                      <TrendingUp size={14} />
                    </div>
                    <span className="font-semibold text-green-700 dark:text-green-300 text-xs">Workforce Trends</span>
                  </div>
                  <p className="text-xs text-green-600/80 dark:text-green-400/80 leading-relaxed">
                    Analyze churn patterns
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  const standardized = standardizePrompt('departments');
                  setInputFromSuggestion(standardized.prompt);
                }}
                className="group relative overflow-hidden bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border border-indigo-200 dark:border-indigo-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-indigo-500/20 dark:hover:shadow-indigo-400/20 hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/60 transition-colors">
                      <BarChart size={14} />
                    </div>
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300 text-xs">Department Analysis</span>
                  </div>
                  <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 leading-relaxed">
                    Compare risk across teams
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  const standardized = standardizePrompt('patterns');
                  setInputFromSuggestion(standardized.prompt);
                }}
                className="group relative overflow-hidden bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-3 text-left transition-all duration-300 hover:shadow-md hover:shadow-yellow-500/20 dark:hover:shadow-yellow-400/20 hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-yellow-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 group-hover:bg-yellow-200 dark:group-hover:bg-yellow-800/60 transition-colors">
                      <Lightbulb size={14} />
                    </div>
                    <span className="font-semibold text-yellow-700 dark:text-yellow-300 text-xs">Exit Pattern Mining</span>
                  </div>
                  <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80 leading-relaxed">
                    Identify departure trends
                  </p>
                </div>
              </button>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 text-center">
          ChurnVision can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );

  // --- Helper Function to add suggestion to input ---
  const setInputFromSuggestion = (suggestion: string) => {
    setChatState(prev => ({ ...prev, input: suggestion }));
    // Optional: Focus the input field after setting the suggestion
    // const inputElement = document.querySelector('.chat-input'); // Adjust selector if needed
    // if (inputElement instanceof HTMLInputElement) {
    //   inputElement.focus();
    // }
  };

  // --- Modified renderWelcomeMessage ---
  const renderWelcomeMessage = () => {

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center justify-center min-h-[60vh] px-4"
      >
        {/* Centered title - ChatGPT style */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-gray-800 dark:text-gray-100 mb-3">
            What can I help with?
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400">
            Ask about workforce trends, employee retention, or select an employee for detailed analysis
          </p>
        </div>
        
        {/* Quick action suggestions - ChatGPT style */}
        <div className="w-full max-w-3xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Workforce Trends - Simple card style like ChatGPT */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('trends');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 text-left"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <TrendingUp size={20} className="text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Analyze workforce trends</p>
            </motion.button>

            {/* Department Analysis */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('departments');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 text-left"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <BarChart size={20} className="text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Compare departments</p>
            </motion.button>

            {/* Exit Patterns */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('patterns');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 text-left"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Lightbulb size={20} className="text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Find exit patterns</p>
            </motion.button>

            {/* Risk Analysis */}
            <motion.button
              onClick={() => {
                if (aiAssistantEmployees && aiAssistantEmployees[0]) {
                  const standardized = standardizePrompt('diagnose', aiAssistantEmployees[0].name);
                  setInputFromSuggestion(standardized.prompt);
                }
              }}
              disabled={!aiAssistantEmployees || aiAssistantEmployees.length < 1}
              className="group p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 1 ? 1 : 1.02 }}
              whileTap={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 1 ? 1 : 0.98 }}
            >
              <AlertTriangle size={20} className="text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Diagnose risk factors</p>
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  };

  // --- No Project Display ---
  if (!activeProject) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="mb-4">
          <EchoAvatar size="lg" />
        </div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          No Project Active
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Please select or create a project to use the AI Assistant.
        </p>
      </div>
    );
  }
  // --- End No Project Display ---

  if (!isModelReady) {
    return <ModelTrainingRequired status={trainingStatus?.status} message={trainingStatus?.message} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          title="AI Assistant"
          subtitle="AI-driven assistant for talent retention analysis and actionable insights"
          icon={MessageSquare}
          badges={[
            { label: 'AI-Powered', variant: 'emerald', pulse: true },
            { label: 'Echo', variant: 'purple' },
          ]}
        />
      </div>

      <div className="flex-none px-6 md:px-8 py-4">
        <TrainingReminderBanner />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-[340px] flex-none flex flex-col bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-700">
          <div className="flex-none p-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Team Members</h2>
            <p className="text-xs text-gray-500 mt-1">
              {sortedEmployeesMemo.length} employees found
            </p>
          </div>

          <div className="flex-none p-4 border-b border-gray-100 dark:border-gray-800">
            {chatState.error && (
              <div className="p-3 mb-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>{chatState.error}</p>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employees..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
              <div>
                {searchTerm.trim() ? (
                  <>Found <span className="font-medium text-gray-700 dark:text-gray-200">{sortedEmployeesMemo.length}</span> {sortedEmployeesMemo.length === 1 ? 'employee' : 'employees'}</>
                ) : (
                  <>{(aiAssistantEmployees || []).length} total employees</>
                )}
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="space-y-2 mb-4">
              <select
                value={sortBy}
                onChange={e => handleSortChange(e.target.value)}
                disabled={isSorting}
                className={`w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-emerald-600 dark:focus:border-emerald-600 ${isSorting ? 'opacity-50 cursor-wait' : ''}`}
              >
                {sortOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    Sort by: {option.label} {isSorting && '(sorting...)'}
                  </option>
                ))}
              </select>

              <select
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Departments ({availableDepartments.length})</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              <select
                value={selectedRiskLevel}
                onChange={e => setSelectedRiskLevel(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Risk Levels ({availableRiskLevels.length})</option>
                {availableRiskLevels.map(level => (
                  <option key={level} value={level}>
                    {level} Risk
                  </option>
                ))}
              </select>

              <select
                value={selectedPosition}
                onChange={e => setSelectedPosition(e.target.value)}
                className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-emerald-600 dark:focus:border-emerald-600"
              >
                <option value="">All Positions ({availablePositions.length})</option>
                {availablePositions.map(pos => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Filter Chips */}
            {(selectedDepartment || selectedRiskLevel || selectedPosition) && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    setSelectedDepartment('');
                    setSelectedRiskLevel('');
                    setSelectedPosition('');
                  }}
                  className="px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-[10px] rounded hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-2">
            {isLoadingAIAssistantData ? (
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border border-gray-100 dark:border-slate-700 animate-pulse h-[65px] bg-gray-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : sortedEmployeesMemo.length === 0 ? (
              <div className="text-center py-8 px-3">
                <Users className="h-10 w-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <h3 className="text-gray-900 dark:text-gray-100 font-medium text-sm mb-1">No employees found</h3>
                <p className="text-gray-500 dark:text-gray-400 text-xs">Try adjusting filters</p>
              </div>
            ) : (
              MemoizedEmployeeList
            )}
          </div>

          {/* Agent Memory Panel - shows session context */}
          {(agentContext.employeesDiscussed.length > 0 || agentContext.recentDecisions.length > 0) && (
            <div className="flex-none p-3 border-t border-gray-100 dark:border-gray-800">
              <AgentContextPanel
                context={agentContext}
                onClearMemory={clearMemory}
              />
            </div>
          )}
        </aside>

        <motion.main
          className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {!showSidebar && (
            <button
              onClick={() => setShowSidebar(true)}
              className="md:hidden absolute top-4 left-4 z-10 p-2 rounded-md bg-white dark:bg-slate-800 shadow-md text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <Users className="h-5 w-5" />
            </button>
          )}

          <div className="flex-1 overflow-hidden flex flex-col">
            {selectedEmployees[0] && (
              <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 p-3 shadow-sm flex-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
                        {selectedEmployees[0].name.charAt(0)}
                      </div>
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedEmployees[0].name}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEmployees[0].position} • {selectedEmployees[0].department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => selectedEmployees[0]?.hr_code && generateSuite(selectedEmployees[0].hr_code)}
                      disabled={isGeneratingActions}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                    >
                      {isGeneratingActions ? 'Generating...' : 'Suggest Actions'}
                    </button>
                    <RiskIndicator riskScore={getEmployeeRiskScore(selectedEmployees[0])} size="sm" showIcon={true} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 scroll-smooth">
              <div className="max-w-3xl mx-auto px-4 py-6">
                {chatState.messages.length === 0 && !selectedEmployees[0] && (
                  renderWelcomeMessage()
                )}

                {chatState.messages.length > 0 && (
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {chatState.messages.map((msg, index) => (
                        <ChatMessageComponent
                          key={msg.id || `msg-${index}`}
                          message={msg}
                          isContinuation={index > 0 && chatState.messages[index - 1].role === msg.role}
                        />
                      ))}
                    </AnimatePresence>
                    {/* Agent Execution Panel - shows tool execution visualization */}
                    <AnimatePresence>
                      {chatState.isLoading && execution && (
                        <motion.div
                          key="agent-execution"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                          className="mb-4"
                        >
                          <AgentExecutionPanel
                            execution={execution}
                            isActive={isExecuting || chatState.isLoading}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Fallback typing indicator for non-analysis queries without execution */}
                    <AnimatePresence>
                      {chatState.isLoading && !execution && (
                        <motion.div
                          key="chat-loading"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <TypingIndicator />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Action Generation Loading/Error States */}
                <AnimatePresence>
                  {isGeneratingActions && (
                    <motion.div
                      key="action-loading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-4 max-w-3xl mx-auto"
                    >
                      <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-sm text-emerald-700 dark:text-emerald-300">
                          Generating personalized actions based on employee data...
                        </span>
                      </div>
                    </motion.div>
                  )}
                  {actionError && !isGeneratingActions && (
                    <motion.div
                      key="action-error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-4 max-w-3xl mx-auto"
                    >
                      <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm">Failed to generate actions: {actionError}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Proposals - AI-suggested actions for approval (shown regardless of messages) */}
                <AnimatePresence>
                  {actionProposals.length > 0 && (
                    <motion.div
                      key="action-proposals"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-4 max-w-3xl mx-auto space-y-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Suggested Actions ({actionProposals.filter(p => p.status === 'pending').length} pending)
                        </span>
                        <button
                          onClick={clearProposals}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          Clear all
                        </button>
                      </div>
                      {actionProposals.map((proposal) => (
                        <ActionProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          onApprove={approveAction}
                          onReject={rejectAction}
                          onEdit={editAction}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {chatState.error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 my-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                      <span className="font-medium">{chatState.error}</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {renderChatInput()}
          </div>
        </motion.main>
      </div>
    </div>
  );
}
