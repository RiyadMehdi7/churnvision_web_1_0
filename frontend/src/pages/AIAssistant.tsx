import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import chatbotService from '../services/chatbot';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
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
  Expand, // Added Expand icon for full-screen view
  X, // Added X icon for close button
} from 'lucide-react';
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

// +++ Add TypingIndicator Component +++
const TypingIndicator = () => (
  <div className="p-4 mb-4 ml-2 mr-12 flex items-center space-x-2">
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white flex-shrink-0">
      <Bot size={16} />
    </div>
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

  const structuredData = isBot ? (() => {
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
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white shadow-md">
                <Bot size={14} />
              </div>
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
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white flex-shrink-0 mt-0.5">
        <Bot size={16} />
      </div>
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
  const getEmployeeReasoning = useCallback((hrCode: string | undefined | null): ChurnReasoning | undefined => {
    if (!hrCode) return undefined;
    return reasoningData?.find(r => r && r.hr_code === hrCode);
  }, [reasoningData]);

  // Helper function to get risk score from reasoning data
  const getEmployeeRiskScore = useCallback((employee: Employee): number => {
    const reasoning = getEmployeeReasoning(employee.hr_code);
    return reasoning?.churn_risk ?? employee.churnProbability ?? 0;
  }, [getEmployeeReasoning]);
  
  // Fetch reasoning data when employees are selected OR when all employees are loaded
  useEffect(() => {
    if (selectedEmployees.length > 0) {
      const hrCodes = selectedEmployees
        .map(emp => emp?.hr_code)
        .filter((code): code is string => Boolean(code));
      fetchBatchReasoning(hrCodes);
    } else if (safeEmployees.length > 0) {
      // Fetch reasoning data for all employees to ensure we have proper risk scores
      const allHrCodes = safeEmployees
        .map(emp => emp.hr_code)
        .filter((code): code is string => Boolean(code));
      fetchBatchReasoning(allHrCodes);
    }
  }, [selectedEmployees, safeEmployees, fetchBatchReasoning]);
  
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

  const handleSendMessage = async () => {
    if (!chatState.input.trim() || chatState.isLoading) return;

    const userMessage = chatState.input.trim();
    const pendingKind = inferResponseKind(userMessage, selectedEmployees.length > 0);
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

    try {
      // Enhanced context with ONLY reasoning data
      let enhancedContext = '';
      
      // Add selected employees context with reasoning data
      if (selectedEmployees.length > 0) {
        enhancedContext += `\n\nSelected Employees Context (from AI Reasoning System):\n`;
        selectedEmployees.forEach((emp, index) => {
          const reasoning = getEmployeeReasoning(emp.hr_code);
          if (reasoning) {
            enhancedContext += `${index + 1}. ${emp.full_name} (${emp.hr_code}):\n`;
            enhancedContext += `  - Combined Churn Risk: ${(reasoning.churn_risk * 100).toFixed(1)}%\n`;
            enhancedContext += `  - ML Model Score: ${(reasoning.ml_score * 100).toFixed(1)}%\n`;
            enhancedContext += `  - Business Rules Score: ${(reasoning.heuristic_score * 100).toFixed(1)}%\n`;
            enhancedContext += `  - Behavioral Stage: ${reasoning.stage} (Score: ${(reasoning.stage_score * 100).toFixed(1)}%)\n`;
            enhancedContext += `  - Confidence Level: ${(reasoning.confidence_level * 100).toFixed(1)}%\n`;
            enhancedContext += `  - Department: ${emp.structure_name}, Position: ${emp.position}\n`;
          } else {
            // Fallback if reasoning data not available
            const fallbackRisk = emp.churnProbability ?? 0;
            enhancedContext += `${index + 1}. ${emp.full_name} (${emp.hr_code}) - Fallback Risk: ${(fallbackRisk * 100).toFixed(1)}%, Department: ${emp.structure_name}, Position: ${emp.position}\n`;
          }
        });
      }

      // Add detailed reasoning analysis data for selected employees
      if (selectedEmployees.length > 0 && reasoningData && reasoningData.length > 0) {
        enhancedContext += `\n\nDetailed AI Reasoning Analysis:\n`;
        selectedEmployees.forEach((emp) => {
          const reasoning = getEmployeeReasoning(emp.hr_code);
          if (reasoning) {
            enhancedContext += `\n${emp.full_name} (${emp.hr_code}) - Comprehensive Analysis:\n`;
            
            // Core scores
            enhancedContext += `COMBINED SCORE BREAKDOWN:\n`;
            enhancedContext += `- Final Churn Risk: ${(reasoning.churn_risk * 100).toFixed(1)}% (This is the authoritative score)\n`;
            enhancedContext += `- ML Model Component: ${(reasoning.ml_score * 100).toFixed(1)}%\n`;
            enhancedContext += `- Business Rules Component: ${(reasoning.heuristic_score * 100).toFixed(1)}%\n`;
            enhancedContext += `- Behavioral Stage: ${reasoning.stage} (Score: ${(reasoning.stage_score * 100).toFixed(1)}%)\n`;
            enhancedContext += `- Overall Confidence: ${(reasoning.confidence_level * 100).toFixed(1)}%\n`;
            
            // ML contributors
            if (reasoning.ml_contributors && reasoning.ml_contributors.length > 0) {
              enhancedContext += `\nML MODEL RISK FACTORS:\n`;
              reasoning.ml_contributors.slice(0, 10).forEach((factor: any, idx: number) => {
                enhancedContext += `  ${idx + 1}. ${factor.feature}: ${factor.value} (SHAP Impact: ${factor.importance > 0 ? '+' : ''}${(factor.importance * 100).toFixed(1)}%)\n`;
              });
            }
            
            // Business rule alerts
            if (reasoning.heuristic_alerts && reasoning.heuristic_alerts.length > 0) {
              enhancedContext += `\nBUSINESS RULE ALERTS:\n`;
              reasoning.heuristic_alerts.forEach((alert: any, idx: number) => {
                enhancedContext += `  ${idx + 1}. ${alert.rule_name}: +${(alert.impact * 100).toFixed(1)}% risk increase\n`;
                enhancedContext += `     Reason: ${alert.reason}\n`;
              });
            }
            
            // Calculation breakdown if available
            if (reasoning.calculation_breakdown) {
              enhancedContext += `\nSCORE CALCULATION METHODOLOGY:\n`;
              enhancedContext += `  ML Contribution: ${reasoning.calculation_breakdown.ml_contribution.toFixed(3)} (weight: ${reasoning.calculation_breakdown.weights.ml_weight})\n`;
              enhancedContext += `  Business Rules Contribution: ${reasoning.calculation_breakdown.heuristic_contribution.toFixed(3)} (weight: ${reasoning.calculation_breakdown.weights.heuristic_weight})\n`;
              enhancedContext += `  Stage Contribution: ${reasoning.calculation_breakdown.stage_contribution.toFixed(3)} (weight: ${reasoning.calculation_breakdown.weights.stage_weight})\n`;
              enhancedContext += `  Final Combined Score: ${(reasoning.churn_risk * 100).toFixed(1)}%\n`;
            }
            
            enhancedContext += `\nAI ANALYSIS: ${reasoning.reasoning}\n`;
            if (reasoning.recommendations) {
              enhancedContext += `AI RECOMMENDATIONS: ${reasoning.recommendations}\n`;
            }
          }
        });
      }

      // Add general employee data context using ONLY reasoning data
      if (reasoningData && reasoningData.length > 0) {
        enhancedContext += `\n\nGeneral Population Context (AI Reasoning Data):\n`;
        enhancedContext += `Total Employees with Reasoning Data: ${reasoningData.length}\n`;
        
        // Calculate risk distribution using dynamic reasoning data
        const highRiskEmployees = reasoningData.filter(r => r.churn_risk > thresholds.highRisk);
        const mediumRiskEmployees = reasoningData.filter(r => r.churn_risk > thresholds.mediumRisk && r.churn_risk <= thresholds.highRisk);
        const lowRiskEmployees = reasoningData.filter(r => r.churn_risk <= thresholds.mediumRisk);
        
        const highThresholdPct = Math.round(thresholds.highRisk * 100);
        const mediumThresholdPct = Math.round(thresholds.mediumRisk * 100);
        enhancedContext += `Risk Distribution (AI Reasoning): High Risk (>${highThresholdPct}%): ${highRiskEmployees.length}, Medium Risk (${mediumThresholdPct}-${highThresholdPct}%): ${mediumRiskEmployees.length}, Low Risk (≤${mediumThresholdPct}%): ${lowRiskEmployees.length}\n`;
        
        // Stage distribution
        const stageDistribution: Record<string, number> = {};
        reasoningData.forEach(r => {
          stageDistribution[r.stage] = (stageDistribution[r.stage] || 0) + 1;
        });
        enhancedContext += `Behavioral Stages: ${Object.entries(stageDistribution).map(([stage, count]) => `${stage}: ${count}`).join(', ')}\n`;
        
        // Average confidence
        const avgConfidence = reasoningData.reduce((sum, r) => sum + r.confidence_level, 0) / reasoningData.length;
        enhancedContext += `Average AI Confidence Level: ${(avgConfidence * 100).toFixed(1)}%\n`;
      }

      // Enhanced prompt instructions for AI using only reasoning data
      const enhancedPrompt = `${userMessage}

${enhancedContext}

CRITICAL INSTRUCTIONS - USE ONLY AI REASONING DATA:
1. NEVER use the old churnProbability values - ONLY use the churn_risk from the AI Reasoning System
2. The churn_risk is the authoritative combined score that includes ML + Business Rules + Behavioral Stage
3. When analyzing risk, reference the SHAP values from ml_contributors and business rule impacts
4. Use the calculation breakdown to explain HOW the final score was computed
5. Reference behavioral stages and their scores in your analysis
6. Always mention confidence levels when making predictions
7. Base ALL recommendations on the comprehensive reasoning data provided

RESPONSE FORMATS (using reasoning data):
- For DIAGNOSE RISK: Use "enhancedChurnRiskDiagnosis" with reasoning.churn_risk as overallRisk
- For CREATE PLAN: Use "enhancedRetentionPlaybook" with reasoning.churn_risk as currentRisk  
- For COMPARE queries: Use reasoning data to find similar risk profiles and patterns
- For GENERAL questions: Use aggregate reasoning statistics and trends

SCORING TRANSPARENCY:
- Always explain the combination of ML + Business Rules + Stage scores
- Reference specific SHAP values and rule impacts
- Show confidence levels and calculation weights
- Use behavioral stage context in recommendations

MAKE YOUR RESPONSES DATA-DRIVEN using the comprehensive AI reasoning analysis provided. Never use fallback churnProbability values.`;

      const response = await chatbotService.sendMessage({
        sessionId,
        content: enhancedPrompt,
        employeeId: selectedEmployees[0]?.hr_code
      });

      const assistantMessage: ExtendedChatMessage = {
        id: response.botMessageId || `bot-${uuidv4()}`,
        role: 'assistant',
        message: typeof response.response?.message === 'string' ? response.response.message : String(response.response?.message ?? ''),
        timestamp: new Date(),
        sessionId,
        intent: response.response?.intent,
        confidence: response.response?.confidence,
        responseKind: pendingKind,
        responseTimeMs: response.response?.responseTime,
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
    <div className="flex-none bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Input area with improved design */}
        <div className="relative">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={chatState.input}
                onChange={(e) => setChatState(prev => ({ ...prev, input: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={selectedEmployees[0] ? `Ask about ${selectedEmployees[0].name} or general questions...` : "Select an employee or ask general questions..."}
                disabled={chatState.isLoading}
                rows={1}
                className="w-full px-4 py-2.5 pr-14 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 focus:border-transparent transition-all duration-200 resize-none min-h-[42px] overflow-hidden"
                style={{ 
                  height: 'auto',
                  minHeight: '42px'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
              />
              <button
                onClick={() => {
                  handleSendMessage();
                }}
                disabled={chatState.isLoading || !chatState.input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white transition-colors duration-200 disabled:cursor-not-allowed"
              >
                {chatState.isLoading ? <LoadingSpinner /> : <Send size={16} />}
              </button>
            </div>
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
                    onClick={() => {
                      const standardized = standardizePrompt('diagnose', selectedEmployees[0].name);
                      setInputFromSuggestion(standardized.prompt);
                    }}
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
                    onClick={() => {
                      const standardized = standardizePrompt('retention', selectedEmployees[0].name);
                      setInputFromSuggestion(standardized.prompt);
                    }}
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
                    onClick={() => {
                      const standardized = standardizePrompt('similarity_resigned', selectedEmployees[0].name);
                      setInputFromSuggestion(standardized.prompt);
                    }}
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
                    onClick={() => {
                      const standardized = standardizePrompt('similarity_stayed', selectedEmployees[0].name);
                      setInputFromSuggestion(standardized.prompt);
                    }}
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
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          The AI assistant may produce incorrect or outdated information. Please verify critical insights before acting.
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="welcome-card p-6 rounded-xl bg-white dark:!bg-gradient-to-br dark:!from-gray-800 dark:!to-gray-900 shadow-lg max-w-3xl mx-auto my-8 border border-gray-200 dark:border-gray-700/50"
      >
        <div className="flex items-center mb-6">
          <motion.div 
            className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white mr-4 flex-shrink-0"
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 0 rgba(91, 169, 139, 0.3)', 
                '0 0 20px rgba(91, 169, 139, 0.6)', 
                '0 0 0 rgba(91, 169, 139, 0.3)'
              ]
            }}
            transition={{ 
              duration: 2.5, 
              repeat: Infinity,
              ease: "easeInOut" 
            }}
          >
            <Bot size={32} />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Welcome to AI Assistant</h2>
            <p className="text-gray-600 dark:text-gray-300">Your intelligent retention analysis companion</p>
          </div>
        </div>

        <div className="mt-6 border-l-4 border-emerald-500 dark:border-emerald-400 pl-4 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
          <p className="text-gray-700 dark:text-gray-200">
            <strong>✨ New:</strong> Ask general questions about your workforce! Try queries like "Show me churn trends", "What are the top risk factors", or "Compare departments by risk level". No need to select an employee first.
          </p>
        </div>

        <div className="mt-4 border-l-4 border-blue-500 dark:border-blue-400 pl-4 py-2 bg-blue-50 dark:bg-blue-700/50 rounded-md">
          <p className="text-gray-700 dark:text-gray-200">
            Select an employee for individual analysis, or ask general questions about workforce trends and analytics. I can generate insights, charts, and recommendations for both specific employees and overall workforce patterns.
          </p>
        </div>
        
        {/* --- Updated Grid with Consistent Design --- */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent flex-1"></div>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 px-2">Quick Start</span>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent flex-1"></div>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* Churn Risk Diagnosis */}
            <motion.button
              onClick={() => {
                if (aiAssistantEmployees && aiAssistantEmployees[0]) {
                  const standardized = standardizePrompt('diagnose', aiAssistantEmployees[0].name);
                  setInputFromSuggestion(standardized.prompt);
                }
              }}
              disabled={!aiAssistantEmployees || aiAssistantEmployees.length < 1}
              className="group relative overflow-hidden bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/60 dark:to-red-900/40 border border-red-200 dark:border-red-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-red-500/20 dark:hover:shadow-red-400/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
              whileHover={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 1 ? 1 : 1.02 }}
              whileTap={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 1 ? 1 : 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-red-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 group-hover:bg-red-200 dark:group-hover:bg-red-800/60 transition-colors">
                    <BarChart size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm">Churn Risk Diagnosis</h3>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80">Understand why someone is at risk</p>
                  </div>
                </div>
              </div>
            </motion.button>
            
            {/* Retention Playbook */}
            <motion.button
              onClick={() => {
                if (aiAssistantEmployees && aiAssistantEmployees[1]) {
                  const standardized = standardizePrompt('retention', aiAssistantEmployees[1].name);
                  setInputFromSuggestion(standardized.prompt);
                }
              }}
              disabled={!aiAssistantEmployees || aiAssistantEmployees.length < 2}
              className="group relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/60 dark:to-purple-900/40 border border-purple-200 dark:border-purple-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-purple-500/20 dark:hover:shadow-purple-400/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
              whileHover={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 2 ? 1 : 1.02 }}
              whileTap={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 2 ? 1 : 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/60 transition-colors">
                    <BookOpen size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm">Retention Playbooks</h3>
                    <p className="text-xs text-purple-600/80 dark:text-purple-400/80">Get tailored action plans</p>
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Workforce Trends */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('trends');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group relative overflow-hidden bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/60 dark:to-green-900/40 border border-green-200 dark:border-green-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-green-500/20 dark:hover:shadow-green-400/20 hover:-translate-y-0.5"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 group-hover:bg-green-200 dark:group-hover:bg-green-800/60 transition-colors">
                    <TrendingUp size={14} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-700 dark:text-green-300 text-sm">Workforce Trends</h3>
                    <p className="text-xs text-green-600/80 dark:text-green-400/80">Analyze overall churn patterns</p>
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Peer Similarity (Stayed) */}
            <motion.button
              onClick={() => {
                if (aiAssistantEmployees && aiAssistantEmployees[2]) {
                  const standardized = standardizePrompt('similarity_stayed', aiAssistantEmployees[2].name);
                  setInputFromSuggestion(standardized.prompt);
                }
              }}
              disabled={!aiAssistantEmployees || aiAssistantEmployees.length < 3}
              className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/60 dark:to-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-emerald-500/20 dark:hover:shadow-emerald-400/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
              whileHover={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 3 ? 1 : 1.02 }}
              whileTap={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 3 ? 1 : 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/60 transition-colors">
                    <Users size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">Compare (Stayed)</h3>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Compare with retained colleagues</p>
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Peer Similarity (Resigned) */}
            <motion.button
              onClick={() => {
                if (aiAssistantEmployees && aiAssistantEmployees[3]) {
                  const standardized = standardizePrompt('similarity_resigned', aiAssistantEmployees[3].name);
                  setInputFromSuggestion(standardized.prompt);
                }
              }}
              disabled={!aiAssistantEmployees || aiAssistantEmployees.length < 4}
              className="group relative overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/60 dark:to-orange-900/40 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-orange-500/20 dark:hover:shadow-orange-400/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
              whileHover={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 4 ? 1 : 1.02 }}
              whileTap={{ scale: !aiAssistantEmployees || aiAssistantEmployees.length < 4 ? 1 : 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/60 transition-colors">
                    <Users size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm">Compare (Resigned)</h3>
                    <p className="text-xs text-orange-600/80 dark:text-orange-400/80">Compare with resigned colleagues</p>
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Department Analysis */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('departments');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group relative overflow-hidden bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/60 dark:to-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-indigo-500/20 dark:hover:shadow-indigo-400/20 hover:-translate-y-0.5"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/60 transition-colors">
                    <BarChart size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm">Department Analysis</h3>
                    <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80">Compare risk across teams</p>
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Exit Pattern Mining */}
            <motion.button
              onClick={() => {
                const standardized = standardizePrompt('patterns');
                setInputFromSuggestion(standardized.prompt);
              }}
              className="group relative overflow-hidden bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950/60 dark:to-amber-900/40 border border-yellow-200 dark:border-amber-800 rounded-lg p-4 text-left transition-all duration-300 hover:shadow-md hover:shadow-yellow-500/20 dark:hover:shadow-yellow-400/20 hover:-translate-y-0.5"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-yellow-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 group-hover:bg-yellow-200 dark:group-hover:bg-yellow-800/60 transition-colors">
                    <Lightbulb size={16} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-sm">Exit Pattern Mining</h3>
                    <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">Identify departure trends</p>
                  </div>
                </div>
              </div>
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
        <Bot className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
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
    <div className="h-full flex flex-col">
      <header className="flex-none bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700/50 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent"></div>
        </div>

        <div className="max-w-[1400px] mx-auto px-8 relative">
          <div className="py-8">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 via-purple-400 to-purple-200 animate-gradient">
                        Talent Retention AI Assistant
                      </h1>
                      <div className="flex items-center gap-2">
                        <span className="relative">
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-300 rounded-full border border-emerald-500/20 relative z-10 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping absolute"></span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                            AI-Powered
                          </span>
                          <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-sm animate-pulse"></div>
                        </span>

                        {/* Echo Badge */}
                        <span className="relative">
                          <span className="px-2.5 py-0.5 text-xs font-semibold bg-purple-500/10 text-purple-300 rounded-full border border-purple-500/20 relative z-10 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                              <path d="M12 8V4H8"/>
                              <rect x="4" y="12" width="8" height="8" rx="2"/>
                              <path d="M8 12v-2a2 2 0 0 1 2-2h2"/>
                            </svg>
                            Echo
                          </span>
                          <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-sm animate-pulse"></div>
                        </span>
                      </div>
                    </div>
                    <p className="text-base text-gray-400 max-w-2xl">
                      AI-driven assistant for talent retention analysis and actionable insights.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 md:px-8 py-4">
        <TrainingReminderBanner />
      </div>

      <div className="flex flex-1 overflow-hidden">
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

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap gap-1 mb-3">
              {(selectedDepartment || selectedRiskLevel || selectedPosition) && (
                <button
                  onClick={() => {
                    setSelectedDepartment('');
                    setSelectedRiskLevel('');
                    setSelectedPosition('');
                  }}
                  className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-xs rounded-full hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                >
                  Clear All
                </button>
              )}
              {selectedDepartment && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs rounded-full">
                  Dept: {selectedDepartment}
                </span>
              )}
              {selectedRiskLevel && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs rounded-full">
                  Risk: {selectedRiskLevel}
                </span>
              )}
              {selectedPosition && (
                <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs rounded-full">
                  Pos: {selectedPosition}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {isLoadingAIAssistantData ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 rounded-lg border border-gray-100 dark:border-slate-700 animate-pulse h-[83px] bg-gray-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : sortedEmployeesMemo.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <h3 className="text-gray-900 dark:text-gray-100 font-medium mb-1">No employees found</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              MemoizedEmployeeList
            )}
          </div>
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
                    <RiskIndicator riskScore={getEmployeeRiskScore(selectedEmployees[0])} size="sm" showIcon={true} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-slate-950 dark:to-slate-900 scroll-smooth">
              <div className="max-w-4xl mx-auto px-4 py-4">
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
                    <AnimatePresence>
                      {chatState.isLoading && (
                        <motion.div
                          key="chat-loading"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          {chatState.pendingResponseKind === 'analysis'
                            ? <AnalysisInProgressIndicator isLoading={chatState.isLoading} />
                            : <TypingIndicator />}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>
                )}

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
